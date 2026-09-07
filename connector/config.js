import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';

/**
 * config — reads .env, validates required fields, exposes frozen config.
 * No secrets are logged. Never import this for tests — pass values instead.
 */

const required = [
  'TALLY_HOST',
  'CLOUD_URL',
  'CLOUD_API_KEY',
  'CLOUD_HMAC_SECRET',
];

function load() {
  const raw = {};
  for (const key of required) {
    raw[key] = process.env[key] || '';
    if (!raw[key]) throw new Error(`Missing required env: ${key}`);
  }
  return Object.freeze({
    tally: {
      protocol: process.env.TALLY_PROTOCOL || 'http',
      host: process.env.TALLY_HOST,
      port: Number(process.env.TALLY_PORT || 9000),
      company: process.env.TALLY_COMPANY || '',
      timeoutMs: Number(process.env.TALLY_TIMEOUT_MS || 60000),
      tenantId: process.env.TALLY_TENANT_ID || 'tenant_bright_connection_001',
    },
    cloud: {
      url: raw.CLOUD_URL.replace(/\/$/, ''),
      apiKey: raw.CLOUD_API_KEY,
      hmacSecret: raw.CLOUD_HMAC_SECRET,
      timeoutMs: Number(process.env.CLOUD_TIMEOUT_MS || 120000),
    },
    sync: {
      intervalMs: Number(process.env.SYNC_INTERVAL_MINUTES || 15) * 60000,
      defaultBackfillDays: Number(process.env.SYNC_DEFAULT_BACKFILL_DAYS || 30),
      batchSize: Number(process.env.SYNC_BATCH_SIZE || 50),
    },
    tenantId: process.env.TALLY_TENANT_ID || 'tenant_bright_connection_001',
  });
}

/** SHA-256 hex hash of a buffer/string. */
export function sha256(data) {
  return createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
}

/** HMAC-SHA256 hex of (message, secret). */
export function hmac(secret, message) {
  return createHmac('sha256', secret).update(message).digest('hex');
}

export default load;