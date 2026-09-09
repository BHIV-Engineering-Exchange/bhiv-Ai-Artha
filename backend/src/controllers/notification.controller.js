import pushNotificationService from '../services/pushNotification.service.js';
import logger from '../config/logger.js';

export const sendNotification = async (req, res) => {
  try {
    const notification = await pushNotificationService.sendNotification(req.body);
    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    logger.error('Send notification error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const sendBulkNotification = async (req, res) => {
  try {
    const { recipientIds, ...data } = req.body;
    const results = await pushNotificationService.sendBulkNotification(data, recipientIds);
    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Send bulk notification error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getNotifications = async (req, res) => {
  try {
    const { page, limit, unreadOnly, type, category } = req.query;
    const result = await pushNotificationService.getNotifications({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      unreadOnly: unreadOnly === 'true',
      type,
      category,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const markRead = async (req, res) => {
  try {
    const notification = await pushNotificationService.markRead(req.params.id);
    res.json({ success: true, data: notification });
  } catch (error) {
    logger.error('Mark read error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const markAllRead = async (req, res) => {
  try {
    await pushNotificationService.markAllRead();
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('Mark all read error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const count = await pushNotificationService.getUnreadCount();
    res.json({ success: true, data: { count } });
  } catch (error) {
    logger.error('Get unread count error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const registerDeviceToken = async (req, res) => {
  try {
    const { agentId, agentName, token, platform, deviceId } = req.body;
    const device = await pushNotificationService.registerDeviceToken(agentId, agentName, token, platform, deviceId);
    res.json({ success: true, data: device });
  } catch (error) {
    logger.error('Register device token error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const removeDeviceToken = async (req, res) => {
  try {
    await pushNotificationService.removeDeviceToken(req.params.token);
    res.json({ success: true, message: 'Device token removed' });
  } catch (error) {
    logger.error('Remove device token error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};
