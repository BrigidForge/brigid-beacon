import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { ReturnTypeContext } from './types.js';

export async function registerIntegrationRoutes(app: FastifyInstance, ctx: ReturnTypeContext) {
  app.post('/api/v1/integrations/telegram/webhook', async (req, reply) => {
    const configuredSecret = ctx.config.telegramWebhookSecret;
    const providedSecretHeader = req.headers['x-telegram-bot-api-secret-token'];
    const providedSecret = Array.isArray(providedSecretHeader) ? providedSecretHeader[0] : providedSecretHeader;

    if (configuredSecret && providedSecret !== configuredSecret) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid Telegram webhook secret.' });
    }

    const update = req.body as {
      message?: {
        text?: string;
        chat?: { id?: number | string; type?: string; username?: string; first_name?: string; title?: string };
      };
    };

    const text = update.message?.text?.trim() ?? '';
    const chat = update.message?.chat;
    const chatId = chat?.id != null ? String(chat.id) : null;
    const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/);

    if (!chatId || !chat || chat.type !== 'private') return { ok: true };

    if (!startMatch) {
      await ctx.sendManagedTelegramMessage(chatId, 'Open Beacon and tap "Connect Telegram" to finish linking alerts to this chat.').catch(() => {});
      return { ok: true };
    }

    const providedToken = startMatch[1]?.trim();
    if (!providedToken) {
      await ctx.sendManagedTelegramMessage(chatId, 'Open Beacon and tap "Connect Telegram" so I can link this chat to your alert settings.').catch(() => {});
      return { ok: true };
    }

    const payload = ctx.decodeTelegramLinkToken(providedToken);
    if (!payload) {
      await ctx.sendManagedTelegramMessage(chatId, 'That Beacon link has expired. Open Beacon and request a fresh Telegram connection link.').catch(() => {});
      return { ok: true };
    }

    const destination = await ctx.prisma.notificationDestination.findFirst({
      where: {
        id: payload.destinationId,
        kind: 'telegram',
        disabledAt: null,
      },
    });

    const destinationConfig =
      destination?.configJson && typeof destination.configJson === 'object' && !Array.isArray(destination.configJson)
        ? (destination.configJson as Record<string, unknown>)
        : null;

    const pendingSessionTokenHash =
      typeof destinationConfig?.pendingSessionTokenHash === 'string' ? destinationConfig.pendingSessionTokenHash : null;
    const pendingExpiresAt =
      typeof destinationConfig?.pendingExpiresAt === 'string' ? destinationConfig.pendingExpiresAt : null;

    if (!destination || !pendingSessionTokenHash || !pendingExpiresAt || Date.parse(pendingExpiresAt) <= Date.now()) {
      await ctx.sendManagedTelegramMessage(chatId, 'Your Beacon session expired before this chat was linked. Go back to Beacon and try Connect Telegram again.').catch(() => {});
      return { ok: true };
    }

    const session = await ctx.prisma.ownerSession.findFirst({
      where: {
        ownerAddress: destination.ownerAddress,
        tokenHash: pendingSessionTokenHash,
        revokedAt: null,
      },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      await ctx.sendManagedTelegramMessage(chatId, 'Your Beacon session expired before this chat was linked. Go back to Beacon and try Connect Telegram again.').catch(() => {});
      return { ok: true };
    }

    const activeTelegramDestinations = await ctx.prisma.notificationDestination.findMany({
      where: { ownerAddress: destination.ownerAddress, kind: 'telegram', disabledAt: null },
    });
    const existingDestination = activeTelegramDestinations.find((destination) => {
      const configJson =
        destination.configJson && typeof destination.configJson === 'object' && !Array.isArray(destination.configJson)
          ? (destination.configJson as Record<string, unknown>)
          : null;
      return typeof configJson?.chatId === 'string' && configJson.chatId === chatId;
    });

    const configJson = {
      chatId,
      chatTitle: chat.title ?? chat.first_name ?? `Chat ${chatId}`,
      ...(chat.username ? { chatUsername: chat.username } : {}),
    } satisfies Prisma.InputJsonObject;

    const destinationLabel = destination.label || 'Telegram alerts';

    if (existingDestination && existingDestination.id !== destination.id) {
      await ctx.prisma.notificationDestination.update({
        where: { id: existingDestination.id },
        data: { label: destinationLabel, configJson },
      });
      await ctx.prisma.notificationDestination.update({
        where: { id: destination.id },
        data: { disabledAt: new Date() },
      });
    } else {
      await ctx.prisma.notificationDestination.update({
        where: { id: destination.id },
        data: { configJson },
      });
    }

    await ctx.sendManagedTelegramMessage(chatId, `Beacon alerts are now connected to this chat as "${destinationLabel}". Return to Beacon to choose which events you want.`).catch(() => {});
    return { ok: true };
  });
}
