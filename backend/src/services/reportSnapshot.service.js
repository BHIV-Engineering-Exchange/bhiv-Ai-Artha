import crypto from 'crypto';
import ReportSnapshot from '../models/ReportSnapshot.js';
import financialEventStore from './financialEventStore.service.js';
import logger from '../config/logger.js';

class ReportSnapshotService {
  constructor() {
    this._lastHash = '0';
    this._chainPosition = 0;
  }

  async initialize() {
    const latest = await ReportSnapshot.findOne().sort({ chain_position: -1 }).lean();
    if (latest) {
      this._lastHash = latest.report_hash;
      this._chainPosition = latest.chain_position;
    }
  }

  async createSnapshot(reportType, period, reportData, metadata = {}) {
    await this.initialize();

    const version = await this.getNextVersion(reportType, period.end_date);
    const report_hash = ReportSnapshot.computeReportHash({
      report_type: reportType,
      period,
      data: reportData,
      version,
    });

    const chain_position = this._chainPosition + 1;
    const snapshot_id = `SNAP-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    const snapshot = await ReportSnapshot.create({
      snapshot_id,
      report_type: reportType,
      report_version: version,
      period,
      event_hash: metadata.event_hash || '0',
      ledger_hash: metadata.ledger_hash || '0',
      report_hash,
      generator: 'ARTHA Financial Runtime',
      runtime_version: '0.1.0',
      trace_id: metadata.trace_id || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      data: reportData,
      metadata: {
        event_count: metadata.event_count || 0,
        journal_count: metadata.journal_count || 0,
        ledger_entry_count: metadata.ledger_entry_count || 0,
        generated_by: metadata.generated_by || 'system',
      },
      chain_position,
    });

    this._lastHash = report_hash;
    this._chainPosition = chain_position;

    await financialEventStore.append({
      aggregate_id: snapshot_id,
      aggregate_type: 'ReportSnapshot',
      event_type: 'REPORT_SNAPSHOT_CREATED',
      user_id: metadata.generated_by || 'system',
      trace_id: snapshot.trace_id,
      payload: {
        snapshot_id,
        report_type: reportType,
        version,
        period,
        report_hash,
      },
    });

    return snapshot;
  }

  async getSnapshot(snapshotId) {
    return ReportSnapshot.findOne({ snapshot_id: snapshotId }).lean();
  }

  async getSnapshotsByType(reportType, options = {}) {
    const { limit = 50, startDate, endDate } = options;
    const query = { report_type: reportType };
    if (startDate || endDate) {
      query['period.end_date'] = {};
      if (startDate) query['period.end_date'].$gte = new Date(startDate);
      if (endDate) query['period.end_date'].$lte = new Date(endDate);
    }
    return ReportSnapshot.find(query).sort({ 'period.end_date': -1 }).limit(limit).lean();
  }

  async verifySnapshot(snapshotId) {
    const snapshot = await ReportSnapshot.findOne({ snapshot_id: snapshotId }).lean();
    if (!snapshot) return { valid: false, reason: 'not_found' };

    const computed_hash = ReportSnapshot.computeReportHash({
      report_type: snapshot.report_type,
      period: snapshot.period,
      data: snapshot.data,
      version: snapshot.report_version,
    });

    return {
      valid: computed_hash === snapshot.report_hash,
      snapshot_id: snapshotId,
      expected: computed_hash,
      actual: snapshot.report_hash,
    };
  }

  async getHistoricalReports(reportType, periodEndDate) {
    return ReportSnapshot.find({
      report_type: reportType,
      'period.end_date': new Date(periodEndDate),
    }).sort({ report_version: -1 }).lean();
  }

  async getNextVersion(reportType, endDate) {
    const latest = await ReportSnapshot.findOne({
      report_type: reportType,
      'period.end_date': new Date(endDate),
    }).sort({ report_version: -1 }).lean();
    return (latest?.report_version || 0) + 1;
  }

  async verifyAllSnapshots() {
    const snapshots = await ReportSnapshot.find().lean();
    let valid = 0;
    let invalid = 0;

    for (const snap of snapshots) {
      const result = await this.verifySnapshot(snap.snapshot_id);
      if (result.valid) valid++;
      else invalid++;
    }

    return { total: snapshots.length, valid, invalid };
  }
}

export default new ReportSnapshotService();
