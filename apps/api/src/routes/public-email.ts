import type { FastifyInstance } from 'fastify';
import {
  buildPublicActionUrl,
  PUBLIC_EMAIL_CONFIRM_TTL_MS,
  buildPublicConfirmationUrls,
  normalizeAddress,
  normalizeEmail,
  parsePublicEventKinds,
  tokenDigest,
} from '../context.js';
import type { ReturnTypeContext } from './types.js';

export async function registerPublicEmailRoutes(app: FastifyInstance, ctx: ReturnTypeContext) {
  app.post('/api/v1/public/email-subscriptions', async (req, reply) => {
    const body = req.body as { vaultAddress?: string; email?: string; eventKinds?: unknown };
    const vaultAddress = normalizeAddress(body.vaultAddress ?? '');
    const email = normalizeEmail(body.email);
    const eventKinds = parsePublicEventKinds(body.eventKinds);

    if (!vaultAddress || !email || !eventKinds) {
      return reply.status(400).send({
        error: 'Bad request',
        message: 'vaultAddress, email, and valid public eventKinds are required.',
      });
    }

    const vault = await ctx.getVaultByAddress(vaultAddress);
    if (!vault) {
      return reply.status(404).send({ error: 'Not found', message: `Vault ${vaultAddress} is not indexed.` });
    }

    const confirmationToken = ctx.issueNonce() + ctx.issueNonce();
    const unsubscribeToken = ctx.issueNonce() + ctx.issueNonce();
    const expiresAt = new Date(Date.now() + PUBLIC_EMAIL_CONFIRM_TTL_MS);

    const { follower, subscription } = await ctx.prisma.$transaction(async (tx) => {
      const nextFollower = await tx.publicEmailFollower.upsert({
        where: { email },
        create: { email },
        update: { unsubscribedAt: null },
      });

      const existingSubscription = await tx.publicEmailSubscription.findUnique({
        where: {
          followerId_vaultAddress: {
            followerId: nextFollower.id,
            vaultAddress,
          },
        },
      });

      const nextSubscription = existingSubscription
        ? await tx.publicEmailSubscription.update({
            where: { id: existingSubscription.id },
            data: {
              eventKindsJson: eventKinds,
              disabledAt: null,
              confirmedAt: existingSubscription.confirmedAt,
              unsubscribeTokenHash: existingSubscription.unsubscribeTokenHash || tokenDigest(unsubscribeToken),
            },
          })
        : await tx.publicEmailSubscription.create({
            data: {
              followerId: nextFollower.id,
              vaultAddress,
              eventKindsJson: eventKinds,
              unsubscribeTokenHash: tokenDigest(unsubscribeToken),
            },
          });

      await tx.publicEmailToken.create({
        data: {
          followerId: nextFollower.id,
          subscriptionId: nextSubscription.id,
          purpose: 'confirm_subscription',
          tokenHash: tokenDigest(confirmationToken),
          expiresAt,
        },
      });

      return { follower: nextFollower, subscription: nextSubscription };
    });

    const urls = buildPublicConfirmationUrls(ctx.config, vaultAddress, {
      confirmToken: confirmationToken,
      unsubscribeToken,
    });
    const alreadyConfirmed = subscription.confirmedAt != null && follower.verifiedAt != null;
    const emailDelivery = alreadyConfirmed
      ? { deliveryMode: 'confirmed' as const }
      : await ctx.sendPublicConfirmationEmail({
          to: email,
          vaultAddress,
          eventKinds,
          confirmUrl: urls.confirmUrl,
          confirmToken: confirmationToken,
          unsubscribeUrl: urls.unsubscribeUrl,
          unsubscribeToken,
          expiresAt: expiresAt.toISOString(),
        });

    const isPreviewMode = !alreadyConfirmed && emailDelivery.deliveryMode !== 'brevo';
    return {
      status: alreadyConfirmed ? 'confirmed' : 'pending_confirmation',
      vaultAddress,
      email,
      eventKinds,
      expiresAt: alreadyConfirmed ? null : expiresAt.toISOString(),
      deliveryMode: alreadyConfirmed ? 'confirmed' : emailDelivery.deliveryMode,
      message: alreadyConfirmed
        ? 'Email follow is already confirmed for this vault.'
        : emailDelivery.deliveryMode === 'brevo'
          ? 'Confirmation email sent through Brevo.'
          : 'Brevo email delivery is not active, so Beacon is returning a preview confirmation link for local use.',
      ...(isPreviewMode && {
        previewConfirmToken: confirmationToken,
        previewConfirmUrl: urls.confirmUrl,
        previewUnsubscribeToken: unsubscribeToken,
        previewUnsubscribeUrl: urls.unsubscribeUrl,
      }),
    };
  });

  app.get('/api/v1/public/email-subscriptions/status', async (req, reply) => {
    const query = req.query as { vaultAddress?: string; email?: string };
    const vaultAddress = normalizeAddress(query.vaultAddress ?? '');
    const email = normalizeEmail(query.email);

    if (!vaultAddress || !email) {
      return reply.status(400).send({ error: 'Bad request', message: 'vaultAddress and email are required.' });
    }

    const follower = await ctx.prisma.publicEmailFollower.findUnique({ where: { email } });
    if (!follower) {
      return { vaultAddress, email, subscribed: false, confirmed: false, disabled: false, eventKinds: [] };
    }

    const subscription = await ctx.prisma.publicEmailSubscription.findUnique({
      where: {
        followerId_vaultAddress: {
          followerId: follower.id,
          vaultAddress,
        },
      },
    });

    return {
      vaultAddress,
      email,
      subscribed: subscription != null,
      confirmed: subscription?.confirmedAt != null && follower.verifiedAt != null,
      disabled: subscription?.disabledAt != null,
      eventKinds: Array.isArray(subscription?.eventKindsJson) ? subscription.eventKindsJson : [],
      confirmedAt: subscription?.confirmedAt?.toISOString() ?? null,
      disabledAt: subscription?.disabledAt?.toISOString() ?? null,
    };
  });

  app.get('/api/v1/public/email-subscriptions/manage', async (req, reply) => {
    const token = (req.query as { token?: string }).token?.trim();
    if (!token || !ctx.config.publicEmailLinkSecret) {
      return reply.status(400).send({ error: 'Bad request', message: 'A valid management token is required.' });
    }

    const payload = ctx.decodePublicEmailActionToken(token);
    if (!payload || payload.action !== 'manage') {
      return reply.status(404).send({ error: 'Not found', message: 'Management token is missing, invalid, or expired.' });
    }

    const subscription = await ctx.prisma.publicEmailSubscription.findUnique({
      where: { id: payload.subscriptionId },
      include: { follower: true },
    });
    if (!subscription || subscription.vaultAddress !== payload.vaultAddress || subscription.follower.email !== payload.email) {
      return reply.status(404).send({ error: 'Not found', message: 'Subscription was not found for this management token.' });
    }

    const unsubscribeToken = ctx.encodePublicEmailActionToken({
      action: 'unsubscribe',
      subscriptionId: subscription.id,
      vaultAddress: subscription.vaultAddress,
      email: subscription.follower.email,
      expiresAt: payload.expiresAt,
    });
    const unsubscribeUrl = unsubscribeToken
      ? buildPublicActionUrl(ctx.config, subscription.vaultAddress, {
          action: 'unsubscribe',
          token: unsubscribeToken,
        })
      : null;

    return {
      vaultAddress: subscription.vaultAddress,
      email: subscription.follower.email,
      subscribed: true,
      confirmed: subscription.confirmedAt != null && subscription.follower.verifiedAt != null,
      disabled: subscription.disabledAt != null,
      eventKinds: Array.isArray(subscription.eventKindsJson) ? subscription.eventKindsJson : [],
      confirmedAt: subscription.confirmedAt?.toISOString() ?? null,
      disabledAt: subscription.disabledAt?.toISOString() ?? null,
      unsubscribeToken,
      unsubscribeUrl,
    };
  });

  app.post('/api/v1/public/email-subscriptions/confirm', async (req, reply) => {
    const token = (req.body as { token?: string }).token?.trim();
    if (!token) {
      return reply.status(400).send({ error: 'Bad request', message: 'Confirmation token is required.' });
    }

    const record = await ctx.prisma.publicEmailToken.findFirst({
      where: { tokenHash: tokenDigest(token), purpose: 'confirm_subscription' },
      include: { follower: true, subscription: true },
    });

    if (!record || record.usedAt) {
      return reply.status(404).send({ error: 'Not found', message: 'Confirmation token is missing or already used.' });
    }
    if (record.expiresAt.getTime() < Date.now()) {
      return reply.status(410).send({ error: 'Expired', message: 'Confirmation token has expired.' });
    }

    const now = new Date();
    await ctx.prisma.$transaction(async (tx) => {
      await tx.publicEmailToken.update({ where: { id: record.id }, data: { usedAt: now } });
      await tx.publicEmailFollower.update({ where: { id: record.followerId }, data: { verifiedAt: now, unsubscribedAt: null } });
      await tx.publicEmailSubscription.update({ where: { id: record.subscriptionId }, data: { confirmedAt: now, disabledAt: null } });
    });

    return {
      confirmed: true,
      email: record.follower.email,
      vaultAddress: record.subscription.vaultAddress,
      confirmedAt: now.toISOString(),
      eventKinds: Array.isArray(record.subscription.eventKindsJson) ? record.subscription.eventKindsJson : [],
    };
  });

  app.post('/api/v1/public/email-subscriptions/unsubscribe', async (req, reply) => {
    const token = (req.body as { token?: string }).token?.trim();
    if (!token) {
      return reply.status(400).send({ error: 'Bad request', message: 'Unsubscribe token is required.' });
    }

    const signedPayload = ctx.config.publicEmailLinkSecret ? ctx.decodePublicEmailActionToken(token) : null;
    const subscription = signedPayload
      ? await ctx.prisma.publicEmailSubscription.findUnique({ where: { id: signedPayload.subscriptionId }, include: { follower: true } })
      : await ctx.prisma.publicEmailSubscription.findFirst({
          where: { unsubscribeTokenHash: tokenDigest(token) },
          include: { follower: true },
        });

    if (
      !subscription ||
      (signedPayload != null && (
        signedPayload.action !== 'unsubscribe' ||
        subscription.vaultAddress !== signedPayload.vaultAddress ||
        subscription.follower.email !== signedPayload.email
      ))
    ) {
      return reply.status(404).send({ error: 'Not found', message: 'Subscription token was not found.' });
    }

    const now = new Date();
    await ctx.prisma.$transaction(async (tx) => {
      await tx.publicEmailSubscription.update({ where: { id: subscription.id }, data: { disabledAt: now } });
      const activeSubscriptions = await tx.publicEmailSubscription.count({
        where: { followerId: subscription.followerId, disabledAt: null },
      });
      if (activeSubscriptions === 0) {
        await tx.publicEmailFollower.update({ where: { id: subscription.followerId }, data: { unsubscribedAt: now } });
      }
    });

    return {
      unsubscribed: true,
      email: subscription.follower.email,
      vaultAddress: subscription.vaultAddress,
      unsubscribedAt: now.toISOString(),
    };
  });

  app.post('/api/v1/public/email-subscriptions/manage-link', async (req, reply) => {
    const body = req.body as { vaultAddress?: string; email?: string };
    const vaultAddress = normalizeAddress(body.vaultAddress ?? '');
    const email = normalizeEmail(body.email);

    if (!vaultAddress || !email) {
      return reply.status(400).send({
        error: 'Bad request',
        message: 'vaultAddress and email are required.',
      });
    }

    const follower = await ctx.prisma.publicEmailFollower.findUnique({ where: { email } });
    if (!follower) {
      return reply.status(404).send({ error: 'Not found', message: 'No email subscription exists for that address.' });
    }

    const subscription = await ctx.prisma.publicEmailSubscription.findUnique({
      where: {
        followerId_vaultAddress: {
          followerId: follower.id,
          vaultAddress,
        },
      },
    });

    if (!subscription || subscription.disabledAt != null || subscription.confirmedAt == null || follower.verifiedAt == null) {
      return reply.status(404).send({ error: 'Not found', message: 'No active confirmed email subscription exists for that address on this vault.' });
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const manageToken = ctx.encodePublicEmailActionToken({
      action: 'manage',
      subscriptionId: subscription.id,
      vaultAddress,
      email,
      expiresAt,
    });

    if (!manageToken) {
      return reply.status(500).send({ error: 'Server error', message: 'Public email link management is not configured.' });
    }

    const manageUrl = buildPublicActionUrl(ctx.config, vaultAddress, {
      action: 'manage',
      token: manageToken,
    });

    const emailDelivery = await ctx.sendPublicManageLinkEmail({
      to: email,
      vaultAddress,
      manageUrl,
      manageToken,
      expiresAt,
    });

    return {
      sent: true,
      email,
      vaultAddress,
      expiresAt,
      deliveryMode: emailDelivery.deliveryMode,
      ...(emailDelivery.deliveryMode !== 'brevo' && {
        previewManageToken: manageToken,
        previewManageUrl: manageUrl,
      }),
      message:
        emailDelivery.deliveryMode === 'brevo'
          ? 'A secure management link has been emailed to you.'
          : 'Email delivery is not active, so Beacon is returning a preview management link for local use.',
    };
  });
}
