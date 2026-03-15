/**
 * Generic webhook notification provider.
 * POSTs JSON payload to WEBHOOK_URL. Set WEBHOOK_URL to enable.
 */

import type { DispatcheableEvent } from './types.js';
import type { FormattedNotification } from './types.js';
import type { NotificationProvider } from './types.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

async function sendNotification(event: DispatcheableEvent, formatted: FormattedNotification): Promise<void> {
  if (!config.webhookUrl) return;

  const payload = {
    source: 'brigid-beacon',
    eventId: event.id,
    vaultAddress: event.vaultAddress,
    kind: event.kind,
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
    transactionLink: formatted.transactionLink,
    timestamp: event.timestamp.toISOString(),
    title: formatted.title,
    body: formatted.body,
    shortSummary: formatted.shortSummary,
    amount: formatted.amount,
    countdown: formatted.countdown,
    payload: event.payload,
  };

  const res = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Webhook ${res.status}: ${errText}`);
  }
}

export function createWebhookProvider(): NotificationProvider | null {
  if (!config.webhookUrl) return null;
  return {
    name: 'webhook',
    async send(event, formatted) {
      try {
        await sendNotification(event, formatted);
        logger.info('Webhook notification sent', {
          eventId: event.id,
          kind: event.kind,
          vault: event.vaultAddress,
        });
      } catch (err) {
        logger.error('Webhook send failed', {
          eventId: event.id,
          kind: event.kind,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };
}
