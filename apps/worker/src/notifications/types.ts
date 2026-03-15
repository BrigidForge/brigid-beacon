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
  shortSummary: string; // one-line for Telegram/Discord preview
}

export interface NotificationProvider {
  name: string;
  send(event: DispatcheableEvent, formatted: FormattedNotification): Promise<void>;
}
