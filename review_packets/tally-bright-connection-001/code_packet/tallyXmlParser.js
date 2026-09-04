import { TallyProtocolError } from './tallyXmlClient.js';

/**
 * tallyXmlParser — tolerant, dependency-free parser for Tally XML responses.
 *
 * Uses the same regex-based technique already proven in ARTHA's
 * tallyCompatibility.service.js (v2.1.0), so no new npm dependency is required.
 * Every parse is defensive: missing tags yield empty/zero defaults instead of
 * throwing, but a completely empty body raises TallyProtocolError so the caller
 * can distinguish "no data" from "malformed response".
 */

const DR_CR_RE = /^\s*(-?[0-9,.]+)\s*(Cr\.?|Dr\.?)?\s*$/i;

export function parseAmount(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  const m = String(value).trim().match(DR_CR_RE);
  if (!m) return 0;
  const sign = m[1].startsWith('-') ? -1 : 1;
  const num = Number(m[1].replace(/,/g, ''));
  if (Number.isNaN(num)) return 0;
  const marker = (m[2] || '').toLowerCase();
  return (marker.startsWith('cr') ? -1 : 1) * sign * Math.abs(num);
}

function readTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function readAttr(block, attr) {
  const re = new RegExp(`${attr}="([^"]*)"`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function readTagOrAttr(block, tag, attr) {
  const fromTag = readTag(block, tag);
  if (fromTag) return fromTag;
  return readAttr(block, attr);
}

function readAll(block, tag) {
  const out = [];
  const re = new RegExp(`<${tag}(?=[\\s>])[\\s\\S]*?<\\/${tag}>|<${tag}(?=[\\s>])[^>]*\\/>`, 'ig');
  let m;
  while ((m = re.exec(block)) !== null) {
    out.push(m[0]);
  }
  return out;
}

function splitBlocks(xml, tag) {
  const blocks = [];
  const re = new RegExp(`<${tag}[\\s>]`, 'ig');
  let m;
  while ((m = re.exec(xml)) !== null) {
    const start = m.index;
    const endMarker = `</${tag}>`;
    const end = xml.indexOf(endMarker, start + m[0].length);
    if (end === -1) break;
    blocks.push(xml.slice(start, end + endMarker.length));
    re.lastIndex = end + endMarker.length;
  }
  return blocks;
}

function parseTallyDate(value) {
  if (!value) return null;
  const v = String(value).trim();
  const ddmmyyyy = v.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (ddmmyyyy) return new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`);
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const dmy = v.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dmy) {
    const month = months.indexOf(dmy[2].toLowerCase());
    if (month !== -1) {
      let year = Number(dmy[3]);
      if (year < 100) year += 2000;
      return new Date(year, month, Number(dmy[1]));
    }
  }
  const iso = new Date(v);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

function dedupe(list, keyFn) {
  const seen = new Set();
  return list.filter((item) => {
    const k = keyFn(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function parseCompanies(xml) {
  if (!xml || !xml.trim()) {
    throw new TallyProtocolError('EMPTY_RESPONSE', 'Tally returned an empty response for List of Companies.');
  }
  const companies = [];
  for (const block of splitBlocks(xml, 'COMPANY')) {
    companies.push({
      name: readTagOrAttr(block, 'COMPANYNAME', 'NAME') || readAttr(block, 'NAME'),
      masterId: readTag(block, 'MASTERID'),
      guid: readAttr(block, 'GUID'),
    });
  }
  return dedupe(companies.filter((c) => c.name), (c) => c.name.toLowerCase());
}

export function classifyGroup(group) {
  const g = (group || '').toLowerCase();
  if (g.includes('debtor')) return 'SUNDRY_DEBTOR';
  if (g.includes('creditor')) return 'SUNDRY_CREDITOR';
  return 'OTHER';
}

export function parseLedgers(xml) {
  if (!xml || !xml.trim()) {
    throw new TallyProtocolError('EMPTY_RESPONSE', 'Tally returned an empty response for Ledger export.');
  }
  const ledgers = [];
  for (const block of splitBlocks(xml, 'LEDGER')) {
    const name = readTagOrAttr(block, 'NAME', 'NAME');
    if (!name) continue;

    let gstin = readTag(block, 'GSTIN') || readTag(block, 'GSTNO');
    const gstDetails = readTag(block, 'GSTREGISTRATIONDETAILS.LIST');
    if (!gstin && gstDetails) gstin = readTag(gstDetails, 'GSTIN');
    if (!gstin) {
      const companyGst = readTag(block, 'COMPANY.GSTREGISTRATIONDETAILS.LIST');
      if (companyGst) gstin = readTag(companyGst, 'GSTIN');
    }

    ledgers.push({
      name,
      parent: readTag(block, 'PARENT') || readAttr(block, 'PARENT'),
      group: readTag(block, 'GROUPNAME') || readTag(block, 'PARENT'),
      openingBalance: parseAmount(readTag(block, 'OPENINGBALANCE') || readAttr(block, 'OPENINGBALANCE')),
      closingBalance: parseAmount(readTag(block, 'CLOSINGBALANCE') || readAttr(block, 'CLOSINGBALANCE')),
      creditLimit: parseAmount(readTag(block, 'CREDITLIMIT') || readAttr(block, 'CREDITLIMIT')),
      gstin: gstin || '',
      pan: readTag(block, 'PAN') || readAttr(block, 'PAN'),
      address: readTag(block, 'MAILINGNAME') || readTag(block, 'ADDRESS') || '',
      contact: readTag(block, 'PHONENUMBER') || readTag(block, 'CONTACT') || '',
      currency: readTag(block, 'CURRENCY') || 'INR',
    });
  }
  return dedupe(ledgers, (l) => l.name.toLowerCase());
}

export function parseOutstanding(xml) {
  if (!xml || !xml.trim()) {
    throw new TallyProtocolError('EMPTY_RESPONSE', 'Tally returned an empty response for Statement of Accounts.');
  }
  const out = [];
  const firstLedgerTag = (xml.match(/<LEDGER[^>]*>/) || [''])[0];
  const partyName = readTag(xml, 'PARTYNAME') || readTag(xml, 'LEDGERNAME') || readAttr(firstLedgerTag, 'NAME');
  const parent = readTag(xml, 'PARENT');

  const billBlocks = readAll(xml, 'BILLWISEDETAILS.LIST');
  if (billBlocks.length) {
    for (const b of billBlocks) {
      const amount = parseAmount(readTag(b, 'AMOUNT'));
      const received = parseAmount(readTag(b, 'RECEIVED'));
      const billDate = parseTallyDate(readTag(b, 'BILLDATE') || readTag(b, 'DATE'));
      const dueDate = parseTallyDate(readTag(b, 'DUEDATE'));
      const daysOverdue = dueDate && billDate
        ? Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / 86400000))
        : 0;
      out.push({
        partyName,
        ledgerName: readTag(b, 'NAME') || partyName,
        billNo: readTag(b, 'NAME') || readTag(b, 'BILLNUMBER') || '',
        billDate,
        dueDate,
        daysOverdue,
        amount,
        received,
        balance: parseAmount(readTag(b, 'CLOSINGBALANCE')) || (amount - received),
        billType: readTag(b, 'BILLTYPE') || 'UNKNOWN',
        parent,
      });
    }
    return out;
  }

  const ledgerName = readTag(xml, 'LEDGERNAME') || readTag(xml, 'NAME');
  out.push({
    partyName: partyName || ledgerName,
    ledgerName,
    billNo: '',
    billDate: null,
    dueDate: null,
    daysOverdue: 0,
    amount: parseAmount(readTag(xml, 'OPENINGBALANCE') || readTag(xml, 'CLOSINGBALANCE')),
    received: 0,
    balance: parseAmount(readTag(xml, 'CLOSINGBALANCE') || readTag(xml, 'OPENINGBALANCE')),
    billType: 'UNKNOWN',
    parent,
  });
  return out;
}

export function parseVouchers(xml) {
  if (!xml || !xml.trim()) {
    throw new TallyProtocolError('EMPTY_RESPONSE', 'Tally returned an empty response for Voucher Register.');
  }
  const vouchers = [];
  for (const block of splitBlocks(xml, 'VOUCHER')) {
    const type = readTag(block, 'VOUCHERTYPE') || readAttr(block, 'VCHTYPE') || 'Journal';
    const date = parseTallyDate(readTag(block, 'DATE') || readAttr(block, 'DATE'));

    const entries = [];
    for (const e of readAll(block, 'ALLLEDGERENTRIES.LIST')) {
      entries.push({
        ledgerName: readTag(e, 'LEDGERNAME') || readAttr(e, 'LEDGERNAME'),
        amount: parseAmount(readTag(e, 'AMOUNT') || readAttr(e, 'AMOUNT')),
      });
    }

    const partyName = readTag(block, 'PARTYLEDGERNAME') || readTag(block, 'PARTYNAME') || (entries[0] ? entries[0].ledgerName : '');
    const gstDetailsBlock = readTag(block, 'GSTDETAILS.LIST') || readTag(block, 'GSTDETAILS');
    const cgst = readTag(gstDetailsBlock, 'CGST') || readTag(block, 'CGST');
    const sgst = readTag(gstDetailsBlock, 'SGST') || readTag(block, 'SGST');
    const igst = readTag(gstDetailsBlock, 'IGST') || readTag(block, 'IGST');
    const taxable = readTag(gstDetailsBlock, 'TAXABLEVALUE') || readTag(block, 'TAXABLEVALUE');

    vouchers.push({
      voucherType: type,
      voucherNumber: readTag(block, 'VOUCHERNUMBER') || readTag(block, 'NUMBER'),
      date,
      partyName,
      partyLedgerName: readTag(block, 'PARTYLEDGERNAME') || partyName,
      amount: parseAmount(readTag(block, 'VOUCHERTOTALAMOUNT') || readAttr(block, 'VOUCHERTOTALAMOUNT') || (entries[0] ? entries[0].amount : 0)),
      narration: readTag(block, 'NARRATION') || '',
      reference: readTag(block, 'REFERENCE') || readAttr(block, 'REFERENCE'),
      entries,
      gstDetails: {
        gstin: readTag(block, 'GSTIN') || readTag(gstDetailsBlock, 'GSTIN') || '',
        taxableValue: parseAmount(taxable),
        cgst: parseAmount(cgst),
        sgst: parseAmount(sgst),
        igst: parseAmount(igst),
      },
    });
  }
  return vouchers;
}

export default {
  parseAmount,
  parseCompanies,
  parseLedgers,
  parseOutstanding,
  parseVouchers,
  classifyGroup,
  parseTallyDate,
};