import niyantranService from '../services/niyantran.service.js';
import logger from '../config/logger.js';

export const recordPing = async (req, res) => {
  try {
    const ping = await niyantranService.recordPing(req.body);
    res.status(201).json({ success: true, data: ping });
  } catch (error) {
    logger.error('Record ping error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getAgentLocation = async (req, res) => {
  try {
    const location = await niyantranService.getAgentLocation(req.params.agentId);
    res.json({ success: true, data: location });
  } catch (error) {
    logger.error('Get agent location error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllAgentLocations = async (req, res) => {
  try {
    const locations = await niyantranService.getAllAgentLocations();
    res.json({ success: true, data: locations });
  } catch (error) {
    logger.error('Get all agent locations error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAgentRoute = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { fromDate, toDate } = req.query;
    const route = await niyantranService.getAgentRoute(agentId, fromDate, toDate);
    res.json({ success: true, data: route });
  } catch (error) {
    logger.error('Get agent route error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const checkIn = async (req, res) => {
  try {
    const { agentId, dealerId, latitude, longitude, address } = req.body;
    const visit = await niyantranService.checkIn(agentId, dealerId, latitude, longitude, address);
    res.status(201).json({ success: true, data: visit });
  } catch (error) {
    logger.error('Check-in error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const checkOut = async (req, res) => {
  try {
    const { latitude, longitude, address, outcome, notes } = req.body;
    const visit = await niyantranService.checkOut(req.params.visitId, latitude, longitude, address, outcome, notes);
    res.json({ success: true, data: visit });
  } catch (error) {
    logger.error('Check-out error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getActiveVisits = async (req, res) => {
  try {
    const visits = await niyantranService.getActiveVisits();
    res.json({ success: true, data: visits });
  } catch (error) {
    logger.error('Get active visits error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getVisits = async (req, res) => {
  try {
    const { agentId, fromDate, toDate } = req.query;
    const visits = await niyantranService.getVisits(agentId, fromDate, toDate);
    res.json({ success: true, data: visits });
  } catch (error) {
    logger.error('Get visits error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
