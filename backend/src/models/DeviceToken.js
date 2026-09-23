import mongoose from 'mongoose';

const deviceTokenSchema = new mongoose.Schema({
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesAgent',
    default: null,
    index: true,
  },
  agentName: {
    type: String,
    default: 'web-user',
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

deviceTokenSchema.set('toJSON', { virtuals: true });

export default mongoose.model('DeviceToken', deviceTokenSchema);
