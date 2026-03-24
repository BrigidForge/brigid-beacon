import type { FastifyInstance } from 'fastify';
import {
  normalizeAddress,
  parsePublicEventKinds,
  parsePushSubscription,
} from '../context.js';
import type { ReturnTypeContext } from './types.js';

function extractEndpoint(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function registerPublicPushRoutes(app: FastifyInstance, ctx: ReturnTypeContext) {
  app.get('/api/v1/public/push/config', async () => {
    return {
      configured: Boolean(ctx.config.webPushVapidPublicKey),
      vapidPublicKey: ctx.config.webPushVapidPublicKey,
      subject: ctx.config.webPushVapidSubject,
    };
  });

  app.post('/api/v1/public/push-subscriptions', async (req, reply) => {
    if (!ctx.config.webPushVapidPublicKey || !ctx.config.webPushVapidPrivateKey) {
      return reply.status(503).send({
        error: 'Unavailable',
        message: 'Browser push notifications are not configured on this deployment.',
      });
    }

    const body = req.body as {
      vaultAddress?: string;
      eventKinds?: unknown;
      subscription?: unknown;
      userAgent?: string;
    };
    const vaultAddress = normalizeAddress(body.vaultAddress ?? '');
    const eventKinds = parsePublicEventKinds(body.eventKinds);
    const subscriptionJson = ctx.parsePushSubscription(body.subscription);
    const endpoint = extractEndpoint(
      subscriptionJson && typeof subscriptionJson.endpoint === 'string' ? subscriptionJson.endpoint : null,
    );
    const userAgent =
      typeof body.userAgent === 'string' && body.userAgent.trim().length > 0
        ? body.userAgent.trim().slice(0, 512)
        : typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent'].slice(0, 512)
          : null;

    if (!vaultAddress || !eventKinds || !subscriptionJson || !endpoint) {
      return reply.status(400).send({
        error: 'Bad request',
        message: 'vaultAddress, valid eventKinds, and a valid browser push subscription are required.',
      });
    }

    const vault = await ctx.getVaultByAddress(vaultAddress);
    if (!vault) {
      return reply.status(404).send({ error: 'Not found', message: `Vault ${vaultAddress} is not indexed.` });
    }

    const subscription = await ctx.prisma.publicPushSubscription.upsert({
      where: {
        vaultAddress_endpoint: {
          vaultAddress,
          endpoint,
        },
      },
      update: {
        eventKindsJson: eventKinds,
        subscriptionJson,
        userAgent,
        disabledAt: null,
      },
      create: {
        vaultAddress,
        endpoint,
        eventKindsJson: eventKinds,
        subscriptionJson,
        userAgent,
      },
    });

    return {
      status: 'subscribed' as const,
      vaultAddress: subscription.vaultAddress,
      endpoint: subscription.endpoint,
      eventKinds,
      disabled: false,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
      message: 'Browser push alerts are active for this device.',
    };
  });

  app.get('/api/v1/public/push-subscriptions/status', async (req, reply) => {
    const query = req.query as { vaultAddress?: string; endpoint?: string };
    const vaultAddress = normalizeAddress(query.vaultAddress ?? '');
    const endpoint = extractEndpoint(query.endpoint);

    if (!vaultAddress || !endpoint) {
      return reply.status(400).send({
        error: 'Bad request',
        message: 'vaultAddress and endpoint are required.',
      });
    }

    const subscription = await ctx.prisma.publicPushSubscription.findUnique({
      where: {
        vaultAddress_endpoint: {
          vaultAddress,
          endpoint,
        },
      },
    });

    return {
      vaultAddress,
      endpoint,
      subscribed: subscription != null && subscription.disabledAt == null,
      disabled: subscription?.disabledAt != null,
      eventKinds: Array.isArray(subscription?.eventKindsJson) ? subscription.eventKindsJson : [],
      createdAt: subscription?.createdAt.toISOString() ?? null,
      updatedAt: subscription?.updatedAt.toISOString() ?? null,
      disabledAt: subscription?.disabledAt?.toISOString() ?? null,
    };
  });

  app.post('/api/v1/public/push-subscriptions/unsubscribe', async (req, reply) => {
    const body = req.body as { vaultAddress?: string; endpoint?: string };
    const vaultAddress = normalizeAddress(body.vaultAddress ?? '');
    const endpoint = extractEndpoint(body.endpoint);

    if (!vaultAddress || !endpoint) {
      return reply.status(400).send({
        error: 'Bad request',
        message: 'vaultAddress and endpoint are required.',
      });
    }

    const subscription = await ctx.prisma.publicPushSubscription.findUnique({
      where: {
        vaultAddress_endpoint: {
          vaultAddress,
          endpoint,
        },
      },
    });

    if (!subscription || subscription.disabledAt != null) {
      return reply.status(404).send({ error: 'Not found', message: 'Active browser push subscription not found.' });
    }

    const now = new Date();
    await ctx.prisma.publicPushSubscription.update({
      where: { id: subscription.id },
      data: { disabledAt: now },
    });

    return {
      unsubscribed: true,
      vaultAddress,
      endpoint,
      unsubscribedAt: now.toISOString(),
    };
  });
}
