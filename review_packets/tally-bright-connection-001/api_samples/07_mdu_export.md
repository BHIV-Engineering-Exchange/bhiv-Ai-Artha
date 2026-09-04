# GET /api/v1/tally-connect/setu/mdu-export

Exports the canonical MDU records produced by the connector (SETU-ready contract).

```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "entity_type": "dealer_summary",
      "entity_id": "dealer:Sunrise Distributors",
      "tenant_id": "tenant_bright_connection_001",
      "source_connector": "tally",
      "read_only": true,
      "company": "Bright Connection",
      "canonical_data": {
        "partyName": "Sunrise Distributors",
        "outstanding": { "total": 35000, "bills": 2, "overdue": 35000 },
        "lastBilling": { "number": "INV-1001", "date": "2025-02-04", "amount": 25000 },
        "lastPayment": { "number": "RCV-0411", "date": "2025-01-11", "amount": 10000 }
      },
      "trace_id": "tally-dealer-1786605672975",
      "schema_version": "1.0.0",
      "idempotency_key": "tenant_bright_connection_001:dealer_summary:Sunrise Distributors"
    }
  ]
}
```
