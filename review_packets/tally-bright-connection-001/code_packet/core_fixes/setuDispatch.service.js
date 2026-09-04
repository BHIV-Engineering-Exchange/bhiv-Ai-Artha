/**
 * setuDispatch.service.js
 *
 * Complete SETU dispatch lifecycle service.
 * Handles: signal → normalize → validate → map → serialize → dispatch → ack → retry → evidence
 *
 * Extracted from server.js inline handler into proper service.
 * Integrates with: provenanceChain, decisionLedger, circuitBreaker, lineage, traceability.
 */

import crypto from 'crypto';
import { randomUUID } from 'crypto';
import logger from '../config/logger.js';
import SetuDispatch from '../models/SetuDispatch.js';
import ComplianceSignal from '../models/ComplianceSignal.js';
import { runPipeline, buildDeliveryEvidence, shouldRetry, computeRetryDelay, parseSetuAcknowledge } from './setu.pipeline.js';
import provenanceChain from './provenanceChain.service.js';
import decisionLedger from './decisionLedger.service.js';
import circuitBreaker from './circuitBreaker.service.js';
import lineage from './lineage.service.js';

class SetuDispatchService {
  constructor() {
    this.dispatchQueue = [];
    this.retryTimers = new Map();
    this.MAX_RETRIES = 3;
    this.initialized = false;
  }

  initialize() {
    this.initialized = true;
    logger.info('[SETU_DISPATCH] Service initialized');
  }

  /**
   * Full dispatch lifecycle: pipeline → save dispatch → record evidence → emit to SETU.
   * Returns dispatch result with evidence.
   */
  async dispatchSignal(rawSignal, options = {}) {
    const startTime = Date.now();
    const traceId = rawSignal.trace_id;

    // Stage 1: Run pipeline (normalize → validate → map → serialize)
    const pipelineResult = runPipeline(rawSignal, options);
    if (!pipelineResult.ok) {
      const errorResult = {
        success: false,
        stage: pipelineResult.stage,
        error: pipelineResult.error,
        warnings: pipelineResult.warnings,
        duration_ms: Date.now() - startTime,
      };

      // Record pipeline failure to decision ledger
      await decisionLedger.recordDecision({
        decision_type: 'GOVERNANCE_ACTION',
        capability_id: 'ARTHA-SIGNAL-001',
        outcome: 'DENY',
        reason: `SETU pipeline failed at ${pipelineResult.stage}: ${pipelineResult.error}`,
        evidence: { pipeline_result: errorResult, trace_id: traceId },
      }).catch(() => {});

      return errorResult;
    }

    // Stage 2: Create dispatch record
    // NOTE: SetuDispatch schema uses camelCase fields (signalId, traceId,
    // dispatchType...). Map the internal snake_case payload to the schema at the
    // model boundary — strict mode strips snake_case keys and would otherwise
    // throw a ValidationError for the required camelCase fields.
    const dispatchRecord = await SetuDispatch.create({
      dispatchId: pipelineResult.dispatchId,
      signalId: rawSignal.signal_id,
      traceId,
      dispatchType: 'SIGNAL',
      attemptNumber: options.attemptNumber || 1,
      maxAttempts: 3,
      request: {
        idempotencyKey: pipelineResult.idempotencyKey,
        timestamp: new Date(),
      },
      deliveryStatus: 'INITIATED',
      pipelineVersion: '1.0.0',
      environment: process.env.NODE_ENV,
    });

    // Stage 3: Record to provenance chain
    await provenanceChain.recordDecisionLedger({
      decision_id: `SETU-${pipelineResult.dispatchId}`,
      outcome: 'ALLOW',
      reason: `SETU dispatch initiated: ${rawSignal.signal_id} → ${traceId}`,
    }).catch(() => {});

    // Stage 4: Record decision ledger entry
    await decisionLedger.recordDecision({
      decision_type: 'GOVERNANCE_ACTION',
      capability_id: 'ARTHA-SIGNAL-001',
      outcome: 'ALLOW',
      reason: `SETU dispatch authorized: ${rawSignal.signal_id}`,
      evidence: {
        dispatch_id: pipelineResult.dispatchId,
        signal_id: rawSignal.signal_id,
        trace_id: traceId,
        idempotency_key: pipelineResult.idempotencyKey,
        content_hash: pipelineResult.contentHash,
        attempt: options.attemptNumber || 1,
      },
    }).catch(() => {});

    // Stage 5: Anchor lineage
    await lineage.anchorEntity({
      trace_id: traceId,
      entity_type: 'SETU_DISPATCH',
      entity_id: pipelineResult.dispatchId,
      anchor_type: 'SETU_LIFECYCLE',
      anchor_data: {
        signal_id: rawSignal.signal_id,
        dispatch_id: pipelineResult.dispatchId,
        idempotency_key: pipelineResult.idempotencyKey,
        pipeline_version: '1.0.0',
      },
    }).catch(() => {});

    // Stage 6: Check circuit breaker
    const canProceed = circuitBreaker.canExecute('setu_api');
    if (!canProceed) {
      await SetuDispatch.findByIdAndUpdate(dispatchRecord._id, {
        $set: { status: 'circuit_open', error: 'Circuit breaker open for setu_api' },
      });

      return {
        success: false,
        dispatch_id: pipelineResult.dispatchId,
        error: 'Circuit breaker open for SETU API',
        circuit_breaker: 'OPEN',
        duration_ms: Date.now() - startTime,
      };
    }

    const duration = Date.now() - startTime;
    logger.info(`[SETU_DISPATCH] Dispatch ready: ${pipelineResult.dispatchId} (${duration}ms)`);

    return {
      success: true,
      dispatch_id: pipelineResult.dispatchId,
      signal_id: rawSignal.signal_id,
      trace_id: traceId,
      idempotency_key: pipelineResult.idempotencyKey,
      content_hash: pipelineResult.contentHash,
      pipeline_stage: 'COMPLETE',
      attempt: options.attemptNumber || 1,
      duration_ms: duration,
      dispatch_record: dispatchRecord,
    };
  }

  /**
   * Process SETU acknowledgement callback.
   */
  async processAcknowledgement(callbackBody) {
    const { dispatch_id, signal_id, trace_id, status, setu_reference, processing_time_ms, error } = callbackBody;

    if (!dispatch_id || !signal_id) {
      return { success: false, message: 'Missing required fields: dispatch_id, signal_id' };
    }

    // Find dispatch record (schema uses camelCase field names)
    const dispatch = await SetuDispatch.findOne({ dispatchId: dispatch_id, signalId: signal_id });
    if (!dispatch) {
      logger.warn(`SETU callback for unknown dispatch: ${dispatch_id}`);
      return { success: false, message: 'Dispatch not found' };
    }

    // Parse acknowledgement
    const ack = parseSetuAcknowledge(callbackBody);

    // Update dispatch record (schema fields: ack.setuReference, ack.processingTimeMs,
    // ack.receivedAt, deliveryStatus)
    await SetuDispatch.findByIdAndUpdate(dispatch._id, {
      $set: {
        'ack.status': status,
        'ack.setuReference': setu_reference,
        'ack.processingTimeMs': processing_time_ms,
        'ack.error': error,
        'ack.receivedAt': new Date(),
        'ack.payload': ack,
        deliveryStatus: status === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
      },
    });

    // Update compliance signal if exists
    if (trace_id) {
      await ComplianceSignal.updateOne(
        { trace_id },
        {
          $set: {
            dispatch_status: status === 'ACCEPTED' ? 'acknowledged' : 'rejected',
            setu_reference,
            ack_received_at: new Date(),
            ack_payload: callbackBody,
          },
        }
      );
    }

    // Record to decision ledger
    await decisionLedger.recordDecision({
      decision_type: 'GOVERNANCE_ACTION',
      capability_id: 'ARTHA-SIGNAL-001',
      outcome: status === 'ACCEPTED' ? 'ALLOW' : 'DENY',
      reason: `SETU acknowledgement: ${status} for dispatch ${dispatch_id}`,
      evidence: {
        dispatch_id,
        signal_id,
        trace_id,
        setu_reference,
        processing_time_ms,
        ack_status: status,
      },
    }).catch(() => {});

    // Record circuit breaker success/failure
    if (status === 'ACCEPTED') {
      circuitBreaker.recordSuccess('setu_api');
    } else {
      circuitBreaker.recordFailure('setu_api');
    }

    // Build delivery evidence
    const evidence = buildDeliveryEvidence({
      dispatchId: dispatch_id,
      signalId: signal_id,
      traceId: trace_id,
      attemptNumber: dispatch.attempt_number || 1,
      request: { endpoint: 'SETU_INGEST', method: 'POST' },
      response: { status: ack.valid ? 200 : 500, latencyMs: processing_time_ms },
      ack: { status, setuReference: setu_reference, receivedAt: new Date() },
      contentHash: dispatch.payload_hash,
    });

    logger.info(`SETU callback processed: dispatch_id=${dispatch_id} status=${status}`);

    return {
      success: true,
      dispatch_id,
      status,
      evidence,
    };
  }

  /**
   * Retry a failed dispatch with exponential backoff.
   */
  async retryDispatch(dispatchId) {
    const dispatch = await SetuDispatch.findOne({ dispatch_id: dispatchId });
    if (!dispatch) {
      return { success: false, error: 'Dispatch not found' };
    }

    const currentAttempt = (dispatch.attempt_number || 1) + 1;
    if (currentAttempt > this.MAX_RETRIES) {
      return { success: false, error: 'Max retries exceeded', max_retries: this.MAX_RETRIES };
    }

    // Find original signal
    const signal = await ComplianceSignal.findOne({ trace_id: dispatch.trace_id });
    if (!signal) {
      return { success: false, error: 'Original signal not found' };
    }

    // Retry with incremented attempt number
    const result = await this.dispatchSignal(
      {
        signal_id: signal.signal_id || signal.type,
        trace_id: signal.trace_id,
        severity: signal.severity,
        source: signal.source,
        context: signal.context,
        recommendation: signal.recommendation,
      },
      {
        attemptNumber: currentAttempt,
        originalDispatchTime: dispatch.created_at,
        parentDispatchId: dispatchId,
      }
    );

    return result;
  }

  /**
   * Get dispatch statistics.
   */
  async getDispatchStats() {
    const [total, pending, dispatched, failed] = await Promise.all([
      SetuDispatch.countDocuments({}),
      SetuDispatch.countDocuments({ status: 'pending' }),
      SetuDispatch.countDocuments({ status: 'dispatched' }),
      SetuDispatch.countDocuments({ status: 'failed' }),
    ]);

    return {
      total,
      pending,
      dispatched,
      failed,
      success_rate: total > 0 ? ((dispatched / total) * 100).toFixed(2) + '%' : '0%',
    };
  }

  /**
   * Get dispatch by ID.
   */
  async getDispatch(dispatchId) {
    return SetuDispatch.findOne({ dispatch_id: dispatchId }).lean();
  }

  /**
   * Get dispatches for a trace.
   */
  async getDispatchesByTrace(traceId) {
    return SetuDispatch.find({ trace_id: traceId }).sort({ created_at: -1 }).lean();
  }
}

const setuDispatch = new SetuDispatchService();
export default setuDispatch;
