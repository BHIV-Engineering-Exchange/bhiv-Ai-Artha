import http from 'node:http';
import https from 'node:https';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * tallyClient — minimal read-only Tally XML gateway client for the connector.
 * Only sends Export Data envelopes. No writes. No Tally-specific logic leaks out.
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
  const match = xml.match(/<TALLYREQUEST>\s*([^<]+)\s*<\/TALLYREQUEST>/);
  if (!match) throw new TallyError('INVALID_ENVELOPE', 'Missing TALLYREQUEST tag.');
  const req = match[1].trim();
  if (!EXPORT_REQUESTS.has(req)) {
    throw new TallyError('READ_ONLY_VIOLATION', `TALLYREQUEST "${req}" is a WRITE — rejected.`);
  }
  return true;
}

export function buildEnvelope({ requestName, collectionType, collectionName }) {
  const collXml = collectionType
    ? `<TALLYMESSAGE xmlns:UDF="TallyUDF"><COLLECTION><TYPE>${collectionType}</TYPE>${collectionName ? `<NAME>${collectionName}</NAME>` : ''}</COLLECTION></TALLYMESSAGE>`
    : '';
  return `<ENVELOPE><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>${requestName}</REPORTNAME><TALLYREQUEST>Export Data</TALLYREQUEST>${collXml}</REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
}

export async function fetchFromTally({ protocol, host, port, envelope, timeoutMs = 15000, username, password }) {
  const url = `${protocol || 'http'}://${host}:${port}`;
  assertReadOnlyEnvelope(envelope);

  return new Promise((resolve, reject) => {
    const mod = protocol === 'https' ? https : http;
    const req = mod.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml', ...(username ? { Authorization: 'Basic ' + Buffer.from(`${username}:${password || ''}`).toString('base64') } : {}) },
      timeout: timeoutMs,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode === 401) return reject(new TallyAuthError('Authentication failed.'));
        if (res.statusCode !== 200) return reject(new TallyUnavailableError('TALLY_HTTP_ERROR', `HTTP ${res.statusCode}`));
        try { resolve(body); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new TallyUnavailableError('TALLY_TIMEOUT', 'Request timed out.')); });
    req.on('error', (e) => reject(new TallyUnavailableError('TALLY_UNAVAILABLE', e.message)));
    req.write(envelope);
    req.end();
  });
}