import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

const decisionLedgerSchema = new mongoose.Schema({
  decision_id: {
    type: String,
    required: true,
    unique: true,
    default: () => `DLG-${Date.now()}-${randomUUID().slice(0, 8)}`,
    immutable: true,
    index: true,
  },
  decision_type: {
    type: String,
    required: true,
    enum: [
      'CAPABILITY_ENFORCEMENT',
      'POLICY_DECISION',
      'AUTHORITY_BOUNDARY',
      'CONTRACT_INTEGRITY',
      'REPLAY_VERIFICATION',
      'ADVERSARIAL_BLOCK',
      'GOVERNANCE_ACTION',
      'DEPLOYMENT_DECISION',
      'RUNTIME_REGISTRATION',
      'RUNTIME_DEREGISTRATION',
    ],
    index: true,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    immutable: true,
    index: true,
  },
  capability_id: String,
  method: String,
  path: String,
  outcome: {
    type: String,
    required: true,
    enum: ['ALLOW', 'DENY', 'WARN', 'BLOCK', 'ESCALATE'],
    index: true,
  },
  reason: {
    type: String,
    required: true,
  },
  evidence: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  user_id: String,
  request_context: {
    method: String,
    path: String,
    ip: String,
    user_agent: String,
    capability_id: String,
  },
  policy_context: {
    policy_name: String,
    policy_version: String,
    enforcement_point: String,
  },
  chain_position: {
    type: Number,
    required: true,
    index: true,
  },
  previous_hash: {
    type: String,
    required: true,
  },
  hash: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
  },
  provenance_block_id: String,
  replay_safe: {
    type: Boolean,
    default: true,
  },
  constitutionally_compliant: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: false,
});

decisionLedgerSchema.index({ decision_type: 1, timestamp: -1 });
decisionLedgerSchema.index({ outcome: 1, decision_type: 1 });
decisionLedgerSchema.index({ capability_id: 1, outcome: 1 });

export default mongoose.model('DecisionLedger', decisionLedgerSchema);
