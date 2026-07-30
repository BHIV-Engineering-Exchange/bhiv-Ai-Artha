import crypto from 'crypto';
import logger from '../config/logger.js';

const CAPABILITIES = {
  POST_JOURNAL: {
    id: 'POST_JOURNAL',
    name: 'Post Journal Entry',
    version: '1.0.0',
    inputs: { entry_data: 'object', user_id: 'string' },
    outputs: { journal_entry: 'JournalEntry', ledger_entries: 'LedgerEntry[]' },
    runtime_contract: 'Deterministic double-entry posting with hash-chain integrity',
    replay_policy: 'FULL_REPLAY',
    security_policy: 'ROLE_ACCOUNTANT_OR_ADMIN',
    determinism_rules: ['Debits must equal credits', 'Hash chain must be unbroken', 'Accounts must exist'],
    observability_hooks: ['journal.posted', 'ledger.entries_created', 'chain.position_updated'],
    category: 'accounting',
  },
  VALIDATE_JOURNAL: {
    id: 'VALIDATE_JOURNAL',
    name: 'Validate Journal Entry',
    version: '1.0.0',
    inputs: { entry_id: 'string' },
    outputs: { valid: 'boolean', errors: 'string[]' },
    runtime_contract: 'Validates journal integrity without mutating state',
    replay_policy: 'FULL_REPLAY',
    security_policy: 'ROLE_ACCOUNTANT_OR_ADMIN',
    determinism_rules: ['Validation is pure — no side effects'],
    observability_hooks: ['journal.validated', 'validation.result'],
    category: 'accounting',
  },
  REVERSE_JOURNAL: {
    id: 'REVERSE_JOURNAL',
    name: 'Reverse Journal Entry',
    version: '1.0.0',
    inputs: { entry_id: 'string', reason: 'string', user_id: 'string' },
    outputs: { reversal_entry: 'JournalEntry' },
    runtime_contract: 'Creates compensating entry and voids original',
    replay_policy: 'FULL_REPLAY',
    security_policy: 'ROLE_ACCOUNTANT_OR_ADMIN',
    determinism_rules: ['Reversal amount must equal original', 'Original must be POSTED'],
    observability_hooks: ['journal.reversed', 'ledger.reversal_posted'],
    category: 'accounting',
  },
  IMPORT_TALLY: {
    id: 'IMPORT_TALLY',
    name: 'Import from Tally',
    version: '1.0.0',
    inputs: { file: 'Buffer', format: 'string', user_id: 'string' },
    outputs: { imported_entries: 'number', journal_entries: 'JournalEntry[]' },
    runtime_contract: 'Parses Tally export and creates journal entries',
    replay_policy: 'NO_REPLAY',
    security_policy: 'ROLE_ADMIN',
    determinism_rules: ['Same input file produces same journal entries'],
    observability_hooks: ['import.tally_started', 'import.tally_completed'],
    category: 'integration',
  },
  EXPORT_TALLY: {
    id: 'EXPORT_TALLY',
    name: 'Export to Tally',
    version: '1.0.0',
    inputs: { filters: 'object', user_id: 'string' },
    outputs: { export_file: 'Buffer', format: 'string' },
    runtime_contract: 'Exports journal entries in Tally-compatible format',
    replay_policy: 'NO_REPLAY',
    security_policy: 'ROLE_ACCOUNTANT_OR_ADMIN',
    determinism_rules: ['Same filters produce same export'],
    observability_hooks: ['export.tally_generated'],
    category: 'integration',
  },
  IMPORT_BANK_STATEMENT: {
    id: 'IMPORT_BANK_STATEMENT',
    name: 'Import Bank Statement',
    version: '1.0.0',
    inputs: { file: 'Buffer', account_number: 'string', user_id: 'string' },
    outputs: { statement: 'BankStatement', transaction_count: 'number' },
    runtime_contract: 'Parses CSV/Excel bank statement',
    replay_policy: 'NO_REPLAY',
    security_policy: 'ROLE_ACCOUNTANT_OR_ADMIN',
    determinism_rules: ['Same file produces same parsed transactions'],
    observability_hooks: ['bank.statement_imported'],
    category: 'banking',
  },
  RECONCILE_BANK: {
    id: 'RECONCILE_BANK',
    name: 'Reconcile Bank Statement',
    version: '1.0.0',
    inputs: { statement_id: 'string', user_id: 'string' },
    outputs: { matched: 'number', unmatched: 'number' },
    runtime_contract: 'Auto-matches bank transactions to ledger entries',
    replay_policy: 'FULL_REPLAY',
    security_policy: 'ROLE_ACCOUNTANT_OR_ADMIN',
    determinism_rules: ['Matching is deterministic based on amount and date'],
    observability_hooks: ['bank.reconciliation_completed'],
    category: 'banking',
  },
  CREATE_INVOICE: {
    id: 'CREATE_INVOICE',
    name: 'Create Invoice',
    version: '1.0.0',
    inputs: { invoice_data: 'object', user_id: 'string' },
    outputs: { invoice: 'Invoice' },
    runtime_contract: 'Creates sales invoice with GST calculation',
    replay_policy: 'FULL_REPLAY',
    security_policy: 'ROLE_ACCOUNTANT_OR_ADMIN',
    determinism_rules: ['GST calculation is deterministic', 'Invoice number is sequential'],
    observability_hooks: ['invoice.created', 'invoice.gst_computed'],
    category: 'accounting',
  },
  RECORD_PAYMENT: {
    id: 'RECORD_PAYMENT',
    name: 'Record Payment',
    version: '1.0.0',
    inputs: { invoice_id: 'string', payment_data: 'object', user_id: 'string' },
    outputs: { payment: 'Payment', journal_entry: 'JournalEntry' },
    runtime_contract: 'Records payment against invoice with auto journal entry',
    replay_policy: 'FULL_REPLAY',
    security_policy: 'ROLE_ACCOUNTANT_OR_ADMIN',
    determinism_rules: ['Payment amount cannot exceed invoice due'],
    observability_hooks: ['payment.recorded', 'journal.created_from_payment'],
    category: 'accounting',
  },
  GENERATE_PNL: {
    id: 'GENERATE_PNL',
    name: 'Generate Profit & Loss',
    version: '1.0.0',
    inputs: { period: 'object', company_id: 'string' },
    outputs: { report: 'object', snapshot_id: 'string' },
    runtime_contract: 'Computes P&L from ledger entries deterministically',
    replay_policy: 'FULL_REPLAY',
    security_policy: 'ROLE_ACCOUNTANT_OR_ADMIN',
    determinism_rules: ['Same ledger state produces identical P&L'],
    observability_hooks: ['report.pnl_generated', 'snapshot.created'],
    category: 'reporting',
  },
  GENERATE_BALANCE_SHEET: {
    id: 'GENERATE_BALANCE_SHEET',
    name: 'Generate Balance Sheet',
    version: '1.0.0',
    inputs: { period: 'object', company_id: 'string' },
    outputs: { report: 'object', snapshot_id: 'string' },
    runtime_contract: 'Computes Balance Sheet from ledger entries',
    replay_policy: 'FULL_REPLAY',
    security_policy: 'ROLE_ACCOUNTANT_OR_ADMIN',
    determinism_rules: ['Same ledger state produces identical Balance Sheet'],
    observability_hooks: ['report.balance_sheet_generated'],
    category: 'reporting',
  },
  GENERATE_CASH_FLOW: {
    id: 'GENERATE_CASH_FLOW',
    name: 'Generate Cash Flow Statement',
    version: '1.0.0',
    inputs: { period: 'object', company_id: 'string' },
    outputs: { report: 'object', snapshot_id: 'string' },
    runtime_contract: 'Computes Cash Flow from ledger entries',
    replay_policy: 'FULL_REPLAY',
    security_policy: 'ROLE_ACCOUNTANT_OR_ADMIN',
    determinism_rules: ['Same ledger state produces identical Cash Flow'],
    observability_hooks: ['report.cash_flow_generated'],
    category: 'reporting',
  },
  GENERATE_TRIAL_BALANCE: {
    id: 'GENERATE_TRIAL_BALANCE',
    name: 'Generate Trial Balance',
    version: '1.0.0',
    inputs: { period: 'object', company_id: 'string' },
    outputs: { report: 'object', snapshot_id: 'string' },
    runtime_contract: 'Computes Trial Balance from ledger entries',
    replay_policy: 'FULL_REPLAY',
    security_policy: 'ROLE_ACCOUNTANT_OR_ADMIN',
    determinism_rules: ['Debits must equal credits in trial balance'],
    observability_hooks: ['report.trial_balance_generated'],
    category: 'reporting',
  },
  GENERATE_GST: {
    id: 'GENERATE_GST',
    name: 'Generate GST Report',
    version: '1.0.0',
    inputs: { period: 'object', return_type: 'string' },
    outputs: { report: 'object', filing_packet: 'object' },
    runtime_contract: 'Generates GSTR-1 or GSTR-3B from transactions',
    replay_policy: 'FULL_REPLAY',
    security_policy: 'ROLE_ACCOUNTANT_OR_ADMIN',
    determinism_rules: ['Same transactions produce identical GST return'],
    observability_hooks: ['gst.report_generated'],
    category: 'compliance',
  },
  CLOSE_PERIOD: {
    id: 'CLOSE_PERIOD',
    name: 'Close Accounting Period',
    version: '1.0.0',
    inputs: { period_id: 'string', user_id: 'string' },
    outputs: { closed: 'boolean', period: 'FinancialPeriod' },
    runtime_contract: 'Closes period, locks ledger, generates closing entries',
    replay_policy: 'FULL_REPLAY',
    security_policy: 'ROLE_ADMIN',
    determinism_rules: ['Period close is irreversible without reopen'],
    observability_hooks: ['period.closed', 'ledger.locked'],
    category: 'governance',
  },
  CLOSE_FINANCIAL_YEAR: {
    id: 'CLOSE_FINANCIAL_YEAR',
    name: 'Close Financial Year',
    version: '1.0.0',
    inputs: { year: 'number', user_id: 'string' },
    outputs: { closed: 'boolean', retained_earnings: 'number' },
    runtime_contract: 'Year-end close with retained earnings calculation',
    replay_policy: 'FULL_REPLAY',
    security_policy: 'ROLE_ADMIN',
    determinism_rules: ['Retained earnings = net income - dividends'],
    observability_hooks: ['year.closed', 'retained_earnings.computed'],
    category: 'governance',
  },
};

class FinancialCapabilityRegistry {
  constructor() {
    this.capabilities = new Map(Object.entries(CAPABILITIES));
  }

  getCapability(id) {
    return this.capabilities.get(id);
  }

  listCapabilities(category = null) {
    const all = Array.from(this.capabilities.values());
    if (category) return all.filter(c => c.category === category);
    return all;
  }

  async executeCapability(capabilityId, inputs, userId, traceId) {
    const capability = this.capabilities.get(capabilityId);
    if (!capability) {
      throw new Error(`Capability not found: ${capabilityId}`);
    }

    const startTime = Date.now();
    const result = {
      capability_id: capabilityId,
      version: capability.version,
      inputs,
      started_at: new Date().toISOString(),
      trace_id: traceId,
      user_id: userId,
    };

    try {
      result.output = await this._dispatch(capabilityId, inputs, userId);
      result.success = true;
      result.duration_ms = Date.now() - startTime;
    } catch (err) {
      result.success = false;
      result.error = err.message;
      result.duration_ms = Date.now() - startTime;
    }

    return result;
  }

  async _dispatch(capabilityId, inputs, userId) {
    const { default: ledgerService } = await import('./ledger.service.js');
    const { default: invoiceService } = await import('./invoice.service.js');
    const { default: expenseService } = await import('./expense.service.js');
    const { default: financialReportsService } = await import('./financialReports.service.js');

    switch (capabilityId) {
      case 'POST_JOURNAL':
        return ledgerService.createJournalEntry(inputs.entry_data, userId);
      case 'VALIDATE_JOURNAL':
        return ledgerService.validateJournal(inputs.entry_lines);
      case 'REVERSE_JOURNAL':
        return ledgerService.createReversalEntry(inputs.entry_id, { reason: inputs.reason }, userId);
      case 'CREATE_INVOICE':
        return invoiceService.createInvoice(inputs.invoice_data, userId);
      case 'RECORD_PAYMENT':
        return invoiceService.recordPayment(inputs.invoice_id, inputs.payment_data, userId);
      case 'GENERATE_PNL':
        return financialReportsService.getProfitLoss(inputs.period);
      case 'GENERATE_BALANCE_SHEET':
        return financialReportsService.getBalanceSheet(inputs.period);
      case 'GENERATE_TRIAL_BALANCE':
        return financialReportsService.getTrialBalance(inputs.period);
      case 'GENERATE_CASH_FLOW':
        return financialReportsService.getCashFlow(inputs.period);
      default:
        throw new Error(`Capability ${capabilityId} not yet wired to implementation`);
    }
  }

  getRegistry() {
    return Array.from(this.capabilities.values());
  }
}

export default new FinancialCapabilityRegistry();
