# Beacon Next Surfaces

This document captures the next product surface after the current single-vault Beacon flow.

## Current Baseline

Beacon now has:

- official factory discovery through the permissioned canonical registry
- normalized vault indexing and status computation
- public API and public vault viewer
- owner claim flow with session-backed notification management
- delivery history
- local browser e2e coverage for the claim-to-alert path

## Next Product Surface

The strongest next surface is an **owner portfolio view**.

Why this comes next:

- the single-vault owner workflow is now real
- Beacon already knows the owner address on each indexed vault
- notification management becomes much more useful when an owner can see all of their vaults in one place
- this is the shortest path from “vault inspector” to “actual monitoring product”

## Recommended Phase

### 1. Owner Portfolio Dashboard

Primary user:

- authenticated claimed owner

Core capabilities:

- list all indexed vaults for the owner
- show current state and balances for each vault
- highlight actionable items:
  - request executable
  - request expiring soon
  - recent delivery failures
- jump into per-vault settings and history

### 2. Operator Health Dashboard

Primary user:

- Beacon operator

Core capabilities:

- worker lag and stale detection
- discovery mode visibility
- last indexer and dispatcher error
- failed delivery queue and retry health

### 3. Token And Ecosystem Analytics

Primary user:

- public viewer or internal analytics user

Core capabilities:

- list vaults by token
- view token-level concentration and exposure
- inspect deployer activity via `vaultCreator`
- surface factory-level ecosystem stats

## Suggested Build Order

1. Owner portfolio API endpoints
2. Owner portfolio viewer page
3. Operator dashboard page using the existing operator health endpoint
4. Token-centric API/viewer surfaces using `tokenVaults`

## Non-Goals For The Next Pass

- generic third-party vault import
- org/team role model
- billing or quota enforcement
- deep analytics warehousing

Those can come after the portfolio and operator surfaces are in place.
