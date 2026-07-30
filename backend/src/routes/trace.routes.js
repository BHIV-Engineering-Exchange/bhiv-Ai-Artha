import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import traceabilityService from '../services/traceability.service.js';
import runtimeProofService from '../services/runtimeProof.service.js';
import logger from '../config/logger.js';

const router = express.Router();

router.get('/search', protect, async (req, res) => {
  try {
    const filters = req.query;
    const results = await traceabilityService.searchTraces(filters);
    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Search traces error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/statistics', protect, authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const stats = await traceabilityService.getStatistics();
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Get trace statistics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/proofs/report', protect, authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const filters = req.query;
    const report = await runtimeProofService.generateReport(filters);
    res.json({ success: true, data: report });
  } catch (error) {
    logger.error('Generate proof report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/proofs/:proofId/verify', protect, authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const { proofId } = req.params;
    const result = await runtimeProofService.verifyProof(proofId, req.user._id);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Verify proof error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:traceId', protect, async (req, res) => {
  try {
    const { traceId } = req.params;
    const chain = await traceabilityService.getFullChain(traceId);
    res.json({ success: true, data: chain });
  } catch (error) {
    logger.error('Get trace chain error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:traceId/lineage', protect, async (req, res) => {
  try {
    const { traceId } = req.params;
    const lineage = await traceabilityService.reconstructLineage(traceId);
    res.json({ success: true, data: lineage });
  } catch (error) {
    logger.error('Reconstruct lineage error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:traceId/replay', protect, authorize('admin', 'accountant'), async (req, res) => {
  try {
    const { traceId } = req.params;
    const replay = await traceabilityService.replayTrace(traceId, req.user._id);
    res.json({ success: true, data: replay });
  } catch (error) {
    logger.error('Replay trace error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:traceId/continuity', protect, async (req, res) => {
  try {
    const { traceId } = req.params;
    const trace = await traceabilityService.getFullChain(traceId);
    res.json({
      success: true,
      data: {
        trace_id: traceId,
        continuity: trace.continuity_verified,
        stages: trace.trace.stages,
        linked_entities: trace.trace.linked_entities,
      },
    });
  } catch (error) {
    logger.error('Verify continuity error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:traceId/proofs', protect, async (req, res) => {
  try {
    const { traceId } = req.params;
    const proofs = await runtimeProofService.getProofsForTrace(traceId);
    res.json({ success: true, data: proofs });
  } catch (error) {
    logger.error('Get trace proofs error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:traceId/proof/terminal', protect, authorize('admin', 'accountant'), async (req, res) => {
  try {
    const { traceId } = req.params;
    const { output, metadata } = req.body;
    const proof = await runtimeProofService.captureTerminalLog({
      trace_id: traceId, output, metadata,
    });
    res.json({ success: true, data: proof.getSummary() });
  } catch (error) {
    logger.error('Capture terminal log error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:traceId/proof/curl', protect, authorize('admin', 'accountant'), async (req, res) => {
  try {
    const { traceId } = req.params;
    const { curl_command, output, exit_code } = req.body;
    const proof = await runtimeProofService.captureCurlOutput({
      trace_id: traceId, curl_command, output, exit_code,
    });
    res.json({ success: true, data: proof.getSummary() });
  } catch (error) {
    logger.error('Capture curl output error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
