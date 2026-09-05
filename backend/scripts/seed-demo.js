import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Dealer from '../src/models/Dealer.js';
import SalesAgent from '../src/models/SalesAgent.js';
import LocationPing from '../src/models/LocationPing.js';
import Visit from '../src/models/Visit.js';
import Notification from '../src/models/Notification.js';
import User from '../src/models/User.js';
import logger from '../src/config/logger.js';

// Bright Connection Delhi/NCR demo data
const DEMO_DEALERS = [
  { name: 'Sharma Electronics', city: 'Delhi', region: 'North Delhi', area: 'Karol Bagh', lat: 28.6519, lng: 77.1898, outstanding: 245000, overdue: 85000, phone: '9810123456', gstin: '07AABCS1234F1Z5' },
  { name: 'Gupta Traders', city: 'Delhi', region: 'North Delhi', area: 'Rohini', lat: 28.7498, lng: 77.0654, outstanding: 178000, overdue: 0, phone: '9810234567', gstin: '07AABCG5678G1Z3' },
  { name: 'Patel & Sons', city: 'Gurgaon', region: 'Gurgaon', area: 'Sohna Road', lat: 28.4595, lng: 77.0266, outstanding: 312000, overdue: 112000, phone: '9810345678', gstin: '06AABCP9012H1Z1' },
  { name: 'Mehta Brothers', city: 'Gurgaon', region: 'Gurgaon', area: 'DLF Phase 3', lat: 28.4949, lng: 77.0883, outstanding: 89000, overdue: 0, phone: '9810456789', gstin: '06AABCM3456J1Z8' },
  { name: 'Kumar Enterprises', city: 'Noida', region: 'Noida-Ghaziabad', area: 'Sector 62', lat: 28.6270, lng: 77.3710, outstanding: 456000, overdue: 200000, phone: '9810567890', gstin: '09AABCK7890K1Z6' },
  { name: 'Agarwal & Co', city: 'Noida', region: 'Noida-Ghaziabad', area: 'Sector 18', lat: 28.5733, lng: 77.3240, outstanding: 134000, overdue: 34000, phone: '9810678901', gstin: '09AABCA2345L1Z4' },
  { name: 'Singh Trading Co', city: 'Faridabad', region: 'Faridabad', area: 'NIT', lat: 28.4089, lng: 77.3178, outstanding: 67000, overdue: 0, phone: '9810789012', gstin: '06AABCJ6789M1Z2' },
  { name: 'Reddy Industries', city: 'Faridabad', region: 'Faridabad', area: 'Ballabgarh', lat: 28.3360, lng: 77.3140, outstanding: 201000, overdue: 101000, phone: '9810890123', gstin: '06AABCR0123N1Z0' },
  { name: 'Jain Hardware', city: 'Delhi', region: 'South Delhi', area: 'Lajpat Nagar', lat: 28.5677, lng: 77.2405, outstanding: 156000, overdue: 56000, phone: '9810901234', gstin: '07AABCJ4567P1Z8' },
  { name: 'Verma Sales Corp', city: 'Delhi', region: 'South Delhi', area: 'Nehru Place', lat: 28.5491, lng: 77.2530, outstanding: 289000, overdue: 0, phone: '9811012345', gstin: '07AABCV8901Q1Z6' },
  { name: 'Bansal Mart', city: 'Ghaziabad', region: 'Noida-Ghaziabad', area: 'Kaushambi', lat: 28.6380, lng: 77.3230, outstanding: 98000, overdue: 28000, phone: '9811123456', gstin: '09AABCB2345R1Z4' },
  { name: 'Tiwari Electronics', city: 'Delhi', region: 'East Delhi', area: 'Preet Vihar', lat: 28.6428, lng: 77.2971, outstanding: 175000, overdue: 75000, phone: '9811234567', gstin: '07AABCT6789S1Z2' },
];

const DEMO_AGENTS = [
  { name: 'Rajesh Kumar', role: 'sales-executive', region: 'North Delhi', area: 'Karol Bagh-Rohini', phone: '9800100001', target: 500000, achieved: 340000, lat: 28.6700, lng: 77.1800 },
  { name: 'Amit Singh', role: 'sales-executive', region: 'Gurgaon', area: 'Sohna-DLF', phone: '9800100002', target: 600000, achieved: 450000, lat: 28.4700, lng: 77.0500 },
  { name: 'Priya Sharma', role: 'field-agent', region: 'Noida-Ghaziabad', area: 'Sector 62-Kaushambi', phone: '9800100003', target: 400000, achieved: 220000, lat: 28.6100, lng: 77.3500 },
  { name: 'Vikram Patel', role: 'sales-executive', region: 'Faridabad', area: 'NIT-Ballabgarh', phone: '9800100004', target: 350000, achieved: 180000, lat: 28.3900, lng: 77.3100 },
  { name: 'Deepak Gupta', role: 'sales-manager', region: 'South Delhi', area: 'Lajpat-Nehru', phone: '9800100005', target: 800000, achieved: 620000, lat: 28.5500, lng: 77.2400 },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB for demo seed');

    // Clear old demo data
    await Dealer.deleteMany({});
    await SalesAgent.deleteMany({});
    await LocationPing.deleteMany({});
    await Visit.deleteMany({});
    await Notification.deleteMany({});
    logger.info('Cleared old demo data');

    // Ensure demo admin user exists
    const existingAdmin = await User.findOne({ email: 'admin@brightconnection.in' });
    if (!existingAdmin) {
      await User.create({
        email: 'admin@brightconnection.in',
        password: 'admin123',
        name: 'Demo Admin',
        role: 'admin',
        isActive: true,
      });
      logger.info('Created demo admin user');
    }

    // Create dealers
    const dealerDocs = [];
    for (let i = 0; i < DEMO_DEALERS.length; i++) {
      const d = DEMO_DEALERS[i];
      const dealer = await Dealer.create({
        dealerCode: `BC-DEMO-${String(i + 1).padStart(3, '0')}`,
        name: d.name,
        displayName: d.name,
        contactPerson: `Owner - ${d.name}`,
        phone: d.phone,
        email: `info@${d.name.toLowerCase().replace(/[^a-z]/g, '')}.in`,
        address: `${d.area}, ${d.city}`,
        city: d.city,
        state: 'Delhi',
        pincode: '1100' + String(Math.floor(Math.random() * 90) + 10),
        latitude: d.lat,
        longitude: d.lng,
        region: d.region,
        area: d.area,
        gstin: d.gstin,
        creditLimit: 500000,
        outstandingBalance: d.outstanding,
        overdueAmount: d.overdue,
        lastBillingDate: new Date(Date.now() - Math.floor(Math.random() * 15) * 86400000),
        lastPaymentDate: d.overdue === 0 ? new Date(Date.now() - Math.floor(Math.random() * 5) * 86400000) : null,
        isActive: true,
        visits: Math.floor(Math.random() * 12) + 1,
        lastVisitDate: new Date(Date.now() - Math.floor(Math.random() * 7) * 86400000),
        tallyPartyId: `DEMO-${d.name.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 8)}`,
      });
      dealerDocs.push(dealer);
    }
    logger.info(`Created ${dealerDocs.length} demo dealers`);

    // Create agents
    const agentDocs = [];
    for (let i = 0; i < DEMO_AGENTS.length; i++) {
      const a = DEMO_AGENTS[i];
      // Assign 2-3 dealers per agent
      const startIdx = (i * 2) % dealerDocs.length;
      const assignedDealerIds = [dealerDocs[startIdx]._id, dealerDocs[(startIdx + 1) % dealerDocs.length]._id];

      const agent = await SalesAgent.create({
        agentCode: `AGT-DEMO-${String(i + 1).padStart(3, '0')}`,
        name: a.name,
        phone: a.phone,
        email: `${a.name.toLowerCase().replace(/[^a-z]/g, '')}@brightconnection.in`,
        role: a.role,
        region: a.region,
        area: a.area,
        assignedDealers: assignedDealerIds,
        isActive: true,
        isLocationTrackingEnabled: true,
        lastKnownLocation: {
          latitude: a.lat,
          longitude: a.lng,
          timestamp: new Date(Date.now() - Math.floor(Math.random() * 30) * 60000),
          address: `${a.area}, ${a.region}`,
        },
        totalVisits: Math.floor(Math.random() * 50) + 10,
        totalSales: a.achieved,
        targetAmount: a.target,
        targetAchieved: a.achieved,
        targetAchievedPercent: Math.round((a.achieved / a.target) * 100),
        joinedAt: new Date('2024-04-01'),
      });

      // Update dealers with assigned agent
      for (const did of assignedDealerIds) {
        await Dealer.findByIdAndUpdate(did, { assignedAgent: agent._id });
      }

      agentDocs.push(agent);
    }
    logger.info(`Created ${agentDocs.length} demo agents`);

    // Create location pings (last 2 hours)
    const now = Date.now();
    for (const agent of agentDocs) {
      // Generate 6-10 pings per agent over last 2 hours
      const pingCount = Math.floor(Math.random() * 5) + 6;
      for (let j = 0; j < pingCount; j++) {
        const timeAgo = (j * 12 + Math.floor(Math.random() * 5)) * 60000;
        const latOffset = (Math.random() - 0.5) * 0.01;
        const lngOffset = (Math.random() - 0.5) * 0.01;
        const nearestDealer = dealerDocs[Math.floor(Math.random() * dealerDocs.length)];

        await LocationPing.create({
          agentId: agent._id,
          agentName: agent.name,
          latitude: agent.lastKnownLocation.latitude + latOffset,
          longitude: agent.lastKnownLocation.longitude + lngOffset,
          accuracy: Math.floor(Math.random() * 15) + 5,
          batteryLevel: Math.floor(Math.random() * 40) + 60,
          batteryCharging: Math.random() > 0.8,
          networkType: ['4g', '5g', 'wifi'][Math.floor(Math.random() * 3)],
          deviceId: `DEMO-DEVICE-${agent.agentCode}`,
          devicePlatform: 'android',
          address: `${agent.area}, ${agent.region}`,
          nearbyDealer: nearestDealer._id,
          isAtDealer: j < 2,
          source: 'niyantran-app',
          createdAt: new Date(now - timeAgo),
        });
      }
    }
    logger.info('Created demo location pings');

    // Create visits
    for (const agent of agentDocs) {
      const assignedDealers = dealerDocs.filter(d =>
        agent.assignedDealers.some(id => id.toString() === d._id.toString())
      );
      for (const dealer of assignedDealers) {
        // Create one completed visit and one active visit per dealer
        const hoursAgo = Math.floor(Math.random() * 48) + 2;
        await Visit.create({
          agentId: agent._id,
          agentName: agent.name,
          dealerId: dealer._id,
          dealerName: dealer.name,
          visitType: ['check-in', 'collection', 'meeting'][Math.floor(Math.random() * 3)],
          status: 'completed',
          checkIn: {
            time: new Date(now - hoursAgo * 3600000),
            latitude: dealer.latitude + (Math.random() - 0.5) * 0.001,
            longitude: dealer.longitude + (Math.random() - 0.5) * 0.001,
            address: `${dealer.area}, ${dealer.city}`,
          },
          checkOut: {
            time: new Date(now - (hoursAgo - 1) * 3600000),
            latitude: dealer.latitude,
            longitude: dealer.longitude,
          },
          duration: Math.floor(Math.random() * 90) + 15,
          purpose: 'Regular visit and collection',
          notes: `Discussed outstanding payment of Rs ${dealer.outstandingBalance}`,
          outcome: Math.random() > 0.5 ? 'payment-collected' : 'order-placed',
          totalOrderAmount: Math.floor(Math.random() * 50000) + 10000,
          collectionAmount: Math.floor(Math.random() * dealer.outstandingBalance * 0.3),
        });
      }

      // One active visit for first agent
      if (agentDocs.indexOf(agent) === 0 && assignedDealers.length > 0) {
        const dealer = assignedDealers[0];
        await Visit.create({
          agentId: agent._id,
          agentName: agent.name,
          dealerId: dealer._id,
          dealerName: dealer.name,
          visitType: 'check-in',
          status: 'in-progress',
          checkIn: {
            time: new Date(now - 45 * 60000),
            latitude: dealer.latitude,
            longitude: dealer.longitude,
            address: `${dealer.area}, ${dealer.city}`,
          },
          purpose: 'Delivery follow-up',
          notes: 'Scheduled delivery confirmation',
        });
      }
    }
    logger.info('Created demo visits');

    // Create notifications
    const notifMessages = [
      { title: 'Payment Received', body: 'Sharma Electronics paid Rs 50,000', type: 'payment' },
      { title: 'Visit Completed', body: 'Rajesh Kumar completed visit to Gupta Traders', type: 'visit' },
      { title: 'Overdue Alert', body: 'Kumar Enterprises - Rs 2,00,000 overdue by 15 days', type: 'alert' },
      { title: 'New Order', body: 'Patel & Sons placed order for Rs 75,000', type: 'order' },
      { title: 'Agent Check-in', body: 'Amit Singh checked in at DLF Phase 3', type: 'location' },
    ];
    for (let i = 0; i < notifMessages.length; i++) {
      await Notification.create({
        ...notifMessages[i],
        read: i > 2,
        createdAt: new Date(now - i * 3600000),
      });
    }
    logger.info('Created demo notifications');

    // Print summary
    const dealerCount = await Dealer.countDocuments();
    const agentCount = await SalesAgent.countDocuments();
    const pingCount = await LocationPing.countDocuments();
    const visitCount = await Visit.countDocuments();
    const notifCount = await Notification.countDocuments();

    console.log('\n========================================');
    console.log('  DEMO DATA SEEDED SUCCESSFULLY');
    console.log('========================================');
    console.log(`  Dealers:          ${dealerCount}`);
    console.log(`  Sales Agents:     ${agentCount}`);
    console.log(`  Location Pings:   ${pingCount}`);
    console.log(`  Visits:           ${visitCount}`);
    console.log(`  Notifications:    ${notifCount}`);
    console.log('========================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    logger.error('Demo seed failed:', err);
    console.error(err);
    process.exit(1);
  }
}

seed();
