/**
 * mock-setu-tally — lenient local SETU collector for the Tally demo.
 *
 * Accepts BOTH envelope shapes:
 *   1. The ARTHA signal-pipeline Sampada envelope (SETU_BASE_URL) — nested payload.
 *   2. The Tally connector direct MDU record (TALLY_SETU_ENDPOINT).
 *
 * Prints every received payload and returns an ACCEPTED acknowledgement with a
 * SETU reference so the full Tally → ARTHA → SETU flow shows as delivered.
 *
 *   node scripts/mock-setu-tally.js            # default http://localhost:9876
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.SETU_MOCK_PORT || 9876);

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const timestamp = new Date().toISOString();
    const requestId = randomUUID();
    const setuRef = `SETU-${Date.now()}-${randomUUID().slice(0, 8)}`;

    let parsed = {};
    try {
      parsed = JSON.parse(body || '{}');
    } catch {
      parsed = { _parseError: 'invalid JSON' };
    }

    const signalId = parsed.signal_id
      || (parsed.payload && parsed.payload.signal_id)
      || parsed.entity_id
      || 'UNKNOWN';
    const traceId = parsed.trace_id || (parsed.payload && parsed.payload.trace_id) || 'UNKNOWN';

    console.log(`\n[${timestamp}] RECEIVED ${req.method} ${req.url}`);
    console.log(`  Request-ID: ${requestId}`);
    console.log(`  Signature:  ${req.headers['x-setu-signature'] ? 'HMAC present' : 'MISSING'}`);
    console.log(`  Idempotency:${req.headers['x-idempotency-key'] || 'none'}`);
    console.log(`  signal_id:  ${signalId}`);
    console.log(`  trace_id:   ${traceId}`);
    console.log(`  body: ${JSON.stringify(parsed).slice(0, 900)}`);

    const response = {
      status: 'ACCEPTED',
      request_id: requestId,
      setu_reference: setuRef,
      signal_id: signalId,
      trace_id: traceId,
      filing_type: parsed.filing_type || parsed.signal_type || 'DEALER_SUMMARY',
      gateway: 'MOCK_SETU_TALLY_v1.0',
      timestamp,
    };

    console.log(`  ✅ ACCEPTED — ${setuRef}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response, null, 2));
  });
});

server.listen(PORT, () => {
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  MOCK SETU (Tally demo) RUNNING`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  Accepts: ARTHA Sampada envelopes + Tally MDU records`);
  console.log(`═══════════════════════════════════════════════════════\n`);
});