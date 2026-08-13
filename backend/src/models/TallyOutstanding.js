import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

/**
 * TallyOutstanding — bill-wise outstanding for a party (dealer) from Tally.
 * Feed for the dealer demo: outstanding → overdue → SETU insight → MITRA summary.
 */
const tallyOutstandingSchema = new mongoose.Schema({
  outstandingId: {
    type: String,
    default: () => `TLYOUT-${randomUUID()}`,
    immutable: true,
    index: true,
  },
  tenantId: {
    type: String,
    default: 'tenant_bright_connection_001',
    index: true,
  },
  company: { type: String, default: '', index: true },
  partyId: { type: String, default: '', index: true },
  partyName: { type: String, required: true, index: true },
  ledgerName: { type: String, default: '' },
  billNo: { type: String, default: '' },
  billDate: { type: Date },
  dueDate: { type: Date },
  daysOverdue: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
  received: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  billType: {
    type: String,
    enum: ['New', 'Advance', 'Agst Ref', 'On Account', 'Credit', 'UNKNOWN'],
    default: 'UNKNOWN',
  },
  outstandingType: {
    type: String,
    enum: ['DEBTOR', 'CREDITOR'],
    default: 'DEBTOR',
  },
  source: { type: String, default: 'tally' },
  traceId: { type: String, default: '' },
  rawRef: { type: String, default: '' },
  syncedAt: { type: Date, default: Date.now, index: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  provenance: {
    brightConnectionId: { type: String, default: '' },
    accountId: { type: String, default: '' },
    storeId: { type: String, default: '' },
    storeName: { type: String, default: '' },
    sourceEntity: { type: String, default: 'outstanding' },
    dataset: { type: String, default: 'outstanding' },
    rawTallyPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    syncedAt: { type: Date, default: Date.now },
    lastSyncedAt: { type: Date, default: Date.now },
    syncRunId: { type: String, default: '' },
    migratedToArtha: { type: Boolean, default: false },
    arthaModelType: { type: String, default: '' },
    arthaRecordId: { type: String, default: '' },
    mitraAction: { type: String, default: '' },
    mitraInsight: { type: String, default: '' },
  },
}, {
  timestamps: true,
});

tallyOutstandingSchema.index({ tenantId: 1, partyId: 1, billNo: 1 }, { unique: true });

export default mongoose.model('TallyOutstanding', tallyOutstandingSchema);