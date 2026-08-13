import { createHmac } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import logger from '../config/logger.js';
import { emitSignal } from '../services/signalEngine.service.js';
import TallyParty from '../models/TallyParty.js';
import TallyOutstanding from '../models/TallyOutstanding.js';
import TallyVoucher from '../models/TallyVoucher.js';
import TallySyncRun from '../models/TallySyncRun.js';

/**
 * tallySetuBridge.service — the ARTHA → SETU bridge.
 *
 * Two delivery paths for canonical MDU records:
 *  1. Direct:  POST to the real SETU ingest endpoint (TALLY_SETU_ENDPOINT) with
 *     HMAC signature + idempotency header + retry/backoff.
 *  2. ARTHA pipeline: emitSignal() → ARTHA SETU pipeline (setu.pipeline) →
 *     Sampada envelope → SETU_BASE_URL when SETU_ENABLED=true.
 *
 * Also exports all canonical records as MDU JSON so the Setu-Aman Python
 * framework (MasterDB/InsightFlow/Replay) can ingest the same contract.
 *
 * No Tally-specific logic leaks into the SETU payloads — SETU sees the
 * canonical financial contract only.
 */

function bridgeConfig() {
  return {
    endpoint: process.env.TALLY_SETU_ENDPOINT || '',
    hmacSecret: process.env.TALLY_SETU_HMAC_SECRET || process.env.HMAC_SECRET || '',
    timeoutMs: Number(process.env.TALLY_SETU_TIMEOUT_MS || 10000),
    maxRetries: Number(process.env.TALLY_SETU_MAX_RETRIES || 3),
  };
}

function isConfigured() {
  return Boolean(bridgeConfig().endpoint);
}

function signPayload(body) {
  const { hmacSecret } = bridgeConfig();
  if (!hmacSecret) return null;
  return createHmac('sha256', hmacSecret).update(body).digest('hex');
}

function postJson(url, body, { timeoutMs, idempotencyKey }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const transport = u.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);
    const signature = signPayload(payload);

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': 'ARTHA-TallySetuBridge/1.0',
      'X-Idempotency-Key': idempotencyKey,
    };
    if (signature) headers['X-Setu-Signature'] = signature;

    const req = transport.request(
      { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method: 'POST', headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) {
            return reject(new Error(`SETU endpoint returned HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
          }
          resolve({ statusCode: res.statusCode, body: text });
        });
      },
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error(`SETU timeout after ${timeoutMs}ms`)));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Direct dispatch to the real SETU endpoint with retry/backoff.
 * Returns evidence: { dispatched, attempts, response, signature }.
 */
async function dispatchToSetuDirect(record) {
  const cfg = bridgeConfig();
  if (!cfg.endpoint) {
    return { dispatched: false, reason: 'TALLY_SETU_ENDPOINT not configured' };
  }

  const idempotencyKey = record.idempotency_key || record.entity_id;
  const maxAttempts = cfg.maxRetries + 1;
  let attempts = 0;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    try {
      const response = await postJson(cfg.endpoint, record, {
        timeoutMs: cfg.timeoutMs,
        idempotencyKey,
      });
      return {
        dispatched: true,
        attempts,
        statusCode: response.statusCode,
        response: response.body.slice(0, 500),
        idempotencyKey,
        signature: signPayload(JSON.stringify(record)),
      };
    } catch (err) {
      lastError = err.message;
      if (attempt < maxAttempts) {
        await sleep(200 * attempt);
      }
    }
  }

  return { dispatched: false, attempts, reason: lastError, idempotencyKey };
}

/** Emit via ARTHA's SETU pipeline (persists a ComplianceSignal + optional Sampada dispatch). */
async function dispatchToArthaSetu(record, { signalId, severity, entityType, entityId } = {}) {
  const opts = {
    signalId: signalId || 'SIG_TALLY_DEALER_SYNCED',
    module: 'TALLY_CONNECT',
    entityType: entityType || 'DEALER_SUMMARY',
    entityId: entityId || record.entity_id,
    severity: severity || 'LOW',
    context: {
      tenant_id: record.tenant_id,
      company: record.company,
      canonical: record.canonical_data,
      integrity_hash: record.integrity_hash,
      read_only: true,
    },
  };
  const result = await emitSignal(opts);
  return result;
}

/**
 * Primary bridge: dispatch a canonical record everywhere it needs to go.
 */
async function dispatchRecord(record, opts = {}) {
  const outcomes = {};
  outcomes.direct = await dispatchToSetuDirect(record);
  if (process.env.SETU_ENABLED === 'true') {
    try {
      outcomes.artha = await dispatchToArthaSetu(record, opts);
    } catch (err) {
      logger.warn(`ARTHA SETU emit failed: ${err.message}`);
      outcomes.artha = { error: err.message };
    }
  } else {
    outcomes.artha = { skipped: 'SETU_ENABLED not true' };
  }
  return outcomes;
}

/** Mark a sync run's SETU delivery status. */
async function recordSetuDispatch(runId, outcomes) {
  const dispatched = Boolean(outcomes.direct?.dispatched);
  await TallySyncRun.updateOne({ runId }, {
    $set: {
      setuDispatched: dispatched,
      setuDispatch: {
        direct: outcomes.direct,
        artha: outcomes.artha,
        at: new Date().toISOString(),
      },
    },
  }).catch((err) => logger.warn(`Failed to record SETU dispatch evidence: ${err.message}`));
  return dispatched;
}

/**
 * Export all persisted snapshots as canonical MDU records (JSON) for the
 * Setu-Aman Python framework to ingest (MasterDB / InsightFlow / Replay).
 */
async function exportMduRecords({ tenantId } = {}) {
  const tenant = tenantId || process.env.TALLY_TENANT_ID || 'tenant_bright_connection_001';
  const t = (obj, type) => ({
    entity_type: type,
    entity_id: `${type}:${obj._id}`,
    tenant_id: obj.tenantId || tenant,
    source_connector: 'tally',
    source_connector_version: '1.0.0',
    read_only: true,
    company: obj.company || '',
    canonical_data: obj,
    trace_id: obj.traceId || '',
    schema_version: '1.0.0',
    raw_ref: obj.rawRef || '',
    ingested_at: obj.syncedAt ? obj.syncedAt.toISOString() : new Date().toISOString(),
    idempotency_key: `${obj.tenantId || tenant}:${type}:${obj._id}`,
    integrity_hash: '',
    tags: [],
    metadata: { connector: 'tally', read_only: true },
  });

  const [parties, outstanding, vouchers] = await Promise.all([
    TallyParty.find({ tenantId: tenant }).sort({ ledgerName: 1 }),
    TallyOutstanding.find({ tenantId: tenant }).sort({ dueDate: 1 }),
    TallyVoucher.find({ tenantId: tenant }).sort({ date: 1 }),
  ]);

  return [
    ...parties.map((o) => t(o, 'party')),
    ...outstanding.map((o) => t(o, 'outstanding')),
    ...vouchers.map((o) => t(o, 'voucher')),
  ];
}

export default {
  dispatchRecord,
  dispatchToSetuDirect,
  dispatchToArthaSetu,
  recordSetuDispatch,
  exportMduRecords,
  bridgeConfig,
  isConfigured,
};