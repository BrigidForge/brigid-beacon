import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v == null || v === '') throw new Error(`Missing env: ${name}`);
  return v;
}

function optionalEnv(name: string, def: number): number {
  const v = process.env[name];
  if (v == null || v === '') return def;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return n;
}

function optionalString(name: string): string | undefined {
  const v = process.env[name];
  return v == null || v === '' ? undefined : v;
}

function optionalBoolean(name: string, def: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return def;
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export const config = {
  databaseUrl: requireEnv('DATABASE_URL'),
  rpcUrl: requireEnv('RPC_URL'),
  chainId: optionalEnv('CHAIN_ID', 97),
  factoryAddress: requireEnv('FACTORY_ADDRESS'),
  startBlock: optionalEnv('START_BLOCK', 1),
  pollIntervalMs: optionalEnv('POLL_INTERVAL_MS', 12_000),
  blockChunkSize: optionalEnv('BLOCK_CHUNK_SIZE', 2000),
  steadyStatePollIntervalMs: optionalEnv('STEADY_STATE_POLL_INTERVAL_MS', 30_000),
  steadyStateBlockChunkSize: optionalEnv('STEADY_STATE_BLOCK_CHUNK_SIZE', 2_000),
  steadyStateLagBlocks: optionalEnv('STEADY_STATE_LAG_BLOCKS', 50),
  factoryRegistryRefreshMs: optionalEnv('FACTORY_REGISTRY_REFRESH_MS', 300_000),
  confirmations: optionalEnv('CONFIRMATIONS', 3),
  reorgLookbackBlocks: optionalEnv('REORG_LOOKBACK_BLOCKS', 20),
  indexerStateId: process.env.INDEXER_STATE_ID ?? 'default',

  // Notifications (optional – omit to disable a channel)
  telegramBotToken: optionalString('TELEGRAM_BOT_TOKEN'),
  telegramChatId: optionalString('TELEGRAM_CHAT_ID'),
  discordWebhookUrl: optionalString('DISCORD_WEBHOOK_URL'),
  webhookUrl: optionalString('WEBHOOK_URL'),
  globalNotificationFallbackEnabled: optionalBoolean('ENABLE_GLOBAL_NOTIFICATION_FALLBACK', false),
  explorerBaseUrl: optionalString('EXPLORER_BASE_URL') ?? 'https://testnet.bscscan.com',
  publicAppBaseUrl: optionalString('PUBLIC_APP_BASE_URL') ?? optionalString('VITE_API_BASE_URL') ?? 'http://localhost:5174',
  brevoApiKey: optionalString('BREVO_API_KEY'),
  sesFromEmail: optionalString('SES_FROM_EMAIL') ?? 'beacon-notifications@brigidforge.com',
  publicEmailLinkSecret: optionalString('PUBLIC_EMAIL_LINK_SECRET') ?? optionalString('TELEGRAM_LINK_SECRET'),
  publicEmailSubscriptionRetentionDays: optionalEnv('PUBLIC_EMAIL_SUBSCRIPTION_RETENTION_DAYS', 30),
  webPushVapidSubject: optionalString('WEB_PUSH_VAPID_SUBJECT') ?? 'mailto:beacon-notifications@brigidforge.com',
  webPushVapidPublicKey: optionalString('WEB_PUSH_VAPID_PUBLIC_KEY'),
  webPushVapidPrivateKey: optionalString('WEB_PUSH_VAPID_PRIVATE_KEY'),
} as const;

export type Config = typeof config;
