import express from 'express';
import bankingController from '../controllers/banking.controller.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/payments', authorize('admin', 'accountant'), bankingController.initiatePayment);
router.get('/payments', authorize('admin', 'accountant', 'viewer'), bankingController.getPayments);
router.get('/payments/:id', authorize('admin', 'accountant', 'viewer'), bankingController.getPaymentStatus);
router.post('/payments/:id/process', authorize('admin'), bankingController.processPayment);
router.post('/payments/:id/retry', authorize('admin', 'accountant'), bankingController.retryPayment);
router.post('/payments/:id/reverse', authorize('admin'), bankingController.reversePayment);
router.post('/payments/recover-failed', authorize('admin'), bankingController.recoverFailedPayments);

router.post('/statements/:id/auto-match', authorize('admin', 'accountant'), bankingController.autoMatchTransactions);
router.post('/statements/:id/reconcile', authorize('admin'), bankingController.reconcileBankStatement);

export default router;
