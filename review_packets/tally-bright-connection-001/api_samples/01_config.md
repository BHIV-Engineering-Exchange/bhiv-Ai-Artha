# GET /api/v1/tally-connect/config

Returns connection config with credentials masked (screenshot #1 source).

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "protocol": "http",
    "host": "127.0.0.1",
    "port": 9000,
    "company": "Bright Connection",
    "username": "(none)",
    "passwordConfigured": false,
    "timeoutMs": 15000,
    "baseUrl": "http://127.0.0.1:9000"
  }
}
```

Note: `password` is never exposed; only `passwordConfigured: true|false`.
Live gateway would show `host: "192.168.0.72"`.
