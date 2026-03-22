import type { FastifyInstance } from 'fastify';
import {
  CLAIM_NONCE_TTL_MS,
  DESTINATION_KINDS,
  SESSION_TTL_MS,
  TELEGRAM_LINK_TTL_MS,
  normalizeAddress,
  parseDestinationConfig,
  parseEventKinds,
  sanitizeDestinationConfig,
  sessionTokenDigest,
  signatureDigest,
  toVaultMetadata,
} from '../context.js';
import type { ReturnTypeContext } from './types.js';

export async function registerOwnerRoutes(app: FastifyInstance, ctx: ReturnTypeContext) {
  function isLinkedTelegramDestination(configJson: unknown) {
    if (!configJson || typeof configJson !== 'object' || Array.isArray(configJson)) return false;
    return typeof (configJson as Record<string, unknown>).chatId === 'string';
  }

  app.get('/api/v1/owner/session', async (req, reply) => {
    const auth = await ctx.requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) return reply.status(auth.statusCode).send(auth.body);
    return {
      ownerAddress: auth.session.ownerAddress,
      expiresAt: auth.session.expiresAt.toISOString(),
      lastSeenAt: auth.session.lastSeenAt.toISOString(),
    };
  });

  app.get('/api/v1/owner/portfolio', async (req, reply) => {
    const auth = await ctx.requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) return reply.status(auth.statusCode).send(auth.body);
    const ownerAddress = auth.session.ownerAddress;
    const vaults = await ctx.prisma.vault.findMany({
      where: { owner: ownerAddress },
      orderBy: [{ createdAt: 'desc' }, { deployedAtBlock: 'desc' }],
    });

    const portfolio = await Promise.all(vaults.map(async (vault) => {
      const [status, claim, activeSubscriptionCount, recentDeliveryFailures, lastDelivery] = await Promise.all([
        ctx.buildVaultStatusBundle(vault),
        ctx.getActiveClaim(vault.id, ownerAddress),
        ctx.prisma.notificationSubscription.count({ where: { ownerAddress, vaultAddress: vault.id, disabledAt: null } }),
        ctx.prisma.notificationDelivery.count({
          where: {
            subscription: { ownerAddress, vaultAddress: vault.id },
            status: { not: 'sent' },
          },
        }),
        ctx.prisma.notificationDelivery.findFirst({
          where: { subscription: { ownerAddress, vaultAddress: vault.id } },
          orderBy: [{ deliveredAt: 'desc' }, { lastAttemptAt: 'desc' }, { createdAt: 'desc' }],
        }),
      ]);

      return {
        metadata: toVaultMetadata(vault),
        status,
        claim: { claimed: Boolean(claim), claimedAt: claim?.claimedAt.toISOString() ?? null },
        activeSubscriptionCount,
        recentDeliveryFailures,
        lastDeliveryAt: lastDelivery?.deliveredAt?.toISOString() ?? lastDelivery?.lastAttemptAt?.toISOString() ?? lastDelivery?.createdAt.toISOString() ?? null,
      };
    }));

    return { ownerAddress, vaults: portfolio };
  });

  app.delete('/api/v1/owner/session', async (req, reply) => {
    const token = (req.headers.authorization ?? '').split(' ')[1]?.trim();
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing bearer session token.' });
    }
    const session = await ctx.prisma.ownerSession.findFirst({
      where: { tokenHash: sessionTokenDigest(token), revokedAt: null },
    });
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Session is missing or expired.' });
    }
    const now = new Date();
    await ctx.prisma.ownerSession.update({ where: { id: session.id }, data: { revokedAt: now } });
    return { revoked: true, revokedAt: now.toISOString() };
  });

  app.post('/api/v1/owner/claims/nonce', async (req, reply) => {
    const body = req.body as { vaultAddress?: string; ownerAddress?: string };
    const vaultAddress = normalizeAddress(body.vaultAddress ?? '');
    const ownerAddress = normalizeAddress(body.ownerAddress ?? '');
    if (!vaultAddress || !ownerAddress) {
      return reply.status(400).send({ error: 'Bad request', message: 'Valid vaultAddress and ownerAddress are required.' });
    }

    const vault = await ctx.getVaultByAddress(vaultAddress);
    if (!vault) return reply.status(404).send({ error: 'Not found', message: `Vault ${vaultAddress} is not indexed.` });
    if (vault.owner !== ownerAddress) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Owner address does not match indexed vault owner.' });
    }

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + CLAIM_NONCE_TTL_MS);
    const nonce = ctx.issueNonce();
    await ctx.prisma.claimNonce.create({
      data: { vaultAddress, ownerAddress, nonce, issuedAt, expiresAt },
    });

    return {
      vaultAddress,
      ownerAddress,
      chainId: ctx.config.chainId,
      nonce,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      message: ctx.buildClaimMessage({
        vaultAddress,
        ownerAddress,
        nonce,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      }),
    };
  });

  app.post('/api/v1/owner/claims/verify', async (req, reply) => {
    const body = req.body as { vaultAddress?: string; ownerAddress?: string; nonce?: string; signature?: string };
    const vaultAddress = normalizeAddress(body.vaultAddress ?? '');
    const ownerAddress = normalizeAddress(body.ownerAddress ?? '');
    const nonce = body.nonce?.trim();
    const signature = body.signature?.trim();
    if (!vaultAddress || !ownerAddress || !nonce || !signature) {
      return reply.status(400).send({ error: 'Bad request', message: 'vaultAddress, ownerAddress, nonce, and signature are required.' });
    }

    const vault = await ctx.getVaultByAddress(vaultAddress);
    if (!vault) return reply.status(404).send({ error: 'Not found', message: `Vault ${vaultAddress} is not indexed.` });
    if (vault.owner !== ownerAddress) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Owner address does not match indexed vault owner.' });
    }

    const challenge = await ctx.prisma.claimNonce.findFirst({
      where: { vaultAddress, ownerAddress, nonce },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge || challenge.usedAt) {
      return reply.status(404).send({ error: 'Not found', message: 'Claim nonce is missing or already used.' });
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      return reply.status(410).send({ error: 'Expired', message: 'Claim nonce has expired.' });
    }

    const message = ctx.buildClaimMessage({
      vaultAddress,
      ownerAddress,
      nonce: challenge.nonce,
      issuedAt: challenge.issuedAt.toISOString(),
      expiresAt: challenge.expiresAt.toISOString(),
    });
    const recoveredAddress = ctx.verifyClaimSignature(message, signature);
    if (!recoveredAddress || recoveredAddress !== ownerAddress) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Signature does not match the indexed vault owner.' });
    }

    const now = new Date();
    const sessionToken = ctx.issueSessionToken();
    const sessionExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await ctx.prisma.$transaction(async (tx) => {
      await tx.claimNonce.update({ where: { id: challenge.id }, data: { usedAt: now } });
      await tx.vaultClaim.updateMany({ where: { vaultAddress, revokedAt: null }, data: { revokedAt: now } });
      await tx.vaultClaim.create({
        data: {
          vaultAddress,
          ownerAddress,
          claimedAt: now,
          lastVerifiedAt: now,
          claimMethod: 'wallet_signature',
          signatureDigest: signatureDigest(signature),
        },
      });
      await tx.ownerSession.create({
        data: {
          ownerAddress,
          tokenHash: sessionTokenDigest(sessionToken),
          lastSeenAt: now,
          expiresAt: sessionExpiresAt,
        },
      });
    });

    return {
      vaultAddress,
      ownerAddress,
      claimed: true,
      claimedAt: now.toISOString(),
      sessionToken,
      sessionExpiresAt: sessionExpiresAt.toISOString(),
    };
  });

  app.get('/api/v1/owner/claims/:vaultAddress', async (req, reply) => {
    const auth = await ctx.requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) return reply.status(auth.statusCode).send(auth.body);
    const vaultAddress = normalizeAddress((req.params as { vaultAddress: string }).vaultAddress);
    if (!vaultAddress) return reply.status(404).send({ error: 'Not found', message: 'Invalid vault address.' });
    const claim = await ctx.getActiveClaim(vaultAddress, auth.session.ownerAddress);
    return {
      vaultAddress,
      ownerAddress: auth.session.ownerAddress,
      claimed: Boolean(claim),
      claimedAt: claim?.claimedAt.toISOString() ?? null,
      lastVerifiedAt: claim?.lastVerifiedAt.toISOString() ?? null,
    };
  });

  app.post('/api/v1/owner/destinations', async (req, reply) => {
    const auth = await ctx.requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) return reply.status(auth.statusCode).send(auth.body);
    const body = req.body as { ownerAddress?: string; kind?: string; label?: string; config?: unknown };
    const payloadOwnerAddress = body.ownerAddress ? normalizeAddress(body.ownerAddress) : null;
    const kind = body.kind?.trim() ?? '';
    const label = body.label?.trim() ?? '';
    if (payloadOwnerAddress && payloadOwnerAddress !== auth.session.ownerAddress) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Owner address does not match caller context.' });
    }
    if (!DESTINATION_KINDS.has(kind) || label.length === 0) {
      return reply.status(400).send({ error: 'Bad request', message: 'Valid kind and label are required.' });
    }

    const configJson = parseDestinationConfig(kind, body.config, ctx.config);
    if (!configJson) {
      return reply.status(400).send({ error: 'Bad request', message: 'Invalid destination config.' });
    }

    const destination = await ctx.prisma.notificationDestination.create({
      data: { ownerAddress: auth.session.ownerAddress, kind, label, configJson },
    });
    return {
      id: destination.id,
      ownerAddress: destination.ownerAddress,
      kind: destination.kind,
      label: destination.label,
      createdAt: destination.createdAt.toISOString(),
      disabledAt: destination.disabledAt?.toISOString() ?? null,
      config: sanitizeDestinationConfig(destination.kind, destination.configJson, ctx.config),
    };
  });

  app.post('/api/v1/owner/destinations/telegram/connect', async (req, reply) => {
    const auth = await ctx.requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) return reply.status(auth.statusCode).send(auth.body);
    if (!ctx.config.managedTelegramBotToken || !ctx.config.managedTelegramBotUsername) {
      return reply.status(503).send({ error: 'Unavailable', message: 'Beacon-managed Telegram connect is not configured on this deployment.' });
    }

    const label = ((req.body as { label?: string } | undefined)?.label?.trim()) || 'Telegram alerts';
    const expiresAt = new Date(Math.min(Date.now() + TELEGRAM_LINK_TTL_MS, auth.session.expiresAt.getTime()));
    const pendingDestination = await ctx.prisma.notificationDestination.create({
      data: {
        ownerAddress: auth.session.ownerAddress,
        kind: 'telegram',
        label,
        configJson: {
          pendingSessionTokenHash: auth.session.tokenHash,
          pendingExpiresAt: expiresAt.toISOString(),
        },
      },
    });

    const link = ctx.buildTelegramConnectLink({
      destinationId: pendingDestination.id,
      expiresAt,
    });
    if (!link.startToken || !link.botUsername) {
      return reply.status(503).send({ error: 'Unavailable', message: 'Beacon-managed Telegram connect is missing its signing secret.' });
    }

    return {
      ownerAddress: auth.session.ownerAddress,
      botUsername: link.botUsername,
      label,
      expiresAt: link.expiresAt,
      startToken: link.startToken,
      deepLinkUrl: `https://t.me/${link.botUsername}?start=${link.startToken}`,
    };
  });

  app.post('/api/v1/owner/vaults/:vaultAddress/purposes', async (req, reply) => {
    const auth = await ctx.requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) return reply.status(auth.statusCode).send(auth.body);

    const vaultAddress = normalizeAddress((req.params as { vaultAddress: string }).vaultAddress);
    const body = req.body as { purposeHash?: string; purposeText?: string };
    const purposeHash = body.purposeHash?.trim().toLowerCase() ?? '';
    const purposeText = body.purposeText?.trim() ?? '';

    if (!vaultAddress) {
      return reply.status(404).send({ error: 'Not found', message: 'Invalid vault address.' });
    }
    if (!/^0x[a-f0-9]{64}$/.test(purposeHash)) {
      return reply.status(400).send({ error: 'Bad request', message: 'Valid purposeHash is required.' });
    }
    if (purposeText.length === 0) {
      return reply.status(400).send({ error: 'Bad request', message: 'Purpose text is required.' });
    }

    const claim = await ctx.getActiveClaim(vaultAddress, auth.session.ownerAddress);
    if (!claim) return reply.status(403).send({ error: 'Forbidden', message: 'Active vault claim required.' });

    const purpose = await ctx.prisma.withdrawalPurpose.upsert({
      where: {
        vaultAddress_purposeHash: {
          vaultAddress,
          purposeHash,
        },
      },
      update: {
        ownerAddress: auth.session.ownerAddress,
        purposeText,
      },
      create: {
        vaultAddress,
        ownerAddress: auth.session.ownerAddress,
        purposeHash,
        purposeText,
      },
    });

    return {
      vaultAddress: purpose.vaultAddress,
      purposeHash: purpose.purposeHash,
      purposeText: purpose.purposeText,
      updatedAt: purpose.updatedAt.toISOString(),
    };
  });

  app.get('/api/v1/owner/destinations', async (req, reply) => {
    const auth = await ctx.requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) return reply.status(auth.statusCode).send(auth.body);
    const destinations = (await ctx.prisma.notificationDestination.findMany({
      where: { ownerAddress: auth.session.ownerAddress, disabledAt: null },
      orderBy: { createdAt: 'asc' },
    })).filter((destination) => destination.kind !== 'telegram' || isLinkedTelegramDestination(destination.configJson));

    return {
      ownerAddress: auth.session.ownerAddress,
      destinations: destinations.map((destination) => ({
        id: destination.id,
        kind: destination.kind,
        label: destination.label,
        createdAt: destination.createdAt.toISOString(),
        disabledAt: destination.disabledAt?.toISOString() ?? null,
        config: sanitizeDestinationConfig(destination.kind, destination.configJson, ctx.config),
      })),
    };
  });

  app.delete('/api/v1/owner/destinations/:id', async (req, reply) => {
    const auth = await ctx.requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) return reply.status(auth.statusCode).send(auth.body);
    const id = (req.params as { id: string }).id;
    const destination = await ctx.prisma.notificationDestination.findFirst({
      where: { id, ownerAddress: auth.session.ownerAddress, disabledAt: null },
    });
    if (!destination) return reply.status(404).send({ error: 'Not found', message: 'Active destination not found.' });

    const now = new Date();
    await ctx.prisma.$transaction(async (tx) => {
      await tx.notificationDestination.update({ where: { id }, data: { disabledAt: now } });
      await tx.notificationSubscription.updateMany({
        where: { destinationId: id, ownerAddress: auth.session.ownerAddress, disabledAt: null },
        data: { disabledAt: now },
      });
    });
    return { id, disabled: true, disabledAt: now.toISOString() };
  });

  app.post('/api/v1/owner/subscriptions', async (req, reply) => {
    const auth = await ctx.requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) return reply.status(auth.statusCode).send(auth.body);
    const body = req.body as { vaultAddress?: string; ownerAddress?: string; destinationId?: string; eventKinds?: unknown };
    const vaultAddress = normalizeAddress(body.vaultAddress ?? '');
    const payloadOwnerAddress = body.ownerAddress ? normalizeAddress(body.ownerAddress) : null;
    const destinationId = body.destinationId?.trim();
    const eventKinds = parseEventKinds(body.eventKinds);
    if (!vaultAddress || (payloadOwnerAddress && payloadOwnerAddress !== auth.session.ownerAddress) || !destinationId || !eventKinds) {
      return reply.status(400).send({ error: 'Bad request', message: 'vaultAddress, destinationId, and valid eventKinds are required.' });
    }

    const claim = await ctx.getActiveClaim(vaultAddress, auth.session.ownerAddress);
    if (!claim) return reply.status(403).send({ error: 'Forbidden', message: 'Active vault claim required.' });

    const destination = await ctx.prisma.notificationDestination.findFirst({
      where: { id: destinationId, ownerAddress: auth.session.ownerAddress, disabledAt: null },
    });
    if (!destination) return reply.status(404).send({ error: 'Not found', message: 'Destination not found for owner.' });

    const existing = await ctx.prisma.notificationSubscription.findFirst({
      where: { vaultAddress, destinationId, ownerAddress: auth.session.ownerAddress, disabledAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      const subscription = await ctx.prisma.notificationSubscription.update({
        where: { id: existing.id },
        data: { eventKindsJson: eventKinds },
      });
      return {
        id: subscription.id,
        vaultAddress: subscription.vaultAddress,
        destinationId: subscription.destinationId,
        ownerAddress: subscription.ownerAddress,
        eventKinds,
        createdAt: subscription.createdAt.toISOString(),
        disabledAt: subscription.disabledAt?.toISOString() ?? null,
      };
    }

    const subscription = await ctx.prisma.notificationSubscription.create({
      data: { vaultAddress, destinationId, ownerAddress: auth.session.ownerAddress, eventKindsJson: eventKinds },
    });
    return {
      id: subscription.id,
      vaultAddress: subscription.vaultAddress,
      destinationId: subscription.destinationId,
      ownerAddress: subscription.ownerAddress,
      eventKinds,
      createdAt: subscription.createdAt.toISOString(),
      disabledAt: subscription.disabledAt?.toISOString() ?? null,
    };
  });

  app.get('/api/v1/owner/subscriptions', async (req, reply) => {
    const auth = await ctx.requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) return reply.status(auth.statusCode).send(auth.body);
    const vaultAddress = normalizeAddress(((req.query as { vaultAddress?: string }).vaultAddress ?? '').trim());
    const subscriptions = await ctx.prisma.notificationSubscription.findMany({
      where: { ownerAddress: auth.session.ownerAddress, disabledAt: null, ...(vaultAddress ? { vaultAddress } : {}) },
      include: { destination: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ownerAddress: auth.session.ownerAddress,
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription.id,
        vaultAddress: subscription.vaultAddress,
        destinationId: subscription.destinationId,
        eventKinds: Array.isArray(subscription.eventKindsJson) ? subscription.eventKindsJson : [],
        createdAt: subscription.createdAt.toISOString(),
        disabledAt: subscription.disabledAt?.toISOString() ?? null,
        destination: {
          id: subscription.destination.id,
          kind: subscription.destination.kind,
          label: subscription.destination.label,
          config: sanitizeDestinationConfig(subscription.destination.kind, subscription.destination.configJson, ctx.config),
        },
      })),
    };
  });

  app.delete('/api/v1/owner/subscriptions/:id', async (req, reply) => {
    const auth = await ctx.requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) return reply.status(auth.statusCode).send(auth.body);
    const id = (req.params as { id: string }).id;
    const subscription = await ctx.prisma.notificationSubscription.findFirst({
      where: { id, ownerAddress: auth.session.ownerAddress, disabledAt: null },
    });
    if (!subscription) return reply.status(404).send({ error: 'Not found', message: 'Active subscription not found.' });
    const now = new Date();
    await ctx.prisma.notificationSubscription.update({ where: { id }, data: { disabledAt: now } });
    return { id, disabled: true, disabledAt: now.toISOString() };
  });

  app.get('/api/v1/owner/deliveries', async (req, reply) => {
    const auth = await ctx.requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) return reply.status(auth.statusCode).send(auth.body);
    const vaultAddress = normalizeAddress(((req.query as { vaultAddress?: string }).vaultAddress ?? '').trim());
    const deliveries = await ctx.prisma.notificationDelivery.findMany({
      where: {
        subscription: {
          ownerAddress: auth.session.ownerAddress,
          ...(vaultAddress ? { vaultAddress } : {}),
        },
      },
      include: { subscription: true, destination: true, beaconEvent: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      ownerAddress: auth.session.ownerAddress,
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        status: delivery.status,
        vaultAddress: delivery.subscription.vaultAddress,
        beaconEventId: delivery.beaconEventId,
        eventKind: delivery.beaconEvent.kind,
        destination: {
          id: delivery.destination.id,
          kind: delivery.destination.kind,
          label: delivery.destination.label,
        },
        attemptCount: delivery.attemptCount,
        lastAttemptAt: delivery.lastAttemptAt?.toISOString() ?? null,
        deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
        errorMessage: delivery.errorMessage,
        createdAt: delivery.createdAt.toISOString(),
      })),
    };
  });
}
