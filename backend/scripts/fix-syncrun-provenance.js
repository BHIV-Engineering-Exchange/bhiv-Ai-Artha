import dotenv from 'dotenv';
import mongoose from 'mongoose';
import TallySyncRun from '../src/models/TallySyncRun.js';

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-artha');

const result = await TallySyncRun.updateMany(
  { provenance: { $exists: false } },
  { $set: {
    provenance: {
      brightConnectionId: 'bc_bright_connection_001',
      accountId: 'acct_bright_connection',
      storeId: '',
      storeName: '',
      datasets: ['parties', 'outstanding', 'vouchers'],
      rawPayloadReceived: 0,
      rawPayloadSize: 0,
    }
  }}
);
console.log('Updated TallySyncRuns:', result.modifiedCount);

const run = await TallySyncRun.findOne().lean();
console.log('TallySyncRun provenance:', run.provenance ? 'EXISTS' : 'MISSING');
console.log('  brightConnectionId:', run.provenance?.brightConnectionId);

await mongoose.disconnect();
