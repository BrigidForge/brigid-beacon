import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { JsonRpcProvider, getAddress, verifyMessage } from 'ethers';
import type {
  DeploymentProof,
  NormalizedEvent,
  VaultEventsResponse,
  VaultMetadata,
} from '@brigid/beacon-shared-types';
import { decodePublicEmailActionToken } from '@brigid/beacon-shared-types';
import { computeVaultStatus } from '@brigid/beacon-status-engine';
import type { ApiConfig } from './config.js';

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
const PUBLIC_EVENT_KINDS = new Set([
  'vault_funded',
  'excess_deposited',
  'withdrawal_executed',
  'request_expired',
]);

export const CLAIM_NONCE_TTL_MS = 10 * 60 * 1000;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const TELEGRAM_LINK_TTL_MS = 15 * 60 * 1000;
export const PUBLIC_EMAIL_CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;
export const DESTINATION_KINDS = new Set(['telegram', 'discord_webhook', 'webhook']);

export type ChainProvider = Pick<JsonRpcProvider, 'getBlockNumber' | 'getBlock'>;

type TelegramLinkPayload = {
  destinationId: string;
  expiresAt: string;
};

const TELEGRAM_LINK_TOKEN_VERSION = 1;
const TELEGRAM_LINK_SIGNATURE_BYTES = 8;

export function normalizeAddress(input: string): string | null {
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

export function normalizeEmail(input: string | undefined): string | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function buildClaimMessage(params: {
  vaultAddress: string;
  ownerAddress: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  chainId: number;
}): string {
  return [
    'BrigidVault Beacon Claim',
    `Vault: ${params.vaultAddress}`,
    `Owner: ${params.ownerAddress}`,
    `Chain ID: ${params.chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt}`,
    `Expires At: ${params.expiresAt}`,
  ].join('\n');
}

export function signatureDigest(signature: string): string {
  return createHash('sha256').update(signature).digest('hex');
}

export function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionTokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getBearerToken(headers: Record<string, unknown>): string | null {
  const authorization = headers.authorization ?? headers.Authorization;
  if (typeof authorization !== 'string') return null;
  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

export function sanitizeDestinationConfig(kind: string, configJson: unknown, config: ApiConfig): Record<string, unknown> {
  if (!configJson || typeof configJson !== 'object') {
    return {};
  }

  const parsed = configJson as Record<string, unknown>;
  if (kind === 'webhook' || kind === 'discord_webhook') {
    const url = typeof parsed.url === 'string' ? parsed.url : '';
    return {
      hasUrl: Boolean(url),
      urlPreview: url ? `${url.slice(0, 24)}...` : null,
    };
  }

  if (kind === 'telegram') {
    const chatTitle =
      typeof parsed.chatTitle === 'string'
        ? parsed.chatTitle
        : typeof parsed.chatUsername === 'string'
          ? `@${parsed.chatUsername}`
          : null;

    return {
      chatId: typeof parsed.chatId === 'string' ? parsed.chatId : null,
      hasBotToken: typeof parsed.botToken === 'string' && parsed.botToken.length > 0,
      hasManagedBot: typeof parsed.botToken !== 'string' && Boolean(config.managedTelegramBotToken),
      chatTitle,
    };
  }

  return {};
}

export function parseDestinationConfig(kind: string, input: unknown, config: ApiConfig): Prisma.InputJsonValue | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const parsed = input as Record<string, unknown>;
  if (kind === 'webhook' || kind === 'discord_webhook') {
    if (typeof parsed.url !== 'string' || parsed.url.length === 0) return null;
    return { url: parsed.url } satisfies Prisma.InputJsonObject;
  }

  if (kind === 'telegram') {
    if (typeof parsed.chatId !== 'string' || parsed.chatId.length === 0) return null;
    if (typeof parsed.botToken !== 'string' && config.managedTelegramBotToken == null) return null;
    if (typeof parsed.botToken === 'string' && parsed.botToken.length === 0) return null;
    return {
      chatId: parsed.chatId,
      ...(typeof parsed.botToken === 'string' ? { botToken: parsed.botToken } : {}),
      ...(typeof parsed.chatTitle === 'string' ? { chatTitle: parsed.chatTitle } : {}),
      ...(typeof parsed.chatUsername === 'string' ? { chatUsername: parsed.chatUsername } : {}),
    } satisfies Prisma.InputJsonObject;
  }

  return null;
}

export function parseEventKinds(input: unknown): Prisma.InputJsonValue | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const normalized = Array.from(new Set(input.filter((value): value is string => typeof value === 'string' && EVENT_KINDS.has(value))));
  return normalized.length === input.length ? normalized : null;
}

export function parsePublicEventKinds(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const normalized = Array.from(new Set(input.filter((value): value is string => typeof value === 'string' && PUBLIC_EVENT_KINDS.has(value))));
  return normalized.length === input.length ? normalized : null;
}

export function buildPublicConfirmationUrls(config: ApiConfig, vaultAddress: string, params: { confirmToken: string; unsubscribeToken: string }) {
  if (!config.publicAppBaseUrl) {
    return { confirmUrl: null, unsubscribeUrl: null };
  }

  const baseUrl = config.publicAppBaseUrl.replace(/\/$/, '');
  return {
    confirmUrl: `${baseUrl}/view/${vaultAddress}?confirmEmailToken=${encodeURIComponent(params.confirmToken)}`,
    unsubscribeUrl: `${baseUrl}/view/${vaultAddress}?unsubscribeEmailToken=${encodeURIComponent(params.unsubscribeToken)}`,
  };
}

function encodeTelegramLinkToken(config: ApiConfig, payload: TelegramLinkPayload): string | null {
  const secret = config.telegramLinkSecret ?? config.managedTelegramBotToken;
  if (!secret) return null;

  const expiresAtSeconds = Math.floor(Date.parse(payload.expiresAt) / 1000);
  const destinationIdBytes = Buffer.from(payload.destinationId, 'utf8');
  if (!Number.isFinite(expiresAtSeconds) || destinationIdBytes.length === 0 || destinationIdBytes.length > 255) {
    return null;
  }

  const body = Buffer.alloc(6 + destinationIdBytes.length);
  body.writeUInt8(TELEGRAM_LINK_TOKEN_VERSION, 0);
  body.writeUInt32BE(expiresAtSeconds, 1);
  body.writeUInt8(destinationIdBytes.length, 5);
  destinationIdBytes.copy(body, 6);

  const signature = createHmac('sha256', secret).update(body).digest().subarray(0, TELEGRAM_LINK_SIGNATURE_BYTES);
  return Buffer.concat([body, signature]).toString('base64url');
}

export function decodeTelegramLinkToken(config: ApiConfig, token: string): TelegramLinkPayload | null {
  const secret = config.telegramLinkSecret ?? config.managedTelegramBotToken;
  if (!secret) return null;

  try {
    const decoded = Buffer.from(token, 'base64url');
    if (decoded.length < 7 + TELEGRAM_LINK_SIGNATURE_BYTES) return null;

    const body = decoded.subarray(0, decoded.length - TELEGRAM_LINK_SIGNATURE_BYTES);
    const signature = decoded.subarray(decoded.length - TELEGRAM_LINK_SIGNATURE_BYTES);
    const expectedSignature = createHmac('sha256', secret).update(body).digest().subarray(0, TELEGRAM_LINK_SIGNATURE_BYTES);
    if (!timingSafeEqual(signature, expectedSignature)) return null;

    const version = body.readUInt8(0);
    if (version !== TELEGRAM_LINK_TOKEN_VERSION) return null;

    const expiresAtSeconds = body.readUInt32BE(1);
    const destinationIdLength = body.readUInt8(5);
    if (body.length !== 6 + destinationIdLength || destinationIdLength === 0) return null;

    const destinationId = body.subarray(6).toString('utf8');
    const expiresAt = new Date(expiresAtSeconds * 1000).toISOString();
    if (Date.parse(expiresAt) <= Date.now()) return null;

    return { destinationId, expiresAt };
  } catch {
    return null;
  }
}

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_SENDER_NAME = 'BRIGID BEACON NOTIFICATIONS';

type VaultRow = {
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
  deployer?: string;
};

export function toVaultMetadata(vault: VaultRow): VaultMetadata {
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

export function toNormalizedEvent(row: {
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

export function createApiContext(prisma: PrismaClient, config: ApiConfig, options: { chainProvider?: ChainProvider | null } = {}) {
  const chainProvider = options.chainProvider ?? (config.rpcUrl ? new JsonRpcProvider(config.rpcUrl) : null);

  async function getVaultByAddress(address: string) {
    return prisma.vault.findUnique({ where: { id: address } });
  }

  async function getActiveClaim(vaultAddress: string, ownerAddress: string) {
    return prisma.vaultClaim.findFirst({
      where: { vaultAddress, ownerAddress, revokedAt: null },
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

  async function buildVaultStatusBundle(vault: VaultRow) {
    const events = await prisma.beaconEvent.findMany({
      where: { vaultAddress: vault.id },
      orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
    });

    return computeVaultStatus({
      metadata: toVaultMetadata(vault),
      events: events.map(toNormalizedEvent),
    });
  }

  async function buildTokenAnalytics(tokenAddress: string) {
    const vaults = await prisma.vault.findMany({
      where: { token: tokenAddress },
      orderBy: [{ createdAt: 'desc' }, { deployedAtBlock: 'desc' }],
    });

    const statuses = await Promise.all(vaults.map(async (vault) => ({
      metadata: toVaultMetadata(vault),
      status: await buildVaultStatusBundle(vault),
      deployer: vault.deployer,
    })));

    return {
      tokenAddress,
      vaultCount: statuses.length,
      ownerCount: new Set(statuses.map((entry) => entry.metadata.owner)).size,
      deployerCount: new Set(statuses.map((entry) => entry.deployer)).size,
      totalAllocation: statuses.reduce((total, entry) => total + BigInt(entry.metadata.totalAllocation), 0n).toString(),
      protectedOutstandingBalance: statuses.reduce((total, entry) => total + BigInt(entry.status.protectedOutstandingBalance), 0n).toString(),
      excessBalance: statuses.reduce((total, entry) => total + BigInt(entry.status.excessBalance), 0n).toString(),
      vaults: statuses,
    };
  }

  async function sendManagedTelegramMessage(chatId: string, text: string) {
    if (!config.managedTelegramBotToken) return;
    const response = await fetch(`https://api.telegram.org/bot${config.managedTelegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!response.ok) {
      throw new Error(`Telegram API ${response.status}: ${await response.text()}`);
    }
  }

  async function sendPublicConfirmationEmail(params: {
    to: string;
    vaultAddress: string;
    eventKinds: string[];
    confirmUrl: string | null;
    confirmToken: string;
    unsubscribeUrl: string | null;
    unsubscribeToken: string;
    expiresAt: string;
  }) {
    if (!config.brevoApiKey || !config.publicEmailFromAddress) {
      return { deliveryMode: 'preview' as const };
    }

    const confirmLine = params.confirmUrl
      ? `Confirm your subscription: ${params.confirmUrl}`
      : `Confirm using this token in Beacon: ${params.confirmToken}`;
    const unsubscribeLine = params.unsubscribeUrl
      ? `Unsubscribe link: ${params.unsubscribeUrl}`
      : `Unsubscribe token: ${params.unsubscribeToken}`;

    const textContent = [
      'You requested public Brigid Beacon email alerts.',
      '',
      `Vault: ${params.vaultAddress}`,
      'Events:',
      ...params.eventKinds.map((kind) => `- ${kind}`),
      '',
      confirmLine,
      '',
      `Confirmation expires at: ${params.expiresAt}`,
      '',
      unsubscribeLine,
    ].join('\n');

    const htmlContent = [
      '<p>You requested public Brigid Beacon email alerts.</p>',
      `<p><strong>Vault:</strong> ${params.vaultAddress}</p>`,
      `<p><strong>Events:</strong><br/>${params.eventKinds.join('<br/>')}</p>`,
      params.confirmUrl ? `<p><a href="${params.confirmUrl}">Confirm your subscription</a></p>` : '',
      `<p><strong>Confirmation expires at:</strong> ${params.expiresAt}</p>`,
      params.unsubscribeUrl ? `<p><a href="${params.unsubscribeUrl}">Unsubscribe</a></p>` : '',
    ].join('');

    const response = await fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': config.brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: BREVO_SENDER_NAME, email: config.publicEmailFromAddress },
        to: [{ email: params.to }],
        subject: 'Confirm your Brigid Beacon vault alerts',
        textContent,
        htmlContent,
      }),
    });

    if (!response.ok) {
      throw new Error(`Brevo API ${response.status}: ${await response.text()}`);
    }

    return { deliveryMode: 'brevo' as const };
  }

  return {
    prisma,
    config,
    chainProvider,
    getVaultByAddress,
    getActiveClaim,
    requireOwnerSession,
    buildVaultStatusBundle,
    buildTokenAnalytics,
    sendManagedTelegramMessage,
    sendPublicConfirmationEmail,
    buildTelegramConnectLink(params: { destinationId: string; expiresAt?: Date; sessionExpiresAt?: Date }) {
      const expiryDate = params.expiresAt ?? params.sessionExpiresAt;
      if (!expiryDate) {
        return {
          expiresAt: null,
          startToken: null,
          botUsername: config.managedTelegramBotUsername,
        };
      }

      const expiresAt = expiryDate.toISOString();
      const startToken = encodeTelegramLinkToken(config, {
        destinationId: params.destinationId,
        expiresAt,
      });
      return {
        expiresAt,
        startToken,
        botUsername: config.managedTelegramBotUsername,
      };
    },
    decodeTelegramLinkToken(token: string) {
      return decodeTelegramLinkToken(config, token);
    },
    decodePublicEmailActionToken(token: string) {
      return config.publicEmailLinkSecret ? decodePublicEmailActionToken(token, config.publicEmailLinkSecret) : null;
    },
    buildClaimMessage(params: { vaultAddress: string; ownerAddress: string; nonce: string; issuedAt: string; expiresAt: string }) {
      return buildClaimMessage({ ...params, chainId: config.chainId });
    },
    verifyClaimSignature(message: string, signature: string) {
      return normalizeAddress(verifyMessage(message, signature));
    },
    issueSessionToken() {
      return randomBytes(32).toString('hex');
    },
    issueNonce() {
      return randomBytes(16).toString('hex');
    },
  };
}
