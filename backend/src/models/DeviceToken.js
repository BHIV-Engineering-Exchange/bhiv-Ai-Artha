import mongoose from 'mongoose';

const deviceTokenSchema = new mongoose.Schema({
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
  token: {
    type: String,
    required: true,
    unique: true,
  },
  platform: {
    type: String,
    enum: ['android', 'ios', 'web', 'fcm', 'expo'],
    default: 'web',
  },
  deviceId: {
    type: String,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastUsedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

deviceTokenSchema.index({ agentId: 1, isActive: 1 });
deviceTokenSchema.index({ token: 1 }, { unique: true });

deviceTokenSchema.set('toJSON', { virtuals: true });

export default mongoose.model('DeviceToken', deviceTokenSchema);
