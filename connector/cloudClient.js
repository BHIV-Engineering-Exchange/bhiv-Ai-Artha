import https from 'node:https';
import http from 'node:http';
import { sha256, hmac } from './config.js';

/**
 * cloudClient — signs and pushes MDU records to the cloud ARTHA ingestion endpoint.
 * Security layers:
 *  1. TLS (HTTPS) — transport encryption
 *  2. API key — authentication (X-API-Key header)
 *  3. HMAC-SHA256 — payload integrity (X-Signature header over content hash)
 *  4. Content hash — tamper detection (X-Content-Hash header)
 *  5. Idempotency keys — replay/duplicate prevention (per-record)
 */

export class CloudError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function pushToCloud({ url, apiKey, hmacSecret, payload, timeoutMs = 120000 }) {
  const body = JSON.stringify(payload);
  const contentHash = sha256(body);
  const signature = hmac(hmacSecret, contentHash);

  const endpoint = new URL(`${url}/api/v1/tally-connect/ingest`);
  const mod = endpoint.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = mod.request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Content-Hash': contentHash,
        'X-Signature': signature,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: timeoutMs,
    }, (res) => {
      let resBody = '';
      res.on('data', (c) => { resBody += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(resBody)); } catch { resolve({ raw: resBody }); }
        } else if (res.statusCode === 401) {
          reject(new CloudError('AUTH_FAILED', 'API key rejected.', 401));
        } else if (res.statusCode === 403) {
          reject(new CloudError('SIGNATURE_INVALID', 'HMAC signature mismatch.', 403));
        } else {
          reject(new CloudError('CLOUD_ERROR', `HTTP ${res.statusCode}: ${resBody.slice(0, 200)}`, res.statusCode));
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new CloudError('TIMEOUT', 'Cloud request timed out.')); });
    req.on('error', (e) => reject(new CloudError('NETWORK_ERROR', e.message)));
    req.write(body);
    req.end();
  });
}