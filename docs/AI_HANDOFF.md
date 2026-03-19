# Beacon AI Handoff

This file is the compact reference for future AI/code-assistant sessions working in `brigid-beacon/`.

Read this first before making assumptions about architecture, chain configuration, or which docs are canonical.

## Repo Role

`brigid-beacon/` is the Beacon application layer for BrigidVault:

- `apps/api` – Fastify API
- `apps/worker` – indexer + notification dispatcher
- `apps/public-panel` – public React visitor panel
- `apps/operator-panel` – operator React control panel
- `apps/viewer` – legacy Beacon viewer still present for compatibility
- `prisma/` – database schema

Beacon tracks official vaults deployed through the Brigid factory and provides:

- normalized event indexing
- status computation
- deployment proof
- public vault pages
- owner claim flow
- notification destinations, subscriptions, and delivery history

## Canonical Product State

- Current chain focus: `BSC testnet`
- Current chain ID: `97`
- Current canonical factory: `0xFc946E68886841B20c33b4449578c4cC35De5165`
- Current start block: `95886539`
- First validation vault: `0x813bd049593844d8350b055c5b08d713fcfa4d3f`
- Validation token: `0x6f0F380C1cC5fFDb1a5eC9e5dF937aAc6BB49C62`

Public product shape:
- Beacon has a dedicated public host
- the API is served under the same host via `/api/...`
- the older vault/operator panel remains a separate surface
- same-origin viewer + API is the preferred deployment default; only set `VITE_API_BASE_URL` when the API is intentionally hosted elsewhere

## Current Local Parity Profile

Local development should mirror hosted Beacon behavior using a separate local database.

Expected local env shape:

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

Use `./.env.example` as the canonical env list. This file only shows the minimum local parity profile.

## Important Behavior Fixes Already In Code

These are intentional and should not be “cleaned up” without understanding why they were added.

### Worker

- `apps/worker/src/config.ts`
  - supports `START_BLOCK`
  - supports `REORG_LOOKBACK_BLOCKS`
- `apps/worker/src/index.ts`
  - disables Ethers JSON-RPC batching via `batchMaxCount: 1`
- `apps/worker/src/indexer.ts`
  - uses start-block-aware behavior
  - rewinds the indexed head by `reorgLookbackBlocks` before replaying to tolerate shallow reorgs
- `apps/worker/src/factory-discovery.ts`
  - supports reconciliation/discovery with `fromBlock = 0`

### API

- `apps/api/src/app.ts`
  - now registers route modules plus centralized CORS, rate limiting, helmet, and stable error handling
  - vault address normalization tolerates lowercase input and lowercases as fallback when checksum parsing would otherwise reject a valid address

### Public Panel

- `apps/public-panel/src/pages/VaultPage.tsx`
  - vault page performs a quiet background refresh every 60 seconds

### Operator Panel

- `apps/operator-panel/src/pages/VaultPage.tsx`
  - vault page keeps Beacon visibility at the top, then splits operator actions into `Transactions` and `Beacon Notifications` tabs
- `apps/operator-panel/src/components/TransactionsTab.tsx`
  - preserves the owner request / cancel / execute withdrawal flow using direct vault contract interactions

## Telegram

Beacon uses a managed Telegram onboarding flow now.

Users should not need to:

- find the bot manually
- inspect Telegram chat IDs
- paste bot tokens into the Beacon UI

Required envs:

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=brigidbeaconbot
TELEGRAM_LINK_SECRET=...
TELEGRAM_WEBHOOK_SECRET=...
```

Webhook route:

```text
/api/v1/integrations/telegram/webhook
```

## What Has Been Validated End To End

- dedicated Beacon public deployment
- factory deployment on BSC testnet
- indexing from the correct start block
- first test vault discovered through the factory
- API lookup for the indexed vault
- owner claim flow
- Telegram connection flow
- notification delivery
- separate legacy/operator panel pointing at the new vault and RPC

## Canon Docs

Prefer these docs when working:

- `README.md`
- `docs/LOCAL_DEMO.md`
- `docs/BEACON_MVP_SPEC.md`
- `docs/BEACON_OWNER_CLAIMS_AND_SUBSCRIPTIONS_SPEC.md`
- `docs/DEPLOY.md`

## Working Rules For Future Sessions

- Treat BSC testnet as the current canonical environment unless the user explicitly changes it.
- Treat Beacon as a separate active project, not an Anvil-only demo.
- Do not reintroduce manual Telegram chat ID setup as the main UX.
- Global Telegram/Discord/webhook fallback delivery is intentionally opt-in through `ENABLE_GLOBAL_NOTIFICATION_FALLBACK=true`.
- Be careful with secrets. Do not print or persist live tokens unless the user explicitly requests it and understands the risk.
