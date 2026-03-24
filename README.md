# BrigidVault Beacon

**Visibility before execution.**

Beacon is the application layer for BrigidVault on BSC testnet: indexing, vault status computation, public viewing, owner withdrawal controls, and notification delivery.

## Stable Release

- Current stable release: `V1.1.0`
- Previous stable release: `V1.0.0`
- Release note: `V1.1.0` promotes Beacon to a functioning installable PWA. It keeps the unified `vault-ui` app and adds browser push notifications, iPhone install guidance, public-first PWA onboarding, and a single device-notification setup path through the public vault viewer.

## Live Deployment

- Vault UI: `https://vault.brigidforge.com`
- Mirror UI: `https://beacon.brigidforge.com`
- Server: `104.131.19.70`
- Production branch: `main`
- Production repo on server: `/opt/brigidforge/repo`

## What Beacon Does

- Indexes official BrigidVault factory and vault events on BSC testnet
- Computes vault status, vesting availability, pending withdrawal phases, and activity history
- Serves a unified React app for:
  - public vault viewing at `/view/:vault`
  - owner controls at `/operator/:vault`
- Supports owner notification destinations:
  - Telegram
  - Discord webhook
  - generic webhook
- Supports public email subscriptions with:
  - confirmation flow
  - secure manage links
  - unsubscribe flow
  - actionable withdrawal request alerts after the cancellation window closes
- Supports browser push notifications through the public vault viewer and installed PWA flow
- Ships as a functioning installable PWA on `vault.brigidforge.com`
- Deploys automatically on `git push origin main`

## Repository Layout

- `apps/api` – Fastify API for vault metadata, status, events, proofs, public email flows, and owner session flows
- `apps/vault-ui` – active Vite/React frontend for both public viewer and owner/operator flows
- `apps/worker` – indexer and notification dispatcher
- `apps/viewer` – legacy compatibility app, not the active frontend
- `packages/shared-types` – normalized event and API contract types
- `packages/contracts-abi` – BrigidVault and factory ABIs
- `packages/status-engine` – vault state computation
- `packages/beacon-theme` – shared UI theme
- `prisma` – PostgreSQL schema
- `ops` – nginx and systemd definitions
- `scripts` – deploy and local runtime helpers

## Current Product Surface

The active app is `apps/vault-ui`.

Important routes:

- `/`
- `/view`
- `/view/:vault`
- `/operator`
- `/operator/:vault`

Notable locked-in functionality in `V1.1.0`:

- unified public and operator UI
- owner wallet claim flow
- withdrawal request, cancel, delay, execute, and expiry handling
- inline mobile WalletConnect signing assist with delayed wallet handoff
- Telegram destination linking from the owner panel
- public email subscription confirmation, resend, manage, and unsubscribe flows
- withdrawal request notifications dispatched at the start of the delay phase
- branded email templates with non-reply disclaimer
- installable PWA shell with manifest, service worker, and iPhone home-screen support
- public browser push notifications with first-run PWA onboarding
- consolidated device-level app notification setup through the public vault viewer

## Chain Facts

- Chain: BSC testnet
- Chain ID: `97`
- Factory: `0xFc946E68886841B20c33b4449578c4cC35De5165`
- Start block: `95886539`
- Validation vault: `0x813bd049593844d8350b055c5b08d713fcfa4d3f`

## Local Development

```bash
npm install
npm run dev:up
npm run dev -w @brigid/vault-ui
```

Useful commands:

- `npm run typecheck`
- `npm run ci`
- `npm run dev:status`
- `npm run dev:down`

Recommended local database:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/beacon_bsc_testnet
```

## Deployment

Production is a single-branch workflow:

```bash
git push origin main
```

That push triggers the server-side deploy hook, which:

- updates `/opt/brigidforge/repo`
- installs canonical systemd units from `ops/systemd`
- builds `apps/vault-ui`
- publishes the UI to `/var/www/vault`
- restarts `beacon-api.service`
- restarts `beacon-worker.service`
- runs health checks

## Docs

- [docs/DEPLOY.md](./docs/DEPLOY.md)
- [docs/development-log.md](./docs/development-log.md)
- [docs/BEACON_MVP_SPEC.md](./docs/BEACON_MVP_SPEC.md)
