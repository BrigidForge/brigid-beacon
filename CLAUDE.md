# CLAUDE.md — Beacon AI Agent Context

Read this file first. It tells you what the project is, what is active vs retired,
how the deploy pipeline works, and what to watch out for.

---

## Project Overview

`brigid-beacon` is the full-stack application layer for **BrigidVault** — a smart-contract
vesting vault system on BSC testnet. Beacon provides:

- on-chain event indexing and status computation
- a public vault viewer and operator control panel (unified in `apps/vault-ui`)
- Telegram / webhook notification delivery
- a Fastify API and background worker process

### Canonical live deployment

| Surface | Domain | Webroot |
|---|---|---|
| Vault UI (public + operator) | `vault.brigidforge.com` | `/var/www/vault` |
| Vault UI (also) | `beacon.brigidforge.com` | `/var/www/vault` (same) |
| Staging vault UI | `staging-vault.brigidforge.com` | `/var/www/staging-vault` |
| Staging API | `staging-beacon.brigidforge.com` | nginx proxy |
| Forgejo git host | `git.brigidforge.com` | Forgejo service |

Server IP: `104.131.19.70` (SSH as `root`)

---

## Monorepo Structure

```
apps/
  api/            Fastify API — vault metadata, status, events, proof endpoints
  vault-ui/       THE active React+Vite+Tailwind frontend (see below)
  viewer/         Legacy Beacon viewer — kept for compatibility, not actively developed
  worker/         Indexer + notification dispatcher (systemd service)
  operator-panel-old/   RETIRED — superseded by vault-ui. Do not touch.
  public-panel-old/     RETIRED — superseded by vault-ui. Do not touch.

packages/
  shared-types/   NormalizedEvent, VaultStatus, VaultMetadata, API contracts
  contracts-abi/  BrigidVault & Factory ABIs
  status-engine/  Vault state computation
  beacon-theme/   Shared Tailwind theme

scripts/
  deploy-hosted.sh      Canonical deploy script (builds vault-ui, publishes to VAULT_ROOT)
  install-systemd.sh    Installs systemd units from ops/systemd/
  update-brigid.sh      NOT in repo — lives at /root/update-brigid.sh on the server

ops/
  nginx/           nginx site configs for vault.brigidforge.com, staging-vault, etc.
  systemd/         beacon-api.service, beacon-worker.service

docs/
  DEPLOY.md        Deployment runbook
  AI_HANDOFF.md    Older AI context (may be stale — this file takes precedence)
  development-log.md  Engineering log

prisma/           PostgreSQL schema (vaults, events, snapshots, subscriptions)
```

---

## Active App: apps/vault-ui

`apps/vault-ui` is the **only** active React frontend. It is a single Vite+React+Tailwind
app that serves two distinct user flows through React Router:

| Route | Purpose |
|---|---|
| `/` | Landing — links to public viewer and operator panel |
| `/view` | Public vault viewer landing |
| `/view/:vault` | Public vault detail page |
| `/operator` | Wallet-based operator panel (vault list + workspace) |
| `/operator/:vault` | (handled client-side via OperatorVaultWorkspace) |

### Key source files

- `src/routes/Operator.tsx` — wallet connection UI, vault list, mounts OperatorVaultWorkspace
- `src/routes/Viewer.tsx` — public vault detail view
- `src/components/OperatorVaultWorkspace.tsx` — 4-tab vault interface (Status / Withdrawals / Activity / Notifications)
- `src/components/OperatorSessionProvider.tsx` — wallet session context (injected + WalletConnect)
- `src/components/TransactionsTab.tsx` — withdrawal request/cancel/execute lifecycle
- `src/components/CopyableAddress.tsx` — truncated address with copy-to-clipboard icon
- `src/lib/operatorVault.ts` — wallet connect/disconnect, tx helpers, openWalletForSigning()
- `src/lib/api.ts` — API client (fetchVaultBundle, fetchOperatorOwnedVaults, etc.)

### WalletConnect / iOS notes

- WalletConnect is enabled when `VITE_WALLETCONNECT_PROJECT_ID` is set
- On iOS, the user approves pairing in MetaMask; the page reloads when they return to Safari
- Fix: `'walletconnect'` is written to localStorage **before** `connect()` so the startup
  `useEffect` can silently re-attach to the existing WalletConnect session after reload
- For transaction signing on iOS: `openWalletForSigning(session)` must be called
  **synchronously before any `await`** inside each click handler so iOS Safari allows
  `window.open()` as a trusted gesture. This opens the wallet app so the user sees
  the pending tx approval.

### vault-ui env vars

```bash
VITE_API_BASE_URL=           # Leave unset for same-origin; set to API URL if split-host
VITE_WALLETCONNECT_PROJECT_ID=   # Required for WalletConnect / iPhone support
VITE_OPERATOR_CHAIN_ID=97    # Optional chain override (default 97 = BSC testnet)
VITE_OPERATOR_RPC_URL=       # Optional RPC override
```

Real `.env.staging` and `.env.production` files live on the server at
`/opt/brigidforge/repo/apps/vault-ui/` and are NOT committed (covered by `.gitignore`).
The committed reference is `apps/vault-ui/.env.example`.

---

## Git Workflow

### Branches

| Branch | Purpose |
|---|---|
| `main` | Production — auto-deploys to `vault.brigidforge.com` + `beacon.brigidforge.com` on push |

Single-branch workflow: develop directly on `main`, push to deploy.

```bash
git checkout main
# make changes, commit
git push origin main         # triggers production auto-deploy
```

### Remote

The git remote is a self-hosted **Forgejo** instance:

```
104.131.19.70:dev/brigid-beacon.git
# or: git@git.brigidforge.com:dev/brigid-beacon.git
```

Bare repo on server: `/var/lib/forgejo/data/forgejo-repositories/dev/brigid-beacon.git`

---

## Auto-Deploy Pipeline

### How it works

1. `git push origin dev` or `git push origin main`
2. Forgejo runs the bare repo's `post-receive` hook
3. Hook delegates to `post-receive.d/brigid-deploy` which calls:
   ```bash
   /usr/bin/sudo /root/update-brigid.sh <branch>
   ```
4. `/root/update-brigid.sh` (on server, not in repo):
   - acquires a flock to prevent concurrent deploys
   - checks the working tree is clean (refuses if dirty)
   - `git fetch origin && git checkout <branch> && git reset --hard origin/<branch>`
   - runs `scripts/install-systemd.sh`
   - runs `scripts/deploy-hosted.sh` with branch-appropriate env vars

### Branch → environment mapping (in /root/update-brigid.sh)

| Branch | VAULT_ROOT | VAULT_HEALTH_URL | BEACON_HEALTH_URL |
|---|---|---|---|
| `main` | `/var/www/vault` | `https://vault.brigidforge.com/` | `https://beacon.brigidforge.com/` |

### What scripts/deploy-hosted.sh does

1. Sources `apps/vault-ui/.env.${DEPLOY_ENV}` if present
2. `npm run build -w @brigid/vault-ui`
3. Clears `${VAULT_ROOT}` and copies `apps/vault-ui/dist/` into it
4. Copies `apps/vault-ui/media/` if present
5. `systemctl restart beacon-api.service && systemctl restart beacon-worker.service`
6. Health-checks API, vault domain, and beacon domain

### Hook file locations on server

```
/var/lib/forgejo/data/forgejo-repositories/dev/brigid-beacon.git/hooks/post-receive
/var/lib/forgejo/data/forgejo-repositories/dev/brigid-beacon.git/hooks/post-receive.d/brigid-deploy
/root/update-brigid.sh
```

### Dirty-repo guard

The deploy script refuses if `git status --porcelain` is non-empty. Build artifacts
(`apps/vault-ui/dist/`, `apps/vault-ui/tsconfig.tsbuildinfo`) are in `.gitignore` so
they don't trip this check. If the server is ever dirty (e.g. after a manual build),
clean with:

```bash
cd /opt/brigidforge/repo && git checkout -- . && git clean -fd
```

---

## systemd Services

| Unit | Source | What it runs |
|---|---|---|
| `beacon-api.service` | `ops/systemd/beacon-api.service` | `apps/api` (Fastify, port 3001) |
| `beacon-worker.service` | `ops/systemd/beacon-worker.service` | `apps/worker` (indexer + notifier) |

Reinstall from repo if units drift:
```bash
sudo REPO_ROOT=/opt/brigidforge/repo bash scripts/install-systemd.sh
```

---

## nginx Overview

Production nginx configs live in `ops/nginx/` and are installed to `/etc/nginx/sites-available/`
with symlinks in `sites-enabled/`.

| Config file | Domain | Webroot | Notes |
|---|---|---|---|
| `vault.brigidforge.com.conf` | `vault.brigidforge.com` | `/var/www/vault` | SPA fallback + `/api/` proxy to port 3001 |
| `staging-vault.brigidforge.com.conf` | `staging-vault.brigidforge.com` | `/var/www/staging-vault` | SPA fallback + `/api/` proxy to staging API |

`beacon.brigidforge.com` is served from the same webroot as `vault.brigidforge.com`
(`/var/www/vault`) — both domains serve the same vault-ui build.

---

## Chain / Contract Facts

| Property | Value |
|---|---|
| Chain | BSC testnet |
| Chain ID | 97 |
| Factory | `0xFc946E68886841B20c33b4449578c4cC35De5165` |
| Start block | `95886539` |
| Validation vault | `0x813bd049593844d8350b055c5b08d713fcfa4d3f` |

---

## Local Development

```bash
npm install
npm run dev:up       # starts API + worker via scripts/dev-runtime.mjs
# vault-ui dev server:
npm run dev -w @brigid/vault-ui   # port 5173 (or next available)
```

Preflight before deploy:
```bash
npm run ci           # typecheck + build + all tests
```

---

## What NOT to touch

- `apps/operator-panel-old/` — retired, do not modify or reference
- `apps/public-panel-old/` — retired, do not modify or reference
- `brigid-vault-ui-old/` — retired prototype, do not reference
- The `apps/viewer` app is maintained for compatibility but not actively developed

---

## Common Pitfalls

- **"Refusing deploy: repo is dirty"** — server working tree has leftover files.
  Run `git checkout -- . && git clean -fd` in `/opt/brigidforge/repo`.
- **iOS WalletConnect tx not opening wallet** — `openWalletForSigning(session)` must
  be called before the first `await` in the click handler. Never move it after an await.
- **`VITE_WALLETCONNECT_PROJECT_ID` missing** — WalletConnect button will be hidden/disabled.
  Set it in `.env.local` (dev) or `.env.staging` / `.env.production` on the server.
- **nginx `try_files =404`** — breaks React Router. Must be `try_files $uri $uri/ /index.html`.
- **Post-merge dirty tree** — if you `git stash` on the server and forget to drop it,
  `git stash drop` first, then `git checkout -- .`.
