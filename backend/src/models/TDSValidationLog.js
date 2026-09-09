import mongoose from 'mongoose';

const tdsValidationErrorSchema = new mongoose.Schema({
  code: String,
  severity: String,
  reference_id: String,
  message: String,
}, { _id: false });

const tdsValidationLogSchema = new mongoose.Schema({
  quarter: {
    type: String,
    enum: ['Q1', 'Q2', 'Q3', 'Q4'],
  },
  financialYear: String,
  generatedAt: {
    type: Date,
    default: Date.now,
  },
  filing_ready: {
    type: Boolean,
    default: false,
  },
  errors: [tdsValidationErrorSchema],
}, {
  timestamps: true,
  suppressReservedKeysWarning: true,
});

tdsValidationLogSchema.index({ quarter: 1, financialYear: 1 });

export default mongoose.model('TDSValidationLog', tdsValidationLogSchema);
