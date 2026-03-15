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

export const config = {
  databaseUrl: requireEnv('DATABASE_URL'),
  rpcUrl: requireEnv('RPC_URL'),
  chainId: optionalEnv('CHAIN_ID', 97),
  factoryAddress: requireEnv('FACTORY_ADDRESS'),
  startBlock: optionalEnv('START_BLOCK', 1),
  pollIntervalMs: optionalEnv('POLL_INTERVAL_MS', 12_000),
  blockChunkSize: optionalEnv('BLOCK_CHUNK_SIZE', 2000),
  confirmations: optionalEnv('CONFIRMATIONS', 3),
  reorgLookbackBlocks: optionalEnv('REORG_LOOKBACK_BLOCKS', 20),
  indexerStateId: process.env.INDEXER_STATE_ID ?? 'default',

  // Notifications (optional – omit to disable a channel)
  telegramBotToken: optionalString('TELEGRAM_BOT_TOKEN'),
  telegramChatId: optionalString('TELEGRAM_CHAT_ID'),
  discordWebhookUrl: optionalString('DISCORD_WEBHOOK_URL'),
  webhookUrl: optionalString('WEBHOOK_URL'),
  explorerBaseUrl: optionalString('EXPLORER_BASE_URL') ?? 'https://testnet.bscscan.com',
} as const;

export type Config = typeof config;
