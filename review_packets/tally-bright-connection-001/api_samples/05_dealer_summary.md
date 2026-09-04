# GET /api/v1/tally-connect/dealer/Sunrise Distributors

Dealer context view (screenshot #3 + demo flow #5 source). Matches `runtime_logs/demo.log`.

```json
{
  "success": true,
  "data": {
    "tenantId": "tenant_bright_connection_001",
    "company": "Bright Connection",
    "partyName": "Sunrise Distributors",
    "partyType": "Sundry Debtor",
    "gstin": "07AAACB1234F1Z5",
    "creditLimit": 50000,
    "outstanding": { "total": 35000, "bills": 2, "overdue": 35000, "overdueBills": 2 },
    "lastBilling": { "number": "INV-1001", "date": "2025-02-04", "amount": 25000 },
    "lastPayment": { "number": "RCV-0411", "date": "2025-01-11", "amount": 10000 },
    "sourceSystem": "tally",
    "readOnly": true,
    "mitraReadable": "DEALER: Sunrise Distributors\nACCOUNT STATUS: OVERDUE_BALANCE\nOUTSTANDING: 35000.00 INR (2 bills)\nOVERDUE: 35000.00 INR (2 bills)\nLAST BILLING: #INV-1001 on 2025-02-04 for 25000.00 INR\nLAST PAYMENT: #RCV-0411 on 2025-01-11 for 10000.00 INR\nGSTIN: 07AAACB1234F1Z5 | CREDIT LIMIT: 50000.00 INR"
  }
}
```