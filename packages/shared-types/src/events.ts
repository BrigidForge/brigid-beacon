/**
 * Beacon normalized event taxonomy.
 * Maps raw contract events to a single canonical set for API and viewer.
 */

export type NormalizedEventKind =
  | 'vault_created'
  | 'vault_funded'
  | 'excess_deposited'
  | 'protected_withdrawal_requested'
  | 'excess_withdrawal_requested'
  | 'withdrawal_canceled'
  | 'withdrawal_executed'
  | 'request_expired';

export interface NormalizedEventBase {
  id: string;
  vaultAddress: string;
  kind: NormalizedEventKind;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  timestamp: string;
}

export interface VaultCreatedPayload {
  deployer: string;
  token: string;
  owner: string;
  totalAllocation: string;
  startTime: string;
  cliffDuration: string;
  intervalDuration: string;
  intervalCount: string;
  cancelWindow: string;
  withdrawalDelay: string;
  executionWindow: string;
}

export interface VaultFundedPayload {
  token: string;
  amount: string;
}

export interface ExcessDepositedPayload {
  from: string;
  token: string;
  amount: string;
}

export interface WithdrawalRequestedPayload {
  owner: string;
  amount: string;
  purposeHash: string;
  requestedAt: string;
  executableAt: string;
  expiresAt: string;
}

export interface WithdrawalCanceledPayload {
  owner: string;
  amount: string;
  purposeHash: string;
  canceledAt: string;
}

export interface WithdrawalExecutedPayload {
  executor: string;
  owner: string;
  amount: string;
  purposeHash: string;
  executedAt: string;
}

export interface RequestExpiredPayload {
  owner: string;
  amount: string;
  purposeHash: string;
  expiredAt: string;
  requestType: 1 | 2; // protected | excess
}

export type NormalizedEventPayload =
  | VaultCreatedPayload
  | VaultFundedPayload
  | ExcessDepositedPayload
  | WithdrawalRequestedPayload
  | WithdrawalCanceledPayload
  | WithdrawalExecutedPayload
  | RequestExpiredPayload;

export interface NormalizedEvent extends NormalizedEventBase {
  payload: NormalizedEventPayload;
}

export function eventId(chainId: number, txHash: string, logIndex: number): string {
  return `${chainId}:${txHash}:${logIndex}`;
}
