# GET /api/v1/tally-connect/parties?company=Bright Connection

List of parties/ledgers persisted from Tally (screenshot #2 source).

```json
{
  "success": true,
  "data": [
    {
      "tenantId": "tenant_bright_connection_001",
      "company": "Bright Connection",
      "ledgerName": "Sunrise Distributors",
      "partyType": "Sundry Debtor",
      "closingBalance": 12500,
      "gstin": "07AAACB1234F1Z5",
      "creditLimit": 50000,
      "sourceKey": "Bright Connection|Sunrise Distributors",
      "sourceSystem": "tally",
      "sourceRef": "http://127.0.0.1:9000/requestId=ledger:Sunrise Distributors",
      "readOnly": true,
      "schemaVersion": "1.0.0",
      "fetchedAt": "2026-08-13T12:50:00.000Z"
    },
    {
      "tenantId": "tenant_bright_connection_001",
      "company": "Bright Connection",
      "ledgerName": "Mega Mart",
      "partyType": "Sundry Debtor",
      "closingBalance": 45200,
      "gstin": "07AAACB5678F1Z7",
      "creditLimit": 60000,
      "sourceKey": "Bright Connection|Mega Mart",
      "sourceSystem": "tally",
      "sourceRef": "http://127.0.0.1:9000/requestId=ledger:Mega Mart",
      "readOnly": true,
      "schemaVersion": "1.0.0",
      "fetchedAt": "2026-08-13T12:50:00.000Z"
    }
  ]
}
```