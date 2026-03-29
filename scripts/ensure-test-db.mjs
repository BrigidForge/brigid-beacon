#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const prismaDir = path.join(repoRoot, 'prisma');

const datasourceUrl = process.argv[2] ?? process.env.DATABASE_URL;

if (!datasourceUrl) {
  console.error('ensure-test-db requires a DATABASE_URL argument or environment variable.');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(datasourceUrl);
} catch {
  console.error('ensure-test-db received an invalid DATABASE_URL.');
  process.exit(1);
}

const localHosts = new Set(['127.0.0.1', 'localhost']);
if (!localHosts.has(parsed.hostname)) {
  console.error(`ensure-test-db refused non-local database host: ${parsed.hostname}`);
  process.exit(1);
}

const migrationsDir = path.join(prismaDir, 'migrations');
const baselineMigrationName = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()[0];

if (!baselineMigrationName) {
  console.error('ensure-test-db could not find a baseline Prisma migration.');
  process.exit(1);
}

function runPrisma(args) {
  return spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', ...args],
    {
      cwd: prismaDir,
      env: {
        ...process.env,
        DATABASE_URL: datasourceUrl,
      },
      encoding: 'utf8',
    },
  );
}

const deployResult = runPrisma(['migrate', 'deploy']);
process.stdout.write(deployResult.stdout ?? '');
process.stderr.write(deployResult.stderr ?? '');

if ((deployResult.status ?? 1) === 0) {
  process.exit(0);
}

const combinedOutput = `${deployResult.stdout ?? ''}\n${deployResult.stderr ?? ''}`;
if (!combinedOutput.includes('P3005')) {
  if (deployResult.error) {
    console.error(deployResult.error.message);
  }
  process.exit(deployResult.status ?? 1);
}

const resolveResult = runPrisma(['migrate', 'resolve', '--applied', baselineMigrationName]);
process.stdout.write(resolveResult.stdout ?? '');
process.stderr.write(resolveResult.stderr ?? '');

if (resolveResult.error) {
  console.error(resolveResult.error.message);
  process.exit(1);
}

if ((resolveResult.status ?? 1) !== 0) {
  process.exit(resolveResult.status ?? 1);
}

const finalDeployResult = runPrisma(['migrate', 'deploy']);
process.stdout.write(finalDeployResult.stdout ?? '');
process.stderr.write(finalDeployResult.stderr ?? '');

if (finalDeployResult.error) {
  console.error(finalDeployResult.error.message);
  process.exit(1);
}

process.exit(finalDeployResult.status ?? 1);
