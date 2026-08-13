import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

/**
 * TallyParty — snapshot of a Tally party/ledger (dealer) pulled from the
 * Bright Connection Tally gateway by the read-only connector.
 * Additive model: never written back to Tally. ARTHA owns the snapshot.
 */
const tallyPartySchema = new mongoose.Schema({
  partyId: {
    type: String,
    default: () => `TLYPARTY-${randomUUID()}`,
    immutable: true,
    index: true,
  },
  tenantId: {
    type: String,
    default: 'tenant_bright_connection_001',
    index: true,
  },
  company: { type: String, default: '', index: true },
  ledgerName: { type: String, required: true, index: true },
  group: { type: String, default: '' },
  partyType: {
    type: String,
    enum: ['SUNDRY_DEBTOR', 'SUNDRY_CREDITOR', 'OTHER'],
    default: 'OTHER',
  },
  openingBalance: { type: Number, default: 0 },
  closingBalance: { type: Number, default: 0 },
  creditLimit: { type: Number, default: 0 },
  gstin: { type: String, default: '' },
  pan: { type: String, default: '' },
  address: { type: String, default: '' },
  contact: { type: String, default: '' },
  currency: { type: String, default: 'INR' },
  source: { type: String, default: 'tally' },
  traceId: { type: String, default: '' },
  rawRef: { type: String, default: '' },
  syncedAt: { type: Date, default: Date.now, index: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

tallyPartySchema.index({ tenantId: 1, company: 1, ledgerName: 1 }, { unique: true });

export default mongoose.model('TallyParty', tallyPartySchema);