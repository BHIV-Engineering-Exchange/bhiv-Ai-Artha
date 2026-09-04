import mongoose from 'mongoose';
import { randomUUID, createHash } from 'crypto';

const setuDispatchSchema = new mongoose.Schema({
  dispatchId: {
    type: String,
    unique: true,
    default: () => `SD-${randomUUID()}`,
    immutable: true,
    index: true,
  },
  signalId: {
    type: String,
    required: true,
    index: true,
  },
  traceId: {
    type: String,
    required: true,
    index: true,
  },
  filingId: {
    type: String,
    index: true,
  },
  dispatchType: {
    type: String,
    enum: ['SIGNAL', 'FILING_GSTR1', 'FILING_GSTR3B', 'FILING_26Q', 'FILING_24Q'],
    required: true,
    index: true,
  },
  attemptNumber: {
    type: Number,
    default: 1,
    required: true,
  },
  maxAttempts: {
    type: Number,
    default: 3,
  },

  // Request
  request: {
    endpoint: String,
    method: { type: String, default: 'POST' },
    headers: mongoose.Schema.Types.Mixed,
    body: mongoose.Schema.Types.Mixed,
    bodyHash: String,
    idempotencyKey: String,
    timestamp: Date,
  },

  // Response
  response: {
    status: Number,
    headers: mongoose.Schema.Types.Mixed,
    body: mongoose.Schema.Types.Mixed,
    latencyMs: Number,
    timestamp: Date,
  },

  // Acknowledgement
  ack: {
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'TIMEOUT', 'UNKNOWN'],
      default: 'PENDING',
    },
    setuReference: String,
    receivedAt: Date,
    payload: mongoose.Schema.Types.Mixed,
    processingTimeMs: Number,
  },

  // Retry tracking
  retry: {
    count: { type: Number, default: 0 },
    lastAttemptAt: Date,
    nextRetryAt: Date,
    failureReason: String,
    isRetryableError: { type: Boolean, default: true },
  },

  // Delivery status
  deliveryStatus: {
    type: String,
    enum: ['INITIATED', 'SENT', 'ACCEPTED', 'REJECTED', 'TIMEOUT', 'NETWORK_ERROR', 'DEAD_LETTER'],
    default: 'INITIATED',
    index: true,
  },

  // Evidence
  proofId: {
    type: String,
    index: true,
  },

  // Metadata
  pipelineVersion: { type: String, default: '1.0.0' },
  environment: { type: String, default: process.env.NODE_ENV },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

  dispatchedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

setuDispatchSchema.index({ signalId: 1, attemptNumber: 1 });
setuDispatchSchema.index({ traceId: 1, deliveryStatus: 1 });
setuDispatchSchema.index({ deliveryStatus: 1, 'retry.nextRetryAt': 1 });
setuDispatchSchema.index({ 'request.idempotencyKey': 1 });
setuDispatchSchema.index({ createdAt: -1 });

setuDispatchSchema.statics.generateIdempotencyKey = function(signalId, attemptNumber) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `IDEM-${date}-${signalId}-${attemptNumber}`;
};

setuDispatchSchema.statics.computeBodyHash = function(body) {
  return createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
};

setuDispatchSchema.methods.canRetry = function() {
  return this.attemptNumber < this.maxAttempts && this.retry.isRetryableError;
};

setuDispatchSchema.methods.markFailed = function(reason, isRetryable = true, status = 'NETWORK_ERROR') {
  this.deliveryStatus = status;
  if (!this.response) this.response = {};
  this.response.timestamp = new Date();
  this.retry.failureReason = reason;
  this.retry.isRetryableError = isRetryable;
  this.retry.count += 1;
  this.retry.lastAttemptAt = new Date();

  if (this.canRetry()) {
    const backoffMs = Math.pow(2, this.retry.count) * 60000;
    this.retry.nextRetryAt = new Date(Date.now() + backoffMs);
  } else {
    this.deliveryStatus = 'DEAD_LETTER';
  }
};

export default mongoose.model('SetuDispatch', setuDispatchSchema);
