import { createHash, randomUUID } from 'node:crypto';
import { fetchFromTally, pingTally, buildEnvelope } from './tallyXmlClient.js';
import {
  parseCompanies,
  parseLedgers,
  parseOutstanding,
  parseVouchers,
  classifyGroup,
} from './tallyXmlParser.js';

/**
 * tallyConnector.service — the connector boundary, mirroring the Setu-Aman
 * BaseConnector contract (authenticate → fetch_data → normalize → MDURecord).
 *
 *   manifest()       → connector identity + entity capabilities
 *   authenticate()   → connectivity/auth probe against the Tally gateway
 *   fetchData(type)  → read-only fetch of a supported entity
 *   normalize(type)  → raw Tally records → canonical MDU records
 *
 * Entity types mirror Setu-Aman MDUEntityType where applicable: company,
 * party (ledger), outstanding (bills), voucher, gst, tds.
 *
 * READ-ONLY BY CONSTRUCTION: the underlying client refuses to emit anything but
 * `Export Data` envelopes, so no call in this boundary can mutate Tally.
 */

export const ENTITY_TYPES = ['company', 'party', 'outstanding', 'voucher', 'gst', 'tds'];

export const CONNECTOR_MANIFEST = {
  name: 'tally',
  displayName: 'Bright Connection Tally Connector',
  version: '1.0.0',
  readOnly: true,
  protocol: 'tally-xml-gateway',
  auth: 'basic',
  tenantId: 'tenant_bright_connection_001',
  entities: [
    { type: 'company', description: 'Tally companies available on the gateway' },
    { type: 'party', description: 'Party ledgers (dealers/suppliers) with balances & GSTIN' },
    { type: 'outstanding', description: 'Bill-wise outstanding receivables/payables' },
    { type: 'voucher', description: 'Voucher register (sales/receipts/payments)' },
    { type: 'gst', description: 'GST register summary (read-only export)' },
    { type: 'tds', description: 'TDS certificate register (read-only export)' },
  ],
};

export function manifest() {
  return { ...CONNECTOR_MANIFEST };
}

export function isReadOnly() {
  return true;
}

function companyStaticVars(company, extra = {}) {
  const cfgCompany = company || process.env.TALLY_COMPANY || '';
  return {
    SVCURRENTCOMPANY: cfgCompany,
    ...extra,
  };
}

function partyCollection(company) {
  return buildEnvelope({
    requestName: 'Ledger',
    collectionType: 'Ledger',
    collectionName: 'Accounts',
    fetch: 'ALL',
    staticVars: companyStaticVars(company),
  });
}

function outstandingEnvelope(company, partyName, { fromDate, toDate } = {}) {
  return buildEnvelope({
    requestName: 'Statement of Accounts',
    collectionType: 'Ledger',
    collectionName: 'LedgerVch',
    fetch: 'ALL',
    staticVars: companyStaticVars(company, {
      SVFROMDATE: fromDate || '',
      SVTODATE: toDate || '',
      ...(partyName ? { NATIVEMETHOD: `Name=${partyName}` } : {}),
    }),
  });
}

function voucherEnvelope(company, { fromDate, toDate } = {}) {
  return buildEnvelope({
    requestName: 'Voucher Register',
    collectionType: 'Voucher',
    collectionName: 'VoucherRegister',
    fetch: 'ALL',
    staticVars: companyStaticVars(company, {
      SVFROMDATE: fromDate || '',
      SVTODATE: toDate || '',
    }),
  });
}

async function authenticate() {
  const xml = await pingTally();
  const companies = parseCompanies(xml);
  if (!companies.length) {
    throw new Error('AUTH_OK_BUT_EMPTY: gateway reachable but returned no companies.');
  }
  return { ok: true, companies, connector: 'tally' };
}

/**
 * fetchData(entityType) → raw parsed records from Tally.
 * Every request goes through the read-only client.
 */
async function fetchData(entityType, { company, partyName, fromDate, toDate } = {}) {
  switch (entityType) {
    case 'company': {
      const xml = await pingTally();
      return parseCompanies(xml);
    }
    case 'party': {
      const xml = await fetchFromTally(partyCollection(company));
      return parseLedgers(xml);
    }
    case 'outstanding': {
      const xml = await fetchFromTally(outstandingEnvelope(company, partyName, { fromDate, toDate }));
      return parseOutstanding(xml);
    }
    case 'voucher': {
      const xml = await fetchFromTally(voucherEnvelope(company, { fromDate, toDate }));
      return parseVouchers(xml);
    }
    case 'gst':
    case 'tds': {
      throw new Error(`Entity "${entityType}" requires a dedicated Tally report envelope — configuration pending from Raj.`);
    }
    default:
      throw new Error(`Unsupported entity type "${entityType}".`);
  }
}

/**
 * normalize(entityType, raw, opts) → canonical MDU record.
 * Mirrors Setu-Aman's MDURecord shape so the same record can be ingested by the
 * Python framework (MasterDB/InsightFlow) or dispatched to SETU.
 */
function normalize(entityType, raw, { company, traceId } = {}) {
  const tenantId = process.env.TALLY_TENANT_ID || CONNECTOR_MANIFEST.tenantId;
  const id = randomUUID();
  const entityId = `${CONNECTOR_MANIFEST.name}:${entityType}:${id}`;
  const trace = traceId || id;
  const rawRef = raw.rawRef || '';

  const record = {
    entity_type: entityType,
    entity_id: entityId,
    tenant_id: tenantId,
    source_connector: CONNECTOR_MANIFEST.name,
    source_connector_version: CONNECTOR_MANIFEST.version,
    read_only: true,
    company: company || process.env.TALLY_COMPANY || '',
    canonical_data: raw.canonical_data,
    trace_id: trace,
    schema_version: '1.0.0',
    raw_ref: rawRef,
    ingested_at: new Date().toISOString(),
    idempotency_key: `${tenantId}:${entityType}:${id}`,
    integrity_hash: '',
    tags: raw.tags || [],
    metadata: {
      connector: CONNECTOR_MANIFEST.name,
      read_only: true,
      ...(raw.metadata || {}),
    },
  };
  record.integrity_hash = createHash('sha256')
    .update(JSON.stringify({ entity_type: record.entity_type, canonical_data: record.canonical_data, trace_id: record.trace_id }))
    .digest('hex');
  return record;
}

function toCanonical(raw, entityType, _company) {
  switch (entityType) {
    case 'party':
      return raw.map((l) => ({
        party_id: l.name,
        party_name: l.name,
        ledger_name: l.name,
        group: l.group || '',
        party_type: classifyGroup(l.group),
        opening_balance: l.openingBalance,
        closing_balance: l.closingBalance,
        credit_limit: l.creditLimit,
        gstin: l.gstin,
        pan: l.pan,
        address: l.address,
        contact: l.contact,
        currency: l.currency || 'INR',
      }));
    case 'outstanding':
      return raw.map((o) => ({
        party_name: o.partyName,
        ledger_name: o.ledgerName || o.partyName,
        bill_no: o.billNo,
        bill_date: o.billDate ? o.billDate.toISOString() : null,
        due_date: o.dueDate ? o.dueDate.toISOString() : null,
        days_overdue: o.daysOverdue,
        amount: o.amount,
        received: o.received,
        balance: o.balance,
        bill_type: o.billType,
      }));
    case 'voucher':
      return raw.map((v) => ({
        voucher_type: v.voucherType,
        voucher_number: v.voucherNumber,
        date: v.date ? v.date.toISOString() : null,
        party_name: v.partyName,
        amount: v.amount,
        narration: v.narration,
        reference: v.reference,
        entries: v.entries,
        gst_details: v.gstDetails,
      }));
    case 'company':
      return raw.map((c) => ({ name: c.name, master_id: c.masterId }));
    default:
      return raw;
  }
}

/**
 * fetchAndNormalize(entityType, opts) → array of canonical MDU records.
 * The single entry point used by the ARTHA adapter and the SETU bridge.
 */
async function fetchAndNormalize(entityType, { company, partyName, fromDate, toDate, traceId } = {}) {
  const raw = await fetchData(entityType, { company, partyName, fromDate, toDate });
  const canonicalData = toCanonical(raw, entityType, company);
  const rawRef = `${CONNECTOR_MANIFEST.name}:${entityType}:${company || '*'}:${new Date().toISOString()}`;
  return canonicalData.map((item) => normalize(entityType, {
    canonical_data: item,
    rawRef: `${rawRef}:${item.party_name || item.name || item.voucher_number || ''}`,
    metadata: { fetchedEntities: raw.length },
  }, { company, traceId }));
}

export default {
  manifest,
  isReadOnly,
  authenticate,
  fetchData,
  fetchAndNormalize,
  normalize,
  ENTITY_TYPES,
};