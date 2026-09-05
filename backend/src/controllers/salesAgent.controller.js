import salesAgentService from '../services/salesAgent.service.js';
import logger from '../config/logger.js';

export const createAgent = async (req, res) => {
  try {
    const agent = await salesAgentService.createAgent(req.body);
    res.status(201).json({ success: true, data: agent });
  } catch (error) {
    logger.error('Create agent error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getAgents = async (req, res) => {
  try {
    const { page, limit, search, region, role, isActive } = req.query;
    const result = await salesAgentService.getAgents({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search, region, role, isActive,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Get agents error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAgentById = async (req, res) => {
  try {
    const agent = await salesAgentService.getAgentById(req.params.id);
    res.json({ success: true, data: agent });
  } catch (error) {
    logger.error('Get agent error:', error);
    res.status(404).json({ success: false, message: error.message });
  }
};

export const updateAgent = async (req, res) => {
  try {
    const agent = await salesAgentService.updateAgent(req.params.id, req.body);
    res.json({ success: true, data: agent });
  } catch (error) {
    logger.error('Update agent error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const deleteAgent = async (req, res) => {
  try {
    await salesAgentService.deleteAgent(req.params.id);
    res.json({ success: true, message: 'Agent deactivated' });
  } catch (error) {
    logger.error('Delete agent error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getAgentDashboard = async (req, res) => {
  try {
    const dashboard = await salesAgentService.getAgentDashboard(req.params.id);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    logger.error('Get agent dashboard error:', error);
    res.status(404).json({ success: false, message: error.message });
  }
};

export const getAgentPerformance = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const perf = await salesAgentService.getAgentPerformance(req.params.id, fromDate, toDate);
    res.json({ success: true, data: perf });
  } catch (error) {
    logger.error('Get agent performance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const assignDealer = async (req, res) => {
  try {
    const agent = await salesAgentService.assignDealer(req.params.agentId, req.params.dealerId);
    res.json({ success: true, data: agent });
  } catch (error) {
    logger.error('Assign dealer error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const unassignDealer = async (req, res) => {
  try {
    await salesAgentService.unassignDealer(req.params.agentId, req.params.dealerId);
    res.json({ success: true, message: 'Dealer unassigned' });
  } catch (error) {
    logger.error('Unassign dealer error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getAgentMap = async (req, res) => {
  try {
    const agents = await salesAgentService.getAgentMap();
    res.json({ success: true, data: agents });
  } catch (error) {
    logger.error('Get agent map error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
