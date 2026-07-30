/**
 * governance.routes.js
 *
 * Runtime governance API routes.
 * Exposes verification, replay, provenance, adversarial testing,
 * deployment evidence, decision ledger, and SETU dispatch endpoints.
 *
 * All routes require authentication.
 */

import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import capabilityRegistry from '../services/capabilityRegistry.service.js';
import provenanceChain from '../services/provenanceChain.service.js';
import deterministicReplay from '../services/deterministicReplay.service.js';
import circuitBreaker from '../services/circuitBreaker.service.js';
import independentVerifier from '../services/independentVerifier.service.js';
import deploymentEvidence from '../services/deploymentEvidence.service.js';
import adversarialSuite from '../services/adversarialSuite.service.js';
import decisionLedger from '../services/decisionLedger.service.js';
import lineage from '../services/lineage.service.js';
import setuDispatch from '../services/setuDispatch.service.js';
import logger from '../config/logger.js';

const router = express.Router();

// ─── Capability Registry ─────────────────────────────────────────────────

router.get('/capabilities', protect, (req, res) => {
  try {
    const metadata = capabilityRegistry.getRegistryMetadata();
    res.json({ success: true, data: metadata });
  } catch (err) {
    logger.error('Governance capabilities error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/capabilities/:capabilityId', protect, (req, res) => {
  try {
    const cap = capabilityRegistry.getCapability(req.params.capabilityId);
    if (!cap) {
      return res.status(404).json({ success: false, message: 'Capability not found' });
    }
    res.json({ success: true, data: cap });
  } catch (err) {
    logger.error('Governance capability error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/capabilities/verify', protect, (req, res) => {
  try {
    const results = capabilityRegistry.verifyAllContracts();
    const allValid = Object.values(results).every(r => r.valid);
    res.json({
      success: true,
      data: { all_valid: allValid, results },
    });
  } catch (err) {
    logger.error('Governance verify error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/capabilities/resolve', protect, (req, res) => {
  try {
    const { method, path } = req.query;
    const resolution = capabilityRegistry.resolveRoute(method || 'GET', path || '/');
    res.json({ success: true, data: resolution });
  } catch (err) {
    logger.error('Governance resolve error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Provenance Chain ────────────────────────────────────────────────────

router.get('/provenance/status', protect, (req, res) => {
  try {
    const state = provenanceChain.getChain();
    const integrity = provenanceChain.verifyIntegrity();
    res.json({
      success: true,
      data: { state, integrity },
    });
  } catch (err) {
    logger.error('Governance provenance error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/provenance/verify', protect, (req, res) => {
  try {
    const result = provenanceChain.verifyIntegrity();
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Governance provenance verify error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Deterministic Replay ────────────────────────────────────────────────

router.get('/replay/statistics', protect, (req, res) => {
  try {
    const stats = deterministicReplay.getStatistics();
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Governance replay error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/replay/:replayId', protect, (req, res) => {
  try {
    const data = deterministicReplay.getReplayData(req.params.replayId);
    if (!data.found) {
      return res.status(404).json({ success: false, message: data.error });
    }
    res.json({ success: true, data });
  } catch (err) {
    logger.error('Governance replay get error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/replay/:replayId/proof', protect, (req, res) => {
  try {
    const proof = deterministicReplay.generateReplayProof(req.params.replayId);
    if (!proof.valid && proof.error) {
      return res.status(404).json({ success: false, message: proof.error });
    }
    res.json({ success: true, data: proof });
  } catch (err) {
    logger.error('Governance replay proof error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/replay/:replayId/verify', protect, (req, res) => {
  try {
    const { actualOutput } = req.body;
    const result = deterministicReplay.verifyReplay(req.params.replayId, actualOutput);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Governance replay verify error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Circuit Breakers ────────────────────────────────────────────────────

router.get('/circuit-breakers', protect, (req, res) => {
  try {
    const status = circuitBreaker.getStatus();
    const openCircuits = circuitBreaker.getOpenCircuits();
    res.json({
      success: true,
      data: { status, open_circuits: openCircuits },
    });
  } catch (err) {
    logger.error('Governance circuit breaker error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/circuit-breakers/:name/reset', protect, authorize('admin'), (req, res) => {
  try {
    circuitBreaker.forceReset(req.params.name);
    res.json({ success: true, message: `Circuit breaker ${req.params.name} reset` });
  } catch (err) {
    logger.error('Governance circuit breaker reset error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Independent Verification ────────────────────────────────────────────

router.get('/verification/run', protect, authorize('admin'), async (req, res) => {
  try {
    const results = await independentVerifier.runVerificationSuite({
      triggered_by: req.user?.email || 'unknown',
    });
    res.json({ success: true, data: results });
  } catch (err) {
    logger.error('Governance verification error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/verification/history', protect, (req, res) => {
  try {
    const history = independentVerifier.getVerificationHistory();
    res.json({ success: true, data: history });
  } catch (err) {
    logger.error('Governance verification history error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Adversarial Testing ────────────────────────────────────────────────

router.get('/adversarial/run', protect, authorize('admin'), async (req, res) => {
  try {
    const results = await adversarialSuite.runFullSuite({
      triggered_by: req.user?.email || 'unknown',
    });
    res.json({ success: true, data: results });
  } catch (err) {
    logger.error('Governance adversarial error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/adversarial/history', protect, (req, res) => {
  try {
    const history = adversarialSuite.getTestHistory();
    res.json({ success: true, data: history });
  } catch (err) {
    logger.error('Governance adversarial history error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Deployment Evidence ─────────────────────────────────────────────────

router.get('/evidence/manifest', protect, (req, res) => {
  try {
    const manifest = deploymentEvidence.generateManifest();
    res.json({ success: true, data: manifest });
  } catch (err) {
    logger.error('Governance evidence error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/evidence/:category', protect, (req, res) => {
  try {
    const evidence = deploymentEvidence.getEvidenceByCategory(req.params.category);
    res.json({ success: true, data: evidence });
  } catch (err) {
    logger.error('Governance evidence category error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Comprehensive Governance Status ─────────────────────────────────────

router.get('/status', protect, async (req, res) => {
  try {
    const [verification, circuitStatus, replayStats, provenance, capabilities, decisionStats, lineageStats] = await Promise.all([
      independentVerifier.runVerificationSuite({ triggered_by: 'governance-status' }).catch(() => null),
      circuitBreaker.getStatus(),
      deterministicReplay.getStatistics(),
      provenanceChain.verifyIntegrity().catch(() => ({ valid: false, error: 'Not initialized' })),
      capabilityRegistry.getRegistryMetadata(),
      decisionLedger.getDecisionStats().catch(() => ({ total: 0, by_type: [] })),
      lineage.getLineageStats().catch(() => ({ total: 0 })),
    ]);

    res.json({
      success: true,
      data: {
        governance_status: 'operational',
        timestamp: new Date().toISOString(),
        capabilities,
        circuit_breakers: circuitStatus,
        replay_statistics: replayStats,
        provenance_integrity: provenance,
        decision_ledger: decisionStats,
        lineage: lineageStats,
        last_verification: verification ? {
          suite_id: verification.suite_id,
          overall: verification.overall,
          passed: verification.passed,
          total: verification.total_tests,
        } : null,
      },
    });
  } catch (err) {
    logger.error('Governance status error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Decision Ledger ─────────────────────────────────────────────────────

router.get('/decision-ledger/history', protect, async (req, res) => {
  try {
    const filters = {
      decision_type: req.query.decision_type,
      outcome: req.query.outcome,
      capability_id: req.query.capability_id,
      limit: parseInt(req.query.limit) || 100,
    };
    const history = await decisionLedger.getDecisionHistory(filters);
    res.json({ success: true, data: history });
  } catch (err) {
    logger.error('Decision ledger history error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/decision-ledger/stats', protect, async (req, res) => {
  try {
    const stats = await decisionLedger.getDecisionStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Decision ledger stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/decision-ledger/verify', protect, async (req, res) => {
  try {
    const result = await decisionLedger.verifyChainIntegrity();
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Decision ledger verify error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Distributed Replay ──────────────────────────────────────────────────

router.get('/replay/distributed/:replayId', protect, (req, res) => {
  try {
    const data = deterministicReplay.getReplayData(req.params.replayId);
    if (!data.found) {
      return res.status(404).json({ success: false, message: data.error });
    }
    res.json({ success: true, data });
  } catch (err) {
    logger.error('Distributed replay get error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/replay/distributed/:replayId/verify', protect, (req, res) => {
  try {
    const { actualState } = req.body;
    const result = deterministicReplay.verifyDistributedReplay(req.params.replayId, actualState);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Distributed replay verify error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Lineage ─────────────────────────────────────────────────────────────

router.get('/lineage/stats', protect, async (req, res) => {
  try {
    const stats = await lineage.getLineageStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Lineage stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/lineage/entity/:entityType/:entityId', protect, async (req, res) => {
  try {
    const lineageData = await lineage.getEntityLineage(req.params.entityType, req.params.entityId);
    res.json({ success: true, data: lineageData });
  } catch (err) {
    logger.error('Lineage entity error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/lineage/trace/:traceId', protect, async (req, res) => {
  try {
    const lineageData = await lineage.getTraceLineage(req.params.traceId);
    res.json({ success: true, data: lineageData });
  } catch (err) {
    logger.error('Lineage trace error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/lineage/verify/:traceId', protect, async (req, res) => {
  try {
    const result = await lineage.verifyTraceLineageIntegrity(req.params.traceId);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Lineage verify error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SETU Dispatch ───────────────────────────────────────────────────────

router.get('/setu/stats', protect, async (req, res) => {
  try {
    const stats = await setuDispatch.getDispatchStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('SETU stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/setu/dispatch/:dispatchId', protect, async (req, res) => {
  try {
    const dispatch = await setuDispatch.getDispatch(req.params.dispatchId);
    if (!dispatch) {
      return res.status(404).json({ success: false, message: 'Dispatch not found' });
    }
    res.json({ success: true, data: dispatch });
  } catch (err) {
    logger.error('SETU dispatch error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/setu/trace/:traceId', protect, async (req, res) => {
  try {
    const dispatches = await setuDispatch.getDispatchesByTrace(req.params.traceId);
    res.json({ success: true, data: dispatches });
  } catch (err) {
    logger.error('SETU trace error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/setu/retry/:dispatchId', protect, authorize('admin'), async (req, res) => {
  try {
    const result = await setuDispatch.retryDispatch(req.params.dispatchId);
    res.json({ success: result.success, data: result });
  } catch (err) {
    logger.error('SETU retry error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
