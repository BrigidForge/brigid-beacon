import type { FastifyInstance } from 'fastify';
import {
  normalizeAddress,
  normalizePhone,
  parsePublicEventKinds,
  tokenDigest,
} from '../context.js';
import type { ReturnTypeContext } from './types.js';

export async function registerPublicSmsRoutes(app: FastifyInstance, ctx: ReturnTypeContext) {
  app.post('/api/v1/public/sms-subscriptions', async (req, reply) => {
    const body = req.body as { vaultAddress?: string; phone?: string; eventKinds?: unknown };
    const vaultAddress = normalizeAddress(body.vaultAddress ?? '');
    const phone = normalizePhone(body.phone);
    const eventKinds = parsePublicEventKinds(body.eventKinds);

    if (!vaultAddress || !phone || !eventKinds) {
      return reply.status(400).send({
        error: 'Bad request',
        message: 'vaultAddress, phone (E.164 format, e.g. +14155552671), and valid public eventKinds are required.',
      });
    }

    const vault = await ctx.getVaultByAddress(vaultAddress);
    if (!vault) {
      return reply.status(404).send({ error: 'Not found', message: `Vault ${vaultAddress} is not indexed.` });
    }

    const unsubscribeToken = ctx.issueNonce() + ctx.issueNonce();

    const { subscription } = await ctx.prisma.$transaction(async (tx) => {
      const nextFollower = await tx.publicSmsFollower.upsert({
        where: { phone },
        create: { phone },
        update: { unsubscribedAt: null },
      });

      const existingSubscription = await tx.publicSmsSubscription.findUnique({
        where: {
          followerId_vaultAddress: {
            followerId: nextFollower.id,
            vaultAddress,
          },
        },
      });

      const nextSubscription = existingSubscription
        ? await tx.publicSmsSubscription.update({
            where: { id: existingSubscription.id },
            data: {
              eventKindsJson: eventKinds,
              disabledAt: null,
              unsubscribeTokenHash: existingSubscription.unsubscribeTokenHash || tokenDigest(unsubscribeToken),
            },
          })
        : await tx.publicSmsSubscription.create({
            data: {
              followerId: nextFollower.id,
              vaultAddress,
              eventKindsJson: eventKinds,
              unsubscribeTokenHash: tokenDigest(unsubscribeToken),
            },
          });

      return { follower: nextFollower, subscription: nextSubscription };
    });

    await ctx.sendPublicWelcomeSms({
      to: phone,
      vaultAddress,
      eventKinds,
      unsubscribeToken,
      subscriptionId: subscription.id,
    });

    return {
      subscribed: true,
      vaultAddress,
      phone,
      eventKinds,
      message: 'SMS alerts activated. A welcome text has been sent.',
    };
  });

  app.get('/api/v1/public/sms-subscriptions/status', async (req, reply) => {
    const query = req.query as { vaultAddress?: string; phone?: string };
    const vaultAddress = normalizeAddress(query.vaultAddress ?? '');
    const phone = normalizePhone(query.phone);

    if (!vaultAddress || !phone) {
      return reply.status(400).send({ error: 'Bad request', message: 'vaultAddress and phone are required.' });
    }

    const follower = await ctx.prisma.publicSmsFollower.findUnique({ where: { phone } });
    if (!follower) {
      return { vaultAddress, phone, subscribed: false, disabled: false, eventKinds: [] };
    }

    const subscription = await ctx.prisma.publicSmsSubscription.findUnique({
      where: {
        followerId_vaultAddress: {
          followerId: follower.id,
          vaultAddress,
        },
      },
    });

    return {
      vaultAddress,
      phone,
      subscribed: subscription != null,
      disabled: subscription?.disabledAt != null,
      eventKinds: Array.isArray(subscription?.eventKindsJson) ? subscription.eventKindsJson : [],
      disabledAt: subscription?.disabledAt?.toISOString() ?? null,
    };
  });

  app.post('/api/v1/public/sms-subscriptions/unsubscribe', async (req, reply) => {
    const token = (req.body as { token?: string }).token?.trim();
    if (!token) {
      return reply.status(400).send({ error: 'Bad request', message: 'Unsubscribe token is required.' });
    }

    const signedPayload = ctx.config.publicEmailLinkSecret ? ctx.decodePublicEmailActionToken(token) : null;
    const subscription = signedPayload
      ? await ctx.prisma.publicSmsSubscription.findUnique({
          where: { id: signedPayload.subscriptionId },
          include: { follower: true },
        })
      : await ctx.prisma.publicSmsSubscription.findFirst({
          where: { unsubscribeTokenHash: tokenDigest(token) },
          include: { follower: true },
        });

    if (
      !subscription ||
      (signedPayload != null && (
        signedPayload.action !== 'unsubscribe' ||
        subscription.vaultAddress !== signedPayload.vaultAddress ||
        subscription.follower.phone !== signedPayload.email
      ))
    ) {
      return reply.status(404).send({ error: 'Not found', message: 'Subscription token was not found.' });
    }

    const now = new Date();
    await ctx.prisma.$transaction(async (tx) => {
      await tx.publicSmsSubscription.update({ where: { id: subscription.id }, data: { disabledAt: now } });
      const activeSubscriptions = await tx.publicSmsSubscription.count({
        where: { followerId: subscription.followerId, disabledAt: null },
      });
      if (activeSubscriptions === 0) {
        await tx.publicSmsFollower.update({ where: { id: subscription.followerId }, data: { unsubscribedAt: now } });
      }
    });

    return {
      unsubscribed: true,
      phone: subscription.follower.phone,
      vaultAddress: subscription.vaultAddress,
      unsubscribedAt: now.toISOString(),
    };
  });
}
