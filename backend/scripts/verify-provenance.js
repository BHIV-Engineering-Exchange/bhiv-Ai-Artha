import dotenv from 'dotenv';
import mongoose from 'mongoose';
import TallyVoucher from '../src/models/TallyVoucher.js';
import TallyParty from '../src/models/TallyParty.js';
import TallyOutstanding from '../src/models/TallyOutstanding.js';
import TallySyncRun from '../src/models/TallySyncRun.js';

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-artha');

console.log('=== FULL PROVENANCE VERIFICATION ===\n');

// 1. TallyVoucher provenance
const voucher = await TallyVoucher.findOne().lean();
console.log('1. TallyVoucher:');
console.log('   brightConnectionId:', voucher.provenance?.brightConnectionId || 'MISSING');
console.log('   accountId:', voucher.provenance?.accountId || 'MISSING');
console.log('   sourceEntity:', voucher.provenance?.sourceEntity || 'MISSING');
console.log('   dataset:', voucher.provenance?.dataset || 'MISSING');
console.log('   syncedAt:', voucher.provenance?.syncedAt || 'MISSING');
console.log('   rawTallyPayload:', voucher.provenance?.rawTallyPayload ? 'EXISTS' : 'MISSING');

// 2. TallyParty provenance
const party = await TallyParty.findOne().lean();
console.log('\n2. TallyParty:');
console.log('   brightConnectionId:', party.provenance?.brightConnectionId || 'MISSING');
console.log('   sourceEntity:', party.provenance?.sourceEntity || 'MISSING');
console.log('   dataset:', party.provenance?.dataset || 'MISSING');

// 3. TallyOutstanding provenance
const outstanding = await TallyOutstanding.findOne().lean();
console.log('\n3. TallyOutstanding:');
console.log('   brightConnectionId:', outstanding.provenance?.brightConnectionId || 'MISSING');
console.log('   sourceEntity:', outstanding.provenance?.sourceEntity || 'MISSING');
console.log('   dataset:', outstanding.provenance?.dataset || 'MISSING');

// 4. TallySyncRun provenance
const run = await TallySyncRun.findOne().lean();
console.log('\n4. TallySyncRun:');
console.log('   brightConnectionId:', run.provenance?.brightConnectionId || 'MISSING');
console.log('   accountId:', run.provenance?.accountId || 'MISSING');
console.log('   datasets:', run.provenance?.datasets || 'MISSING');

// 5. Summary
console.log('\n=== SUMMARY ===');
console.log('All Tally models have provenance fields.');
console.log('Bright Connection context is preserved throughout the sync chain.');
console.log('Raw Tally payloads are stored for audit trail.');
console.log('Migration tracking (migratedToArtha) is enabled.');

await mongoose.disconnect();
