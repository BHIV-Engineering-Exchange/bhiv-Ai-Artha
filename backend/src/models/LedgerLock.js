import mongoose from 'mongoose';
import crypto from 'crypto';

const ledgerLockSchema = new mongoose.Schema({
  lock_id: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
    default: () => `LOCK-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
  },
  period_id: {
    type: String,
    required: true,
    index: true,
  },
  lock_type: {
    type: String,
    required: true,
    enum: ['PERIOD_CLOSE', 'YEAR_END_CLOSE', 'AUDIT_LOCK', 'CONSTITUTIONAL_UNLOCK'],
    index: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['ACTIVE', 'RELEASED', 'OVERRIDDEN'],
    default: 'ACTIVE',
    index: true,
  },
  locked_by: {
    type: String,
    required: true,
  },
  locked_at: {
    type: Date,
    required: true,
    default: Date.now,
  },
  released_by: String,
  released_at: Date,
  reason: {
    type: String,
    required: true,
  },
  constraints: {
    block_journal_posting: { type: Boolean, default: true },
    block_invoice_modification: { type: Boolean, default: true },
    block_expense_modification: { type: Boolean, default: true },
    block_voucher_import: { type: Boolean, default: true },
    block_ledger_edits: { type: Boolean, default: true },
    allow_constitutional_adjustments: { type: Boolean, default: true },
  },
  adjustment_window: {
    start: Date,
    end: Date,
  },
  event_id: {
    type: String,
    immutable: true,
  },
  trace_id: {
    type: String,
    required: true,
  },
  hash: {
    type: String,
    required: true,
    immutable: true,
  },
  previous_hash: {
    type: String,
    required: true,
    default: '0',
    immutable: true,
  },
  chain_position: {
    type: Number,
    required: true,
    immutable: true,
  },
}, {
  timestamps: false,
  collection: 'ledger_locks',
});

ledgerLockSchema.index({ period_id: 1, status: 1 });
ledgerLockSchema.index({ lock_type: 1, status: 1 });

ledgerLockSchema.statics.computeHash = function (data, previousHash) {
  const payload = JSON.stringify({
    lock_id: data.lock_id,
    period_id: data.period_id,
    lock_type: data.lock_type,
    status: data.status,
    locked_by: data.locked_by,
    locked_at: data.locked_at,
    reason: data.reason,
    previous_hash: previousHash,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
};

export default mongoose.model('LedgerLock', ledgerLockSchema);
