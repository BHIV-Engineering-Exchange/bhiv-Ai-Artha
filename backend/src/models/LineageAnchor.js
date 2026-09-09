import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

const lineageAnchorSchema = new mongoose.Schema({
  lineage_id: {
    type: String,
    required: true,
    unique: true,
    default: () => `LIN-${Date.now()}-${randomUUID().slice(0, 8)}`,
    immutable: true,
    index: true,
  },
  trace_id: {
    type: String,
    required: true,
    index: true,
  },
  entity_type: {
    type: String,
    required: true,
    enum: [
      'JournalEntry',
      'LedgerEntry',
      'Invoice',
      'Expense',
      'TDSEntry',
      'ComplianceFiling',
      'ComplianceSignal',
      'RuntimeProof',
      'ProvenanceBlock',
      'DecisionLedger',
    ],
    index: true,
  },
  entity_id: {
    type: String,
    required: true,
    index: true,
  },
  anchor_type: {
    type: String,
    required: true,
    enum: [
      'BUCKET_STORAGE',
      'MDU_LINEAGE',
      'PROVENANCE_CHAIN',
      'DECISION_LEDGER',
      'REPLAY_PROOF',
      'SETU_DISPATCH',
    ],
    index: true,
  },
  anchor_data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  content_hash: {
    type: String,
    required: true,
  },
  bucket_reference: {
    bucket_id: String,
    bucket_path: String,
    immutable_ref: String,
  },
  mdu_reference: {
    lineage_path: String,
    semantic_version: String,
    schema_version: String,
  },
  parent_lineage_id: {
    type: String,
    index: true,
  },
  child_lineage_ids: [{
    type: String,
  }],
  created_at: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  verified_at: Date,
}, {
  timestamps: false,
});

lineageAnchorSchema.index({ trace_id: 1, entity_type: 1, entity_id: 1 });
lineageAnchorSchema.index({ anchor_type: 1, created_at: -1 });

export default mongoose.model('LineageAnchor', lineageAnchorSchema);
