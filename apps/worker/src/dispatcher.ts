/**
 * Event dispatcher: find undispatched BeaconEvents, determine notification type,
 * send via all enabled providers, mark as dispatched.
 */

import { prisma } from './db.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { getProviders, formatNotification } from './notifications/index.js';
import type { DispatcheableEvent } from './notifications/types.js';
import { sendSubscriptionNotification } from './subscription-notifications.js';

const DISPATCHABLE_KINDS = new Set([
  'vault_created',
  'vault_funded',
  'excess_deposited',
  'protected_withdrawal_requested',
  'excess_withdrawal_requested',
  'withdrawal_canceled',
  'withdrawal_executed',
  'request_expired',
]);

const BATCH_SIZE = 50;

const TERMINAL_REQUEST_KINDS = new Set([
  'withdrawal_canceled',
  'withdrawal_executed',
  'request_expired',
]);

type DispatcherRow = {
  id: string;
  vaultAddress: string;
  kind: string;
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
  timestamp: Date;
  payload: unknown;
  vault: {
    cancelWindow: string;
  };
};

type DispatcherDependencies = {
  prismaClient?: typeof prisma;
  providers?: ReturnType<typeof getProviders>;
  sendSubscription?: typeof sendSubscriptionNotification;
};

function toDispatcheable(row: DispatcherRow): DispatcheableEvent {
  return {
    id: row.id,
    vaultAddress: row.vaultAddress,
    kind: row.kind,
    blockNumber: row.blockNumber,
    transactionHash: row.transactionHash,
    timestamp: row.timestamp,
    payload: (row.payload as Record<string, unknown>) ?? {},
    chainId: config.chainId,
  };
}

function getPayloadValue(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function isWithdrawalRequestKind(kind: string): boolean {
  return kind === 'protected_withdrawal_requested' || kind === 'excess_withdrawal_requested';
}

async function getRequestDispatchDecision(
  prismaClient: typeof prisma,
  row: DispatcherRow,
): Promise<'defer' | 'skip' | 'send'> {
  if (!isWithdrawalRequestKind(row.kind)) {
    return 'send';
  }

  const requestedAt = Number(getPayloadValue(row.payload, 'requestedAt'));
  const cancelWindow = Number(row.vault.cancelWindow);
  if (!Number.isFinite(requestedAt) || !Number.isFinite(cancelWindow)) {
    return 'send';
  }

  const cancelWindowEndsAt = requestedAt + cancelWindow;
  const now = Math.floor(Date.now() / 1000);
  if (now < cancelWindowEndsAt) {
    return 'defer';
  }

  const purposeHash = getPayloadValue(row.payload, 'purposeHash');
  if (!purposeHash) {
    return 'send';
  }

  const laterEvents = await prismaClient.beaconEvent.findMany({
    where: {
      vaultAddress: row.vaultAddress,
      kind: { in: Array.from(TERMINAL_REQUEST_KINDS) },
      blockNumber: { gte: row.blockNumber },
    },
    select: {
      kind: true,
      blockNumber: true,
      logIndex: true,
      payload: true,
    },
    orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
  });

  const hasTerminalEvent = laterEvents.some((event) => {
    const sameOrEarlierLog =
      event.blockNumber < row.blockNumber ||
      (event.blockNumber === row.blockNumber && event.logIndex <= row.logIndex);
    if (sameOrEarlierLog) return false;
    return getPayloadValue(event.payload, 'purposeHash') === purposeHash;
  });

  return hasTerminalEvent ? 'skip' : 'send';
}

function subscriptionMatchesKind(eventKindsJson: unknown, kind: string): boolean {
  return Array.isArray(eventKindsJson) && eventKindsJson.includes(kind);
}

export async function runDispatcherCycle(deps: DispatcherDependencies = {}): Promise<{
  processed: number;
  sent: number;
  errors: number;
}> {
  const prismaClient = deps.prismaClient ?? prisma;
  const providers = deps.providers ?? getProviders();
  const sendSubscription = deps.sendSubscription ?? sendSubscriptionNotification;
  if (providers.length === 0) {
    const activeSubscriptions = await prismaClient.notificationSubscription.count({
      where: { disabledAt: null, destination: { disabledAt: null } },
    });
    if (activeSubscriptions === 0) {
      return { processed: 0, sent: 0, errors: 0 };
    }
  }

  const undispatched = await prismaClient.beaconEvent.findMany({
    where: { dispatchedAt: null },
    include: {
      vault: {
        select: { cancelWindow: true },
      },
    },
    orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
    take: BATCH_SIZE,
  });

  let sent = 0;
  let errors = 0;

  for (const row of undispatched) {
    if (!DISPATCHABLE_KINDS.has(row.kind)) {
      await prismaClient.beaconEvent.update({
        where: { id: row.id },
        data: { dispatchedAt: new Date() },
      });
      continue;
    }

    const decision = await getRequestDispatchDecision(prismaClient, row);
    if (decision === 'defer') {
      continue;
    }
    if (decision === 'skip') {
      await prismaClient.beaconEvent.update({
        where: { id: row.id },
        data: { dispatchedAt: new Date() },
      });
      continue;
    }

    const event = toDispatcheable(row);
    const formatted = formatNotification(event, config.explorerBaseUrl);
    const subscriptions = await prismaClient.notificationSubscription.findMany({
      where: {
        vaultAddress: row.vaultAddress,
        disabledAt: null,
        destination: {
          disabledAt: null,
        },
      },
      include: {
        destination: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const matchingSubscriptions = subscriptions.filter((subscription) =>
      subscriptionMatchesKind(subscription.eventKindsJson, row.kind),
    );

    let allOk = true;
    if (matchingSubscriptions.length > 0) {
      for (const subscription of matchingSubscriptions) {
        const attemptAt = new Date();
        const existing = await prismaClient.notificationDelivery.upsert({
          where: {
            beaconEventId_subscriptionId: {
              beaconEventId: event.id,
              subscriptionId: subscription.id,
            },
          },
          update: {},
          create: {
            beaconEventId: event.id,
            subscriptionId: subscription.id,
            destinationId: subscription.destinationId,
            status: 'pending',
          },
        });

        try {
          const result = await sendSubscription(subscription.destination, event, formatted);
          await prismaClient.notificationDelivery.update({
            where: {
              beaconEventId_subscriptionId: {
                beaconEventId: event.id,
                subscriptionId: subscription.id,
              },
            },
            data: {
              status: 'sent',
              providerMessageId: result?.providerMessageId ?? null,
              attemptCount: existing.attemptCount + 1,
              lastAttemptAt: attemptAt,
              deliveredAt: attemptAt,
              errorMessage: null,
            },
          });
          sent++;
        } catch (err) {
          allOk = false;
          errors++;
          await prismaClient.notificationDelivery.update({
            where: {
              beaconEventId_subscriptionId: {
                beaconEventId: event.id,
                subscriptionId: subscription.id,
              },
            },
            data: {
              status: 'failed',
              attemptCount: existing.attemptCount + 1,
              lastAttemptAt: attemptAt,
              errorMessage: err instanceof Error ? err.message : String(err),
            },
          });
          logger.error('Dispatcher subscription delivery error', {
            eventId: event.id,
            kind: event.kind,
            destinationId: subscription.destinationId,
            subscriptionId: subscription.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } else {
      for (const provider of providers) {
        try {
          await provider.send(event, formatted);
          sent++;
        } catch (err) {
          allOk = false;
          errors++;
          logger.error('Dispatcher provider error', {
            eventId: event.id,
            kind: event.kind,
            provider: provider.name,
            error: err instanceof Error ? err.message : String(err),
          });
          // Continue to other providers so one failure does not block the rest.
        }
      }
    }

    if (allOk && (matchingSubscriptions.length > 0 || providers.length > 0)) {
      await prismaClient.beaconEvent.update({
        where: { id: row.id },
        data: { dispatchedAt: new Date() },
      });
    } else if (matchingSubscriptions.length === 0 && providers.length === 0) {
      logger.info('Dispatcher found no active destinations for event', {
        eventId: event.id,
        kind: event.kind,
        vault: event.vaultAddress,
      });
    }
  }

  if (undispatched.length > 0) {
    logger.info('Dispatcher cycle complete', {
      eventsProcessed: undispatched.length,
      notificationsSent: sent,
      errors,
    });
  }

  return {
    processed: undispatched.length,
    sent,
    errors,
  };
}
