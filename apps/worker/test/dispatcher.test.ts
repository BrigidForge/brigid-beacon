import test from 'node:test';
import assert from 'node:assert/strict';
import { getAddress } from 'ethers';

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/beacon_bsc_testnet';
process.env.RPC_URL ??= 'http://127.0.0.1:8545';
process.env.FACTORY_ADDRESS ??= '0x0000000000000000000000000000000000000001';
const { ensureTestDatabase } = await import('../../test-support/ensure-test-db.js');
await ensureTestDatabase(process.env.DATABASE_URL);

const { runDispatcherCycle } = await import('../src/dispatcher.js');
const { prisma } = await import('../src/db.js');
let databaseAvailable = true;

try {
  await prisma.$connect();
} catch {
  databaseAvailable = false;
}

const dbTest = databaseAvailable ? test : test.skip;

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
  if (databaseAvailable) {
    await resetTables();
  }
  await prisma.$disconnect();
});

dbTest('runDispatcherCycle records sent delivery rows for subscription-backed notifications', async () => {
  await seedDispatcherFixture();

  const calls: string[] = [];
  const eventBefore = await prisma.beaconEvent.findUniqueOrThrow({ where: { id: eventId } });
  const result = await runDispatcherCycle({
    prismaClient: prisma as never,
    providers: [],
    sendSubscription: async (destination) => {
      calls.push(destination.id);
      return { providerMessageId: 'provider-123' };
    },
  });

  assert.ok(result.processed >= 1);
  assert.ok(result.sent >= 1);
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
  assert.equal(eventBefore.dispatchedAt, null);
});

dbTest('runDispatcherCycle leaves event undispatched when a subscription delivery fails', async () => {
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

dbTest('runDispatcherCycle defers withdrawal request notifications until the cancel window closes', async () => {
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
      eventKindsJson: ['protected_withdrawal_requested'],
    },
  });

  const requestEventId = '31337:0xwithdrawrequest:0';
  await prisma.beaconEvent.create({
    data: {
      id: requestEventId,
      vaultAddress,
      kind: 'protected_withdrawal_requested',
      blockNumber: 11,
      transactionHash: '0xwithdrawrequest',
      logIndex: 0,
      timestamp: new Date('2026-01-01T00:01:00.000Z'),
      payload: {
        owner: ownerAddress,
        amount: '250',
        purposeHash: '0xabc123',
        requestedAt: '1000',
        executableAt: '1040',
        expiresAt: '1100',
      },
    },
  });

  const originalDateNow = Date.now;
  const calls: string[] = [];

  try {
    Date.now = () => 1_015_000;
    const deferred = await runDispatcherCycle({
      prismaClient: prisma as never,
      providers: [],
      sendSubscription: async (row) => {
        calls.push(row.id);
        return { providerMessageId: 'provider-123' };
      },
    });

    assert.equal(deferred.processed, 1);
    assert.equal(deferred.sent, 0);
    assert.equal(calls.length, 0);
    assert.equal(
      (await prisma.beaconEvent.findUnique({ where: { id: requestEventId } }))?.dispatchedAt,
      null,
    );

    Date.now = () => 1_021_000;
    const dispatched = await runDispatcherCycle({
      prismaClient: prisma as never,
      providers: [],
      sendSubscription: async (row) => {
        calls.push(row.id);
        return { providerMessageId: 'provider-456' };
      },
    });

    assert.equal(dispatched.processed, 1);
    assert.equal(dispatched.sent, 1);
    assert.equal(calls.length, 1);
    assert.ok(
      (await prisma.beaconEvent.findUnique({ where: { id: requestEventId } }))?.dispatchedAt,
    );
  } finally {
    Date.now = originalDateNow;
  }
});

dbTest('runDispatcherCycle skips delayed withdrawal request notifications once a terminal event exists', async () => {
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
      eventKindsJson: ['protected_withdrawal_requested'],
    },
  });

  const requestEventId = '31337:0xwithdrawrequestskip:0';
  await prisma.beaconEvent.createMany({
    data: [
      {
        id: requestEventId,
        vaultAddress,
        kind: 'protected_withdrawal_requested',
        blockNumber: 11,
        transactionHash: '0xwithdrawrequestskip',
        logIndex: 0,
        timestamp: new Date('2026-01-01T00:01:00.000Z'),
        payload: {
          owner: ownerAddress,
          amount: '250',
          purposeHash: '0xskip123',
          requestedAt: '1000',
          executableAt: '1040',
          expiresAt: '1100',
        },
      },
      {
        id: '31337:0xwithdrawrequestskip:1',
        vaultAddress,
        kind: 'withdrawal_canceled',
        blockNumber: 12,
        transactionHash: '0xwithdrawrequestskip',
        logIndex: 1,
        timestamp: new Date('2026-01-01T00:01:10.000Z'),
        payload: {
          owner: ownerAddress,
          amount: '250',
          purposeHash: '0xskip123',
          canceledAt: '1010',
        },
      },
    ],
  });

  const originalDateNow = Date.now;
  const calls: string[] = [];

  try {
    Date.now = () => 1_021_000;
    const result = await runDispatcherCycle({
      prismaClient: prisma as never,
      providers: [],
      sendSubscription: async (row) => {
        calls.push(row.id);
        return { providerMessageId: 'provider-789' };
      },
    });

    assert.equal(result.processed, 2);
    assert.equal(result.sent, 0);
    assert.equal(calls.length, 0);
    assert.ok(
      (await prisma.beaconEvent.findUnique({ where: { id: requestEventId } }))?.dispatchedAt,
    );
  } finally {
    Date.now = originalDateNow;
  }
});

dbTest('runDispatcherCycle sends public email notifications for actionable withdrawal requests', async () => {
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

  const follower = await prisma.publicEmailFollower.create({
    data: {
      email: 'alerts@example.com',
      verifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });

  await prisma.publicEmailSubscription.create({
    data: {
      followerId: follower.id,
      vaultAddress,
      eventKindsJson: ['protected_withdrawal_requested'],
      confirmedAt: new Date('2026-01-01T00:00:00.000Z'),
      unsubscribeTokenHash: 'unsubscribe-hash',
    },
  });

  const requestEventId = '31337:0xpublicwithdrawrequest:0';
  await prisma.beaconEvent.create({
    data: {
      id: requestEventId,
      vaultAddress,
      kind: 'protected_withdrawal_requested',
      blockNumber: 11,
      transactionHash: '0xpublicwithdrawrequest',
      logIndex: 0,
      timestamp: new Date('2026-01-01T00:01:00.000Z'),
      payload: {
        owner: ownerAddress,
        amount: '250',
        purposeHash: '0xpublic123',
        requestedAt: '1000',
        executableAt: '1040',
        expiresAt: '1100',
      },
    },
  });

  const originalDateNow = Date.now;

  try {
    Date.now = () => 1_021_000;

    const result = await runDispatcherCycle({
      prismaClient: prisma as never,
      providers: [],
      sendSubscription: async () => {
        throw new Error('should not send owner subscription notifications');
      },
    });

    assert.equal(result.processed, 1);
    assert.equal(result.sent, 0);
    assert.equal(result.errors, 1);

    const deliveries = await prisma.publicEmailDelivery.findMany({
      where: { beaconEventId: requestEventId },
      include: {
        subscription: {
          include: {
            follower: true,
          },
        },
      },
    });

    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0]?.subscription.follower.email, 'alerts@example.com');
    assert.equal(deliveries[0]?.status, 'failed');
    assert.match(deliveries[0]?.errorMessage ?? '', /Brevo public email delivery is not configured/i);
  } finally {
    Date.now = originalDateNow;
  }
});
