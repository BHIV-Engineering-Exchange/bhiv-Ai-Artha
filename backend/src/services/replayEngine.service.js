import financialEventStore from './financialEventStore.service.js';
import FinancialEvent from '../models/FinancialEvent.js';
import JournalEntry from '../models/JournalEntry.js';
import LedgerEntry from '../models/LedgerEntry.js';
import logger from '../config/logger.js';
import crypto from 'crypto';

class ReplayEngine {
  async fullReplay(options = {}) {
    const { fromPosition = 0, toPosition = null, checkpoint = null } = options;
    const startTime = Date.now();

    const from = checkpoint || fromPosition;
    const events = await financialEventStore.getEventsFromCheckpoint(from, 100000);

    if (toPosition) {
      events.splice(events.findIndex(e => e.chain_position > toPosition) + 1);
    }

    const state = {
      journals: new Map(),
      ledgerEntries: [],
      balances: new Map(),
      reports: [],
    };

    for (const event of events) {
      this.applyEvent(state, event);
    }

    const duration = Date.now() - startTime;
    const stateHash = this.computeStateHash(state);

    return {
      success: true,
      events_replayed: events.length,
      from_position: from,
      to_position: events.length ? events[events.length - 1].chain_position : from,
      duration_ms: duration,
      state_hash: stateHash,
      checkpoint: {
        position: events.length ? events[events.length - 1].chain_position : from,
        hash: stateHash,
        timestamp: new Date().toISOString(),
      },
      summary: {
        journals: state.journals.size,
        ledger_entries: state.ledgerEntries.length,
        account_balances: state.balances.size,
      },
    };
  }

  async replayByAggregate(aggregateType, aggregateId) {
    const events = await financialEventStore.getEventsByAggregate(aggregateId);
    const state = { journals: new Map(), ledgerEntries: [], balances: new Map(), reports: [] };

    for (const event of events) {
      if (event.aggregate_type === aggregateType || !aggregateType) {
        this.applyEvent(state, event);
      }
    }

    return {
      success: true,
      events_replayed: events.length,
      state_hash: this.computeStateHash(state),
      summary: {
        journals: state.journals.size,
        ledger_entries: state.ledgerEntries.length,
      },
    };
  }

  async replayByFinancialYear(year, companyId) {
    const startDate = new Date(`${year}-04-01`);
    const endDate = new Date(`${year + 1}-03-31`);

    const events = await FinancialEvent.find({
      timestamp: { $gte: startDate, $lte: endDate },
      ...(companyId ? { 'payload.company_id': companyId } : {}),
    }).sort({ chain_position: 1 }).lean();

    const state = { journals: new Map(), ledgerEntries: [], balances: new Map(), reports: [] };
    for (const event of events) {
      this.applyEvent(state, event);
    }

    return {
      success: true,
      financial_year: `${year}-${year + 1}`,
      events_replayed: events.length,
      state_hash: this.computeStateHash(state),
      checkpoint: {
        position: events.length ? events[events.length - 1].chain_position : 0,
        hash: this.computeStateHash(state),
        timestamp: new Date().toISOString(),
      },
    };
  }

  async replayToCheckpoint(targetPosition) {
    const events = await financialEventStore.getEventsInRange(0, targetPosition);
    const state = { journals: new Map(), ledgerEntries: [], balances: new Map(), reports: [] };

    for (const event of events) {
      this.applyEvent(state, event);
    }

    return {
      success: true,
      events_replayed: events.length,
      target_position: targetPosition,
      state_hash: this.computeStateHash(state),
    };
  }

  async verifyReplay(replayResult1, replayResult2) {
    return {
      identical: replayResult1.state_hash === replayResult2.state_hash,
      hash_1: replayResult1.state_hash,
      hash_2: replayResult2.state_hash,
      events_1: replayResult1.events_replayed,
      events_2: replayResult2.events_replayed,
    };
  }

  applyEvent(state, event) {
    const { event_type, payload } = event;

    switch (event_type) {
      case 'JOURNAL_CREATED':
      case 'JOURNAL_POSTED':
      case 'JOURNAL_VALIDATED':
        if (payload.entry_id || payload.entryNumber) {
          state.journals.set(payload.entry_id || payload.entryNumber, {
            ...payload,
            status: event_type === 'JOURNAL_POSTED' ? 'POSTED' :
                    event_type === 'JOURNAL_VALIDATED' ? 'VALIDATED' : 'DRAFT',
          });
        }
        break;

      case 'JOURNAL_REVERSED':
      case 'JOURNAL_VOIDED':
        if (payload.entry_id || payload.entryNumber) {
          state.journals.delete(payload.entry_id || payload.entryNumber);
        }
        break;

      case 'INVOICE_CREATED':
      case 'INVOICE_PAID':
      case 'INVOICE_CANCELLED':
        if (payload.invoice_id || payload.invoiceNumber) {
          state.journals.set(payload.invoice_id || payload.invoiceNumber, {
            type: 'Invoice',
            ...payload,
          });
        }
        break;

      case 'EXPENSE_SUBMITTED':
      case 'EXPENSE_APPROVED':
      case 'EXPENSE_REJECTED':
      case 'EXPENSE_RECORDED':
        if (payload.expense_id || payload.expenseNumber) {
          state.journals.set(payload.expense_id || payload.expenseNumber, {
            type: 'Expense',
            ...payload,
          });
        }
        break;

      case 'REPORT_GENERATED':
      case 'REPORT_SNAPSHOT_CREATED':
        state.reports.push({ ...payload, event_id: event.event_id });
        break;

      case 'PERIOD_CLOSED':
      case 'FINANCIAL_YEAR_CLOSED':
        state.balances.set(`period_${event.event_id}`, payload);
        break;

      default:
        break;
    }
  }

  computeStateHash(state) {
    const snapshot = {
      journals: Object.fromEntries(state.journals),
      ledger_count: state.ledgerEntries.length,
      balances: Object.fromEntries(state.balances),
      reports: state.reports,
    };
    return crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  }

  async getReplayAuditLog(options = {}) {
    const { fromPosition, limit = 50 } = options;
    const query = { event_type: 'REPLAY_EXECUTED' };
    if (fromPosition) query.chain_position = { $gte: fromPosition };

    return FinancialEvent.find(query).sort({ chain_position: -1 }).limit(limit).lean();
  }
}

export default new ReplayEngine();
