/**
 * tracePropagation.js
 *
 * Middleware for cross-service trace continuity.
 * Ensures trace_id flows through the entire BHIV execution chain:
 *   User → ARTHA → Creator Core → Prompt Runner → BHIV Core → TANTRA → Bucket → Replay → InsightFlow
 *
 * This middleware:
 * - Extracts trace_id from incoming requests (header or generates new)
 * - Attaches trace_id to req.traceId for downstream use
 * - Adds trace_id to response headers for client correlation
 * - Propagates trace_id to external service calls
 */

import { randomUUID } from 'crypto';
import logger from '../config/logger.js';

export const tracePropagation = (req, res, next) => {
  const incomingTraceId = req.headers['x-trace-id'] || req.headers['x-request-id'];

  if (incomingTraceId) {
    req.traceId = incomingTraceId;
  } else {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = randomUUID().slice(0, 8);
    req.traceId = `TRC-${date}-${random}`;
  }

  req.traceStartTime = Date.now();

  res.setHeader('x-trace-id', req.traceId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && !Object.isFrozen(body)) {
      try {
        body.trace_id = req.traceId;
        body.trace_latency_ms = Date.now() - req.traceStartTime;
      } catch {
        // Body is read-only; skip trace metadata injection
      }
    }
    return originalJson(body);
  };

  if (process.env.TRACE_VERBOSE === 'true') {
    logger.debug(`[TRACE] ${req.method} ${req.path} | trace_id: ${req.traceId}`);
  }

  next();
};

export const createChildTraceId = (parentTraceId, operation) => {
  const opCode = operation.slice(0, 4).toUpperCase();
  const random = randomUUID().slice(0, 6);
  return `${parentTraceId}.${opCode}-${random}`;
};

export const getTraceHeaders = (traceId) => ({
  'x-trace-id': traceId,
  'x-request-id': traceId,
  'x forwarded-by': 'ARTHA',
});

export default tracePropagation;
