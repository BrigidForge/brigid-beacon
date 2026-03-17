/**
 * Beacon API – serves normalized vault data.
 * GET /api/v1/vaults/:address
 * GET /api/v1/vaults/:address/status
 * GET /api/v1/vaults/:address/events
 * GET /api/v1/vaults/:address/proof
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
import { prisma } from './db.js';
import { buildApp } from './app.js';
import { getApiConfig } from './config.js';

const config = getApiConfig();
const app = buildApp(prisma, { config });

app.listen({ port: config.port, host: config.host }).catch((err) => {
  console.error(err);
  process.exit(1);
});
