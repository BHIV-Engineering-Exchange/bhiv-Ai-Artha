import express from 'express';
import {
  recordPing,
  getAgentLocation,
  getAllAgentLocations,
  getAgentRoute,
  checkIn,
  checkOut,
  getActiveVisits,
  getVisits,
} from '../controllers/niyantran.controller.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/ping', recordPing);
router.get('/agents/location', getAllAgentLocations);
router.get('/agents/:agentId/location', getAgentLocation);
router.get('/agents/:agentId/route', getAgentRoute);
router.post('/visit/check-in', checkIn);
router.put('/visit/:visitId/check-out', checkOut);
router.get('/visits/active', getActiveVisits);
router.get('/visits', getVisits);

export default router;
