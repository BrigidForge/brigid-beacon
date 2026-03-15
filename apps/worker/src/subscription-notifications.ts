import type { DispatcheableEvent, FormattedNotification } from './notifications/types.js';
import { config } from './config.js';

type DestinationRow = {
  id: string;
  kind: string;
  label: string;
  configJson: unknown;
};

type SendResult = {
  providerMessageId?: string | null;
};

const TELEGRAM_API = 'https://api.telegram.org';

function shortenHash(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function isLikelyLocalExplorer(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('192.168.');
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

async function sendTelegram(
  destination: DestinationRow,
  formatted: FormattedNotification,
): Promise<SendResult> {
  const destinationConfig = asObject(destination.configJson);
  const chatId = typeof destinationConfig?.chatId === 'string' ? destinationConfig.chatId : null;
  const botToken =
    typeof destinationConfig?.botToken === 'string' ? destinationConfig.botToken : config.telegramBotToken ?? null;
  if (!chatId || !botToken) {
    throw new Error(`Telegram destination ${destination.id} is missing chatId or a managed bot token.`);
  }

  const url = `${TELEGRAM_API}/bot${botToken}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: [
      `<b>${formatted.title}</b>`,
      '',
      `Vault: <code>${formatted.vaultAddress}</code>`,
      formatted.amount != null ? `Amount: ${formatted.amount}` : null,
      `Block: ${formatted.blockNumber}`,
      isLikelyLocalExplorer(formatted.transactionLink)
        ? `Tx: <code>${shortenHash(formatted.transactionHash)}</code>`
        : `Tx: <a href="${formatted.transactionLink}">View</a>`,
      formatted.countdown != null ? `Countdown: ${formatted.countdown}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Telegram API ${response.status}: ${await response.text()}`);
  }

  return {};
}

async function sendDiscordWebhook(
  destination: DestinationRow,
  event: DispatcheableEvent,
  formatted: FormattedNotification,
): Promise<SendResult> {
  const config = asObject(destination.configJson);
  const url = typeof config?.url === 'string' ? config.url : null;
  if (!url) {
    throw new Error(`Discord destination ${destination.id} is missing url.`);
  }

  const embed = {
    title: formatted.title,
    description: formatted.body,
    color: 0xf59e0b,
    fields: [
      { name: 'Vault', value: `\`${formatted.vaultAddress}\``, inline: false },
      ...(formatted.amount != null ? [{ name: 'Amount', value: formatted.amount, inline: true }] : []),
      { name: 'Block', value: String(formatted.blockNumber), inline: true },
      { name: 'Transaction', value: `[View](${formatted.transactionLink})`, inline: true },
      ...(formatted.countdown != null ? [{ name: 'Countdown', value: formatted.countdown, inline: false }] : []),
    ],
    timestamp: event.timestamp.toISOString(),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: formatted.shortSummary,
      embeds: [embed],
    }),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook ${response.status}: ${await response.text()}`);
  }

  return {};
}

async function sendWebhook(
  destination: DestinationRow,
  event: DispatcheableEvent,
  formatted: FormattedNotification,
): Promise<SendResult> {
  const config = asObject(destination.configJson);
  const url = typeof config?.url === 'string' ? config.url : null;
  if (!url) {
    throw new Error(`Webhook destination ${destination.id} is missing url.`);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'brigid-beacon',
      destinationId: destination.id,
      eventId: event.id,
      vaultAddress: event.vaultAddress,
      kind: event.kind,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      transactionLink: formatted.transactionLink,
      title: formatted.title,
      body: formatted.body,
      shortSummary: formatted.shortSummary,
      amount: formatted.amount,
      countdown: formatted.countdown,
      payload: event.payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`Webhook ${response.status}: ${await response.text()}`);
  }

  return {};
}

export async function sendSubscriptionNotification(
  destination: DestinationRow,
  event: DispatcheableEvent,
  formatted: FormattedNotification,
): Promise<SendResult> {
  if (destination.kind === 'telegram') {
    return sendTelegram(destination, formatted);
  }
  if (destination.kind === 'discord_webhook') {
    return sendDiscordWebhook(destination, event, formatted);
  }
  if (destination.kind === 'webhook') {
    return sendWebhook(destination, event, formatted);
  }

  throw new Error(`Unsupported destination kind: ${destination.kind}`);
}
