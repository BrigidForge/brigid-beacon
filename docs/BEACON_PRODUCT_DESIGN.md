# BrigidVault Beacon – Product Design Direction

**Version:** 0.1.0  
**Status:** Draft  
**Companion to:** `docs/BEACON_MVP_SPEC.md`

---

## 1. Purpose

This document defines the next product-design layer for Beacon after the MVP technical loop:

- factory discovery
- vault indexing
- status computation
- public API
- public viewer
- delayed notifications

Current implementation note:

- the hosted Beacon deployment now lives at `beacon.brigidforge.com`
- the older `vault.brigidforge.com` surface is treated separately and is not the canonical Beacon host

The goal is to answer:

- What Beacon is as a product
- Which vaults Beacon treats as first-class
- Who can manage notifications
- What should be free vs paid
- Which features belong in Phase 1 vs Phase 2

This document does **not** replace the MVP spec. The MVP spec remains the source of truth for event taxonomy, status contracts, and API behavior.

---

## 2. Product Thesis

Beacon should be the **trusted visibility and monitoring layer** for official BrigidVault deployments.

The factory is now permissioned and acts as the canonical registry for official vaults, while Beacon provides the product value around it:

- normalized status
- human-readable vault timelines
- deployment provenance
- reliable alerting
- hosted API and viewer
- operational trust

Short version:

> BrigidVault secures the vault. Beacon explains, tracks, and alerts on it.

---

## 3. Product Boundary

For the near-term product, Beacon should focus on **official Brigid vaults** rather than trying to index every similar contract on-chain.

Beacon is responsible for:

- discovering official vaults from the configured Brigid factory
- tracking their lifecycle
- computing current vault state
- exposing public visibility
- offering private notification management to verified owners

Beacon is **not** responsible in Phase 1 for:

- indexing arbitrary third-party vault contracts
- inferring “vault-like” contracts outside Brigid provenance
- being a generic chain explorer

This keeps Beacon opinionated, comprehensible, and commercially defensible.

---

## 4. Vault Classes

### 4.1 Official vaults

Official vaults are vaults deployed through the configured allowlisted Brigid factory for a given environment.

Properties:

- indexed automatically
- appear in the public viewer
- available through the hosted API
- eligible for hosted notifications
- treated as first-class product objects

### 4.2 External or unsupported vaults

These are contracts that may resemble Brigid vaults but were not deployed through the configured official factory.

Phase 1 behavior:

- not indexed by default
- not first-class in Beacon
- not eligible for hosted notification guarantees

Future option:

- manual import or “unsupported external vault” mode

Recommendation:

- keep Beacon Phase 1 focused on official vaults only

---

## 5. Factory Policy Options

Beacon can support multiple business models depending on how the factory is governed.

### 5.1 Restricted official factory

Only approved callers can deploy through the official factory.

Effects:

- tighter control over who can create official vaults
- cleaner official customer set
- less spam
- slower adoption

Commercial implication:

- access itself becomes part of the product

### 5.2 Recommended model

Recommended direction for Brigid:

- the official factory remains allowlisted
- the factory registry defines the canonical official vault set
- Beacon becomes the premium hosted monitoring and visibility product for that official set

This gives Brigid:

- control over official deployments
- a clean trust boundary for indexing and analytics
- service-layer monetization on top of an official registry

---

## 6. Beacon User Roles

Phase 1 should keep roles simple.

### 6.1 Public viewer

Capabilities:

- open vault page
- read current status
- read event timeline
- inspect deployment proof

Restrictions:

- cannot manage subscriptions
- cannot claim vault ownership

### 6.2 Vault owner

Capabilities:

- prove control of the vault owner address
- configure notification destinations
- enable or disable alert types

Restrictions:

- only for vaults they control

### 6.3 Beacon operator

Capabilities:

- run infrastructure
- view worker/indexer health
- inspect dispatch failures
- support customers

Restrictions:

- internal operational role, not public MVP UI

Future roles:

- organization admin
- delegate / observer
- read-only team member

---

## 7. Ownership And Claiming

Beacon should not let arbitrary users attach notification channels to a vault.

### 7.1 MVP claim model

Use wallet-signature-based claiming.

Flow:

1. User connects wallet
2. Beacon issues a nonce
3. User signs the nonce with the vault owner address
4. Beacon verifies the signature
5. Beacon stores a vault-claim record
6. Claimed owner can manage subscriptions

Why this is the right MVP approach:

- aligns with on-chain ownership
- avoids weak email-based ownership assumptions
- straightforward to explain
- does not require contract changes

### 7.2 Claim semantics

Rules:

- one vault can have one current primary owner claim by default
- claims can be refreshed
- if on-chain owner changes in a future contract version, claims must be revalidated

Open question for later:

- whether multiple delegates can be authorized off-chain

---

## 8. Notification Product Design

Notifications should be **private and opt-in**, even if vault status pages are public.

### 8.1 Public vs private

Public:

- vault metadata
- current status
- event timeline
- deployment proof

Private:

- notification destinations
- delivery history
- subscriber settings
- channel credentials

### 8.2 Default notification events

Recommended Phase 1 alert set:

- vault funded
- withdrawal request became actionable after cancel window
- withdrawal executed
- request expired
- vault canceled or completed if supported by product language

Important:

- do not alert during cancel window

This matches current Beacon behavior and reduces noise.

### 8.3 Subscription model

Phase 1:

- per-vault subscriptions
- owned by verified vault owner
- one or more destinations per vault

Supported channels:

- Telegram
- Discord webhook
- generic webhook

Future:

- email
- Slack
- organization-wide routing rules

---

## 9. Free vs Paid Boundary

Beacon should separate broad discoverability from premium operational value.

### 9.1 Free tier

- public vault viewer
- public vault API reads
- metadata
- status
- event history
- deployment proof

Optional free add-on:

- one basic notification destination per claimed vault

### 9.2 Paid tier

- multiple destinations per vault
- richer alert history
- delivery retry visibility
- team/org access
- portfolio dashboard
- premium API rate limits
- SLA-backed hosted service
- exports, analytics, reporting

### 9.3 Why this split works

It allows:

- open discovery and trust-building
- protocol adoption
- monetization through reliability and operational utility

---

## 10. Product Surfaces

### 10.1 Public viewer

Purpose:

- make an official Brigid vault understandable in one page

Core sections:

- status banner
- balance summary
- pending request timing
- readable event timeline
- immutable rules
- deployment proof

### 10.2 Public API

Purpose:

- programmatic access to official Beacon truth

Core endpoints:

- vault metadata
- vault status
- vault events
- deployment proof

### 10.3 Owner settings surface

Purpose:

- claim ownership
- configure destinations
- manage alert preferences

This can begin as a minimal authenticated page or internal tool before becoming a polished product surface.

### 10.4 Operator surface

Purpose:

- indexer health
- lag visibility
- failed dispatch visibility
- reorg and replay observability

This may live outside the public Beacon viewer.

---

## 11. Phase Plan

### Phase 1: Productizing the current MVP

Ship:

- official vault public pages
- official public API
- owner claim flow
- per-vault notification settings
- delivery history basics
- operator visibility for worker health

Do not expand yet into:

- multi-chain
- arbitrary external vault imports
- organization/team permissions
- portfolio analytics

### Phase 2: Multi-vault product layer

Ship:

- owner portfolio view
- multi-vault alert feed
- filters for actionable states
- alert history and retry dashboards
- better search and discovery

### Phase 3: Enterprise and ecosystem support

Ship:

- team access
- delegated subscriptions
- premium API access
- advanced webhooks
- optional external vault support

---

## 12. Data Model Additions Recommended Next

To support the product design above, Beacon will likely need new tables or equivalent models for:

- `VaultClaim`
- `NotificationDestination`
- `NotificationSubscription`
- `NotificationDelivery`
- `UserNonce` or auth challenge records

Suggested semantics:

- `VaultClaim`: maps vault to verified controller address
- `NotificationDestination`: Telegram/webhook/Discord target owned by a user
- `NotificationSubscription`: which vault + which event types + which destination
- `NotificationDelivery`: delivery attempts, outcomes, timestamps

---

## 13. Key Product Decisions To Lock Next

These decisions should be made before large new implementation work:

1. Is the official factory permissionless, restricted, or hybrid?
2. Are all official-factory vaults public in Beacon by default?
3. Is notification management available only to owner claims?
4. Is the first commercial model subscription-based, usage-based, or hybrid?
5. Is one basic notification destination free?

---

## 14. Recommended Direction

Recommended current direction:

- Official-factory vaults are first-class
- Public visibility is open
- Notification control is private and requires owner claim
- Beacon monetizes hosted reliability and premium operational features
- External vault support stays out of Phase 1

This keeps Beacon coherent:

- simple enough to ship
- open enough to grow
- structured enough to monetize

---

## 15. Immediate Next Design/Build Step

The next concrete step after this document should be a small implementation spec for:

- vault ownership claim flow
- auth nonce signing
- notification destination schema
- subscription rules
- first owner settings UI/API

That is the shortest path from “working technical Beacon” to “actual product Beacon.”
