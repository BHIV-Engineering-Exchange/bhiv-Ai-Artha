import express from 'express';
import {
  createDealer,
  getDealers,
  getDealerById,
  updateDealer,
  deleteDealer,
  getDealerSummary,
  syncFromTally,
  syncOutstanding,
  getDealerStats,
  getRegions,
  getCities,
} from '../controllers/dealer.controller.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/stats', getDealerStats);
router.get('/regions', getRegions);
router.get('/cities', getCities);
router.post('/sync-tally', authorize('admin'), syncFromTally);
router.post('/sync-outstanding', authorize('admin'), syncOutstanding);
router.get('/', getDealers);
router.post('/', authorize('admin', 'accountant'), createDealer);
router.get('/:id', getDealerById);
router.put('/:id', authorize('admin', 'accountant'), updateDealer);
router.delete('/:id', authorize('admin'), deleteDealer);
router.get('/:id/summary', getDealerSummary);

export default router;
