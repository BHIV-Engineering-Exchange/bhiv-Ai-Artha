import mongoose from 'mongoose';
import crypto from 'crypto';

const SCHEMA_VERSION = '1.0.0';

const financialEventSchema = new mongoose.Schema({
  event_id: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
    index: true,
    default: () => `FE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
  },
  aggregate_id: {
    type: String,
    required: true,
    immutable: true,
    index: true,
  },
  aggregate_type: {
    type: String,
    required: true,
    immutable: true,
    index: true,
    enum: [
      'JournalEntry', 'LedgerEntry', 'Invoice', 'Expense',
      'BankStatement', 'GSTReturn', 'TDSEntry', 'Payment',
      'FinancialPeriod', 'AccountBalance', 'ReportSnapshot',
    ],
  },
  event_type: {
    type: String,
    required: true,
    immutable: true,
    index: true,
    enum: [
      'JOURNAL_CREATED', 'JOURNAL_VALIDATED', 'JOURNAL_POSTED', 'JOURNAL_REVERSED', 'JOURNAL_VOIDED',
      'INVOICE_CREATED', 'INVOICE_SENT', 'INVOICE_PAID', 'INVOICE_CANCELLED', 'INVOICE_OVERDUE',
      'EXPENSE_SUBMITTED', 'EXPENSE_APPROVED', 'EXPENSE_REJECTED', 'EXPENSE_RECORDED',
      'VOUCHER_IMPORTED', 'VOUCHER_EXPORTED',
      'BANK_STATEMENT_IMPORTED', 'BANK_TRANSACTION_MATCHED',
      'GST_GENERATED', 'GST_FILED',
      'TDS_ENTRY_CREATED', 'TDS_DEDUCTED', 'TDS_CHALLAN_LINKED',
      'FINANCIAL_YEAR_CLOSED', 'PERIOD_CLOSED', 'PERIOD_REOPENED',
      'LEDGER_LOCKED', 'LEDGER_REOPENED',
      'REPORT_GENERATED', 'REPORT_SNAPSHOT_CREATED',
      'PAYMENT_RECORDED', 'PAYMENT_REVERSED',
      'ACCOUNT_CREATED', 'ACCOUNT_MODIFIED',
      'REPLAY_EXECUTED', 'REPLAY_VERIFIED',
      'CAPABILITY_EXECUTED',
    ],
  },
  parent_event_id: {
    type: String,
    immutable: true,
    index: true,
  },
  timestamp: {
    type: Date,
    required: true,
    immutable: true,
    index: true,
    default: Date.now,
  },
  user_id: {
    type: String,
    immutable: true,
    index: true,
  },
  trace_id: {
    type: String,
    required: true,
    immutable: true,
    index: true,
  },
  schema_version: {
    type: String,
    default: SCHEMA_VERSION,
    immutable: true,
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    immutable: true,
  },
  previous_hash: {
    type: String,
    required: true,
    immutable: true,
    default: '0',
    index: true,
  },
  event_hash: {
    type: String,
    required: true,
    immutable: true,
    index: true,
  },
  chain_position: {
    type: Number,
    required: true,
    immutable: true,
    index: true,
  },
  replay_metadata: {
    replayed: { type: Boolean, default: false },
    replay_count: { type: Number, default: 0 },
    last_replayed_at: Date,
    replay_hash_match: { type: Boolean, default: null },
  },
}, {
  timestamps: false,
  collection: 'financial_events',
});

financialEventSchema.index({ aggregate_id: 1, timestamp: 1 });
financialEventSchema.index({ event_type: 1, timestamp: -1 });
financialEventSchema.index({ trace_id: 1, event_type: 1 });
financialEventSchema.index({ chain_position: 1 });

financialEventSchema.statics.SCHEMA_VERSION = SCHEMA_VERSION;

financialEventSchema.statics.computeHash = function (data, previousHash) {
  const payload = JSON.stringify({
    event_id: data.event_id,
    aggregate_id: data.aggregate_id,
    aggregate_type: data.aggregate_type,
    event_type: data.event_type,
    timestamp: data.timestamp,
    user_id: data.user_id,
    trace_id: data.trace_id,
    payload: data.payload,
    previous_hash: previousHash,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
};

financialEventSchema.statics.generateEventId = function () {
  return `FE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
};

export default mongoose.model('FinancialEvent', financialEventSchema);
