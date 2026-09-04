# GET /api/v1/tally-connect/readonly-proof

Static proof that the connector can only ever issue Export (read) envelopes
(screenshot #6 source).

```json
{
  "success": true,
  "data": {
    "connector": {
      "name": "tally",
      "version": "1.0.0",
      "readOnly": true,
      "entities": ["company", "party", "outstanding", "voucher", "gst", "tds"]
    },
    "readOnly": true,
    "guard": "assertReadOnlyEnvelope() rejects any non-Export TALLYREQUEST before it reaches the wire",
    "allowedRequests": ["Export Data", "Export"],
    "evidence": "See tests: unauthorized-write-attempt & read-only-proof"
  }
}
```
