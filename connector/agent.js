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
 */
import { randomUUID } from 'node:crypto';
import loadConfig from './config.js';
import { fetchFromTally, buildEnvelope, assertReadOnlyEnvelope } from './tallyClient.js';
import { parseCompanies, parseLedgers, parseOutstanding, parseVouchers } from './tallyParser.js';
import { normalizeParties, normalizeOutstanding, normalizeVouchers, buildSyncRun } from './normalizer.js';
import { pushToCloud, CloudError } from './cloudClient.js';

const LOG_PREFIX = '[TALLY-CONNECTOR]';

function log(level, msg, extra) {
  const ts = new Date().toISOString();
  const line = `${ts} ${LOG_PREFIX} ${level.toUpperCase()}: ${msg}`;
  if (extra) console.log(line, extra);
  else console.log(line);
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

async function syncOnce(config) {
  const traceId = `connector-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const start = Date.now();
  log('info', `Sync started trace=${traceId}`);

  try {
    // Step 1: Fetch company list
    const companyXml = await tallyFetch(config, buildEnvelope({ requestName: 'List of Companies' }));
    const companies = parseCompanies(companyXml);
    const selectedCompany = config.tally.company || (companies[0] && companies[0].name) || '';
    if (!selectedCompany) throw new Error('No company found in Tally. Set TALLY_COMPANY in .env.');
    log('info', `Company: ${selectedCompany}`);

    // Step 2: Fetch each entity type
    const ledgerXml = await tallyFetch(config, buildEnvelope({ requestName: 'Ledger', collectionType: 'Ledger', collectionName: 'Accounts' }));
    const ledgers = parseLedgers(ledgerXml);

    const outstandingXml = await tallyFetch(config, buildEnvelope({ requestName: 'Statement of Accounts', collectionType: 'Ledger', collectionName: 'LedgerVch' }));
    const outstanding = parseOutstanding(outstandingXml);

    const voucherXml = await tallyFetch(config, buildEnvelope({ requestName: 'Voucher Register', collectionType: 'Voucher', collectionName: 'VoucherRegister' }));
    const vouchers = parseVouchers(voucherXml);

    // Step 3: Normalize to MDU records
    const opts = { tenantId: config.tenantId, company: selectedCompany };
    const partyRecords = normalizeParties(ledgers, opts);
    const outstandingRecords = normalizeOutstanding(outstanding, opts);
    const voucherRecords = normalizeVouchers(vouchers, opts);

    const counts = { parties: partyRecords.length, outstanding: outstandingRecords.length, vouchers: voucherRecords.length };
    const total = Object.values(counts).reduce((s, c) => s + c, 0);
    log('info', `Fetched: ${counts.parties} parties, ${counts.outstanding} outstanding, ${counts.vouchers} vouchers (${total} total)`);

    // Step 4: Push to cloud ARTHA
    const allRecords = [...partyRecords, ...outstandingRecords, ...voucherRecords];
    const syncRun = buildSyncRun({ ...opts, counts, durationMs: Date.now() - start });

    const payload = {
      traceId,
      tenantId: config.tenantId,
      company: selectedCompany,
      records: allRecords,
      syncRun,
      totalRecords: allRecords.length,
    };

    const result = await pushToCloud({
      url: config.cloud.url,
      apiKey: config.cloud.apiKey,
      hmacSecret: config.cloud.hmacSecret,
      payload,
      timeoutMs: config.cloud.timeoutMs,
    });

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
    log('info', `  Company:   ${config.tally.company || '(auto-detect)'}`);
    log('info', `  Tenant:    ${config.tenantId}`);
    log('info', `  Interval:  ${config.sync.intervalMs / 60000}min`);
    log('info', `  Backfill:  ${config.sync.defaultBackfillDays} days`);
    return;
  }

  log('info', `Starting connector: Tally=${config.tally.host}:${config.tally.port} → Cloud=${config.cloud.url}`);

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