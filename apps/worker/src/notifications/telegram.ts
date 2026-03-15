/**
 * Telegram notification provider.
 * Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable.
 */

import type { DispatcheableEvent } from './types.js';
import type { FormattedNotification } from './types.js';
import type { NotificationProvider } from './types.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const TELEGRAM_API = 'https://api.telegram.org';

async function sendTelegramMessage(text: string): Promise<void> {
  const token = config.telegramBotToken;
  const chatId = config.telegramChatId;
  if (!token || !chatId) return;

  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Telegram API ${res.status}: ${errText}`);
  }
}

async function sendNotification(event: DispatcheableEvent, formatted: FormattedNotification): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) return;

  const lines = [
    `<b>🔔 ${formatted.title}</b>`,
    '',
    `Vault: <code>${formatted.vaultAddress}</code>`,
    formatted.amount != null ? `Amount: ${formatted.amount}` : null,
    `Block: ${formatted.blockNumber}`,
    `Tx: <a href="${formatted.transactionLink}">View</a>`,
    formatted.countdown != null ? `⏱ ${formatted.countdown}` : null,
  ].filter(Boolean);

  const text = lines.join('\n');
  await sendTelegramMessage(text);
}

export function createTelegramProvider(): NotificationProvider | null {
  if (!config.telegramBotToken || !config.telegramChatId) return null;
  return {
    name: 'telegram',
    async send(event, formatted) {
      try {
        await sendNotification(event, formatted);
        logger.info('Telegram notification sent', {
          eventId: event.id,
          kind: event.kind,
          vault: event.vaultAddress,
        });
      } catch (err) {
        logger.error('Telegram send failed', {
          eventId: event.id,
          kind: event.kind,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };
}
