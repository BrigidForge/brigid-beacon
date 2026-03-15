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
import { runDispatcherCycle } from './dispatcher.js';
import { markDispatcherRun, markIndexerError, markIndexerSuccess } from './ops-state.js';

async function main() {
  const provider = new JsonRpcProvider(config.rpcUrl, undefined, { batchMaxCount: 1 });

  logger.info('Beacon worker started', {
    chainId: config.chainId,
    factory: config.factoryAddress,
    pollIntervalMs: config.pollIntervalMs,
  });

  for (;;) {
    try {
      const { processed, toBlock, discoveryMode } = await runIndexerCycle(provider);
      await markIndexerSuccess({ discoveryMode });
      if (processed > 0) {
        logger.info('Indexer cycle', { eventsProcessed: processed, toBlock });
      }
    } catch (err) {
      await markIndexerError(err instanceof Error ? err.message : String(err));
      logger.error('Indexer cycle error', {
        error: err instanceof Error ? err.message : String(err),
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

    await new Promise((r) => setTimeout(r, config.pollIntervalMs));
  }
}

main();
