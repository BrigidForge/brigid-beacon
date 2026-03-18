# BrigidVault Beacon System

**Visibility before execution.**

Monitoring, indexing, alerting, and public visibility layer for official BrigidVault contracts.

## Directory And Deployment Map

- Local repo path: `/home/dev/brigid-forge/brigid-beacon`
- Forgejo remote: `git@git.brigidforge.com:dev/brigid-beacon.git`
- Primary server clone: `/opt/brigidforge/repo`
- Auto deploy branches:
  - `dev` -> `/var/www/staging-beacon`
  - `main` -> `/var/www/beacon`
- Forgejo hook path:
  - `/var/lib/forgejo/data/forgejo-repositories/dev/brigid-beacon.git/hooks/post-receive.d/brigid-deploy`
- Server deploy script:
  - `/root/update-brigid.sh`

Canonical hosted web roots:
- Operator panel -> `/var/www/beacon`
- Public panel -> `/var/www/panel`

Canonical hosted runtime units:
- `/etc/systemd/system/beacon-api.service`
- `/etc/systemd/system/beacon-worker.service`

Related website preview note:
- The public marketing site preview now publishes from the separate `brigid-site` repo to `/var/www/staging-site` on `dev`.

## Structure

- **apps/api** – Beacon API (Fastify); vault metadata, status, events, proof
- **apps/public-panel** – Public visitor panel (Vite + React + Tailwind); curated vault visibility and `/vault/:address`
- **apps/operator-panel** – Operator panel (Vite + React + Tailwind); wallet-based vault transactions plus Beacon notification setup
- **apps/viewer** – Legacy Beacon viewer kept for compatibility while the new split surfaces settle
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

Hosted deployment automation now lives in-repo:

- [scripts/deploy-hosted.sh](./scripts/deploy-hosted.sh) publishes operator and public panels to the canonical web roots
- [scripts/install-systemd.sh](./scripts/install-systemd.sh) installs the canonical systemd units from [ops/systemd](./ops/systemd)

On the server, `/root/update-brigid.sh` should simply call the repo script instead of maintaining its own divergent logic.

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
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
VITE_WALLETCONNECT_CDN_URL=https://esm.sh/@walletconnect/ethereum-provider@2.23.8
```

Operator mobile wallet note:

- Set `VITE_WALLETCONNECT_PROJECT_ID` to enable the `iPhone / WalletConnect` path in `apps/operator-panel`
- The WalletConnect provider is loaded on demand from `VITE_WALLETCONNECT_CDN_URL`, so it does not inflate the default operator bundle
- This keeps desktop injected wallets working while allowing QR or deep-link pairing for mobile users

Use [`./.env.example`](./.env.example) as the canonical env reference. For local split-host development, keep `VITE_API_BASE_URL` pointed at the API. For same-origin production deploys, prefer leaving it unset so the viewer uses relative `/api/...` paths and avoids CORS drift.

## Run

- **API:** `npm run dev -w @brigid/beacon-api` (port 3000)
- **Worker:** `npm run dev -w @brigid/beacon-worker`
- **Public panel:** `npm run dev -w @brigid/beacon-public-panel` (port 5174)
- **Operator panel:** `npm run dev -w @brigid/beacon-operator-panel` (port 5175)
- **Legacy viewer:** `npm run dev -w @brigid/beacon-viewer`
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

For a same-origin Beacon deployment behind one reverse proxy, prefer:

```bash
# viewer served from https://beacon.example.com
# API proxied on the same host under /api
ALLOWED_ORIGINS=
PUBLIC_APP_BASE_URL=https://beacon.example.com
```

For a split-host deployment, explicitly configure both:

```bash
VITE_API_BASE_URL=https://api.example.com
PUBLIC_APP_BASE_URL=https://beacon.example.com
ALLOWED_ORIGINS=https://beacon.example.com
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

## Operational Notes

- Beacon’s worker defends against shallow reorgs by rewinding the indexed head by `REORG_LOOKBACK_BLOCKS` before each replay pass. Keep that window aligned with the finality assumptions you are comfortable with for the target chain.
- Global Telegram/Discord/webhook fallback delivery is now opt-in through `ENABLE_GLOBAL_NOTIFICATION_FALLBACK=true`. By default, events with no matching subscriptions are marked dispatched and logged instead of retrying forever.

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
