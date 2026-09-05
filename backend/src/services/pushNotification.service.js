import Notification from '../models/Notification.js';
import DeviceToken from '../models/DeviceToken.js';
import SalesAgent from '../models/SalesAgent.js';
import logger from '../config/logger.js';

class PushNotificationService {
  constructor() {
    this.webPushAvailable = false;
    this.init();
  }

  async init() {
    try {
      const webPush = await import('web-push');
      this.webPush = webPush.default;
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        this.webPush.setVapidDetails(
          'mailto:admin@artha.blackholeinfiverse.com',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );
        this.webPushAvailable = true;
        logger.info('Push notifications: VAPID keys configured');
      } else {
        logger.info('Push notifications: VAPID keys not set, push disabled (notifications still stored)');
      }
    } catch {
      logger.info('Push notifications: web-push not installed, notifications stored but not pushed');
    }
  }

  async sendNotification(data) {
    const notification = await Notification.create({
      title: data.title,
      body: data.body,
      type: data.type || 'info',
      category: data.category || 'system',
      recipientId: data.recipientId || null,
      recipientRole: data.recipientRole || 'all',
      data: data.data || {},
      priority: data.priority || 'normal',
      expiresAt: data.expiresAt || null,
    });

    if (data.recipientId && this.webPushAvailable) {
      try {
        await this.pushToDevice(data.recipientId, notification);
        notification.isPushed = true;
        notification.pushedAt = new Date();
        await notification.save();
      } catch (err) {
        notification.pushError = err.message;
        await notification.save();
        logger.warn(`Push failed for agent ${data.recipientId}: ${err.message}`);
      }
    }

    return notification;
  }

  async pushToDevice(agentId, notification) {
    const tokens = await DeviceToken.find({ agentId, isActive: true });
    if (tokens.length === 0) return;

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      type: notification.type,
      category: notification.category,
      data: notification.data,
      notificationId: notification._id,
    });

    const results = [];
    for (const device of tokens) {
      try {
        if (device.platform === 'web' && device.token.startsWith('http')) {
          await this.webPush.sendNotification(
            JSON.parse(device.token),
            payload
          );
          results.push({ deviceId: device._id, success: true });
          device.lastUsedAt = new Date();
          await device.save();
        }
      } catch (err) {
        if (err.statusCode === 410) {
          device.isActive = false;
          await device.save();
        }
        results.push({ deviceId: device._id, success: false, error: err.message });
      }
    }

    return results;
  }

  async sendBulkNotification(data, recipientIds) {
    const results = [];
    for (const recipientId of recipientIds) {
      try {
        const notif = await this.sendNotification({ ...data, recipientId });
        results.push({ recipientId, success: true, id: notif._id });
      } catch (err) {
        results.push({ recipientId, success: false, error: err.message });
      }
    }
    return results;
  }

  async sendLocationAlert(agentId, agentName, event, dealerName) {
    const titles = {
      'arrived': `${agentName} arrived at ${dealerName}`,
      'left': `${agentName} left ${dealerName}`,
      'idle': `${agentName} idle for 15+ minutes`,
      'offline': `${agentName} went offline`,
      'online': `${agentName} is back online`,
    };

    return this.sendNotification({
      title: titles[event] || `${agentName}: ${event}`,
      body: `Location event: ${event} at ${new Date().toLocaleTimeString()}`,
      type: 'location',
      category: 'niyantran',
      recipientId: agentId,
      data: { event, agentName, dealerName, timestamp: new Date().toISOString() },
      priority: event === 'offline' ? 'high' : 'normal',
    });
  }

  async sendPaymentNotification(agentId, dealerName, amount, type) {
    return this.sendNotification({
      title: `${type === 'received' ? 'Payment received' : 'Payment pending'}: ${dealerName}`,
      body: `Amount: ₹${amount.toLocaleString('en-IN')}`,
      type: 'payment',
      category: 'finance',
      recipientId: agentId,
      data: { dealerName, amount, type },
      priority: 'high',
    });
  }

  async sendOverdueAlert(agentId, dealerName, overdueDays, amount) {
    return this.sendNotification({
      title: `Overdue: ${dealerName}`,
      body: `${overdueDays} days overdue - ₹${amount.toLocaleString('en-IN')}`,
      type: 'overdue',
      category: 'finance',
      recipientId: agentId,
      data: { dealerName, overdueDays, amount },
      priority: 'urgent',
    });
  }

  async getNotifications(agentId, { page = 1, limit = 20, unreadOnly = false, type, category } = {}) {
    const query = {};
    if (agentId) query.recipientId = agentId;
    if (unreadOnly) query.isRead = false;
    if (type) query.type = type;
    if (category) query.category = category;

    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      notifications,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async markRead(notificationId, agentId) {
    const update = { isRead: true, readAt: new Date() };
    const query = { _id: notificationId };
    if (agentId) query.recipientId = agentId;
    return Notification.findOneAndUpdate(query, update, { new: true });
  }

  async markAllRead(agentId) {
    const query = { isRead: false };
    if (agentId) query.recipientId = agentId;
    return Notification.updateMany(query, { isRead: true, readAt: new Date() });
  }

  async getUnreadCount(agentId) {
    const query = { isRead: false };
    if (agentId) query.recipientId = agentId;
    return Notification.countDocuments(query);
  }

  async registerDeviceToken(agentId, agentName, token, platform, deviceId) {
    return DeviceToken.findOneAndUpdate(
      { token },
      { agentId, agentName, platform, deviceId, isActive: true, lastUsedAt: new Date() },
      { upsert: true, new: true }
    );
  }

  async removeDeviceToken(token) {
    return DeviceToken.findOneAndUpdate({ token }, { isActive: false });
  }
}

export default new PushNotificationService();
