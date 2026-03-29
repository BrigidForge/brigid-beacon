# BrigidVault Beacon – MVP Specification

**Version:** 1.0.0  
**Status:** Locked for Sprint 1  
**Internal name:** Beacon System | **Public identity:** BrigidVault Beacon

---

## 1. Scope

The Beacon System is the **monitoring, indexing, alerting, and public visibility layer** on top of BrigidVault. It delivers:

> **"Visibility before execution."**

### MVP capabilities

- Monitor BrigidVault contracts (official factory + vault instances)
- Detect: funding, withdrawal requests, cancellations, executions, expirations
- Compute vault state: protected allocation, withdrawn amount, pending request, delays
- Expose public viewer at `/vault/:address`
- Expose API: vault metadata, status, events, deployment proof
- Send notifications **only after** the cancellation window ends (no alerts during cancel window)
- Reconcile indexed vaults against the factory registry when needed

### Out of scope for MVP

- Vault operator panel (`vault.brigidforge.com`) as a separate surface
- Multi-chain indexing
- Historical backfill of pre-Beacon deployments (optional later)

---

## 2. Event taxonomy

### 2.1 Raw contract events (BrigidVault + Factory)

| Source | Event | Indexed | Data |
|--------|--------|---------|------|
| Factory | `VaultDeployed` | vault, deployer, token | allocation, startTime |
| Factory | `BrigidVaultDeployed` | deployer, vault, token | owner, totalAllocation, startTime, cliff, interval, intervals, cancelWindow, withdrawalDelay, executionWindow |
| Vault | `Funded` | token | amount |
| Vault | `ExcessDeposited` | from, token | amount |
| Vault | `WithdrawalRequested` | owner, purposeHash | amount, requestedAt, executableAt, expiresAt |
| Vault | `WithdrawalCanceled` | owner, purposeHash | amount, canceledAt |
| Vault | `WithdrawalExecuted` | executor, owner, purposeHash | amount, executedAt |
| Vault | `WithdrawalExpired` | owner, purposeHash | amount, expiredAt, requestType |

`requestType`: `0` none, `1` protected, `2` excess. For `WithdrawalRequested` the indexer must read `pendingRequestType()` at that block (or infer from subsequent events).

Factory notes:

- Vault deployment through the official factory is permissioned via allowlist.
- The official factory is the canonical registry for Brigid vaults.
- Beacon should prefer `VaultDeployed` for real-time discovery and use factory registry views such as `totalVaults()` and `allVaults(uint256)` for reconciliation/backfill.
- If both `VaultDeployed` and `BrigidVaultDeployed` are emitted for the same deployment, Beacon must normalize that into exactly one `vault_created` event.

### 2.2 Normalized Beacon events

All stored events use a single taxonomy for API and viewer:

| Normalized kind | Description | Derived from |
|-----------------|-------------|--------------|
| `vault_created` | Vault deployed via official factory | `VaultDeployed` or `BrigidVaultDeployed` |
| `vault_funded` | Protected allocation funded | `Funded` |
| `excess_deposited` | Excess funds deposited | `ExcessDeposited` |
| `protected_withdrawal_requested` | Owner requested protected withdrawal | `WithdrawalRequested` + requestType=1 |
| `excess_withdrawal_requested` | Owner requested excess withdrawal | `WithdrawalRequested` + requestType=2 |
| `withdrawal_canceled` | Request canceled in cancel window | `WithdrawalCanceled` |
| `withdrawal_executed` | Withdrawal executed after delay | `WithdrawalExecuted` |
| `request_expired` | Request passed expiry without execution | `WithdrawalExpired` |

Each normalized event has: `id`, `vaultAddress`, `kind`, `blockNumber`, `transactionHash`, `timestamp`, and a `payload` object keyed by kind (see schema).

---

## 3. Vault status states

Internal state machine for a single vault (used by status engine and API).

| State | Description |
|-------|-------------|
| `idle` | Vault created, not yet funded |
| `active_no_request` | Funded, no pending withdrawal request |
| `protected_request_pending_cancel` | Protected request in cancel window |
| `excess_request_pending_cancel` | Excess request in cancel window |
| `protected_request_pending_execution` | Protected request past cancel window, before executableAt |
| `excess_request_pending_execution` | Excess request past cancel window, before executableAt |
| `request_executable` | Request in [executableAt, expiresAt] |
| `request_expired` | Request past expiresAt (not yet cleared from chain or not yet indexed) |
| `completed_recently` | Request was executed (terminal for that cycle) |
| `canceled_recently` | Request was canceled (terminal for that cycle) |

State is derived from: `funded`, `pendingWithdrawal.exists`, `pendingRequestType`, `requestedAt`, `executableAt`, `expiresAt`, and current block timestamp (or indexer time).

---

## 4. Notification rules

- **On withdrawal request:** Persist to database immediately. **Do not** send any alert while still in cancel window.
- **After cancel window ends:** If the request still exists (not canceled), send alert(s) that a withdrawal is pending execution.
- **If canceled during cancel window:** No public alert.
- **On execution:** Send execution notification.
- **On expiration:** Optionally notify (e.g. “request expired”; MVP may defer).

---

## 5. API contract

Base URL: `https://beacon.brigidforge.com/api` (MVP: configurable).

### 5.1 `GET /api/v1/vaults/:address`

Returns vault metadata and deployment proof.

**Response:** `VaultMetadata` (see schema).

**404** if vault not indexed or invalid address.

### 5.2 `GET /api/v1/vaults/:address/status`

Returns current vault status (state, amounts, timing).

**Response:** `VaultStatus` (see schema).

**404** if vault not indexed.

### 5.3 `GET /api/v1/vaults/:address/events`

Returns ordered list of normalized events for the vault.

**Query:** `?limit=50&before=eventId` (optional cursor).

**Response:** `{ events: NormalizedEvent[] }`.

### 5.4 `GET /api/v1/vaults/:address/proof`

Returns deployment proof (chain, factory, deployer, block, tx hash, constructor args or config digest).

**Response:** `DeploymentProof` (see schema).

---

## 6. API response schemas (contracts)

### 6.1 VaultMetadata

```ts
{
  address: string;           // checksummed vault address
  chainId: number;
  owner: string;
  token: string;
  totalAllocation: string;   // hex or decimal string
  startTime: string;        // unix seconds
  cliffDuration: string;
  intervalDuration: string;
  intervalCount: string;
  cancelWindow: string;
  withdrawalDelay: string;
  executionWindow: string;
  createdAt: string;        // ISO8601 (indexer)
  deployedAtBlock: number;
  deployedAtTx: string;
}
```

### 6.2 VaultStatus

```ts
{
  address: string;
  state: VaultState;        // enum from §3
  funded: boolean;
  totalWithdrawn: string;    // protected
  totalExcessWithdrawn: string;
  vestedAmount: string;
  protectedOutstandingBalance: string;
  excessBalance: string;
  availableToWithdraw: string;
  excessAvailableToWithdraw: string;
  pendingRequest: null | {
    amount: string;
    purposeHash: string;
    requestType: 'protected' | 'excess';
    requestedAt: string;
    executableAt: string;
    expiresAt: string;
    isCancelable: boolean;
    isExecutable: boolean;
  };
  updatedAtBlock: number;
  updatedAt: string;         // ISO8601
}
```

### 6.3 NormalizedEvent

```ts
{
  id: string;                // stable ID (e.g. chainId:txHash:logIndex)
  vaultAddress: string;
  kind: NormalizedEventKind;
  blockNumber: number;
  transactionHash: string;
  timestamp: string;         // unix seconds or ISO8601
  payload: Record<string, unknown>;  // kind-specific
}
```

### 6.4 DeploymentProof

```ts
{
  vault: string;
  chainId: number;
  factory: string;
  deployer: string;
  blockNumber: number;
  transactionHash: string;
  config: {
    token: string;
    owner: string;
    totalAllocation: string;
    startTime: string;
    cliffDuration: string;
    intervalDuration: string;
    intervalCount: string;
    cancelWindow: string;
    withdrawalDelay: string;
    executionWindow: string;
  };
}
```

---

## 7. Public viewer UX (MVP)

- **Vault status banner:** Current state and short summary.
- **Allocation and withdrawal summary cards:** totalAllocation, totalWithdrawn, totalExcessWithdrawn, unlocked protected amount (`vestedAmount` in the API), availableToWithdraw, excessBalance.
- **Pending request countdown:** If state is *request_pending_execution* or *request_executable*, show executableAt/expiresAt and countdown.
- **Timeline:** Chronological list of normalized events.
- **Contract configuration rules:** Immutable params (cliff, intervals, cancel window, delay, execution window).
- **Deployment proof:** Link or inline proof (chain, factory, block, tx).

---

## 8. Infrastructure (target)

- **beacon.brigidforge.com** – Public Beacon viewer and hosted API
- **vault.brigidforge.com** – Separate legacy/operator vault surface

---

## 9. Build order (Sprints)

| Sprint | Deliverable |
|--------|-------------|
| 1 | Lock specification (this doc), event/status schema, API contracts |
| 2 | Local blockchain indexer (ingest factory + vault events → normalized store) |
| 3 | Database (Prisma) + Beacon API (Fastify) |
| 4 | Public viewer MVP (Vite + React + Tailwind) |
| 5 | Notification engine (cron, delayed alerts) |
| 6 | Production hardening (reorg, drift, ABI versioning, expiration) |

---

## 10. Risk areas

- **Blockchain reorg handling:** Confirm finality or N-block delay before treating events as final.
- **Snapshot drift:** Status snapshot vs on-chain view; reconcile on read or periodic refresh.
- **ABI version changes:** Pin ABI version; version API if contract upgrades.
- **Timestamp mismatch:** Prefer block timestamp for ordering; document any use of indexer time.
- **Expiration detection:** Contract emits `WithdrawalExpired` when next action runs; indexer may need to infer expiry from `expiresAt` for display if no tx occurs.

---

## 11. MVP completion criteria

Beacon MVP is complete when:

1. A deployed vault can be **fully reconstructed** from chain events (metadata + event list).
2. **API endpoints** return normalized vault status and events per this spec.
3. **Public viewer** correctly shows vault rules, state, and history.
4. **Notification logic** respects cancellation windows (no alert during cancel window; alert after if still pending; execution notification).

---

## 12. Next steps (immediate)

1. ✅ Write Beacon MVP specification (this document)
2. Define event and status schema (TypeScript + Prisma)
3. Define API response contracts (shared-types)
4. Scaffold repository structure (brigid-beacon/)
5. Build event watcher (Sprint 2)
6. Implement snapshot/status engine (Sprint 2–3)
7. Launch public viewer prototype (Sprint 4)
