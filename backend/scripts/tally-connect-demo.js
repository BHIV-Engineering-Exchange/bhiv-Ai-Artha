/**
 * tally-connect-demo — standalone demo of the read-only Tally connector,
 * runnable WITHOUT Mongo or the full ARTHA stack:
 *
 *   node scripts/tally-connect-demo.js [--party "Dealer Name"] [--setu]
 *
 * Flow: connect (ping) → companies → parties → outstanding → vouchers →
 * dealer summary (outstanding / last billing / payments) → MITRA-readable
 * summary → optional SETU dispatch (needs TALLY_SETU_ENDPOINT).
 */
import 'dotenv/config';
import connector from '../src/tallyIntegration/tallyConnector.service.js';
import setuBridge from '../src/tallyIntegration/tallySetuBridge.service.js';
import { getMaskedConfig } from '../src/tallyIntegration/tallyXmlClient.js';
import { parseAmount } from '../src/tallyIntegration/tallyXmlParser.js';

const args = process.argv.slice(2);
const partyFilter = args.includes('--party') ? args[args.indexOf('--party') + 1] : null;
const doSetu = args.includes('--setu');

function fmt(n) {
  return (Number(n) || 0).toFixed(2);
}

async function main() {
  console.log('\n=== BRIGHT CONNECTION TALLY CONNECTOR (read-only demo) ===');
  console.log('config:', JSON.stringify(getMaskedConfig(), null, 2));

  if (!connector.isReadOnly()) throw new Error('Connector must be read-only');
  console.log('read-only:', connector.isReadOnly(), '| entities:', connector.manifest().entities.map((e) => e.type).join(', '));

  console.log('\n--- connect (ping) ---');
  const auth = await connector.authenticate();
  console.log('companies:', auth.companies.map((c) => c.name).join(' | '));

  const company = process.env.TALLY_COMPANY || (auth.companies[0] && auth.companies[0].name) || '';
  console.log('company:', company || '(not specified)');

  console.log('\n--- parties (ledgers) ---');
  const parties = await connector.fetchAndNormalize('party', { company });
  console.log(`parties: ${parties.length}`);
  const dealers = parties.filter((r) => r.canonical_data.party_type === 'SUNDRY_DEBTOR');
  dealers.slice(0, 15).forEach((r) => {
    const d = r.canonical_data;
    console.log(`  ${d.party_name} | closing ${fmt(d.closing_balance)} | gstin ${d.gstin || '-'}`);
  });

  const target = partyFilter || (dealers[0] && dealers[0].canonical_data.party_name);
  if (!target) {
    console.log('\nNo dealer found to demo. Provide --party "<name>".');
    return;
  }
  console.log(`\n=== DEALER DEMO: ${target} ===`);

  console.log('\n--- outstanding ---');
  const outstanding = await connector.fetchAndNormalize('outstanding', { company, partyName: target });
  const rows = outstanding.map((r) => r.canonical_data);
  const totalOutstanding = rows.reduce((s, o) => s + (o.balance || 0), 0);
  const overdue = rows.filter((o) => o.days_overdue > 0);
  const overdueAmount = overdue.reduce((s, o) => s + (o.balance || 0), 0);
  console.log(`outstanding bills: ${rows.length} | total: ${fmt(totalOutstanding)} | overdue: ${fmt(overdueAmount)} (${overdue.length} bills)`);
  rows.slice(0, 10).forEach((o) => {
    console.log(`  ${o.bill_no || '?'} | ${(o.bill_date || '').slice(0, 10)} | due ${(o.due_date || '').slice(0, 10)} | bal ${fmt(o.balance)} | overdue ${o.days_overdue}d`);
  });

  console.log('\n--- vouchers (last billing / payments) ---');
  const vouchers = await connector.fetchAndNormalize('voucher', { company });
  const vRows = vouchers.map((r) => r.canonical_data).filter((v) => v.party_name === target);
  const sales = vRows.filter((v) => /sales|invoice/i.test(v.voucher_type));
  const receipts = vRows.filter((v) => /receipt|payment/i.test(v.voucher_type));
  const lastBilling = sales[0];
  const lastPayment = receipts[0];
  if (lastBilling) console.log(`last billing: #${lastBilling.voucher_number} ${(lastBilling.date || '').slice(0, 10)} for ${fmt(lastBilling.amount)}`);
  if (lastPayment) console.log(`last payment: #${lastPayment.voucher_number} ${(lastPayment.date || '').slice(0, 10)} for ${fmt(lastPayment.amount)}`);
  if (!lastBilling && !lastPayment) console.log('(no matching vouchers)');

  console.log('\n--- MITRA-readable summary ---');
  const party = dealers.find((r) => r.canonical_data.party_name === target);
  const summary = [
    `DEALER: ${target}`,
    `ACCOUNT STATUS: ${overdueAmount > 0 ? 'OVERDUE_BALANCE' : 'CLEAR'}`,
    `OUTSTANDING: ${fmt(totalOutstanding)} INR (${rows.length} bills)`,
    `OVERDUE: ${fmt(overdueAmount)} INR (${overdue.length} bills)`,
  ];
  if (lastBilling) summary.push(`LAST BILLING: #${lastBilling.voucher_number} on ${(lastBilling.date || '').slice(0, 10)} for ${fmt(lastBilling.amount)} INR`);
  if (lastPayment) summary.push(`LAST PAYMENT: #${lastPayment.voucher_number} on ${(lastPayment.date || '').slice(0, 10)} for ${fmt(lastPayment.amount)} INR`);
  if (party) summary.push(`GSTIN: ${party.canonical_data.gstin || 'N/A'} | CREDIT LIMIT: ${fmt(party.canonical_data.credit_limit)} INR`);
  console.log(summary.join('\n'));

  if (doSetu) {
    console.log('\n--- SETU dispatch ---');
    const record = {
      entity_type: 'dealer_summary',
      entity_id: `dealer:${target}`,
      tenant_id: process.env.TALLY_TENANT_ID || 'tenant_bright_connection_001',
      source_connector: 'tally',
      read_only: true,
      company,
      canonical_data: {
        dealer: target,
        total_outstanding: totalOutstanding,
        overdue_amount: overdueAmount,
        last_billing: lastBilling ? { number: lastBilling.voucher_number, date: lastBilling.date, amount: lastBilling.amount } : null,
        last_payment: lastPayment ? { number: lastPayment.voucher_number, date: lastPayment.date, amount: lastPayment.amount } : null,
      },
      trace_id: `tally-demo-${Date.now()}`,
      schema_version: '1.0.0',
      idempotency_key: `tenant_bright_connection_001:dealer_summary:${target}`,
    };
    const outcomes = await setuBridge.dispatchRecord(record, { signalId: 'SIG_TALLY_DEALER_OUTSTANDING' });
    console.log(JSON.stringify(outcomes, null, 2));
  } else {
    console.log('\n(skip SETU dispatch — pass --setu to send; needs TALLY_SETU_ENDPOINT)');
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(`\nDEMO FAILED: ${err.message} (${err.code || 'no code'})`);
  process.exit(1);
});