/**
 * tallyParser — tolerant Tally XML parser for the connector.
 * Extracts companies, ledgers/parties, outstanding bills, vouchers from
 * Tally XML responses. No persistence — pure parse functions.
 */

function readTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function readAttr(block, attr) {
  const m = block.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
  return m ? m[1].trim() : '';
}

function dedupe(arr, keyFn) {
  const seen = new Set();
  return arr.filter((item) => {
    const k = keyFn(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function parseAmount(raw) {
  if (!raw) return 0;
  const s = String(raw).replace(/[₹,\s]/g, '');
  const neg = s.startsWith('-');
  const clean = neg ? s.slice(1) : s;
  const n = parseFloat(clean);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

function extractBlocks(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>`, 'gi');
  const blocks = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const start = match.index;
    const end = xml.indexOf(`</${tagName}>`, start);
    if (end === -1) continue;
    blocks.push(xml.slice(start, end + tagName.length + 3));
  }
  return blocks;
}

export function parseCompanies(xml) {
  if (!xml || !xml.trim()) return [];
  const companies = [];
  for (const block of extractBlocks(xml, 'COMPANY')) {
    companies.push({ name: readTag(block, 'COMPANYNAME'), masterId: readTag(block, 'MASTERID') });
  }
  return dedupe(companies.filter((c) => c.name), (c) => c.name.toLowerCase());
}

export function parseLedgers(xml) {
  if (!xml || !xml.trim()) return [];
  const ledgers = [];
  for (const block of extractBlocks(xml, 'LEDGER')) {
    const gstBlock = extractBlocks(block, 'GSTREGISTRATIONDETAILS')[0] || '';
    ledgers.push({
      name: readTag(block, 'NAME') || readAttr(block, 'NAME'),
      guid: readTag(block, 'GUID') || readAttr(block, 'GUID'),
      group: readTag(block, 'PARENT'),
      closingBalance: parseAmount(readTag(block, 'CLOSINGBALANCE')),
      openingBalance: parseAmount(readTag(block, 'OPENINGBALANCE')),
      creditLimit: parseAmount(readTag(block, 'CREDITLIMIT')),
      gstin: readTag(gstBlock, 'GSTIN'),
      pan: readTag(block, 'INCOMETAXNUMBER') || readTag(block, 'PAN'),
    });
  }
  return ledgers;
}

export function parseOutstanding(xml) {
  if (!xml || !xml.trim()) return [];
  const bills = [];
  for (const block of extractBlocks(xml, 'BILLALLOCATIONS')) {
    const parent = block.match(/<PARENT>([^<]*)<\/PARENT>/i);
    bills.push({
      partyName: parent ? parent[1].trim() : '',
      billName: readTag(block, 'BILLNAME'),
      billDate: readTag(block, 'BILLDATE'),
      dueDate: readTag(block, 'DUEBILLDATE'),
      amount: parseAmount(readTag(block, 'AMOUNT')),
      balance: parseAmount(readTag(block, 'BILLAMOUNT') || readTag(block, 'AMOUNT')),
      billType: readTag(block, 'OBJTYPE') || 'UNKNOWN',
    });
  }
  return bills;
}

export function parseVouchers(xml) {
  if (!xml || !xml.trim()) return [];
  const vouchers = [];
  for (const block of extractBlocks(xml, 'VOUCHER')) {
    const entries = [];
    for (const entryBlock of extractBlocks(block, 'ALLLEDGERENTRIES')) {
      entries.push({
        ledgerName: readTag(entryBlock, 'LEDGERNAME'),
        amount: parseAmount(readTag(entryBlock, 'AMOUNT')),
      });
    }
    const gstBlock = extractBlocks(block, 'GSTITEM')[0] || extractBlocks(block, 'VATITEM')[0] || '';
    vouchers.push({
      voucherType: readTag(block, 'VOUCHERTYPE'),
      voucherNumber: readTag(block, 'VOUCHERNUMBER'),
      date: readTag(block, 'DATE'),
      partyName: readTag(block, 'PARTYLEDGERNAME'),
      amount: parseAmount(readTag(block, 'AMOUNT')),
      narration: readTag(block, 'NARRATION'),
      reference: readTag(block, 'REFERENCE'),
      entries,
      gstDetails: gstBlock ? {
        gstin: readTag(gstBlock, 'GSTIN'),
        taxableValue: parseAmount(readTag(gstBlock, 'TAXABLEVALUE')),
        cgst: parseAmount(readTag(gstBlock, 'CGST')),
        sgst: parseAmount(readTag(gstBlock, 'SGST')),
        igst: parseAmount(readTag(gstBlock, 'IGST')),
      } : null,
    });
  }
  return vouchers;
}