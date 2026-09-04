import http from 'node:http';
import https from 'node:https';

/**
 * tallyClient — minimal read-only Tally XML gateway client for the connector.
 * Only sends Export requests. No writes.
 *
 * Three envelope formats supported (all proven against TallyPrime XML gateway):
 *
 * 1. TYPE=COLLECTION — for master data (ledgers, groups, stock items):
 *    HEADER: VERSION=1, TALLYREQUEST=EXPORT, TYPE=COLLECTION, ID=<collection name>
 *
 * 2. TYPE=Data — for report data (DayBook, Bills Receivable, Bills Payable):
 *    HEADER: VERSION=1, TALLYREQUEST=Export, TYPE=Data, ID=<report name>
 *    BODY: DESC > STATICVARIABLES (SVEXPORTFORMAT, SVFROMDATE, SVTODATE)
 *
 * 3. EXPORTDATA — alternative report format (Stock Summary):
 *    HEADER: TALLYREQUEST=Export Data
 *    BODY: EXPORTDATA > REQUESTDESC > REPORTNAME + STATICVARIABLES
 */

export class TallyError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class TallyUnavailableError extends TallyError {
  constructor(code, msg) { super(code, msg, 503); }
}

export class TallyAuthError extends TallyError {
  constructor(msg) { super('TALLY_AUTH_FAILED', msg, 401); }
}

const EXPORT_REQUESTS = new Set(['Export', 'Export Data', 'EXPORT', 'export data', 'export']);

export function assertReadOnlyEnvelope(xml) {
  const match = xml.match(/<TALLYREQUEST>\s*([^<]+)\s*<\/TALLYREQUEST>/i);
  if (!match) throw new TallyError('INVALID_ENVELOPE', 'Missing TALLYREQUEST tag.');
  const req = match[1].trim();
  if (!EXPORT_REQUESTS.has(req)) {
    throw new TallyError('READ_ONLY_VIOLATION', `TALLYREQUEST "${req}" is a WRITE — rejected.`);
  }
  return true;
}

/**
 * Build a Tally XML envelope using the TYPE=COLLECTION format.
 * Used for master data: ledgers, groups, stock items.
 *
 * Proven format:
 *   HEADER: VERSION=1, TALLYREQUEST=EXPORT, TYPE=COLLECTION, ID=<collection name>
 *   BODY: SVCURRENTCOMPANY + TALLYMESSAGE with COLLECTION
 */
export function buildEnvelope({ headerId, collectionType, collectionId, company }) {
  const lines = [
    '<ENVELOPE>',
    '  <HEADER>',
    '    <VERSION>1</VERSION>',
    '    <TALLYREQUEST>EXPORT</TALLYREQUEST>',
    '    <TYPE>COLLECTION</TYPE>',
    `    <ID>${escXml(headerId)}</ID>`,
    '  </HEADER>',
    '  <BODY>',
  ];

  if (company) {
    lines.push(`    <SVCURRENTCOMPANY>${escXml(company)}</SVCURRENTCOMPANY>`);
  }

  lines.push('    <TALLYMESSAGE xmlns:UDF="TallyUDF">');

  if (collectionType) {
    lines.push('      <COLLECTION>');
    lines.push(`        <TYPE>${escXml(collectionType)}</TYPE>`);
    if (collectionId) {
      lines.push(`        <ID>${escXml(collectionId)}</ID>`);
    }
    lines.push('      </COLLECTION>');
  }

  lines.push(
    '    </TALLYMESSAGE>',
    '  </BODY>',
    '</ENVELOPE>',
  );

  return lines.join('\n');
}

/**
 * Build a Tally XML envelope using the TYPE=Data format.
 * Used for report data: DayBook (vouchers), Bills Receivable, Bills Payable.
 *
 * Format from TallyHelp documentation:
 *   HEADER: VERSION=1, TALLYREQUEST=Export, TYPE=Data, ID=<report name>
 *   BODY: DESC > STATICVARIABLES > SVEXPORTFORMAT + SVFROMDATE + SVTODATE
 *
 * @param {Object} opts
 * @param {string} opts.reportId - Report name (e.g. "DayBook", "Bills Receivable", "Bills Payable")
 * @param {string} [opts.fromDate] - Start date in DD-Mon-YYYY format (e.g. "1-Apr-2024")
 * @param {string} [opts.toDate] - End date in DD-Mon-YYYY format (e.g. "31-Mar-2025")
 * @param {string} [opts.company] - Company name for SVCURRENTCOMPANY
 * @returns {string} Valid Tally XML envelope
 */
export function buildDataEnvelope({ reportId, fromDate, toDate, company }) {
  const lines = [
    '<ENVELOPE>',
    '  <HEADER>',
    '    <VERSION>1</VERSION>',
    '    <TALLYREQUEST>Export</TALLYREQUEST>',
    '    <TYPE>Data</TYPE>',
    `    <ID>${escXml(reportId)}</ID>`,
    '  </HEADER>',
    '  <BODY>',
    '    <DESC>',
    '      <STATICVARIABLES>',
    '        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>',
  ];

  if (fromDate) {
    lines.push(`        <SVFROMDATE TYPE="Date">${escXml(fromDate)}</SVFROMDATE>`);
  }
  if (toDate) {
    lines.push(`        <SVTODATE TYPE="Date">${escXml(toDate)}</SVTODATE>`);
  }

  lines.push(
    '      </STATICVARIABLES>',
    '    </DESC>',
    '  </BODY>',
    '</ENVELOPE>',
  );

  return lines.join('\n');
}

/**
 * Build a Tally XML envelope using the EXPORTDATA format.
 * Alternative report format used by some Tally reports (e.g. Stock Summary).
 *
 * Format:
 *   HEADER: TALLYREQUEST=Export Data
 *   BODY: EXPORTDATA > REQUESTDESC > REPORTNAME + STATICVARIABLES
 */
export function buildExportDataEnvelope({ reportName, company }) {
  const lines = [
    '<ENVELOPE>',
    '  <HEADER>',
    '    <TALLYREQUEST>Export Data</TALLYREQUEST>',
    '  </HEADER>',
    '  <BODY>',
    '    <EXPORTDATA>',
    '      <REQUESTDESC>',
    '        <STATICVARIABLES>',
    '          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>',
  ];

  if (company) {
    lines.push(`          <SVCURRENTCOMPANY>${escXml(company)}</SVCURRENTCOMPANY>`);
  }

  lines.push(
    '        </STATICVARIABLES>',
    `        <REPORTNAME>${escXml(reportName)}</REPORTNAME>`,
    '      </REQUESTDESC>',
    '    </EXPORTDATA>',
    '  </BODY>',
    '</ENVELOPE>',
  );

  return lines.join('\n');
}

/** Escape XML special characters. */
function escXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function fetchFromTally({ protocol, host, port, envelope, timeoutMs = 15000, username, password }) {
  const url = `${protocol || 'http'}://${host}:${port}`;
  assertReadOnlyEnvelope(envelope);

  return new Promise((resolve, reject) => {
    const mod = protocol === 'https' ? https : http;
    const headers = {
      'Content-Type': 'text/xml',
      'Content-Length': Buffer.byteLength(envelope),
    };
    if (username) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password || ''}`).toString('base64');
    }

    const req = mod.request(url, {
      method: 'POST',
      headers,
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode === 401) return reject(new TallyAuthError('Authentication failed.'));
        if (res.statusCode !== 200) return reject(new TallyUnavailableError('TALLY_HTTP_ERROR', `HTTP ${res.statusCode}`));
        resolve(body);
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new TallyUnavailableError('TALLY_TIMEOUT', 'Request timed out.')); });
    req.on('error', (e) => reject(new TallyUnavailableError('TALLY_UNAVAILABLE', e.message)));
    req.write(envelope);
    req.end();
  });
}
