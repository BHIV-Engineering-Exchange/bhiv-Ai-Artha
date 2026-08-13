# Integration Contract — Tally → ARTHA → SETU

Version: 1.0.0  ·  Status: scaffold ready, awaiting live Tally gateway from Raj

## 1. Canonical financial contract (MDU-style)

Every record the connector emits mirrors the Setu-Aman **MDURecord** shape so the
same payload can be ingested by the Python framework (MasterDB / InsightFlow /
Replay) or dispatched to SETU.

```json
{
  "entity_type": "party | outstanding | voucher | company | dealer_summary",
  "entity_id": "tally:<entity_type>:<uuid>",
  "tenant_id": "tenant_bright_connection_001",
  "source_connector": "tally",
  "source_connector_version": "1.0.0",
  "read_only": true,
  "company": "Bright Connection",
  "canonical_data": { "...": "entity-specific fields (see §2)" },
  "trace_id": "tally-sync-<epoch>",
  "schema_version": "1.0.0",
  "raw_ref": "tally:<entity>:<company>:<ts>:<key>",
  "ingested_at": "<ISO8601>",
  "idempotency_key": "<tenant>:<entity>:<uuid>",
  "integrity_hash": "sha256(…)",
  "tags": [],
  "metadata": { "connector": "tally", "read_only": true }
}
```

`integrity_hash` = SHA-256 over `{entity_type, canonical_data, trace_id}` so the
Setu-Aman ReplayEngine/InsightFlow can verify records unchanged.

## 2. Entity schemas

| entity_type | canonical_data fields |
|---|---|
| `party` | party_id, party_name, ledger_name, group, party_type (`SUNDRY_DEBTOR`/`SUNDRY_CREDITOR`/`OTHER`), opening_balance, closing_balance, credit_limit, gstin, pan, address, contact, currency |
| `outstanding` | party_name, ledger_name, bill_no, bill_date, due_date, days_overdue, amount, received, balance, bill_type |
| `voucher` | voucher_type, voucher_number, date, party_name, amount, narration, reference, entries[], gst_details{gstin, taxable_value, cgst, sgst, igst} |
| `company` | name, master_id |
| `dealer_summary` | dealer, account, outstanding{total,bills,details}, last_billing, last_payment, account_status, setu_insight, mitra_readable |

## 3. Dealer demo flow

`dealer → outstanding → last billing → payments → SETU insight → MITRA summary`

1. `GET /api/v1/tally-connect/dealer/:partyName` computes, in ARTHA:
   outstanding total, overdue amount/bills, last sales voucher, last receipt.
2. `POST /api/v1/tally-connect/dealer/:partyName/setu` (or the demo script with
   `--setu`) dispatches the `dealer_summary` record to SETU.
3. The `mitraReadable` string is exactly what MITRA presents — MITRA never
   recomputes figures.

## 4. SETU delivery paths

- **Direct (real endpoint):** `POST TALLY_SETU_ENDPOINT` with
  `X-Idempotency-Key` + `X-Setu-Signature` (HMAC-SHA256 of the body) headers,
  retry with backoff (`TALLY_SETU_MAX_RETRIES`), evidence recorded on the
  `TallySyncRun` row.
- **ARTHA pipeline:** when `SETU_ENABLED=true`, the same record is emitted via
  `signalEngine.emitSignal()` → `setu.pipeline` → Sampada envelope →
  `SETU_BASE_URL` (ARTHA's existing path).
- **Setu-Aman framework:** `GET /api/v1/tally-connect/setu/mdu-export` returns
  the canonical MDU JSON for ingestion into the Python runtime.

## 4b. Data freshness (new Tally data → ARTHA automatically)

`tallySyncScheduler.service.js` runs on `TALLY_SYNC_INTERVAL_MINUTES` (default 15):

- Vouchers: incremental window `[last successful sync date, today]` — new
  invoices/receipts/payments added in Tally are fetched on the next tick.
- Parties + outstanding: full current-state refresh every tick (new dealers and
  changed balances appear).
- First run (no history) backfills `TALLY_SYNC_DEFAULT_FROM_DAYS` (default 30).
- Idempotent: every record upserts on `tenantId + company + entityType +
  sourceKey`; re-runs never duplicate.
- Manual trigger: `POST /api/v1/tally-connect/sync/now` (respects the run lock).
- Scheduler state: `GET /api/v1/tally-connect/sync/status`.
- Frontend `/tally` auto-refreshes every 30s and shows sync status.

## 5. Read-only enforcement

The connector can only issue `Export Data` envelopes. Guard:
`assertReadOnlyEnvelope(xml)` in `tallyXmlClient.js`. TALLYREQUEST values other
than `Export Data` / `Export` throw `READ_ONLY_VIOLATION` before any network
write. Verified by tests `unauthorized-write-attempt` and `read-only-proof`.

## 6. Error contract

| Error | code | when |
|---|---|---|
| TallyUnavailableError | `CONNECTOR_DISABLED` / `TIMEOUT` / `UNREACHABLE` | gateway off / not configured |
| TallyAuthError | `AUTH_FAILED` | HTTP 401/403 from gateway |
| TallyProtocolError | `HTTP_ERROR` / `EMPTY_RESPONSE` | bad status / empty payload |
| TallyReadOnlyViolationError | `READ_ONLY_VIOLATION` | non-export envelope attempted |

## 7. Tenant / multi-client rule

Tenant is `tenant_bright_connection_001` by default (env `TALLY_TENANT_ID`).
No client-specific logic is hardcoded in ARTHA core — the connector is a
separate additive module, so future clients are new connector instances, not
changes to ARTHA.

## 8. Known caveats

- `setu.pipeline` Sampada path requires `SETU_ENABLED=true` + `SETU_BASE_URL` +
  `SETU_API_KEY`. The existing `SetuDispatch.create()` camelCase/snake_case
  mismatch is pre-existing in ARTHA and only affects its persist step; the
  HTTP dispatch path is independent.
- GST/TDS dedicated report envelopes (`gst`, `tds` entity types) are stubbed
  pending Raj's confirmation of available Tally reports.