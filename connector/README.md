# ARTHA Tally Connector

Secure bridge between the **local Bright Connection Tally** and the **deployed cloud ARTHA**.

```
Local Tally (127.0.0.1:9000)
    ↓ read-only XML fetch (Export Data envelopes only)
Connector Agent (runs on the Tally PC with internet)
    ↓ HTTPS + HMAC-SHA256 signed payload + API key
Cloud ARTHA (https://artha.blackholeinfiverse.com)
    ↓ validates signature, upserts into MongoDB
ARTHA shows real Bright Connection data
```

## Security

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| Transport | TLS (HTTPS) | Encrypts data in transit |
| Authentication | API key (`X-API-Key`) | Proves connector identity |
| Integrity | HMAC-SHA256 (`X-Signature`) | Detects tampering |
| Content hash | SHA-256 (`X-Content-Hash`) | Verifies body matches signature |
| Idempotency | Per-record keys | Prevents replay/duplicates |
| Read-only | `Export Data` envelopes only | No writes to Tally |

## Setup (Tally LAN machine)

### Prerequisites
- Node.js 18+ installed
- Network access to Tally (`127.0.0.1:9000`)
- Internet access to cloud ARTHA (`artha.blackholeinfiverse.com`)

### Install

```bash
# Copy the connector/ folder to the Tally LAN machine, then:
cd connector
npm install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your values:
#   TALLY_HOST=127.0.0.1
#   TALLY_COMPANY=Bright Connection
#   CLOUD_URL=https://artha.blackholeinfiverse.com
#   CLOUD_API_KEY=<ask ARTHA admin>
#   CLOUD_HMAC_SECRET=<ask ARTHA admin>
```

### Run

```bash
# Continuous mode (syncs every 15 minutes):
npm start

# Single sync then exit:
npm run once

# Check configuration:
node agent.js --status
```

## Cloud-side Configuration

The cloud ARTHA needs these env vars set to the **same values** as the connector:

```
TALLY_CONNECTOR_API_KEY=<same as connector's CLOUD_API_KEY>
TALLY_CONNECTOR_HMAC_SECRET=<same as connector's CLOUD_HMAC_SECRET>
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/tally-connect/ingest` | HMAC + API key | Receive MDU records from connector |
| `GET` | `/api/v1/tally-connect/ingest/status` | None | Last sync runs |

## Files

| File | Purpose |
|------|---------|
| `agent.js` | Main entry point (scheduler + graceful shutdown) |
| `config.js` | Environment reader with validation |
| `tallyClient.js` | Read-only Tally XML HTTP client |
| `tallyParser.js` | Tally XML → JS object parser |
| `normalizer.js` | JS objects → MDU records |
| `cloudClient.js` | HTTPS client with HMAC signing |
| `.env.example` | Configuration template |
