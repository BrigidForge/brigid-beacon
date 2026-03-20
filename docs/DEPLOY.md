# Beacon Deploy

This document is the practical deployment checklist for shipping local Beacon changes to a hosted environment.

## Deployment Model

Beacon is designed so that:

- local repo is the source of truth for code
- runtime infrastructure lives outside the repo
- most changes can be shipped without rebuilding the entire environment from scratch

Typical updates only need:

1. local code changes
2. local validation
3. syncing the repo to the deployment target
4. rebuilding or restarting the affected service

## Before Deploying

From local `brigid-beacon/`:

```bash
npm run ci
```

`npm run ci` is the canonical preflight. It runs workspace typechecks, build steps, and all workspace tests. If the change only touches one surface, you can still run a smaller subset, but `ci` is the safest full preflight.

## Standard Code Deploy

### 1. Sync code to the deployment target

However you prefer to update the hosted copy, the result should be that:

- the deployed source matches the local validated source
- the runtime environment still has the required env vars and service definitions

Typical options:

- `git pull` on the target host
- `scp` / `rsync` from local
- deployment from a remote git origin

### 2. Install canonical runtime definitions when needed

If systemd units drift, reinstall them from the repo:

```bash
cd /opt/brigidforge/repo
sudo REPO_ROOT=/opt/brigidforge/repo bash scripts/install-systemd.sh
```

Canonical units:

- `beacon-api.service` -> `apps/api`
- `beacon-worker.service` -> `apps/worker`

### 3. Rebuild on the target host

Change into the deployed repo root, then rebuild what changed.

For a full app rebuild:

```bash
npm run ci
```

For viewer-only changes:

```bash
npm run build --workspace @brigid/beacon-viewer
```

### 4. Publish and restart with the canonical script

For the hosted Beacon split surfaces, use the repo-owned deployment script:

```bash
cd /opt/brigidforge/repo
sudo REPO_ROOT=/opt/brigidforge/repo bash scripts/deploy-hosted.sh
```

That script:

- builds `apps/operator-panel`
- builds `apps/public-panel`
- builds `apps/vault-ui`
- publishes operator output to `/var/www/beacon`
- publishes public output to `/var/www/panel`
- publishes vault UI output to `/var/www/vault`
- copies operator media assets into `/var/www/beacon/media`
- copies vault UI media assets into `/var/www/vault/media`
- restarts `beacon-api.service` and `beacon-worker.service`
- verifies API, public-host, and vault UI reachability

**First-time vault UI setup** (only needed once on a new host):

```bash
# 1. Install the nginx config
cp ops/nginx/vault.brigidforge.com.conf /etc/nginx/sites-available/vault.brigidforge.com
ln -s /etc/nginx/sites-available/vault.brigidforge.com /etc/nginx/sites-enabled/

# 2. Obtain TLS cert
certbot --nginx -d vault.brigidforge.com

# 3. Test and reload nginx
nginx -t && systemctl reload nginx

# 4. Create the webroot
mkdir -p /var/www/vault
```

For staging, use `ops/nginx/staging-vault.brigidforge.com.conf` and pass
`VAULT_ROOT=/var/www/staging-vault VAULT_HEALTH_URL=https://staging-vault.brigidforge.com/` to the deploy script.

### 5. Verify after restart

Suggested checks:

```bash
curl https://your-beacon-host/health
```

```bash
curl https://your-beacon-host/api/v1/vaults/<vault-address>
```

Also verify:
- worker logs show healthy indexing activity
- API logs show successful requests and no startup errors
- operator panel renders from `/var/www/beacon`
- public panel renders from `/var/www/panel`
- vault UI renders from `/var/www/vault`

## When Runtime Reconfiguration Is Required

Additional server changes are usually only required if one of these changes:

- `RPC_URL`
- `FACTORY_ADDRESS`
- `START_BLOCK`
- Telegram bot credentials or webhook secret
- database connection or schema requiring migration steps
- reverse-proxy routing / hostnames
- service definitions
- CORS allowlist or rate-limit policy

Those are runtime changes, not ordinary app-code deploys.

## Current Canonical Runtime Facts

Current reference deployment assumptions:

- Chain: `BSC testnet`
- Chain ID: `97`
- Factory: `0xFc946E68886841B20c33b4449578c4cC35De5165`
- Start block: `95886539`
- Validation vault: `0x813bd049593844d8350b055c5b08d713fcfa4d3f`

## Env And Topology Notes

Use `./.env.example` as the canonical env list for API, worker, viewer, and public-email settings.

Preferred production topology:

- serve the viewer and API from the same host when possible
- reverse proxy API traffic under `/api/...`
- leave `VITE_API_BASE_URL` unset in that same-origin setup
- set `PUBLIC_APP_BASE_URL` to the public viewer host used in email links

If the API is hosted separately, explicitly set:

- `VITE_API_BASE_URL=https://your-api-host`
- `PUBLIC_APP_BASE_URL=https://your-viewer-host`
- `ALLOWED_ORIGINS=https://your-viewer-host`

## Reorg Handling

Beacon’s worker rewinds from the stored indexed head by `REORG_LOOKBACK_BLOCKS` before replaying the next indexing cycle. That gives the indexer room to replace shallow-reorg data instead of assuming the prior tip is final. Keep the configured lookback aligned with the target chain and your chosen confirmation policy.

## Telegram Note

If Telegram behavior changes, remember that the bot webhook should still target:

```text
https://your-beacon-host/api/v1/integrations/telegram/webhook
```

## Recommended Habit

For normal work:

1. make and validate changes locally
2. treat local as the source of truth
3. sync the repo to `/opt/brigidforge/repo`
4. use the repo-owned deploy script and repo-owned systemd units
4. avoid editing production files manually unless you are fixing an urgent live issue

If a live hotfix is made directly on the host, make the equivalent local change as soon as possible so local remains canonical.
