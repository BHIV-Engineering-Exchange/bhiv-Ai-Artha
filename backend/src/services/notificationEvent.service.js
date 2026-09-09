import Notification from '../models/Notification.js';
import logger from '../config/logger.js';

class NotificationEventService {
  /**
   * Fire-and-forget notification creator. Never throws — failures are logged only.
   */
  async _create(data) {
    try {
      await Notification.create({
        title: data.title,
        body: data.body,
        type: data.type || 'info',
        category: data.category || 'system',
        recipientId: data.recipientId || null,
        recipientRole: data.recipientRole || 'all',
        data: data.data || {},
        link: data.link || null,
        priority: data.priority || 'normal',
      });
    } catch (err) {
      logger.warn(`NotificationEvent create failed: ${err.message}`);
    }
  }

  // ─── Invoice Events ──────────────────────────────────────────────

  async invoiceCreated(invoice) {
    await this._create({
      title: `Invoice created: ${invoice.invoiceNumber}`,
      body: `${invoice.customerName} — ₹${Number(invoice.totalAmount || 0).toLocaleString('en-IN')}`,
      type: 'info',
      category: 'finance',
      link: `/invoices/${invoice._id}`,
      data: { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount },
    });
  }

  async invoiceSent(invoice) {
    await this._create({
      title: `Invoice sent: ${invoice.invoiceNumber}`,
      body: `${invoice.customerName} — ₹${Number(invoice.totalAmount || 0).toLocaleString('en-IN')} (Status: Sent)`,
      type: 'success',
      category: 'finance',
      link: `/invoices/${invoice._id}`,
      data: { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount },
    });
  }

  async invoicePayment(invoice, paymentAmount, paymentMethod) {
    const amount = Number(paymentAmount || 0);
    await this._create({
      title: `Payment received: ${invoice.invoiceNumber}`,
      body: `₹${amount.toLocaleString('en-IN')} via ${paymentMethod || 'N/A'} from ${invoice.customerName}`,
      type: 'payment',
      category: 'finance',
      priority: 'high',
      link: `/invoices/${invoice._id}`,
      data: { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber, paymentAmount: amount, paymentMethod },
    });
  }

  async invoiceCancelled(invoice, reason) {
    await this._create({
      title: `Invoice cancelled: ${invoice.invoiceNumber}`,
      body: `${invoice.customerName} — ${reason || 'No reason provided'}`,
      type: 'warning',
      category: 'finance',
      link: `/invoices/${invoice._id}`,
      data: { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber, reason },
    });
  }

  // ─── Expense Events ──────────────────────────────────────────────

  async expenseCreated(expense) {
    await this._create({
      title: `Expense created: ${expense.expenseNumber || 'New'}`,
      body: `${expense.vendor || 'Unknown'} — ₹${Number(expense.amount || 0).toLocaleString('en-IN')}`,
      type: 'info',
      category: 'finance',
      link: `/expenses`,
      data: { expenseId: expense._id, expenseNumber: expense.expenseNumber, amount: expense.amount },
    });
  }

  async expenseApproved(expense) {
    await this._create({
      title: `Expense approved: ${expense.expenseNumber || 'Expense'}`,
      body: `${expense.vendor || 'Unknown'} — ₹${Number(expense.amount || 0).toLocaleString('en-IN')}`,
      type: 'success',
      category: 'finance',
      link: `/expenses`,
      data: { expenseId: expense._id, expenseNumber: expense.expenseNumber, amount: expense.amount },
    });
  }

  async expenseRejected(expense, reason) {
    await this._create({
      title: `Expense rejected: ${expense.expenseNumber || 'Expense'}`,
      body: `${expense.vendor || 'Unknown'} — ${reason || 'No reason provided'}`,
      type: 'error',
      category: 'finance',
      link: `/expenses`,
      data: { expenseId: expense._id, expenseNumber: expense.expenseNumber, reason },
    });
  }

  async expenseRecorded(expense) {
    await this._create({
      title: `Expense recorded to ledger: ${expense.expenseNumber || 'Expense'}`,
      body: `₹${Number(expense.amount || 0).toLocaleString('en-IN')} posted to ledger`,
      type: 'success',
      category: 'finance',
      link: `/expenses`,
      data: { expenseId: expense._id, expenseNumber: expense.expenseNumber },
    });
  }

  // ─── TDS Events ──────────────────────────────────────────────────

  async tdsEntryCreated(tdsEntry) {
    await this._create({
      title: `TDS entry created: ${tdsEntry.entryNumber || 'TDS'}`,
      body: `${tdsEntry.deductee?.name || 'Unknown'} — ₹${Number(tdsEntry.tdsAmount || 0).toLocaleString('en-IN')} (${tdsEntry.section || ''})`,
      type: 'info',
      category: 'compliance',
      link: `/tds`,
      data: { tdsId: tdsEntry._id, entryNumber: tdsEntry.entryNumber, tdsAmount: tdsEntry.tdsAmount },
    });
  }

  async tdsDeducted(tdsEntry) {
    await this._create({
      title: `TDS deducted: ${tdsEntry.entryNumber || 'TDS'}`,
      body: `${tdsEntry.deductee?.name || 'Unknown'} — ₹${Number(tdsEntry.tdsAmount || 0).toLocaleString('en-IN')} deducted`,
      type: 'success',
      category: 'compliance',
      link: `/tds`,
      data: { tdsId: tdsEntry._id, entryNumber: tdsEntry.entryNumber },
    });
  }

  // ─── Tally Sync Events ──────────────────────────────────────────

  async tallySyncComplete(results) {
    const total = (results.sales || 0) + (results.receipt || 0) + (results.payment || 0) + (results.journal || 0);
    if (total === 0) return;
    await this._create({
      title: 'Tally sync complete',
      body: `Synced ${total} vouchers (Sales: ${results.sales || 0}, Receipts: ${results.receipt || 0}, Payments: ${results.payment || 0}, Journals: ${results.journal || 0})`,
      type: 'success',
      category: 'tally',
      link: `/tally`,
      data: results,
    });
  }

  // ─── Dealer / Agent Events ──────────────────────────────────────

  async dealerSyncComplete(created, updated) {
    if (created === 0 && updated === 0) return;
    await this._create({
      title: 'Dealer sync from Tally',
      body: `Created: ${created}, Updated: ${updated} dealers`,
      type: 'info',
      category: 'crm',
      link: `/dealers`,
      data: { created, updated },
    });
  }

  async agentCheckIn(agentName, dealerName) {
    await this._create({
      title: `${agentName} checked in`,
      body: `Arrived at ${dealerName}`,
      type: 'location',
      category: 'niyantran',
      link: `/niyantran`,
      data: { agentName, dealerName },
    });
  }

  async agentCheckOut(agentName, dealerName, outcome) {
    await this._create({
      title: `${agentName} checked out`,
      body: `Left ${dealerName}${outcome ? ` — ${outcome}` : ''}`,
      type: 'location',
      category: 'niyantran',
      link: `/niyantran`,
      data: { agentName, dealerName, outcome },
    });
  }
}

export default new NotificationEventService();
