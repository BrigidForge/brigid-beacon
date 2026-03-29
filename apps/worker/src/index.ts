/**
 * Beacon worker – event indexer + notification dispatcher.
 * 1. Polls factory + vault events, normalizes, persists to DB.
 * 2. Dispatches undispatched BeaconEvents to Telegram / Discord / Webhook.
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })
import { JsonRpcProvider } from 'ethers';
import { config } from './config.js';
import { logger } from './logger.js';
import { runIndexerCycle } from './indexer.js';
import { clampBlockChunkSize, isBlockRangeTooLargeError, shrinkBlockChunkSize } from './indexer-chunking.js';
import { runDispatcherCycle } from './dispatcher.js';
import { runCleanupCycle } from './cleanup.js';
import { markDispatcherRun, markIndexerError, markIndexerSuccess } from './ops-state.js';

async function main() {
  const provider = new JsonRpcProvider(config.rpcUrl, undefined, { batchMaxCount: 1 });
  let pollIntervalMs = config.pollIntervalMs;
  let blockChunkSize = config.blockChunkSize;
  let maxBlockChunkSize = config.blockChunkSize;

  logger.info('Beacon worker started', {
    chainId: config.chainId,
    factory: config.factoryAddress,
    pollIntervalMs: config.pollIntervalMs,
  });

  for (;;) {
    try {
      const { processed, toBlock, discoveryMode, lagBlocks } = await runIndexerCycle(provider, {
        blockChunkSize,
        factoryRegistryRefreshMs: config.factoryRegistryRefreshMs,
      });
      await markIndexerSuccess({ discoveryMode });
      if (processed > 0) {
        logger.info('Indexer cycle', {
          eventsProcessed: processed,
          toBlock,
          lagBlocks,
          blockChunkSize,
          pollIntervalMs,
        });
      }

      const inSteadyState = lagBlocks <= config.steadyStateLagBlocks;
      pollIntervalMs = inSteadyState ? config.steadyStatePollIntervalMs : config.pollIntervalMs;
      const targetBlockChunkSize = inSteadyState ? config.steadyStateBlockChunkSize : config.blockChunkSize;
      blockChunkSize = clampBlockChunkSize(targetBlockChunkSize, maxBlockChunkSize);
    } catch (err) {
      if (isBlockRangeTooLargeError(err)) {
        const nextBlockChunkSize = shrinkBlockChunkSize(blockChunkSize);
        if (nextBlockChunkSize !== blockChunkSize) {
          logger.warn('RPC rejected current block range; shrinking indexer chunk size', {
            blockChunkSize,
            nextBlockChunkSize,
          });
          maxBlockChunkSize = Math.min(maxBlockChunkSize, nextBlockChunkSize);
          blockChunkSize = nextBlockChunkSize;
        }
      }
      await markIndexerError(err instanceof Error ? err.message : String(err));
      logger.error('Indexer cycle error', {
        error: err instanceof Error ? err.message : String(err),
        blockChunkSize,
        pollIntervalMs,
      });
    }

    try {
      const { processed: dispatched, sent, errors } = await runDispatcherCycle();
      await markDispatcherRun();
      if (dispatched > 0) {
        logger.info('Dispatcher cycle', {
          eventsProcessed: dispatched,
          notificationsSent: sent,
          errors,
        });
      }
    } catch (err) {
      logger.error('Dispatcher cycle error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      const cleanup = await runCleanupCycle();
      if (
        cleanup.deletedPublicEmailTokens > 0 ||
        cleanup.deletedPublicEmailSubscriptions > 0 ||
        cleanup.deletedPublicEmailFollowers > 0
      ) {
        logger.info('Cleanup cycle', cleanup);
      }
    } catch (err) {
      logger.error('Cleanup cycle error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

main();
