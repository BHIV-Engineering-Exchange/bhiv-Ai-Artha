# CODE_PACKET_INDEX — Bright Connection Tally read-only connector

Every file is **additive**. The only existing ARTHA files touched (additive,
non-breaking) are listed at the bottom.

## New module: `backend/src/tallyIntegration/`

| File | What it does |
|---|---|
| `tallyXmlClient.js` | Read-only Tally XML gateway client. Export-only envelope guard, basic auth, timeout, structured errors. |
| `tallyXmlParser.js` | Tolerant Tally XML parser: companies, ledgers/parties, bill-wise outstanding, vouchers + GST. |
| `tallyConnector.service.js` | Connector boundary (Setu-Aman style): manifest, authenticate, fetchData, normalize → MDU records. |
| `tallyAdapter.service.js` | ARTHA-side normalization + persistence + dealer summary (outstanding / last billing / payments / MITRA-readable). |
| `tallySetuBridge.service.js` | SETU delivery: direct ingest (HMAC + idempotency + retry), ARTHA signal pipeline, MDU export. |
| `README.md` | Module overview + API + quick start. |
| `INTEGRATION_CONTRACT.md` | Canonical MDU contract, entity schemas, SETU paths, error contract. |
| `REVIEW_PACKET.md` | Review gates, deliverables, reproduction steps, pending items. |

## New models: `backend/src/models/`

| File | What it does |
|---|---|
| `TallyParty.js` | Party/ledger snapshot (dealer, group, balances, GSTIN, PAN, credit limit). |
| `TallyOutstanding.js` | Bill-wise outstanding with due dates and days overdue. |
| `TallyVoucher.js` | Voucher snapshot (sales/receipts/payments + GST details). |
| `TallySyncRun.js` | Sync-run provenance / evidence (Setu-Aman `RUNTIME_EVIDENCE` analog). |

## New HTTP layer

| File | What it does |
|---|---|
| `backend/src/controllers/tallyConnector.controller.js` | Handlers for config, manifest, health, sync, parties/outstanding/vouchers, dealer summary, SETU dispatch, MDU export, sync runs. |
| `backend/src/routes/tallyConnector.routes.js` | `/api/v1/tally-connect` routes (protected). |

## Tests

| File | What it covers |
|---|---|
| `backend/tests/tallyConnector.test.js` | 14 tests: valid read, invalid auth, unavailable, empty, malformed, unknown company, **unauthorized write**, retry/idempotency, canonical schema, credential leakage, read-only proof + parser extraction. |
| `backend/tests/setuDispatchBoundary.test.js` | 3 tests: proves the additive SetuDispatch snake_case→camelCase mapping (no snake_case keys reach the model), SETU-disabled short-circuit. |
| `backend/tests/tallySyncScheduler.test.js` | 8 tests: incremental window computation, enable/interval gating, run lock. |

## Auto-sync (new Tally data → ARTHA, no manual step)

| File | What it does |
|---|---|
| `backend/src/services/tallySyncScheduler.service.js` | Interval scheduler: incremental voucher window from the last successful run + full current-state refresh for parties/outstanding. Env: `TALLY_SYNC_ENABLED` (default on), `TALLY_SYNC_INTERVAL_MINUTES` (15), `TALLY_SYNC_DEFAULT_FROM_DAYS` (30 backfill). Read-only. |
| `backend/src/controllers/tallyConnector.controller.js` | `+POST /sync/now` (trigger now), `+GET /sync/status` (scheduler state). |
| `backend/src/routes/tallyConnector.routes.js` | `+POST /sync/now`, `+GET /sync/status`. |
| `frontend/src/pages/tally/TallyConnect.jsx` | "Tally Connect" UI: sync status, parties, outstanding (overdue filter), recent vouchers; auto-refreshes every 30s; Sync Now button. Route `/tally` + sidebar link. |


## Demo / scripts

| File | What it does |
|---|---|
| `backend/scripts/tally-connect-demo.js` | Standalone end-to-end demo (no Mongo required), optional SETU dispatch. |
| `backend/scripts/mock-tally-gateway.js` | Local fake Tally gateway on `127.0.0.1:9000` for manual/dev testing (serves sample XML). |
| `backend/scripts/verify-tally-gateway.js` | Phase-1 Learn tool: TCP probe → `List of Companies` → party fetch (read-only). |

## Existing files touched (additive only)

| File | Change |
|---|---|
| `backend/src/server.js` | +2 imports, +1 route mount (`/api/v1/tally-connect`), +1 scheduler start. |
| `backend/src/services/signalEngine.service.js` | Additive fix: map snake_case → camelCase at the `SetuDispatch` model boundary (was a ValidationError). |
| `backend/src/services/setuDispatch.service.js` | Same additive field mapping for the dispatch-service + callback paths. |
| `contracts/capability_contracts/capability_route_map.json` | +1 route → `ARTHA-LEDGER-001` (so production authority enforcement does not 403 the new routes). |
| `backend/.env.example` | +`TALLY_*`, `TALLY_SETU_*` and `TALLY_SYNC_*` keys (documentation only; no secrets). |

## Run commands

```bash
cd backend
npm test -- tests/tallyConnector.test.js tests/setuDispatchBoundary.test.js tests/tallySyncScheduler.test.js --forceExit   # 26 passing
node scripts/tally-connect-demo.js --party "<Dealer>"  # demo
npm run dev                                             # API (+ auto-sync scheduler)
```