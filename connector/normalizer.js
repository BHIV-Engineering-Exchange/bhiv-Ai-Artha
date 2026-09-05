/**
 * normalizer — converts raw Tally parsed data into MDU (Master Data Unit) records.
 * This is the canonical contract that the cloud ARTHA ingestion endpoint expects.
 * Read-only, no persistence, no side effects.
 */
import { sha256 } from './config.js';

function makeRecord(entityType, canonicalData, tenantId, company) {
  const record = {
    entity_type: entityType,
    tenant_id: tenantId,
    company,
    source_connector: 'tally',
    read_only: true,
    canonical_data: canonicalData,
    schema_version: '1.0.0',
    source_system: 'tally-connector-agent',
    fetched_at: new Date().toISOString(),
  };
  record.idempotency_key = `${tenantId}:${entityType}:${company}:${canonicalData.party_name || canonicalData.name || canonicalData.voucher_number || canonicalData.bill_name || Date.now()}`;
  record.content_hash = sha256(JSON.stringify(record.canonical_data));
  return record;
}

export function normalizeParties(ledgers, { tenantId, company }) {
  return ledgers.map((l) => makeRecord('party', {
    party_id: l.name,
    party_name: l.name,
    group: l.group,
    closing_balance: l.closingBalance,
    opening_balance: l.openingBalance,
    credit_limit: l.creditLimit,
    gstin: l.gstin,
    pan: l.pan,
  }, tenantId, company));
}

export function normalizeOutstanding(bills, { tenantId, company }) {
  return bills.map((b) => {
    let billDate = null;
    let dueDate = null;
    let daysOverdue = 0;
    try {
      if (b.billDate) {
        billDate = new Date(b.billDate);
        if (Number.isNaN(billDate.getTime())) billDate = null;
      }
      if (b.dueDate) {
        dueDate = new Date(b.dueDate);
        if (Number.isNaN(dueDate.getTime())) dueDate = null;
      }
      const now = new Date();
      daysOverdue = dueDate && dueDate < now ? Math.floor((now - dueDate) / 86400000) : 0;
    } catch { /* ignore bad dates */ }
    return makeRecord('outstanding', {
      party_name: b.partyName,
      bill_name: b.billNo || b.billName || '',
      bill_date: billDate ? billDate.toISOString().slice(0, 10) : null,
      due_date: dueDate ? dueDate.toISOString().slice(0, 10) : null,
      days_overdue: daysOverdue,
      amount: b.amount,
      balance: b.balance,
      bill_type: b.billType,
    }, tenantId, company);
  });
}

export function normalizeVouchers(vouchers, { tenantId, company }) {
  return vouchers.map((v) => {
    let isoDate = null;
    try {
      if (v.date) {
        const d = new Date(v.date);
        if (!Number.isNaN(d.getTime())) isoDate = d.toISOString().slice(0, 10);
      }
    } catch { /* ignore bad dates */ }
    return makeRecord('voucher', {
      voucher_type: v.voucherType,
      voucher_number: v.voucherNumber,
      date: isoDate,
      party_name: v.partyName,
      amount: v.amount,
      narration: v.narration,
      reference: v.reference,
      entries: v.entries,
      gst_details: v.gstDetails,
    }, tenantId, company);
  });
}

export function buildSyncRun({ tenantId, company, counts, durationMs }) {
  return {
    entity_type: 'sync_run',
    tenant_id: tenantId,
    company,
    started_at: new Date(Date.now() - durationMs).toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: durationMs,
    counts,
    total_records: Object.values(counts).reduce((s, c) => s + c, 0),
    read_only: true,
    source: 'tally-connector-agent',
    schema_version: '1.0.0',
  };
}