import http from 'node:http';
import https from 'node:https';

/**
 * tallyClient — minimal read-only Tally XML gateway client for the connector.
 * Only sends Export requests. No writes. No Tally-specific logic leaks out.
 *
 * Uses the standard Tally XML EXPORT format:
 *   <ENVELOPE>
 *     <HEADER>
 *       <VERSION>1</VERSION>
 *       <TALLYREQUEST>EXPORT</TALLYREQUEST>
 *       <TYPE>COLLECTION</TYPE>
 *       <ID>...</ID>
 *     </HEADER>
 *     <BODY>
 *       <SVCURRENTCOMPANY>Company Name</SVCURRENTCOMPANY>
 *       <TALLYMESSAGE xmlns:UDF="TallyUDF">
 *         <COLLECTION>
 *           <TYPE>...</TYPE>
 *           <ID>...</ID>
 *         </COLLECTION>
 *       </TALLYMESSAGE>
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

const EXPORT_REQUESTS = new Set(['Export', 'Export Data', 'EXPORT']);

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
 * Build a standard Tally XML EXPORT envelope for a COLLECTION request.
 *
 * @param {Object} opts
 * @param {string} opts.collectionType - Tally collection type (e.g. "List of Ledgers", "Voucher Register")
 * @param {string} [opts.collectionId] - Tally collection ID (e.g. "Ledger", "Voucher")
 * @param {string} [opts.company] - Company name (passed via SVCURRENTCOMPANY)
 * @param {Object} [opts.filters] - Optional filter parameters inside COLLECTION
 * @returns {string} Valid Tally XML envelope
 */
export function buildEnvelope({ collectionType, collectionId, company, filters }) {
  let collectionXml = `<COLLECTION>`;
  collectionXml += `<TYPE>${escXml(collectionType)}</TYPE>`;
  if (collectionId) {
    collectionXml += `<ID>${escXml(collectionId)}</ID>`;
  }
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      collectionXml += `<${k}>${escXml(String(v))}</${k}>`;
    }
  }
  collectionXml += `</COLLECTION>`;

  const companyXml = company ? `<SVCURRENTCOMPANY>${escXml(company)}</SVCURRENTCOMPANY>` : '';

  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>EXPORT</TALLYREQUEST><TYPE>COLLECTION</TYPE><ID>List of Accounts</ID></HEADER><BODY>${companyXml}<TALLYMESSAGE xmlns:UDF="TallyUDF">${collectionXml}</TALLYMESSAGE></BODY></ENVELOPE>`;
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
    const headers = { 'Content-Type': 'text/xml' };
    if (username) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password || ''}`).toString('base64');
    }

    const req = mod.request(url, {
      method: 'POST',
      headers,
      timeout: timeoutMs,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
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