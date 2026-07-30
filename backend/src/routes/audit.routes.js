import express from 'express';
import auditController from '../controllers/audit.controller.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/trail/:entityType/:entityId', authorize('admin', 'accountant', 'viewer'), auditController.getEntityAuditTrail);
router.get('/summary', authorize('admin', 'accountant', 'viewer'), auditController.getAuditSummary);
router.get('/verify-chain', authorize('admin', 'accountant', 'viewer'), auditController.verifyAuditChain);
router.get('/export', authorize('admin'), auditController.exportAuditTrail);

export default router;
