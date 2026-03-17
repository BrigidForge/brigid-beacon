import { prisma } from './db.js';
import { config } from './config.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runCleanupCycle(): Promise<{
  deletedPublicEmailTokens: number;
  deletedPublicEmailSubscriptions: number;
  deletedPublicEmailFollowers: number;
}> {
  const now = new Date();
  const staleSubscriptionCutoff = new Date(
    now.getTime() - config.publicEmailSubscriptionRetentionDays * DAY_MS,
  );

  const deletedPublicEmailTokens = await prisma.publicEmailToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { usedAt: { not: null } },
      ],
    },
  });

  const staleSubscriptionIds = await prisma.publicEmailSubscription.findMany({
    where: {
      confirmedAt: null,
      disabledAt: null,
      createdAt: { lt: staleSubscriptionCutoff },
    },
    select: { id: true },
  });

  const deletedPublicEmailSubscriptions =
    staleSubscriptionIds.length > 0
      ? await prisma.publicEmailSubscription.deleteMany({
          where: {
            id: { in: staleSubscriptionIds.map((row) => row.id) },
          },
        })
      : { count: 0 };

  const orphanFollowerIds = await prisma.publicEmailFollower.findMany({
    where: {
      subscriptions: {
        none: {},
      },
    },
    select: { id: true },
  });

  const deletedPublicEmailFollowers =
    orphanFollowerIds.length > 0
      ? await prisma.publicEmailFollower.deleteMany({
          where: {
            id: { in: orphanFollowerIds.map((row) => row.id) },
          },
        })
      : { count: 0 };

  return {
    deletedPublicEmailTokens: deletedPublicEmailTokens.count,
    deletedPublicEmailSubscriptions: deletedPublicEmailSubscriptions.count,
    deletedPublicEmailFollowers: deletedPublicEmailFollowers.count,
  };
}
