# POST /api/v1/tally-connect/dealer/Sunrise Distributors/setu

Dispatches the dealer summary to SETU (screenshot #4 source). Matches
`runtime_logs/demo.log` — direct path ACCEPTED; ARTHA signal path blocked by the
pre-existing `SetuDispatch` snake_case→camelCase field bug (task: Tally → ARTHA → SETU).

```json
{
  "success": true,
  "data": {
    "summary": {
      "tenantId": "tenant_bright_connection_001",
      "company": "Bright Connection",
      "partyName": "Sunrise Distributors",
      "gstin": "07AAACB1234F1Z5",
      "outstanding": { "total": 35000, "bills": 2, "overdue": 35000, "overdueBills": 2 },
      "lastBilling": { "number": "INV-1001", "date": "2025-02-04", "amount": 25000 },
      "lastPayment": { "number": "RCV-0411", "date": "2025-01-11", "amount": 10000 },
      "mitraReadable": "DEALER: Sunrise Distributors\nACCOUNT STATUS: OVERDUE_BALANCE\n..."
    },
    "outcomes": {
      "direct": {
        "dispatched": true,
        "attempts": 1,
        "statusCode": 200,
        "response": "{\n  \"status\": \"ACCEPTED\",\n  \"request_id\": \"86ec0368-a8f6-4766-bbb2-aaa1ece96fa7\",\n  \"setu_reference\": \"SETU-1786605672990-07a1b2c9\",\n  \"signal_id\": \"dealer:Sunrise Distributors\",\n  \"trace_id\": \"tally-demo-1786605672975\",\n  \"filing_type\": \"DEALER_SUMMARY\",\n  \"gateway\": \"MOCK_SETU_TALLY_v1.0\",\n  \"timestamp\": \"2026-08-13T07:21:12.989Z\"\n}",
        "idempotencyKey": "tenant_bright_connection_001:dealer_summary:Sunrise Distributors",
        "signature": "26db34852b55ee4f5ba552c27db9ea15de97fa0413edac32fd9f3694dd5b5978"
      },
      "artha": {
        "error": "SetuDispatch validation failed: dispatchType: Path `dispatchType` is required., traceId: Path `traceId` is required., signalId: Path `signalId` is required."
      }
    }
  }
}
```

Blocker note: `signalEngine.service.js` writes snake_case
`signal_id`/`trace_id`/`dispatch_type`, but `models/SetuDispatch.js` declares
camelCase `signalId`/`traceId`/`dispatchType` → ValidationError. Fix is additive
(single-file) and awaits owner permission since it is ARTHA core.