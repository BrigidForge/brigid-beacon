/**
 * Vault status state machine for Beacon.
 * Used by status engine and API.
 */

export type VaultState =
  | 'idle'
  | 'active_no_request'
  | 'protected_request_pending_cancel'
  | 'excess_request_pending_cancel'
  | 'protected_request_pending_execution'
  | 'excess_request_pending_execution'
  | 'request_executable'
  | 'request_expired'
  | 'completed_recently'
  | 'canceled_recently';

export interface PendingRequestSummary {
  amount: string;
  purposeHash: string;
  requestType: 'protected' | 'excess';
  requestedAt: string;
  executableAt: string;
  expiresAt: string;
  isCancelable: boolean;
  isExecutable: boolean;
}

export interface VaultStatus {
  address: string;
  state: VaultState;
  funded: boolean;
  totalWithdrawn: string;
  totalExcessWithdrawn: string;
  vestedAmount: string;
  protectedOutstandingBalance: string;
  excessBalance: string;
  availableToWithdraw: string;
  excessAvailableToWithdraw: string;
  pendingRequest: PendingRequestSummary | null;
  updatedAtBlock: number;
  updatedAt: string;
}
