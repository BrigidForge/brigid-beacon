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

function getAmountFromPayload(kind: string, payload: Record<string, unknown>): string | null {
  if ('amount' in payload && typeof payload.amount === 'string') return payload.amount;
  if (kind === 'vault_created' && 'totalAllocation' in payload) return String(payload.totalAllocation);
  return null;
}

export function formatNotification(
  event: DispatcheableEvent,
  explorerBaseUrl: string
): FormattedNotification {
  const kind = event.kind as NotificationEventKind;
  const amount = getAmountFromPayload(event.kind, event.payload);
  const txLink = `${explorerBaseUrl}/tx/${event.transactionHash}`;
  const blockLink = `${explorerBaseUrl}/block/${event.blockNumber}`;

  let countdown: string | null = null;
  if (
    event.kind === 'protected_withdrawal_requested' ||
    event.kind === 'excess_withdrawal_requested'
  ) {
    const p = event.payload as { executableAt?: string; expiresAt?: string };
    countdown = countdownFromTimestamps(p.executableAt, p.expiresAt);
  }

  const title = kindToLabel(event.kind);
  const vaultShort = `${event.vaultAddress.slice(0, 6)}…${event.vaultAddress.slice(-4)}`;
  const amountStr = amount != null ? formatAmount(amount) : '—';

  const bodyLines: string[] = [
    `Vault: ${event.vaultAddress}`,
    `Event: ${title}`,
    amount !== null ? `Amount: ${amountStr}` : '',
    `Block: ${event.blockNumber}`,
    `Tx: ${txLink}`,
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
    shortSummary,
  };
}
