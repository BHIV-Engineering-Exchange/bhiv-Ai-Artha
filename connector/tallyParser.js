/**
 * tallyParser — tolerant Tally XML parser for the connector.
 * Extracts ledgers/parties, outstanding bills, vouchers from
 * Tally XML responses. No persistence — pure parse functions.
 *
 * Handles real Tally XML which may have varying nesting depths,
 * optional tags, and inline attributes.
 */

function readTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function readAttr(block, tag, attr) {
  const m = block.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i'));
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

/**
 * Extract all blocks of a given tag name from XML.
 * Handles nested tags correctly by counting open/close pairs.
 */
function extractBlocks(xml, tagName) {
  const openRegex = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'gi');
  const closeTag = `</${tagName}>`;
  const blocks = [];
  let match;

  while ((match = openRegex.exec(xml)) !== null) {
    const start = match.index;
    let depth = 1;
    let pos = match.index + match[0].length;

    while (depth > 0 && pos < xml.length) {
      const nextOpen = xml.indexOf(`<${tagName}`, pos);
      const nextClose = xml.indexOf(closeTag, pos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Check it's actually an opening tag (not self-closing or closing)
        const afterOpen = xml[nextOpen + tagName.length];
        if (afterOpen === '>' || afterOpen === ' ' || afterOpen === '\t' || afterOpen === '\n') {
          depth++;
        }
        pos = nextOpen + 1;
      } else {
        depth--;
        if (depth === 0) {
          blocks.push(xml.slice(start, nextClose + closeTag.length));
        }
        pos = nextClose + closeTag.length;
      }
    }
  }
  return blocks;
}

export function parseLedgers(xml) {
  if (!xml || !xml.trim()) return [];
  const ledgers = [];
  for (const block of extractBlocks(xml, 'LEDGER')) {
    const gstBlock = extractBlocks(block, 'GSTREGISTRATIONDETAILS')[0] || '';
    ledgers.push({
      name: readTag(block, 'NAME') || readAttr(block, 'LEDGER', 'NAME'),
      guid: readTag(block, 'GUID') || readAttr(block, 'LEDGER', 'GUID'),
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

  // Try extracting BILLALLOCATIONS blocks (standard Tally outstanding)
  const billBlocks = extractBlocks(xml, 'BILLALLOCATIONS');
  for (const block of billBlocks) {
    // The PARENT tag may be in a wrapping LEDGER or ALLLEDGERENTRIES block
    const parent = block.match(/<PARENT>([^<]*)<\/PARENT>/i)
      || block.match(/<LEDGERNAME>([^<]*)<\/LEDGERNAME>/i);
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

  // Also try LEDGERENTRIES / ALLLEDGERENTRIES blocks for outstanding info
  if (bills.length === 0) {
    for (const block of extractBlocks(xml, 'ALLLEDGERENTRIES')) {
      const billBlock = extractBlocks(block, 'BILLALLOCATIONS')[0];
      if (!billBlock) continue;
      const parent = block.match(/<LEDGERNAME>([^<]*)<\/LEDGERNAME>/i);
      bills.push({
        partyName: parent ? parent[1].trim() : '',
        billName: readTag(billBlock, 'BILLNAME'),
        billDate: readTag(billBlock, 'BILLDATE'),
        dueDate: readTag(billBlock, 'DUEBILLDATE'),
        amount: parseAmount(readTag(billBlock, 'AMOUNT')),
        balance: parseAmount(readTag(billBlock, 'BILLAMOUNT') || readTag(billBlock, 'AMOUNT')),
        billType: readTag(billBlock, 'OBJTYPE') || 'UNKNOWN',
      });
    }
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
        debitCredit: readTag(entryBlock, 'DEBITCREDIT') || undefined,
      });
    }
    const gstBlock = extractBlocks(block, 'GSTITEM')[0] || extractBlocks(block, 'VATITEM')[0] || '';
    vouchers.push({
      voucherType: readTag(block, 'VOUCHERTYPE') || readTag(block, 'VOUCHERSTATUS'),
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
