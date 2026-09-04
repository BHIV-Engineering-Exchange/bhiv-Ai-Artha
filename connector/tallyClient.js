import http from 'node:http';
import https from 'node:https';

/**
 * tallyClient — minimal read-only Tally XML gateway client for the connector.
 * Only sends Export Data envelopes. No writes. No Tally-specific logic leaks out.
 *
 * Envelope format (proven against live TallyPrime):
 *   <ENVELOPE>
 *     <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export Data</TALLYREQUEST><TYPE>Data</TYPE></HEADER>
 *     <BODY>
 *       <EXPORTDATA>
 *         <REQUESTDESC>
 *           <REPORTNAME>...</REPORTNAME>
 *           <STATICVARIABLES>
 *             <SVCURRENTCOMPANY>Company Name</SVCURRENTCOMPANY>
 *           </STATICVARIABLES>
 *         </REQUESTDESC>
 *         <REQUESTDATA>
 *           <TALLYMESSAGE xmlns:UDF="TallyUDF">
 *             <COLLECTION>
 *               <NAME>...</NAME>
 *               <TYPE>...</TYPE>
 *               <FETCH>ALL</FETCH>
 *             </COLLECTION>
 *           </TALLYMESSAGE>
 *         </REQUESTDATA>
 *       </EXPORTDATA>
 *     </BODY>
 *   </ENVELOPE>
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

const EXPORT_REQUESTS = new Set(['Export Data', 'Export']);

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
 * Build a standard Tally XML Export Data envelope.
 *
 * Matches the proven format from the review packet:
 * HEADER → EXPORTDATA → REQUESTDESC (with STATICVARIABLES) → REQUESTDATA (with TALLYMESSAGE/COLLECTION)
 *
 * @param {Object} opts
 * @param {string} opts.requestName - Tally report name (e.g. "List of Companies", "Ledger", "Statement of Accounts", "Voucher Register")
 * @param {string} [opts.collectionType] - Tally collection type (e.g. "List of Ledgers", "Bill wise Details")
 * @param {string} [opts.collectionName] - Tally collection name (e.g. "Ledger", "Voucher")
 * @param {string} [opts.fetch] - What to fetch (default: "ALL")
 * @param {string} [opts.company] - Company name for SVCURRENTCOMPANY
 * @returns {string} Valid Tally XML envelope
 */
export function buildEnvelope({ requestName, collectionType = null, collectionName = null, fetch = 'ALL', company = '' }) {
  const lines = [
    '<ENVELOPE>',
    '  <HEADER>',
    '    <VERSION>1</VERSION>',
    '    <TALLYREQUEST>Export Data</TALLYREQUEST>',
    '    <TYPE>Data</TYPE>',
    '  </HEADER>',
    '  <BODY>',
    '    <EXPORTDATA>',
    '      <REQUESTDESC>',
    `        <REPORTNAME>${escXml(requestName)}</REPORTNAME>`,
    '        <STATICVARIABLES>',
    company ? `          <SVCURRENTCOMPANY>${escXml(company)}</SVCURRENTCOMPANY>` : '',
    '        </STATICVARIABLES>',
    '      </REQUESTDESC>',
  ];

  if (collectionType) {
    lines.push(
      '      <REQUESTDATA>',
      '        <TALLYMESSAGE xmlns:UDF="TallyUDF">',
      '          <COLLECTION>',
      collectionName ? `            <NAME>${escXml(collectionName)}</NAME>` : '',
      `            <TYPE>${escXml(collectionType)}</TYPE>`,
      `            <FETCH>${escXml(fetch)}</FETCH>`,
      '          </COLLECTION>',
      '        </TALLYMESSAGE>',
      '      </REQUESTDATA>',
    );
  }

  lines.push(
    '    </EXPORTDATA>',
    '  </BODY>',
    '</ENVELOPE>',
  );

  return lines.filter(l => l !== undefined && l !== null).join('\n');
}

/** Escape XML special characters. */
function escXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
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
