import dotenv from 'dotenv';
import mongoose from 'mongoose';
import TallyVoucher from '../src/models/TallyVoucher.js';
import Invoice from '../src/models/Invoice.js';
import Expense from '../src/models/Expense.js';
import JournalEntry from '../src/models/JournalEntry.js';
import ChartOfAccounts from '../src/models/ChartOfAccounts.js';
import { bridgeTallyRecords } from '../src/services/tallyToArthaBridge.service.js';

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-artha');

console.log('=== DEBUGGING BRIDGE ===\n');

// Get all vouchers
const vouchers = await TallyVoucher.find().lean();
console.log('Total vouchers:', vouchers.length);

// Check which are already bridged
const bridgedJE = await JournalEntry.countDocuments({ tags: { $regex: '^tally:' } });
const bridgedInv = await Invoice.countDocuments({ source: 'tally-connector' });
const bridgedExp = await Expense.countDocuments({ source: 'tally-connector' });
console.log('Already bridged - JE:', bridgedJE, 'Invoice:', bridgedInv, 'Expense:', bridgedExp);

// Check ChartOfAccounts
const accounts = await ChartOfAccounts.find({ code: { $in: ['1010', '1100', '4000', '6900'] } }).select('code name type');
console.log('\nRequired accounts:', accounts.map(a => `${a.code}=${a.name}`));

// Try to bridge manually
console.log('\n=== RUNNING BRIDGE MANUALLY ===');
const tenantId = 'tenant_bright_connection_001';
const company = 'Bright Connection';

// Convert TallyVoucher docs to MDU format
const mduRecords = vouchers.map(v => ({
  entity_type: 'voucher',
  tenant_id: tenantId,
  company: company,
  canonical_data: {
    voucher_type: v.voucherType || '',
    voucher_number: v.voucherNumber,
    date: v.date ? v.date.toISOString() : null,
    party_name: v.partyName,
    amount: v.amount,
    narration: v.narration,
    reference: v.reference,
    entries: v.entries,
    gst_details: v.gstDetails,
  },
  trace_id: v.traceId,
}));

const results = await bridgeTallyRecords(mduRecords, tenantId, company);
console.log('\nBridge results:', JSON.stringify(results, null, 2));

// Verify
const finalJE = await JournalEntry.countDocuments({ tags: { $regex: '^tally:' } });
const finalInv = await Invoice.countDocuments({ source: 'tally-connector' });
const finalExp = await Expense.countDocuments({ source: 'tally-connector' });
console.log('\nAfter bridge - JE:', finalJE, 'Invoice:', finalInv, 'Expense:', finalExp);

await mongoose.disconnect();
