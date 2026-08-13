import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Invoice from '../src/models/Invoice.js';
import Expense from '../src/models/Expense.js';
import JournalEntry from '../src/models/JournalEntry.js';
import TDSEntry from '../src/models/TDSEntry.js';
import GSTReturn from '../src/models/GSTReturn.js';

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-artha');

console.log('=== CLEANING SEEDED ARTHA DATA ===\n');

// Only delete records created by seed scripts (not Tally-bridged records)
const invoices = await Invoice.deleteMany({ source: { $ne: 'tally-connector' } });
console.log(`Deleted ${invoices.deletedCount} seeded invoices`);

const expenses = await Expense.deleteMany({ source: { $ne: 'tally-connector' } });
console.log(`Deleted ${expenses.deletedCount} seeded expenses`);

const journals = await JournalEntry.deleteMany({ source: { $ne: 'TALLY_COMPATIBILITY' } });
console.log(`Deleted ${journals.deletedCount} seeded journal entries`);

const tds = await TDSEntry.deleteMany({});
console.log(`Deleted ${tds.deletedCount} TDS entries`);

const gst = await GSTReturn.deleteMany({});
console.log(`Deleted ${gst.deletedCount} GST returns`);

// Verify what remains
const invCount = await Invoice.countDocuments();
const expCount = await Expense.countDocuments();
const jeCount = await JournalEntry.countDocuments();
const tallyVouchers = await (await import('../src/models/TallyVoucher.js')).default.countDocuments();
const tallyParties = await (await import('../src/models/TallyParty.js')).default.countDocuments();
const tallyOutstanding = await (await import('../src/models/TallyOutstanding.js')).default.countDocuments();

console.log('\n=== REMAINING DATA ===');
console.log(`Invoices: ${invCount} (Tally-bridged only)`);
console.log(`Expenses: ${expCount} (Tally-bridged only)`);
console.log(`Journal Entries: ${jeCount} (Tally-bridged only)`);
console.log(`Tally Vouchers: ${tallyVouchers}`);
console.log(`Tally Parties: ${tallyParties}`);
console.log(`Tally Outstanding: ${tallyOutstanding}`);

await mongoose.disconnect();
console.log('\n=== CLEANUP COMPLETE ===');
