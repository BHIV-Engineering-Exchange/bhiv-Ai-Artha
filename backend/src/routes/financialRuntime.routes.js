import express from 'express';
import crypto from 'crypto';
import { protect, authorize } from '../middleware/auth.js';
import financialEventStore from '../services/financialEventStore.service.js';
import replayEngine from '../services/replayEngine.service.js';
import financialCapabilityRegistry from '../services/financialCapabilityRegistry.service.js';
import ledgerLockService from '../services/ledgerLock.service.js';
import reportSnapshotService from '../services/reportSnapshot.service.js';
import financialEventEmitter from '../services/financialEventEmitter.service.js';
import financialIntegration from '../services/financialIntegration.service.js';
import replayValidationSuite from '../services/replayValidationSuite.service.js';
import bucketProvenance from '../services/bucketProvenance.service.js';
import logger from '../config/logger.js';

const router = express.Router();
router.use(protect);

// ─── Financial Events ──────────────────────────────────────────────────────

router.get('/events', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const { aggregate_id, event_type, from, to, limit = 100 } = req.query;
    let events;
    if (aggregate_id) {
      events = await financialEventStore.getEventsByAggregate(aggregate_id, { fromTimestamp: from, toTimestamp: to, limit: parseInt(limit) });
    } else if (event_type) {
      events = await financialEventStore.getEventsByType(event_type, { fromTimestamp: from, toTimestamp: to, limit: parseInt(limit) });
    } else {
      events = await financialEventStore.getEventsFromCheckpoint(0, parseInt(limit));
    }
    res.json({ success: true, data: events, count: events.length });
  } catch (err) {
    logger.error('Get events error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/events/:eventId', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const event = await financialEventStore.getEventById(req.params.eventId);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, data: event });
  } catch (err) {
    logger.error('Get event error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/events/trace/:traceId', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const events = await financialEventStore.getEventsByTrace(req.params.traceId);
    res.json({ success: true, data: events, count: events.length });
  } catch (err) {
    logger.error('Get events by trace error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/events/stats', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const stats = await financialEventStore.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Get event stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/events/verify-chain', authorize('admin'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const result = await financialEventStore.verifyChain(
      parseInt(from) || 0,
      to ? parseInt(to) : null
    );
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Verify event chain error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Replay Engine ─────────────────────────────────────────────────────────

router.post('/replay/full', authorize('admin'), async (req, res) => {
  try {
    const result = await replayEngine.fullReplay(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Full replay error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/replay/aggregate', authorize('admin'), async (req, res) => {
  try {
    const { aggregate_type, aggregate_id } = req.body;
    const result = await replayEngine.replayByAggregate(aggregate_type, aggregate_id);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Aggregate replay error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/replay/financial-year', authorize('admin'), async (req, res) => {
  try {
    const { year, company_id } = req.body;
    const result = await replayEngine.replayByFinancialYear(year, company_id);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Financial year replay error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/replay/to-checkpoint', authorize('admin'), async (req, res) => {
  try {
    const { position } = req.body;
    const result = await replayEngine.replayToCheckpoint(position);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Replay to checkpoint error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/replay/verify', authorize('admin'), async (req, res) => {
  try {
    const { replay_1, replay_2 } = req.body;
    const r1 = replay_1 || await replayEngine.fullReplay();
    const r2 = replay_2 || await replayEngine.fullReplay();
    const result = await replayEngine.verifyReplay(r1, r2);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Replay verify error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/replay/audit-log', authorize('admin'), async (req, res) => {
  try {
    const logs = await replayEngine.getReplayAuditLog(req.query);
    res.json({ success: true, data: logs });
  } catch (err) {
    logger.error('Replay audit log error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Capability Registry ───────────────────────────────────────────────────

router.get('/capabilities', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const { category } = req.query;
    const capabilities = financialCapabilityRegistry.listCapabilities(category);
    res.json({ success: true, data: capabilities, count: capabilities.length });
  } catch (err) {
    logger.error('List capabilities error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/capabilities/:capabilityId', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const cap = financialCapabilityRegistry.getCapability(req.params.capabilityId);
    if (!cap) return res.status(404).json({ success: false, message: 'Capability not found' });
    res.json({ success: true, data: cap });
  } catch (err) {
    logger.error('Get capability error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/capabilities/:capabilityId/execute', authorize('admin', 'accountant'), async (req, res) => {
  try {
    const result = await financialCapabilityRegistry.executeCapability(
      req.params.capabilityId,
      req.body.inputs || {},
      req.user._id,
      `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
    );
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Execute capability error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Ledger Locks ──────────────────────────────────────────────────────────

router.get('/locks', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const locks = await ledgerLockService.getActiveLocks();
    res.json({ success: true, data: locks });
  } catch (err) {
    logger.error('Get locks error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/locks/history', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const { period_id, limit } = req.query;
    const history = await ledgerLockService.getLockHistory(period_id, parseInt(limit) || 50);
    res.json({ success: true, data: history });
  } catch (err) {
    logger.error('Get lock history error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/locks/check/:periodId', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const { operation } = req.query;
    const result = await ledgerLockService.isLocked(req.params.periodId, operation);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Check lock error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/locks', authorize('admin'), async (req, res) => {
  try {
    const { period_id, lock_type, reason, constraints, adjustment_window } = req.body;
    const lock = await ledgerLockService.lockPeriod(
      period_id, lock_type, req.user._id?.toString() || req.user.email, reason,
      { constraints, adjustment_window, trace_id: `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}` }
    );
    res.json({ success: true, data: lock });
  } catch (err) {
    logger.error('Lock period error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/locks/:periodId/unlock', authorize('admin'), async (req, res) => {
  try {
    const lock = await ledgerLockService.unlockPeriod(
      req.params.periodId,
      req.user._id?.toString() || req.user.email,
      req.body.reason,
      `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
    );
    res.json({ success: true, data: lock });
  } catch (err) {
    logger.error('Unlock period error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/locks/:periodId/constitutional-unlock', authorize('admin'), async (req, res) => {
  try {
    const lock = await ledgerLockService.constitutionalUnlock(
      req.params.periodId,
      req.user._id?.toString() || req.user.email,
      req.body.reason,
      `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
    );
    res.json({ success: true, data: lock });
  } catch (err) {
    logger.error('Constitutional unlock error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/locks/verify-chain', authorize('admin'), async (req, res) => {
  try {
    const result = await ledgerLockService.verifyLockChain();
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Verify lock chain error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Report Snapshots ──────────────────────────────────────────────────────

router.get('/snapshots', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const { report_type, start_date, end_date, limit } = req.query;
    const snapshots = await reportSnapshotService.getSnapshotsByType(report_type, {
      startDate: start_date, endDate: end_date, limit: parseInt(limit) || 50,
    });
    res.json({ success: true, data: snapshots, count: snapshots.length });
  } catch (err) {
    logger.error('Get snapshots error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/snapshots/:snapshotId', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const snapshot = await reportSnapshotService.getSnapshot(req.params.snapshotId);
    if (!snapshot) return res.status(404).json({ success: false, message: 'Snapshot not found' });
    res.json({ success: true, data: snapshot });
  } catch (err) {
    logger.error('Get snapshot error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/snapshots/:snapshotId/verify', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const result = await reportSnapshotService.verifySnapshot(req.params.snapshotId);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Verify snapshot error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/snapshots/verify-all', authorize('admin'), async (req, res) => {
  try {
    const result = await reportSnapshotService.verifyAllSnapshots();
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Verify all snapshots error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/snapshots/historical/:reportType', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const { period_end_date } = req.query;
    const snapshots = await reportSnapshotService.getHistoricalReports(req.params.reportType, period_end_date);
    res.json({ success: true, data: snapshots, count: snapshots.length });
  } catch (err) {
    logger.error('Get historical reports error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Replay Validation Suite ───────────────────────────────────────────────

router.get('/validation/full', authorize('admin'), async (req, res) => {
  try {
    const report = await replayValidationSuite.runFullValidation();
    res.json({ success: true, data: report });
  } catch (err) {
    logger.error('Full validation error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Bucket Provenance ─────────────────────────────────────────────────────

router.get('/bucket/stats', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const stats = bucketProvenance.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Bucket stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/bucket/:artifactId', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const artifact = bucketProvenance.getArtifact(req.params.artifactId);
    if (!artifact) return res.status(404).json({ success: false, message: 'Artifact not found' });
    res.json({ success: true, data: artifact });
  } catch (err) {
    logger.error('Get artifact error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/bucket/:artifactId/verify', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const result = bucketProvenance.verifyArtifact(req.params.artifactId);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Verify artifact error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/bucket/entity/:entityType/:entityId', authorize('admin', 'accountant', 'viewer'), async (req, res) => {
  try {
    const artifacts = bucketProvenance.getArtifactsByEntity(req.params.entityType, req.params.entityId);
    res.json({ success: true, data: artifacts, count: artifacts.length });
  } catch (err) {
    logger.error('Get entity artifacts error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Integration Verification ──────────────────────────────────────────────

router.get('/integrations/verify', authorize('admin'), async (req, res) => {
  try {
    const result = await financialIntegration.verifyAllIntegrations();
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Verify integrations error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
