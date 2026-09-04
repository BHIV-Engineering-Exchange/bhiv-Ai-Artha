# GET /api/v1/tally-connect/health

Pings the gateway and lists the companies available to the configured tenant.

```json
{
  "success": true,
  "data": {
    "ok": true,
    "protocol": "http",
    "host": "127.0.0.1",
    "port": 9000,
    "company": "Bright Connection",
    "companies": ["Bright Connection", "Bright Connection Pvt Ltd"],
    "latencyMs": 24,
    "readOnly": true
  }
}
```

Failure shape (gateway down → 502):

```json
{
  "success": false,
  "error": "TALLY_UNAVAILABLE: connect ECONNREFUSED 192.168.0.72:9000",
  "code": "TALLY_UNAVAILABLE"
}
```
