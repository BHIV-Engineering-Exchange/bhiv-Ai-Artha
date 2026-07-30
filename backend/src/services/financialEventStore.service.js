import FinancialEvent from '../models/FinancialEvent.js';
import logger from '../config/logger.js';

class FinancialEventStore {
  constructor() {
    this._lastHash = '0';
    this._chainPosition = 0;
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) return;
    const latest = await FinancialEvent.findOne().sort({ chain_position: -1 }).lean();
    if (latest) {
      this._lastHash = latest.event_hash;
      this._chainPosition = latest.chain_position;
    }
    this._initialized = true;
    logger.info(`FinancialEventStore initialized — chain position: ${this._chainPosition}`);
  }

  async append(eventData) {
    await this.initialize();

    const event_id = FinancialEvent.generateEventId();
    const chain_position = this._chainPosition + 1;
    const previous_hash = this._lastHash;

    const event_hash = FinancialEvent.computeHash({
      event_id,
      aggregate_id: eventData.aggregate_id,
      aggregate_type: eventData.aggregate_type,
      event_type: eventData.event_type,
      timestamp: eventData.timestamp || new Date(),
      user_id: eventData.user_id,
      trace_id: eventData.trace_id,
      payload: eventData.payload,
    }, previous_hash);

    const event = await FinancialEvent.create({
      event_id,
      aggregate_id: eventData.aggregate_id,
      aggregate_type: eventData.aggregate_type,
      event_type: eventData.event_type,
      parent_event_id: eventData.parent_event_id || null,
      timestamp: eventData.timestamp || new Date(),
      user_id: eventData.user_id || 'system',
      trace_id: eventData.trace_id,
      schema_version: FinancialEvent.SCHEMA_VERSION,
      payload: eventData.payload,
      previous_hash,
      event_hash,
      chain_position,
    });

    this._lastHash = event_hash;
    this._chainPosition = chain_position;

    return event;
  }

  async appendBatch(events) {
    await this.initialize();
    const results = [];

    for (const eventData of events) {
      const result = await this.append(eventData);
      results.push(result);
    }

    return results;
  }

  async getEventsByAggregate(aggregateId, options = {}) {
    const { fromTimestamp, toTimestamp, eventTypes, limit = 100 } = options;
    const query = { aggregate_id: aggregateId };
    if (fromTimestamp || toTimestamp) {
      query.timestamp = {};
      if (fromTimestamp) query.timestamp.$gte = new Date(fromTimestamp);
      if (toTimestamp) query.timestamp.$lte = new Date(toTimestamp);
    }
    if (eventTypes?.length) query.event_type = { $in: eventTypes };

    return FinancialEvent.find(query).sort({ chain_position: 1 }).limit(limit).lean();
  }

  async getEventsByType(eventType, options = {}) {
    const { fromTimestamp, toTimestamp, limit = 100, skip = 0 } = options;
    const query = { event_type: eventType };
    if (fromTimestamp || toTimestamp) {
      query.timestamp = {};
      if (fromTimestamp) query.timestamp.$gte = new Date(fromTimestamp);
      if (toTimestamp) query.timestamp.$lte = new Date(toTimestamp);
    }

    return FinancialEvent.find(query).sort({ chain_position: 1 }).skip(skip).limit(limit).lean();
  }

  async getEventsByTrace(traceId) {
    return FinancialEvent.find({ trace_id: traceId }).sort({ chain_position: 1 }).lean();
  }

  async getEventsInRange(fromChainPosition, toChainPosition) {
    return FinancialEvent.find({
      chain_position: { $gte: fromChainPosition, $lte: toChainPosition },
    }).sort({ chain_position: 1 }).lean();
  }

  async getEventsFromCheckpoint(fromPosition = 0, limit = 1000) {
    return FinancialEvent.find({
      chain_position: { $gt: fromPosition },
    }).sort({ chain_position: 1 }).limit(limit).lean();
  }

  async getLatestEvent() {
    return FinancialEvent.findOne().sort({ chain_position: -1 }).lean();
  }

  async getEventById(eventId) {
    return FinancialEvent.findOne({ event_id: eventId }).lean();
  }

  async verifyChain(fromPosition = 0, toPosition = null) {
    const query = { chain_position: { $gte: fromPosition } };
    if (toPosition) query.chain_position.$lte = toPosition;

    const events = await FinancialEvent.find(query).sort({ chain_position: 1 }).lean();
    if (!events.length) return { valid: true, verified: 0 };

    let prevHash = fromPosition === 0 ? '0' : null;
    let verified = 0;

    for (const event of events) {
      if (prevHash === null) {
        prevHash = event.previous_hash;
      } else if (event.previous_hash !== prevHash) {
        return {
          valid: false,
          verified,
          broken_at: event.event_id,
          expected_prev: prevHash,
          actual_prev: event.previous_hash,
        };
      }

      const computedHash = FinancialEvent.computeHash({
        event_id: event.event_id,
        aggregate_id: event.aggregate_id,
        aggregate_type: event.aggregate_type,
        event_type: event.event_type,
        timestamp: event.timestamp,
        user_id: event.user_id,
        trace_id: event.trace_id,
        payload: event.payload,
      }, event.previous_hash);

      if (computedHash !== event.event_hash) {
        return {
          valid: false,
          verified,
          broken_at: event.event_id,
          reason: 'hash_mismatch',
          expected: computedHash,
          actual: event.event_hash,
        };
      }

      prevHash = event.event_hash;
      verified++;
    }

    return { valid: true, verified, total: events.length };
  }

  async getStats() {
    const [totalEvents, typeBreakdown, latestEvent] = await Promise.all([
      FinancialEvent.countDocuments(),
      FinancialEvent.aggregate([
        { $group: { _id: '$event_type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      FinancialEvent.findOne().sort({ chain_position: -1 }).lean(),
    ]);

    return {
      total_events: totalEvents,
      chain_position: latestEvent?.chain_position || 0,
      latest_event_hash: latestEvent?.event_hash || null,
      type_breakdown: typeBreakdown,
    };
  }
}

export default new FinancialEventStore();
