# BrigidVault Beacon – Owner Claims And Subscriptions Spec

**Version:** 0.1.0  
**Status:** Draft  
**Depends on:** `docs/BEACON_MVP_SPEC.md`, `docs/BEACON_PRODUCT_DESIGN.md`

---

## 1. Goal

This document defines the first productized owner-control layer for Beacon:

- vault ownership claims
- notification destinations
- notification subscriptions
- delivery history

The purpose is to let Beacon move from a public vault monitor to a managed owner-facing product without changing the vault contract.

This spec assumes:

- official vaults are deployed through the allowlisted official factory
- vault pages and metadata remain public
- notification management is private and requires proof of control

---

## 2. Product Outcome

After this phase, a verified vault owner should be able to:

1. open a Beacon owner settings flow
2. prove control of the vault owner address with a wallet signature
3. register one or more notification destinations
4. subscribe those destinations to supported alert types
5. view delivery results for those alerts

---

## 3. Non-Goals

This phase does **not** include:

- team/org roles
- delegated claim permissions
- email-based ownership
- external/non-official vault claiming
- paid billing system
- on-chain claim storage

---

## 4. Trust Model

Beacon must only allow notification management for users who can prove control of the vault owner address currently stored in Beacon metadata.

Beacon trusts:

- the official factory as the canonical source of official vaults
- the indexed vault metadata as the current owner field for the vault
- an off-chain signature from that owner address for claim verification

Beacon does **not** require:

- contract changes
- admin manual approval
- email verification as proof of vault control

---

## 5. Claim Flow

### 5.1 Overview

Claiming is an off-chain wallet-signature verification flow.

Flow:

1. Client requests a claim nonce for a vault and owner address
2. Beacon verifies the vault exists and the supplied address matches the indexed vault owner
3. Beacon returns a short-lived nonce payload
4. User signs the payload with the owner wallet
5. Client submits the signature
6. Beacon verifies the signature
7. Beacon upserts the owner claim

### 5.2 Claim message

Recommended signed message fields:

- fixed domain string, e.g. `BrigidVault Beacon Claim`
- chainId
- vault address
- owner address
- nonce
- issuedAt
- expiresAt

Human-readable example:

```text
BrigidVault Beacon Claim
Vault: 0x...
Owner: 0x...
Chain ID: 97
Nonce: <random>
Issued At: <iso>
Expires At: <iso>
```

Phase 1 can use EIP-191 personal-sign format.

Future upgrade path:

- EIP-712 typed data

### 5.3 Claim validity

Rules:

- nonce expires after a short TTL, recommended `10 minutes`
- nonce is single-use
- signature must recover to the current indexed vault owner
- if the indexed owner no longer matches the claim record later, the claim becomes stale

---

## 6. Data Model Additions

Recommended Prisma additions:

### 6.1 `ClaimNonce`

Purpose:

- stores short-lived nonce challenges before signature verification

Fields:

```ts
id: string
vaultAddress: string
ownerAddress: string
nonce: string
issuedAt: DateTime
expiresAt: DateTime
usedAt: DateTime?
createdAt: DateTime
```

Indexes:

- `vaultAddress`
- `ownerAddress`
- `expiresAt`
- unique `nonce`

### 6.2 `VaultClaim`

Purpose:

- stores verified controller for a vault

Fields:

```ts
id: string
vaultAddress: string
ownerAddress: string
claimedAt: DateTime
lastVerifiedAt: DateTime
revokedAt: DateTime?
claimMethod: string // "wallet_signature"
signatureDigest: string
```

Rules:

- one active claim per vault in Phase 1
- `vaultAddress` should be unique for active claims

### 6.3 `NotificationDestination`

Purpose:

- stores an owner-managed notification endpoint

Fields:

```ts
id: string
ownerAddress: string
kind: string // "telegram" | "discord_webhook" | "webhook"
label: string
configJson: Json
createdAt: DateTime
updatedAt: DateTime
disabledAt: DateTime?
```

Notes:

- `configJson` contains destination-specific configuration
- sensitive values should be treated as secrets in production

### 6.4 `NotificationSubscription`

Purpose:

- links a vault to a destination and a selected alert set

Fields:

```ts
id: string
vaultAddress: string
destinationId: string
ownerAddress: string
eventKindsJson: Json
createdAt: DateTime
updatedAt: DateTime
disabledAt: DateTime?
```

Rules:

- owner address must match the active claim for the vault
- duplicate active subscriptions for the same vault/destination pair should be prevented

### 6.5 `NotificationDelivery`

Purpose:

- stores delivery attempt history

Fields:

```ts
id: string
beaconEventId: string
subscriptionId: string
destinationId: string
status: string // "pending" | "sent" | "failed"
providerMessageId: string?
attemptCount: Int
lastAttemptAt: DateTime?
deliveredAt: DateTime?
errorMessage: string?
createdAt: DateTime
```

This table complements the existing `BeaconEvent.dispatchedAt` model and gives per-destination visibility.

---

## 7. API Surface

All routes below are Phase 1 private routes for owner operations.

Base path recommendation:

`/api/v1/owner`

### 7.1 `POST /api/v1/owner/claims/nonce`

Purpose:

- issue a nonce challenge for a vault claim

Request:

```json
{
  "vaultAddress": "0x...",
  "ownerAddress": "0x..."
}
```

Behavior:

- validate vault exists
- validate `ownerAddress` matches indexed vault owner
- create short-lived nonce
- return claim message payload

Response:

```json
{
  "vaultAddress": "0x...",
  "ownerAddress": "0x...",
  "chainId": 97,
  "nonce": "<random>",
  "issuedAt": "<iso>",
  "expiresAt": "<iso>",
  "message": "<signable string>"
}
```

### 7.2 `POST /api/v1/owner/claims/verify`

Purpose:

- verify the signed nonce and activate the vault claim

Request:

```json
{
  "vaultAddress": "0x...",
  "ownerAddress": "0x...",
  "nonce": "<random>",
  "signature": "0x..."
}
```

Behavior:

- verify nonce exists and is unused
- verify nonce is unexpired
- reconstruct signed payload
- recover signer
- require signer == indexed vault owner
- mark nonce used
- upsert `VaultClaim`

Response:

```json
{
  "vaultAddress": "0x...",
  "ownerAddress": "0x...",
  "claimed": true,
  "claimedAt": "<iso>"
}
```

### 7.3 `GET /api/v1/owner/claims/:vaultAddress`

Purpose:

- return current claim status for the caller context

Phase 1 note:

- if no session/auth system exists yet, this may be operator-only or omitted until the UI wiring is ready

### 7.4 `POST /api/v1/owner/destinations`

Purpose:

- create a notification destination owned by a verified vault owner

Request example:

```json
{
  "ownerAddress": "0x...",
  "kind": "webhook",
  "label": "Ops webhook",
  "config": {
    "url": "https://example.com/hook"
  }
}
```

### 7.5 `GET /api/v1/owner/destinations`

Purpose:

- list owner-managed destinations

### 7.6 `POST /api/v1/owner/subscriptions`

Purpose:

- attach a destination to a vault and alert set

Request example:

```json
{
  "vaultAddress": "0x...",
  "ownerAddress": "0x...",
  "destinationId": "dest_123",
  "eventKinds": [
    "vault_funded",
    "protected_withdrawal_requested",
    "excess_withdrawal_requested",
    "withdrawal_executed",
    "request_expired"
  ]
}
```

Behavior:

- require active vault claim
- require destination belongs to same owner address
- create active subscription

### 7.7 `GET /api/v1/owner/subscriptions?vaultAddress=0x...`

Purpose:

- list subscriptions for a vault or owner

### 7.8 `DELETE /api/v1/owner/subscriptions/:id`

Purpose:

- disable a subscription

### 7.9 `GET /api/v1/owner/deliveries?vaultAddress=0x...`

Purpose:

- view delivery history for owner-managed subscriptions

---

## 8. Security Rules

### 8.1 Claim security

- nonce must be cryptographically random
- nonce TTL should be short
- nonce must be single-use
- signature must be verified against the current indexed owner address
- stale claims should be invalidated if indexed owner changes

### 8.2 Destination security

- webhook URLs and tokens should be treated as secrets
- destination ownership must be tied to the verified owner address
- Beacon must never expose secret destination config values back to public routes

### 8.3 Subscription security

- only active claims may create/update subscriptions
- subscriptions can only point to destinations owned by the same owner address
- public users cannot enumerate private destinations or subscriptions

---

## 9. Delivery Model

Phase 1 recommendation:

- keep the existing dispatcher event timing rules
- expand dispatch to fan out over active subscriptions instead of only environment-configured global channels
- create a `NotificationDelivery` row per destination attempt
- mark success/failure per destination

Event eligibility rules stay the same:

- no alert while still in cancel window
- actionable request alerts after cancel window
- execution alerts
- expiration alerts

---

## 10. UI Surface

Phase 1 owner UX should be small and focused.

Recommended screens:

### 10.1 Claim vault

- enter or open a vault
- connect wallet
- request nonce
- sign message
- confirm claim success

### 10.2 Manage destinations

- list destinations
- add Telegram / Discord / webhook destination
- disable destination

### 10.3 Manage subscriptions

- choose alert types
- attach one or more destinations
- disable subscription

### 10.4 Delivery history

- recent deliveries
- success / failed state
- last attempt time

---

## 11. MVP Constraints

To keep this phase shippable:

- support only one active claim per vault
- support wallet-signature claims only
- support only official vaults
- use simple owner-address-based authorization
- defer org/team model
- defer billing and entitlements

---

## 12. Build Order

Recommended implementation order:

1. Add Prisma models for claim nonce, claim, destination, subscription, delivery
2. Add nonce + verify claim API
3. Add destination CRUD API
4. Add subscription CRUD API
5. Extend dispatcher to use active subscriptions
6. Add first owner settings UI
7. Add delivery history UI/API

---

## 13. Open Questions

Questions to lock before implementation:

1. Is one destination free by default, or are destinations entirely premium?
2. Should owner claims automatically expire after a long TTL, or only on owner drift?
3. Should claim verification use plain signed messages first or go directly to EIP-712?
4. Should Telegram be first-class in MVP, or should webhook be the only initial managed destination?

---

## 14. Recommendation

Recommended practical path:

- use EIP-191 signed messages first
- support webhook and Telegram first
- allow one active claim per vault
- allow multiple destinations per owner
- keep subscriptions per vault
- store delivery history from day one

This is the smallest slice that turns Beacon into a real owner-managed monitoring product.
