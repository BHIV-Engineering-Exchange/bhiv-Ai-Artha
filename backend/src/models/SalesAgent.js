import mongoose from 'mongoose';

const salesAgentSchema = new mongoose.Schema({
  agentCode: {
    type: String,
    unique: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    index: true,
  },
  phone: {
    type: String,
    default: '',
  },
  email: {
    type: String,
    default: '',
  },
  role: {
    type: String,
    enum: ['sales-executive', 'sales-manager', 'field-agent', 'distributor', 'admin'],
    default: 'sales-executive',
    index: true,
  },
  region: {
    type: String,
    default: '',
    index: true,
  },
  area: {
    type: String,
    default: '',
  },
  territory: {
    type: String,
    default: '',
  },
  assignedDealers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dealer',
  }],
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesAgent',
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  isLocationTrackingEnabled: {
    type: Boolean,
    default: true,
  },
  lastKnownLocation: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    timestamp: { type: Date, default: null },
    address: { type: String, default: '' },
  },
  totalVisits: {
    type: Number,
    default: 0,
  },
  totalSales: {
    type: Number,
    default: 0,
  },
  targetAmount: {
    type: Number,
    default: 0,
  },
  targetAchieved: {
    type: Number,
    default: 0,
  },
  targetAchievedPercent: {
    type: Number,
    default: 0,
  },
  photo: {
    type: String,
    default: '',
  },
  deviceTokens: [{
    type: String,
  }],
  joinedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

salesAgentSchema.index({ name: 'text', region: 'text', area: 'text' });
salesAgentSchema.index({ 'lastKnownLocation.latitude': 1, 'lastKnownLocation.longitude': 1 });

salesAgentSchema.set('toJSON', { virtuals: true });

salesAgentSchema.virtual('targetProgress').get(function () {
  if (!this.targetAmount) return 0;
  return Math.min(100, Math.round((this.targetAchieved / this.targetAmount) * 100));
});

export default mongoose.model('SalesAgent', salesAgentSchema);
