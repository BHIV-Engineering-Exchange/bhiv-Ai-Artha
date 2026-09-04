# api_samples — Bright Connection Tally connector

Base URL: `http://localhost:5000/api/v1/tally-connect`
Auth: Bearer token from `POST /api/v1/auth/login`.

Index:
1. `01_config.md` — GET /config (secrets masked)
2. `02_health.md` — GET /health (gateway ping)
3. `03_sync.md` — POST /sync
4. `04_parties.md` — GET /parties
5. `05_dealer_summary.md` — GET /dealer/:partyName
6. `06_dealer_setu.md` — POST /dealer/:partyName/setu
7. `07_mdu_export.md` — GET /setu/mdu-export
8. `08_readonly_proof.md` — GET /readonly-proof
9. `09_sync_now_status.md` — POST /sync/now, GET /sync/status (auto-sync)

Samples 1, 3, 5, 6 reflect real captured run output (mock gateway, `runtime_logs/demo.log`).
Once the live gateway is reachable the response shapes are identical — only values change.
