import Fastify from 'fastify';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { JsonRpcProvider, getAddress, verifyMessage } from 'ethers';
import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  DeploymentProof,
  NormalizedEvent,
  VaultEventsResponse,
  VaultMetadata,
} from '@brigid/beacon-shared-types';
import { computeVaultStatus } from '@brigid/beacon-status-engine';
import { config } from './config.js';

const CLAIM_NONCE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TELEGRAM_LINK_TTL_MS = 15 * 60 * 1000;
const DESTINATION_KINDS = new Set(['telegram', 'discord_webhook', 'webhook']);
const EVENT_KINDS = new Set([
  'vault_created',
  'vault_funded',
  'excess_deposited',
  'protected_withdrawal_requested',
  'excess_withdrawal_requested',
  'withdrawal_canceled',
  'withdrawal_executed',
  'request_expired',
]);

function normalizeAddress(input: string): string | null {
  try {
    return getAddress(input);
  } catch {
    try {
      return getAddress(input.toLowerCase());
    } catch {
      return null;
    }
  }
}

function buildClaimMessage(params: {
  vaultAddress: string;
  ownerAddress: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}): string {
  return [
    'BrigidVault Beacon Claim',
    `Vault: ${params.vaultAddress}`,
    `Owner: ${params.ownerAddress}`,
    `Chain ID: ${config.chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt}`,
    `Expires At: ${params.expiresAt}`,
  ].join('\n');
}

function signatureDigest(signature: string): string {
  return createHash('sha256').update(signature).digest('hex');
}

function sessionTokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function optionalString(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getManagedTelegramBotToken(): string | null {
  return optionalString(process.env.TELEGRAM_BOT_TOKEN);
}

function getManagedTelegramBotUsername(): string | null {
  const username = optionalString(process.env.TELEGRAM_BOT_USERNAME);
  return username ? username.replace(/^@/, '') : null;
}

function getTelegramWebhookSecret(): string | null {
  return optionalString(process.env.TELEGRAM_WEBHOOK_SECRET);
}

function getTelegramLinkSecret(): string | null {
  return optionalString(process.env.TELEGRAM_LINK_SECRET) ?? getManagedTelegramBotToken();
}

type TelegramLinkPayload = {
  ownerAddress: string;
  label: string;
  sessionTokenHash: string;
  expiresAt: string;
};

function encodeTelegramLinkToken(payload: TelegramLinkPayload): string | null {
  const secret = getTelegramLinkSecret();
  if (!secret) return null;

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function decodeTelegramLinkToken(token: string): TelegramLinkPayload | null {
  const secret = getTelegramLinkSecret();
  if (!secret) return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<TelegramLinkPayload>;
    if (
      typeof payload.ownerAddress !== 'string' ||
      typeof payload.label !== 'string' ||
      typeof payload.sessionTokenHash !== 'string' ||
      typeof payload.expiresAt !== 'string'
    ) {
      return null;
    }
    if (Date.parse(payload.expiresAt) <= Date.now()) {
      return null;
    }
    return payload as TelegramLinkPayload;
  } catch {
    return null;
  }
}

async function sendManagedTelegramMessage(chatId: string, text: string) {
  const botToken = getManagedTelegramBotToken();
  if (!botToken) return;

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram API ${response.status}: ${await response.text()}`);
  }
}

function getBearerToken(headers: Record<string, unknown>): string | null {
  const authorization = headers.authorization ?? headers.Authorization;
  if (typeof authorization !== 'string') return null;
  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

function sanitizeDestinationConfig(kind: string, configJson: unknown): Record<string, unknown> {
  if (!configJson || typeof configJson !== 'object') {
    return {};
  }

  const config = configJson as Record<string, unknown>;
  if (kind === 'webhook' || kind === 'discord_webhook') {
    const url = typeof config.url === 'string' ? config.url : '';
    return {
      hasUrl: Boolean(url),
      urlPreview: url ? `${url.slice(0, 24)}...` : null,
    };
  }

  if (kind === 'telegram') {
    const chatTitle =
      typeof config.chatTitle === 'string'
        ? config.chatTitle
        : typeof config.chatUsername === 'string'
          ? `@${config.chatUsername}`
          : null;
    return {
      chatId: typeof config.chatId === 'string' ? config.chatId : null,
      hasBotToken: typeof config.botToken === 'string' && config.botToken.length > 0,
      hasManagedBot: typeof config.botToken !== 'string' && Boolean(getManagedTelegramBotToken()),
      chatTitle,
    };
  }

  return {};
}

function parseDestinationConfig(kind: string, input: unknown): Prisma.InputJsonValue | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const config = input as Record<string, unknown>;
  if (kind === 'webhook' || kind === 'discord_webhook') {
    if (typeof config.url !== 'string' || config.url.length === 0) {
      return null;
    }
    return { url: config.url } satisfies Prisma.InputJsonObject;
  }

  if (kind === 'telegram') {
    if (typeof config.chatId !== 'string' || config.chatId.length === 0) {
      return null;
    }
    if (
      typeof config.botToken !== 'string' &&
      getManagedTelegramBotToken() == null
    ) {
      return null;
    }
    if (typeof config.botToken === 'string' && config.botToken.length === 0) {
      return null;
    }
    return {
      chatId: config.chatId,
      ...(typeof config.botToken === 'string' ? { botToken: config.botToken } : {}),
      ...(typeof config.chatTitle === 'string' ? { chatTitle: config.chatTitle } : {}),
      ...(typeof config.chatUsername === 'string' ? { chatUsername: config.chatUsername } : {}),
    } satisfies Prisma.InputJsonObject;
  }

  return null;
}

function parseEventKinds(input: unknown): Prisma.InputJsonValue | null {
  if (!Array.isArray(input) || input.length === 0) {
    return null;
  }

  const normalized = Array.from(
    new Set(
      input.filter((value): value is string => typeof value === 'string' && EVENT_KINDS.has(value)),
    ),
  );

  return normalized.length === input.length ? normalized : null;
}

function toVaultMetadata(vault: {
  id: string;
  chainId: number;
  owner: string;
  token: string;
  totalAllocation: string;
  startTime: string;
  cliffDuration: string;
  intervalDuration: string;
  intervalCount: string;
  cancelWindow: string;
  withdrawalDelay: string;
  executionWindow: string;
  createdAt: Date;
  deployedAtBlock: number;
  deployedAtTx: string;
}): VaultMetadata {
  return {
    address: vault.id,
    chainId: vault.chainId,
    owner: vault.owner,
    token: vault.token,
    totalAllocation: vault.totalAllocation,
    startTime: vault.startTime,
    cliffDuration: vault.cliffDuration,
    intervalDuration: vault.intervalDuration,
    intervalCount: vault.intervalCount,
    cancelWindow: vault.cancelWindow,
    withdrawalDelay: vault.withdrawalDelay,
    executionWindow: vault.executionWindow,
    createdAt: vault.createdAt.toISOString(),
    deployedAtBlock: vault.deployedAtBlock,
    deployedAtTx: vault.deployedAtTx,
  };
}

function toNormalizedEvent(row: {
  id: string;
  vaultAddress: string;
  kind: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  timestamp: Date;
  payload: unknown;
}): NormalizedEvent {
  return {
    id: row.id,
    vaultAddress: row.vaultAddress,
    kind: row.kind as NormalizedEvent['kind'],
    blockNumber: row.blockNumber,
    transactionHash: row.transactionHash,
    logIndex: row.logIndex,
    timestamp: row.timestamp.toISOString(),
    payload: row.payload as NormalizedEvent['payload'],
  };
}

async function buildVaultStatusBundle(
  prisma: PrismaClient,
  vault: {
    id: string;
    chainId: number;
    owner: string;
    token: string;
    totalAllocation: string;
    startTime: string;
    cliffDuration: string;
    intervalDuration: string;
    intervalCount: string;
    cancelWindow: string;
    withdrawalDelay: string;
    executionWindow: string;
    createdAt: Date;
    deployedAtBlock: number;
    deployedAtTx: string;
  },
) {
  const events = await prisma.beaconEvent.findMany({
    where: { vaultAddress: vault.id },
    orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
  });

  return computeVaultStatus({
    metadata: toVaultMetadata(vault),
    events: events.map(toNormalizedEvent),
  });
}

async function buildTokenAnalytics(prisma: PrismaClient, tokenAddress: string) {
  const vaults = await prisma.vault.findMany({
    where: { token: tokenAddress },
    orderBy: [{ createdAt: 'desc' }, { deployedAtBlock: 'desc' }],
  });

  const statuses = await Promise.all(
    vaults.map(async (vault) => ({
      metadata: toVaultMetadata(vault),
      status: await buildVaultStatusBundle(prisma, vault),
      deployer: vault.deployer,
    })),
  );

  const totalAllocation = statuses.reduce((total, entry) => total + BigInt(entry.metadata.totalAllocation), 0n);
  const protectedOutstandingBalance = statuses.reduce(
    (total, entry) => total + BigInt(entry.status.protectedOutstandingBalance),
    0n,
  );
  const excessBalance = statuses.reduce((total, entry) => total + BigInt(entry.status.excessBalance), 0n);
  const ownerCount = new Set(statuses.map((entry) => entry.metadata.owner)).size;
  const deployerCount = new Set(statuses.map((entry) => entry.deployer)).size;

  return {
    tokenAddress,
    vaultCount: statuses.length,
    ownerCount,
    deployerCount,
    totalAllocation: totalAllocation.toString(),
    protectedOutstandingBalance: protectedOutstandingBalance.toString(),
    excessBalance: excessBalance.toString(),
    vaults: statuses,
  };
}

type ChainProvider = Pick<JsonRpcProvider, 'getBlockNumber' | 'getBlock'>;

export function buildApp(prisma: PrismaClient, options: { chainProvider?: ChainProvider | null } = {}) {
  const app = Fastify({ logger: true });
  const chainProvider = options.chainProvider ?? (config.rpcUrl ? new JsonRpcProvider(config.rpcUrl) : null);

  async function getVaultByAddress(address: string) {
    return prisma.vault.findUnique({ where: { id: address } });
  }

  async function getActiveClaim(vaultAddress: string, ownerAddress: string) {
    return prisma.vaultClaim.findFirst({
      where: {
        vaultAddress,
        ownerAddress,
        revokedAt: null,
      },
      orderBy: { claimedAt: 'desc' },
    });
  }

  async function requireOwnerSession(headers: Record<string, unknown>) {
    const token = getBearerToken(headers);
    if (!token) {
      return { ok: false as const, statusCode: 401, body: { error: 'Unauthorized', message: 'Missing bearer session token.' } };
    }

    const session = await prisma.ownerSession.findFirst({
      where: {
        tokenHash: sessionTokenDigest(token),
        revokedAt: null,
      },
    });

    if (!session || session.expiresAt.getTime() <= Date.now()) {
      return { ok: false as const, statusCode: 401, body: { error: 'Unauthorized', message: 'Session is missing or expired.' } };
    }

    await prisma.ownerSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return { ok: true as const, session, token };
  }

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/api/v1/operator/health', async (_req, reply) => {
    const indexerState = await prisma.indexerState.findUnique({
      where: { id: config.indexerStateId },
    });

    if (!chainProvider) {
      return reply.status(503).send({
        error: 'Unavailable',
        message: 'RPC_URL is not configured for operator health checks.',
      });
    }

    const [chainHeadNumber, indexedBlock, vaultCount, beaconEventCount, activeSubscriptionCount, pendingDeliveryCount, failedDeliveryCount] = await Promise.all([
      chainProvider.getBlockNumber(),
      indexerState?.lastBlockNumber ? chainProvider.getBlock(indexerState.lastBlockNumber) : Promise.resolve(null),
      prisma.vault.count(),
      prisma.beaconEvent.count(),
      prisma.notificationSubscription.count({ where: { disabledAt: null } }),
      prisma.notificationDelivery.count({ where: { status: 'pending' } }),
      prisma.notificationDelivery.count({ where: { status: { not: 'sent' } } }),
    ]);

    const chainHeadBlock = await chainProvider.getBlock(chainHeadNumber);
    const lagBlocks = indexerState ? Math.max(0, chainHeadNumber - indexerState.lastBlockNumber) : chainHeadNumber;
    const lagSeconds =
      chainHeadBlock?.timestamp != null && indexedBlock?.timestamp != null
        ? Math.max(0, chainHeadBlock.timestamp - indexedBlock.timestamp)
        : null;
    const staleThresholdMs = config.pollIntervalMs * 3;
    const lastIndexerRunAt = indexerState?.lastIndexerRunAt ?? null;
    const isStale =
      lastIndexerRunAt == null ? true : Date.now() - lastIndexerRunAt.getTime() > staleThresholdMs;

    return {
      chainId: config.chainId,
      factoryAddress: config.factoryAddress,
      chainHeadBlock: chainHeadNumber,
      indexer: {
        stateId: indexerState?.id ?? 'default',
        stateIdConfigured: config.indexerStateId,
        lastIndexedBlock: indexerState?.lastBlockNumber ?? 0,
        lastIndexedBlockHash: indexerState?.lastBlockHash ?? null,
        lastIndexedAt: indexerState?.lastIndexedAt?.toISOString() ?? null,
        lastIndexerRunAt: indexerState?.lastIndexerRunAt?.toISOString() ?? null,
        lastDispatcherRunAt: indexerState?.lastDispatcherRunAt?.toISOString() ?? null,
        discoveryMode: indexerState?.discoveryMode ?? null,
        lagBlocks,
        lagSeconds,
        isStale,
        staleThresholdMs,
        lastErrorAt: indexerState?.lastErrorAt?.toISOString() ?? null,
        lastErrorMessage: indexerState?.lastErrorMessage ?? null,
      },
      stats: {
        vaultCount,
        beaconEventCount,
        activeSubscriptionCount,
        pendingDeliveryCount,
        failedDeliveryCount,
      },
    };
  });

  app.get('/api/v1/analytics/overview', async () => {
    const [vaults, beaconEventCount] = await Promise.all([
      prisma.vault.findMany({
        select: {
          id: true,
          token: true,
          owner: true,
          deployer: true,
        },
      }),
      prisma.beaconEvent.count(),
    ]);

    return {
      vaultCount: vaults.length,
      tokenCount: new Set(vaults.map((vault) => vault.token)).size,
      ownerCount: new Set(vaults.map((vault) => vault.owner)).size,
      deployerCount: new Set(vaults.map((vault) => vault.deployer)).size,
      beaconEventCount,
    };
  });

  app.get('/api/v1/analytics/tokens', async () => {
    const tokens = await prisma.vault.findMany({
      select: { token: true },
      distinct: ['token'],
      orderBy: { token: 'asc' },
    });

    const summaries = await Promise.all(tokens.map((entry) => buildTokenAnalytics(prisma, entry.token)));
    return {
      tokens: summaries.map((summary) => ({
        tokenAddress: summary.tokenAddress,
        vaultCount: summary.vaultCount,
        ownerCount: summary.ownerCount,
        deployerCount: summary.deployerCount,
        totalAllocation: summary.totalAllocation,
        protectedOutstandingBalance: summary.protectedOutstandingBalance,
        excessBalance: summary.excessBalance,
      })),
    };
  });

  app.get('/api/v1/analytics/tokens/:token', async (req, reply) => {
    const tokenAddress = normalizeAddress((req.params as { token: string }).token);
    if (!tokenAddress) {
      return reply.status(404).send({ error: 'Not found', message: 'Invalid token address.' });
    }

    const summary = await buildTokenAnalytics(prisma, tokenAddress);
    if (summary.vaultCount === 0) {
      return reply.status(404).send({ error: 'Not found', message: `No indexed vaults found for token ${tokenAddress}.` });
    }

    return {
      tokenAddress: summary.tokenAddress,
      vaultCount: summary.vaultCount,
      ownerCount: summary.ownerCount,
      deployerCount: summary.deployerCount,
      totalAllocation: summary.totalAllocation,
      protectedOutstandingBalance: summary.protectedOutstandingBalance,
      excessBalance: summary.excessBalance,
      vaults: summary.vaults,
    };
  });

  app.get('/api/v1/owner/session', async (req, reply) => {
    const auth = await requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) {
      return reply.status(auth.statusCode).send(auth.body);
    }

    return {
      ownerAddress: auth.session.ownerAddress,
      expiresAt: auth.session.expiresAt.toISOString(),
      lastSeenAt: auth.session.lastSeenAt.toISOString(),
    };
  });

  app.get('/api/v1/owner/portfolio', async (req, reply) => {
    const auth = await requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) {
      return reply.status(auth.statusCode).send(auth.body);
    }

    const ownerAddress = auth.session.ownerAddress;
    const vaults = await prisma.vault.findMany({
      where: { owner: ownerAddress },
      orderBy: [{ createdAt: 'desc' }, { deployedAtBlock: 'desc' }],
    });

    const portfolio = await Promise.all(
      vaults.map(async (vault) => {
        const [status, claim, activeSubscriptionCount, recentDeliveryFailures, lastDelivery] = await Promise.all([
          buildVaultStatusBundle(prisma, vault),
          getActiveClaim(vault.id, ownerAddress),
          prisma.notificationSubscription.count({
            where: {
              ownerAddress,
              vaultAddress: vault.id,
              disabledAt: null,
            },
          }),
          prisma.notificationDelivery.count({
            where: {
              subscription: {
                ownerAddress,
                vaultAddress: vault.id,
              },
              status: { not: 'sent' },
            },
          }),
          prisma.notificationDelivery.findFirst({
            where: {
              subscription: {
                ownerAddress,
                vaultAddress: vault.id,
              },
            },
            orderBy: [{ deliveredAt: 'desc' }, { lastAttemptAt: 'desc' }, { createdAt: 'desc' }],
          }),
        ]);

        return {
          metadata: toVaultMetadata(vault),
          status,
          claim: {
            claimed: Boolean(claim),
            claimedAt: claim?.claimedAt.toISOString() ?? null,
          },
          activeSubscriptionCount,
          recentDeliveryFailures,
          lastDeliveryAt:
            lastDelivery?.deliveredAt?.toISOString() ??
            lastDelivery?.lastAttemptAt?.toISOString() ??
            lastDelivery?.createdAt.toISOString() ??
            null,
        };
      }),
    );

    return {
      ownerAddress,
      vaults: portfolio,
    };
  });

  app.delete('/api/v1/owner/session', async (req, reply) => {
    const token = getBearerToken(req.headers as Record<string, unknown>);
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing bearer session token.' });
    }

    const tokenHash = sessionTokenDigest(token);
    const session = await prisma.ownerSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
      },
    });
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Session is missing or expired.' });
    }

    const now = new Date();
    await prisma.ownerSession.update({
      where: { id: session.id },
      data: { revokedAt: now },
    });

    return {
      revoked: true,
      revokedAt: now.toISOString(),
    };
  });

  app.post('/api/v1/owner/claims/nonce', async (req, reply) => {
    const body = req.body as { vaultAddress?: string; ownerAddress?: string };
    const vaultAddress = normalizeAddress(body.vaultAddress ?? '');
    const ownerAddress = normalizeAddress(body.ownerAddress ?? '');

    if (!vaultAddress || !ownerAddress) {
      return reply.status(400).send({ error: 'Bad request', message: 'Valid vaultAddress and ownerAddress are required.' });
    }

    const vault = await getVaultByAddress(vaultAddress);
    if (!vault) {
      return reply.status(404).send({ error: 'Not found', message: `Vault ${vaultAddress} is not indexed.` });
    }

    if (vault.owner !== ownerAddress) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Owner address does not match indexed vault owner.' });
    }

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + CLAIM_NONCE_TTL_MS);
    const nonce = randomBytes(16).toString('hex');

    await prisma.claimNonce.create({
      data: {
        vaultAddress,
        ownerAddress,
        nonce,
        issuedAt,
        expiresAt,
      },
    });

    return {
      vaultAddress,
      ownerAddress,
      chainId: config.chainId,
      nonce,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      message: buildClaimMessage({
        vaultAddress,
        ownerAddress,
        nonce,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      }),
    };
  });

  app.post('/api/v1/owner/claims/verify', async (req, reply) => {
    const body = req.body as {
      vaultAddress?: string;
      ownerAddress?: string;
      nonce?: string;
      signature?: string;
    };
    const vaultAddress = normalizeAddress(body.vaultAddress ?? '');
    const ownerAddress = normalizeAddress(body.ownerAddress ?? '');
    const nonce = body.nonce?.trim();
    const signature = body.signature?.trim();

    if (!vaultAddress || !ownerAddress || !nonce || !signature) {
      return reply
        .status(400)
        .send({ error: 'Bad request', message: 'vaultAddress, ownerAddress, nonce, and signature are required.' });
    }

    const vault = await getVaultByAddress(vaultAddress);
    if (!vault) {
      return reply.status(404).send({ error: 'Not found', message: `Vault ${vaultAddress} is not indexed.` });
    }

    if (vault.owner !== ownerAddress) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Owner address does not match indexed vault owner.' });
    }

    const challenge = await prisma.claimNonce.findFirst({
      where: {
        vaultAddress,
        ownerAddress,
        nonce,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge || challenge.usedAt) {
      return reply.status(404).send({ error: 'Not found', message: 'Claim nonce is missing or already used.' });
    }

    if (challenge.expiresAt.getTime() < Date.now()) {
      return reply.status(410).send({ error: 'Expired', message: 'Claim nonce has expired.' });
    }

    const message = buildClaimMessage({
      vaultAddress,
      ownerAddress,
      nonce: challenge.nonce,
      issuedAt: challenge.issuedAt.toISOString(),
      expiresAt: challenge.expiresAt.toISOString(),
    });
    const recoveredAddress = normalizeAddress(verifyMessage(message, signature));

    if (!recoveredAddress || recoveredAddress !== ownerAddress) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Signature does not match the indexed vault owner.' });
    }

    const now = new Date();
    const sessionToken = randomBytes(32).toString('hex');
    const sessionExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await prisma.$transaction(async (tx) => {
      await tx.claimNonce.update({
        where: { id: challenge.id },
        data: { usedAt: now },
      });
      await tx.vaultClaim.updateMany({
        where: { vaultAddress, revokedAt: null },
        data: { revokedAt: now },
      });
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
    const auth = await requireOwnerSession(req.headers as Record<string, unknown>);
    const vaultAddress = normalizeAddress((req.params as { vaultAddress: string }).vaultAddress);

    if (!auth.ok) {
      return reply.status(auth.statusCode).send(auth.body);
    }
    if (!vaultAddress) {
      return reply.status(404).send({ error: 'Not found', message: 'Invalid vault address.' });
    }

    const ownerAddress = auth.session.ownerAddress;
    const claim = await getActiveClaim(vaultAddress, ownerAddress);
    return {
      vaultAddress,
      ownerAddress,
      claimed: Boolean(claim),
      claimedAt: claim?.claimedAt.toISOString() ?? null,
      lastVerifiedAt: claim?.lastVerifiedAt.toISOString() ?? null,
    };
  });

  app.post('/api/v1/owner/destinations', async (req, reply) => {
    const auth = await requireOwnerSession(req.headers as Record<string, unknown>);
    const body = req.body as {
      ownerAddress?: string;
      kind?: string;
      label?: string;
      config?: unknown;
    };
    const payloadOwnerAddress = body.ownerAddress ? normalizeAddress(body.ownerAddress) : null;
    const kind = body.kind?.trim() ?? '';
    const label = body.label?.trim() ?? '';

    if (!auth.ok) {
      return reply.status(auth.statusCode).send(auth.body);
    }
    const ownerAddress = auth.session.ownerAddress;
    if (payloadOwnerAddress && payloadOwnerAddress !== ownerAddress) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Owner address does not match caller context.' });
    }
    if (!DESTINATION_KINDS.has(kind) || label.length === 0) {
      return reply.status(400).send({ error: 'Bad request', message: 'Valid kind and label are required.' });
    }

    const configJson = parseDestinationConfig(kind, body.config);
    if (!configJson) {
      return reply.status(400).send({ error: 'Bad request', message: 'Invalid destination config.' });
    }

    const destination = await prisma.notificationDestination.create({
      data: {
        ownerAddress,
        kind,
        label,
        configJson,
      },
    });

    return {
      id: destination.id,
      ownerAddress: destination.ownerAddress,
      kind: destination.kind,
      label: destination.label,
      createdAt: destination.createdAt.toISOString(),
      disabledAt: destination.disabledAt?.toISOString() ?? null,
      config: sanitizeDestinationConfig(destination.kind, destination.configJson),
    };
  });

  app.post('/api/v1/owner/destinations/telegram/connect', async (req, reply) => {
    const auth = await requireOwnerSession(req.headers as Record<string, unknown>);
    const body = req.body as { label?: string } | undefined;
    const botToken = getManagedTelegramBotToken();
    const botUsername = getManagedTelegramBotUsername();
    const label = body?.label?.trim() || 'Telegram alerts';

    if (!auth.ok) {
      return reply.status(auth.statusCode).send(auth.body);
    }
    if (!botToken || !botUsername) {
      return reply.status(503).send({
        error: 'Unavailable',
        message: 'Beacon-managed Telegram connect is not configured on this deployment.',
      });
    }

    const expiresAt = new Date(Math.min(Date.now() + TELEGRAM_LINK_TTL_MS, auth.session.expiresAt.getTime())).toISOString();
    const startToken = encodeTelegramLinkToken({
      ownerAddress: auth.session.ownerAddress,
      label,
      sessionTokenHash: auth.session.tokenHash,
      expiresAt,
    });
    if (!startToken) {
      return reply.status(503).send({
        error: 'Unavailable',
        message: 'Beacon-managed Telegram connect is missing its signing secret.',
      });
    }

    return {
      ownerAddress: auth.session.ownerAddress,
      botUsername,
      label,
      expiresAt,
      startToken,
      deepLinkUrl: `https://t.me/${botUsername}?start=${startToken}`,
    };
  });

  app.get('/api/v1/owner/destinations', async (req, reply) => {
    const auth = await requireOwnerSession(req.headers as Record<string, unknown>);
    if (!auth.ok) {
      return reply.status(auth.statusCode).send(auth.body);
    }
    const ownerAddress = auth.session.ownerAddress;

    const destinations = await prisma.notificationDestination.findMany({
      where: {
        ownerAddress,
        disabledAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      ownerAddress,
      destinations: destinations.map((destination) => ({
        id: destination.id,
        kind: destination.kind,
        label: destination.label,
        createdAt: destination.createdAt.toISOString(),
        disabledAt: destination.disabledAt?.toISOString() ?? null,
        config: sanitizeDestinationConfig(destination.kind, destination.configJson),
      })),
    };
  });

  app.delete('/api/v1/owner/destinations/:id', async (req, reply) => {
    const auth = await requireOwnerSession(req.headers as Record<string, unknown>);
    const id = (req.params as { id: string }).id;

    if (!auth.ok) {
      return reply.status(auth.statusCode).send(auth.body);
    }
    const ownerAddress = auth.session.ownerAddress;

    const destination = await prisma.notificationDestination.findFirst({
      where: {
        id,
        ownerAddress,
        disabledAt: null,
      },
    });
    if (!destination) {
      return reply.status(404).send({ error: 'Not found', message: 'Active destination not found.' });
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.notificationDestination.update({
        where: { id },
        data: { disabledAt: now },
      });
      await tx.notificationSubscription.updateMany({
        where: {
          destinationId: id,
          ownerAddress,
          disabledAt: null,
        },
        data: { disabledAt: now },
      });
    });

    return {
      id,
      disabled: true,
      disabledAt: now.toISOString(),
    };
  });

  app.post('/api/v1/owner/subscriptions', async (req, reply) => {
    const auth = await requireOwnerSession(req.headers as Record<string, unknown>);
    const body = req.body as {
      vaultAddress?: string;
      ownerAddress?: string;
      destinationId?: string;
      eventKinds?: unknown;
    };
    const vaultAddress = normalizeAddress(body.vaultAddress ?? '');
    const payloadOwnerAddress = body.ownerAddress ? normalizeAddress(body.ownerAddress) : null;
    const destinationId = body.destinationId?.trim();
    const eventKinds = parseEventKinds(body.eventKinds);

    if (!auth.ok) {
      return reply.status(auth.statusCode).send(auth.body);
    }
    const ownerAddress = auth.session.ownerAddress;
    if (!vaultAddress || (payloadOwnerAddress && payloadOwnerAddress !== ownerAddress) || !destinationId || !eventKinds) {
      return reply.status(400).send({
        error: 'Bad request',
        message: 'vaultAddress, destinationId, and valid eventKinds are required.',
      });
    }

    const claim = await getActiveClaim(vaultAddress, ownerAddress);
    if (!claim) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Active vault claim required.' });
    }

    const destination = await prisma.notificationDestination.findFirst({
      where: {
        id: destinationId,
        ownerAddress,
        disabledAt: null,
      },
    });
    if (!destination) {
      return reply.status(404).send({ error: 'Not found', message: 'Destination not found for owner.' });
    }

    const existing = await prisma.notificationSubscription.findFirst({
      where: {
        vaultAddress,
        destinationId,
        ownerAddress,
        disabledAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return reply.status(409).send({ error: 'Conflict', message: 'Active subscription already exists for vault/destination.' });
    }

    const subscription = await prisma.notificationSubscription.create({
      data: {
        vaultAddress,
        destinationId,
        ownerAddress,
        eventKindsJson: eventKinds,
      },
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
    const auth = await requireOwnerSession(req.headers as Record<string, unknown>);
    const vaultAddress = normalizeAddress(((req.query as { vaultAddress?: string }).vaultAddress ?? '').trim());

    if (!auth.ok) {
      return reply.status(auth.statusCode).send(auth.body);
    }
    const ownerAddress = auth.session.ownerAddress;

    const subscriptions = await prisma.notificationSubscription.findMany({
      where: {
        ownerAddress,
        disabledAt: null,
        ...(vaultAddress ? { vaultAddress } : {}),
      },
      include: {
        destination: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      ownerAddress,
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
          config: sanitizeDestinationConfig(subscription.destination.kind, subscription.destination.configJson),
        },
      })),
    };
  });

  app.delete('/api/v1/owner/subscriptions/:id', async (req, reply) => {
    const auth = await requireOwnerSession(req.headers as Record<string, unknown>);
    const id = (req.params as { id: string }).id;

    if (!auth.ok) {
      return reply.status(auth.statusCode).send(auth.body);
    }
    const ownerAddress = auth.session.ownerAddress;

    const subscription = await prisma.notificationSubscription.findFirst({
      where: {
        id,
        ownerAddress,
        disabledAt: null,
      },
    });
    if (!subscription) {
      return reply.status(404).send({ error: 'Not found', message: 'Active subscription not found.' });
    }

    const now = new Date();
    await prisma.notificationSubscription.update({
      where: { id },
      data: { disabledAt: now },
    });

    return {
      id,
      disabled: true,
      disabledAt: now.toISOString(),
    };
  });

  app.get('/api/v1/owner/deliveries', async (req, reply) => {
    const auth = await requireOwnerSession(req.headers as Record<string, unknown>);
    const vaultAddress = normalizeAddress(((req.query as { vaultAddress?: string }).vaultAddress ?? '').trim());

    if (!auth.ok) {
      return reply.status(auth.statusCode).send(auth.body);
    }
    const ownerAddress = auth.session.ownerAddress;

    const deliveries = await prisma.notificationDelivery.findMany({
      where: {
        subscription: {
          ownerAddress,
          ...(vaultAddress ? { vaultAddress } : {}),
        },
      },
      include: {
        subscription: true,
        destination: true,
        beaconEvent: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      ownerAddress,
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

  app.post('/api/v1/integrations/telegram/webhook', async (req, reply) => {
    const configuredSecret = getTelegramWebhookSecret();
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

    if (!chatId || !chat || chat.type !== 'private') {
      return { ok: true };
    }

    if (!startMatch) {
      await sendManagedTelegramMessage(
        chatId,
        'Open Beacon and tap "Connect Telegram" to finish linking alerts to this chat.',
      ).catch(() => {});
      return { ok: true };
    }

    const providedToken = startMatch[1]?.trim();
    if (!providedToken) {
      await sendManagedTelegramMessage(
        chatId,
        'Open Beacon and tap "Connect Telegram" so I can link this chat to your alert settings.',
      ).catch(() => {});
      return { ok: true };
    }

    const payload = decodeTelegramLinkToken(providedToken);
    if (!payload) {
      await sendManagedTelegramMessage(chatId, 'That Beacon link has expired. Open Beacon and request a fresh Telegram connection link.').catch(() => {});
      return { ok: true };
    }

    const session = await prisma.ownerSession.findFirst({
      where: {
        ownerAddress: payload.ownerAddress,
        tokenHash: payload.sessionTokenHash,
        revokedAt: null,
      },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      await sendManagedTelegramMessage(chatId, 'Your Beacon session expired before this chat was linked. Go back to Beacon and try Connect Telegram again.').catch(() => {});
      return { ok: true };
    }

    const activeTelegramDestinations = await prisma.notificationDestination.findMany({
      where: {
        ownerAddress: payload.ownerAddress,
        kind: 'telegram',
        disabledAt: null,
      },
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

    if (existingDestination) {
      await prisma.notificationDestination.update({
        where: { id: existingDestination.id },
        data: {
          label: payload.label,
          configJson,
        },
      });
    } else {
      await prisma.notificationDestination.create({
        data: {
          ownerAddress: payload.ownerAddress,
          kind: 'telegram',
          label: payload.label,
          configJson,
        },
      });
    }

    await sendManagedTelegramMessage(
      chatId,
      `Beacon alerts are now connected to this chat as "${payload.label}". Return to Beacon to choose which events you want.`,
    ).catch(() => {});

    return { ok: true };
  });

  app.get('/api/v1/vaults/:address', async (req, reply) => {
    const rawAddress = (req.params as { address: string }).address;
    const address = normalizeAddress(rawAddress);
    if (!address) {
      return reply.status(404).send({ error: 'Not found', message: 'Invalid vault address.' });
    }

    const vault = await getVaultByAddress(address);
    if (!vault) {
      return reply.status(404).send({ error: 'Not found', message: `Vault ${address} is not indexed.` });
    }

    return toVaultMetadata(vault);
  });

  app.get('/api/v1/vaults/:address/status', async (req, reply) => {
    const rawAddress = (req.params as { address: string }).address;
    const address = normalizeAddress(rawAddress);
    if (!address) {
      return reply.status(404).send({ error: 'Not found', message: 'Invalid vault address.' });
    }

    const vault = await getVaultByAddress(address);
    if (!vault) {
      return reply.status(404).send({ error: 'Not found', message: `Vault ${address} is not indexed.` });
    }

    return buildVaultStatusBundle(prisma, vault);
  });

  app.get('/api/v1/vaults/:address/events', async (req, reply) => {
    const rawAddress = (req.params as { address: string }).address;
    const address = normalizeAddress(rawAddress);
    if (!address) {
      return reply.status(404).send({ error: 'Not found', message: 'Invalid vault address.' });
    }

    const vault = await getVaultByAddress(address);
    if (!vault) {
      return reply.status(404).send({ error: 'Not found', message: `Vault ${address} is not indexed.` });
    }

    const query = req.query as { limit?: string; before?: string };
    const limit = Math.min(Math.max(Number.parseInt(query.limit ?? '50', 10) || 50, 1), 100);
    let where: {
      vaultAddress: string;
      OR?: Array<{ blockNumber: { lt: number } } | { blockNumber: number; logIndex: { lt: number } }>;
    } = { vaultAddress: address };

    if (query.before) {
      const cursor = await prisma.beaconEvent.findFirst({
        where: { id: query.before, vaultAddress: address },
        select: { blockNumber: true, logIndex: true },
      });
      if (cursor) {
        where = {
          vaultAddress: address,
          OR: [
            { blockNumber: { lt: cursor.blockNumber } },
            { blockNumber: cursor.blockNumber, logIndex: { lt: cursor.logIndex } },
          ],
        };
      }
    }

    const rows = await prisma.beaconEvent.findMany({
      where,
      orderBy: [{ blockNumber: 'desc' }, { logIndex: 'desc' }],
      take: limit,
    });

    const response: VaultEventsResponse = {
      events: rows.reverse().map(toNormalizedEvent),
    };

    return response;
  });

  app.get('/api/v1/vaults/:address/proof', async (req, reply) => {
    const rawAddress = (req.params as { address: string }).address;
    const address = normalizeAddress(rawAddress);
    if (!address) {
      return reply.status(404).send({ error: 'Not found', message: 'Invalid vault address.' });
    }

    const vault = await getVaultByAddress(address);
    if (!vault) {
      return reply.status(404).send({ error: 'Not found', message: `Vault ${address} is not indexed.` });
    }

    const proof: DeploymentProof = {
      vault: vault.id,
      chainId: vault.chainId ?? config.chainId,
      factory: config.factoryAddress,
      deployer: vault.deployer,
      blockNumber: vault.deployedAtBlock,
      transactionHash: vault.deployedAtTx,
      config: {
        token: vault.token,
        owner: vault.owner,
        totalAllocation: vault.totalAllocation,
        startTime: vault.startTime,
        cliffDuration: vault.cliffDuration,
        intervalDuration: vault.intervalDuration,
        intervalCount: vault.intervalCount,
        cancelWindow: vault.cancelWindow,
        withdrawalDelay: vault.withdrawalDelay,
        executionWindow: vault.executionWindow,
      },
    };

    return proof;
  });

  return app;
}
