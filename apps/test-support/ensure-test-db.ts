import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function ensureTestDatabase(databaseUrl: string | undefined): Promise<void> {
  if (!databaseUrl) {
    throw new Error('ensureTestDatabase requires DATABASE_URL to be set.');
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('ensureTestDatabase received an invalid DATABASE_URL.');
  }

  if (!new Set(['127.0.0.1', 'localhost']).has(parsed.hostname)) {
    throw new Error(`ensureTestDatabase refused non-local database host: ${parsed.hostname}`);
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const prismaDir = path.join(repoRoot, 'prisma');
  const migrationsDir = path.join(prismaDir, 'migrations');
  const baselineMigrationName = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()[0];

  if (!baselineMigrationName) {
    throw new Error('ensureTestDatabase could not find a baseline Prisma migration.');
  }

  const runPrisma = (args: string[]) =>
    spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['prisma', ...args],
      {
        cwd: prismaDir,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
        encoding: 'utf8',
      },
    );

  const deployResult = runPrisma(['migrate', 'deploy']);

  process.stdout.write(deployResult.stdout ?? '');
  process.stderr.write(deployResult.stderr ?? '');

  if ((deployResult.status ?? 1) === 0) {
    return;
  }

  const combinedOutput = `${deployResult.stdout ?? ''}\n${deployResult.stderr ?? ''}`;
  if (!combinedOutput.includes('P3005')) {
    if (deployResult.error) {
      throw deployResult.error;
    }
    throw new Error(`ensureTestDatabase failed with exit code ${deployResult.status ?? 1}.`);
  }

  const resolveResult = runPrisma(['migrate', 'resolve', '--applied', baselineMigrationName]);

  process.stdout.write(resolveResult.stdout ?? '');
  process.stderr.write(resolveResult.stderr ?? '');

  if (resolveResult.error) {
    throw resolveResult.error;
  }

  if ((resolveResult.status ?? 1) !== 0) {
    throw new Error(`ensureTestDatabase baseline resolve failed with exit code ${resolveResult.status ?? 1}.`);
  }

  const finalDeployResult = runPrisma(['migrate', 'deploy']);

  process.stdout.write(finalDeployResult.stdout ?? '');
  process.stderr.write(finalDeployResult.stderr ?? '');

  if (finalDeployResult.error) {
    throw finalDeployResult.error;
  }

  if ((finalDeployResult.status ?? 1) !== 0) {
    throw new Error(`ensureTestDatabase failed with exit code ${finalDeployResult.status ?? 1}.`);
  }
}
