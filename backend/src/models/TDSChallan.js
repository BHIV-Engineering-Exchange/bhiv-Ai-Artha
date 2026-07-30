import mongoose from 'mongoose';

const validateDecimal = {
  validator: (v) => v === '' || v === null || v === undefined || (!isNaN(Number(v)) && isFinite(Number(v))),
  message: '{VALUE} is not a valid decimal amount',
};

const tdsChallanSchema = new mongoose.Schema({
  challanNumber: {
    type: String,
    required: true,
    index: true,
  },
  challanDate: {
    type: Date,
    required: true,
  },
  bankBSR: String,
  bankName: String,
  amount: {
    type: String,
    required: true,
    validate: validateDecimal,
  },
  section: {
    type: String,
  },
  quarter: {
    type: String,
    enum: ['Q1', 'Q2', 'Q3', 'Q4'],
  },
  financialYear: String,
  tdsEntries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TDSEntry',
  }],
  status: {
    type: String,
    enum: ['created', 'linked', 'filed'],
    default: 'created',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

tdsChallanSchema.index({ quarter: 1, financialYear: 1 });

tdsChallanSchema.index({ status: 1 });

export default mongoose.model('TDSChallan', tdsChallanSchema);
