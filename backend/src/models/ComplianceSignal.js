import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

const complianceSignalSchema = new mongoose.Schema({
  signal_id: {
    type: String,
    unique: true,
    default: () => `SIG-${randomUUID()}`,
    immutable: true,
    index: true,
  },
  trace_id: {
    type: String,
    required: true,
    immutable: true,
    index: true,
  },
  source: {
    type: String,
    default: 'ARTHA',
    immutable: true,
  },
  type: {
    type: String,
    required: true,
  },
  severity: {
    type: String,
    required: true,
  },
  context: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  recommendation: String,
  created_at: {
    type: Date,
    default: Date.now,
    immutable: true,
  },

  // SETU dispatch tracking
  dispatch_status: {
    type: String,
    enum: ['PENDING', 'DISPATCHED', 'ACKNOWLEDGED', 'REJECTED', 'FAILED', 'DEAD_LETTER'],
    default: 'PENDING',
    index: true,
  },
  setu_reference: String,
  ack_received_at: Date,
  ack_payload: mongoose.Schema.Types.Mixed,
  dispatched_at: Date,

  // Retry tracking
  retry_count: {
    type: Number,
    default: 0,
  },
  max_retries: {
    type: Number,
    default: 3,
  },
  next_retry_at: Date,

  // Evidence
  content_hash: String,
  proof_id: String,
  pipeline_version: { type: String, default: '1.0.0' },

  // Dispatch history
  dispatch_history: [{
    attempt_number: Number,
    attempted_at: Date,
    dispatch_status: String,
    response_status: Number,
    response_body: mongoose.Schema.Types.Mixed,
    response_latency_ms: Number,
    proof_id: String,
  }],

  // Resolution
  status: {
    type: String,
    enum: ['active', 'acknowledged', 'resolved', 'dismissed'],
    default: 'active',
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  resolvedAt: Date,
}, {
  timestamps: true,
});

complianceSignalSchema.index({ type: 1, severity: 1, created_at: -1 });
complianceSignalSchema.index({ next_retry_at: 1 });
complianceSignalSchema.index({ setu_reference: 1 });

export default mongoose.model('ComplianceSignal', complianceSignalSchema);
