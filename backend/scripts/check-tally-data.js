import dotenv from 'dotenv';
import mongoose from 'mongoose';
import TallyVoucher from '../src/models/TallyVoucher.js';
import TallyParty from '../src/models/TallyParty.js';
import TallyOutstanding from '../src/models/TallyOutstanding.js';
import Invoice from '../src/models/Invoice.js';
import Expense from '../src/models/Expense.js';
import JournalEntry from '../src/models/JournalEntry.js';

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-artha');

console.log('=== CURRENT DATA COUNTS ===');
console.log('TallyVoucher:', await TallyVoucher.countDocuments());
console.log('TallyParty:', await TallyParty.countDocuments());
console.log('TallyOutstanding:', await TallyOutstanding.countDocuments());
console.log('Invoice:', await Invoice.countDocuments());
console.log('Expense:', await Expense.countDocuments());
console.log('JournalEntry:', await JournalEntry.countDocuments());

// Show voucher types
const types = await TallyVoucher.aggregate([{ $group: { _id: '$voucherType', count: { $sum: 1 }, total: { $sum: '$amount' } } }]);
console.log('\nVoucher types:', JSON.stringify(types, null, 2));

// Show parties
const partyList = await TallyParty.find().select('ledgerName partyType closingBalance').lean();
console.log('\nParties:', partyList.map(p => `${p.ledgerName} (${p.partyType}): ${p.closingBalance}`));

await mongoose.disconnect();
