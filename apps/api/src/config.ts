import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

function optionalNumber(name: string, def: number): number {
  const value = process.env[name];
  if (value == null || value === '') return def;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? def : parsed;
}

function optionalString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function optionalBoolean(name: string, def: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return def;
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function parseOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function validateSecret(name: string, value: string | null): string | null {
  if (value == null) return null;
  if (value.length < 32) {
    throw new Error(`${name} must be at least 32 characters long.`);
  }
  return value;
}

export type ApiConfig = ReturnType<typeof getApiConfig>;

export function getApiConfig() {
  const publicEmailLinkSecret = validateSecret(
    'PUBLIC_EMAIL_LINK_SECRET',
    optionalString('PUBLIC_EMAIL_LINK_SECRET') ?? optionalString('TELEGRAM_LINK_SECRET') ?? null,
  );

  return {
    port: optionalNumber('PORT', 3000),
    host: optionalString('HOST') ?? '0.0.0.0',
    nodeEnv: optionalString('NODE_ENV') ?? 'development',
    chainId: optionalNumber('CHAIN_ID', 97),
    factoryAddress: optionalString('FACTORY_ADDRESS') ?? '',
    rpcUrl: optionalString('RPC_URL') ?? '',
    pollIntervalMs: optionalNumber('POLL_INTERVAL_MS', 12_000),
    indexerStateId: optionalString('INDEXER_STATE_ID') ?? 'default',
    explorerBaseUrl: optionalString('EXPLORER_BASE_URL') ?? 'https://testnet.bscscan.com',
    allowedOrigins: parseOrigins(optionalString('ALLOWED_ORIGINS')),
    rateLimitMax: optionalNumber('RATE_LIMIT_MAX', 120),
    rateLimitWindowMs: optionalNumber('RATE_LIMIT_WINDOW_MS', 60_000),
    helmetEnabled: optionalBoolean('HELMET_ENABLED', true),
    globalNotificationFallbackEnabled: optionalBoolean('ENABLE_GLOBAL_NOTIFICATION_FALLBACK', false),
    managedTelegramBotToken: optionalString('TELEGRAM_BOT_TOKEN') ?? null,
    managedTelegramBotUsername: (optionalString('TELEGRAM_BOT_USERNAME') ?? '').replace(/^@/, '') || null,
    telegramLinkSecret: optionalString('TELEGRAM_LINK_SECRET') ?? null,
    telegramWebhookSecret: optionalString('TELEGRAM_WEBHOOK_SECRET') ?? null,
    publicAppBaseUrl: optionalString('PUBLIC_APP_BASE_URL') ?? optionalString('VITE_API_BASE_URL') ?? null,
    publicEmailLinkSecret,
    brevoApiKey: optionalString('BREVO_API_KEY') ?? null,
    publicEmailFromAddress: optionalString('SES_FROM_EMAIL') ?? 'beacon-notifications@brigidforge.com',
    webPushVapidSubject: optionalString('WEB_PUSH_VAPID_SUBJECT') ?? 'mailto:beacon-notifications@brigidforge.com',
    webPushVapidPublicKey: optionalString('WEB_PUSH_VAPID_PUBLIC_KEY') ?? null,
    webPushVapidPrivateKey: optionalString('WEB_PUSH_VAPID_PRIVATE_KEY') ?? null,
  } as const;
}
