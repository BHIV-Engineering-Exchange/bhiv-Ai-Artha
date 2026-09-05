import mongoose from 'mongoose';

const visitSchema = new mongoose.Schema({
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesAgent',
    required: true,
    index: true,
  },
  agentName: {
    type: String,
    required: true,
  },
  dealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dealer',
    default: null,
    index: true,
  },
  dealerName: {
    type: String,
    default: '',
  },
  visitType: {
    type: String,
    enum: ['check-in', 'delivery', 'collection', 'service', 'meeting', 'follow-up'],
    default: 'check-in',
  },
  status: {
    type: String,
    enum: ['in-progress', 'completed', 'cancelled', 'missed'],
    default: 'in-progress',
    index: true,
  },
  checkIn: {
    time: { type: Date, default: Date.now },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String, default: '' },
  },
  checkOut: {
    time: { type: Date, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    address: { type: String, default: '' },
  },
  duration: {
    type: Number,
    default: 0,
  },
  purpose: {
    type: String,
    default: '',
  },
  notes: {
    type: String,
    default: '',
  },
  photos: [{
    url: String,
    caption: String,
    timestamp: Date,
  }],
  orders: [{
    product: String,
    quantity: Number,
    amount: Number,
  }],
  totalOrderAmount: {
    type: Number,
    default: 0,
  },
  collectionAmount: {
    type: Number,
    default: 0,
  },
  outcome: {
    type: String,
    enum: ['order-placed', 'payment-collected', 'no-action', 'complaint-raised', 'returned', 'other'],
    default: 'no-action',
  },
  dealerRating: {
    type: Number,
    min: 1,
    max: 5,
    default: null,
  },
  nextVisitDate: {
    type: Date,
    default: null,
  },
  completedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

visitSchema.index({ agentId: 1, createdAt: -1 });
visitSchema.index({ dealerId: 1, createdAt: -1 });
visitSchema.index({ status: 1 });
visitSchema.index({ completedAt: -1 });

visitSchema.set('toJSON', { virtuals: true });

visitSchema.virtual('isOverdue').get(function () {
  if (this.status !== 'in-progress') return false;
  const elapsed = Date.now() - this.checkIn.time.getTime();
  return elapsed > 2 * 60 * 60 * 1000;
});

visitSchema.pre('save', function (next) {
  if (this.checkOut && this.checkOut.time && this.checkIn && this.checkIn.time) {
    this.duration = Math.round((this.checkOut.time - this.checkIn.time) / 60000);
  }
  if (this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  next();
});

export default mongoose.model('Visit', visitSchema);
