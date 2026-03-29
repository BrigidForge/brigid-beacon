# Beacon Runbook

This document is the canonical operating guide for the current Beacon setup.

It covers:

- the live BSC testnet deployment
- the local parity profile used for development
- Telegram onboarding and webhook setup
- the first indexed validation vault

## Current Canon

Beacon is currently validated against **BSC testnet**, not the older Anvil-only demo profile.

### Live deployment

- Public Beacon URL: `https://beacon.brigidforge.com`
- Public vault route:
  `https://beacon.brigidforge.com/vault/0x813bd049593844d8350b055c5b08d713fcfa4d3f`
- Public vault API route:
  `https://beacon.brigidforge.com/api/v1/vaults/0x813bd049593844d8350b055c5b08d713fcfa4d3f`
- Legacy vault operator panel:
  `https://vault.brigidforge.com`

### Live chain configuration

- Chain: `BSC testnet`
- Chain ID: `97`
- Canonical factory:
  `0x60FbD281f54b0E11FFc79F4A5b27874436383448`
- Factory deployment start block:
  `98470109`

### First indexed validation vault

- Vault:
  `0x813bd049593844d8350b055c5b08d713fcfa4d3f`
- Token:
  `0x6f0F380C1cC5fFDb1a5eC9e5dF937aAc6BB49C62`
- Deployed at block:
  `95895854`

This vault was created through the current Beacon-compatible permissioned factory and is the reference object for end-to-end validation.

## Local Parity Profile

The recommended local setup is now **parity with the live BSC testnet environment**, while keeping a separate local PostgreSQL database.

### Local env shape

Use values equivalent to:

```bash
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/beacon_bsc_testnet
CHAIN_ID=97
RPC_URL=https://bsc-testnet.nodereal.io/v1/<your-key>
FACTORY_ADDRESS=0x60FbD281f54b0E11FFc79F4A5b27874436383448
START_BLOCK=98470109
POLL_INTERVAL_MS=60000
BLOCK_CHUNK_SIZE=5000
CONFIRMATIONS=0
EXPLORER_BASE_URL=https://testnet.bscscan.com
VITE_API_BASE_URL=http://localhost:3000
```

Notes:

- `DATABASE_URL` should remain local and separate from the server database.
- `RPC_URL` should use a rate-limit-tolerant BSC testnet provider.
- `START_BLOCK` is important. It prevents Beacon from scanning from genesis.

## Local Bring-Up

### 1. Database

Make sure PostgreSQL is running locally, then:

```bash
createdb -h 127.0.0.1 -U postgres beacon_bsc_testnet
# from the brigid-beacon repo root
npm run db:generate
npm run db:push
```

### 2. Beacon services

From `brigid-beacon/`:

```bash
npm run dev:up
```

Or run each process separately:

```bash
npm run dev -w @brigid/beacon-api
```

```bash
npm run dev -w @brigid/beacon-worker
```

```bash
npm run dev -w @brigid/beacon-viewer
```

Check status:

```bash
npm run dev:status
```

Shut everything down cleanly:

```bash
npm run dev:down
```

### 3. Local URLs

- Local home: `http://127.0.0.1:5174/`
- Local vault page:
  `http://127.0.0.1:5174/vault/0x813bd049593844d8350b055c5b08d713fcfa4d3f`
- Local API metadata route:
  `http://127.0.0.1:3000/api/v1/vaults/0x813bd049593844d8350b055c5b08d713fcfa4d3f`

## Managed Telegram Flow

Beacon now owns the Telegram bot integration flow. Users no longer need to copy bot tokens or chat IDs into the UI.

### Required env

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=brigidbeaconbot
TELEGRAM_LINK_SECRET=choose-a-long-random-secret
TELEGRAM_WEBHOOK_SECRET=choose-another-long-random-secret
```

### Webhook setup

Point the Telegram bot webhook at Beacon:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://beacon.brigidforge.com/api/v1/integrations/telegram/webhook",
    "secret_token": "<YOUR_TELEGRAM_WEBHOOK_SECRET>"
  }'
```

Verify:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

### Owner UX

1. Open a vault page.
2. Connect the indexed owner wallet.
3. Claim the vault.
4. Choose `Telegram`.
5. Click `Connect Telegram`.
6. Telegram opens the Beacon bot with a signed deep link.
7. Press `Start`.
8. Return to Beacon.
9. The Telegram destination should appear automatically.

## What Has Been Validated

Beacon has been validated end to end with:

- official factory discovery through the canonical registry
- start-block-aware indexing on BSC testnet
- lowercase-tolerant vault API lookups
- public vault viewer rendering
- owner claim flow
- managed Telegram connection flow
- live notification delivery
- minute-based vault page auto-refresh

## Legacy Local Demo

Older Anvil-based demo material existed before the BSC testnet deployment.

That flow is no longer the canonical reference for Beacon behavior. If an Anvil-only demo is needed later, it should live in a separate legacy document rather than drive the main README and operator runbook.
