import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  sendChatMessage,
  analyzeData,
  getInsights,
  analyzeStatement,
  getMitraHealth,
  getCapabilities,
} from '../controllers/mitra.controller.js';

const router = Router();

router.use(protect);

router.post('/chat', sendChatMessage);
router.post('/analyze', authorize('admin', 'accountant'), analyzeData);
router.post('/analyze-statement', authorize('admin', 'accountant'), analyzeStatement);
router.get('/insights', authorize('admin', 'accountant'), getInsights);
router.get('/capabilities', getCapabilities);
router.get('/health', getMitraHealth);

export default router;
