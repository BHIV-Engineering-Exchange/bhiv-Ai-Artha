import http from 'node:http';
import https from 'node:https';

/**
 * tallyClient — minimal read-only Tally XML gateway client for the connector.
 * Only sends Export requests. No writes.
 *
 * Uses the TYPE=COLLECTION format proven against the live Tally gateway:
 *   <ENVELOPE>
 *     <HEADER>
 *       <VERSION>1</VERSION>
 *       <TALLYREQUEST>EXPORT</TALLYREQUEST>
 *       <TYPE>COLLECTION</TYPE>
 *       <ID>List of Ledgers</ID>
 *     </HEADER>
 *     <BODY>
 *       <SVCURRENTCOMPANY>Company Name</SVCURRENTCOMPANY>
 *       <TALLYMESSAGE xmlns:UDF="TallyUDF">
 *         <COLLECTION>
 *           <TYPE>List of Ledgers</TYPE>
 *           <ID>Ledger</ID>
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
 * Build a Tally XML envelope using the TYPE=COLLECTION format.
 *
 * Proven format (returns real data from live TallyPrime):
 *   HEADER: VERSION=1, TALLYREQUEST=EXPORT, TYPE=COLLECTION, ID=<collection name>
 *   BODY: SVCURRENTCOMPANY + TALLYMESSAGE with COLLECTION
 *
 * @param {Object} opts
 * @param {string} opts.headerId - The collection ID for the HEADER (e.g. "List of Ledgers")
 * @param {string} [opts.collectionType] - COLLECTION TYPE inside TALLYMESSAGE
 * @param {string} [opts.collectionId] - COLLECTION ID inside TALLYMESSAGE
 * @param {string} [opts.company] - Company name for SVCURRENTCOMPANY
 * @returns {string} Valid Tally XML envelope
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
