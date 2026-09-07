/**
 * tallyParser — tolerant Tally XML parser for the connector.
 * Extracts ledgers/parties, outstanding bills, vouchers from
 * Tally XML responses. No persistence — pure parse functions.
 *
 * Matches the proven parsing logic from the review packet's tallyXmlParser.js
 * which handles real TallyPrime XML responses.
 */

const DR_CR_RE = /^\s*(-?[\d,.]+)\s*(Cr\.?|Dr\.?)?\s*$/i;

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

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function readTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? decodeEntities(m[1].trim()) : '';
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

/** Read ALL occurrences of a tag (handles .LIST variants). */
function readAll(block, tag) {
  const out = [];
  const re = new RegExp(`<${tag}(?=[\\s>])[\\s\\S]*?<\\/${tag}>|<${tag}(?=[\\s>])[^>]*\\/>`, 'ig');
  let m;
  while ((m = re.exec(block)) !== null) {
    out.push(m[0]);
  }
  return out;
}

/** Split XML into blocks by tag name (handles nesting via regex start/end). */
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

/** Strict calendar validation: checks year/month/day ranges and actual day count. */
function isValidCalendarDate(year, month, day) {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Check actual day count for the month (handles Feb leap year)
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

/** Format validated date components as ISO string. */
function fmtDate(year, month, day) {
  if (!isValidCalendarDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseTallyDate(value) {
  if (!value) return null;
  const v = String(value).trim();
  if (!v || v === '0' || v === '-') return null;

  // YYYY-MM-DD (ISO format) — strict validation
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const parts = v.split('-');
    return fmtDate(Number(parts[0]), Number(parts[1]), Number(parts[2]));
  }

  // YYYYMMDD format (e.g. "20260920") — try before DDMMYYYY to avoid ambiguity
  // Only return if valid; otherwise fall through to DDMMYYYY
  const yyyymmdd = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) {
    const result = fmtDate(Number(yyyymmdd[1]), Number(yyyymmdd[2]), Number(yyyymmdd[3]));
    if (result) return result;
    // Fall through to DDMMYYYY if YYYYMMDD produced invalid date (e.g. 20092026 → month 20)
  }

  // DD-Mon-YY or DD-Mon-YYYY (e.g. "20-Sep-26" or "20-Sep-2026")
  const dmy = v.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dmy) {
    const monthIdx = MONTH_NAMES.indexOf(dmy[2].toLowerCase());
    if (monthIdx !== -1) {
      let year = Number(dmy[3]);
      if (year < 100) year += 2000;
      return fmtDate(year, monthIdx + 1, Number(dmy[1]));
    }
  }

  // DDMMYYYY format (Tally native, e.g. "20092026" = 20-Sep-2026)
  const ddmmyyyy = v.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (ddmmyyyy) {
    return fmtDate(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]), Number(ddmmyyyy[1]));
  }

  // DD/MM/YYYY or DD/MM/YY
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    return fmtDate(year, Number(slash[2]), Number(slash[1]));
  }

  // DD-MM-YY or DD-MM-YYYY (e.g. "20-09-2026" or "20-09-26")
  const ddmmyy = v.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (ddmmyy) {
    let year = Number(ddmmyy[3]);
    if (year < 100) year += 2000;
    return fmtDate(year, Number(ddmmyy[2]), Number(ddmmyy[1]));
  }

  // DDMMYY format (e.g. "200926" = 20-Sep-2026)
  const ddmmyy6 = v.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (ddmmyy6) {
    let year = Number(ddmmyy6[3]);
    if (year < 100) year += 2000;
    return fmtDate(year, Number(ddmmyy6[2]), Number(ddmmyy6[1]));
  }

  // No format matched — return null instead of falling through to new Date()
  return null;
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
  if (!xml || !xml.trim()) return [];
  const companies = [];
  for (const block of splitBlocks(xml, 'COMPANY')) {
    companies.push({
      name: readTagOrAttr(block, 'COMPANYNAME', 'NAME') || readAttr(block, 'NAME'),
      masterId: readTag(block, 'MASTERID'),
    });
  }
  return dedupe(companies.filter((c) => c.name), (c) => c.name.toLowerCase());
}

export function parseLedgers(xml) {
  if (!xml || !xml.trim()) return [];
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
  if (!xml || !xml.trim()) return [];

  // Format 1: DSP-prefixed XML (from TYPE=Data reports like Bills Receivable/Payable)
  // Handles nested DSPACCNAME+DSPVOUCHER and flat sequential DSP tags
  const dspBills = parseDspOutstanding(xml);
  if (dspBills.length > 0) return dspBills;

  // Format 2: BILLWISEDETAILS.LIST blocks (from COLLECTION/EXPORTDATA responses)
  const out = [];
  const firstLedgerTag = (xml.match(/<LEDGER[^>]*>/) || [''])[0];
  const partyName = readTag(xml, 'PARTYNAME') || readTag(xml, 'LEDGERNAME') || readAttr(firstLedgerTag, 'NAME');

  const billBlocks = readAll(xml, 'BILLWISEDETAILS.LIST');
  if (billBlocks.length) {
    for (const b of billBlocks) {
      const amount = parseAmount(readTag(b, 'AMOUNT'));
      const received = parseAmount(readTag(b, 'RECEIVED'));
      const billDate = parseTallyDate(readTag(b, 'BILLDATE') || readTag(b, 'DATE'));
      const dueDate = parseTallyDate(readTag(b, 'DUEDATE'));
      out.push({
        partyName,
        ledgerName: readTag(b, 'NAME') || partyName,
        billNo: readTag(b, 'NAME') || readTag(b, 'BILLNUMBER') || '',
        billDate,
        dueDate,
        daysOverdue: computeDaysOverdue(dueDate),
        amount,
        received,
        balance: parseAmount(readTag(b, 'CLOSINGBALANCE')) || (amount - received),
        billType: readTag(b, 'BILLTYPE') || 'UNKNOWN',
        parent: readTag(xml, 'PARENT'),
      });
    }
    return out;
  }

  // Format 3: BILLALLOCATIONS blocks (from voucher data)
  for (const block of splitBlocks(xml, 'BILLALLOCATIONS')) {
    const parent = block.match(/<PARENT>([^<]*)<\/PARENT>/i)
      || block.match(/<LEDGERNAME>([^<]*)<\/LEDGERNAME>/i);
    out.push({
      partyName: parent ? parent[1].trim() : '',
      billNo: readTag(block, 'BILLNAME'),
      billDate: parseTallyDate(readTag(block, 'BILLDATE')),
      dueDate: parseTallyDate(readTag(block, 'DUEBILLDATE')),
      daysOverdue: computeDaysOverdue(parseTallyDate(readTag(block, 'DUEBILLDATE'))),
      amount: parseAmount(readTag(block, 'AMOUNT')),
      balance: parseAmount(readTag(block, 'BILLAMOUNT') || readTag(block, 'AMOUNT')),
      billType: readTag(block, 'OBJTYPE') || 'UNKNOWN',
    });
  }

  return out;
}

/**
 * Extract ALL DSP-prefixed leaf tags with their positions in the XML.
 * Returns array of { tag, value, pos } sorted by position.
 *
 * Three match patterns:
 * 1. <DSPTAG>content</DSPTAG> — leaf tags with text content
 * 2. <DSPTAG /> — self-closing tags
 * 3. <DSPACCNAME> — opening tag only (used as party boundary marker)
 */
function extractDspTags(xml) {
  const tags = [];
  // Match: <DSPTAG>content</DSPTAG> OR <DSPTAG /> (self-closing) OR <DSPACCNAME> (opening only)
  const re = /<(?!\/)(DSP[A-Z]+)(?:\s[^>]*)?>([^<]*)<\/\1>|<(?!\/)(DSP[A-Z]+)\s[^>]*\/>|<(?!\/)(DSPACCNAME)(?:\s[^>]*)?>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const tag = (m[1] || m[3] || m[4]).toUpperCase();
    const value = decodeEntities((m[2] || '').trim());
    tags.push({ tag, value, pos: m.index });
  }
  return tags;
}

/**
 * Parse DSP-prefixed outstanding XML from TYPE=Data reports.
 * Handles Bills Receivable / Bills Payable report format.
 *
 * Tally DSP XML can appear in multiple structures:
 *
 * 1. Nested: DSPACCNAME contains DSPVOUCHER children (with closing tags)
 * 2. Flat sequential: DSPACCNAME, DSPDISPNAME, DSPAMOUNT as siblings (no closing tags)
 * 3. Mixed: DSPACCNAME has closing tags but content is flat DSPDISPNAME/DSPAMOUNT pairs
 *
 * Strategy: Extract ALL DSP tags with positions, then use a state machine
 * that handles all three structures uniformly.
 */
function parseDspOutstanding(xml) {
  const dspTags = extractDspTags(xml);
  if (dspTags.length === 0) return [];
  return parseDspFlatSequence(dspTags);
}

/** Compute days overdue from a due date string (ISO format). */
function computeDaysOverdue(dueDate) {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 0;
  const now = new Date();
  return due < now ? Math.floor((now - due) / 86400000) : 0;
}

/**
 * Parse flat sequential DSP tags into outstanding bills.
 *
 * Uses a state machine to track party markers (DSPACCNAME) and collect
 * bill data (DSPDISPNAME, DSPAMOUNT, DSPCLRAMT, DSPBALANCE, dates).
 * Handles DSPVOUCHER blocks when present.
 *
 * The key insight: DSPACCNAME signals a new party section.
 * The DSPDISPNAME immediately after DSPACCNAME is the party name.
 * Subsequent DSPDISPNAME tags are bill references.
 */
function parseDspFlatSequence(dspTags) {
  const out = [];
  let currentParty = '';
  let expectPartyName = false;

  let pendingBillRef = null;
  let pendingAmount = null;
  let pendingDate = null;
  let pendingBalance = null;
  let lastTag = '';

  function flushBill() {
    if (!currentParty || !pendingBillRef || pendingAmount === null || pendingAmount === 0) return;
    const bal = pendingBalance !== null ? Math.abs(pendingBalance) : Math.abs(pendingAmount);
    out.push({
      partyName: currentParty,
      ledgerName: currentParty,
      billNo: pendingBillRef,
      billDate: pendingDate,
      dueDate: null,
      daysOverdue: computeDaysOverdue(pendingDate),
      amount: Math.abs(pendingAmount),
      received: 0,
      balance: bal,
      billType: 'Bill',
      parent: '',
    });
    pendingBillRef = null;
    pendingAmount = null;
    pendingDate = null;
    pendingBalance = null;
  }

  for (const { tag, value } of dspTags) {
    switch (tag) {
      case 'DSPACCNAME':
        flushBill();
        currentParty = value;
        expectPartyName = true;
        break;

      case 'DSPDISPNAME':
        if (expectPartyName) {
          if (value) currentParty = value;
          expectPartyName = false;
        } else if (currentParty) {
          flushBill();
          pendingBillRef = value;
        } else {
          currentParty = value;
        }
        break;

      case 'DSPVCHNO':
      case 'DSPREF':
        if (currentParty && value) {
          flushBill();
          pendingBillRef = value;
        }
        break;

      case 'DSPAMOUNT':
      case 'DSPCLRAMT': {
        const amt = parseAmount(value);
        if (amt !== 0) pendingAmount = amt;
        break;
      }

      case 'DSPBALANCE':
        pendingBalance = parseAmount(value);
        break;

      case 'DSPVCHDATE':
      case 'DSPDATE': {
        const parsed = parseTallyDate(value);
        if (!parsed) break;
        if (pendingBillRef && pendingAmount !== null) {
          flushBill();
          if (out.length > 0 && !out[out.length - 1].billDate) {
            out[out.length - 1].billDate = parsed;
            out[out.length - 1].daysOverdue = computeDaysOverdue(parsed);
          } else {
            pendingDate = parsed;
          }
        } else if (pendingBillRef) {
          pendingDate = parsed;
        } else if (
          out.length > 0 &&
          !out[out.length - 1].billDate &&
          (lastTag === 'DSPAMOUNT' || lastTag === 'DSPCLRAMT')
        ) {
          out[out.length - 1].billDate = parsed;
          out[out.length - 1].daysOverdue = computeDaysOverdue(parsed);
        } else {
          pendingDate = parsed;
        }
        break;
      }

      default:
        break;
    }
    lastTag = tag;
  }

  flushBill();
  return out;
}

export function parseVouchers(xml) {
  if (!xml || !xml.trim()) return [];

  // Format 1: DSP-prefixed XML (from TYPE=Data DayBook report)
  const dspVouchers = parseDspVouchers(xml);
  if (dspVouchers.length > 0) return dspVouchers;

  // Format 2: VOUCHER blocks (from TYPE=COLLECTION responses)
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

/**
 * Parse DSP-prefixed voucher XML from TYPE=Data DayBook report.
 *
 * Structure:
 *   <DSPACCNAME><DSPDISPNAME>Voucher Type</DSPDISPNAME></DSPACCNAME>
 *   <DSPACCINFO>
 *     <DSPVOUCHER>
 *       <DSPVCHDATE>...</DSPVCHDATE>
 *       <DSPVCHNO>...</DSPVCHNO>
 *       <DSPPARTYNAME>...</DSPPARTYNAME>
 *       <DSPAMOUNT>...</DSPAMOUNT>
 *       <DSPINVOICETYPE>...</DSPINVOICETYPE>
 *     </DSPVOUCHER>
 *   </DSPACCINFO>
 *
 * Or flat pairs:
 *   <DSPACCNAME><DSPDISPNAME>Sales</DSPDISPNAME></DSPACCNAME>
 *   <DSPACCNAME><DSPDISPNAME>Customer A</DSPDISPNAME></DSPACCNAME>
 *   <DSPACCINFO><DSPDRAMTA>...</DSPDRAMTA><DSPCRAMTA>...</DSPCRAMTA></DSPACCINFO>
 */
function parseDspVouchers(xml) {
  const vouchers = [];

  // Try to find DSPVOUCHER blocks (structured voucher format)
  const vchBlocks = splitBlocks(xml, 'DSPVOUCHER');
  if (vchBlocks.length > 0) {
    for (const vch of vchBlocks) {
      const voucherType = readTag(vch, 'DSPVCHTYPE') || readTag(vch, 'DSPINVOICETYPE') || 'Journal';
      const date = parseTallyDate(readTag(vch, 'DSPVCHDATE') || readTag(vch, 'DSPDATE'));
      const partyName = readTag(vch, 'DSPPARTYNAME') || readTag(vch, 'DSPACCNAME') || '';
      const amount = parseAmount(readTag(vch, 'DSPAMOUNT') || readTag(vch, 'DSPDRAMTA'));
      const voucherNumber = readTag(vch, 'DSPVCHNO') || readTag(vch, 'DSPREF') || '';
      const narration = readTag(vch, 'DSPNARRATION') || '';

      vouchers.push({
        voucherType,
        voucherNumber,
        date,
        partyName,
        partyLedgerName: partyName,
        amount,
        narration,
        reference: readTag(vch, 'DSPREF') || '',
        entries: [],
        gstDetails: { gstin: '', taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
      });
    }
    return vouchers;
  }

  // Try flat DSPACCNAME + DSPACCINFO pairs
  const accNames = readAll(xml, 'DSPACCNAME');
  const accInfos = readAll(xml, 'DSPACCINFO');

  if (accNames.length > 0 && accInfos.length > 0) {
    // Each DSPACCINFO corresponds to a voucher entry
    for (let i = 0; i < accInfos.length; i++) {
      const info = accInfos[i];
      const vchType = i < accNames.length ? readTag(accNames[i], 'DSPDISPNAME') : 'Journal';

      // Look for sub-elements in the info block
      const date = parseTallyDate(readTag(info, 'DSPVCHDATE') || readTag(info, 'DSPDATE'));
      const partyName = readTag(info, 'DSPPARTYNAME') || '';
      const amount = parseAmount(readTag(info, 'DSPAMOUNT') || readTag(info, 'DSPDRAMTA'));
      const voucherNumber = readTag(info, 'DSPVCHNO') || readTag(info, 'DSPREF') || '';
      const narration = readTag(info, 'DSPNARRATION') || '';

      if (amount !== 0 || voucherNumber) {
        vouchers.push({
          voucherType: vchType,
          voucherNumber,
          date,
          partyName,
          partyLedgerName: partyName,
          amount,
          narration,
          reference: readTag(info, 'DSPREF') || '',
          entries: [],
          gstDetails: { gstin: '', taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
        });
      }
    }
  }

  return vouchers;
}
