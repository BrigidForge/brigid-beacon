#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prismaDir = path.join(repoRoot, 'prisma');

const commandName = process.argv[2];
const passthroughArgs = process.argv.slice(3);

const commandMap = {
  generate: {
    label: 'Prisma generate',
    args: ['generate'],
    envVar: 'DATABASE_URL',
    requiresWrite: false,
  },
  'migrate-status': {
    label: 'Prisma migrate status',
    args: ['migrate', 'status'],
    envVar: 'DATABASE_URL',
    requiresWrite: false,
  },
  'db-push': {
    label: 'Prisma db push',
    args: ['db', 'push'],
    envVar: 'DATABASE_URL',
    requiresWrite: true,
    allowProductionLike: false,
  },
  'migrate-dev': {
    label: 'Prisma migrate dev',
    args: ['migrate', 'dev'],
    envVar: 'DATABASE_URL',
    requiresWrite: true,
    allowProductionLike: false,
  },
  'prod-db-push': {
    label: 'Production Prisma db push',
    args: ['db', 'push'],
    envVar: 'MIGRATION_DATABASE_URL',
    requiresWrite: true,
    allowProductionLike: true,
    requireExplicitProdIntent: true,
  },
  'prod-migrate-deploy': {
    label: 'Production Prisma migrate deploy',
    args: ['migrate', 'deploy'],
    envVar: 'MIGRATION_DATABASE_URL',
    requiresWrite: true,
    allowProductionLike: true,
    requireExplicitProdIntent: true,
  },
  'prod-migrate-resolve-applied': {
    label: 'Production Prisma migrate resolve --applied',
    args: ['migrate', 'resolve', '--applied'],
    envVar: 'MIGRATION_DATABASE_URL',
    requiresWrite: true,
    allowProductionLike: true,
    requireExplicitProdIntent: true,
    requiresAdditionalArgs: true,
  },
};

const selectedCommand = commandMap[commandName];
if (!selectedCommand) {
  console.error(`Unknown Prisma command mode: ${commandName ?? '(missing)'}`);
  process.exit(1);
}

function parseDatabaseUrl(value) {
  try {
    const parsed = new URL(value);
    return {
      raw: value,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      username: decodeURIComponent(parsed.username),
      databaseName: parsed.pathname.replace(/^\/+/, ''),
    };
  } catch {
    return null;
  }
}

function looksLikeLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function describeTarget(target) {
  if (!target) return 'unparseable DATABASE_URL';
  const userPrefix = target.username ? `${target.username}@` : '';
  const portSuffix = target.port ? `:${target.port}` : '';
  return `${userPrefix}${target.hostname}${portSuffix}/${target.databaseName || '(unknown-db)'}`;
}

function detectProductionLikeTarget(target) {
  if (!target) {
    return { productionLike: true, reasons: ['database URL could not be parsed safely'] };
  }

  const reasons = [];
  const runningInServerCheckout = repoRoot.startsWith('/opt/brigidforge/repo') || process.cwd().startsWith('/opt/brigidforge/repo');

  if (target.hostname === '104.131.19.70') reasons.push('database host matches the production server');
  if (target.hostname.endsWith('brigidforge.com')) reasons.push('database host uses the production brigidforge domain');
  if (runningInServerCheckout && looksLikeLocalHost(target.hostname) && target.databaseName === 'beacon') {
    reasons.push('server checkout is targeting the live beacon database');
  }
  if (target.databaseName === 'beacon' && target.username === 'beacon') {
    reasons.push('database credentials match the live Beacon app database');
  }
  if (process.env.NODE_ENV === 'production' && target.databaseName === 'beacon') {
    reasons.push('NODE_ENV=production with the live beacon database name');
  }

  return { productionLike: reasons.length > 0, reasons };
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${selectedCommand.label} requires ${name} to be set.`);
    process.exit(1);
  }
  return value;
}

const targetUrl = requireEnv(selectedCommand.envVar);
const parsedTarget = parseDatabaseUrl(targetUrl);
const targetDescription = describeTarget(parsedTarget);
const targetRisk = detectProductionLikeTarget(parsedTarget);

if (selectedCommand.requiresWrite && targetRisk.productionLike && !selectedCommand.allowProductionLike) {
  console.error(`${selectedCommand.label} refused: target looks production-like.`);
  console.error(`Target: ${targetDescription}`);
  for (const reason of targetRisk.reasons) {
    console.error(`- ${reason}`);
  }
  console.error('');
  console.error('Use a local/non-production DATABASE_URL for normal db commands.');
  console.error('For intentional production schema changes, use a dedicated migration URL and the guarded prod command instead.');
  process.exit(1);
}

if (selectedCommand.requireExplicitProdIntent) {
  if (process.env.ALLOW_PROD_DB_WRITE !== 'yes') {
    console.error(`${selectedCommand.label} refused: set ALLOW_PROD_DB_WRITE=yes for an intentional production schema change.`);
    process.exit(1);
  }
  if (process.env.PROD_DB_TARGET_CONFIRMATION !== 'beacon-production') {
    console.error(`${selectedCommand.label} refused: set PROD_DB_TARGET_CONFIRMATION=beacon-production to confirm the exact target.`);
    process.exit(1);
  }
}

if (selectedCommand.requiresAdditionalArgs && passthroughArgs.length === 0) {
  console.error(`${selectedCommand.label} requires at least one additional argument, such as a migration name.`);
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: targetUrl,
};

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', ...selectedCommand.args, ...passthroughArgs],
  {
    cwd: prismaDir,
    env,
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
