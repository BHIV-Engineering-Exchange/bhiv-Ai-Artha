# POST /api/v1/tally-connect/sync/now

Triggers an immediate auto-sync (same path as the scheduler, respects the
run-lock so overlapping runs are skipped).

```json
// Request
{ "company": "Bright Connection" }

// Response (run completed)
{
  "success": true,
  "data": {
    "runId": "TLYRN-...",
    "tenantId": "tenant_bright_connection_001",
    "company": "Bright Connection",
    "status": "completed",
    "entityStats": { "parties": 3, "outstanding": 2, "vouchers": 5 },
    "mduCount": 10,
    "errors": [],
    "readOnly": true,
    "traceId": "tally-sync-1786600000000",
    "mduRecords": []
  }
}

// Response (already running — skipped, no overlap)
{ "success": true, "data": { "skipped": true, "reason": "sync already running" } }
```

# GET /api/v1/tally-connect/sync/status

Scheduler state — what the "Tally Connect" page's status card shows.

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "intervalMinutes": 15,
    "running": false,
    "lastRun": {
      "at": "2026-08-13T13:04:00.000Z",
      "status": "completed",
      "entityStats": { "parties": 3, "outstanding": 2, "vouchers": 5 },
      "mduCount": 10,
      "window": { "fromDate": "2026-07-14", "toDate": "2026-08-13", "incremental": true }
    },
    "nextSyncAt": "2026-08-13T13:19:00.000Z"
  }
}
```

Incremental note: `window.incremental: true` means vouchers are fetched from the
last successful run forward; parties + outstanding are always refreshed to
current Tally state. New data added in Tally therefore appears in ARTHA within
`intervalMinutes` without any manual step.
