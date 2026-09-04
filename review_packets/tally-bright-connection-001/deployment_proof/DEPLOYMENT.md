# Deployment / configuration instructions

## Prerequisites
- Node.js >= 18 (ESM) on a machine that can reach the Tally gateway network.
- MongoDB (this project uses MongoDB Atlas — cloud, reachable from anywhere).
- Redis optional (server continues without it).

## Quick start (Windows, Tally LAN)

Copy this whole repository to any PC on the 192.168.0.x network (or the
Tally PC itself), install Node.js LTS, then double-click/run:

```bat
cd backend
scripts\live-gateway-setup.bat
```

It installs deps, scaffolds .env, and runs the real-gateway verification.

## 1. Configure environment (backend/.env)

```
# Tally gateway (real Bright Connection)
TALLY_ENABLED=true
TALLY_PROTOCOL=http
TALLY_HOST=192.168.0.72
TALLY_PORT=9000
TALLY_COMPANY=            # fill after verify-tally-gateway lists companies
TALLY_BASIC_USERNAME=     # only if the gateway/proxy requires it
TALLY_BASIC_PASSWORD=     # only if the gateway/proxy requires it
TALLY_TIMEOUT_MS=15000
TALLY_TENANT_ID=tenant_bright_connection_001

# SETU delivery (choose: direct ingest AND/OR ARTHA signal pipeline)
TALLY_SETU_ENDPOINT=      # real SETU ingest URL from Raj
TALLY_SETU_HMAC_SECRET=   # shared HMAC secret for X-Setu-Signature
TALLY_SETU_MAX_RETRIES=3

# ARTHA signal pipeline (alternative SETU path)
# NOTE: pre-existing SetuDispatch snake_case→camelCase field bug is now fixed
# (signalEngine.service.js + setuDispatch.service.js). SETU_ENABLED can be true.
SETU_ENABLED=true
SETU_BASE_URL=
SETU_API_KEY=
```

## 2. Verify connectivity (must list REAL companies)

```bash
node scripts/verify-tally-gateway.js
```

## 3. Run the full flow

```bash
npm test -- tests/tallyConnector.test.js --forceExit   # 15 tests
node scripts/tally-connect-demo.js --party "<dealer>" --setu
npm run dev                                            # ARTHA API :5000
# frontend: cd ../frontend && npm run dev  (Vite :5173)
```

## 4. API endpoints (Bearer token required)

POST /api/v1/auth/login → token. Then:
- GET  /api/v1/tally-connect/config
- GET  /api/v1/tally-connect/health
- POST /api/v1/tally-connect/sync
- GET  /api/v1/tally-connect/parties | /outstanding | /vouchers
- GET  /api/v1/tally-connect/dealer/:partyName
- POST /api/v1/tally-connect/dealer/:partyName/setu
- GET  /api/v1/tally-connect/setu/mdu-export

## 5. Bring the data INTO ARTHA (the goal: Bright Connection financial data
managed in ARTHA)

After verify succeeds, set TALLY_COMPANY to the real company name and run:

```bash
node scripts/tally-connect-demo.js --party "<dealer>" --setu   # one dealer end-to-end
# or sync the whole company into ARTHA snapshot models:
curl -X POST http://localhost:5000/api/v1/tally-connect/sync -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d "{"company":"Bright Connection"}"
# then query ARTHA:
curl http://localhost:5000/api/v1/tally-connect/parties?company=Bright Connection -H "Authorization: Bearer <token>"
curl http://localhost:5000/api/v1/tally-connect/outstanding?overdue=true -H "Authorization: Bearer <token>"
curl http://localhost:5000/api/v1/tally-connect/vouchers -H "Authorization: Bearer <token>"
```
## Security
- Credentials live ONLY in .env (git-ignored). Never commit them.
- The connector only issues Export Data envelopes (read-only by construction).
- getMaskedConfig() hides credentials in /config responses.
