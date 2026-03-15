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

const app = buildApp(prisma);

const port = Number(process.env.PORT) || 3000;
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  console.error(err);
  process.exit(1);
});
