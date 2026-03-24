import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getAddress, Wallet } from 'ethers';
import { encodePublicEmailActionToken } from '@brigid/beacon-shared-types';
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
import { prisma } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { getApiConfig } from '../src/config.js';

const TEST_CHAIN_ID = Number(process.env.CHAIN_ID ?? 97);
const vaultAddress = getAddress('0x00000000000000000000000000000000000000a1');
const ownerWallet = new Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const ownerAddress = ownerWallet.address;
const tokenAddress = getAddress('0x00000000000000000000000000000000000000c3');
const txBase = '0xtestapiseeded';

async function seedDemoVault() {
  await prisma.publicPushDelivery.deleteMany({ where: { subscription: { vaultAddress } } });
  await prisma.publicPushSubscription.deleteMany({ where: { vaultAddress } });
  await prisma.publicEmailDelivery.deleteMany({ where: { subscription: { vaultAddress } } });
  await prisma.publicEmailToken.deleteMany({ where: { subscription: { vaultAddress } } });
  await prisma.publicEmailSubscription.deleteMany({ where: { vaultAddress } });
  await prisma.publicEmailFollower.deleteMany({
    where: {
      email: {
        in: ['alerts@example.com', 'pending@example.com', 'manage@example.com'],
      },
    },
  });
  await prisma.notificationDelivery.deleteMany({ where: { subscription: { vaultAddress } } });
  await prisma.notificationSubscription.deleteMany({ where: { vaultAddress } });
  await prisma.notificationDestination.deleteMany({ where: { ownerAddress } });
  await prisma.ownerSession.deleteMany({ where: { ownerAddress } });
  await prisma.vaultClaim.deleteMany({ where: { vaultAddress } });
  await prisma.claimNonce.deleteMany({ where: { vaultAddress } });
  await prisma.beaconEvent.deleteMany({ where: { vaultAddress } });
  await prisma.vaultSnapshot.deleteMany({ where: { vaultAddress } });
  await prisma.vault.deleteMany({ where: { id: vaultAddress } });
  await prisma.indexerState.deleteMany({ where: { id: 'default' } });

  await prisma.vault.create({
    data: {
      id: vaultAddress,
      chainId: TEST_CHAIN_ID,
      owner: ownerAddress,
      token: tokenAddress,
      totalAllocation: '1000',
      startTime: '100',
      cliffDuration: '0',
      intervalDuration: '60',
      intervalCount: '4',
      cancelWindow: '20',
      withdrawalDelay: '40',
      executionWindow: '60',
      deployedAtBlock: 10,
      deployedAtTx: `${txBase}deploy`,
      deployer: ownerAddress,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });

  await prisma.beaconEvent.createMany({
    data: [
      {
        id: `${TEST_CHAIN_ID}:${txBase}deploy:0`,
        vaultAddress,
        kind: 'vault_created',
        blockNumber: 10,
        transactionHash: `${txBase}deploy`,
        logIndex: 0,
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        payload: {
          deployer: ownerAddress,
          token: tokenAddress,
          owner: ownerAddress,
          totalAllocation: '1000',
          startTime: '100',
          cliffDuration: '0',
          intervalDuration: '60',
          intervalCount: '4',
          cancelWindow: '20',
          withdrawalDelay: '40',
          executionWindow: '60',
        },
      },
      {
        id: `${TEST_CHAIN_ID}:${txBase}fund:0`,
        vaultAddress,
        kind: 'vault_funded',
        blockNumber: 11,
        transactionHash: `${txBase}fund`,
        logIndex: 0,
        timestamp: new Date('2026-01-01T00:01:00.000Z'),
        payload: {
          token: tokenAddress,
          amount: '1000',
        },
      },
      {
        id: `${TEST_CHAIN_ID}:${txBase}excess:0`,
        vaultAddress,
        kind: 'excess_deposited',
        blockNumber: 12,
        transactionHash: `${txBase}excess`,
        logIndex: 0,
        timestamp: new Date('2026-01-01T00:02:00.000Z'),
        payload: {
          from: ownerAddress,
          token: tokenAddress,
          amount: '50',
        },
      },
    ],
  });

  const head = 12_345_678;
  const blockHash = '0x' + 'ab'.repeat(32);
  await prisma.indexerState.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      lastBlockNumber: head,
      lastBlockHash: blockHash,
      lastIndexedAt: new Date(),
      lastIndexerRunAt: new Date(),
      lastDispatcherRunAt: new Date(),
      discoveryMode: 'event_only',
    },
    update: {
      lastBlockNumber: head,
      lastBlockHash: blockHash,
      lastIndexedAt: new Date(),
      lastIndexerRunAt: new Date(),
      lastDispatcherRunAt: new Date(),
      discoveryMode: 'event_only',
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  });
}

async function cleanupDemoVault() {
  await prisma.publicPushDelivery.deleteMany({ where: { subscription: { vaultAddress } } });
  await prisma.publicPushSubscription.deleteMany({ where: { vaultAddress } });
  await prisma.publicEmailDelivery.deleteMany({ where: { subscription: { vaultAddress } } });
  await prisma.publicEmailToken.deleteMany({ where: { subscription: { vaultAddress } } });
  await prisma.publicEmailSubscription.deleteMany({ where: { vaultAddress } });
  await prisma.publicEmailFollower.deleteMany({
    where: {
      email: {
        in: ['alerts@example.com', 'pending@example.com', 'manage@example.com'],
      },
    },
  });
  await prisma.notificationDelivery.deleteMany({ where: { subscription: { vaultAddress } } });
  await prisma.notificationSubscription.deleteMany({ where: { vaultAddress } });
  await prisma.notificationDestination.deleteMany({ where: { ownerAddress } });
  await prisma.ownerSession.deleteMany({ where: { ownerAddress } });
  await prisma.vaultClaim.deleteMany({ where: { vaultAddress } });
  await prisma.claimNonce.deleteMany({ where: { vaultAddress } });
  await prisma.beaconEvent.deleteMany({ where: { vaultAddress } });
  await prisma.vaultSnapshot.deleteMany({ where: { vaultAddress } });
  await prisma.vault.deleteMany({ where: { id: vaultAddress } });
  await prisma.indexerState.deleteMany({ where: { id: 'default' } });
}

async function cleanupVaultByAddress(address: string) {
  await prisma.notificationDelivery.deleteMany({ where: { subscription: { vaultAddress: address } } });
  await prisma.notificationSubscription.deleteMany({ where: { vaultAddress: address } });
  await prisma.vaultClaim.deleteMany({ where: { vaultAddress: address } });
  await prisma.claimNonce.deleteMany({ where: { vaultAddress: address } });
  await prisma.beaconEvent.deleteMany({ where: { vaultAddress: address } });
  await prisma.vaultSnapshot.deleteMany({ where: { vaultAddress: address } });
  await prisma.vault.deleteMany({ where: { id: address } });
}

test('Beacon API serves seeded demo vault metadata, status, events, and proof', async (t) => {
  await seedDemoVault();
  t.after(async () => {
    await cleanupDemoVault();
  });

  const app = buildApp(prisma);
  t.after(async () => {
    await app.close();
  });

  const metadataResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/vaults/${vaultAddress}`,
  });
  assert.equal(metadataResponse.statusCode, 200);
  const metadata = metadataResponse.json();
  assert.equal(metadata.address, vaultAddress);
  assert.equal(metadata.owner, ownerAddress);

  const statusResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/vaults/${vaultAddress}/status`,
  });
  assert.equal(statusResponse.statusCode, 200);
  const status = statusResponse.json();
  assert.equal(status.funded, true);
  assert.equal(status.excessBalance, '50');
  assert.equal(status.availableToWithdraw, '1000');

  const eventsResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/vaults/${vaultAddress}/events?limit=20`,
  });
  assert.equal(eventsResponse.statusCode, 200);
  const eventsPayload = eventsResponse.json();
  assert.equal(eventsPayload.events.length, 3);
  assert.equal(eventsPayload.events[2].kind, 'excess_deposited');

  const proofResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/vaults/${vaultAddress}/proof`,
  });
  assert.equal(proofResponse.statusCode, 200);
  const proof = proofResponse.json();
  assert.equal(proof.vault, vaultAddress);
  assert.equal(proof.config.token, tokenAddress);
});

test('Beacon API issues and verifies owner claim nonces for indexed vaults', async (t) => {
  await seedDemoVault();
  t.after(async () => {
    await cleanupDemoVault();
  });

  const app = buildApp(prisma);
  t.after(async () => {
    await app.close();
  });

  const nonceResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/claims/nonce',
    payload: {
      vaultAddress,
      ownerAddress,
    },
  });
  assert.equal(nonceResponse.statusCode, 200);
  const noncePayload = nonceResponse.json();
  assert.equal(noncePayload.vaultAddress, vaultAddress);
  assert.equal(noncePayload.ownerAddress, ownerAddress);
  assert.match(noncePayload.message, /BrigidVault Beacon Claim/);

  const signature = await ownerWallet.signMessage(noncePayload.message);

  const verifyResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/claims/verify',
    payload: {
      vaultAddress,
      ownerAddress,
      nonce: noncePayload.nonce,
      signature,
    },
  });
  assert.equal(verifyResponse.statusCode, 200);
  const verifyPayload = verifyResponse.json();
  assert.equal(verifyPayload.claimed, true);
  assert.equal(verifyPayload.ownerAddress, ownerAddress);
  assert.equal(typeof verifyPayload.sessionToken, 'string');

  const storedClaim = await prisma.vaultClaim.findFirst({
    where: { vaultAddress, revokedAt: null },
    orderBy: { claimedAt: 'desc' },
  });
  assert.ok(storedClaim);
  assert.equal(storedClaim.ownerAddress, ownerAddress);

  const usedNonce = await prisma.claimNonce.findUnique({
    where: { nonce: noncePayload.nonce },
  });
  assert.ok(usedNonce?.usedAt);

  const session = await prisma.ownerSession.findFirst({
    where: { ownerAddress, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(session);
});

test('Beacon API creates, reads, and disables public browser push subscriptions', async (t) => {
  await seedDemoVault();
  t.after(async () => {
    await cleanupDemoVault();
  });

  const app = buildApp(prisma, {
    config: {
      ...getApiConfig(),
      webPushVapidPublicKey: 'test-public-vapid-key',
      webPushVapidPrivateKey: 'test-private-vapid-key',
    },
  });
  t.after(async () => {
    await app.close();
  });

  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-browser-endpoint',
    expirationTime: null,
    keys: {
      auth: 'test-auth',
      p256dh: 'test-p256dh',
    },
  };

  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/public/push-subscriptions',
    payload: {
      vaultAddress,
      eventKinds: ['vault_funded', 'withdrawal_executed'],
      subscription,
      userAgent: 'Beacon test browser',
    },
  });
  assert.equal(createResponse.statusCode, 200);
  const created = createResponse.json();
  assert.equal(created.status, 'subscribed');
  assert.equal(created.endpoint, subscription.endpoint);
  assert.deepEqual(created.eventKinds, ['vault_funded', 'withdrawal_executed']);

  const statusResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/public/push-subscriptions/status?vaultAddress=${encodeURIComponent(vaultAddress)}&endpoint=${encodeURIComponent(subscription.endpoint)}`,
  });
  assert.equal(statusResponse.statusCode, 200);
  const status = statusResponse.json();
  assert.equal(status.subscribed, true);
  assert.deepEqual(status.eventKinds, ['vault_funded', 'withdrawal_executed']);

  const unsubscribeResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/public/push-subscriptions/unsubscribe',
    payload: {
      vaultAddress,
      endpoint: subscription.endpoint,
    },
  });
  assert.equal(unsubscribeResponse.statusCode, 200);
  assert.equal(unsubscribeResponse.json().unsubscribed, true);

  const disabledStatusResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/public/push-subscriptions/status?vaultAddress=${encodeURIComponent(vaultAddress)}&endpoint=${encodeURIComponent(subscription.endpoint)}`,
  });
  assert.equal(disabledStatusResponse.statusCode, 200);
  const disabledStatus = disabledStatusResponse.json();
  assert.equal(disabledStatus.subscribed, false);
  assert.equal(disabledStatus.disabled, true);
});

test('Beacon API manages owner destinations and subscriptions after claim verification', async (t) => {
  await seedDemoVault();
  t.after(async () => {
    await cleanupDemoVault();
  });

  const app = buildApp(prisma);
  t.after(async () => {
    await app.close();
  });

  const nonceResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/claims/nonce',
    payload: {
      vaultAddress,
      ownerAddress,
    },
  });
  assert.equal(nonceResponse.statusCode, 200);
  const noncePayload = nonceResponse.json();

  const signature = await ownerWallet.signMessage(noncePayload.message);
  const verifyResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/claims/verify',
    payload: {
      vaultAddress,
      ownerAddress,
      nonce: noncePayload.nonce,
      signature,
    },
  });
  assert.equal(verifyResponse.statusCode, 200);
  const verifyPayload = verifyResponse.json();
  const authHeaders = {
    authorization: `Bearer ${verifyPayload.sessionToken}`,
  };

  const destinationResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/destinations',
    headers: authHeaders,
    payload: {
      ownerAddress,
      kind: 'webhook',
      label: 'Ops webhook',
      config: {
        url: 'https://example.com/hook/primary',
      },
    },
  });
  assert.equal(destinationResponse.statusCode, 200);
  const destination = destinationResponse.json();
  assert.equal(destination.kind, 'webhook');
  assert.equal(destination.config.hasUrl, true);

  const listDestinationsResponse = await app.inject({
    method: 'GET',
    url: '/api/v1/owner/destinations',
    headers: authHeaders,
  });
  assert.equal(listDestinationsResponse.statusCode, 200);
  const destinationList = listDestinationsResponse.json();
  assert.equal(destinationList.destinations.length, 1);

  const subscriptionResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/subscriptions',
    headers: authHeaders,
    payload: {
      vaultAddress,
      ownerAddress,
      destinationId: destination.id,
      eventKinds: ['vault_funded', 'withdrawal_executed', 'request_expired'],
    },
  });
  assert.equal(subscriptionResponse.statusCode, 200);
  const subscription = subscriptionResponse.json();
  assert.equal(subscription.vaultAddress, vaultAddress);
  assert.equal(subscription.eventKinds.length, 3);

  const listSubscriptionsResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/owner/subscriptions?vaultAddress=${vaultAddress}`,
    headers: authHeaders,
  });
  assert.equal(listSubscriptionsResponse.statusCode, 200);
  const subscriptionList = listSubscriptionsResponse.json();
  assert.equal(subscriptionList.subscriptions.length, 1);
  assert.equal(subscriptionList.subscriptions[0].destination.id, destination.id);

  const claimStatusResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/owner/claims/${vaultAddress}`,
    headers: authHeaders,
  });
  assert.equal(claimStatusResponse.statusCode, 200);
  const claimStatus = claimStatusResponse.json();
  assert.equal(claimStatus.claimed, true);

  const disableResponse = await app.inject({
    method: 'DELETE',
    url: `/api/v1/owner/subscriptions/${subscription.id}`,
    headers: authHeaders,
  });
  assert.equal(disableResponse.statusCode, 200);

  const activeSubscription = await prisma.notificationSubscription.findUnique({
    where: { id: subscription.id },
  });
  assert.ok(activeSubscription?.disabledAt);
});

test('Beacon API creates managed Telegram destinations from a signed connect link', async (t) => {
  await seedDemoVault();
  t.after(async () => {
    await cleanupDemoVault();
  });

  const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalBotUsername = process.env.TELEGRAM_BOT_USERNAME;
  const originalLinkSecret = process.env.TELEGRAM_LINK_SECRET;
  const originalFetch = globalThis.fetch;

  process.env.TELEGRAM_BOT_TOKEN = 'telegram-test-token';
  process.env.TELEGRAM_BOT_USERNAME = 'BeaconBridgeBot';
  process.env.TELEGRAM_LINK_SECRET = 'telegram-link-secret';
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

  t.after(() => {
    process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
    process.env.TELEGRAM_BOT_USERNAME = originalBotUsername;
    process.env.TELEGRAM_LINK_SECRET = originalLinkSecret;
    globalThis.fetch = originalFetch;
  });

  const app = buildApp(prisma);
  t.after(async () => {
    await app.close();
  });

  const nonceResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/claims/nonce',
    payload: { vaultAddress, ownerAddress },
  });
  const noncePayload = nonceResponse.json();
  const signature = await ownerWallet.signMessage(noncePayload.message);

  const verifyResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/claims/verify',
    payload: {
      vaultAddress,
      ownerAddress,
      nonce: noncePayload.nonce,
      signature,
    },
  });
  const verifyPayload = verifyResponse.json();
  const authHeaders = { authorization: `Bearer ${verifyPayload.sessionToken}` };

  const connectResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/destinations/telegram/connect',
    headers: authHeaders,
    payload: {
      label: 'Treasury Telegram',
    },
  });
  assert.equal(connectResponse.statusCode, 200);
  const connectPayload = connectResponse.json();
  assert.equal(connectPayload.botUsername, 'BeaconBridgeBot');
  assert.match(connectPayload.deepLinkUrl, /https:\/\/t\.me\/BeaconBridgeBot\?start=/);

  const startToken = String(connectPayload.startToken);
  const webhookResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/integrations/telegram/webhook',
    payload: {
      message: {
        text: `/start ${startToken}`,
        chat: {
          id: '123456789',
          type: 'private',
          username: 'treasury_ops',
          first_name: 'Treasury',
        },
      },
    },
  });
  assert.equal(webhookResponse.statusCode, 200);

  const listDestinationsResponse = await app.inject({
    method: 'GET',
    url: '/api/v1/owner/destinations',
    headers: authHeaders,
  });
  assert.equal(listDestinationsResponse.statusCode, 200);
  const destinationList = listDestinationsResponse.json();
  assert.equal(destinationList.destinations.length, 1);
  assert.equal(destinationList.destinations[0].kind, 'telegram');
  assert.equal(destinationList.destinations[0].label, 'Treasury Telegram');
  assert.equal(destinationList.destinations[0].config.chatId, '123456789');
  assert.equal(destinationList.destinations[0].config.hasManagedBot, true);
});

test('Beacon API disables destinations and cascades active subscriptions for that destination', async (t) => {
  await seedDemoVault();
  t.after(async () => {
    await cleanupDemoVault();
  });

  const app = buildApp(prisma);
  t.after(async () => {
    await app.close();
  });

  const nonceResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/claims/nonce',
    payload: { vaultAddress, ownerAddress },
  });
  const noncePayload = nonceResponse.json();
  const signature = await ownerWallet.signMessage(noncePayload.message);

  const verifyResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/claims/verify',
    payload: {
      vaultAddress,
      ownerAddress,
      nonce: noncePayload.nonce,
      signature,
    },
  });
  const verifyPayload = verifyResponse.json();
  const authHeaders = { authorization: `Bearer ${verifyPayload.sessionToken}` };

  const destinationResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/destinations',
    headers: authHeaders,
    payload: {
      ownerAddress,
      kind: 'webhook',
      label: 'Ops webhook',
      config: { url: 'https://example.com/hook/cascade' },
    },
  });
  const destination = destinationResponse.json();

  const subscriptionResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/subscriptions',
    headers: authHeaders,
    payload: {
      vaultAddress,
      ownerAddress,
      destinationId: destination.id,
      eventKinds: ['withdrawal_executed'],
    },
  });
  const subscription = subscriptionResponse.json();

  const disableDestinationResponse = await app.inject({
    method: 'DELETE',
    url: `/api/v1/owner/destinations/${destination.id}`,
    headers: authHeaders,
  });
  assert.equal(disableDestinationResponse.statusCode, 200);

  const disabledDestination = await prisma.notificationDestination.findUnique({
    where: { id: destination.id },
  });
  assert.ok(disabledDestination?.disabledAt);

  const disabledSubscription = await prisma.notificationSubscription.findUnique({
    where: { id: subscription.id },
  });
  assert.ok(disabledSubscription?.disabledAt);
});

test('Beacon API reports operator health with indexer lag and discovery mode', async (t) => {
  await seedDemoVault();
  t.after(async () => {
    await cleanupDemoVault();
  });

  await prisma.indexerState.update({
    where: { id: 'default' },
    data: {
      lastErrorAt: new Date('2026-01-01T00:03:00.000Z'),
      lastErrorMessage: 'example worker error',
      discoveryMode: 'event_only',
    },
  });

  const app = buildApp(prisma, {
    chainProvider: {
      async getBlockNumber() {
        return 12_345_700;
      },
      async getBlock(blockNumber: number) {
        if (blockNumber === 12_345_678) {
          return {
            hash: '0x' + 'ab'.repeat(32),
            timestamp: 1_704_067_200,
          } as Awaited<ReturnType<(typeof import('ethers'))['JsonRpcProvider']['prototype']['getBlock']>>;
        }

        return {
          hash: '0x' + 'cd'.repeat(32),
          timestamp: 1_704_067_260,
        } as Awaited<ReturnType<(typeof import('ethers'))['JsonRpcProvider']['prototype']['getBlock']>>;
      },
    },
  });
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/operator/health',
  });
  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.chainId, TEST_CHAIN_ID);
  assert.equal(payload.factoryAddress, process.env.FACTORY_ADDRESS);
  assert.equal(payload.indexer.discoveryMode, 'event_only');
  assert.equal(payload.indexer.lastErrorMessage, 'example worker error');
  assert.equal(typeof payload.stats.vaultCount, 'number');
  assert.equal(typeof payload.stats.beaconEventCount, 'number');
  assert.equal(typeof payload.stats.activeSubscriptionCount, 'number');
  assert.equal(typeof payload.indexer.lagBlocks, 'number');
  assert.equal(typeof payload.indexer.isStale, 'boolean');
});

test('Beacon API returns owner portfolio summaries for the authenticated owner', async (t) => {
  await seedDemoVault();
  t.after(async () => {
    await cleanupDemoVault();
  });

  const app = buildApp(prisma);
  t.after(async () => {
    await app.close();
  });

  const nonceResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/claims/nonce',
    payload: { vaultAddress, ownerAddress },
  });
  const noncePayload = nonceResponse.json();
  const signature = await ownerWallet.signMessage(noncePayload.message);

  const verifyResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/claims/verify',
    payload: {
      vaultAddress,
      ownerAddress,
      nonce: noncePayload.nonce,
      signature,
    },
  });
  const verifyPayload = verifyResponse.json();
  const authHeaders = { authorization: `Bearer ${verifyPayload.sessionToken}` };

  const destinationResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/owner/destinations',
    headers: authHeaders,
    payload: {
      ownerAddress,
      kind: 'webhook',
      label: 'Portfolio webhook',
      config: { url: 'https://example.com/hook/portfolio' },
    },
  });
  const destination = destinationResponse.json();

  await app.inject({
    method: 'POST',
    url: '/api/v1/owner/subscriptions',
    headers: authHeaders,
    payload: {
      vaultAddress,
      ownerAddress,
      destinationId: destination.id,
      eventKinds: ['vault_funded'],
    },
  });

  await prisma.notificationDelivery.create({
    data: {
      beaconEventId: `${TEST_CHAIN_ID}:${txBase}fund:0`,
      subscriptionId: (
        await prisma.notificationSubscription.findFirstOrThrow({
          where: { vaultAddress, ownerAddress, disabledAt: null },
        })
      ).id,
      destinationId: destination.id,
      status: 'failed',
      attemptCount: 2,
      lastAttemptAt: new Date('2026-01-01T00:05:00.000Z'),
      errorMessage: 'timeout',
    },
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/owner/portfolio',
    headers: authHeaders,
  });
  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.ownerAddress, ownerAddress);
  assert.ok(payload.vaults.length >= 1);
  const seededVault = payload.vaults.find((entry: { metadata: { address: string } }) => entry.metadata.address === vaultAddress);
  assert.ok(seededVault);
  assert.equal(seededVault.claim.claimed, true);
  assert.equal(seededVault.activeSubscriptionCount, 1);
  assert.equal(seededVault.recentDeliveryFailures, 1);
  assert.equal(seededVault.status.excessBalance, '50');
});

test('Beacon API returns token and ecosystem analytics summaries', async (t) => {
  await seedDemoVault();
  t.after(async () => {
    await cleanupDemoVault();
  });

  const secondToken = getAddress('0x00000000000000000000000000000000000000d4');
  const secondVault = getAddress('0x00000000000000000000000000000000000000b2');
  const secondDeployer = getAddress('0x00000000000000000000000000000000000000e5');
  await cleanupVaultByAddress(secondVault);
  t.after(async () => {
    await cleanupVaultByAddress(secondVault);
  });

  await prisma.vault.create({
    data: {
      id: secondVault,
      chainId: 31337,
      owner: ownerAddress,
      token: secondToken,
      totalAllocation: '2000',
      startTime: '100',
      cliffDuration: '0',
      intervalDuration: '60',
      intervalCount: '4',
      cancelWindow: '20',
      withdrawalDelay: '40',
      executionWindow: '60',
      deployedAtBlock: 13,
      deployedAtTx: `${txBase}deploy2`,
      deployer: secondDeployer,
      createdAt: new Date('2026-01-01T00:03:00.000Z'),
    },
  });

  await prisma.beaconEvent.createMany({
    data: [
      {
        id: `31337:${txBase}deploy2:0`,
        vaultAddress: secondVault,
        kind: 'vault_created',
        blockNumber: 13,
        transactionHash: `${txBase}deploy2`,
        logIndex: 0,
        timestamp: new Date('2026-01-01T00:03:00.000Z'),
        payload: {
          deployer: secondDeployer,
          token: secondToken,
          owner: ownerAddress,
          totalAllocation: '2000',
          startTime: '100',
          cliffDuration: '0',
          intervalDuration: '60',
          intervalCount: '4',
          cancelWindow: '20',
          withdrawalDelay: '40',
          executionWindow: '60',
        },
      },
      {
        id: `31337:${txBase}fund2:0`,
        vaultAddress: secondVault,
        kind: 'vault_funded',
        blockNumber: 14,
        transactionHash: `${txBase}fund2`,
        logIndex: 0,
        timestamp: new Date('2026-01-01T00:04:00.000Z'),
        payload: {
          token: secondToken,
          amount: '2000',
        },
      },
    ],
  });

  const app = buildApp(prisma);
  t.after(async () => {
    await app.close();
  });

  const overviewResponse = await app.inject({
    method: 'GET',
    url: '/api/v1/analytics/overview',
  });
  assert.equal(overviewResponse.statusCode, 200);
  const overview = overviewResponse.json();
  assert.ok(overview.vaultCount >= 2);
  assert.ok(overview.tokenCount >= 2);
  assert.ok(overview.ownerCount >= 1);
  assert.ok(overview.deployerCount >= 2);

  const tokenListResponse = await app.inject({
    method: 'GET',
    url: '/api/v1/analytics/tokens',
  });
  assert.equal(tokenListResponse.statusCode, 200);
  const tokenList = tokenListResponse.json();
  assert.ok(tokenList.tokens.length >= 2);
  assert.ok(tokenList.tokens.some((entry: { tokenAddress: string; vaultCount: number }) => entry.tokenAddress === tokenAddress && entry.vaultCount >= 1));
  assert.ok(tokenList.tokens.some((entry: { tokenAddress: string; vaultCount: number }) => entry.tokenAddress === secondToken && entry.vaultCount >= 1));

  const tokenDetailResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/analytics/tokens/${tokenAddress}`,
  });
  assert.equal(tokenDetailResponse.statusCode, 200);
  const tokenDetail = tokenDetailResponse.json();
  assert.equal(tokenDetail.tokenAddress, tokenAddress);
  assert.equal(tokenDetail.vaultCount, 1);
  assert.equal(tokenDetail.vaults[0].metadata.address, vaultAddress);
});

test('Beacon API supports public email subscription preview and confirmation flow', async (t) => {
  await seedDemoVault();
  t.after(async () => {
    await cleanupDemoVault();
  });

  const app = buildApp(prisma, {
    config: {
      ...getApiConfig(),
      publicAppBaseUrl: 'http://localhost:5174',
      publicEmailLinkSecret: 'public-email-test-secret',
      brevoApiKey: null,
      publicEmailFromAddress: 'beacon-notifications@example.com',
    },
  });
  t.after(async () => {
    await app.close();
  });

  const subscribeResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/public/email-subscriptions',
    payload: {
      vaultAddress,
      email: 'alerts@example.com',
      eventKinds: ['vault_funded', 'withdrawal_executed'],
    },
  });
  assert.equal(subscribeResponse.statusCode, 200);
  const subscribePayload = subscribeResponse.json();
  assert.equal(subscribePayload.status, 'pending_confirmation');
  assert.equal(subscribePayload.deliveryMode, 'preview');
  assert.match(subscribePayload.previewConfirmUrl ?? '', /confirmEmailToken=/);
  assert.ok(subscribePayload.previewConfirmToken);

  const statusBeforeConfirm = await app.inject({
    method: 'GET',
    url: `/api/v1/public/email-subscriptions/status?vaultAddress=${vaultAddress}&email=alerts%40example.com`,
  });
  assert.equal(statusBeforeConfirm.statusCode, 200);
  assert.equal(statusBeforeConfirm.json().confirmed, false);

  const confirmResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/public/email-subscriptions/confirm',
    payload: {
      token: subscribePayload.previewConfirmToken,
    },
  });
  assert.equal(confirmResponse.statusCode, 200);
  const confirmPayload = confirmResponse.json();
  assert.equal(confirmPayload.confirmed, true);
  assert.equal(confirmPayload.email, 'alerts@example.com');

  const statusAfterConfirm = await app.inject({
    method: 'GET',
    url: `/api/v1/public/email-subscriptions/status?vaultAddress=${vaultAddress}&email=alerts%40example.com`,
  });
  assert.equal(statusAfterConfirm.statusCode, 200);
  const confirmedStatus = statusAfterConfirm.json();
  assert.equal(confirmedStatus.confirmed, true);
  assert.deepEqual(confirmedStatus.eventKinds, ['vault_funded', 'withdrawal_executed']);
});

test('Beacon API refreshes pending public email subscriptions and updates event selections', async (t) => {
  await seedDemoVault();
  t.after(async () => {
    await cleanupDemoVault();
  });

  const app = buildApp(prisma, {
    config: {
      ...getApiConfig(),
      publicAppBaseUrl: 'http://localhost:5174',
      publicEmailLinkSecret: 'public-email-test-secret',
      brevoApiKey: null,
      publicEmailFromAddress: 'beacon-notifications@example.com',
    },
  });
  t.after(async () => {
    await app.close();
  });

  const firstResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/public/email-subscriptions',
    payload: {
      vaultAddress,
      email: 'pending@example.com',
      eventKinds: ['vault_funded'],
    },
  });
  assert.equal(firstResponse.statusCode, 200);
  const firstPayload = firstResponse.json();

  const secondResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/public/email-subscriptions',
    payload: {
      vaultAddress,
      email: 'pending@example.com',
      eventKinds: ['withdrawal_executed', 'request_expired'],
    },
  });
  assert.equal(secondResponse.statusCode, 200);
  const secondPayload = secondResponse.json();
  assert.equal(secondPayload.status, 'pending_confirmation');
  assert.equal(secondPayload.deliveryMode, 'preview');
  assert.notEqual(secondPayload.previewConfirmToken, firstPayload.previewConfirmToken);

  const statusResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/public/email-subscriptions/status?vaultAddress=${vaultAddress}&email=pending%40example.com`,
  });
  assert.equal(statusResponse.statusCode, 200);
  const statusPayload = statusResponse.json();
  assert.equal(statusPayload.confirmed, false);
  assert.deepEqual(statusPayload.eventKinds, ['withdrawal_executed', 'request_expired']);
});

test('Beacon API issues secure manage links and rejects unsubscribe tokens for manage endpoint', async (t) => {
  await seedDemoVault();
  t.after(async () => {
    await cleanupDemoVault();
  });

  const config = {
    ...getApiConfig(),
    publicAppBaseUrl: 'http://localhost:5174',
    publicEmailLinkSecret: 'public-email-test-secret',
    brevoApiKey: null,
    publicEmailFromAddress: 'beacon-notifications@example.com',
  };

  const app = buildApp(prisma, { config });
  t.after(async () => {
    await app.close();
  });

  const subscribeResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/public/email-subscriptions',
    payload: {
      vaultAddress,
      email: 'manage@example.com',
      eventKinds: ['vault_funded', 'withdrawal_executed'],
    },
  });
  const subscribePayload = subscribeResponse.json();

  await app.inject({
    method: 'POST',
    url: '/api/v1/public/email-subscriptions/confirm',
    payload: {
      token: subscribePayload.previewConfirmToken,
    },
  });

  const manageLinkResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/public/email-subscriptions/manage-link',
    payload: {
      vaultAddress,
      email: 'manage@example.com',
    },
  });
  assert.equal(manageLinkResponse.statusCode, 200);
  const manageLinkPayload = manageLinkResponse.json();
  assert.equal(manageLinkPayload.deliveryMode, 'preview');
  assert.ok(manageLinkPayload.previewManageToken);

  const manageStatusResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/public/email-subscriptions/manage?token=${encodeURIComponent(manageLinkPayload.previewManageToken)}`,
  });
  assert.equal(manageStatusResponse.statusCode, 200);
  const manageStatusPayload = manageStatusResponse.json();
  assert.equal(manageStatusPayload.email, 'manage@example.com');
  assert.equal(manageStatusPayload.confirmed, true);
  assert.ok(manageStatusPayload.unsubscribeToken);

  const subscription = await prisma.publicEmailSubscription.findFirstOrThrow({
    where: { vaultAddress, follower: { email: 'manage@example.com' } },
    include: { follower: true },
  });
  const validWrongActionToken = encodePublicEmailActionToken({
    action: 'unsubscribe',
    subscriptionId: subscription.id,
    vaultAddress,
    email: subscription.follower.email,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }, config.publicEmailLinkSecret!);

  const wrongManageResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/public/email-subscriptions/manage?token=${encodeURIComponent(validWrongActionToken)}`,
  });
  assert.equal(wrongManageResponse.statusCode, 404);

  const unsubscribeResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/public/email-subscriptions/unsubscribe',
    payload: {
      token: manageStatusPayload.unsubscribeToken,
    },
  });
  assert.equal(unsubscribeResponse.statusCode, 200);
  assert.equal(unsubscribeResponse.json().unsubscribed, true);

  const statusAfterUnsubscribe = await app.inject({
    method: 'GET',
    url: `/api/v1/public/email-subscriptions/status?vaultAddress=${vaultAddress}&email=manage%40example.com`,
  });
  assert.equal(statusAfterUnsubscribe.statusCode, 200);
  const unsubscribedStatus = statusAfterUnsubscribe.json();
  assert.equal(unsubscribedStatus.subscribed, false);
  assert.equal(unsubscribedStatus.disabled, true);

  const staleManageResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/public/email-subscriptions/manage?token=${encodeURIComponent(manageLinkPayload.previewManageToken)}`,
  });
  assert.equal(staleManageResponse.statusCode, 404);

  const resubscribeResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/public/email-subscriptions',
    payload: {
      vaultAddress,
      email: 'manage@example.com',
      eventKinds: ['request_expired'],
    },
  });
  assert.equal(resubscribeResponse.statusCode, 200);
  const resubscribePayload = resubscribeResponse.json();
  assert.equal(resubscribePayload.status, 'pending_confirmation');
  assert.equal(resubscribePayload.deliveryMode, 'preview');
});
