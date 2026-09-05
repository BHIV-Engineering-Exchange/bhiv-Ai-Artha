import express from 'express';
import {
  sendNotification,
  sendBulkNotification,
  getNotifications,
  markRead,
  markAllRead,
  getUnreadCount,
  registerDeviceToken,
  removeDeviceToken,
} from '../controllers/notification.controller.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/send', authorize('admin', 'accountant'), sendNotification);
router.post('/send-bulk', authorize('admin'), sendBulkNotification);
router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/:id/read', markRead);
router.put('/read-all', markAllRead);
router.post('/device-token', registerDeviceToken);
router.delete('/device-token/:token', removeDeviceToken);

export default router;
