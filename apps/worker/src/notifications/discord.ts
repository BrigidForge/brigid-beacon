/**
 * Discord notification provider (webhook).
 * Set DISCORD_WEBHOOK_URL to enable.
 */

import type { DispatcheableEvent } from './types.js';
import type { FormattedNotification } from './types.js';
import type { NotificationProvider } from './types.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

async function sendNotification(event: DispatcheableEvent, formatted: FormattedNotification): Promise<void> {
  if (!config.discordWebhookUrl) return;

  const embed = {
    title: `🔔 ${formatted.title}`,
    description: formatted.body,
    color: 0xf59e0b, // amber
    fields: [
      { name: 'Vault', value: `\`${formatted.vaultAddress}\``, inline: false },
      ...(formatted.amount != null ? [{ name: 'Amount', value: formatted.amount, inline: true }] : []),
      { name: 'Block', value: String(formatted.blockNumber), inline: true },
      { name: 'Transaction', value: `[View](${formatted.transactionLink})`, inline: true },
      ...(formatted.countdown != null ? [{ name: 'Countdown', value: formatted.countdown, inline: false }] : []),
    ],
    timestamp: event.timestamp.toISOString(),
    footer: { text: `BrigidVault Beacon • ${event.chainId}` },
  };

  const body = {
    content: formatted.shortSummary,
    embeds: [embed],
  };

  const res = await fetch(config.discordWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Discord webhook ${res.status}: ${errText}`);
  }
}

export function createDiscordProvider(): NotificationProvider | null {
  if (!config.discordWebhookUrl) return null;
  return {
    name: 'discord',
    async send(event, formatted) {
      try {
        await sendNotification(event, formatted);
        logger.info('Discord notification sent', {
          eventId: event.id,
          kind: event.kind,
          vault: event.vaultAddress,
        });
      } catch (err) {
        logger.error('Discord send failed', {
          eventId: event.id,
          kind: event.kind,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };
}
