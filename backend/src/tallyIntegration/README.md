# Tally Read-Only Connector — Bright Connection

Additive integration of Bright Connection's **Tally ERP9/Prime** into ARTHA via a
strict **read-only** connector, modeled on Aman Pal's **Setu-Aman** connector
framework (`authenticate → fetch_data → normalize → MDURecord`).

```
Bright Connection Tally (XML gateway)
        │  Export-only envelopes (never writes)
        ▼
tallyXmlClient  →  tallyXmlParser  →  tallyConnector  (connector boundary)
        │  canonical MDU records
        ▼
tallyAdapter  →  ARTHA snapshot models (TallyParty / TallyOutstanding / TallyVoucher)
        │
        ▼
tallySetuBridge  →  SETU (direct ingest OR ARTHA signal pipeline)  →  MITRA-readable summary
```

## Hard guarantees

- **Read-only by construction.** The client only emits `<TALLYREQUEST>Export Data</TALLYREQUEST>`
  envelopes. Any non-export envelope is rejected by `assertReadOnlyEnvelope()`
  before it touches the wire (proven by tests 7 & 11).
- **No ARTHA core changes.** Only additive files + 2 mounting lines in
  `server.js` + 1 route-map entry + new `.env.example` keys.
- **No credentials in code.** Basic-auth credentials come exclusively from env;
  `getMaskedConfig()` masks them; the leakage test proves they never reach
  payloads.
- **MITRA is presentational only.** ARTHA computes the figures; MITRA reads the
  `mitraReadable` summary.

## Quick start

1. Add env config (see `backend/.env.example` → `# Tally read-only connector`).
2. Enable + point at the live gateway once Raj provides host/port/credentials.
3. Run the standalone demo (no Mongo required):

   ```bash
   node scripts/tally-connect-demo.js --party "Dealer Name" --setu
   ```

4. Run the tests:

   ```bash
   npm test -- tests/tallyConnector.test.js --forceExit
   ```

5. API (mounted at `/api/v1/tally-connect`, protected, read-only capability):

   | Method | Path | Purpose |
   |---|---|---|
   | GET | `/config` | masked connection config (screenshot evidence) |
   | GET | `/manifest` | connector manifest |
   | GET | `/health` | gateway connectivity probe |
   | GET | `/readonly-proof` | read-only enforcement summary |
   | POST | `/sync` | full sync run (parties/outstanding/vouchers) |
   | GET | `/parties` | snapshot parties |
   | GET | `/outstanding` | snapshot outstanding |
   | GET | `/vouchers` | snapshot vouchers |
   | GET | `/dealer/:partyName` | dealer demo summary (→ MITRA-readable) |
   | POST | `/dealer/:partyName/setu` | dispatch dealer summary to SETU |
   | GET | `/setu/mdu-export` | canonical MDU JSON for Setu-Aman framework |
   | GET | `/sync-runs` | sync provenance evidence |

## Files

| File | Role |
|---|---|
| `tallyXmlClient.js` | read-only XML gateway client (Export-only guard, basic auth, timeout, structured errors) |
| `tallyXmlParser.js` | tolerant Tally XML parser (companies / ledgers / outstanding / vouchers) |
| `tallyConnector.service.js` | connector boundary: manifest, authenticate, fetchData, normalize → MDU |
| `tallyAdapter.service.js` | ARTHA normalization + persistence + dealer summary builder |
| `tallySetuBridge.service.js` | SETU dispatch (direct + ARTHA pipeline) + MDU export |
| `../models/Tally*.js` | additive snapshot models |
| `../controllers/tallyConnector.controller.js` | HTTP handlers |
| `../routes/tallyConnector.routes.js` | routes |
| `../../tests/tallyConnector.test.js` | 14 tests incl. read-only proof + credential-leak check |

## Pending from Raj (blocks the real-data proof, not the scaffold)

- Gateway discovered: `http://192.168.0.72:9000` (TallyPrime About: SERVER,
  Client/Server with ODBC port 9000, no proxy for gateway). **Currently
  unreachable from the dev machine** — open inbound TCP 9000 in the Tally
  machine's Windows Firewall and run ARTHA on the same LAN.
- Confirm company name + any gateway auth (the verify script lists companies).
- A real SETU ingest endpoint (or keep the ARTHA signal pipeline as the SETU path).

## Verify the gateway

```bash
node scripts/verify-tally-gateway.js   # TCP probe → List of Companies → parties
```