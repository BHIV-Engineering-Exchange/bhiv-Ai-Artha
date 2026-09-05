import SalesAgent from '../models/SalesAgent.js';
import Dealer from '../models/Dealer.js';
import Visit from '../models/Visit.js';
import LocationPing from '../models/LocationPing.js';
import logger from '../config/logger.js';

class SalesAgentService {
  async createAgent(data) {
    if (!data.agentCode) {
      const count = await SalesAgent.countDocuments();
      data.agentCode = `AGT-${String(count + 1).padStart(5, '0')}`;
    }
    return SalesAgent.create(data);
  }

  async getAgents({ page = 1, limit = 20, search, region, role, isActive } = {}) {
    const query = {};
    if (search) query.$text = { $search: search };
    if (region) query.region = region;
    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const total = await SalesAgent.countDocuments(query);
    const agents = await SalesAgent.find(query)
      .populate('assignedDealers', 'name city outstandingBalance')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      agents,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getAgentById(id) {
    return SalesAgent.findById(id)
      .populate('assignedDealers', 'name city outstandingBalance overdueAmount lastVisitDate')
      .populate('manager', 'name region')
      .lean();
  }

  async updateAgent(id, data) {
    return SalesAgent.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  }

  async deleteAgent(id) {
    return SalesAgent.findByIdAndUpdate(id, { isActive: false }, { new: true });
  }

  async getAgentDashboard(agentId) {
    const agent = await SalesAgent.findById(agentId).lean();
    if (!agent) throw new Error('Agent not found');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [visitsToday, activeVisits, recentPings, dealerCount] = await Promise.all([
      Visit.countDocuments({ agentId, createdAt: { $gte: today } }),
      Visit.countDocuments({ agentId, status: 'in-progress' }),
      LocationPing.find({ agentId }).sort({ createdAt: -1 }).limit(1).lean(),
      Dealer.countDocuments({ assignedAgent: agentId, isActive: true }),
    ]);

    const visitStats = await Visit.aggregate([
      { $match: { agentId: agent._id } },
      { $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalOrder: { $sum: '$totalOrderAmount' },
        totalCollection: { $sum: '$collectionAmount' },
      }},
    ]);

    const last7Days = await Visit.aggregate([
      { $match: {
        agentId: agent._id,
        createdAt: { $gte: new Date(Date.now() - 7 * 86400000) },
      }},
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        visits: { $sum: 1 },
        orders: { $sum: '$totalOrderAmount' },
        collections: { $sum: '$collectionAmount' },
      }},
      { $sort: { _id: 1 } },
    ]);

    return {
      agent,
      todayStats: { visitsToday, activeVisits },
      currentLocation: recentPings[0] || null,
      assignedDealers: dealerCount,
      visitStats,
      last7Days,
      target: {
        amount: agent.targetAmount,
        achieved: agent.targetAchieved,
        percent: agent.targetProgress,
      },
    };
  }

  async getAgentPerformance(agentId, fromDate, toDate) {
    const query = { agentId };
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    const visits = await Visit.find(query).lean();
    const totalVisits = visits.length;
    const completedVisits = visits.filter(v => v.status === 'completed').length;
    const totalOrders = visits.reduce((s, v) => s + (v.totalOrderAmount || 0), 0);
    const totalCollections = visits.reduce((s, v) => s + (v.collectionAmount || 0), 0);
    const avgDuration = visits.filter(v => v.duration > 0).reduce((s, v) => s + v.duration, 0) /
      (visits.filter(v => v.duration > 0).length || 1);

    const uniqueDealers = new Set(visits.filter(v => v.dealerId).map(v => String(v.dealerId)));

    return {
      totalVisits,
      completedVisits,
      completionRate: totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0,
      uniqueDealersVisited: uniqueDealers.size,
      totalOrders,
      totalCollections,
      avgVisitDuration: Math.round(avgDuration),
      visitsByOutcome: visits.reduce((acc, v) => {
        acc[v.outcome] = (acc[v.outcome] || 0) + 1;
        return acc;
      }, {}),
    };
  }

  async assignDealer(agentId, dealerId) {
    const agent = await SalesAgent.findById(agentId);
    if (!agent) throw new Error('Agent not found');
    if (!agent.assignedDealers.includes(dealerId)) {
      agent.assignedDealers.push(dealerId);
      await agent.save();
    }
    await Dealer.findByIdAndUpdate(dealerId, { assignedAgent: agentId });
    return agent;
  }

  async unassignDealer(agentId, dealerId) {
    await SalesAgent.findByIdAndUpdate(agentId, { $pull: { assignedDealers: dealerId } });
    await Dealer.findByIdAndUpdate(dealerId, { assignedAgent: null });
  }

  async getAgentMap() {
    const agents = await SalesAgent.find({ isActive: true })
      .select('name region area lastKnownLocation assignedDealers isLocationTrackingEnabled')
      .populate('assignedDealers', 'name city latitude longitude')
      .lean();

    return agents.map(a => ({
      ...a,
      isOnline: a.lastKnownLocation?.timestamp &&
        (Date.now() - new Date(a.lastKnownLocation.timestamp).getTime()) < 30 * 60 * 1000,
    }));
  }
}

export default new SalesAgentService();
