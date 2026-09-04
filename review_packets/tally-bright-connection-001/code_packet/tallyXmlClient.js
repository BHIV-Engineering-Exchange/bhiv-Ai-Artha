import http from 'node:http';
import https from 'node:https';

/**
 * tallyXmlClient — low-level READ-ONLY Tally ERP9/Prime XML gateway client.
 *
 * Protocol: classic Tally integration — POST an XML envelope to
 *   http://<host>:<port>  (Tally's XML gateway, default port 9000).
 * This client ONLY ever sends `Export Data` / `Export` envelopes. Any attempt
 * to issue a non-export (write) envelope is rejected before it reaches the wire
 * (see assertReadOnlyEnvelope). Credentials come exclusively from the
 * environment — never from callers, so they can never leak into payloads.
 *
 * Mirrors the Setu-Aman BaseConnector boundary: authenticate() / fetch_raw()
 * are the only two verbs this client exposes.
 */

export class TallyConnectorError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'TallyConnectorError';
    this.code = code;
    this.detail = detail;
  }
}

export class TallyUnavailableError extends TallyConnectorError {}
export class TallyAuthError extends TallyConnectorError {}
export class TallyReadOnlyViolationError extends TallyConnectorError {}
export class TallyProtocolError extends TallyConnectorError {}

const EXPORT_REQUESTS = new Set(['Export Data', 'Export']);

export function getTallyConfig() {
  return {
    enabled: (process.env.TALLY_ENABLED || 'false') === 'true',
    protocol: process.env.TALLY_PROTOCOL || 'http',
    host: process.env.TALLY_HOST || 'localhost',
    port: Number(process.env.TALLY_PORT || 9000),
    company: process.env.TALLY_COMPANY || '',
    username: process.env.TALLY_BASIC_USERNAME || '',
    password: process.env.TALLY_BASIC_PASSWORD || '',
    timeoutMs: Number(process.env.TALLY_TIMEOUT_MS || 15000),
  };
}

export function getTallyBaseUrl() {
  const cfg = getTallyConfig();
  return `${cfg.protocol}://${cfg.host}:${cfg.port}`;
}

function readXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

/**
 * Read-only guard. Only `Export Data` / `Export` envelopes may leave this client.
 * Throws TallyReadOnlyViolationError otherwise — this is the proof point that
 * the connector can never mutate Tally.
 */
export function assertReadOnlyEnvelope(xml) {
  const req = readXmlTag(xml, 'TALLYREQUEST');
  if (!req) {
    throw new TallyReadOnlyViolationError(
      'READ_ONLY_VIOLATION',
      'Envelope missing TALLYREQUEST — refusing to send (read-only connector).',
    );
  }
  if (!EXPORT_REQUESTS.has(req.trim())) {
    throw new TallyReadOnlyViolationError(
      'READ_ONLY_VIOLATION',
      `TALLYREQUEST "${req.trim()}" is a WRITE operation — rejected by read-only connector.`,
    );
  }
  return true;
}

export function buildEnvelope({ requestName, collectionType = null, collectionName = null, fetch = 'ALL', staticVars = {}, _tallyRequest = 'Export Data' }) {
  const staticXml = Object.entries(staticVars)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join('\n        ');

  const collectionXml = collectionType
    ? `<TALLYMESSAGE xmlns:UDF="TallyUDF">
            <COLLECTION>
              <NAME>${collectionName}</NAME>
              <TYPE>${collectionType}</TYPE>
              <FETCH>${fetch}</FETCH>
            </COLLECTION>
          </TALLYMESSAGE>`
    : '';

  return [
    '<ENVELOPE>',
    '<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export Data</TALLYREQUEST><TYPE>Data</TYPE></HEADER>',
    '<BODY>',
    '<EXPORTDATA>',
    '<REQUESTDESC>',
    `<REPORTNAME>${requestName}</REPORTNAME>`,
    '<STATICVARIABLES>',
    staticXml,
    '</STATICVARIABLES>',
    '</REQUESTDESC>',
    '<REQUESTDATA>',
    collectionXml,
    '</REQUESTDATA>',
    '</EXPORTDATA>',
    '</BODY>',
    '</ENVELOPE>',
  ]
    .filter((s) => s && s.trim() !== '')
    .join('\n  ');
}

/**
 * POST a read-only envelope to the Tally gateway.
 * Returns the raw response body (string). All failures surface as structured
 * TallyConnectorError subclasses.
 */
export async function fetchFromTally(xml, { timeoutMs = null } = {}) {
  const cfg = getTallyConfig();
  if (!cfg.enabled) {
    throw new TallyUnavailableError('CONNECTOR_DISABLED', 'TALLY_ENABLED is not set to true. Enable the connector in .env.');
  }

  assertReadOnlyEnvelope(xml);

  const timeout = timeoutMs || cfg.timeoutMs;
  const baseUrl = getTallyBaseUrl();

  return new Promise((resolve, reject) => {
    const transport = cfg.protocol === 'https' ? https : http;
    const url = new URL(baseUrl);

    const headers = {
      'Content-Type': 'text/xml',
      'Content-Length': Buffer.byteLength(xml),
      'User-Agent': 'ARTHA-TallyConnector/1.0 (read-only)',
    };
    if (cfg.username) {
      const token = Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
      headers.Authorization = `Basic ${token}`;
    }

    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || cfg.port,
        path: '/',
        method: 'POST',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode === 401 || res.statusCode === 403) {
            return reject(new TallyAuthError('AUTH_FAILED', `Tally gateway rejected credentials (HTTP ${res.statusCode}).`, { statusCode: res.statusCode }));
          }
          if (res.statusCode >= 400) {
            return reject(new TallyProtocolError('HTTP_ERROR', `Tally gateway returned HTTP ${res.statusCode}.`, { statusCode: res.statusCode }));
          }
          resolve(body);
        });
      },
    );

    req.setTimeout(timeout, () => {
      req.destroy(new TallyUnavailableError('TIMEOUT', `Tally gateway timed out after ${timeout}ms.`, { timeoutMs: timeout }));
    });

    req.on('error', (err) => {
      if (err instanceof TallyConnectorError) return reject(err);
      reject(new TallyUnavailableError('UNREACHABLE', `Cannot reach Tally gateway at ${baseUrl}: ${err.message}.`, { cause: err.message }));
    });

    req.write(xml);
    req.end();
  });
}

/** Lightweight connectivity/auth probe — fetches the company list. */
export async function pingTally() {
  const envelope = buildEnvelope({ requestName: 'List of Companies' });
  return fetchFromTally(envelope);
}

/** Loads configuration for logs/reviews with credentials masked. */
export function getMaskedConfig() {
  const cfg = getTallyConfig();
  return {
    enabled: cfg.enabled,
    protocol: cfg.protocol,
    host: cfg.host,
    port: cfg.port,
    company: cfg.company,
    username: cfg.username ? `${cfg.username.slice(0, 2)}****` : '(none)',
    passwordConfigured: Boolean(cfg.password),
    timeoutMs: cfg.timeoutMs,
    baseUrl: getTallyBaseUrl(),
  };
}

export default {
  fetchFromTally,
  pingTally,
  buildEnvelope,
  assertReadOnlyEnvelope,
  getTallyConfig,
  getMaskedConfig,
  getTallyBaseUrl,
  errors: { TallyConnectorError, TallyUnavailableError, TallyAuthError, TallyReadOnlyViolationError, TallyProtocolError },
};