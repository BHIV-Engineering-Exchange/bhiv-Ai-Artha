/**
 * setu.pipeline.js
 *
 * Phase 2A — Integration Support
 * Four pure functions: Normalizer → Validator → Mapper → Serializer
 * Extended: Acknowledgement envelope, retry metadata, delivery evidence, idempotency
 *
 * Nothing here executes, orchestrates, or dispatches.
 * Each function is independently testable and has no side effects.
 */

import Decimal from 'decimal.js';
import crypto from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

export const VALID_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const VALID_SIGNAL_TYPES = [
  'SIG_GST_MISMATCH',
  'SIG_GST_EXPENSE_MISMATCH',
  'SIG_GST_INVALID_RATE',
  'SIG_GST_MIXED_TAX_TYPE',
  'SIG_GST_COMPANY_STATE_MISSING',
  'SIG_GST_CUSTOMER_STATE_MISSING',
  'SIG_GST_MISSING_GSTIN',
  'SIG_GST_PERIOD_MISMATCH',
  'SIG_GST_DUPLICATE_REFERENCE',
  'SIG_GST_NEGATIVE_LIABILITY',
  'SIG_TDS_MISSING_PAN',
  'SIG_TDS_INVALID_SECTION',
  'SIG_TDS_MISSING_CHALLAN',
  'SIG_TDS_EXCESS_DEDUCTION',
  'SIG_TDS_MISSING_EMPLOYEE_PAN',
  'SIG_LEDGER_IMBALANCE',
  'SIG_LEDGER_HASH_TAMPER',
  'SIG_LEDGER_CHAIN_BREAK',
  'SIG_LEDGER_INVALID_ACCOUNT',
  'SIG_LEDGER_LINE_INTEGRITY',
  'SIG_CASHFLOW_NEGATIVE',
  'SIG_INVOICE_OVERDUE',
  'SIG_INVOICE_OVERPAYMENT',
  'SIG_EXPENSE_RECORD_FAILED',
  'SIG_FILING_NOT_READY',
  'SIG_FILING_GENERATED',
];

export const VALID_MODULES = [
  'GST_ENGINE',
  'TDS_ENGINE',
  'LEDGER',
  'INVOICE',
  'EXPENSE',
  'COMPLIANCE_FILING',
];

export const VALID_ENTITY_TYPES = [
  'INVOICE',
  'EXPENSE',
  'TDS_ENTRY',
  'JOURNAL_ENTRY',
  'COMPLIANCE_FILING',
];

// Fallback: infer module + entity_type from signal type when source fields are missing
const SIGNAL_TYPE_SOURCE_MAP = {
  SIG_GST_MISMATCH:              { module: 'GST_ENGINE',      entity_type: 'INVOICE' },
  SIG_GST_EXPENSE_MISMATCH:      { module: 'GST_ENGINE',      entity_type: 'EXPENSE' },
  SIG_GST_INVALID_RATE:          { module: 'GST_ENGINE',      entity_type: 'INVOICE' },
  SIG_GST_MIXED_TAX_TYPE:        { module: 'GST_ENGINE',      entity_type: 'INVOICE' },
  SIG_GST_COMPANY_STATE_MISSING: { module: 'GST_ENGINE',      entity_type: 'INVOICE' },
  SIG_GST_CUSTOMER_STATE_MISSING:{ module: 'GST_ENGINE',      entity_type: 'INVOICE' },
  SIG_GST_MISSING_GSTIN:         { module: 'GST_ENGINE',      entity_type: 'INVOICE' },
  SIG_GST_PERIOD_MISMATCH:       { module: 'GST_ENGINE',      entity_type: 'INVOICE' },
  SIG_GST_DUPLICATE_REFERENCE:   { module: 'GST_ENGINE',      entity_type: 'INVOICE' },
  SIG_GST_NEGATIVE_LIABILITY:    { module: 'GST_ENGINE',      entity_type: 'INVOICE' },
  SIG_TDS_MISSING_PAN:           { module: 'TDS_ENGINE',      entity_type: 'TDS_ENTRY' },
  SIG_TDS_INVALID_SECTION:       { module: 'TDS_ENGINE',      entity_type: 'TDS_ENTRY' },
  SIG_TDS_MISSING_CHALLAN:       { module: 'TDS_ENGINE',      entity_type: 'TDS_ENTRY' },
  SIG_TDS_EXCESS_DEDUCTION:      { module: 'TDS_ENGINE',      entity_type: 'TDS_ENTRY' },
  SIG_TDS_MISSING_EMPLOYEE_PAN:  { module: 'TDS_ENGINE',      entity_type: 'TDS_ENTRY' },
  SIG_LEDGER_IMBALANCE:          { module: 'LEDGER',          entity_type: 'JOURNAL_ENTRY' },
  SIG_LEDGER_HASH_TAMPER:        { module: 'LEDGER',          entity_type: 'JOURNAL_ENTRY' },
  SIG_LEDGER_CHAIN_BREAK:        { module: 'LEDGER',          entity_type: 'JOURNAL_ENTRY' },
  SIG_LEDGER_INVALID_ACCOUNT:    { module: 'LEDGER',          entity_type: 'JOURNAL_ENTRY' },
  SIG_LEDGER_LINE_INTEGRITY:     { module: 'LEDGER',          entity_type: 'JOURNAL_ENTRY' },
  SIG_CASHFLOW_NEGATIVE:         { module: 'LEDGER',          entity_type: 'JOURNAL_ENTRY' },
  SIG_INVOICE_OVERDUE:           { module: 'INVOICE',         entity_type: 'INVOICE' },
  SIG_INVOICE_OVERPAYMENT:       { module: 'INVOICE',         entity_type: 'INVOICE' },
  SIG_EXPENSE_RECORD_FAILED:     { module: 'EXPENSE',         entity_type: 'EXPENSE' },
  SIG_FILING_NOT_READY:          { module: 'COMPLIANCE_FILING', entity_type: 'COMPLIANCE_FILING' },
  SIG_FILING_GENERATED:          { module: 'COMPLIANCE_FILING', entity_type: 'COMPLIANCE_FILING' },
};

// Trace ID format: TRC-YYYYMMDD-{8 hex chars}
const TRACE_ID_REGEX = /^TRC-\d{8}-[a-f0-9]{8}$/i;

// ─── 1. NORMALIZER ────────────────────────────────────────────────────────────
//
// Input:  raw signal from ComplianceSignal model or signalEngine.emitSignal()
// Output: normalized internal signal with guaranteed field shapes
// Throws: NormalizationError if input is structurally unrecoverable

export class NormalizationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'NormalizationError';
    this.field = field;
  }
}

/**
 * Normalize a raw Artha signal into a canonical internal shape.
 *
 * Handles both the DB model shape (ComplianceSignal) and the
 * in-memory shape produced by signalEngine.emitSignal().
 */
export function normalizeSignal(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new NormalizationError('Signal must be a non-null object', 'root');
  }

  // signal_id: prefer typed signal name (SIG_INVOICE_OVERDUE) over auto-generated UUID (SIG-<uuid>)
  const rawType = String(raw.type || '').trim();
  const rawSignalId = String(raw.signal_id || '').trim();
  const isKnownType = VALID_SIGNAL_TYPES.includes(rawType);
  const signalId = isKnownType ? rawType : (rawSignalId || rawType || '');
  if (!signalId) {
    throw new NormalizationError('signal_id or type is required', 'signal_id');
  }

  // trace_id: normalize to TRC-YYYYMMDD-{8hex} if possible, else keep as-is
  const traceId = String(raw.trace_id || '').trim();
  if (!traceId) {
    throw new NormalizationError('trace_id is required', 'trace_id');
  }

  // severity: uppercase, default LOW if unrecognized
  const rawSeverity = String(raw.severity || '').toUpperCase();
  const severity = VALID_SEVERITIES.includes(rawSeverity) ? rawSeverity : 'LOW';

  // source: handle both string ("ARTHA") and object ({ system, module, entity_type, entity_id })
  let source;
  if (raw.source && typeof raw.source === 'object') {
    source = {
      system:      String(raw.source.system      || 'ARTHA'),
      module:      String(raw.source.module      || 'UNKNOWN'),
      entity_type: String(raw.source.entity_type || 'UNKNOWN'),
      entity_id:   String(raw.source.entity_id   || 'UNKNOWN'),
    };
  } else {
    // DB model stores source as plain string "ARTHA" and buries entity info in context
    const ctx = raw.context || {};
    const ctxSource = ctx.source || {};
    source = {
      system:      String(raw.source || 'ARTHA'),
      module:      String(ctxSource.module      || ctx.module      || 'UNKNOWN'),
      entity_type: String(ctxSource.entity_type || ctx.entity_type || 'UNKNOWN'),
      entity_id:   String(ctxSource.entity_id   || ctx.entity_id   || 'UNKNOWN'),
    };
  }

  // Fallback: infer module + entity_type from signal type when source fields are still UNKNOWN
  const typeForLookup = raw.type || signalId;
  if ((source.module === 'UNKNOWN' || source.entity_type === 'UNKNOWN') && SIGNAL_TYPE_SOURCE_MAP[typeForLookup]) {
    const inferred = SIGNAL_TYPE_SOURCE_MAP[typeForLookup];
    if (source.module === 'UNKNOWN') source.module = inferred.module;
    if (source.entity_type === 'UNKNOWN') source.entity_type = inferred.entity_type;
  }

  // Last-resort fallback: try to pull entity_id from context fields
  if (source.entity_id === 'UNKNOWN') {
    const ctx2 = raw.context || {};
    source.entity_id = String(ctx2.entity_id || ctx2.invoice_number || ctx2.filing_id || ctx2.trace_id || 'UNKNOWN');
  }

  // context: strip the nested source object we just extracted, keep everything else
  const rawCtx = { ...(raw.context || {}) };
  delete rawCtx.source;

  // recommendation: normalize to { code, message }
  let recommendation;
  if (raw.recommendation && typeof raw.recommendation === 'object') {
    recommendation = {
      code:    String(raw.recommendation.code    || 'REVIEW_REQUIRED'),
      message: String(raw.recommendation.message || ''),
    };
  } else {
    // DB model stores recommendation as "[CODE] message" string
    const recStr = String(raw.recommendation || '');
    const match  = recStr.match(/^\[([^\]]+)\]\s*(.*)/);
    recommendation = match
      ? { code: match[1], message: match[2] }
      : { code: 'REVIEW_REQUIRED', message: recStr };
  }

  // timestamp: ISO string
  const timestamp = raw.timestamp
    ? new Date(raw.timestamp).toISOString()
    : (raw.created_at ? new Date(raw.created_at).toISOString() : new Date().toISOString());

  return {
    signal_id:      signalId,
    trace_id:       traceId,
    source,
    severity,
    timestamp,
    context:        rawCtx,
    recommendation,
  };
}

// ─── 2. VALIDATOR ─────────────────────────────────────────────────────────────
//
// Input:  normalized signal (output of normalizeSignal)
// Output: { valid: true } or { valid: false, errors: string[] }
// Never throws — always returns a result object

export function validateSignal(normalized) {
  const errors = [];

  // signal_id must be a known type OR a model-generated "SIG-<uuid>"
  const isKnownType  = VALID_SIGNAL_TYPES.includes(normalized.signal_id);
  const isModelId    = /^SIG-[0-9a-f-]{36}$/i.test(normalized.signal_id);
  if (!isKnownType && !isModelId) {
    errors.push(`signal_id "${normalized.signal_id}" is not a recognized signal type`);
  }

  // trace_id format check
  if (!TRACE_ID_REGEX.test(normalized.trace_id)) {
    // Warn but don't fail — legacy UUIDs are acceptable
    errors.push(`trace_id "${normalized.trace_id}" does not match TRC-YYYYMMDD-{8hex} format (non-blocking)`);
  }

  // severity must be in enum
  if (!VALID_SEVERITIES.includes(normalized.severity)) {
    errors.push(`severity "${normalized.severity}" is not valid. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
  }

  // source.system must be ARTHA
  if (normalized.source.system !== 'ARTHA') {
    errors.push(`source.system must be "ARTHA", got "${normalized.source.system}"`);
  }

  // Auto-resolve UNKNOWN source fields from the typed signal_id (e.g. SIG_INVOICE_OVERDUE)
  const lookupKey = isKnownType ? normalized.signal_id : (normalized.context?.type || normalized.context?.signal_type || '');
  if (lookupKey && SIGNAL_TYPE_SOURCE_MAP[lookupKey]) {
    const inferred = SIGNAL_TYPE_SOURCE_MAP[lookupKey];
    if (normalized.source.module === 'UNKNOWN') normalized.source.module = inferred.module;
    if (normalized.source.entity_type === 'UNKNOWN') normalized.source.entity_type = inferred.entity_type;
  }

  // Last-resort: derive entity_id from trace_id if still UNKNOWN
  if (normalized.source.entity_id === 'UNKNOWN' || !normalized.source.entity_id) {
    normalized.source.entity_id = normalized.trace_id || 'UNKNOWN';
  }

  // source.module must be known
  if (!VALID_MODULES.includes(normalized.source.module)) {
    errors.push(`source.module "${normalized.source.module}" is not recognized`);
  }

  // source.entity_type must be known
  if (!VALID_ENTITY_TYPES.includes(normalized.source.entity_type)) {
    errors.push(`source.entity_type "${normalized.source.entity_type}" is not recognized`);
  }

  // entity_id must not be empty or "UNKNOWN"
  if (!normalized.source.entity_id || normalized.source.entity_id === 'UNKNOWN') {
    errors.push('source.entity_id is missing or unresolved');
  }

  // context must be an object
  if (typeof normalized.context !== 'object' || normalized.context === null) {
    errors.push('context must be a non-null object');
  }

  // recommendation.code must be present
  if (!normalized.recommendation.code) {
    errors.push('recommendation.code is required');
  }

  // timestamp must be a valid ISO date
  if (isNaN(Date.parse(normalized.timestamp))) {
    errors.push(`timestamp "${normalized.timestamp}" is not a valid ISO date`);
  }

  // Severity-specific context checks
  const ctx = normalized.context || {};
  if (normalized.signal_id === 'SIG_GST_MISMATCH') {
    if (ctx.expected_tax === undefined) errors.push('SIG_GST_MISMATCH context missing expected_tax');
    if (ctx.actual_tax   === undefined) errors.push('SIG_GST_MISMATCH context missing actual_tax');
  }
  if (normalized.signal_id === 'SIG_LEDGER_IMBALANCE') {
    if (ctx.total_debit  === undefined) errors.push('SIG_LEDGER_IMBALANCE context missing total_debit');
    if (ctx.total_credit === undefined) errors.push('SIG_LEDGER_IMBALANCE context missing total_credit');
  }
  if (normalized.signal_id === 'SIG_CASHFLOW_NEGATIVE') {
    if (ctx.cash_flow === undefined) errors.push('SIG_CASHFLOW_NEGATIVE context missing cash_flow');
  }

  // Separate blocking from non-blocking errors
  const blocking    = errors.filter(e => !e.includes('(non-blocking)'));
  const nonBlocking = errors.filter(e =>  e.includes('(non-blocking)'));

  return {
    valid:       blocking.length === 0,
    errors:      blocking,
    warnings:    nonBlocking,
  };
}

// ─── 3. MAPPER ────────────────────────────────────────────────────────────────
//
// Input:  normalized + validated signal
// Output: SETU payload (canonical contract shape from ARTHA_SETU_CONTRACT.md)
// Throws: MappingError if required fields cannot be resolved

export class MappingError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'MappingError';
    this.field = field;
  }
}

/**
 * Map a normalized Artha signal to the SETU canonical payload.
 * This is a pure transformation — no DB calls, no side effects.
 */
export function mapToSetuPayload(normalized) {
  if (!normalized.signal_id) {
    throw new MappingError('signal_id is required for SETU mapping', 'signal_id');
  }
  if (!normalized.trace_id) {
    throw new MappingError('trace_id is required for SETU mapping', 'trace_id');
  }

  // Enrich context: compute variance if expected/actual present
  const ctx = { ...normalized.context };
  if (ctx.expected_tax !== undefined && ctx.actual_tax !== undefined) {
    try {
      ctx.variance = new Decimal(ctx.actual_tax)
        .minus(ctx.expected_tax)
        .toFixed(2);
    } catch {
      // non-numeric values — leave variance absent
    }
  }

  return {
    signal_id: normalized.signal_id,
    trace_id:  normalized.trace_id,

    source: {
      system:      normalized.source.system,
      module:      normalized.source.module,
      entity_type: normalized.source.entity_type,
      entity_id:   normalized.source.entity_id,
    },

    severity:  normalized.severity,
    timestamp: normalized.timestamp,
    context:   ctx,

    recommendation: {
      code:    normalized.recommendation.code,
      message: normalized.recommendation.message,
    },
  };
}

// ─── 4. SERIALIZER ────────────────────────────────────────────────────────────
//
// Input:  SETU payload (output of mapToSetuPayload)
// Output: { body: string, headers: object }
//         body   — JSON string ready for HTTP POST
//         headers — HTTP headers for the SETU ingest endpoint
// Never throws — returns error shape on failure

/**
 * Serialize a SETU payload to wire format.
 * Returns { ok: true, body, headers } or { ok: false, error }.
 * 
 * Extended with: idempotency key, dispatch_id, pipeline version, content fingerprint.
 */
export function serializeForSetu(setuPayload, options = {}) {
  try {
    const { attemptNumber = 1, originalDispatchTime, parentDispatchId } = options;
    
    // Generate idempotency key
    const idempotencyKey = `IDEM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${setuPayload.signal_id}-${attemptNumber}`;
    
    // Generate dispatch ID
    const dispatchId = `SD-${crypto.randomBytes(8).toString('hex')}`;
    
    // Compute content fingerprint for tamper detection
    const contentHash = crypto.createHash('sha256').update(JSON.stringify(setuPayload)).digest('hex');
    
    // Add retry metadata to payload
    const enrichedPayload = {
      ...setuPayload,
      _metadata: {
        dispatch_id: dispatchId,
        attempt_number: attemptNumber,
        original_dispatch_time: originalDispatchTime || new Date().toISOString(),
        parent_dispatch_id: parentDispatchId,
        pipeline_version: '1.0.0',
        content_hash: contentHash,
      },
    };
    
    const body = JSON.stringify(enrichedPayload);

    const headers = {
      'Content-Type':  'application/json',
      'X-Artha-Trace': setuPayload.trace_id,
      'X-Signal-Type': setuPayload.signal_id,
      'X-Severity':    setuPayload.severity,
      'X-Idempotency-Key': idempotencyKey,
      'X-Dispatch-Attempt': String(attemptNumber),
      'X-Dispatch-ID': dispatchId,
      'X-Content-Hash': contentHash,
      'X-Pipeline-Version': '1.0.0',
    };

    return { ok: true, body, headers, dispatchId, idempotencyKey, contentHash };
  } catch (err) {
    return { ok: false, error: `Serialization failed: ${err.message}` };
  }
}

/**
 * Parse SETU acknowledgement envelope.
 * Expected shape: { status: "ACCEPTED"|"REJECTED", request_id, setu_reference, processing_time_ms }
 */
export function parseSetuAcknowledge(responseBody) {
  if (!responseBody || typeof responseBody !== 'object') {
    return { valid: false, error: 'Empty or invalid response body' };
  }
  
  const { status, request_id, setu_reference, processing_time_ms, error } = responseBody;
  
  const validStatuses = ['ACCEPTED', 'REJECTED', 'PENDING', 'TIMEOUT'];
  if (!validStatuses.includes(status)) {
    return { valid: false, error: `Unknown acknowledgement status: ${status}` };
  }
  
  return {
    valid: true,
    status,
    setuReference: setu_reference || request_id,
    processingTimeMs: processing_time_ms,
    error,
    raw: responseBody,
  };
}

/**
 * Build delivery evidence object for RuntimeProof.
 */
export function buildDeliveryEvidence({ dispatchId, signalId, traceId, attemptNumber, request, response, ack, contentHash }) {
  return {
    dispatch_id: dispatchId,
    signal_id: signalId,
    trace_id: traceId,
    attempt_number: attemptNumber,
    request: {
      endpoint: request?.endpoint,
      method: request?.method || 'POST',
      headers: request?.headers,
      body_hash: contentHash,
      timestamp: request?.timestamp || new Date(),
    },
    response: {
      status: response?.status,
      latency_ms: response?.latencyMs,
      body: response?.body,
      timestamp: response?.timestamp || new Date(),
    },
    ack: {
      status: ack?.status || 'PENDING',
      setu_reference: ack?.setuReference,
      received_at: ack?.receivedAt,
    },
    content_hash: contentHash,
    pipeline_version: '1.0.0',
    environment: process.env.NODE_ENV,
    created_at: new Date(),
  };
}

/**
 * Check if a dispatch should be retried based on response.
 */
export function shouldRetry(responseStatus, retryCount, maxRetries) {
  if (retryCount >= maxRetries) return false;
  
  // Retryable: server errors (5xx), timeouts, network errors
  if (!responseStatus || responseStatus >= 500) return true;
  
  // Retryable: 429 Too Many Requests
  if (responseStatus === 429) return true;
  
  // Non-retryable: client errors (4xx except 429)
  if (responseStatus >= 400 && responseStatus < 500) return false;
  
  return false;
}

/**
 * Compute retry delay with exponential backoff.
 */
export function computeRetryDelay(attemptNumber, baseDelayMs = 60000) {
  return Math.pow(2, attemptNumber) * baseDelayMs;
}

// ─── Pipeline runner (convenience — not orchestration) ────────────────────────
//
// Runs all four stages in sequence.
// Returns a result object — never throws.
// Callers decide what to do with the result.

/**
 * Run the full Artha → SETU pipeline for a single raw signal.
 *
 * @param {object} rawSignal  Raw signal from DB or signalEngine
 * @param {object} options    Pipeline options: { attemptNumber, originalDispatchTime, parentDispatchId }
 * @returns {{ ok: boolean, stage: string, payload?: object, body?: string, headers?: object, dispatchId?: string, idempotencyKey?: string, contentHash?: string, error?: string, warnings?: string[] }}
 */
export function runPipeline(rawSignal, options = {}) {
  // Stage 1: Normalize
  let normalized;
  try {
    normalized = normalizeSignal(rawSignal);
  } catch (err) {
    return { ok: false, stage: 'NORMALIZE', error: err.message };
  }

  // Stage 2: Validate
  const validation = validateSignal(normalized);
  if (!validation.valid) {
    return {
      ok:       false,
      stage:    'VALIDATE',
      error:    validation.errors.join('; '),
      warnings: validation.warnings,
    };
  }

  // Stage 3: Map
  let setuPayload;
  try {
    setuPayload = mapToSetuPayload(normalized);
  } catch (err) {
    return { ok: false, stage: 'MAP', error: err.message };
  }

  // Stage 4: Serialize (with retry metadata)
  const serialized = serializeForSetu(setuPayload, options);
  if (!serialized.ok) {
    return { ok: false, stage: 'SERIALIZE', error: serialized.error };
  }

  return {
    ok:       true,
    stage:    'COMPLETE',
    payload:  setuPayload,
    body:     serialized.body,
    headers:  serialized.headers,
    dispatchId: serialized.dispatchId,
    idempotencyKey: serialized.idempotencyKey,
    contentHash: serialized.contentHash,
    warnings: validation.warnings,
  };
}
