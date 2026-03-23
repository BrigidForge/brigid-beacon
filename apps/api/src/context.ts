import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { JsonRpcProvider, getAddress, verifyMessage } from 'ethers';
import type {
  DeploymentProof,
  NormalizedEvent,
  VaultEventsResponse,
  VaultMetadata,
} from '@brigid/beacon-shared-types';
import { decodePublicEmailActionToken, encodePublicEmailActionToken } from '@brigid/beacon-shared-types';
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
  'protected_withdrawal_requested',
  'excess_withdrawal_requested',
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

export function buildPublicActionUrl(
  config: ApiConfig,
  vaultAddress: string,
  params: { action: 'manage' | 'unsubscribe'; token: string },
) {
  if (!config.publicAppBaseUrl) {
    return null;
  }

  const baseUrl = config.publicAppBaseUrl.replace(/\/$/, '');
  const paramName = params.action === 'manage' ? 'manageEmailToken' : 'unsubscribeEmailToken';
  return `${baseUrl}/view/${vaultAddress}?${paramName}=${encodeURIComponent(params.token)}`;
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
const EMAIL_LOGO_VERSION = '20260322-crop';

function buildEmailLogoUrl(config: ApiConfig): string | null {
  if (!config.publicAppBaseUrl) return null;
  return `${config.publicAppBaseUrl.replace(/\/$/, '')}/media/logo-transparent.png?v=${EMAIL_LOGO_VERSION}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildBrandedEmailHtml(params: {
  config: ApiConfig;
  eyebrow: string;
  title: string;
  intro: string;
  rows?: Array<{ label: string; value: string }>;
  bodyHtml?: string;
  primaryAction?: { label: string; href: string | null };
  secondaryAction?: { label: string; href: string | null };
  footer?: string;
}) {
  const logoUrl = buildEmailLogoUrl(params.config);
  const rowMarkup = (params.rows ?? [])
    .map((row) => `
      <tr>
        <td style="padding: 0 0 10px; color: #94a3b8; font-size: 13px; width: 132px; vertical-align: top;">${escapeHtml(row.label)}</td>
        <td style="padding: 0 0 10px; color: #e2e8f0; font-size: 13px; vertical-align: top;">${escapeHtml(row.value)}</td>
      </tr>
    `)
    .join('');

  const button = (action: { label: string; href: string | null } | undefined, palette: 'gold' | 'slate') => {
    if (!action?.href) return '';
    const styles =
      palette === 'gold'
        ? 'background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: #111827;'
        : 'background: rgba(255,255,255,0.06); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.12);';
    return `<a href="${action.href}" style="display: inline-block; margin-right: 12px; margin-bottom: 12px; padding: 12px 18px; border-radius: 999px; text-decoration: none; font-size: 14px; font-weight: 700; ${styles}">${escapeHtml(action.label)}</a>`;
  };

  return `
    <div style="margin: 0; padding: 32px 18px; background: #ffffff; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <div style="max-width: 640px; margin: 0 auto;">
        <div style="margin-bottom: 20px; text-align: center;">
          ${logoUrl ? `<img src="${logoUrl}" alt="Brigid Beacon" style="max-width: 480px; width: 100%; height: auto; margin: 0 auto; display: block;" />` : ''}
        </div>
        <div style="border: 1px solid rgba(255,255,255,0.08); border-radius: 28px; overflow: hidden; background: linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(2,6,23,0.98) 100%); box-shadow: 0 24px 80px rgba(15,23,42,0.45);">
          <div style="padding: 28px 28px 22px; background: radial-gradient(circle at top left, rgba(251,191,36,0.18), transparent 28%), radial-gradient(circle at 80% 20%, rgba(56,189,248,0.14), transparent 22%);">
            <p style="margin: 0 0 12px; color: rgba(251,191,36,0.82); font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;">${escapeHtml(params.eyebrow)}</p>
            <h1 style="margin: 0; color: #ffffff; font-size: 28px; line-height: 1.2;">${escapeHtml(params.title)}</h1>
            <p style="margin: 14px 0 0; color: #cbd5e1; font-size: 15px; line-height: 1.7;">${escapeHtml(params.intro)}</p>
          </div>
          <div style="padding: 0 28px 28px;">
            ${rowMarkup ? `<table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin: 0 0 18px;">${rowMarkup}</table>` : ''}
            ${params.bodyHtml ? `<div style="margin: 0 0 22px; color: #cbd5e1; font-size: 14px; line-height: 1.75;">${params.bodyHtml}</div>` : ''}
            <div style="margin: 0 0 10px;">
              ${button(params.primaryAction, 'gold')}
              ${button(params.secondaryAction, 'slate')}
            </div>
            ${params.footer ? `<p style="margin: 18px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.7;">${escapeHtml(params.footer)}</p>` : ''}
            <p style="margin: 18px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.7;">Do not reply to this email. This mailbox is not monitored.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

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
      '',
      'Do not reply to this email. This mailbox is not monitored.',
    ].join('\n');

    const htmlContent = [
      buildBrandedEmailHtml({
        config,
        eyebrow: 'Public Alerts',
        title: 'Confirm Your Email Subscription',
        intro: 'You requested public Brigid Beacon email alerts for this vault. Confirm the subscription to start receiving notifications.',
        rows: [
          { label: 'Vault', value: params.vaultAddress },
          { label: 'Events', value: params.eventKinds.join(', ') },
          { label: 'Expires', value: params.expiresAt },
        ],
        primaryAction: params.confirmUrl ? { label: 'Confirm subscription', href: params.confirmUrl } : undefined,
        secondaryAction: params.unsubscribeUrl ? { label: 'Unsubscribe', href: params.unsubscribeUrl } : undefined,
        bodyHtml: params.confirmUrl == null
          ? `<p style="margin: 0;">Use this confirmation token in Beacon:</p><p style="margin: 10px 0 0; font-family: ui-monospace, SFMono-Regular, monospace; color: #f8fafc;">${escapeHtml(params.confirmToken)}</p>`
          : '',
        footer: 'If you did not request these alerts, you can ignore this message.',
      }),
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

  async function sendPublicManageLinkEmail(params: {
    to: string;
    vaultAddress: string;
    manageUrl: string | null;
    manageToken: string;
    expiresAt: string;
  }) {
    if (!config.brevoApiKey || !config.publicEmailFromAddress) {
      return { deliveryMode: 'preview' as const };
    }

    const manageLine = params.manageUrl
      ? `Manage your subscription: ${params.manageUrl}`
      : `Manage using this token in Beacon: ${params.manageToken}`;

    const textContent = [
      'You requested a secure Brigid Beacon email subscription management link.',
      '',
      `Vault: ${params.vaultAddress}`,
      manageLine,
      '',
      `This secure link expires at: ${params.expiresAt}`,
      '',
      'Do not reply to this email. This mailbox is not monitored.',
    ].join('\n');

    const htmlContent = [
      buildBrandedEmailHtml({
        config,
        eyebrow: 'Manage Alerts',
        title: 'Secure Email Management Link',
        intro: 'Use this secure link to update or unsubscribe from your public Brigid Beacon email alerts.',
        rows: [
          { label: 'Vault', value: params.vaultAddress },
          { label: 'Link expires', value: params.expiresAt },
        ],
        primaryAction: params.manageUrl ? { label: 'Manage email alerts', href: params.manageUrl } : undefined,
        bodyHtml: params.manageUrl == null
          ? `<p style="margin: 0;">Use this secure management token in Beacon:</p><p style="margin: 10px 0 0; font-family: ui-monospace, SFMono-Regular, monospace; color: #f8fafc;">${escapeHtml(params.manageToken)}</p>`
          : '',
        footer: 'If you did not request this link, no changes have been made to your alerts.',
      }),
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
        subject: 'Manage your Brigid Beacon vault alerts',
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
    sendPublicManageLinkEmail,
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
    encodePublicEmailActionToken(params: { action: 'manage' | 'unsubscribe'; subscriptionId: string; vaultAddress: string; email: string; expiresAt: string }) {
      return config.publicEmailLinkSecret
        ? encodePublicEmailActionToken(params, config.publicEmailLinkSecret)
        : null;
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
