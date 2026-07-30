import crypto from 'crypto';
import LedgerLock from '../models/LedgerLock.js';
import financialEventStore from './financialEventStore.service.js';
import logger from '../config/logger.js';

class LedgerLockService {
  constructor() {
    this._lastHash = '0';
    this._chainPosition = 0;
  }

  async initialize() {
    const latest = await LedgerLock.findOne().sort({ chain_position: -1 }).lean();
    if (latest) {
      this._lastHash = latest.hash;
      this._chainPosition = latest.chain_position;
    }
  }

  async lockPeriod(periodId, lockType, userId, reason, options = {}) {
    await this.initialize();

    const existing = await LedgerLock.findOne({ period_id: periodId, status: 'ACTIVE' });
    if (existing) {
      throw new Error(`Period ${periodId} is already locked (${existing.lock_type})`);
    }

    const chain_position = this._chainPosition + 1;
    const lock_id = `LOCK-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    const hash = LedgerLock.computeHash({
      lock_id,
      period_id: periodId,
      lock_type: lockType,
      status: 'ACTIVE',
      locked_by: userId,
      locked_at: new Date(),
      reason,
    }, this._lastHash);

    const lock = await LedgerLock.create({
      lock_id,
      period_id: periodId,
      lock_type: lockType,
      status: 'ACTIVE',
      locked_by: userId,
      reason,
      constraints: options.constraints || {
        block_journal_posting: true,
        block_invoice_modification: true,
        block_expense_modification: true,
        block_voucher_import: true,
        block_ledger_edits: true,
        allow_constitutional_adjustments: true,
      },
      adjustment_window: options.adjustment_window || null,
      trace_id: options.trace_id || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      hash,
      previous_hash: this._lastHash,
      chain_position,
    });

    this._lastHash = hash;
    this._chainPosition = chain_position;

    await financialEventStore.append({
      aggregate_id: periodId,
      aggregate_type: 'FinancialPeriod',
      event_type: lockType === 'YEAR_END_CLOSE' ? 'FINANCIAL_YEAR_CLOSED' : 'LEDGER_LOCKED',
      user_id: userId,
      trace_id: lock.trace_id,
      payload: { lock_id, period_id: periodId, lock_type: lockType, reason },
    });

    return lock;
  }

  async unlockPeriod(periodId, userId, reason, traceId) {
    await this.initialize();

    const lock = await LedgerLock.findOne({ period_id: periodId, status: 'ACTIVE' });
    if (!lock) {
      throw new Error(`No active lock found for period ${periodId}`);
    }

    if (lock.lock_type === 'AUDIT_LOCK') {
      throw new Error('Audit locks cannot be released — use constitutional unlock');
    }

    const chain_position = this._chainPosition + 1;
    const hash = LedgerLock.computeHash({
      lock_id: lock.lock_id,
      period_id: periodId,
      lock_type: lock.lock_type,
      status: 'RELEASED',
      locked_by: lock.locked_by,
      locked_at: lock.locked_at,
      reason,
    }, this._lastHash);

    lock.status = 'RELEASED';
    lock.released_by = userId;
    lock.released_at = new Date();
    lock.hash = hash;
    lock.previous_hash = this._lastHash;
    lock.chain_position = chain_position;
    await lock.save();

    this._lastHash = hash;
    this._chainPosition = chain_position;

    await financialEventStore.append({
      aggregate_id: periodId,
      aggregate_type: 'FinancialPeriod',
      event_type: 'LEDGER_REOPENED',
      user_id: userId,
      trace_id: traceId || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      payload: { lock_id: lock.lock_id, period_id: periodId, reason },
    });

    return lock;
  }

  async constitutionalUnlock(periodId, userId, reason, traceId) {
    await this.initialize();

    const lock = await LedgerLock.findOne({ period_id: periodId, status: 'ACTIVE' });
    if (!lock) {
      throw new Error(`No active lock found for period ${periodId}`);
    }

    const chain_position = this._chainPosition + 1;
    const hash = LedgerLock.computeHash({
      lock_id: lock.lock_id,
      period_id: periodId,
      lock_type: 'CONSTITUTIONAL_UNLOCK',
      status: 'OVERRIDDEN',
      locked_by: lock.locked_by,
      locked_at: lock.locked_at,
      reason,
    }, this._lastHash);

    lock.status = 'OVERRIDDEN';
    lock.released_by = userId;
    lock.released_at = new Date();
    lock.lock_type = 'CONSTITUTIONAL_UNLOCK';
    lock.hash = hash;
    lock.previous_hash = this._lastHash;
    lock.chain_position = chain_position;
    await lock.save();

    this._lastHash = hash;
    this._chainPosition = chain_position;

    await financialEventStore.append({
      aggregate_id: periodId,
      aggregate_type: 'FinancialPeriod',
      event_type: 'PERIOD_REOPENED',
      user_id: userId,
      trace_id: traceId || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      payload: { lock_id: lock.lock_id, period_id: periodId, reason, constitutional: true },
    });

    return lock;
  }

  async isLocked(periodId, operation = 'journal_posting') {
    const lock = await LedgerLock.findOne({ period_id: periodId, status: 'ACTIVE' });
    if (!lock) return { locked: false };

    const constraintMap = {
      journal_posting: 'block_journal_posting',
      invoice_modification: 'block_invoice_modification',
      expense_modification: 'block_expense_modification',
      voucher_import: 'block_voucher_import',
      ledger_edits: 'block_ledger_edits',
    };

    const constraintKey = constraintMap[operation];
    if (constraintKey && lock.constraints[constraintKey]) {
      return {
        locked: true,
        lock_type: lock.lock_type,
        lock_id: lock.lock_id,
        reason: lock.reason,
        locked_by: lock.locked_by,
        locked_at: lock.locked_at,
      };
    }

    return { locked: false };
  }

  async getActiveLocks() {
    return LedgerLock.find({ status: 'ACTIVE' }).sort({ locked_at: -1 }).lean();
  }

  async getLockHistory(periodId, limit = 50) {
    const query = periodId ? { period_id: periodId } : {};
    return LedgerLock.find(query).sort({ chain_position: -1 }).limit(limit).lean();
  }

  async verifyLockChain() {
    const locks = await LedgerLock.find().sort({ chain_position: 1 }).lean();
    let prevHash = '0';

    for (const lock of locks) {
      if (lock.previous_hash !== prevHash) {
        return { valid: false, broken_at: lock.lock_id };
      }
      prevHash = lock.hash;
    }

    return { valid: true, verified: locks.length };
  }
}

export default new LedgerLockService();
