import crypto from 'crypto';
import financialEventStore from './financialEventStore.service.js';
import logger from '../config/logger.js';

class FinancialEventEmitter {
  async emitJournalCreated(journalEntry, userId) {
    return financialEventStore.append({
      aggregate_id: journalEntry._id?.toString() || journalEntry.id,
      aggregate_type: 'JournalEntry',
      event_type: 'JOURNAL_CREATED',
      user_id: userId?.toString() || 'system',
      trace_id: journalEntry.trace_id,
      payload: {
        entry_id: journalEntry._id?.toString() || journalEntry.id,
        entryNumber: journalEntry.entryNumber,
        description: journalEntry.description,
        lines: journalEntry.lines,
        status: journalEntry.status || 'DRAFT',
        source: journalEntry.source,
      },
    });
  }

  async emitJournalValidated(journalEntry, userId) {
    return financialEventStore.append({
      aggregate_id: journalEntry._id?.toString() || journalEntry.id,
      aggregate_type: 'JournalEntry',
      event_type: 'JOURNAL_VALIDATED',
      user_id: userId?.toString() || 'system',
      trace_id: journalEntry.trace_id,
      payload: {
        entry_id: journalEntry._id?.toString() || journalEntry.id,
        entryNumber: journalEntry.entryNumber,
        status: 'VALIDATED',
      },
    });
  }

  async emitJournalPosted(journalEntry, userId) {
    return financialEventStore.append({
      aggregate_id: journalEntry._id?.toString() || journalEntry.id,
      aggregate_type: 'JournalEntry',
      event_type: 'JOURNAL_POSTED',
      user_id: userId?.toString() || 'system',
      trace_id: journalEntry.trace_id,
      payload: {
        entry_id: journalEntry._id?.toString() || journalEntry.id,
        entryNumber: journalEntry.entryNumber,
        lines: journalEntry.lines,
        status: 'POSTED',
        postedAt: new Date().toISOString(),
      },
    });
  }

  async emitJournalReversed(journalEntry, reversalEntry, userId) {
    return financialEventStore.append({
      aggregate_id: reversalEntry._id?.toString() || reversalEntry.id,
      aggregate_type: 'JournalEntry',
      event_type: 'JOURNAL_REVERSED',
      user_id: userId?.toString() || 'system',
      trace_id: reversalEntry.trace_id,
      parent_event_id: journalEntry._id?.toString(),
      payload: {
        original_entry_id: journalEntry._id?.toString(),
        reversal_entry_id: reversalEntry._id?.toString(),
        reversalNumber: reversalEntry.entryNumber,
        originalNumber: journalEntry.entryNumber,
      },
    });
  }

  async emitJournalVoided(journalEntry, userId, reason) {
    return financialEventStore.append({
      aggregate_id: journalEntry._id?.toString() || journalEntry.id,
      aggregate_type: 'JournalEntry',
      event_type: 'JOURNAL_VOIDED',
      user_id: userId?.toString() || 'system',
      trace_id: journalEntry.trace_id,
      payload: {
        entry_id: journalEntry._id?.toString() || journalEntry.id,
        entryNumber: journalEntry.entryNumber,
        reason,
      },
    });
  }

  async emitInvoiceCreated(invoice, userId) {
    return financialEventStore.append({
      aggregate_id: invoice._id?.toString(),
      aggregate_type: 'Invoice',
      event_type: 'INVOICE_CREATED',
      user_id: userId?.toString() || invoice.createdBy?.toString(),
      trace_id: invoice.trace_id || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      payload: {
        invoice_id: invoice._id?.toString(),
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        totalAmount: invoice.totalAmount,
        status: invoice.status,
      },
    });
  }

  async emitInvoicePaid(invoice, payment, userId) {
    return financialEventStore.append({
      aggregate_id: invoice._id?.toString(),
      aggregate_type: 'Invoice',
      event_type: 'INVOICE_PAID',
      user_id: userId?.toString(),
      trace_id: invoice.trace_id || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      payload: {
        invoice_id: invoice._id?.toString(),
        invoiceNumber: invoice.invoiceNumber,
        payment_amount: payment.amount,
        payment_method: payment.paymentMethod,
        totalAmount: invoice.totalAmount,
        amountPaid: invoice.amountPaid,
      },
    });
  }

  async emitExpenseSubmitted(expense, userId) {
    return financialEventStore.append({
      aggregate_id: expense._id?.toString(),
      aggregate_type: 'Expense',
      event_type: 'EXPENSE_SUBMITTED',
      user_id: userId?.toString() || expense.submittedBy?.toString(),
      trace_id: `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      payload: {
        expense_id: expense._id?.toString(),
        expenseNumber: expense.expenseNumber,
        vendor: expense.vendor,
        totalAmount: expense.totalAmount,
        category: expense.category,
      },
    });
  }

  async emitExpenseApproved(expense, userId) {
    return financialEventStore.append({
      aggregate_id: expense._id?.toString(),
      aggregate_type: 'Expense',
      event_type: 'EXPENSE_APPROVED',
      user_id: userId?.toString(),
      trace_id: `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      payload: {
        expense_id: expense._id?.toString(),
        expenseNumber: expense.expenseNumber,
        approvedBy: userId?.toString(),
      },
    });
  }

  async emitReportGenerated(reportType, period, metadata = {}) {
    return financialEventStore.append({
      aggregate_id: `report_${reportType}_${period.start_date}_${period.end_date}`,
      aggregate_type: 'ReportSnapshot',
      event_type: 'REPORT_GENERATED',
      user_id: metadata.user_id || 'system',
      trace_id: metadata.trace_id || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      payload: {
        report_type: reportType,
        period,
        generator: metadata.generator || 'ARTHA Financial Runtime',
      },
    });
  }

  async emitPeriodClosed(periodId, userId) {
    return financialEventStore.append({
      aggregate_id: periodId,
      aggregate_type: 'FinancialPeriod',
      event_type: 'PERIOD_CLOSED',
      user_id: userId?.toString(),
      trace_id: `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      payload: { period_id: periodId },
    });
  }

  async emitBankStatementImported(statementId, metadata = {}) {
    return financialEventStore.append({
      aggregate_id: statementId,
      aggregate_type: 'BankStatement',
      event_type: 'BANK_STATEMENT_IMPORTED',
      user_id: metadata.user_id || 'system',
      trace_id: `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      payload: { statement_id: statementId, transaction_count: metadata.transaction_count },
    });
  }

  async emitGeneric(eventType, aggregateType, aggregateId, payload, userId, traceId) {
    return financialEventStore.append({
      aggregate_id: aggregateId,
      aggregate_type: aggregateType,
      event_type: eventType,
      user_id: userId?.toString() || 'system',
      trace_id: traceId || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      payload,
    });
  }
}

export default new FinancialEventEmitter();
