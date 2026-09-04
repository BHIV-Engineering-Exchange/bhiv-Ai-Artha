import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Invoice from '../src/models/Invoice.js';
import Expense from '../src/models/Expense.js';
import JournalEntry from '../src/models/JournalEntry.js';
import TallyVoucher from '../src/models/TallyVoucher.js';

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-artha');

console.log('=== INVOICES ===');
const invoices = await Invoice.find({ source: 'tally-connector' }).select('invoiceNumber customerName totalAmount status invoiceDate provenance.brightConnectionId').lean();
invoices.forEach(i => console.log(`  ${i.invoiceNumber} | ${i.customerName} | Rs.${i.totalAmount} | ${i.status} | ${i.invoiceDate?.toISOString().slice(0,10)}`));

console.log('\n=== EXPENSES ===');
const expenses = await Expense.find({ source: 'tally-connector' }).select('expenseNumber vendor totalAmount status date provenance.brightConnectionId').lean();
expenses.forEach(e => console.log(`  ${e.expenseNumber} | ${e.vendor} | Rs.${e.totalAmount} | ${e.status} | ${e.date?.toISOString().slice(0,10)}`));

console.log('\n=== JOURNAL ENTRIES (Tally) ===');
const jes = await JournalEntry.find({ tags: { $regex: '^tally:' } }).select('entryNumber description date status lines').lean();
jes.forEach(j => console.log(`  ${j.entryNumber} | ${j.description?.slice(0,60)} | ${j.date?.toISOString().slice(0,10)} | ${j.status}`));

console.log('\n=== TALLY VOUCHERS ===');
const vouchers = await TallyVoucher.find().select('voucherNumber voucherType partyName amount date').lean();
vouchers.forEach(v => console.log(`  ${v.voucherNumber} | ${v.voucherType} | ${v.partyName} | Rs.${v.amount} | ${v.date?.toISOString().slice(0,10)}`));

await mongoose.disconnect();
