import express from 'express';
import {
  generateGSTR1,
  generateGSTR3B,
  generateForm26Q,
  generateForm24Q,
  createTDSChallan,
  linkTDSChallan,
  groupTDSQuarter,
  generateComplianceSignals,
} from '../controllers/compliance.controller.js';
import { protect, authorize } from '../middleware/auth.js';
import { auditLogger } from '../middleware/security.js';

const router = express.Router();

router.use(protect);

router.get('/gst/gstr-1', authorize('accountant', 'admin', 'viewer'), auditLogger('compliance.gstr1_generated', 'ComplianceFiling'), generateGSTR1);
router.get('/gst/gstr-3b', authorize('accountant', 'admin', 'viewer'), auditLogger('compliance.gstr3b_generated', 'ComplianceFiling'), generateGSTR3B);

router.get('/tds/form26q', authorize('accountant', 'admin', 'viewer'), auditLogger('compliance.form26q_generated', 'ComplianceFiling'), generateForm26Q);
router.get('/tds/form24q', authorize('accountant', 'admin', 'viewer'), auditLogger('compliance.form24q_generated', 'ComplianceFiling'), generateForm24Q);

router.post('/tds/challans', authorize('accountant', 'admin'), auditLogger('tds.challan_created', 'TDSChallan'), createTDSChallan);
router.post('/tds/challans/:id/link', authorize('accountant', 'admin'), auditLogger('tds.challan_linked', 'TDSChallan'), linkTDSChallan);
router.get('/tds/group', authorize('accountant', 'admin', 'viewer'), auditLogger('tds.quarter_grouped', 'TDSQuarterlyGroup'), groupTDSQuarter);

router.get('/signals', authorize('accountant', 'admin', 'viewer'), generateComplianceSignals);

export default router;
