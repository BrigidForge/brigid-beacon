/**
 * Message formatting for notifications.
 * Includes vault address, event type, amount, block, tx link, countdown when applicable.
 */

import type { DispatcheableEvent } from './types.js';
import type { FormattedNotification, NotificationEventKind } from './types.js';
import { formatUnits } from 'ethers';

function kindToLabel(kind: string): string {
  const labels: Record<string, string> = {
    vault_created: 'Vault created',
    vault_funded: 'Vault funded',
    excess_deposited: 'Excess deposited',
    protected_withdrawal_requested: 'Protected withdrawal requested',
    excess_withdrawal_requested: 'Excess withdrawal requested',
    withdrawal_canceled: 'Withdrawal canceled',
    withdrawal_executed: 'Withdrawal executed',
    request_expired: 'Request expired',
  };
  return labels[kind] ?? kind;
}

function formatAmount(amount: string | undefined): string {
  if (amount == null) return '—';
  try {
    const normalized = trimTrailingZeroes(formatUnits(amount, 18));
    const [whole, fractional] = normalized.split('.');
    const wholeLabel = Number(whole || '0').toLocaleString();
    return fractional ? `${wholeLabel}.${fractional}` : wholeLabel;
  } catch {
    try {
      return BigInt(amount).toLocaleString();
    } catch {
      return amount;
    }
  }
}

function trimTrailingZeroes(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/\.?0+$/, '');
}

function formatUnixTimestampLabel(value: string | undefined): string | null {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function countdownFromTimestamps(executableAt?: string, expiresAt?: string): string | null {
  const now = Math.floor(Date.now() / 1000);
  const exec = executableAt != null ? Number(executableAt) : 0;
  const exp = expiresAt != null ? Number(expiresAt) : 0;
  if (exec > 0 && now < exec) {
    const s = exec - now;
    return formatDuration(s) ? `Executable in ${formatDuration(s)}` : null;
  }
  if (exp > 0 && now < exp) {
    const s = exp - now;
    return formatDuration(s) ? `Expires in ${formatDuration(s)}` : null;
  }
  return null;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

function formatDelayLabel(requestedAt?: string, executableAt?: string): string | null {
  const requested = Number(requestedAt);
  const executable = Number(executableAt);
  if (!Number.isFinite(requested) || !Number.isFinite(executable) || executable <= requested) return null;
  const label = formatDuration(executable - requested);
  return label || null;
}

function requestTypeLabelForEvent(event: DispatcheableEvent): string | null {
  if (event.kind === 'protected_withdrawal_requested') return 'Protected allocation';
  if (event.kind === 'excess_withdrawal_requested') return 'Surplus allocation';

  const requestType = (event.payload as Record<string, unknown>).requestType;
  if (requestType === 1 || requestType === 'protected') return 'Protected allocation';
  if (requestType === 2 || requestType === 'excess') return 'Surplus allocation';
  return null;
}

function formatPurposeReference(payload: Record<string, unknown>): string | null {
  const purposeHash = typeof payload.purposeHash === 'string' ? payload.purposeHash : null;
  if (!purposeHash) return null;
  return `${purposeHash.slice(0, 10)}...${purposeHash.slice(-6)}`;
}

function formatPurposeText(payload: Record<string, unknown>): string | null {
  const purposeText = typeof payload.purposeText === 'string' ? payload.purposeText.trim() : '';
  return purposeText || null;
}

function buildPublicViewerLink(publicAppBaseUrl: string, vaultAddress: string): string | null {
  const base = publicAppBaseUrl.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/view/${vaultAddress}`;
}

function getAmountFromPayload(kind: string, payload: Record<string, unknown>): string | null {
  if ('amount' in payload && typeof payload.amount === 'string') return payload.amount;
  if (kind === 'vault_created' && 'totalAllocation' in payload) return String(payload.totalAllocation);
  return null;
}

export function formatNotification(
  event: DispatcheableEvent,
  explorerBaseUrl: string,
  publicAppBaseUrl: string
): FormattedNotification {
  const kind = event.kind as NotificationEventKind;
  const amount = getAmountFromPayload(event.kind, event.payload);
  const txLink = `${explorerBaseUrl}/tx/${event.transactionHash}`;
  const publicViewerLink = buildPublicViewerLink(publicAppBaseUrl, event.vaultAddress);

  let countdown: string | null = null;
  const p = event.payload as {
    executableAt?: string;
    expiresAt?: string;
    requestedAt?: string;
  };
  countdown = countdownFromTimestamps(p.executableAt, p.expiresAt);

  const title = kindToLabel(event.kind);
  const vaultShort = `${event.vaultAddress.slice(0, 6)}…${event.vaultAddress.slice(-4)}`;
  const amountStr = amount != null ? formatAmount(amount) : '—';
  const requestTypeLabel = requestTypeLabelForEvent(event);
  const purposeText = formatPurposeText(event.payload);
  const purposeReference = formatPurposeReference(event.payload);
  const requestedAtLabel = formatUnixTimestampLabel(p.requestedAt);
  const executableAtLabel = formatUnixTimestampLabel(p.executableAt);
  const expiresAtLabel = formatUnixTimestampLabel(p.expiresAt);
  const delayLabel = formatDelayLabel(p.requestedAt, p.executableAt);

  const bodyLines: string[] = [
    `Vault: ${event.vaultAddress}`,
    `Event: ${title}`,
    requestTypeLabel ? `Allocation: ${requestTypeLabel}` : '',
    amount !== null ? `Amount: ${amountStr}` : '',
    purposeText ? `Reason: ${purposeText}` : '',
    !purposeText && purposeReference ? `Reason reference: ${purposeReference}` : '',
    requestedAtLabel ? `Requested at: ${requestedAtLabel}` : '',
    delayLabel ? `Delay: ${delayLabel}` : '',
    executableAtLabel ? `Executable at: ${executableAtLabel}` : '',
    expiresAtLabel ? `Expires at: ${expiresAtLabel}` : '',
    `Block: ${event.blockNumber}`,
    `Tx: ${txLink}`,
    publicViewerLink ? `Vault viewer: ${publicViewerLink}` : '',
    countdown ? `Countdown: ${countdown}` : '',
  ].filter(Boolean);

  const body = bodyLines.join('\n');
  const shortSummary = [
    `${title} • ${vaultShort}`,
    amount != null ? `Amount: ${amountStr}` : null,
    countdown ?? `Block ${event.blockNumber}`,
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    eventKind: kind,
    title,
    body,
    vaultAddress: event.vaultAddress,
    transactionHash: event.transactionHash,
    amount: amount != null ? amountStr : null,
    blockNumber: event.blockNumber,
    transactionLink: txLink,
    countdown,
    publicViewerLink,
    requestTypeLabel,
    purposeText,
    purposeReference,
    requestedAtLabel,
    executableAtLabel,
    expiresAtLabel,
    delayLabel,
    shortSummary,
  };
}
