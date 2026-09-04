import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Invoice from '../src/models/Invoice.js';
import Expense from '../src/models/Expense.js';
import JournalEntry from '../src/models/JournalEntry.js';
import TDSEntry from '../src/models/TDSEntry.js';
import GSTReturn from '../src/models/GSTReturn.js';
import ChartOfAccounts from '../src/models/ChartOfAccounts.js';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-artha');

const invoices = await Invoice.countDocuments();
const expenses = await Expense.countDocuments();
const journalEntries = await JournalEntry.countDocuments();
const tdsEntries = await TDSEntry.countDocuments();
const gstReturns = await GSTReturn.countDocuments();
const accounts = await ChartOfAccounts.countDocuments();

const invoicesByStatus = await Invoice.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } }]);
const expensesByCategory = await Expense.aggregate([{ $group: { _id: '$category', count: { $sum: 1 }, total: { $sum: '$amount' } } }]);
const jeByStatus = await JournalEntry.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);

console.log('\n=== DATABASE VERIFICATION ===');
console.log(`\nInvoices: ${invoices}`);
console.log('By status:', JSON.stringify(invoicesByStatus, null, 2));
console.log(`\nExpenses: ${expenses}`);
console.log('By category:', JSON.stringify(expensesByCategory, null, 2));
console.log(`\nJournal Entries: ${journalEntries}`);
console.log('By status:', JSON.stringify(jeByStatus, null, 2));
console.log(`\nTDS Entries: ${tdsEntries}`);
console.log(`GST Returns: ${gstReturns}`);
console.log(`Chart of Accounts: ${accounts}`);
console.log('\n=== ALL TABS SHOULD NOW HAVE DATA ===');

await mongoose.disconnect();
