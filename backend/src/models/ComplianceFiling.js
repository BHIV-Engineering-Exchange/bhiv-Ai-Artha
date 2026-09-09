import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

const filingSourceSchema = new mongoose.Schema({
  sourceType: {
    type: String,
    enum: ['JournalEntry', 'TDSEntry', 'TDSChallan', 'Other'],
    required: true,
  },
  sourceId: {
    type: String,
    required: true,
  },
}, { _id: false });

const complianceFilingSchema = new mongoose.Schema({
  filingId: {
    type: String,
    unique: true,
    default: () => `FIL-${randomUUID()}`,
    immutable: true,
    index: true,
  },
  filingType: {
    type: String,
    required: true,
    enum: ['GSTR-1', 'GSTR-3B', 'FORM-26Q', 'FORM-24Q'],
    immutable: true,
    index: true,
  },
  period: {
    startDate: Date,
    endDate: Date,
    month: Number,
    year: Number,
    quarter: String,
  },
  gstin: String,
  tan: String,
  traceId: {
    type: String,
    required: true,
    immutable: true,
    index: true,
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  schemaVersion: {
    type: String,
    required: true,
    immutable: true,
  },
  generatedAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
  sourceTransactions: [filingSourceSchema],
  jsonData: mongoose.Schema.Types.Mixed,
  exportMetadata: {
    csvRows: Number,
    csvHeaders: [String],
  },

  // Submission tracking
  submission_status: {
    type: String,
    enum: ['DRAFT', 'VALIDATED', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'RESUBMISSION_REQUIRED'],
    default: 'DRAFT',
    index: true,
  },
  submitted_at: Date,
  submitted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  setu_reference: String,
  setu_ack_status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'TIMEOUT', 'UNKNOWN'],
    default: 'PENDING',
  },
  setu_dispatch_id: String,

  // Submission attempts
  submission_attempts: [{
    attempt_number: Number,
    attempted_at: Date,
    status: String,
    response_status: Number,
    response_body: mongoose.Schema.Types.Mixed,
    proof_id: String,
  }],
  retry_count: { type: Number, default: 0 },
  max_retries: { type: Number, default: 3 },

  // Immutable snapshot at submission time
  submitted_json_snapshot: mongoose.Schema.Types.Mixed,
}, {
  timestamps: true,
});

complianceFilingSchema.index({ filingType: 1, 'period.year': 1, 'period.month': 1 });
complianceFilingSchema.index({ gstin: 1, tan: 1 });
complianceFilingSchema.index({ traceId: 1, submission_status: 1 });

export default mongoose.model('ComplianceFiling', complianceFilingSchema);
