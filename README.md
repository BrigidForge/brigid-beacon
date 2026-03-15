# BrigidVault Beacon System

**Visibility before execution.**

Monitoring, indexing, alerting, and public visibility layer for official BrigidVault contracts.

## Structure

- **apps/api** – Beacon API (Fastify); vault metadata, status, events, proof
- **apps/viewer** – Public viewer (Vite + React + Tailwind); `/vault/:address`
- **apps/worker** – Indexer and notification jobs (Sprint 2 & 5)
- **packages/shared-types** – Event taxonomy, status state, API contracts
- **packages/contracts-abi** – BrigidVault & Factory ABI for indexer
- **packages/status-engine** – Vault state computation
- **prisma** – PostgreSQL schema (vaults, events, snapshots)
- **docs** – [BEACON_MVP_SPEC.md](./docs/BEACON_MVP_SPEC.md)

## Current State

Beacon is now validated against a live **BSC testnet** deployment.

- Public Beacon URL: `https://beacon.brigidforge.com`
- Canonical factory: `0xFc946E68886841B20c33b4449578c4cC35De5165`
- Factory start block: `95886539`
- First indexed validation vault:
  `0x813bd049593844d8350b055c5b08d713fcfa4d3f`

The detailed runbook lives in [docs/LOCAL_DEMO.md](./docs/LOCAL_DEMO.md), and the AI handoff/context file lives in [docs/AI_HANDOFF.md](./docs/AI_HANDOFF.md).
The deployment playbook lives in [docs/DEPLOY.md](./docs/DEPLOY.md).

## Setup

```bash
# From the brigid-beacon repo root
npm install

# Prisma
# Use the BSC testnet parity profile from .env.example, then:
npm run db:generate
npm run db:push   # or db:migrate
```

Recommended local parity env:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/beacon_bsc_testnet
CHAIN_ID=97
RPC_URL=https://bsc-testnet.nodereal.io/v1/<your-key>
FACTORY_ADDRESS=0xFc946E68886841B20c33b4449578c4cC35De5165
START_BLOCK=95886539
POLL_INTERVAL_MS=60000
BLOCK_CHUNK_SIZE=5000
CONFIRMATIONS=0
VITE_API_BASE_URL=http://localhost:3000
```

## Run

- **API:** `npm run dev -w @brigid/beacon-api` (port 3000)
- **Worker:** `npm run dev -w @brigid/beacon-worker`
- **Viewer:** `npm run dev -w @brigid/beacon-viewer` (port 5174)
- **Managed bring-up:** `npm run dev:up`
- **Managed shutdown:** `npm run dev:down`
- **Managed status:** `npm run dev:status`

## Server Readiness

For server testing, Beacon needs:

- a PostgreSQL database reachable from `DATABASE_URL`
- an RPC endpoint for the target chain in `RPC_URL`
- the official factory address in `FACTORY_ADDRESS`
- a public HTTPS URL for the API so Telegram can reach the webhook

Recommended server env additions for the managed Telegram flow:

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=brigidbeaconbot
TELEGRAM_LINK_SECRET=choose-a-long-random-secret
TELEGRAM_WEBHOOK_SECRET=choose-another-long-random-secret
VITE_API_BASE_URL=https://your-api-host
```

If you use the managed Telegram connect flow, Beacon owns the bot token and users no longer need to enter a Telegram chat ID or bot token in the UI.

### Telegram webhook

After the API is publicly reachable over HTTPS, point the bot webhook at Beacon:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-api-host/api/v1/integrations/telegram/webhook",
    "secret_token": "<YOUR_TELEGRAM_WEBHOOK_SECRET>"
  }'
```

Verify it:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

See [docs/LOCAL_DEMO.md](./docs/LOCAL_DEMO.md) for the canonical runbook.

## Primary Validation Flow

- Start the local stack with `npm run dev:up`
- Open the local vault page for the indexed BSC testnet validation vault
- Connect the indexed owner wallet
- Claim the vault
- Connect Telegram or add a webhook destination
- Subscribe to one or more event kinds
- Trigger a fresh event and confirm delivery

## Validated Demo Flow

This repo has now been validated end to end with:

- official factory discovery and registry reconciliation
- live vault timeline and status rendering
- owner claim flow from an injected wallet
- Telegram destination setup
- Telegram alert delivery for fresh vault events

See [docs/LOCAL_DEMO.md](./docs/LOCAL_DEMO.md) for exact runtime and deployment details.

## Sprints

1. ✅ Lock spec, schema, API contracts, scaffold
2. Local blockchain indexer
3. Database + API implementation
4. Public viewer MVP
5. Notification engine
6. Production hardening

See [docs/BEACON_MVP_SPEC.md](./docs/BEACON_MVP_SPEC.md) for full specification.
