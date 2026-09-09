import mongoose from 'mongoose';

const validationErrorSchema = new mongoose.Schema({
  code: String,
  severity: String,
  reference_id: String,
  message: String,
}, { _id: false });

const complianceValidationLogSchema = new mongoose.Schema({
  filingId: {
    type: String,
    required: true,
    index: true,
    immutable: true,
  },
  filingType: {
    type: String,
    required: true,
    immutable: true,
  },
  period: {
    startDate: Date,
    endDate: Date,
    month: Number,
    year: Number,
    quarter: String,
  },
  traceId: {
    type: String,
    required: true,
    immutable: true,
  },
  generatedAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
  filing_ready: {
    type: Boolean,
    default: false,
  },
  errors: [validationErrorSchema],
}, {
  timestamps: true,
  suppressReservedKeysWarning: true,
});

complianceValidationLogSchema.index({ filingType: 1, 'period.year': 1, 'period.month': 1 });

export default mongoose.model('ComplianceValidationLog', complianceValidationLogSchema);
