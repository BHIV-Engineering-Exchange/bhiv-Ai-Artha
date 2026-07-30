import logger from '../config/logger.js';
import provenanceChain from './provenanceChain.service.js';
import decisionLedger from './decisionLedger.service.js';
import insightFlow from './insightflow.service.js';
import bucketProvenance from './bucketProvenance.service.js';
import tantraService from './tantra.service.js';
import tantraExecutionChain from './tantraExecutionChain.service.js';
import financialEventStore from './financialEventStore.service.js';

class FinancialIntegrationService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      bucketProvenance.initialize();
      insightFlow.initialize();

      await provenanceChain.initialize();
      await decisionLedger.initialize();

      this.initialized = true;
      logger.info('[FinancialIntegration] All integration hooks initialized');
    } catch (err) {
      logger.warn('[FinancialIntegration] Some integrations failed to initialize:', err.message);
      this.initialized = true;
    }
  }

  async onJournalCreated(entry, userId) {
    const traceId = entry.trace_id || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    await this._safeHook(async () => {
      await insightFlow.emitEvent({
        event: 'JOURNAL_CREATED',
        component: 'ARTHA_FINANCIAL',
        trace_id: traceId,
        operation: 'journal.create',
        metadata: {
          entry_id: entry._id?.toString(),
          entry_number: entry.entryNumber,
          total_debit: entry.totalDebit,
          total_credit: entry.totalCredit,
          user_id: userId?.toString(),
        },
      });

      const artifact = bucketProvenance.createArtifactReference({
        type: 'JOURNAL_ENTRY',
        entity_type: 'JournalEntry',
        entity_id: entry._id,
        data: {
          entryNumber: entry.entryNumber,
          description: entry.description,
          lines: entry.lines,
          totalDebit: entry.totalDebit,
          totalCredit: entry.totalCredit,
        },
        metadata: { user_id: userId?.toString(), trace_id: traceId },
      });

      await provenanceChain.append({
        type: 'FINANCIAL_EVENT',
        data: {
          event_type: 'JOURNAL_CREATED',
          entry_id: entry._id?.toString(),
          entry_number: entry.entryNumber,
          bucket_artifact_id: artifact.artifact_id,
          content_hash: artifact.content_hash,
        },
        trace_id: traceId,
      });

      await tantraService.emitEvent({
        event: 'JOURNAL_ENTRY_CREATED',
        entityType: 'JournalEntry',
        entityId: entry._id,
        details: {
          entryNumber: entry.entryNumber,
          totalDebit: entry.totalDebit,
          trace_id: traceId,
        },
      });
    }, 'JOURNAL_CREATED', traceId);
  }

  async onJournalPosted(entry, userId) {
    const traceId = entry.trace_id || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    await this._safeHook(async () => {
      await insightFlow.emitEvent({
        event: 'JOURNAL_POSTED',
        component: 'ARTHA_FINANCIAL',
        trace_id: traceId,
        operation: 'journal.post',
        metadata: {
          entry_id: entry._id?.toString(),
          entry_number: entry.entryNumber,
          total_debit: entry.totalDebit,
          total_credit: entry.totalCredit,
        },
      });

      await provenanceChain.append({
        type: 'FINANCIAL_EVENT',
        data: {
          event_type: 'JOURNAL_POSTED',
          entry_id: entry._id?.toString(),
          entry_number: entry.entryNumber,
          status: 'POSTED',
        },
        trace_id: traceId,
      });

      await decisionLedger.recordDecision({
        decision_type: 'GOVERNANCE_ACTION',
        capability_id: 'POST_JOURNAL',
        method: 'POST',
        path: `/api/v1/ledger/entries/${entry._id}/post`,
        outcome: 'ALLOW',
        reason: 'Journal entry validated and posted',
        evidence: { entry_id: entry._id?.toString(), entryNumber: entry.entryNumber },
        user_id: userId?.toString(),
        replay_safe: true,
        constitutionally_compliant: true,
      });
    }, 'JOURNAL_POSTED', traceId);
  }

  async onJournalReversed(originalEntry, reversalEntry, userId) {
    const traceId = reversalEntry.trace_id || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    await this._safeHook(async () => {
      await insightFlow.emitEvent({
        event: 'JOURNAL_REVERSED',
        component: 'ARTHA_FINANCIAL',
        trace_id: traceId,
        operation: 'journal.reverse',
        metadata: {
          original_entry_id: originalEntry._id?.toString(),
          reversal_entry_id: reversalEntry._id?.toString(),
        },
      });

      await provenanceChain.append({
        type: 'FINANCIAL_EVENT',
        data: {
          event_type: 'JOURNAL_REVERSED',
          original_entry_id: originalEntry._id?.toString(),
          reversal_entry_id: reversalEntry._id?.toString(),
        },
        trace_id: traceId,
      });

      const artifact = bucketProvenance.createVersionedArtifact({
        parent_artifact_id: originalEntry._id?.toString(),
        data: { ...originalEntry, reversed: true, reversal_entry_id: reversalEntry._id?.toString() },
        action: 'REVERSED',
      });

      await decisionLedger.recordDecision({
        decision_type: 'GOVERNANCE_ACTION',
        capability_id: 'REVERSE_JOURNAL',
        method: 'POST',
        path: `/api/v1/ledger/entries/${originalEntry._id}/reversal`,
        outcome: 'ALLOW',
        reason: 'Journal entry reversed with new entry',
        evidence: {
          original_entry_id: originalEntry._id?.toString(),
          reversal_entry_id: reversalEntry._id?.toString(),
        },
        user_id: userId?.toString(),
        replay_safe: true,
        constitutionally_compliant: true,
      });
    }, 'JOURNAL_REVERSED', traceId);
  }

  async onJournalVoided(entry, userId, reason) {
    const traceId = entry.trace_id || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    await this._safeHook(async () => {
      await insightFlow.emitEvent({
        event: 'JOURNAL_VOIDED',
        component: 'ARTHA_FINANCIAL',
        trace_id: traceId,
        operation: 'journal.void',
        metadata: {
          entry_id: entry._id?.toString(),
          entry_number: entry.entryNumber,
          reason,
        },
      });

      await provenanceChain.append({
        type: 'FINANCIAL_EVENT',
        data: {
          event_type: 'JOURNAL_VOIDED',
          entry_id: entry._id?.toString(),
          reason,
        },
        trace_id: traceId,
      });

      await decisionLedger.recordDecision({
        decision_type: 'GOVERNANCE_ACTION',
        capability_id: 'VOID_JOURNAL',
        method: 'POST',
        path: `/api/v1/ledger/entries/${entry._id}/void`,
        outcome: 'ALLOW',
        reason: `Journal voided: ${reason}`,
        evidence: { entry_id: entry._id?.toString(), reason },
        user_id: userId?.toString(),
        replay_safe: true,
        constitutionally_compliant: true,
      });
    }, 'JOURNAL_VOIDED', traceId);
  }

  async onInvoiceCreated(invoice, userId) {
    const traceId = invoice.trace_id || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    await this._safeHook(async () => {
      await insightFlow.emitEvent({
        event: 'INVOICE_CREATED',
        component: 'ARTHA_FINANCIAL',
        trace_id: traceId,
        operation: 'invoice.create',
        metadata: {
          invoice_id: invoice._id?.toString(),
          invoice_number: invoice.invoiceNumber,
          total_amount: invoice.totalAmount,
          customer: invoice.customerName,
        },
      });

      const artifact = bucketProvenance.createArtifactReference({
        type: 'INVOICE',
        entity_type: 'Invoice',
        entity_id: invoice._id,
        data: {
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          totalAmount: invoice.totalAmount,
          items: invoice.items || invoice.lines,
        },
        metadata: { user_id: userId?.toString(), trace_id: traceId },
      });

      await provenanceChain.append({
        type: 'FINANCIAL_EVENT',
        data: {
          event_type: 'INVOICE_CREATED',
          invoice_id: invoice._id?.toString(),
          invoice_number: invoice.invoiceNumber,
          bucket_artifact_id: artifact.artifact_id,
        },
        trace_id: traceId,
      });
    }, 'INVOICE_CREATED', traceId);
  }

  async onInvoicePaid(invoice, payment, userId) {
    const traceId = `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    await this._safeHook(async () => {
      await insightFlow.emitEvent({
        event: 'INVOICE_PAID',
        component: 'ARTHA_FINANCIAL',
        trace_id: traceId,
        operation: 'invoice.payment',
        metadata: {
          invoice_id: invoice._id?.toString(),
          payment_amount: payment.amount,
          payment_method: payment.paymentMethod,
        },
      });

      await provenanceChain.append({
        type: 'FINANCIAL_EVENT',
        data: {
          event_type: 'INVOICE_PAID',
          invoice_id: invoice._id?.toString(),
          payment_amount: payment.amount,
          payment_method: payment.paymentMethod,
        },
        trace_id: traceId,
      });

      await decisionLedger.recordDecision({
        decision_type: 'GOVERNANCE_ACTION',
        capability_id: 'RECEIVE_PAYMENT',
        method: 'POST',
        path: `/api/v1/invoices/${invoice._id}/payment`,
        outcome: 'ALLOW',
        reason: 'Payment recorded against invoice',
        evidence: {
          invoice_id: invoice._id?.toString(),
          payment_amount: payment.amount,
        },
        user_id: userId?.toString(),
        replay_safe: true,
        constitutionally_compliant: true,
      });
    }, 'INVOICE_PAID', traceId);
  }

  async onExpenseSubmitted(expense, userId) {
    const traceId = `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    await this._safeHook(async () => {
      await insightFlow.emitEvent({
        event: 'EXPENSE_SUBMITTED',
        component: 'ARTHA_FINANCIAL',
        trace_id: traceId,
        operation: 'expense.submit',
        metadata: {
          expense_id: expense._id?.toString(),
          vendor: expense.vendor,
          total_amount: expense.totalAmount,
          category: expense.category,
        },
      });

      const artifact = bucketProvenance.createArtifactReference({
        type: 'EXPENSE',
        entity_type: 'Expense',
        entity_id: expense._id,
        data: {
          expenseNumber: expense.expenseNumber,
          vendor: expense.vendor,
          totalAmount: expense.totalAmount,
          category: expense.category,
        },
        metadata: { user_id: userId?.toString(), trace_id: traceId },
      });

      await provenanceChain.append({
        type: 'FINANCIAL_EVENT',
        data: {
          event_type: 'EXPENSE_SUBMITTED',
          expense_id: expense._id?.toString(),
          bucket_artifact_id: artifact.artifact_id,
        },
        trace_id: traceId,
      });
    }, 'EXPENSE_SUBMITTED', traceId);
  }

  async onExpenseApproved(expense, userId) {
    const traceId = `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    await this._safeHook(async () => {
      await insightFlow.emitEvent({
        event: 'EXPENSE_APPROVED',
        component: 'ARTHA_FINANCIAL',
        trace_id: traceId,
        operation: 'expense.approve',
        metadata: {
          expense_id: expense._id?.toString(),
          approved_by: userId?.toString(),
        },
      });

      await provenanceChain.append({
        type: 'FINANCIAL_EVENT',
        data: {
          event_type: 'EXPENSE_APPROVED',
          expense_id: expense._id?.toString(),
          approved_by: userId?.toString(),
        },
        trace_id: traceId,
      });

      await decisionLedger.recordDecision({
        decision_type: 'GOVERNANCE_ACTION',
        capability_id: 'APPROVE_EXPENSE',
        method: 'POST',
        path: `/api/v1/expenses/${expense._id}/approve`,
        outcome: 'ALLOW',
        reason: 'Expense approved',
        evidence: { expense_id: expense._id?.toString() },
        user_id: userId?.toString(),
        replay_safe: true,
        constitutionally_compliant: true,
      });
    }, 'EXPENSE_APPROVED', traceId);
  }

  async onReportGenerated(reportType, period, metadata = {}) {
    const traceId = metadata.trace_id || `TRC-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    await this._safeHook(async () => {
      await insightFlow.emitEvent({
        event: 'REPORT_GENERATED',
        component: 'ARTHA_FINANCIAL',
        trace_id: traceId,
        operation: 'report.generate',
        metadata: { report_type: reportType, period },
      });

      const artifact = bucketProvenance.createArtifactReference({
        type: 'REPORT',
        entity_type: 'ReportSnapshot',
        entity_id: `${reportType}_${period.start_date}_${period.end_date}`,
        data: { reportType, period, generated_at: new Date().toISOString() },
        metadata: { generator: 'ARTHA Financial Runtime' },
      });

      await provenanceChain.append({
        type: 'FINANCIAL_EVENT',
        data: {
          event_type: 'REPORT_GENERATED',
          report_type: reportType,
          period,
          bucket_artifact_id: artifact.artifact_id,
        },
        trace_id: traceId,
      });
    }, 'REPORT_GENERATED', traceId);
  }

  async executeFinancialChain(operation, context) {
    try {
      return await tantraExecutionChain.executeChain({
        trace_id: context.trace_id,
        operation,
        method: context.method || 'POST',
        path: context.path || `/financial-runtime/${operation}`,
        user_id: context.user_id,
        capability: context.capability,
        severity: context.severity || 'medium',
        signal_type: context.signal_type || 'FINANCIAL_OPERATION',
        source: 'ARTHA_FINANCIAL_RUNTIME',
        body: context.body,
        execution_result: context.result,
      });
    } catch (err) {
      logger.warn(`[FinancialIntegration] TANTRA chain failed for ${operation}:`, err.message);
      return null;
    }
  }

  async verifyAllIntegrations() {
    const results = {
      provenance_chain: await provenanceChain.verifyIntegrity().catch(e => ({ valid: false, error: e.message })),
      decision_ledger: await decisionLedger.verifyChainIntegrity().catch(e => ({ valid: false, error: e.message })),
      bucket_provenance: bucketProvenance.getStats(),
      insightflow: insightFlow.getMetrics(),
      financial_events: await financialEventStore.getStats().catch(e => ({ error: e.message })),
    };

    return {
      all_valid:
        results.provenance_chain.valid !== false &&
        results.decision_ledger.valid !== false,
      results,
    };
  }

  async _safeHook(hookFn, eventName, traceId) {
    try {
      await hookFn();
    } catch (err) {
      logger.warn(`[FinancialIntegration] Hook ${eventName} failed (trace: ${traceId}):`, err.message);
    }
  }
}

import crypto from 'crypto';
export default new FinancialIntegrationService();
