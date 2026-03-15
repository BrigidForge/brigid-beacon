import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

function optionalEnv(name: string, def: number): number {
  const v = process.env[name];
  if (v == null || v === '') return def;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}

function optionalString(name: string, def = ''): string {
  const v = process.env[name];
  return v == null || v === '' ? def : v;
}

export const config = {
  chainId: optionalEnv('CHAIN_ID', 97),
  factoryAddress: process.env.FACTORY_ADDRESS ?? '',
  rpcUrl: optionalString('RPC_URL'),
  pollIntervalMs: optionalEnv('POLL_INTERVAL_MS', 12_000),
  indexerStateId: optionalString('INDEXER_STATE_ID', 'default'),
} as const;
