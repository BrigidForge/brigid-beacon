# Development Log

---

## 2026-03-24 — Beacon `V1.1.0` Stable PWA Release

### Summary

Locked Beacon as `V1.1.0` and promoted it from a browser-only app to a
functioning installable PWA. This release keeps the unified `apps/vault-ui`
surface and adds a complete mobile/browser push flow, iPhone install guidance,
and a cleaner first-run onboarding path for device notifications.

### Major Product Changes

- Added a manifest/service-worker-backed PWA shell on the existing
  `vault.brigidforge.com` deployment
- Added browser push notifications and wired them into the public vault viewer
- Implemented iPhone-specific install guidance with:
  - Safari-only install instructions
  - non-Safari mobile warning under the logo
  - collapsible install helper that can be reopened later
- Added first-run PWA onboarding that:
  - routes installed mobile users into the public vault viewer flow
  - asks for a vault address first
  - lands directly on Browser Push Alerts
  - visually emphasizes the enable action
- Consolidated device-level app notification setup through the public vault
  viewer so users have one notification setup path per vault/device

### Notification / UX Cleanup

- Public email subscription flow stabilized:
  - resend confirmation
  - secure manage-link flow
  - unsubscribe / resubscribe cleanup
  - spam-folder guidance
- Withdrawal request notifications now dispatch correctly at the start of the
  delay phase after the cancellation window closes
- Public email subscriptions and owner notification defaults were aligned with
  actionable withdrawal events
- Owner panel browser-push setup now redirects users to the public vault viewer
  instead of maintaining a second competing browser-push flow

### Mobile / iPhone Improvements

- Added delayed wallet handoff with inline countdown for mobile signing
- Fixed repeated/stray wallet handoff behavior during withdrawal flow
- Added focus/pageshow refresh behavior so iPhone wallet returns update the UI
  after approval
- Timeline now returns to the idle state when no withdrawal request is active
- iPhone home-screen install metadata updated to use `Brigid Beacon`

### Release Notes

- Stable release: `V1.1.0`
- Previous stable release: `V1.0.0`
- Commit: `568d27a` (`Release Beacon V1.1.0 stable PWA`)

---

## 2026-03-22 — Operator Panel UX: Vesting/Surplus Separation + Label Cleanup

### Summary

Refactored the Vault Status tab in the operator panel to improve clarity and
usability by separating vesting and surplus data into distinct containers, and
removing confusing "Protected" / "Excess" terminology throughout the UI.

### Changes

**`apps/vault-ui/src/components/VaultStatusTab.tsx`**

- Replaced the flat 8-card stat grid with a structured three-section layout:
  1. **Available to Withdraw** — full-width hero card at the top, prominently
     sized, showing vested principal ready to request.
  2. **Vesting Allocation** — container with sky-blue accent, listing:
     Remaining to Vest, Total Vested (%), Vested Withdrawn, Total Allocation,
     Funding status.
  3. **Surplus Funds** — container with amber accent, listing:
     Surplus Available, Surplus Withdrawn.
- Dropped the `StatCard` component; replaced with a compact `SubStat` row
  component (label / value / hint, separator lines) suited for within-container
  display.
- Removed all "Protected" and "Excess" labels from the UI. No contract calls
  or variable names were changed — presentation layer only.
- Funding health indicator moved inside the Vesting container with green/amber
  colour coding.

**`apps/vault-ui/src/routes/Operator.tsx`** (prior session)

- Vault selector second line now shows `Token: <symbol>` (live RPC lookup with
  cache) and a coloured dot status: green "Status: Ready" or amber
  "Status: Request Processing".
- Vault Identity panel (`VaultSummaryPanel`) moved from above the tabs to
  inside the Vault Status tab only.

### Why

- "Protected" reads as a security concept; "Excess" implies an error condition.
  Operators found the flat grid confusing and couldn't easily tell which funds
  were rule-bound vs. freely withdrawable.
- Separating into two visually distinct containers with descriptive subtitles
  makes the distinction self-evident without requiring documentation.

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
