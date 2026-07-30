import expenseService from '../services/expense.service.js';
import logger from '../config/logger.js';

// @desc    Create expense
// @route   POST /api/v1/expenses
// @access  Private
export const createExpense = async (req, res) => {
  try {
    const expense = await expenseService.createExpense(
      req.body,
      req.user._id,
      req.files
    );
    
    res.status(201).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    logger.error('Create expense error:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get expenses
// @route   GET /api/v1/expenses
// @access  Private
export const getExpenses = async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      category: req.query.category,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      submittedBy: req.query.submittedBy,
      search: req.query.search,
    };
    
    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      sortBy: req.query.sortBy || 'date',
      sortOrder: req.query.sortOrder || 'desc',
    };
    
    const result = await expenseService.getExpenses(filters, pagination);
    
    res.json({
      success: true,
      data: result.expenses,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Get expenses error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single expense
// @route   GET /api/v1/expenses/:id
// @access  Private
export const getExpense = async (req, res) => {
  try {
    const expense = await expenseService.getExpenseById(req.params.id);
    
    // Check if user can view this expense
    if (req.user.role === 'viewer' && expense.submittedBy?._id?.toString() !== req.user._id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this expense',
      });
    }
    
    res.json({
      success: true,
      data: expense,
    });
  } catch (error) {
    logger.error('Get expense error:', error);
    const statusCode = error.message === 'Expense not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update expense
// @route   PUT /api/v1/expenses/:id
// @access  Private
export const updateExpense = async (req, res) => {
  try {
    const expense = await expenseService.getExpenseById(req.params.id);
    
    // Check if user can update this expense
    if (req.user.role !== 'admin' && req.user.role !== 'accountant' && 
        expense.submittedBy._id.toString() !== req.user._id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this expense',
      });
    }
    
    const updatedExpense = await expenseService.updateExpense(
      req.params.id,
      req.body,
      req.files
    );
    
    res.json({
      success: true,
      data: updatedExpense,
    });
  } catch (error) {
    logger.error('Update expense error:', error);
    const statusCode = error.message === 'Expense not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Approve expense
// @route   POST /api/v1/expenses/:id/approve
// @access  Private (accountant, admin)
export const approveExpense = async (req, res) => {
  try {
    const { expense, autoRecordWarning } = await expenseService.approveExpense(req.params.id, req.user._id);

    const response = { success: true, data: expense };
    if (autoRecordWarning) {
      response.warnings = [autoRecordWarning];
    }
    res.json(response);
  } catch (error) {
    logger.error('Approve expense error:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Reject expense
// @route   POST /api/v1/expenses/:id/reject
// @access  Private (accountant, admin)
export const rejectExpense = async (req, res) => {
  try {
    const { reason } = req.body;
    
    // Use default reason if not provided
    const rejectionReason = reason || 'Rejected by reviewer';
    
    const expense = await expenseService.rejectExpense(
      req.params.id,
      rejectionReason,
      req.user._id
    );
    
    res.json({
      success: true,
      data: expense,
    });
  } catch (error) {
    logger.error('Reject expense error:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Record expense in ledger
// @route   POST /api/v1/expenses/:id/record
// @access  Private (accountant, admin)
export const recordExpense = async (req, res) => {
  try {
    const expense = await expenseService.recordExpense(req.params.id, req.user._id);
    
    res.json({
      success: true,
      data: expense,
    });
  } catch (error) {
    logger.error('Record expense error:', error);
    const payload = {
      success: false,
      message: error.message,
    };
    if (error.code) payload.code = error.code;
    if (error.details) payload.details = error.details;
    res.status(400).json(payload);
  }
};

// @desc    Delete receipt
// @route   DELETE /api/v1/expenses/:id/receipts/:receiptId
// @access  Private
export const deleteReceipt = async (req, res) => {
  try {
    const expense = await expenseService.getExpenseById(req.params.id);
    
    // Check if user can delete receipt
    if (req.user.role !== 'admin' && req.user.role !== 'accountant' && 
        expense.submittedBy._id.toString() !== req.user._id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this receipt',
      });
    }
    
    const updatedExpense = await expenseService.deleteReceipt(
      req.params.id,
      req.params.receiptId
    );
    
    res.json({
      success: true,
      data: updatedExpense,
      message: 'Receipt deleted successfully',
    });
  } catch (error) {
    logger.error('Delete receipt error:', error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get expense stats
// @route   GET /api/v1/expenses/stats
// @access  Private
export const getExpenseStats = async (req, res) => {
  try {
    const stats = await expenseService.getExpenseStats(
      req.query.dateFrom,
      req.query.dateTo
    );
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Get expense stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};