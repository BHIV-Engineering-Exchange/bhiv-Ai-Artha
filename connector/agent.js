#!/usr/bin/env node
/**
 * artha-tally-connector agent — runs on the Tally LAN, fetches data from
 * the local Bright Connection Tally, and pushes it to the deployed cloud
 * ARTHA over TLS + HMAC-signed payloads.
 *
 * Usage:
 *   node agent.js           # runs on interval (SYNC_INTERVAL_MINUTES)
 *   node agent.js --once    # single sync then exit
 *   node agent.js --status  # print config and exit
 *   node agent.js --test-readonly  # test read-only guard then exit
 */
import { randomUUID } from 'node:crypto';
import loadConfig from './config.js';
import { fetchFromTally, buildEnvelope, assertReadOnlyEnvelope, TallyError } from './tallyClient.js';
import { parseLedgers, parseOutstanding, parseVouchers } from './tallyParser.js';
import { normalizeParties, normalizeOutstanding, normalizeVouchers, buildSyncRun } from './normalizer.js';
import { pushToCloud, CloudError } from './cloudClient.js';

const LOG_PREFIX = '[TALLY-CONNECTOR]';

function log(level, msg, extra) {
  const ts = new Date().toISOString();
  const line = `${ts} ${LOG_PREFIX} ${level.toUpperCase()}: ${msg}`;
  if (extra) console.log(line, extra);
  else console.log(line);
}

/**
 * Retry with exponential backoff.
 * Only retries on transient errors (TallyUnavailableError, CloudError with 429/503).
 */
async function withRetry(fn, { maxRetries = 3, label = 'operation', isTransient = () => true } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && isTransient(err)) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        log('warn', `${label} attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

function tallyFetch(config, envelope) {
  return fetchFromTally({
    protocol: config.tally.protocol,
    host: config.tally.host,
    port: config.tally.port,
    envelope,
    timeoutMs: config.tally.timeoutMs,
  });
}

/** Check if an error is transient (worth retrying). */
function isTransientTallyError(err) {
  if (err instanceof TallyError) {
    return ['TALLY_TIMEOUT', 'TALLY_UNAVAILABLE', 'TALLY_HTTP_ERROR'].includes(err.code);
  }
  return false;
}

function isTransientCloudError(err) {
  if (err instanceof CloudError) {
    return [429, 503].includes(err.status) || err.code === 'TIMEOUT' || err.code === 'NETWORK_ERROR';
  }
  return false;
}

/**
 * Validate the read-only guard by attempting to build a write envelope.
 * This must be rejected locally without ever hitting the network.
 */
function testReadOnlyGuard() {
  log('info', 'Testing read-only guard...');

  // Test 1: Valid EXPORT envelope — should pass
  const exportEnvelope = buildEnvelope({ collectionType: 'List of Ledgers', company: 'Test' });
  assertReadOnlyEnvelope(exportEnvelope);
  log('info', '  PASS: Export envelope accepted');

  // Test 2: IMPORT write request — should be rejected
  const writeXml = '<ENVELOPE><HEADER><TALLYREQUEST>IMPORT</TALLYREQUEST></HEADER></ENVELOPE>';
  try {
    assertReadOnlyEnvelope(writeXml);
    log('error', '  FAIL: IMPORT request was NOT rejected!');
    return false;
  } catch (err) {
    if (err.code === 'READ_ONLY_VIOLATION') {
      log('info', '  PASS: IMPORT request correctly rejected');
    } else {
      log('error', `  FAIL: Unexpected error: ${err.message}`);
      return false;
    }
  }

  // Test 3: CREATE write request — should be rejected
  const createXml = '<ENVELOPE><HEADER><TALLYREQUEST>CREATE</TALLYREQUEST></HEADER></ENVELOPE>';
  try {
    assertReadOnlyEnvelope(createXml);
    log('error', '  FAIL: CREATE request was NOT rejected!');
    return false;
  } catch (err) {
    if (err.code === 'READ_ONLY_VIOLATION') {
      log('info', '  PASS: CREATE request correctly rejected');
    } else {
      log('error', `  FAIL: Unexpected error: ${err.message}`);
      return false;
    }
  }

  // Test 4: ALTER write request — should be rejected
  const alterXml = '<ENVELOPE><HEADER><TALLYREQUEST>ALTER</TALLYREQUEST></HEADER></ENVELOPE>';
  try {
    assertReadOnlyEnvelope(alterXml);
    log('error', '  FAIL: ALTER request was NOT rejected!');
    return false;
  } catch (err) {
    if (err.code === 'READ_ONLY_VIOLATION') {
      log('info', '  PASS: ALTER request correctly rejected');
    } else {
      log('error', `  FAIL: Unexpected error: ${err.message}`);
      return false;
    }
  }

  // Test 5: DELETE write request — should be rejected
  const deleteXml = '<ENVELOPE><HEADER><TALLYREQUEST>DELETE</TALLYREQUEST></HEADER></ENVELOPE>';
  try {
    assertReadOnlyEnvelope(deleteXml);
    log('error', '  FAIL: DELETE request was NOT rejected!');
    return false;
  } catch (err) {
    if (err.code === 'READ_ONLY_VIOLATION') {
      log('info', '  PASS: DELETE request correctly rejected');
    } else {
      log('error', `  FAIL: Unexpected error: ${err.message}`);
      return false;
    }
  }

  log('info', 'Read-only guard: ALL TESTS PASSED');
  return true;
}

async function syncOnce(config) {
  const traceId = `connector-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const start = Date.now();
  log('info', `Sync started trace=${traceId}`);

  try {
    const company = config.tally.company;
    if (!company) {
      throw new Error('No company configured. Set TALLY_COMPANY in .env (e.g. TALLY_COMPANY=Bright Connection - (from 1-Apr-24)).');
    }
    log('info', `Company: ${company}`);

    // Step 1: Fetch ledgers (parties)
    log('info', 'Fetching ledgers...');
    const ledgerEnvelope = buildEnvelope({
      collectionType: 'List of Ledgers',
      collectionId: 'Ledger',
      company,
    });
    log('info', `Tally request: List of Ledgers (${Buffer.byteLength(ledgerEnvelope)} bytes)`);

    const ledgerXml = await withRetry(
      () => tallyFetch(config, ledgerEnvelope),
      { label: 'Tally ledgers', isTransient: isTransientTallyError },
    );
    const ledgers = parseLedgers(ledgerXml);
    log('info', `Tally response: parsed ${ledgers.length} ledgers`);

    // Step 2: Fetch outstanding (bills receivable/payable)
    log('info', 'Fetching outstanding...');
    const outstandingEnvelope = buildEnvelope({
      collectionType: 'List of Ledger Vouchers',
      collectionId: 'Ledger',
      company,
    });
    log('info', `Tally request: List of Ledger Vouchers (${Buffer.byteLength(outstandingEnvelope)} bytes)`);

    const outstandingXml = await withRetry(
      () => tallyFetch(config, outstandingEnvelope),
      { label: 'Tally outstanding', isTransient: isTransientTallyError },
    );
    const outstanding = parseOutstanding(outstandingXml);
    log('info', `Tally response: parsed ${outstanding.length} outstanding bills`);

    // Step 3: Fetch vouchers
    log('info', 'Fetching vouchers...');
    const voucherEnvelope = buildEnvelope({
      collectionType: 'Voucher Register',
      collectionId: 'Voucher',
      company,
    });
    log('info', `Tally request: Voucher Register (${Buffer.byteLength(voucherEnvelope)} bytes)`);

    const voucherXml = await withRetry(
      () => tallyFetch(config, voucherEnvelope),
      { label: 'Tally vouchers', isTransient: isTransientTallyError },
    );
    const vouchers = parseVouchers(voucherXml);
    log('info', `Tally response: parsed ${vouchers.length} vouchers`);

    // Step 4: Normalize to MDU records
    const opts = { tenantId: config.tenantId, company };
    const partyRecords = normalizeParties(ledgers, opts);
    const outstandingRecords = normalizeOutstanding(outstanding, opts);
    const voucherRecords = normalizeVouchers(vouchers, opts);

    const counts = { parties: partyRecords.length, outstanding: outstandingRecords.length, vouchers: voucherRecords.length };
    const total = Object.values(counts).reduce((s, c) => s + c, 0);
    log('info', `Fetched: ${counts.parties} parties, ${counts.outstanding} outstanding, ${counts.vouchers} vouchers (${total} total)`);

    if (total === 0) {
      log('warn', 'WARNING: Zero records fetched. Check Tally gateway connectivity and company name.');
      log('warn', `Verify: Tally is running at ${config.tally.protocol}://${config.tally.host}:${config.tally.port}`);
      log('warn', `Verify: Company "${company}" exists in Tally`);
    }

    // Step 5: Push to cloud ARTHA
    const allRecords = [...partyRecords, ...outstandingRecords, ...voucherRecords];
    const syncRun = buildSyncRun({ ...opts, counts, durationMs: Date.now() - start });

    const payload = {
      traceId,
      tenantId: config.tenantId,
      company,
      records: allRecords,
      syncRun,
      totalRecords: allRecords.length,
    };

    log('info', `Cloud push: POST ${config.cloud.url}/api/v1/tally-connect/ingest (${allRecords.length} records, ${Buffer.byteLength(JSON.stringify(payload))} bytes)`);

    const result = await withRetry(
      () => pushToCloud({
        url: config.cloud.url,
        apiKey: config.cloud.apiKey,
        hmacSecret: config.cloud.hmacSecret,
        payload,
        timeoutMs: config.cloud.timeoutMs,
      }),
      { label: 'Cloud push', isTransient: isTransientCloudError },
    );

    const duration = Date.now() - start;
    log('info', `Cloud accepted: ${result.counts?.parties ?? '?'} parties, ${result.counts?.outstanding ?? '?'} outstanding, ${result.counts?.vouchers ?? '?'} vouchers (trace=${traceId}, ${duration}ms)`);
    return { success: true, traceId, counts, duration };
  } catch (err) {
    const duration = Date.now() - start;
    if (err instanceof CloudError) {
      log('error', `Cloud push failed [${err.code}]: ${err.message} (trace=${traceId}, ${duration}ms)`);
    } else {
      log('error', `Sync failed: ${err.message} (trace=${traceId}, ${duration}ms)`);
    }
    return { success: false, error: err.message, traceId, duration };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const config = loadConfig();

  if (args.includes('--status')) {
    log('info', 'Configuration:');
    log('info', `  Tally:     ${config.tally.protocol}://${config.tally.host}:${config.tally.port}`);
    log('info', `  Cloud:     ${config.cloud.url}`);
    log('info', `  Company:   ${config.tally.company || '(not set — REQUIRED)'}`);
    log('info', `  Tenant:    ${config.tenantId}`);
    log('info', `  Interval:  ${config.sync.intervalMs / 60000}min`);
    log('info', `  Backfill:  ${config.sync.defaultBackfillDays} days`);
    return;
  }

  if (args.includes('--test-readonly')) {
    const passed = testReadOnlyGuard();
    process.exit(passed ? 0 : 1);
  }

  log('info', `Starting connector: Tally=${config.tally.host}:${config.tally.port} → Cloud=${config.cloud.url}`);
  log('info', `Company: ${config.tally.company || '(NOT SET — sync will fail)'}`);

  // Graceful shutdown
  let running = true;
  const shutdown = () => { running = false; log('info', 'Shutting down...'); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (args.includes('--once')) {
    const result = await syncOnce(config);
    process.exit(result.success ? 0 : 1);
  }

  // Continuous mode: run on interval
  while (running) {
    await syncOnce(config);
    log('info', `Next sync in ${config.sync.intervalMs / 60000} minutes`);
    await new Promise((resolve) => setTimeout(resolve, config.sync.intervalMs));
  }
}

main().catch((err) => { log('error', `Fatal: ${err.message}`); process.exit(1); });
