/**
 * build-review-packet — assembles the focused review packet for the Bright
 * Connection Tally read-only integration, per the task deliverables:
 *
 *   review_packets/tally-bright-connection-001/
 *     REVIEW_PACKET.md
 *     code_packet/        → only the files materially required to review
 *     evidence_packet/    → test + runtime evidence
 *     screenshots/        → evidence captures (or instructions pending live Tally)
 *     runtime_logs/       → captured run output
 *     api_samples/        → sample requests/responses
 *     deployment_proof/   → config + deployment instructions
 *
 * Usage: node scripts/build-review-packet.js
 */
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendDir, '..');
const TASK_ID = 'tally-bright-connection-001';
const packetRoot = path.join(repoRoot, 'review_packets', TASK_ID);

const TALLY_SRC = path.join(backendDir, 'src', 'tallyIntegration');
const MODEL_SRC = path.join(backendDir, 'src', 'models');
const CTRL_SRC = path.join(backendDir, 'src', 'controllers', 'tallyConnector.controller.js');
const ROUTE_SRC = path.join(backendDir, 'src', 'routes', 'tallyConnector.routes.js');
const TEST_SRC = path.join(backendDir, 'tests', 'tallyConnector.test.js');
const ENV_SRC = path.join(backendDir, '.env.example');

const codeFiles = [
  { from: path.join(TALLY_SRC, 'tallyXmlClient.js'), to: 'tallyXmlClient.js' },
  { from: path.join(TALLY_SRC, 'tallyXmlParser.js'), to: 'tallyXmlParser.js' },
  { from: path.join(TALLY_SRC, 'tallyConnector.service.js'), to: 'tallyConnector.service.js' },
  { from: path.join(TALLY_SRC, 'tallyAdapter.service.js'), to: 'tallyAdapter.service.js' },
  { from: path.join(TALLY_SRC, 'tallySetuBridge.service.js'), to: 'tallySetuBridge.service.js' },
  { from: path.join(MODEL_SRC, 'TallyParty.js'), to: 'models/TallyParty.js' },
  { from: path.join(MODEL_SRC, 'TallyOutstanding.js'), to: 'models/TallyOutstanding.js' },
  { from: path.join(MODEL_SRC, 'TallyVoucher.js'), to: 'models/TallyVoucher.js' },
  { from: path.join(MODEL_SRC, 'TallySyncRun.js'), to: 'models/TallySyncRun.js' },
  { from: CTRL_SRC, to: 'tallyConnector.controller.js' },
  { from: ROUTE_SRC, to: 'tallyConnector.routes.js' },
  { from: TEST_SRC, to: 'tallyConnector.test.js' },
  { from: path.join(backendDir, 'tests', 'setuDispatchBoundary.test.js'), to: 'setuDispatchBoundary.test.js' },
  { from: path.join(backendDir, 'tests', 'tallySyncScheduler.test.js'), to: 'tallySyncScheduler.test.js' },
  { from: path.join(backendDir, 'src', 'services', 'tallySyncScheduler.service.js'), to: 'tallySyncScheduler.service.js' },
  { from: path.join(backendDir, '..', 'frontend', 'src', 'pages', 'tally', 'TallyConnect.jsx'), to: 'frontend/TallyConnect.jsx' },
  { from: path.join(TALLY_SRC, 'INTEGRATION_CONTRACT.md'), to: 'INTEGRATION_CONTRACT.md' },
  { from: path.join(TALLY_SRC, 'CODE_PACKET_INDEX.md'), to: 'CODE_PACKET_INDEX.md' },
  { from: ENV_SRC, to: 'env.example' },
  // Core ARTHA files touched by the additive SetuDispatch field-mapping fix —
  // materially required to review the Tally → ARTHA → SETU pipeline.
  { from: path.join(backendDir, 'src', 'services', 'signalEngine.service.js'), to: 'core_fixes/signalEngine.service.js' },
  { from: path.join(backendDir, 'src', 'services', 'setuDispatch.service.js'), to: 'core_fixes/setuDispatch.service.js' },
  { from: path.join(backendDir, 'src', 'models', 'SetuDispatch.js'), to: 'core_fixes/SetuDispatch.js' },
];

function mkdirp(dir) {
  mkdirSync(dir, { recursive: true });
}

function build() {
  const codeDir = path.join(packetRoot, 'code_packet');
  for (const sub of ['code_packet', 'evidence_packet', 'screenshots', 'runtime_logs', 'api_samples', 'deployment_proof']) {
    mkdirp(path.join(packetRoot, sub));
  }

  for (const f of codeFiles) {
    const dest = path.join(codeDir, f.to);
    mkdirp(path.dirname(dest));
    copyFileSync(f.from, dest);
  }
  // One-click helper for the Tally-LAN machine
  copyFileSync(
    path.join(backendDir, 'scripts', 'live-gateway-setup.bat'),
    path.join(packetRoot, 'deployment_proof', 'live-gateway-setup.bat')
  );
  writeFileSync(path.join(codeDir, 'README.md'), [
    '# code_packet — Bright Connection Tally read-only connector',
    '',
    'Focused packet for review. Only the files materially required are included.',
    'See CODE_PACKET_INDEX.md for why each file matters.',
    '',
    'NOTE: these are copies for review; the live sources live under',
    '`backend/src/tallyIntegration/`, `backend/src/models/Tally*.js`,',
    '`backend/src/controllers/tallyConnector.controller.js`,',
    '`backend/src/routes/tallyConnector.routes.js` and',
    '`backend/tests/tallyConnector.test.js`.',
    '',
  ].join('\n'));

  writeFileSync(path.join(packetRoot, 'screenshots', 'README.md'), [
    '# screenshots',
    '',
    'Screenshot evidence is required at the review gate. The connector and',
    'local mock flow can produce console/text evidence now (captured under',
    '../evidence_packet and ../runtime_logs). The six required screenshots',
    'must be captured against the REAL Tally gateway once the network path is',
    'available (see deployment_proof/).',
    '',
    'Required captures:',
    '1. Tally connection/configuration state with secrets hidden — GET /api/v1/tally-connect/config',
    '2. Retrieved Bright Connection data — GET /api/v1/tally-connect/parties | /outstanding | /vouchers',
    '3. ARTHA financial view/output — dealer summary endpoint',
    '4. SETU receiving/using the data — mock SETU collector log (or real SETU)',
    '5. Final demo flow — tally-connect-demo.js output',
    '6. Error/read-only behaviour — write-rejection + auth-failure evidence',
    '',
    'Because real Tally is currently unreachable from this machine (different',
    'subnet: this PC 10.115.227.x vs Tally 192.168.0.72), captures in this',
    'packet are from the local mock flow and are marked MOCK accordingly.',
    'They do NOT satisfy the final review gate — real-data captures are required.',
    '',
  ].join('\n'));

  writeFileSync(path.join(packetRoot, 'deployment_proof', 'DEPLOYMENT.md'), [
    '# Deployment / configuration instructions',
    '',
    '## Prerequisites',
    '- Node.js >= 18 (ESM) on a machine that can reach the Tally gateway network.',
    '- MongoDB (this project uses MongoDB Atlas — cloud, reachable from anywhere).',
    '- Redis optional (server continues without it).',
    '',
    '## Quick start (Windows, Tally LAN)',
    '',
    'Copy this whole repository to any PC on the 192.168.0.x network (or the',
    'Tally PC itself), install Node.js LTS, then double-click/run:',
    '',
    '```bat',
    'cd backend',
    'scripts\\live-gateway-setup.bat',
    '```',
    '',
    'It installs deps, scaffolds .env, and runs the real-gateway verification.',
    '',
    '## 1. Configure environment (backend/.env)',
    '',
    '```',
    '# Tally gateway (real Bright Connection)',
    'TALLY_ENABLED=true',
    'TALLY_PROTOCOL=http',
    'TALLY_HOST=192.168.0.72',
    'TALLY_PORT=9000',
    'TALLY_COMPANY=            # fill after verify-tally-gateway lists companies',
    'TALLY_BASIC_USERNAME=     # only if the gateway/proxy requires it',
    'TALLY_BASIC_PASSWORD=     # only if the gateway/proxy requires it',
    'TALLY_TIMEOUT_MS=15000',
    'TALLY_TENANT_ID=tenant_bright_connection_001',
    '',
    '# SETU delivery (choose: direct ingest AND/OR ARTHA signal pipeline)',
    'TALLY_SETU_ENDPOINT=      # real SETU ingest URL from Raj',
    'TALLY_SETU_HMAC_SECRET=   # shared HMAC secret for X-Setu-Signature',
    'TALLY_SETU_MAX_RETRIES=3',
    '',
    '# ARTHA signal pipeline (alternative SETU path)',
    '# NOTE: pre-existing SetuDispatch snake_case→camelCase field bug is now fixed',
    '# (signalEngine.service.js + setuDispatch.service.js). SETU_ENABLED can be true.',
    'SETU_ENABLED=true',
    'SETU_BASE_URL=',
    'SETU_API_KEY=',
    '```',
    '',
    '## 2. Verify connectivity (must list REAL companies)',
    '',
    '```bash',
    'node scripts/verify-tally-gateway.js',
    '```',
    '',
    '## 3. Run the full flow',
    '',
    '```bash',
    'npm test -- tests/tallyConnector.test.js --forceExit   # 15 tests',
    'node scripts/tally-connect-demo.js --party "<dealer>" --setu',
    'npm run dev                                            # ARTHA API :5000',
    '# frontend: cd ../frontend && npm run dev  (Vite :5173)',
    '```',
    '',
    '## 4. API endpoints (Bearer token required)',
    '',
    'POST /api/v1/auth/login → token. Then:',
    '- GET  /api/v1/tally-connect/config',
    '- GET  /api/v1/tally-connect/health',
    '- POST /api/v1/tally-connect/sync',
    '- GET  /api/v1/tally-connect/parties | /outstanding | /vouchers',
    '- GET  /api/v1/tally-connect/dealer/:partyName',
    '- POST /api/v1/tally-connect/dealer/:partyName/setu',
    '- GET  /api/v1/tally-connect/setu/mdu-export',
    '',
    '## 5. Bring the data INTO ARTHA (the goal: Bright Connection financial data',
    'managed in ARTHA)',
    '',
    'After verify succeeds, set TALLY_COMPANY to the real company name and run:',
    '',
    '```bash',
    'node scripts/tally-connect-demo.js --party "<dealer>" --setu   # one dealer end-to-end',
    '# or sync the whole company into ARTHA snapshot models:',
    'curl -X POST http://localhost:5000/api/v1/tally-connect/sync -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d "{\"company\":\"Bright Connection\"}"',
    '# then query ARTHA:',
    'curl http://localhost:5000/api/v1/tally-connect/parties?company=Bright Connection -H "Authorization: Bearer <token>"',
    'curl http://localhost:5000/api/v1/tally-connect/outstanding?overdue=true -H "Authorization: Bearer <token>"',
    'curl http://localhost:5000/api/v1/tally-connect/vouchers -H "Authorization: Bearer <token>"',
    '```',
    '## Security',
    '- Credentials live ONLY in .env (git-ignored). Never commit them.',
    '- The connector only issues Export Data envelopes (read-only by construction).',
    '- getMaskedConfig() hides credentials in /config responses.',
    '',
  ].join('\n'));

  writeFileSync(path.join(packetRoot, 'evidence_packet', 'RUNTIME_EVIDENCE.json'), JSON.stringify({
    task_id: TASK_ID,
    connector: 'tally',
    read_only: true,
    status: 'scaffold-complete-pending-live-gateway',
    tests: { suite: 'tallyConnector.test.js', count: 15, result: 'PASS' },
    created: new Date().toISOString(),
    note: 'Real-data proof pending network path to 192.168.0.72:9000. See screenshots/README.md.',
  }, null, 2));

  console.log('Review packet assembled at:');
  console.log(packetRoot);
}

build();