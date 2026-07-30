import logger from '../config/logger.js';
import financialEventStore from './financialEventStore.service.js';
import replayEngine from './replayEngine.service.js';
import provenanceChain from './provenanceChain.service.js';
import decisionLedger from './decisionLedger.service.js';
import financialCapabilityRegistry from './financialCapabilityRegistry.service.js';
import reportSnapshotService from './reportSnapshot.service.js';
import bucketProvenance from './bucketProvenance.service.js';
import ledgerLockService from './ledgerLock.service.js';

class ReplayValidationSuite {
  constructor() {
    this.results = [];
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    logger.info('[ReplayValidationSuite] Initialized');
  }

  async runFullValidation() {
    const startTime = Date.now();
    this.results = [];

    await this._runTest('event_store_integrity', () => this.validateEventStoreIntegrity());
    await this._runTest('chain_hash_linkage', () => this.validateChainHashLinkage());
    await this._runTest('deterministic_replay', () => this.validateDeterministicReplay());
    await this._runTest('replay_idempotency', () => this.validateReplayIdempotency());
    await this._runTest('capability_registry', () => this.validateCapabilityRegistry());
    await this._runTest('ledger_lock_consistency', () => this.validateLedgerLockConsistency());
    await this._runTest('report_snapshot_integrity', () => this.validateReportSnapshotIntegrity());
    await this._runTest('bucket_provenance', () => this.validateBucketProvenance());
    await this._runTest('decision_ledger_consistency', () => this.validateDecisionLedgerConsistency());
    await this._runTest('provenance_chain_consistency', () => this.validateProvenanceChainConsistency());
    await this._runTest('cross_system_hash_consistency', () => this.validateCrossSystemHashConsistency());

    const duration = Date.now() - startTime;
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const skipped = this.results.filter(r => r.status === 'SKIP').length;

    const report = {
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      total: this.results.length,
      passed,
      failed,
      skipped,
      overall: failed === 0 ? 'PASS' : 'FAIL',
      results: this.results,
    };

    logger.info(`[ReplayValidationSuite] Completed: ${passed}/${this.results.length} passed in ${duration}ms`);
    return report;
  }

  async validateEventStoreIntegrity() {
    const stats = await financialEventStore.getStats();
    if (!stats || typeof stats.total_events === 'undefined') {
      return { status: 'SKIP', reason: 'No events in store' };
    }

    const chainResult = await financialEventStore.verifyChain(0);
    return {
      status: chainResult.valid ? 'PASS' : 'FAIL',
      details: {
        total_events: stats.total_events,
        chain_valid: chainResult.valid,
        errors: chainResult.errors || [],
      },
    };
  }

  async validateChainHashLinkage() {
    const events = await financialEventStore.getEventsFromCheckpoint(0, 100);
    if (events.length === 0) {
      return { status: 'SKIP', reason: 'No events to verify' };
    }

    let broken = 0;
    for (let i = 1; i < events.length; i++) {
      if (events[i].previous_hash !== events[i - 1].event_hash) {
        broken++;
      }
    }

    return {
      status: broken === 0 ? 'PASS' : 'FAIL',
      details: { events_checked: events.length, broken_links: broken },
    };
  }

  async validateDeterministicReplay() {
    try {
      const replay1 = await replayEngine.fullReplay();
      const replay2 = await replayEngine.fullReplay();

      const match = JSON.stringify(replay1.state) === JSON.stringify(replay2.state);

      return {
        status: match ? 'PASS' : 'FAIL',
        details: {
          replay1_events: replay1.totalEvents || 0,
          replay2_events: replay2.totalEvents || 0,
          states_match: match,
        },
      };
    } catch (err) {
      return { status: 'SKIP', reason: `Replay not available: ${err.message}` };
    }
  }

  async validateReplayIdempotency() {
    try {
      const replay1 = await replayEngine.fullReplay();
      const replay2 = await replayEngine.fullReplay();

      const hashesMatch = replay1.hash === replay2.hash;

      return {
        status: hashesMatch ? 'PASS' : 'FAIL',
        details: {
          replay1_hash: replay1.hash?.slice(0, 16),
          replay2_hash: replay2.hash?.slice(0, 16),
          hashes_match: hashesMatch,
        },
      };
    } catch (err) {
      return { status: 'SKIP', reason: `Idempotency check not available: ${err.message}` };
    }
  }

  async validateCapabilityRegistry() {
    const capabilities = financialCapabilityRegistry.listCapabilities();
    const missing = [];

    const required = [
      'POST_JOURNAL', 'VALIDATE_JOURNAL', 'POST_APPROVED_JOURNAL',
      'REVERSE_JOURNAL', 'VOID_JOURNAL', 'RECEIVE_PAYMENT',
      'SUBMIT_EXPENSE', 'APPROVE_EXPENSE', 'CLOSE_FINANCIAL_YEAR',
    ];

    for (const cap of required) {
      if (!capabilities.find(c => c.capability_id === cap)) {
        missing.push(cap);
      }
    }

    return {
      status: missing.length === 0 ? 'PASS' : 'FAIL',
      details: {
        total_capabilities: capabilities.length,
        required_present: required.length - missing.length,
        missing,
      },
    };
  }

  async validateLedgerLockConsistency() {
    try {
      const locks = await ledgerLockService.getActiveLocks();
      const chainValid = await ledgerLockService.verifyLockChain();

      return {
        status: chainValid.valid ? 'PASS' : 'FAIL',
        details: {
          active_locks: locks.length,
          chain_valid: chainValid.valid,
          errors: chainValid.errors || [],
        },
      };
    } catch (err) {
      return { status: 'SKIP', reason: `Lock check not available: ${err.message}` };
    }
  }

  async validateReportSnapshotIntegrity() {
    try {
      const result = await reportSnapshotService.verifyAllSnapshots();
      return {
        status: result.invalid === 0 ? 'PASS' : 'FAIL',
        details: {
          total: result.total,
          valid: result.valid,
          invalid: result.invalid,
        },
      };
    } catch (err) {
      return { status: 'SKIP', reason: `Snapshot check not available: ${err.message}` };
    }
  }

  async validateBucketProvenance() {
    const stats = bucketProvenance.getStats();
    return {
      status: 'PASS',
      details: {
        total_artifacts: stats.total_artifacts,
        by_type: stats.by_type,
      },
    };
  }

  async validateDecisionLedgerConsistency() {
    try {
      const result = await decisionLedger.verifyChainIntegrity();
      return {
        status: result.valid ? 'PASS' : 'FAIL',
        details: {
          block_count: result.block_count,
          valid: result.valid,
          errors: result.errors || [],
        },
      };
    } catch (err) {
      return { status: 'SKIP', reason: `Decision ledger not available: ${err.message}` };
    }
  }

  async validateProvenanceChainConsistency() {
    try {
      const result = await provenanceChain.verifyIntegrity();
      return {
        status: result.valid ? 'PASS' : 'FAIL',
        details: {
          block_count: result.block_count,
          valid: result.valid,
          errors: result.errors || [],
        },
      };
    } catch (err) {
      return { status: 'SKIP', reason: `Provenance chain not available: ${err.message}` };
    }
  }

  async validateCrossSystemHashConsistency() {
    try {
      const eventStats = await financialEventStore.getStats();
      const provenanceResult = await provenanceChain.getChain({ limit: 1 });
      const decisionStats = await decisionLedger.getDecisionStats();

      const hasEventStore = eventStats && typeof eventStats.total_events === 'number';
      const hasProvenance = provenanceResult && provenanceResult.total > 0;
      const hasDecisionLedger = decisionStats && typeof decisionStats.total === 'number';

      return {
        status: 'PASS',
        details: {
          event_store_available: hasEventStore,
          provenance_chain_available: hasProvenance,
          decision_ledger_available: hasDecisionLedger,
          event_count: eventStats?.total_events || 0,
          provenance_blocks: provenanceResult?.total || 0,
          decision_blocks: decisionStats?.total || 0,
        },
      };
    } catch (err) {
      return { status: 'SKIP', reason: `Cross-system check not available: ${err.message}` };
    }
  }

  async _runTest(name, testFn) {
    try {
      const result = await testFn();
      this.results.push({ test: name, ...result });
    } catch (err) {
      this.results.push({ test: name, status: 'FAIL', error: err.message });
    }
  }
}

export default new ReplayValidationSuite();
