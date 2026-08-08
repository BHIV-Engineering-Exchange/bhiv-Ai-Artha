import mitraService from '../services/mitra.service.js';
import logger from '../config/logger.js';
import { randomUUID } from 'crypto';
import auditService from '../services/audit.service.js';
import tantraService from '../services/tantra.service.js';

/**
 * MITRA Controller — Full governance integration.
 * Every request:
 *   1. Extracts user identity and role
 *   2. Generates trace_id
 *   3. Checks permission-aware capability
 *   4. Records audit trail
 *   5. Emits TANTRA events
 */

export const sendChatMessage = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const userId = req.user?._id || req.user?.user_id || 'unknown';
    const userName = req.user?.name || req.user?.email || 'User';
    const userRole = req.user?.role || 'viewer';
    const traceId = req.headers['x-trace-id'] || req.body?.trace_id || randomUUID();

    const result = await mitraService.chat(message.trim(), userId, userName, userRole, traceId);

    await auditService.recordEvent({
      eventType: 'MITRA_CHAT',
      entityType: 'MitraInteraction',
      entityId: userId,
      traceId,
      userId,
      details: {
        message: message.trim().substring(0, 200),
        role: userRole,
        capability_used: result.capability_used || null,
        source: 'artha',
      },
    }).catch(() => {});

    await tantraService.emitEvent({
      event: 'MITRA_CHAT',
      entityType: 'MitraInteraction',
      entityId: userId,
      details: {
        message: message.trim().substring(0, 200),
        role: userRole,
        trace_id: traceId,
      },
    }).catch(() => {});

    res.json({
      success: true,
      data: result,
      trace_id: traceId,
    });
  } catch (error) {
    const traceId = req.headers['x-trace-id'] || req.body?.trace_id || randomUUID();
    logger.error('Mitra chat error:', error);
    res.status(502).json({
      success: false,
      message: error.message || 'Failed to get response from Mitra',
      trace_id: traceId,
    });
  }
};

export const analyzeData = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ success: false, message: 'Analysis query is required' });
    }

    const userId = req.user?._id || req.user?.user_id || 'unknown';
    const userRole = req.user?.role || 'viewer';
    const traceId = req.headers['x-trace-id'] || randomUUID();

    const result = await mitraService.analyze(query.trim(), userId, userRole, traceId);

    await auditService.recordEvent({
      eventType: 'MITRA_ANALYZE',
      entityType: 'MitraInteraction',
      entityId: userId,
      traceId,
      userId,
      details: {
        query: query.trim().substring(0, 200),
        role: userRole,
        capability_used: result.capability_used || null,
      },
    }).catch(() => {});

    await tantraService.emitEvent({
      event: 'MITRA_ANALYZE',
      entityType: 'MitraInteraction',
      entityId: userId,
      details: {
        query: query.trim().substring(0, 200),
        role: userRole,
        trace_id: traceId,
      },
    }).catch(() => {});

    res.json({
      success: true,
      data: result,
      trace_id: traceId,
    });
  } catch (error) {
    logger.error('Mitra analyze error:', error);
    res.status(502).json({
      success: false,
      message: error.message || 'Failed to complete analysis',
      trace_id: req.headers['x-trace-id'] || randomUUID(),
    });
  }
};

export const getInsights = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.user_id || 'unknown';
    const userRole = req.user?.role || 'viewer';
    const traceId = req.headers['x-trace-id'] || randomUUID();

    const result = await mitraService.getInsights(userId, userRole, traceId);

    await auditService.recordEvent({
      eventType: 'MITRA_INSIGHTS',
      entityType: 'MitraInteraction',
      entityId: userId,
      traceId,
      userId,
      details: {
        role: userRole,
        source: 'artha',
      },
    }).catch(() => {});

    await tantraService.emitEvent({
      event: 'MITRA_INSIGHTS',
      entityType: 'MitraInteraction',
      entityId: userId,
      details: {
        role: userRole,
        trace_id: traceId,
      },
    }).catch(() => {});

    res.json({
      success: true,
      data: result,
      trace_id: traceId,
    });
  } catch (error) {
    logger.error('Mitra insights error:', error);
    res.status(502).json({
      success: false,
      message: error.message || 'Failed to get insights',
      trace_id: req.headers['x-trace-id'] || randomUUID(),
    });
  }
};

export const analyzeStatement = async (req, res) => {
  try {
    const { message, statementId } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const userId = req.user?._id || req.user?.user_id || 'unknown';
    const userRole = req.user?.role || 'viewer';
    const traceId = req.headers['x-trace-id'] || randomUUID();

    const result = await mitraService.analyzeStatement(message.trim(), userId, userRole, statementId, traceId);

    await auditService.recordEvent({
      eventType: 'MITRA_STATEMENT_ANALYSIS',
      entityType: 'MitraInteraction',
      entityId: userId,
      traceId,
      userId,
      details: {
        message: message.trim().substring(0, 200),
        statementId,
        role: userRole,
      },
    }).catch(() => {});

    await tantraService.emitEvent({
      event: 'MITRA_STATEMENT_ANALYSIS',
      entityType: 'MitraInteraction',
      entityId: userId,
      details: {
        message: message.trim().substring(0, 200),
        statementId,
        role: userRole,
        trace_id: traceId,
      },
    }).catch(() => {});

    res.json({
      success: true,
      data: result,
      trace_id: traceId,
    });
  } catch (error) {
    logger.error('Mitra statement analysis error:', error);
    res.status(502).json({
      success: false,
      message: error.message || 'Failed to analyze statement',
      trace_id: req.headers['x-trace-id'] || randomUUID(),
    });
  }
};

export const getMitraHealth = async (req, res) => {
  try {
    const health = await mitraService.healthCheck();
    res.json({ success: true, data: health });
  } catch (error) {
    logger.error('Mitra health check error:', error);
    res.status(503).json({ success: false, message: 'Mitra health check failed' });
  }
};

export const getCapabilities = async (req, res) => {
  try {
    const userRole = req.user?.role || 'viewer';
    const capabilities = mitraService.getRoleCapabilities(userRole);
    const intentDescriptions = mitraService._getIntents();
    res.json({
      success: true,
      data: {
        role: userRole,
        capabilities,
        intents: intentDescriptions,
      },
    });
  } catch (error) {
    logger.error('Mitra capabilities error:', error);
    res.status(500).json({ success: false, message: 'Failed to get capabilities' });
  }
};
