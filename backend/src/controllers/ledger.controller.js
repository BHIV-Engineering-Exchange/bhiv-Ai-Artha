import ledgerService from '../services/ledger.service.js';
import JournalEntry from '../models/JournalEntry.js';
import logger from '../config/logger.js';
import { randomUUID } from 'crypto';
import auditService from '../services/audit.service.js';
import evidenceAutomationService from '../services/evidenceAutomation.service.js';
import tantraService from '../services/tantra.service.js';
import financialEventEmitter from '../services/financialEventEmitter.service.js';
import financialIntegration from '../services/financialIntegration.service.js';

// @desc    Create journal entry
// @route   POST /api/v1/ledger/entries
// @access  Private (accountant, admin)
export const createEntry = async (req, res) => {
  try {
    const entry = await ledgerService.createJournalEntry(req.body, req.user._id);

    // Audit trail
    await auditService.recordEvent({
      eventType: 'JOURNAL_ENTRY_CREATED',
      entityType: 'JournalEntry',
      entityId: entry._id,
      traceId: entry.trace_id || randomUUID(),
      userId: req.user._id,
      details: {
        entryNumber: entry.entryNumber,
        description: entry.description,
        totalDebit: entry.totalDebit,
        totalCredit: entry.totalCredit,
        status: entry.status,
      },
    });

    // Capture evidence
    await evidenceAutomationService.captureAPIResponse({
      operation: 'createJournalEntry',
      entityType: 'JournalEntry',
      entityId: entry._id,
      request: { body: req.body, userId: req.user._id },
      response: { success: true, entryNumber: entry.entryNumber },
      traceId: entry.trace_id || randomUUID(),
    });

    // Emit TANTRA event
    await tantraService.emitEvent({
      event: 'JOURNAL_ENTRY_CREATED',
      entityType: 'JournalEntry',
      entityId: entry._id,
      details: { entryNumber: entry.entryNumber, totalDebit: entry.totalDebit },
    });

    // Emit immutable financial event
    await financialEventEmitter.emitJournalCreated(entry, req.user._id);

    // Financial integration hooks (provenance, decision ledger, insightflow)
    await financialIntegration.onJournalCreated(entry, req.user._id);

    res.status(201).json({
      success: true,
      data: entry,
    });
  } catch (error) {
    logger.error('Create entry error:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Create credit note
// @route   POST /api/v1/ledger/credit-notes
// @access  Private (accountant, admin)
export const createCreditNote = async (req, res) => {
  try {
    const entry = await ledgerService.createCreditNote(req.body, req.user._id);

    res.status(201).json({
      success: true,
      data: entry,
    });
  } catch (error) {
    logger.error('Create credit note error:', error);
    const payload = {
      success: false,
      message: error.message,
    };
    if (error.code) payload.code = error.code;
    if (error.details) payload.details = error.details;
    res.status(400).json(payload);
  }
};

// @desc    Create debit note
// @route   POST /api/v1/ledger/debit-notes
// @access  Private (accountant, admin)
export const createDebitNote = async (req, res) => {
  try {
    const entry = await ledgerService.createDebitNote(req.body, req.user._id);

    res.status(201).json({
      success: true,
      data: entry,
    });
  } catch (error) {
    logger.error('Create debit note error:', error);
    const payload = {
      success: false,
      message: error.message,
    };
    if (error.code) payload.code = error.code;
    if (error.details) payload.details = error.details;
    res.status(400).json(payload);
  }
};

// @desc    Create reversal entry
// @route   POST /api/v1/ledger/entries/:id/reversal
// @access  Private (accountant, admin)
export const createReversalEntry = async (req, res) => {
  try {
    const entry = await ledgerService.createReversalEntry(
      req.params.id,
      req.user._id,
      req.body?.reason || null
    );

    // Emit immutable financial event
    await financialEventEmitter.emitJournalReversed(
      { _id: req.params.id }, entry, req.user._id
    );

    // Financial integration hooks
    await financialIntegration.onJournalReversed(
      { _id: req.params.id }, entry, req.user._id
    );

    res.status(201).json({
      success: true,
      data: entry,
    });
  } catch (error) {
    logger.error('Create reversal entry error:', error);
    const payload = {
      success: false,
      message: error.message,
    };
    if (error.code) payload.code = error.code;
    if (error.details) payload.details = error.details;
    res.status(400).json(payload);
  }
};

// @desc    Validate journal entry
// @route   POST /api/v1/ledger/entries/:id/validate
// @access  Private (accountant, admin)
export const validateEntry = async (req, res) => {
  try {
    const entry = await ledgerService.validateJournalEntry(req.params.id, req.user._id);

    // Audit trail
    await auditService.recordEvent({
      eventType: 'JOURNAL_ENTRY_VALIDATED',
      entityType: 'JournalEntry',
      entityId: entry._id,
      traceId: entry.trace_id || randomUUID(),
      userId: req.user._id,
      details: {
        entryNumber: entry.entryNumber,
        description: entry.description,
        status: entry.status,
      },
    });

    // Capture evidence
    await evidenceAutomationService.captureAPIResponse({
      operation: 'validateJournalEntry',
      entityType: 'JournalEntry',
      entityId: entry._id,
      request: { entryId: req.params.id, userId: req.user._id },
      response: { success: true, entryNumber: entry.entryNumber, status: entry.status },
      traceId: entry.trace_id || randomUUID(),
    });

    // Emit TANTRA event
    await tantraService.emitEvent({
      event: 'JOURNAL_ENTRY_VALIDATED',
      entityType: 'JournalEntry',
      entityId: entry._id,
      details: { entryNumber: entry.entryNumber, status: entry.status },
    });

    // Emit immutable financial event
    await financialEventEmitter.emitJournalValidated(entry, req.user._id);

    // Financial integration hooks
    await financialIntegration.onJournalPosted(entry, req.user._id);

    res.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    logger.error('Validate entry error:', error);
    const payload = {
      success: false,
      message: error.message,
    };
    if (error.code) payload.code = error.code;
    if (error.details) payload.details = error.details;
    res.status(400).json(payload);
  }
};

// @desc    Post journal entry
// @route   POST /api/v1/ledger/entries/:id/post
// @access  Private (accountant, admin)
export const postEntry = async (req, res) => {
  try {
    const entry = await ledgerService.postJournalEntry(req.params.id, req.user._id);

    // Audit trail
    await auditService.recordEvent({
      eventType: 'JOURNAL_ENTRY_POSTED',
      entityType: 'JournalEntry',
      entityId: entry._id,
      traceId: entry.trace_id || randomUUID(),
      userId: req.user._id,
      details: {
        entryNumber: entry.entryNumber,
        description: entry.description,
        totalDebit: entry.totalDebit,
        totalCredit: entry.totalCredit,
        status: entry.status,
      },
    });

    // Capture evidence
    await evidenceAutomationService.captureAPIResponse({
      operation: 'postJournalEntry',
      entityType: 'JournalEntry',
      entityId: entry._id,
      request: { entryId: req.params.id, userId: req.user._id },
      response: { success: true, entryNumber: entry.entryNumber, status: entry.status },
      traceId: entry.trace_id || randomUUID(),
    });

    // Emit TANTRA event
    await tantraService.emitEvent({
      event: 'JOURNAL_ENTRY_POSTED',
      entityType: 'JournalEntry',
      entityId: entry._id,
      details: { entryNumber: entry.entryNumber, totalDebit: entry.totalDebit },
    });

    // Emit immutable financial event
    await financialEventEmitter.emitJournalPosted(entry, req.user._id);

    // Financial integration hooks
    await financialIntegration.onJournalPosted(entry, req.user._id);

    res.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    logger.error('Post entry error:', error);
    const payload = {
      success: false,
      message: error.message,
    };
    if (error.code) payload.code = error.code;
    if (error.details) payload.details = error.details;
    res.status(400).json(payload);
  }
};

// @desc    Get journal entries
// @route   GET /api/v1/ledger/entries
// @access  Private
export const getEntries = async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      account: req.query.account,
      search: req.query.search,
    };

    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      sortBy: req.query.sortBy || 'date',
      sortOrder: req.query.sortOrder || 'desc',
    };

    const result = await ledgerService.getJournalEntries(filters, pagination);

    res.json({
      success: true,
      data: result.entries,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Get entries error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single journal entry
// @route   GET /api/v1/ledger/entries/:id
// @access  Private
export const getEntry = async (req, res) => {
  try {
    const entry = await ledgerService.getJournalEntryById(req.params.id);

    res.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    logger.error('Get entry error:', error);
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Void journal entry
// @route   POST /api/v1/ledger/entries/:id/void
// @access  Private (accountant, admin)
export const voidEntry = async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Reason for voiding is required',
      });
    }

    const result = await ledgerService.voidJournalEntry(req.params.id, req.user._id, reason);

    // Emit immutable financial event
    await financialEventEmitter.emitJournalVoided(result, req.user._id, reason);

    // Financial integration hooks
    await financialIntegration.onJournalVoided(result, req.user._id, reason);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Void entry error:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get account balances
// @route   GET /api/v1/ledger/balances
// @access  Private
export const getBalances = async (req, res) => {
  try {
    const filters = {
      accountType: req.query.accountType,
      minBalance: req.query.minBalance,
      maxBalance: req.query.maxBalance,
      search: req.query.search,
    };

    const balances = await ledgerService.getAccountBalances(filters);

    res.json({
      success: true,
      data: balances,
    });
  } catch (error) {
    logger.error('Get balances error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get ledger summary
// @route   GET /api/v1/ledger/summary
// @access  Private
export const getSummary = async (req, res) => {
  try {
    const summary = await ledgerService.getLedgerSummary();

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Get summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Verify ledger chain integrity
// @route   GET /api/v1/ledger/verify
// @access  Private (admin)
export const verifyChain = async (req, res) => {
  try {
    const result = await ledgerService.verifyLedgerChain();

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Verify chain error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Verify chain from specific entry
// @route   GET /api/v1/ledger/entries/:id/verify-chain
// @access  Private (admin)
export const verifyChainFromEntry = async (req, res) => {
  try {
    const result = await ledgerService.verifyChainFromEntry(req.params.id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Verify chain from entry error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get chain statistics
// @route   GET /api/v1/ledger/chain-stats
// @access  Private (admin)
export const getChainStats = async (req, res) => {
  try {
    const stats = await ledgerService.getChainStatistics();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Get chain stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Verify entire ledger chain (Enhanced)
// @route   GET /api/v1/ledger/verify-chain
// @access  Private (admin)
export const verifyLedgerChain = async (req, res) => {
  try {
    const result = await ledgerService.verifyLedgerChain();

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Verify chain error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get chain segment for audit
// @route   GET /api/v1/ledger/chain-segment
// @access  Private (admin)
export const getChainSegment = async (req, res) => {
  try {
    const { startPosition = 0, endPosition = 100 } = req.query;

    if (isNaN(startPosition) || isNaN(endPosition)) {
      return res.status(400).json({
        success: false,
        message: 'startPosition and endPosition must be numbers',
      });
    }

    const segment = await ledgerService.getChainSegment(
      parseInt(startPosition),
      parseInt(endPosition)
    );

    res.json({
      success: true,
      data: {
        segment,
        range: { 
          startPosition: parseInt(startPosition), 
          endPosition: parseInt(endPosition) 
        },
        count: segment.length,
      },
    });
  } catch (error) {
    logger.error('Get chain segment error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Verify single entry hash
// @route   GET /api/v1/ledger/entries/:id/verify
// @access  Private
export const verifySingleEntry = async (req, res) => {
  try {
    const entry = await JournalEntry.findById(req.params.id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Entry not found',
      });
    }

    // SECURITY FIX: Never default to true for hash verification
    if (!entry.verifyHash || typeof entry.verifyHash !== 'function') {
      logger.error('Hash verification method missing for entry:', entry.entryNumber);
      return res.status(500).json({
        success: false,
        message: 'Entry hash verification method not available - data integrity error',
        data: {
          entryNumber: entry.entryNumber,
          error: 'VERIFICATION_METHOD_MISSING'
        }
      });
    }

    // Standardize field names for consistency
    const prevHashValue = entry.prevHash || entry.prev_hash || '0';
    const isValid = entry.verifyHash();
    const computedHash = JournalEntry.computeHash(entry.toObject(), prevHashValue);

    res.json({
      success: true,
      data: {
        entryNumber: entry.entryNumber,
        hash: entry.hash || entry.immutable_hash,
        computedHash,
        isValid,
        chainPosition: entry.chainPosition,
        prevHash: entry.prevHash || entry.prev_hash,
        status: entry.status,
        message: isValid 
          ? 'Entry hash is valid' 
          : 'Entry hash is invalid - possible tampering',
      },
    });
  } catch (error) {
    logger.error('Verify entry error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Legacy alias for backward compatibility
export const createJournalEntry = createEntry;
export const postJournalEntry = postEntry;