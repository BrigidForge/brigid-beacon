-- CreateTable
CREATE TABLE "Vault" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAllocation" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "cliffDuration" TEXT NOT NULL,
    "intervalDuration" TEXT NOT NULL,
    "intervalCount" TEXT NOT NULL,
    "cancelWindow" TEXT NOT NULL,
    "withdrawalDelay" TEXT NOT NULL,
    "executionWindow" TEXT NOT NULL,
    "deployedAtBlock" INTEGER NOT NULL,
    "deployedAtTx" TEXT NOT NULL,
    "deployer" TEXT NOT NULL,

    CONSTRAINT "Vault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeaconEvent" (
    "id" TEXT NOT NULL,
    "vaultAddress" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "BeaconEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultSnapshot" (
    "id" TEXT NOT NULL,
    "vaultAddress" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "funded" BOOLEAN NOT NULL,
    "totalWithdrawn" TEXT NOT NULL,
    "totalExcessWithdrawn" TEXT NOT NULL,
    "vestedAmount" TEXT NOT NULL,
    "protectedOutstanding" TEXT NOT NULL,
    "excessBalance" TEXT NOT NULL,
    "availableToWithdraw" TEXT NOT NULL,
    "excessAvailable" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pendingRequestJson" JSONB,

    CONSTRAINT "VaultSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerState" (
    "id" TEXT NOT NULL,
    "lastBlockNumber" INTEGER NOT NULL DEFAULT 0,
    "lastBlockHash" TEXT,
    "lastIndexedAt" TIMESTAMP(3),
    "lastIndexerRunAt" TIMESTAMP(3),
    "lastDispatcherRunAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "discoveryMode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimNonce" (
    "id" TEXT NOT NULL,
    "vaultAddress" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultClaim" (
    "id" TEXT NOT NULL,
    "vaultAddress" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "claimMethod" TEXT NOT NULL,
    "signatureDigest" TEXT NOT NULL,

    CONSTRAINT "VaultClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerSession" (
    "id" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "OwnerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalPurpose" (
    "id" TEXT NOT NULL,
    "vaultAddress" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "purposeHash" TEXT NOT NULL,
    "purposeText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalPurpose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDestination" (
    "id" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "configJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "NotificationDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSubscription" (
    "id" TEXT NOT NULL,
    "vaultAddress" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "eventKindsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "NotificationSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "beaconEventId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicEmailFollower" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),

    CONSTRAINT "PublicEmailFollower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicEmailSubscription" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "vaultAddress" TEXT NOT NULL,
    "eventKindsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "unsubscribeTokenHash" TEXT NOT NULL,

    CONSTRAINT "PublicEmailSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicEmailToken" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicEmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicEmailDelivery" (
    "id" TEXT NOT NULL,
    "beaconEventId" TEXT NOT NULL,
    "publicSubscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicEmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicPushSubscription" (
    "id" TEXT NOT NULL,
    "vaultAddress" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "eventKindsJson" JSONB NOT NULL,
    "subscriptionJson" JSONB NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "PublicPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicPushDelivery" (
    "id" TEXT NOT NULL,
    "beaconEventId" TEXT NOT NULL,
    "publicSubscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicPushDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BeaconEvent_vaultAddress_blockNumber_logIndex_idx" ON "BeaconEvent"("vaultAddress", "blockNumber", "logIndex");

-- CreateIndex
CREATE INDEX "BeaconEvent_vaultAddress_kind_idx" ON "BeaconEvent"("vaultAddress", "kind");

-- CreateIndex
CREATE INDEX "BeaconEvent_dispatchedAt_idx" ON "BeaconEvent"("dispatchedAt");

-- CreateIndex
CREATE INDEX "VaultSnapshot_vaultAddress_idx" ON "VaultSnapshot"("vaultAddress");

-- CreateIndex
CREATE INDEX "VaultSnapshot_vaultAddress_blockNumber_idx" ON "VaultSnapshot"("vaultAddress", "blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimNonce_nonce_key" ON "ClaimNonce"("nonce");

-- CreateIndex
CREATE INDEX "ClaimNonce_vaultAddress_idx" ON "ClaimNonce"("vaultAddress");

-- CreateIndex
CREATE INDEX "ClaimNonce_ownerAddress_idx" ON "ClaimNonce"("ownerAddress");

-- CreateIndex
CREATE INDEX "ClaimNonce_expiresAt_idx" ON "ClaimNonce"("expiresAt");

-- CreateIndex
CREATE INDEX "VaultClaim_vaultAddress_idx" ON "VaultClaim"("vaultAddress");

-- CreateIndex
CREATE INDEX "VaultClaim_ownerAddress_idx" ON "VaultClaim"("ownerAddress");

-- CreateIndex
CREATE INDEX "VaultClaim_revokedAt_idx" ON "VaultClaim"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerSession_tokenHash_key" ON "OwnerSession"("tokenHash");

-- CreateIndex
CREATE INDEX "OwnerSession_ownerAddress_idx" ON "OwnerSession"("ownerAddress");

-- CreateIndex
CREATE INDEX "OwnerSession_expiresAt_idx" ON "OwnerSession"("expiresAt");

-- CreateIndex
CREATE INDEX "OwnerSession_revokedAt_idx" ON "OwnerSession"("revokedAt");

-- CreateIndex
CREATE INDEX "WithdrawalPurpose_vaultAddress_idx" ON "WithdrawalPurpose"("vaultAddress");

-- CreateIndex
CREATE INDEX "WithdrawalPurpose_ownerAddress_idx" ON "WithdrawalPurpose"("ownerAddress");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalPurpose_vaultAddress_purposeHash_key" ON "WithdrawalPurpose"("vaultAddress", "purposeHash");

-- CreateIndex
CREATE INDEX "NotificationDestination_ownerAddress_idx" ON "NotificationDestination"("ownerAddress");

-- CreateIndex
CREATE INDEX "NotificationDestination_ownerAddress_disabledAt_idx" ON "NotificationDestination"("ownerAddress", "disabledAt");

-- CreateIndex
CREATE INDEX "NotificationSubscription_vaultAddress_idx" ON "NotificationSubscription"("vaultAddress");

-- CreateIndex
CREATE INDEX "NotificationSubscription_ownerAddress_idx" ON "NotificationSubscription"("ownerAddress");

-- CreateIndex
CREATE INDEX "NotificationSubscription_destinationId_idx" ON "NotificationSubscription"("destinationId");

-- CreateIndex
CREATE INDEX "NotificationSubscription_vaultAddress_disabledAt_idx" ON "NotificationSubscription"("vaultAddress", "disabledAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_beaconEventId_idx" ON "NotificationDelivery"("beaconEventId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_subscriptionId_idx" ON "NotificationDelivery"("subscriptionId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_destinationId_idx" ON "NotificationDelivery"("destinationId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_idx" ON "NotificationDelivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_beaconEventId_subscriptionId_key" ON "NotificationDelivery"("beaconEventId", "subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicEmailFollower_email_key" ON "PublicEmailFollower"("email");

-- CreateIndex
CREATE INDEX "PublicEmailFollower_verifiedAt_idx" ON "PublicEmailFollower"("verifiedAt");

-- CreateIndex
CREATE INDEX "PublicEmailFollower_unsubscribedAt_idx" ON "PublicEmailFollower"("unsubscribedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicEmailSubscription_unsubscribeTokenHash_key" ON "PublicEmailSubscription"("unsubscribeTokenHash");

-- CreateIndex
CREATE INDEX "PublicEmailSubscription_vaultAddress_idx" ON "PublicEmailSubscription"("vaultAddress");

-- CreateIndex
CREATE INDEX "PublicEmailSubscription_followerId_idx" ON "PublicEmailSubscription"("followerId");

-- CreateIndex
CREATE INDEX "PublicEmailSubscription_confirmedAt_idx" ON "PublicEmailSubscription"("confirmedAt");

-- CreateIndex
CREATE INDEX "PublicEmailSubscription_disabledAt_idx" ON "PublicEmailSubscription"("disabledAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicEmailSubscription_followerId_vaultAddress_key" ON "PublicEmailSubscription"("followerId", "vaultAddress");

-- CreateIndex
CREATE UNIQUE INDEX "PublicEmailToken_tokenHash_key" ON "PublicEmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PublicEmailToken_followerId_idx" ON "PublicEmailToken"("followerId");

-- CreateIndex
CREATE INDEX "PublicEmailToken_subscriptionId_idx" ON "PublicEmailToken"("subscriptionId");

-- CreateIndex
CREATE INDEX "PublicEmailToken_purpose_expiresAt_idx" ON "PublicEmailToken"("purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "PublicEmailDelivery_beaconEventId_idx" ON "PublicEmailDelivery"("beaconEventId");

-- CreateIndex
CREATE INDEX "PublicEmailDelivery_publicSubscriptionId_idx" ON "PublicEmailDelivery"("publicSubscriptionId");

-- CreateIndex
CREATE INDEX "PublicEmailDelivery_status_idx" ON "PublicEmailDelivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PublicEmailDelivery_beaconEventId_publicSubscriptionId_key" ON "PublicEmailDelivery"("beaconEventId", "publicSubscriptionId");

-- CreateIndex
CREATE INDEX "PublicPushSubscription_vaultAddress_idx" ON "PublicPushSubscription"("vaultAddress");

-- CreateIndex
CREATE INDEX "PublicPushSubscription_disabledAt_idx" ON "PublicPushSubscription"("disabledAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicPushSubscription_vaultAddress_endpoint_key" ON "PublicPushSubscription"("vaultAddress", "endpoint");

-- CreateIndex
CREATE INDEX "PublicPushDelivery_beaconEventId_idx" ON "PublicPushDelivery"("beaconEventId");

-- CreateIndex
CREATE INDEX "PublicPushDelivery_publicSubscriptionId_idx" ON "PublicPushDelivery"("publicSubscriptionId");

-- CreateIndex
CREATE INDEX "PublicPushDelivery_status_idx" ON "PublicPushDelivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PublicPushDelivery_beaconEventId_publicSubscriptionId_key" ON "PublicPushDelivery"("beaconEventId", "publicSubscriptionId");

-- AddForeignKey
ALTER TABLE "BeaconEvent" ADD CONSTRAINT "BeaconEvent_vaultAddress_fkey" FOREIGN KEY ("vaultAddress") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultSnapshot" ADD CONSTRAINT "VaultSnapshot_vaultAddress_fkey" FOREIGN KEY ("vaultAddress") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimNonce" ADD CONSTRAINT "ClaimNonce_vaultAddress_fkey" FOREIGN KEY ("vaultAddress") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultClaim" ADD CONSTRAINT "VaultClaim_vaultAddress_fkey" FOREIGN KEY ("vaultAddress") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalPurpose" ADD CONSTRAINT "WithdrawalPurpose_vaultAddress_fkey" FOREIGN KEY ("vaultAddress") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSubscription" ADD CONSTRAINT "NotificationSubscription_vaultAddress_fkey" FOREIGN KEY ("vaultAddress") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSubscription" ADD CONSTRAINT "NotificationSubscription_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "NotificationDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_beaconEventId_fkey" FOREIGN KEY ("beaconEventId") REFERENCES "BeaconEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "NotificationSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "NotificationDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicEmailSubscription" ADD CONSTRAINT "PublicEmailSubscription_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "PublicEmailFollower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicEmailSubscription" ADD CONSTRAINT "PublicEmailSubscription_vaultAddress_fkey" FOREIGN KEY ("vaultAddress") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicEmailToken" ADD CONSTRAINT "PublicEmailToken_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "PublicEmailFollower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicEmailToken" ADD CONSTRAINT "PublicEmailToken_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PublicEmailSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicEmailDelivery" ADD CONSTRAINT "PublicEmailDelivery_beaconEventId_fkey" FOREIGN KEY ("beaconEventId") REFERENCES "BeaconEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicEmailDelivery" ADD CONSTRAINT "PublicEmailDelivery_publicSubscriptionId_fkey" FOREIGN KEY ("publicSubscriptionId") REFERENCES "PublicEmailSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicPushSubscription" ADD CONSTRAINT "PublicPushSubscription_vaultAddress_fkey" FOREIGN KEY ("vaultAddress") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicPushDelivery" ADD CONSTRAINT "PublicPushDelivery_beaconEventId_fkey" FOREIGN KEY ("beaconEventId") REFERENCES "BeaconEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicPushDelivery" ADD CONSTRAINT "PublicPushDelivery_publicSubscriptionId_fkey" FOREIGN KEY ("publicSubscriptionId") REFERENCES "PublicPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

