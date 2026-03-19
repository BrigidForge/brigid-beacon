import type { FastifyInstance } from 'fastify';
import { normalizeAddress, toVaultMetadata } from '../context.js';
import type { ReturnTypeContext } from './types.js';

export async function registerHealthAnalyticsRoutes(app: FastifyInstance, ctx: ReturnTypeContext) {
  app.get('/api/v1/operator/health', async (_req, reply) => {
    const indexerState = await ctx.prisma.indexerState.findUnique({
      where: { id: ctx.config.indexerStateId },
    });

    if (!ctx.chainProvider) {
      return reply.status(503).send({
        error: 'Unavailable',
        message: 'RPC_URL is not configured for operator health checks.',
      });
    }

    const [chainHeadNumber, indexedBlock, vaultCount, beaconEventCount, activeSubscriptionCount, pendingDeliveryCount, failedDeliveryCount] = await Promise.all([
      ctx.chainProvider.getBlockNumber(),
      indexerState?.lastBlockNumber ? ctx.chainProvider.getBlock(indexerState.lastBlockNumber) : Promise.resolve(null),
      ctx.prisma.vault.count(),
      ctx.prisma.beaconEvent.count(),
      ctx.prisma.notificationSubscription.count({ where: { disabledAt: null } }),
      ctx.prisma.notificationDelivery.count({ where: { status: 'pending' } }),
      ctx.prisma.notificationDelivery.count({ where: { status: { not: 'sent' } } }),
    ]);

    const chainHeadBlock = await ctx.chainProvider.getBlock(chainHeadNumber);
    const lagBlocks = indexerState ? Math.max(0, chainHeadNumber - indexerState.lastBlockNumber) : chainHeadNumber;
    const lagSeconds =
      chainHeadBlock?.timestamp != null && indexedBlock?.timestamp != null
        ? Math.max(0, chainHeadBlock.timestamp - indexedBlock.timestamp)
        : null;
    const staleThresholdMs = ctx.config.pollIntervalMs * 3;
    const lastIndexerRunAt = indexerState?.lastIndexerRunAt ?? null;
    const isStale = lastIndexerRunAt == null ? true : Date.now() - lastIndexerRunAt.getTime() > staleThresholdMs;

    return {
      chainId: ctx.config.chainId,
      factoryAddress: ctx.config.factoryAddress,
      chainHeadBlock: chainHeadNumber,
      indexer: {
        stateId: indexerState?.id ?? 'default',
        stateIdConfigured: ctx.config.indexerStateId,
        lastIndexedBlock: indexerState?.lastBlockNumber ?? 0,
        lastIndexedBlockHash: indexerState?.lastBlockHash ?? null,
        lastIndexedAt: indexerState?.lastIndexedAt?.toISOString() ?? null,
        lastIndexerRunAt: indexerState?.lastIndexerRunAt?.toISOString() ?? null,
        lastDispatcherRunAt: indexerState?.lastDispatcherRunAt?.toISOString() ?? null,
        discoveryMode: indexerState?.discoveryMode ?? null,
        lagBlocks,
        lagSeconds,
        isStale,
        staleThresholdMs,
        lastErrorAt: indexerState?.lastErrorAt?.toISOString() ?? null,
        lastErrorMessage: indexerState?.lastErrorMessage ?? null,
      },
      stats: {
        vaultCount,
        beaconEventCount,
        activeSubscriptionCount,
        pendingDeliveryCount,
        failedDeliveryCount,
      },
    };
  });

  app.get('/api/v1/operator/vaults', async (req, reply) => {
    const ownerAddress = normalizeAddress((req.query as { ownerAddress?: string }).ownerAddress ?? '');
    if (!ownerAddress) {
      return reply.status(400).send({
        error: 'Bad request',
        message: 'A valid ownerAddress query parameter is required.',
      });
    }

    const vaults = await ctx.prisma.vault.findMany({
      where: { owner: ownerAddress },
      orderBy: [{ createdAt: 'desc' }, { deployedAtBlock: 'desc' }],
    });

    const statuses = await Promise.all(
      vaults.map(async (vault) => ({
        metadata: toVaultMetadata(vault),
        status: await ctx.buildVaultStatusBundle(vault),
      })),
    );

    return {
      ownerAddress,
      vaults: statuses,
    };
  });

  app.get('/api/v1/analytics/overview', async () => {
    const [vaults, beaconEventCount] = await Promise.all([
      ctx.prisma.vault.findMany({
        select: { id: true, token: true, owner: true, deployer: true },
      }),
      ctx.prisma.beaconEvent.count(),
    ]);

    return {
      vaultCount: vaults.length,
      tokenCount: new Set(vaults.map((vault) => vault.token)).size,
      ownerCount: new Set(vaults.map((vault) => vault.owner)).size,
      deployerCount: new Set(vaults.map((vault) => vault.deployer)).size,
      beaconEventCount,
    };
  });

  app.get('/api/v1/analytics/tokens', async () => {
    const tokens = await ctx.prisma.vault.findMany({
      select: { token: true },
      distinct: ['token'],
      orderBy: { token: 'asc' },
    });
    const summaries = await Promise.all(tokens.map((entry) => ctx.buildTokenAnalytics(entry.token)));
    return {
      tokens: summaries.map((summary) => ({
        tokenAddress: summary.tokenAddress,
        vaultCount: summary.vaultCount,
        ownerCount: summary.ownerCount,
        deployerCount: summary.deployerCount,
        totalAllocation: summary.totalAllocation,
        protectedOutstandingBalance: summary.protectedOutstandingBalance,
        excessBalance: summary.excessBalance,
      })),
    };
  });

  app.get('/api/v1/analytics/tokens/:token', async (req, reply) => {
    const tokenAddress = normalizeAddress((req.params as { token: string }).token);
    if (!tokenAddress) {
      return reply.status(404).send({ error: 'Not found', message: 'Invalid token address.' });
    }
    const summary = await ctx.buildTokenAnalytics(tokenAddress);
    if (summary.vaultCount === 0) {
      return reply.status(404).send({ error: 'Not found', message: `No indexed vaults found for token ${tokenAddress}.` });
    }
    return summary;
  });
}
