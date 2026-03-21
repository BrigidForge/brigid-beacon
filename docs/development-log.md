# Development Log

---

## 2026-03-19 — Unified Vault UI (`apps/vault-ui`)

### Summary

Created a new frontend application, `apps/vault-ui`, that consolidates the
previously separate `operator-panel` and `viewer` apps into a single unified
interface. This app is built with Vite 5 + React 18 + TypeScript and serves on
port 5176.

---

### Problem It Solves

The existing frontend split was fragmented:

- `operator-panel` (port 5175) — full-featured but required a wallet connection
  to see anything
- `viewer` (port 5174) — read-only but had no path to operator functions

Users had to know which app to open depending on their role. There was no
common landing experience and no smooth transition between public viewing and
vault ownership management. `vault-ui` replaces both for end users while
leaving the original apps untouched for internal/legacy use.

---

### Key Features

**Mode selector landing (`/`)**
- Two-card selector: Public Vault Viewer → `/view`, Operator Panel → `/operator`

**Public Viewer flow (`/view` → `/view/:vault`)**
- Vault address entry form at `/view`
- Vault detail at `/view/:vault` with three tabs:
  - Status: balances, vesting schedule, pending request
  - Activity: indexed event timeline
  - Notifications: public email subscription form

**Operator flow (`/operator` → `/operator/:vault`)**
- Wallet connection landing supporting both MetaMask (injected) and
  WalletConnect (iPhone / QR)
- Vault list under "Select your vault" header with tap-to-open UX
- Full operator workspace at `/operator/:vault` with four tabs:
  - Vault Status: 8 live stat cards, immutable schedule rules, deployment proof
  - Withdrawals: live RPC snapshot, request / cancel / execute with timeline
  - Activity History: indexed event timeline
  - Beacon Notifications: claim session, webhook / Discord / Telegram destinations

**`CopyableAddress` component**
- All Ethereum addresses across both modes are now truncated (`0x1234…5678`)
- Tap/click copies the full address to clipboard
- Inline copy icon with checkmark + "Copied" feedback for 1.5 s
- Applied to: vault address, owner, token, factory, deployer, tx hash

---

### Architecture Decisions

| Decision | Rationale |
|---|---|
| New app rather than modifying existing | Preserves operator-panel and viewer for any existing integrations; clean isolation |
| `OperatorSessionProvider` wraps only `/operator` routes | Prevents wallet init overhead on the viewer path |
| `WalletSession` kind stored to localStorage *before* `connect()` resolves | iOS Safari reloads the page when returning from MetaMask; early write lets the startup effect silently re-attach to WalletConnect's own persisted session |
| Neutral event card palette in Activity tab | Per-event rainbow colours were visually inconsistent with the other three tabs |
| `CopyableAddress` as a shared component | Single place to update copy/truncate behaviour; consistent UX across all address surfaces |

---

### Issues Encountered and Resolved

**WalletConnect iPhone: page reloads on return from MetaMask wallet**
- Root cause: iOS Safari refreshes the tab when switching back from another app.
  The React state (including the in-flight `connectWallet` promise) is lost.
  `storeWalletSession()` was only called after the handshake completed, so the
  localStorage key was never written before the reload.
- Fix: write `'walletconnect'` to `WALLET_SESSION_STORAGE_KEY` immediately when
  the user initiates a WalletConnect flow. On reload the startup `useEffect`
  finds it and calls `connectWallet('walletconnect', { silent: true })`, which
  re-initialises the WalletConnect provider from its own persisted session
  without showing a new QR/URI. The key is cleared in the catch block so a
  failed attempt does not loop.

**WalletConnect pairing message persisting after login**
- Root cause: `setWalletMessage(null)` was missing from the success path in
  `ensureWallet`; only `walletConnectUri` and `walletConnectStatus` were cleared.
- Fix: added `setWalletMessage(null)` immediately before `loadOwnedVaults`.

**Vault address overflowing container on mobile**
- Fix: vault list rows use `truncate` on the address `<p>` and the full address
  is accessible via the new `CopyableAddress` component.

**TypeScript: `walletSession.kind` typed as `never` in TransactionsTab**
- Root cause: the pattern `props.walletSession ?? await props.onRequireWallet(props.walletSession.kind)`
  uses `??` so the right-hand side is only reachable when `walletSession` is
  null; TypeScript narrows it to `never` there.
- Fix: replaced with `const connection = props.walletSession` since the
  containing guard (`if (!props.walletSession?.address) return`) already
  ensures it is non-null.

**Merge conflicts on dev ↔ main (dist artifacts)**
- Root cause: `apps/public-panel/dist/assets/index-*.js` was renamed differently
  in local and remote branches due to Vite content-hash changes.
- Fix: accepted the remote (server-synced) version on the dev merge; accepted
  the dev version on the main merge. Deploy script conflict (`HEALTH_*_TIMEOUT`
  vars added on remote) was resolved by keeping both variables.

---

### Deployment Notes

| Step | Branch | Remote ref | Result |
|---|---|---|---|
| Staging | `dev` | `origin/dev` | `d32b1ed → 5745c1f` ✓ |
| Production | `main` | `origin/main` | `3d05e0b → 5dc665d` ✓ |

The deploy hook on the server picks up `main` pushes automatically. No manual
service restart was required.

`vault-ui` does not yet have a `dist/` entry in the server's nginx config or
deploy script. A follow-up task is needed to:
1. Add `vault-ui` to `scripts/deploy-hosted.sh` (build step + static file copy)
2. Configure an nginx location block to serve `apps/vault-ui/dist` on its
   designated subdomain or path

---

---

## [Workflow Simplification – Single Branch Migration]

- Consolidated dev branch into main
- Removed dual-branch workflow (dev/main)
- Updated deployment hooks to main-only
- Production now deploys directly from main
- Reduced complexity and eliminated merge overhead

Rationale:
Simplify development workflow during pre-launch phase to improve speed, reduce errors, and maintain momentum.

