import express from 'express';
import {
  generateGSTR1,
  generateGSTR3B,
  getGSTReturns,
  fileGSTReturn,
  validateGSTIN,
  getGSTSummary as getGSTSummaryController,
} from '../controllers/gst.controller.js';
import {
  getGSTR1FilingPacket,
  getGSTR3BFilingPacket,
  exportFilingPacket,
} from '../controllers/gstFiling.controller.js';
import { protect, authorize } from '../middleware/auth.js';
import { auditLogger } from '../middleware/security.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Routes
router.route('/gstr1/generate').post(
  authorize('accountant', 'admin'),
  auditLogger('gst.gstr1_generated', 'GSTReturn'),
  generateGSTR1
);

router.route('/gstr3b/generate').post(
  authorize('accountant', 'admin'),
  auditLogger('gst.gstr3b_generated', 'GSTReturn'),
  generateGSTR3B
);

router.route('/returns').get(getGSTReturns);

router.route('/returns/:id/file').post(
  authorize('accountant', 'admin'),
  auditLogger('gst.return_filed', 'GSTReturn'),
  fileGSTReturn
);

router.route('/validate-gstin').post(validateGSTIN);

// GST Summary for dashboard
router.route('/summary').get(getGSTSummaryController);

// GST Filing routes
router.route('/filing-packet/gstr-1').get(
  authorize('accountant', 'admin', 'viewer'),
  getGSTR1FilingPacket
);

router.route('/filing-packet/gstr-3b').get(
  authorize('accountant', 'admin', 'viewer'),
  getGSTR3BFilingPacket
);

router.route('/filing-packet/export').get(
  authorize('accountant', 'admin'),
  exportFilingPacket
);

export default router;