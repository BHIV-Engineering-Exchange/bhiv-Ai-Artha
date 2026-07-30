import mongoose from 'mongoose';
import crypto from 'crypto';

const reportSnapshotSchema = new mongoose.Schema({
  snapshot_id: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
    default: () => `SNAP-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
  },
  report_type: {
    type: String,
    required: true,
    immutable: true,
    index: true,
    enum: ['PROFIT_LOSS', 'BALANCE_SHEET', 'CASH_FLOW', 'TRIAL_BALANCE', 'GST', 'AGING', 'KPI'],
  },
  report_version: {
    type: Number,
    required: true,
    immutable: true,
    index: true,
  },
  period: {
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
  },
  event_hash: {
    type: String,
    required: true,
    immutable: true,
  },
  ledger_hash: {
    type: String,
    required: true,
    immutable: true,
  },
  report_hash: {
    type: String,
    required: true,
    immutable: true,
    index: true,
  },
  generator: {
    type: String,
    required: true,
    immutable: true,
    default: 'ARTHA Financial Runtime',
  },
  runtime_version: {
    type: String,
    required: true,
    immutable: true,
  },
  trace_id: {
    type: String,
    required: true,
    immutable: true,
    index: true,
  },
  timestamp: {
    type: Date,
    required: true,
    immutable: true,
    default: Date.now,
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    immutable: true,
  },
  metadata: {
    event_count: Number,
    journal_count: Number,
    ledger_entry_count: Number,
    generated_by: String,
  },
  bucket_reference: String,
  immutable_reference: String,
  chain_position: {
    type: Number,
    required: true,
    immutable: true,
  },
}, {
  timestamps: false,
  collection: 'report_snapshots',
});

reportSnapshotSchema.index({ report_type: 1, 'period.end_date': -1 });
reportSnapshotSchema.index({ report_type: 1, report_version: -1 });

reportSnapshotSchema.statics.computeReportHash = function (data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
};

export default mongoose.model('ReportSnapshot', reportSnapshotSchema);
