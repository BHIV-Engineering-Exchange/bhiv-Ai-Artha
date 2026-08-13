import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

/**
 * TallyVoucher — read-only snapshot of Tally vouchers (sales/receipts/payments
 * /journals). Used for "last billing" and "payments/account info" in the dealer demo.
 */
const tallyVoucherSchema = new mongoose.Schema({
  voucherId: {
    type: String,
    default: () => `TLYVCH-${randomUUID()}`,
    immutable: true,
    index: true,
  },
  tenantId: {
    type: String,
    default: 'tenant_bright_connection_001',
    index: true,
  },
  company: { type: String, default: '', index: true },
  voucherType: { type: String, default: '', index: true },
  voucherNumber: { type: String, default: '' },
  date: { type: Date, index: true },
  partyName: { type: String, default: '', index: true },
  partyLedgerName: { type: String, default: '' },
  amount: { type: Number, default: 0 },
  narration: { type: String, default: '' },
  reference: { type: String, default: '' },
  entries: [{
    ledgerName: String,
    amount: Number,
  }],
  gstDetails: {
    gstin: String,
    taxableValue: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
  },
  source: { type: String, default: 'tally' },
  traceId: { type: String, default: '' },
  rawRef: { type: String, default: '' },
  syncedAt: { type: Date, default: Date.now, index: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

tallyVoucherSchema.index({ tenantId: 1, partyName: 1, date: -1 });
tallyVoucherSchema.index({ tenantId: 1, voucherNumber: 1, date: 1 }, { unique: true });

export default mongoose.model('TallyVoucher', tallyVoucherSchema);