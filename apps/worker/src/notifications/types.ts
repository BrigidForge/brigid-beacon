/**
 * Shared types for the notification layer.
 * Extensible for additional providers (Twitter/X, email, etc.).
 */

export type NotificationEventKind =
  | 'vault_created'
  | 'vault_funded'
  | 'excess_deposited'
  | 'protected_withdrawal_requested'
  | 'excess_withdrawal_requested'
  | 'withdrawal_canceled'
  | 'withdrawal_executed'
  | 'request_expired';

export interface DispatcheableEvent {
  id: string;
  vaultAddress: string;
  kind: string;
  blockNumber: number;
  transactionHash: string;
  timestamp: Date;
  payload: Record<string, unknown>;
  chainId: number;
}

export interface FormattedNotification {
  eventKind: NotificationEventKind;
  title: string;
  body: string;
  vaultAddress: string;
  transactionHash: string;
  amount: string | null;
  blockNumber: number;
  transactionLink: string;
  countdown: string | null; // e.g. "Executable in 2d 5h" or "Expires in 1d 12h"
  publicViewerLink: string | null;
  requestTypeLabel: string | null;
  purposeText: string | null;
  purposeReference: string | null;
  requestedAtLabel: string | null;
  executableAtLabel: string | null;
  expiresAtLabel: string | null;
  delayLabel: string | null;
  shortSummary: string; // one-line for Telegram/Discord preview
}

export interface NotificationProvider {
  name: string;
  send(event: DispatcheableEvent, formatted: FormattedNotification): Promise<void>;
}
