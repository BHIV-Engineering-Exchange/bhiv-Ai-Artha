import mongoose from 'mongoose';
import LocationPing from '../models/LocationPing.js';
import SalesAgent from '../models/SalesAgent.js';
import Dealer from '../models/Dealer.js';
import Visit from '../models/Visit.js';
import logger from '../config/logger.js';
import notificationEvent from './notificationEvent.service.js';

class NiyantranService {
  constructor() {
    this.DEALER_RADIUS_KM = 0.5;
    this.IDLE_THRESHOLD_MS = 15 * 60 * 1000;
  }

  async recordPing(data) {
    const ping = await LocationPing.create({
      agentId: data.agentId,
      agentName: data.agentName,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy || 0,
      altitude: data.altitude || null,
      speed: data.speed || null,
      heading: data.heading || null,
      batteryLevel: data.batteryLevel || null,
      batteryCharging: data.batteryCharging || false,
      networkType: data.networkType || 'unknown',
      deviceId: data.deviceId || '',
      devicePlatform: data.devicePlatform || 'web',
      address: data.address || '',
      source: data.source || 'niyantran-app',
    });

    const nearbyDealer = await this.findNearbyDealer(data.latitude, data.longitude);
    if (nearbyDealer) {
      ping.nearbyDealer = nearbyDealer._id;
      ping.isAtDealer = true;
      await ping.save();
    }

    await SalesAgent.findByIdAndUpdate(data.agentId, {
      'lastKnownLocation.latitude': data.latitude,
      'lastKnownLocation.longitude': data.longitude,
      'lastKnownLocation.timestamp': new Date(),
      'lastKnownLocation.address': data.address || '',
    });

    return ping;
  }

  async findNearbyDealer(lat, lng) {
    const dealers = await Dealer.find({
      isActive: true,
      latitude: { $ne: null },
      longitude: { $ne: null },
    }).limit(50);

    let closest = null;
    let closestDist = Infinity;

    for (const dealer of dealers) {
      const dist = this.haversineDistance(lat, lng, dealer.latitude, dealer.longitude);
      if (dist < this.DEALER_RADIUS_KM && dist < closestDist) {
        closest = dealer;
        closestDist = dist;
      }
    }

    return closest;
  }

  haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  toRad(deg) { return deg * (Math.PI / 180); }

  async getAgentLocation(agentId) {
    const ping = await LocationPing.findOne({ agentId })
      .sort({ createdAt: -1 })
      .populate('nearbyDealer', 'name city area')
      .lean();
    return ping;
  }

  async getAllAgentLocations() {
    const pipeline = [
      { $sort: { createdAt: -1 } },
      { $group: {
        _id: '$agentId',
        agentName: { $first: '$agentName' },
        latitude: { $first: '$latitude' },
        longitude: { $first: '$longitude' },
        address: { $first: '$address' },
        batteryLevel: { $first: '$batteryLevel' },
        networkType: { $first: '$networkType' },
        nearbyDealer: { $first: '$nearbyDealer' },
        isAtDealer: { $first: '$isAtDealer' },
        lastPing: { $first: '$createdAt' },
      }},
      { $lookup: {
        from: 'dealers',
        localField: 'nearbyDealer',
        foreignField: '_id',
        as: 'dealerInfo',
      }},
      { $unwind: { path: '$dealerInfo', preserveNullAndEmptyArrays: true } },
      { $project: {
        _id: 1,
        agentId: '$_id',
        agentName: 1,
        latitude: 1,
        longitude: 1,
        address: 1,
        batteryLevel: 1,
        networkType: 1,
        isAtDealer: 1,
        lastPing: 1,
        dealerName: '$dealerInfo.name',
        dealerCity: '$dealerInfo.city',
      }},
    ];

    return LocationPing.aggregate(pipeline);
  }

  async getAgentRoute(agentId, fromDate, toDate) {
    const query = { agentId };
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    return LocationPing.find(query)
      .sort({ createdAt: 1 })
      .select('latitude longitude address createdAt nearbyDealer isAtDealer speed')
      .lean();
  }

  async getVisits(agentId, fromDate, toDate) {
    const query = {};
    if (agentId) query.agentId = agentId;
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }
    return Visit.find(query).sort({ createdAt: -1 }).lean();
  }

  async checkIn(agentId, dealerId, lat, lng, address) {
    const agent = await SalesAgent.findById(agentId);
    if (!agent) throw new Error('Agent not found');

    const dealer = dealerId ? await Dealer.findById(dealerId) : null;

    const visit = await Visit.create({
      agentId,
      agentName: agent.name,
      dealerId: dealer ? dealer._id : null,
      dealerName: dealer ? dealer.name : '',
      visitType: 'check-in',
      status: 'in-progress',
      checkIn: { time: new Date(), latitude: lat, longitude: lng, address: address || '' },
      purpose: '',
    });

    await SalesAgent.findByIdAndUpdate(agentId, { $inc: { totalVisits: 1 } });
    if (dealer) {
      await Dealer.findByIdAndUpdate(dealerId, {
        lastVisitDate: new Date(),
        $inc: { visits: 1 },
      });
    }

    notificationEvent.agentCheckIn(agent.name, dealer?.name || 'Unknown').catch(() => {});

    return visit;
  }

  async checkOut(visitId, lat, lng, address, outcome, notes) {
    const visit = await Visit.findById(visitId);
    if (!visit) throw new Error('Visit not found');

    visit.checkOut = { time: new Date(), latitude: lat, longitude: lng, address: address || '' };
    visit.status = 'completed';
    if (outcome) visit.outcome = outcome;
    if (notes) visit.notes = notes;
    await visit.save();

    const agent = await SalesAgent.findById(visit.agentId).select('name');
    const dealer = visit.dealerId ? await Dealer.findById(visit.dealerId).select('name') : null;
    notificationEvent.agentCheckOut(agent?.name || 'Agent', dealer?.name || 'Unknown', outcome).catch(() => {});

    return visit;
  }

  async getActiveVisits() {
    return Visit.find({ status: 'in-progress' })
      .populate('agentId', 'name region area')
      .populate('dealerId', 'name city area')
      .sort({ 'checkIn.time': -1 })
      .lean();
  }
}

export default new NiyantranService();
