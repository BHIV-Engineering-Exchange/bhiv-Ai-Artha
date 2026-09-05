import express from 'express';
import {
  createAgent,
  getAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
  getAgentDashboard,
  getAgentPerformance,
  assignDealer,
  unassignDealer,
  getAgentMap,
} from '../controllers/salesAgent.controller.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/map', getAgentMap);
router.get('/', getAgents);
router.post('/', authorize('admin'), createAgent);
router.get('/:id', getAgentById);
router.put('/:id', authorize('admin', 'accountant'), updateAgent);
router.delete('/:id', authorize('admin'), deleteAgent);
router.get('/:id/dashboard', getAgentDashboard);
router.get('/:id/performance', getAgentPerformance);
router.post('/:agentId/assign-dealer/:dealerId', authorize('admin', 'accountant'), assignDealer);
router.delete('/:agentId/unassign-dealer/:dealerId', authorize('admin', 'accountant'), unassignDealer);

export default router;
