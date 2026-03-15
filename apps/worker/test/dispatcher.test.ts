import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { getAddress } from 'ethers';

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/beacon_owner_claims_validation';
process.env.RPC_URL ??= 'http://127.0.0.1:8545';
process.env.FACTORY_ADDRESS ??= '0x0000000000000000000000000000000000000001';

const { runDispatcherCycle } = await import('../src/dispatcher.js');

const prisma = new PrismaClient({
  datasourceUrl: 'postgresql://postgres:postgres@127.0.0.1:5432/beacon_owner_claims_validation',
});

const vaultAddress = getAddress('0x00000000000000000000000000000000000000d1');
const ownerAddress = getAddress('0x00000000000000000000000000000000000000d2');
const tokenAddress = getAddress('0x00000000000000000000000000000000000000d3');
const eventId = '31337:0xworkerdispatch:0';

async function resetTables() {
  await prisma.notificationDelivery.deleteMany({ where: { beaconEventId: eventId } });
  await prisma.notificationSubscription.deleteMany({ where: { vaultAddress } });
  await prisma.notificationDestination.deleteMany({ where: { ownerAddress } });
  await prisma.vaultClaim.deleteMany({ where: { vaultAddress } });
  await prisma.claimNonce.deleteMany({ where: { vaultAddress } });
  await prisma.beaconEvent.deleteMany({ where: { vaultAddress } });
  await prisma.vaultSnapshot.deleteMany({ where: { vaultAddress } });
  await prisma.vault.deleteMany({ where: { id: vaultAddress } });
}

async function seedDispatcherFixture() {
  await resetTables();

  await prisma.vault.create({
    data: {
      id: vaultAddress,
      chainId: 31337,
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
      deployedAtTx: '0xworkerdeploy',
      deployer: ownerAddress,
    },
  });

  await prisma.vaultClaim.create({
    data: {
      vaultAddress,
      ownerAddress,
      lastVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      claimMethod: 'wallet_signature',
      signatureDigest: 'test-digest',
    },
  });

  const destination = await prisma.notificationDestination.create({
    data: {
      ownerAddress,
      kind: 'webhook',
      label: 'Worker test hook',
      configJson: { url: 'https://example.com/test-hook' },
    },
  });

  await prisma.notificationSubscription.create({
    data: {
      vaultAddress,
      destinationId: destination.id,
      ownerAddress,
      eventKindsJson: ['vault_funded'],
    },
  });

  await prisma.beaconEvent.create({
    data: {
      id: eventId,
      vaultAddress,
      kind: 'vault_funded',
      blockNumber: 11,
      transactionHash: '0xworkerdispatch',
      logIndex: 0,
      timestamp: new Date('2026-01-01T00:01:00.000Z'),
      payload: {
        token: tokenAddress,
        amount: '1000',
      },
    },
  });
}

test.after(async () => {
  await resetTables();
  await prisma.$disconnect();
});

test('runDispatcherCycle records sent delivery rows for subscription-backed notifications', async () => {
  await seedDispatcherFixture();

  const calls: string[] = [];
  const result = await runDispatcherCycle({
    prismaClient: prisma as never,
    providers: [],
    sendSubscription: async (destination) => {
      calls.push(destination.id);
      return { providerMessageId: 'provider-123' };
    },
  });

  assert.equal(result.processed, 1);
  assert.equal(result.sent, 1);
  assert.equal(result.errors, 0);
  assert.equal(calls.length, 1);

  const delivery = await prisma.notificationDelivery.findUnique({
    where: {
      beaconEventId_subscriptionId: {
        beaconEventId: eventId,
        subscriptionId: (await prisma.notificationSubscription.findFirstOrThrow({ where: { vaultAddress } })).id,
      },
    },
  });
  assert.equal(delivery?.status, 'sent');
  assert.equal(delivery?.attemptCount, 1);
  assert.equal(delivery?.providerMessageId, 'provider-123');

  const event = await prisma.beaconEvent.findUnique({ where: { id: eventId } });
  assert.ok(event?.dispatchedAt);
});

test('runDispatcherCycle leaves event undispatched when a subscription delivery fails', async () => {
  await seedDispatcherFixture();

  const result = await runDispatcherCycle({
    prismaClient: prisma as never,
    providers: [],
    sendSubscription: async () => {
      throw new Error('simulated delivery failure');
    },
  });

  assert.equal(result.processed, 1);
  assert.equal(result.sent, 0);
  assert.equal(result.errors, 1);

  const subscription = await prisma.notificationSubscription.findFirstOrThrow({ where: { vaultAddress } });
  const delivery = await prisma.notificationDelivery.findUnique({
    where: {
      beaconEventId_subscriptionId: {
        beaconEventId: eventId,
        subscriptionId: subscription.id,
      },
    },
  });
  assert.equal(delivery?.status, 'failed');
  assert.equal(delivery?.attemptCount, 1);
  assert.match(delivery?.errorMessage ?? '', /simulated delivery failure/);

  const event = await prisma.beaconEvent.findUnique({ where: { id: eventId } });
  assert.equal(event?.dispatchedAt, null);
});
