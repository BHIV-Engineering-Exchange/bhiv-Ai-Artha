# POST /api/v1/tally-connect/sync

Request:

```json
{
  "company": "Bright Connection",
  "fromDate": "2024-01-01",
  "toDate": "2026-08-13"
}
```

Response (all read-only):

```json
{
  "success": true,
  "data": {
    "tenantId": "tenant_bright_connection_001",
    "company": "Bright Connection",
    "startedAt": "2026-08-13T12:50:00.000Z",
    "endedAt": "2026-08-13T12:50:02.000Z",
    "durationMs": 2130,
    "readOnly": true,
    "counts": { "parties": 3, "outstanding": 2, "vouchers": 2 }
  }
}
```

The sync run is idempotent: each record is upserted on
`tenantId + company + entityType + sourceKey`. Re-running produces no duplicates.
