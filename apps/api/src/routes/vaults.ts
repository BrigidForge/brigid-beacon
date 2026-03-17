import type { FastifyInstance } from 'fastify';
import type { DeploymentProof, VaultEventsResponse } from '@brigid/beacon-shared-types';
import { normalizeAddress, toNormalizedEvent, toVaultMetadata } from '../context.js';
import type { ReturnTypeContext } from './types.js';

export async function registerVaultRoutes(app: FastifyInstance, ctx: ReturnTypeContext) {
  app.get('/api/v1/vaults/:address', async (req, reply) => {
    const address = normalizeAddress((req.params as { address: string }).address);
    if (!address) return reply.status(404).send({ error: 'Not found', message: 'Invalid vault address.' });
    const vault = await ctx.getVaultByAddress(address);
    if (!vault) return reply.status(404).send({ error: 'Not found', message: `Vault ${address} is not indexed.` });
    return toVaultMetadata(vault);
  });

  app.get('/api/v1/vaults/:address/status', async (req, reply) => {
    const address = normalizeAddress((req.params as { address: string }).address);
    if (!address) return reply.status(404).send({ error: 'Not found', message: 'Invalid vault address.' });
    const vault = await ctx.getVaultByAddress(address);
    if (!vault) return reply.status(404).send({ error: 'Not found', message: `Vault ${address} is not indexed.` });
    return ctx.buildVaultStatusBundle(vault);
  });

  app.get('/api/v1/vaults/:address/events', async (req, reply) => {
    const address = normalizeAddress((req.params as { address: string }).address);
    if (!address) return reply.status(404).send({ error: 'Not found', message: 'Invalid vault address.' });
    const vault = await ctx.getVaultByAddress(address);
    if (!vault) return reply.status(404).send({ error: 'Not found', message: `Vault ${address} is not indexed.` });

    const query = req.query as { limit?: string; before?: string };
    const limit = Math.min(Math.max(Number.parseInt(query.limit ?? '50', 10) || 50, 1), 100);
    let where: {
      vaultAddress: string;
      OR?: Array<{ blockNumber: { lt: number } } | { blockNumber: number; logIndex: { lt: number } }>;
    } = { vaultAddress: address };

    if (query.before) {
      const cursor = await ctx.prisma.beaconEvent.findFirst({
        where: { id: query.before, vaultAddress: address },
        select: { blockNumber: true, logIndex: true },
      });
      if (cursor) {
        where = {
          vaultAddress: address,
          OR: [
            { blockNumber: { lt: cursor.blockNumber } },
            { blockNumber: cursor.blockNumber, logIndex: { lt: cursor.logIndex } },
          ],
        };
      }
    }

    const rows = await ctx.prisma.beaconEvent.findMany({
      where,
      orderBy: [{ blockNumber: 'desc' }, { logIndex: 'desc' }],
      take: limit,
    });
    const response: VaultEventsResponse = { events: rows.reverse().map(toNormalizedEvent) };
    return response;
  });

  app.get('/api/v1/vaults/:address/proof', async (req, reply) => {
    const address = normalizeAddress((req.params as { address: string }).address);
    if (!address) return reply.status(404).send({ error: 'Not found', message: 'Invalid vault address.' });
    const vault = await ctx.getVaultByAddress(address);
    if (!vault) return reply.status(404).send({ error: 'Not found', message: `Vault ${address} is not indexed.` });
    const proof: DeploymentProof = {
      vault: vault.id,
      chainId: vault.chainId ?? ctx.config.chainId,
      factory: ctx.config.factoryAddress,
      deployer: vault.deployer,
      blockNumber: vault.deployedAtBlock,
      transactionHash: vault.deployedAtTx,
      config: {
        token: vault.token,
        owner: vault.owner,
        totalAllocation: vault.totalAllocation,
        startTime: vault.startTime,
        cliffDuration: vault.cliffDuration,
        intervalDuration: vault.intervalDuration,
        intervalCount: vault.intervalCount,
        cancelWindow: vault.cancelWindow,
        withdrawalDelay: vault.withdrawalDelay,
        executionWindow: vault.executionWindow,
      },
    };
    return proof;
  });
}
