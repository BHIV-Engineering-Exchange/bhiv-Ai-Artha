# REVIEW_PACKET — Bright Connection Tally (read-only) integration

Task: connect the real Bright Connection Tally system into ARTHA (read-only),
normalize to a canonical financial contract, feed SETU, and produce a MITRA-readable
dealer summary. Demo: dealer → outstanding → last billing → payments → SETU → MITRA.

## Status

- [x] Phase 2 — connector boundary (client, parser, connector, canonical contract)
- [x] Phase 3 — ARTHA adapter (snapshot models, dealer summary, sync evidence)
- [x] Phase 4 — SETU bridge (direct ingest + ARTHA signal pipeline + MDU export)
- [x] Phase 4 — tests: **14 passing** incl. read-only proof + credential-leak check
- [~] Phase 1 — gateway DISCOVERED: `http://192.168.0.72:9000` (TallyPrime About:
      SERVER, Client/Server with ODBC port 9000, no proxy for gateway server)
      **but port 9000 is unreachable from the dev machine** — firewall / LAN issue.
- [ ] Phase 6 — real-data demo + screenshots + deployment proof

## Review gates

1. **Real data proof (blocked).** Final acceptance requires live Tally data.
   Gateway host/port known (`192.168.0.72:9000`). Remaining from Raj:
   - Open inbound TCP 9000 on the Tally machine (Windows Firewall) and run ARTHA
     from a machine on the same 192.168.0.x LAN. Verify with
     `node scripts/verify-tally-gateway.js`.
   - Confirm company name (run `List of Companies` via the verify script) + any
     gateway auth + a sample response + available reports.
   - Confirm the SETU ingest endpoint (or keep the ARTHA signal pipeline).
2. **No mock-only demo.** Tests use a mock gateway for CI only; the review demo
   must run against the real gateway.
3. **Read-only enforcement.** Only `Export Data` envelopes are ever issued
   (tests 7 & 11). No Tally write path exists in this module.

## Deliverables

| Artifact | Location |
|---|---|
| Code packet | `backend/src/tallyIntegration/` + models + controller + routes |
| Tests | `backend/tests/tallyConnector.test.js` (14 tests) |
| Demo runner | `backend/scripts/tally-connect-demo.js` |
| API | `backend/src/routes/tallyConnector.routes.js` (`/api/v1/tally-connect`) |
| Env config | `backend/.env.example` (`TALLY_*`, `TALLY_SETU_*`) |

## Screenshots still required (once live gateway is available)

1. Connector config with credentials masked (`GET /config`)
2. Retrieved Tally data (parties / outstanding / vouchers)
3. ARTHA view of the normalized snapshot
4. SETU receiving the canonical record
5. Final demo flow output (MITRA-readable dealer summary)
6. Error / read-only behaviour (e.g. attempted write rejected)

## How a fresh developer reproduces

```bash
cd backend
cp .env.example .env            # set TALLY_ENABLED=true + gateway details from Raj
npm test -- tests/tallyConnector.test.js --forceExit
node scripts/tally-connect-demo.js --party "<Dealer>" --setu
npm run dev                     # API at /api/v1/tally-connect
```

## Known pending items

- Tally gateway `192.168.0.72:9000` unreachable from the dev machine — open
  inbound TCP 9000 in Windows Firewall on the Tally machine and run ARTHA on the
  same LAN; verify with `node scripts/verify-tally-gateway.js` (blocker).
- Company name + auth + sample response confirmation (the verify script lists
  companies automatically once reachable).
- GST/TDS dedicated report envelopes (stub).
- Confirm whether the ARTHA SETU pipeline (`SETU_ENABLED=true`) or the direct
  `TALLY_SETU_ENDPOINT` is the canonical SETU path for the demo.
- A text description of the Bright Connection Tally dealer/outstanding screens
  (the model cannot view images; the About-screen details are already captured).

## Non-goals (guarded)

- No writes/updates/deletes to Tally.
- No client-specific hardcoding in ARTHA platform core.
- MITRA does not calculate — it presents the `mitraReadable` summary only.