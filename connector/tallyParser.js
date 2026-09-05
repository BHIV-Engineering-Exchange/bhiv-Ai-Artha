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

function parseTallyDate(value) {
  if (!value) return null;
  const v = String(value).trim();
  if (!v || v === '0' || v === '-') return null;

  // DDMMYYYY format (Tally native, e.g. "20092026" = 20-Sep-2026)
  const ddmmyyyy = v.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (ddmmyyyy) {
    const dd = ddmmyyyy[1], mm = ddmmyyyy[2], yyyy = ddmmyyyy[3];
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    if (!Number.isNaN(d.getTime())) return `${yyyy}-${mm}-${dd}`;
  }

  // DD-Mon-YY or DD-Mon-YYYY (e.g. "20-Sep-26" or "20-Sep-2026")
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const dmy = v.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dmy) {
    const monthIdx = months.indexOf(dmy[2].toLowerCase());
    if (monthIdx !== -1) {
      let year = Number(dmy[3]);
      if (year < 100) year += 2000;
      const mm = String(monthIdx + 1).padStart(2, '0');
      const dd = String(dmy[1]).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }

  // YYYY-MM-DD (ISO format, already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return v;
  }

  // YYYYMMDD format (e.g. "20260920")
  const yyyymmdd = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) {
    const d = new Date(`${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`);
    if (!Number.isNaN(d.getTime())) return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;
  }

  // DD/MM/YYYY or DD/MM/YY
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const dd = String(Number(slash[1])).padStart(2, '0');
    const mm = String(Number(slash[2])).padStart(2, '0');
    const d = new Date(`${year}-${mm}-${dd}`);
    if (!Number.isNaN(d.getTime())) return `${year}-${mm}-${dd}`;
  }

  // DD-MM-YY or DD-MM-YYYY (e.g. "20-09-2026" or "20-09-26")
  const ddmmyy = v.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (ddmmyy) {
    let year = Number(ddmmyy[3]);
    if (year < 100) year += 2000;
    const dd = String(Number(ddmmyy[1])).padStart(2, '0');
    const mm = String(Number(ddmmyy[2])).padStart(2, '0');
    const d = new Date(`${year}-${mm}-${dd}`);
    if (!Number.isNaN(d.getTime())) return `${year}-${mm}-${dd}`;
  }

  // DDMMYY format (e.g. "200926" = 20-Sep-2026)
  const ddmmyy6 = v.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (ddmmyy6) {
    let year = Number(ddmmyy6[3]);
    if (year < 100) year += 2000;
    const dd = ddmmyy6[1], mm = ddmmyy6[2];
    const d = new Date(`${year}-${mm}-${dd}`);
    if (!Number.isNaN(d.getTime())) return `${year}-${mm}-${dd}`;
  }

  // JavaScript Date fallback
  const iso = new Date(v);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);

  // Unable to parse — return null instead of crashing
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
  // Structure: <DSPACCNAME><DSPDISPNAME>...</DSPDISPNAME></DSPACCNAME> + <DSPVOUCHER>...</DSPVOUCHER>
  const dspBills = parseDspOutstanding(xml);
  if (dspBills.length > 0) return dspBills;

  // Format 2: BILLWISEDETAILS.LIST blocks (from COLLECTION-based responses)
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
      const daysOverdue = dueDate && billDate
        ? Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000))
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
        parent: readTag(xml, 'PARENT'),
      });
    }
    return out;
  }

  // Format 3: BILLALLOCATIONS blocks
  for (const block of splitBlocks(xml, 'BILLALLOCATIONS')) {
    const parent = block.match(/<PARENT>([^<]*)<\/PARENT>/i)
      || block.match(/<LEDGERNAME>([^<]*)<\/LEDGERNAME>/i);
    out.push({
      partyName: parent ? parent[1].trim() : '',
      billNo: readTag(block, 'BILLNAME'),
      billDate: parseTallyDate(readTag(block, 'BILLDATE')),
      dueDate: parseTallyDate(readTag(block, 'DUEBILLDATE')),
      amount: parseAmount(readTag(block, 'AMOUNT')),
      balance: parseAmount(readTag(block, 'BILLAMOUNT') || readTag(block, 'AMOUNT')),
      billType: readTag(block, 'OBJTYPE') || 'UNKNOWN',
    });
  }

  return out;
}

/**
 * Parse DSP-prefied outstanding XML from TYPE=Data reports.
 * Handles Bills Receivable / Bills Payable report format.
 *
 * Structure:
 *   <DSPACCNAME><DSPDISPNAME>Ledger Name</DSPDISPNAME></DSPACCNAME>
 *   <DSPVOUCHER>
 *     <DSPVCHDATE>...</DSPVCHDATE>
 *     <DSPVCHTYPE>...</DSPVCHTYPE>
 *     <DSPVCHNO>...</DSPVCHNO>
 *     <DSPAMOUNT>...</DSPAMOUNT>
 *   </DSPVOUCHER>
 *
 * Or simpler flat structure:
 *   <DSPACCNAME><DSPDISPNAME>Party Name</DSPDISPNAME></DSPACCNAME>
 *   <DSPDISPNAME>Bill Ref</DSPDISPNAME>
 *   <DSPAMOUNT>Amount</DSPAMOUNT>
 */
function parseDspOutstanding(xml) {
  const out = [];

  // Try to find DSPACCNAME blocks (each represents a ledger/party with bills)
  const accBlocks = splitBlocks(xml, 'DSPACCNAME');
  if (accBlocks.length === 0) return out;

  for (const accBlock of accBlocks) {
    const partyName = readTag(accBlock, 'DSPDISPNAME') || readTag(accBlock, 'DSPACCNAME') || '';

    // Look for voucher/bill blocks after this DSPACCNAME
    // They may be in DSPVOUCHER or flat DSPDISPNAME/DSPAMOUNT pairs
    const vchBlocks = readAll(accBlock, 'DSPVOUCHER');
    if (vchBlocks.length > 0) {
      for (const vch of vchBlocks) {
        out.push({
          partyName,
          ledgerName: partyName,
          billNo: readTag(vch, 'DSPVCHNO') || readTag(vch, 'DSPREF') || '',
          billDate: parseTallyDate(readTag(vch, 'DSPVCHDATE') || readTag(vch, 'DSPDATE')),
          dueDate: parseTallyDate(readTag(vch, 'DSPDUEDATE')),
          daysOverdue: 0,
          amount: parseAmount(readTag(vch, 'DSPAMOUNT') || readTag(vch, 'DSPCLRAMT')),
          received: 0,
          balance: parseAmount(readTag(vch, 'DSPBALANCE') || readTag(vch, 'DSPCLRAMT')),
          billType: readTag(vch, 'DSPVCHTYPE') || 'Bill',
          parent: '',
        });
      }
    } else {
      // Flat structure: look for DSPDISPNAME (bill ref) and DSPAMOUNT pairs
      const dispNames = readAll(accBlock, 'DSPDISPNAME');
      const amounts = readAll(accBlock, 'DSPAMOUNT');
      const balances = readAll(accBlock, 'DSPCLRAMT');

      for (let i = 0; i < Math.max(dispNames.length, amounts.length); i++) {
        const billRef = readTag(dispNames[i] || '', 'DSPDISPNAME') || '';
        const amt = parseAmount(readTag(amounts[i] || '', 'DSPAMOUNT') || readTag(balances[i] || '', 'DSPCLRAMT'));
        if (billRef && amt !== 0) {
          out.push({
            partyName,
            ledgerName: partyName,
            billNo: billRef,
            billDate: null,
            dueDate: null,
            daysOverdue: 0,
            amount: Math.abs(amt),
            received: 0,
            balance: Math.abs(amt),
            billType: 'Bill',
            parent: '',
          });
        }
      }
    }
  }

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
