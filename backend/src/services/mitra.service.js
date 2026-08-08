import axios from 'axios';
import logger from '../config/logger.js';
import JournalEntry from '../models/JournalEntry.js';
import Invoice from '../models/Invoice.js';
import Expense from '../models/Expense.js';
import ChartOfAccounts from '../models/ChartOfAccounts.js';
import AccountBalance from '../models/AccountBalance.js';
import BankStatement from '../models/BankStatement.js';
import TDSEntry from '../models/TDSEntry.js';
import auditService from './audit.service.js';
import tantraService from './tantra.service.js';

/**
 * Role-based capability map for MITRA.
 * Each role can only access its permitted capabilities.
 * MITRA must never bypass these restrictions.
 */
const ROLE_CAPABILITIES = {
  viewer: [
    'reports.view', 'dashboard.view', 'insights.view',
    'invoices.view', 'expenses.view', 'accounts.view',
    'journal_entries.view', 'gst.view', 'tds.view',
    'statements.view',
  ],
  accountant: [
    'reports.view', 'dashboard.view', 'insights.view',
    'invoices.view', 'invoices.create', 'invoices.send', 'invoices.payment',
    'expenses.view', 'expenses.create', 'expenses.approve', 'expenses.record',
    'accounts.view',
    'journal_entries.view', 'journal_entries.create', 'journal_entries.post',
    'gst.view', 'gst.generate', 'tds.view', 'tds.create', 'tds.deduct',
    'statements.view', 'statements.upload', 'statements.process',
    'banking.view', 'banking.payments',
    'reconciliation.view', 'reconciliation.match',
  ],
  admin: [
    'reports.view', 'dashboard.view', 'insights.view',
    'invoices.view', 'invoices.create', 'invoices.send', 'invoices.payment', 'invoices.cancel',
    'expenses.view', 'expenses.create', 'expenses.approve', 'expenses.reject', 'expenses.record',
    'accounts.view', 'accounts.create', 'accounts.update', 'accounts.delete',
    'journal_entries.view', 'journal_entries.create', 'journal_entries.post', 'journal_entries.void',
    'gst.view', 'gst.generate', 'gst.file', 'tds.view', 'tds.create', 'tds.deduct', 'tds.challan',
    'statements.view', 'statements.upload', 'statements.process', 'statements.delete',
    'banking.view', 'banking.payments', 'banking.process',
    'reconciliation.view', 'reconciliation.match',
    'users.view', 'users.create', 'users.update', 'users.delete',
    'settings.view', 'settings.update',
    'system.health', 'system.database',
  ],
};

/**
 * Natural language intent → ARTHA capability + API mapping.
 * Each intent maps to a specific capability check and API call.
 */
const INTENT_MAP = [
  {
    patterns: /revenue|sales|income|earnings|total.*(income|revenue|sales)/i,
    capability: 'reports.view',
    handler: 'getRevenue',
    description: 'Revenue information',
  },
  {
    patterns: /expense|spend|cost|overhead|total.*expense/i,
    capability: 'reports.view',
    handler: 'getExpenses',
    description: 'Expense information',
  },
  {
    patterns: /profit|loss|p&l|net.*(income|profit|loss)/i,
    capability: 'reports.view',
    handler: 'getProfitLoss',
    description: 'Profit & Loss report',
  },
  {
    patterns: /balance\s*sheet|assets|liabilities|equity/i,
    capability: 'reports.view',
    handler: 'getBalanceSheet',
    description: 'Balance Sheet',
  },
  {
    patterns: /cash\s*flow|cash\s*position|cash\s*balance/i,
    capability: 'reports.view',
    handler: 'getCashFlow',
    description: 'Cash Flow report',
  },
  {
    patterns: /overdue|pending.*invoice|unpaid|outstanding/i,
    capability: 'invoices.view',
    handler: 'getOverdueInvoices',
    description: 'Overdue invoices',
  },
  {
    patterns: /gst.*owe|gst.*pending|gst.*payable|output.*gst|input.*gst/i,
    capability: 'gst.view',
    handler: 'getGSTStatus',
    description: 'GST payable status',
  },
  {
    patterns: /tds|tax.*deduct/i,
    capability: 'tds.view',
    handler: 'getTDSStatus',
    description: 'TDS status',
  },
  {
    patterns: /trial\s*balance/i,
    capability: 'reports.view',
    handler: 'getTrialBalance',
    description: 'Trial Balance',
  },
  {
    patterns: /aged.*receivable|receivable.*age/i,
    capability: 'reports.view',
    handler: 'getAgedReceivables',
    description: 'Aged Receivables',
  },
  {
    patterns: /import.*statement|upload.*statement|bank.*statement|ocr.*receipt/i,
    capability: 'statements.upload',
    handler: 'uploadStatement',
    description: 'Upload bank statement',
  },
  {
    patterns: /generate.*report|create.*report|export.*report/i,
    capability: 'reports.view',
    handler: 'generateReport',
    description: 'Generate report',
  },
  {
    patterns: /explain.*expens|why.*expens|reason.*expens|expens.*increas/i,
    capability: 'reports.view',
    handler: 'explainExpenses',
    description: 'Expense analysis',
  },
  {
    patterns: /compare.*quarter|quarter.*compar|vs.*last.*quarter/i,
    capability: 'reports.view',
    handler: 'compareQuarters',
    description: 'Quarter comparison',
  },
  {
    patterns: /dashboard|overview|summary|kpi|health/i,
    capability: 'dashboard.view',
    handler: 'getDashboard',
    description: 'Dashboard summary',
  },
  {
    patterns: /largest.*expense|biggest.*expense|top.*vendor/i,
    capability: 'reports.view',
    handler: 'getTopExpenses',
    description: 'Top expenses analysis',
  },
  {
    patterns: /which.*vendor|vendor.*paid|vendor.*payment/i,
    capability: 'reports.view',
    handler: 'getVendorPayments',
    description: 'Vendor payments',
  },
  {
    patterns: /unmatch|unreconcil|not.*match/i,
    capability: 'reconciliation.view',
    handler: 'getUnmatchedTransactions',
    description: 'Unmatched transactions',
  },
  {
    patterns: /duplicat|duplicate.*transaction/i,
    capability: 'reports.view',
    handler: 'getDuplicateTransactions',
    description: 'Duplicate transactions',
  },
  {
    patterns: /gst.*payment|payment.*gst|gst.*challan/i,
    capability: 'gst.view',
    handler: 'getGSTPayments',
    description: 'GST payments',
  },
];

class MitraService {
  constructor() {
    this._client = null;
  }

  _getClient() {
    if (this._client) return this._client;

    const baseURL = process.env.MITRA_API_URL || 'https://bhiv-mitra.onrender.com';
    const apiKey = process.env.MITRA_API_KEY || '';
    const timeout = parseInt(process.env.MITRA_TIMEOUT_MS || '30000', 10);

    this._client = axios.create({
      baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
    });

    this._client.interceptors.response.use(
      (response) => response,
      (error) => {
        const url = error.config?.url || 'unknown';
        const status = error.response?.status || 'no-response';
        logger.error(`[MITRA] API error ${status} on ${url}: ${error.message}`);
        throw error;
      }
    );

    return this._client;
  }

  /**
   * Check if a user role has a specific capability.
   */
  hasCapability(role, capability) {
    const caps = ROLE_CAPABILITIES[role] || ROLE_CAPABILITIES.viewer;
    return caps.includes(capability);
  }

  /**
   * Get all capabilities for a role.
   */
  getRoleCapabilities(role) {
    return ROLE_CAPABILITIES[role] || ROLE_CAPABILITIES.viewer;
  }

  /**
   * Resolve natural language intent to an ARTHA capability + handler.
   */
  resolveIntent(message) {
    for (const intent of INTENT_MAP) {
      if (intent.patterns.test(message)) {
        return intent;
      }
    }
    return null;
  }

  /**
   * Gather comprehensive financial context from ARTHA's database.
   * This is the bridge between MITRA and ARTHA's data layer.
   */
  async gatherFinancialContext(userId, role) {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const queries = [];

    queries.push(
      JournalEntry.find({ status: { $in: ['POSTED', 'posted'] } })
        .sort({ date: -1 }).limit(20)
        .select('entryNumber date description lines status source')
        .lean()
    );

    queries.push(
      Invoice.find({}).sort({ invoiceDate: -1 }).limit(10)
        .select('invoiceNumber invoiceDate dueDate customerName totalAmount amountPaid status')
        .lean()
    );

    queries.push(
      Expense.find({ status: { $in: ['approved', 'recorded'] } })
        .sort({ date: -1 }).limit(10)
        .select('expenseNumber date vendor category amount totalAmount status')
        .lean()
    );

    queries.push(
      AccountBalance.find({}).populate('account', 'code name type').lean()
    );

    queries.push(
      JournalEntry.aggregate([
        { $match: { status: { $in: ['POSTED', 'posted'] }, date: { $gte: firstDayOfYear, $lte: today } } },
        { $unwind: '$lines' },
        { $lookup: { from: 'chartofaccounts', localField: 'lines.account', foreignField: '_id', as: 'accountInfo' } },
        { $unwind: { path: '$accountInfo', preserveNullAndEmptyArrays: true } },
        { $match: { 'accountInfo.type': 'Income' } },
        { $group: { _id: '$accountInfo.name', total: { $sum: { $toDouble: '$lines.credit' } } } },
        { $sort: { total: -1 } },
      ])
    );

    queries.push(
      JournalEntry.aggregate([
        { $match: { status: { $in: ['POSTED', 'posted'] }, date: { $gte: firstDayOfYear, $lte: today } } },
        { $unwind: '$lines' },
        { $lookup: { from: 'chartofaccounts', localField: 'lines.account', foreignField: '_id', as: 'accountInfo' } },
        { $unwind: { path: '$accountInfo', preserveNullAndEmptyArrays: true } },
        { $match: { 'accountInfo.type': 'Expense' } },
        { $group: { _id: '$accountInfo.name', total: { $sum: { $toDouble: '$lines.debit' } } } },
        { $sort: { total: -1 } },
      ])
    );

    if (this.hasCapability(role, 'gst.view')) {
      queries.push(
        JournalEntry.aggregate([
          { $match: { status: { $in: ['POSTED', 'posted'] } } },
          { $unwind: '$gstDetails' },
          { $group: { _id: '$gstDetails.taxType', total: { $sum: { $toDouble: '$gstDetails.amount' } } } },
        ])
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    if (this.hasCapability(role, 'tds.view')) {
      queries.push(
        TDSEntry.find({}).sort({ createdAt: -1 }).limit(10)
          .select('deductee section paymentAmount tdsAmount status quarter')
          .lean()
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    if (this.hasCapability(role, 'statements.view')) {
      queries.push(
        BankStatement.find({}).sort({ uploadedAt: -1 }).limit(5)
          .select('filename uploadedAt status transactionCount')
          .lean()
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    const results = await Promise.allSettled(queries);
    const safe = (r) => r.status === 'fulfilled' ? r.value : [];

    const [
      journalEntries, invoices, expenses, balances,
      incomeAccounts, expenseAccounts, gstSummary,
      tdsEntries, statements,
    ] = results.map(safe);

    const totalIncome = incomeAccounts.reduce((s, a) => s + (a.total || 0), 0);
    const totalExpenses = expenseAccounts.reduce((s, a) => s + (a.total || 0), 0);

    return {
      current_date: today.toISOString().split('T')[0],
      financial_year: today.getMonth() >= 3
        ? `${today.getFullYear()}-${String(today.getFullYear() + 1).slice(-2)}`
        : `${today.getFullYear() - 1}-${String(today.getFullYear()).slice(-2)}`,
      summary: {
        total_income_ytd: totalIncome,
        total_expenses_ytd: totalExpenses,
        net_income_ytd: totalIncome - totalExpenses,
      },
      recent_journal_entries: journalEntries.map(e => ({
        entry_number: e.entryNumber, date: e.date,
        description: e.description, status: e.status, source: e.source,
      })),
      recent_invoices: invoices.map(inv => ({
        invoice_number: inv.invoiceNumber, date: inv.invoiceDate,
        customer: inv.customerName, total: inv.totalAmount,
        paid: inv.amountPaid, status: inv.status,
      })),
      recent_expenses: expenses.map(exp => ({
        expense_number: exp.expenseNumber, date: exp.date,
        vendor: exp.vendor, category: exp.category,
        amount: exp.totalAmount, status: exp.status,
      })),
      account_balances: balances
        .filter(b => b.account)
        .map(b => ({ code: b.account.code, name: b.account.name, type: b.account.type, balance: b.balance })),
      income_by_account: incomeAccounts.map(a => ({ name: a._id, total: a.total })),
      expenses_by_account: expenseAccounts.map(a => ({ name: a._id, total: a.total })),
      gst_summary: gstSummary.map(g => ({ type: g._id, total: g.total })),
      tds_entries: tdsEntries.map(t => ({
        section: t.section, payment: t.paymentAmount,
        tds: t.tdsAmount, status: t.status,
      })),
      statements: statements.map(s => ({
        filename: s.filename, date: s.uploadedAt,
        status: s.status, transactions: s.transactionCount,
      })),
    };
  }

  _formatFinancialContext(ctx) {
    return [
      `Current Date: ${ctx.current_date}`,
      `Financial Year: ${ctx.financial_year}`,
      `Total Income (YTD): ₹${ctx.summary.total_income_ytd.toLocaleString('en-IN')}`,
      `Total Expenses (YTD): ₹${ctx.summary.total_expenses_ytd.toLocaleString('en-IN')}`,
      `Net Income (YTD): ₹${ctx.summary.net_income_ytd.toLocaleString('en-IN')}`,
      '',
      'Recent Journal Entries:',
      ...ctx.recent_journal_entries.slice(0, 5).map(e => `  - ${e.entry_number} (${e.date ? new Date(e.date).toISOString().split('T')[0] : 'N/A'}): ${e.description} [${e.status}]`),
      '',
      'Recent Invoices:',
      ...ctx.recent_invoices.slice(0, 5).map(inv => `  - ${inv.invoice_number}: ₹${inv.total} (${inv.customer}) [${inv.status}]${inv.paid ? ` Paid: ₹${inv.paid}` : ''}`),
      '',
      'Recent Expenses:',
      ...ctx.recent_expenses.slice(0, 5).map(exp => `  - ${exp.expense_number}: ₹${exp.amount} (${exp.vendor || 'N/A'}) [${exp.category}]`),
      '',
      'Account Balances:',
      ...ctx.account_balances.slice(0, 10).map(b => `  - ${b.code} ${b.name} (${b.type}): ₹${b.balance}`),
      '',
      'Income by Account:',
      ...ctx.income_by_account.map(a => `  - ${a.name}: ₹${a.total.toLocaleString('en-IN')}`),
      '',
      'Expenses by Account:',
      ...ctx.expenses_by_account.map(a => `  - ${a.name}: ₹${a.total.toLocaleString('en-IN')}`),
      '',
      'GST Summary:',
      ...ctx.gst_summary.map(g => `  - ${g.type}: ₹${g.total.toLocaleString('en-IN')}`),
      '',
      'TDS Entries:',
      ...ctx.tds_entries.slice(0, 5).map(t => `  - ${t.section}: Payment ₹${t.payment}, TDS ₹${t.tds} [${t.status}]`),
      '',
      'Recent Statements:',
      ...ctx.statements.map(s => `  - ${s.filename} (${s.date ? new Date(s.date).toISOString().split('T')[0] : 'N/A'}) [${s.status}] - ${s.transactions} transactions`),
    ].join('\n');
  }

  _buildPayload(message, userId, extra) {
    return {
      version: '3.0.0',
      input: { message },
      context: {
        platform: 'artha',
        device: 'api',
        session_id: `artha-${userId}-${Date.now()}`,
        voice_input: false,
        preferred_language: 'auto',
        audio_output_requested: false,
        age_gate_status: false,
        user_context: {
          source: 'artha',
          user_id: userId,
          ...extra,
        },
      },
    };
  }

  /**
   * Get list of supported intents for capability discovery (Task 5).
   */
  _getIntents() {
    return INTENT_MAP.map(i => ({
      description: i.description,
      capability: i.capability,
      handler: i.handler,
    }));
  }

  /**
   * Execute a capability-checked ARTHA operation.
   * This is the core of the integration layer (Task 5).
   */
  async executeCapability(role, capability, handlerName, args = {}) {
    if (!this.hasCapability(role, capability)) {
      return {
        success: false,
        error: `Permission denied: your role (${role}) does not have access to this capability.`,
        capability,
        required: capability,
      };
    }

    try {
      const result = await this[handlerName](args);
      return { success: true, data: result, capability };
    } catch (error) {
      logger.error(`[MITRA] Capability execution error: ${handlerName}:`, error.message);
      return { success: false, error: error.message, capability };
    }
  }

  async getRevenue() {
    const firstDayOfYear = new Date(new Date().getFullYear(), 0, 1);
    const income = await JournalEntry.aggregate([
      { $match: { status: { $in: ['POSTED', 'posted'] }, date: { $gte: firstDayOfYear } } },
      { $unwind: '$lines' },
      { $lookup: { from: 'chartofaccounts', localField: 'lines.account', foreignField: '_id', as: 'accountInfo' } },
      { $unwind: { path: '$accountInfo', preserveNullAndEmptyArrays: true } },
      { $match: { 'accountInfo.type': 'Income' } },
      { $group: { _id: '$accountInfo.name', total: { $sum: { $toDouble: '$lines.credit' } } } },
      { $sort: { total: -1 } },
    ]);
    const total = income.reduce((s, a) => s + (a.total || 0), 0);
    return { total, breakdown: income.map(a => ({ account: a._id, amount: a.total })) };
  }

  async getExpenses() {
    const firstDayOfYear = new Date(new Date().getFullYear(), 0, 1);
    const expenses = await JournalEntry.aggregate([
      { $match: { status: { $in: ['POSTED', 'posted'] }, date: { $gte: firstDayOfYear } } },
      { $unwind: '$lines' },
      { $lookup: { from: 'chartofaccounts', localField: 'lines.account', foreignField: '_id', as: 'accountInfo' } },
      { $unwind: { path: '$accountInfo', preserveNullAndEmptyArrays: true } },
      { $match: { 'accountInfo.type': 'Expense' } },
      { $group: { _id: '$accountInfo.name', total: { $sum: { $toDouble: '$lines.debit' } } } },
      { $sort: { total: -1 } },
    ]);
    const total = expenses.reduce((s, a) => s + (a.total || 0), 0);
    return { total, breakdown: expenses.map(a => ({ account: a._id, amount: a.total })) };
  }

  async getProfitLoss() {
    const revenue = await this.getRevenue();
    const expenses = await this.getExpenses();
    return {
      revenue: revenue.total,
      expenses: expenses.total,
      netProfit: revenue.total - expenses.total,
      revenueBreakdown: revenue.breakdown,
      expenseBreakdown: expenses.breakdown,
    };
  }

  async getBalanceSheet() {
    const balances = await AccountBalance.find({}).populate('account', 'code name type').lean();
    const assets = balances.filter(b => b.account?.type === 'Asset').reduce((s, b) => s + (b.balance || 0), 0);
    const liabilities = balances.filter(b => b.account?.type === 'Liability').reduce((s, b) => s + (b.balance || 0), 0);
    const equity = balances.filter(b => b.account?.type === 'Equity').reduce((s, b) => s + (b.balance || 0), 0);
    return { assets, liabilities, equity, balanced: Math.abs(assets - liabilities - equity) < 0.01 };
  }

  async getCashFlow() {
    const balances = await AccountBalance.find({}).populate('account', 'code name type').lean();
    const cashAccounts = balances.filter(b => /cash|bank|1010|1020/i.test(b.account?.code));
    return {
      accounts: cashAccounts.map(b => ({ code: b.account.code, name: b.account.name, balance: b.balance })),
      totalCash: cashAccounts.reduce((s, b) => s + (b.balance || 0), 0),
    };
  }

  async getOverdueInvoices() {
    const today = new Date();
    const overdue = await Invoice.find({
      status: { $in: ['sent', 'partial'] },
      dueDate: { $lt: today },
    }).select('invoiceNumber customerName totalAmount amountPaid dueDate status').lean();
    const totalOutstanding = overdue.reduce((s, inv) => s + ((inv.totalAmount || 0) - (inv.amountPaid || 0)), 0);
    return { count: overdue.length, totalOutstanding, invoices: overdue };
  }

  async getGSTStatus() {
    const gstSummary = await JournalEntry.aggregate([
      { $match: { status: { $in: ['POSTED', 'posted'] } } },
      { $unwind: '$gstDetails' },
      { $group: { _id: '$gstDetails.taxType', total: { $sum: { $toDouble: '$gstDetails.amount' } } } },
    ]);
    return { breakdown: gstSummary.map(g => ({ type: g._id, amount: g.total })) };
  }

  async getTDSStatus() {
    const entries = await TDSEntry.find({}).sort({ createdAt: -1 }).limit(20)
      .select('deductee section paymentAmount tdsAmount status quarter')
      .lean();
    const totalTDS = entries.reduce((s, e) => s + (e.tdsAmount || 0), 0);
    return { count: entries.length, totalTDS, entries };
  }

  async getTrialBalance() {
    const balances = await AccountBalance.find({}).populate('account', 'code name type').lean();
    const totalDebits = balances.filter(b => ['Asset', 'Expense'].includes(b.account?.type)).reduce((s, b) => s + Math.max(0, b.balance || 0), 0);
    const totalCredits = balances.filter(b => ['Liability', 'Equity', 'Income'].includes(b.account?.type)).reduce((s, b) => s + Math.max(0, b.balance || 0), 0);
    return { totalDebits, totalCredits, balanced: Math.abs(totalDebits - totalCredits) < 0.01 };
  }

  async getAgedReceivables() {
    const today = new Date();
    const invoices = await Invoice.find({ status: { $in: ['sent', 'partial'] } })
      .select('invoiceNumber customerName totalAmount amountPaid dueDate invoiceDate').lean();
    const aged = invoices.map(inv => {
      const outstanding = (inv.totalAmount || 0) - (inv.amountPaid || 0);
      const daysPastDue = inv.dueDate ? Math.floor((today - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24)) : 0;
      return { ...inv, outstanding, daysPastDue, bucket: daysPastDue <= 0 ? 'current' : daysPastDue <= 30 ? '1-30' : daysPastDue <= 60 ? '31-60' : '61-90' };
    });
    return { count: aged.length, invoices: aged };
  }

  async getDashboard() {
    const revenue = await this.getRevenue();
    const expenses = await this.getExpenses();
    const overdue = await this.getOverdueInvoices();
    return {
      revenue: revenue.total,
      expenses: expenses.total,
      netProfit: revenue.total - expenses.total,
      overdueInvoices: overdue.count,
      totalOutstanding: overdue.totalOutstanding,
    };
  }

  async getTopExpenses() {
    const expenses = await Expense.find({ status: { $in: ['approved', 'recorded'] } })
      .sort({ totalAmount: -1 }).limit(10)
      .select('vendor category totalAmount date').lean();
    return { expenses };
  }

  async getVendorPayments() {
    const expenses = await Expense.aggregate([
      { $match: { status: { $in: ['approved', 'recorded'] } } },
      { $group: { _id: '$vendor', total: { $sum: { $toDouble: '$totalAmount' } }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 20 },
    ]);
    return { vendors: expenses.map(v => ({ vendor: v._id, total: v.total, transactions: v.count })) };
  }

  async getGSTPayments() {
    const payments = await JournalEntry.aggregate([
      { $match: { status: { $in: ['POSTED', 'posted'] } } },
      { $unwind: '$gstDetails' },
      { $match: { 'gstDetails.taxType': { $in: ['CGST', 'SGST', 'IGST'] } } },
      { $group: { _id: '$gstDetails.taxType', total: { $sum: { $toDouble: '$gstDetails.amount' } } } },
    ]);
    return { payments: payments.map(p => ({ type: p._id, amount: p.total })) };
  }

  async getUnmatchedTransactions() {
    return { message: 'Unmatched transactions require bank statement processing. Upload a statement first.' };
  }

  async getDuplicateTransactions() {
    return { message: 'Duplicate detection requires bank statement analysis. Upload a statement first.' };
  }

  async explainExpenses() {
    const expenses = await this.getExpenses();
    const top3 = expenses.breakdown.slice(0, 3);
    return {
      totalExpenses: expenses.total,
      topCategories: top3,
      explanation: top3.length > 0
        ? `Your top 3 expense categories are ${top3.map(t => `${t.account} (₹${t.amount.toLocaleString('en-IN')})`).join(', ')}.`
        : 'No expense data available for analysis.',
    };
  }

  async compareQuarters() {
    const today = new Date();
    const currentQuarter = Math.floor(today.getMonth() / 3);
    const quarterStart = new Date(today.getFullYear(), currentQuarter * 3, 1);
    const prevQuarterStart = new Date(today.getFullYear(), (currentQuarter - 1) * 3, 1);

    const [currentExpenses, prevExpenses] = await Promise.all([
      Expense.aggregate([
        { $match: { status: { $in: ['approved', 'recorded'] }, date: { $gte: quarterStart } } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$totalAmount' } } } },
      ]),
      Expense.aggregate([
        { $match: { status: { $in: ['approved', 'recorded'] }, date: { $gte: prevQuarterStart, $lt: quarterStart } } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$totalAmount' } } } },
      ]),
    ]);

    const current = currentExpenses[0]?.total || 0;
    const previous = prevExpenses[0]?.total || 0;
    const change = previous > 0 ? ((current - previous) / previous * 100).toFixed(1) : 'N/A';

    return { currentQuarter: current, previousQuarter: previous, changePercent: change };
  }

  async generateReport() {
    return { message: 'Report generation available at /api/v1/reports/. Specify type: profit-loss, balance-sheet, cash-flow, trial-balance.' };
  }

  async uploadStatement() {
    return { message: 'To upload a bank statement, use POST /api/v1/statements/upload with a file. The statement will be processed automatically.' };
  }

  /**
   * Main chat entry point with full governance (Task 2).
   */
  async chat(message, userId, userName, userRole, traceId) {
    try {
      const role = userRole || 'viewer';
      const intent = this.resolveIntent(message);

      let capabilityResult = null;
      if (intent) {
        capabilityResult = await this.executeCapability(role, intent.capability, intent.handler);
      }

      const ctx = await this.gatherFinancialContext(userId, role);
      const snapshot = this._formatFinancialContext(ctx);

      let enrichedMessage;
      if (capabilityResult && capabilityResult.success) {
        enrichedMessage = [
          `[ARATHA FINANCIAL DATA]\n${snapshot}\n[/ARATHA FINANCIAL DATA]`,
          '',
          `[CAPABILITY RESULT - ${intent.description}]`,
          JSON.stringify(capabilityResult.data, null, 2),
          '',
          `[USER QUESTION] ${message}`,
        ].join('\n');
      } else if (capabilityResult && !capabilityResult.success) {
        enrichedMessage = [
          `[ARATHA FINANCIAL DATA]\n${snapshot}\n[/ARATHA FINANCIAL DATA]`,
          '',
          `[CAPABILITY ERROR] ${capabilityResult.error}`,
          '',
          `[USER QUESTION] ${message}`,
        ].join('\n');
      } else {
        enrichedMessage = `[ARATHA FINANCIAL DATA]\n${snapshot}\n[/ARATHA FINANCIAL DATA]\n\nUser Question: ${message}`;
      }

      const payload = this._buildPayload(enrichedMessage, userId, {
        user_name: userName,
        user_role: role,
        trace_id: traceId,
        intent: intent?.handler || 'general',
        capability_used: intent?.capability || null,
      });

      const response = await this._getClient().post('/api/assistant', payload);
      const data = response.data;

      if (data.status === 'error') {
        throw new Error(data.error?.message || 'Mitra returned an error');
      }

      return {
        reply: data.result?.response || 'No response from Mitra.',
        type: data.result?.type,
        confidence: data.result?.enforcement?.confidence,
        intent: data.result?.enforcement?.intent,
        entities: data.result?.enforcement?.entities,
        trace_id: traceId,
        safety: data.result?.safety,
        task: data.result?.task,
        capability_used: intent?.capability || null,
        role,
      };
    } catch (error) {
      if (error.response) {
        logger.error(`[MITRA] Chat error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        throw new Error(error.response.data?.detail || error.response.data?.error?.message || `Mitra API error: ${error.response.status}`);
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('Mitra request timed out. Please try again.');
      }
      throw new Error(`Cannot reach Mitra service: ${error.message}`);
    }
  }

  async analyze(query, userId, userRole, traceId) {
    try {
      const role = userRole || 'viewer';
      const intent = this.resolveIntent(query);

      let capabilityResult = null;
      if (intent) {
        capabilityResult = await this.executeCapability(role, intent.capability, intent.handler);
      }

      const ctx = await this.gatherFinancialContext(userId, role);
      const snapshot = this._formatFinancialContext(ctx);

      let enrichedMessage;
      if (capabilityResult && capabilityResult.success) {
        enrichedMessage = [
          `[ARATHA FINANCIAL DATA]\n${snapshot}\n[/ARATHA FINANCIAL DATA]`,
          '',
          `[CAPABILITY RESULT - ${intent.description}]`,
          JSON.stringify(capabilityResult.data, null, 2),
          '',
          `[ANALYSIS REQUEST] ${query}`,
        ].join('\n');
      } else {
        enrichedMessage = `[ARATHA FINANCIAL DATA]\n${snapshot}\n[/ARATHA FINANCIAL DATA]\n\n[ANALYSIS REQUEST] ${query}`;
      }

      const payload = this._buildPayload(enrichedMessage, userId, {
        analysis_mode: true,
        user_role: role,
        trace_id: traceId,
        capability_used: intent?.capability || null,
      });

      const response = await this._getClient().post('/api/assistant', payload);
      const data = response.data;

      if (data.status === 'error') {
        throw new Error(data.error?.message || 'Mitra analysis error');
      }

      return {
        reply: data.result?.response,
        type: data.result?.type,
        trace_id: traceId,
        capability_used: intent?.capability || null,
        role,
      };
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data?.detail || error.response.data?.error?.message || `Mitra analysis error: ${error.response.status}`);
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('Mitra analysis request timed out.');
      }
      throw new Error(`Cannot reach Mitra analysis: ${error.message}`);
    }
  }

  async getInsights(userId, userRole, traceId) {
    try {
      const role = userRole || 'viewer';
      const ctx = await this.gatherFinancialContext(userId, role);
      const snapshot = this._formatFinancialContext(ctx);
      const enrichedMessage = `[ARATHA FINANCIAL DATA]\n${snapshot}\n[/ARATHA FINANCIAL DATA]\n\n[INSIGHTS REQUEST] Provide a brief financial health summary based on the above data.`;

      const payload = this._buildPayload(enrichedMessage, userId, {
        insights_mode: true,
        user_role: role,
        trace_id: traceId,
      });

      const response = await this._getClient().post('/api/assistant', payload);
      const data = response.data;

      if (data.status === 'error') {
        throw new Error(data.error?.message || 'Mitra insights error');
      }

      return {
        reply: data.result?.response,
        type: data.result?.type,
        trace_id: traceId,
        role,
      };
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data?.detail || error.response.data?.error?.message || `Mitra insights error: ${error.response.status}`);
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('Mitra insights request timed out.');
      }
      throw new Error(`Cannot reach Mitra insights: ${error.message}`);
    }
  }

  /**
   * Bank statement conversational analysis (Task 4).
   */
  async analyzeStatement(message, userId, userRole, statementId, traceId) {
    try {
      const role = userRole || 'viewer';

      if (!this.hasCapability(role, 'statements.view')) {
        return { success: false, error: 'Permission denied: no access to statement data.' };
      }

      let statement = null;
      if (statementId) {
        statement = await BankStatement.findById(statementId).lean();
        if (!statement) {
          return { success: false, error: 'Statement not found.' };
        }
      }

      const ctx = await this.gatherFinancialContext(userId, role);
      const snapshot = this._formatFinancialContext(ctx);

      const statementContext = statement
        ? [
            `\n\nBank Statement: ${statement.filename}`,
            `Uploaded: ${statement.uploadedAt}`,
            `Status: ${statement.status}`,
            `Transactions: ${statement.transactionCount || 0}`,
            statement.transactions ? `\nTransactions:\n${statement.transactions.slice(0, 20).map(t => `  - ${t.date} | ${t.description} | ₹${t.amount} | ${t.type}`).join('\n')}` : '',
          ].join('\n')
        : '';

      const enrichedMessage = [
        `[ARATHA FINANCIAL DATA]\n${snapshot}${statementContext}\n[/ARATHA FINANCIAL DATA]`,
        '',
        `[BANK STATEMENT ANALYSIS] ${message}`,
      ].join('\n');

      const payload = this._buildPayload(enrichedMessage, userId, {
        statement_analysis: true,
        statement_id: statementId,
        user_role: role,
        trace_id: traceId,
      });

      const response = await this._getClient().post('/api/assistant', payload);
      const data = response.data;

      if (data.status === 'error') {
        throw new Error(data.error?.message || 'Statement analysis error');
      }

      return {
        reply: data.result?.response,
        type: data.result?.type,
        trace_id: traceId,
        statement_id: statementId,
        role,
      };
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data?.detail || `Statement analysis error: ${error.response.status}`);
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('Statement analysis timed out.');
      }
      throw new Error(`Cannot analyze statement: ${error.message}`);
    }
  }

  async healthCheck() {
    try {
      const response = await this._getClient().get('/health', { timeout: 5000 });
      return { status: 'connected', data: response.data };
    } catch (error) {
      return { status: 'disconnected', error: error.message };
    }
  }
}

export default new MitraService();
