import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

const validateDecimal = {
  validator: (v) => v === '' || v === null || v === undefined || (!isNaN(Number(v)) && isFinite(Number(v)) && Number(v) >= 0),
  message: '{VALUE} is not a valid non-negative decimal amount',
};

const journalLineSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: randomUUID,
      unique: true,
      index: true,
    },
    journal_id: {
      type: String,
      required: true,
      index: true,
    },
    account_id: {
      type: String,
      required: true,
      index: true,
    },
    debit: {
      type: String,
      default: '0',
      validate: validateDecimal,
    },
    credit: {
      type: String,
      default: '0',
      validate: validateDecimal,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('JournalLine', journalLineSchema);
