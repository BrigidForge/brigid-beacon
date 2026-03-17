import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import type { ApiConfig } from './config.js';
import { getApiConfig } from './config.js';
import { createApiContext } from './context.js';
import type { ChainProvider } from './context.js';
import { registerErrorHandling } from './errors.js';
import { registerHealthAnalyticsRoutes } from './routes/health-analytics.js';
import { registerPublicEmailRoutes } from './routes/public-email.js';
import { registerOwnerRoutes } from './routes/owner.js';
import { registerIntegrationRoutes } from './routes/integrations.js';
import { registerVaultRoutes } from './routes/vaults.js';

function resolveCorsOrigin(config: ApiConfig, origin: string | undefined, callback: (error: Error | null, allow: boolean) => void) {
  if (!origin || config.allowedOrigins.length === 0 || config.nodeEnv !== 'production') {
    return callback(null, true);
  }
  callback(null, config.allowedOrigins.includes(origin));
}

export function buildApp(
  prisma: PrismaClient,
  options: { chainProvider?: ChainProvider | null; config?: ApiConfig } = {},
) {
  const config = options.config ?? getApiConfig();
  const app = Fastify({ logger: true });
  const ctx = createApiContext(prisma, config, { chainProvider: options.chainProvider });

  registerErrorHandling(app);

  void app.register(cors, {
    origin: (origin, callback) => resolveCorsOrigin(config, origin, callback),
    credentials: true,
  });

  if (config.helmetEnabled) {
    void app.register(helmet, {
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    });
  }

  void app.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    keyGenerator: (req) => req.ip,
  });

  void registerHealthAnalyticsRoutes(app, ctx);
  void registerPublicEmailRoutes(app, ctx);
  void registerOwnerRoutes(app, ctx);
  void registerIntegrationRoutes(app, ctx);
  void registerVaultRoutes(app, ctx);

  return app;
}
