/**
 * verify-tally-gateway — Phase 1 "Learn" tool. Confirms the Tally gateway is
 * reachable and lists the real companies available (read-only). Run it from a
 * machine that can reach the Tally server (same LAN / firewall opened):
 *
 *   node scripts/verify-tally-gateway.js
 *
 * Output: TCP reachability, gateway version/companies via `List of Companies`,
 * and a party-ledger fetch count.
 */
import 'dotenv/config';
import net from 'node:net';
import connector from '../src/tallyIntegration/tallyConnector.service.js';
import { getTallyConfig, getTallyBaseUrl } from '../src/tallyIntegration/tallyXmlClient.js';

function tcpProbe(host, port, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (ok, why) => {
      sock.destroy();
      resolve({ ok, why });
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false, 'TIMEOUT'));
    sock.once('error', (e) => done(false, e.code || e.message));
    sock.connect(port, host);
  });
}

async function main() {
  const cfg = getTallyConfig();
  console.log('gateway:', getTallyBaseUrl());
  console.log('enabled:', cfg.enabled);

  const probe = await tcpProbe(cfg.host, cfg.port);
  console.log(`TCP ${cfg.host}:${cfg.port} -> ${probe.ok ? 'OPEN' : probe.why}`);
  if (!probe.ok) {
    console.log('\nCannot reach the Tally gateway. Check:');
    console.log('  1. Tally machine (192.168.0.72) and this machine share the same LAN / subnet.');
    console.log('  2. Windows Firewall on the Tally machine allows inbound TCP 9000');
    console.log('     (Control Panel > Windows Defender Firewall > Advanced > Inbound rule for port 9000).');
    console.log('  3. Tally is running with a company open (gateway serves while Tally is open).');
    return;
  }

  if (!cfg.enabled) {
    console.log('\nTALLY_ENABLED is false — enable it in .env to send the read-only export.');
    return;
  }

  console.log('\n--- List of Companies (read-only export) ---');
  const auth = await connector.authenticate();
  auth.companies.forEach((c) => console.log(`  company: ${c.name} (masterId ${c.masterId || '?'})`));

  console.log('\n--- Party ledger fetch (read-only) ---');
  const company = cfg.company || (auth.companies[0] && auth.companies[0].name);
  if (!company) {
    console.log('No company selected. Set TALLY_COMPANY in .env (use a name above).');
    return;
  }
  console.log(`company: ${company}`);
  const parties = await connector.fetchAndNormalize('party', { company });
  const debtors = parties.filter((r) => r.canonical_data.party_type === 'SUNDRY_DEBTOR');
  const creditors = parties.filter((r) => r.canonical_data.party_type === 'SUNDRY_CREDITOR');
  console.log(`parties: ${parties.length} (debtors ${debtors.length}, creditors ${creditors.length})`);
  debtors.slice(0, 10).forEach((r) => {
    const d = r.canonical_data;
    console.log(`  DEBTOR ${d.party_name} | bal ${d.closing_balance} | gstin ${d.gstin || '-'}`);
  });
  console.log('\nGateway verified. Copy a dealer name into the demo:');
  console.log('  node scripts/tally-connect-demo.js --party "<dealer name>" --setu');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(`VERIFY FAILED: ${err.message} (${err.code || 'no code'})`);
  process.exit(1);
});