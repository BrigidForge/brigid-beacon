/**
 * Status engine – computes VaultState and VaultStatus from chain data / snapshot.
 * Used by indexer (to persist snapshots) and API (to serve current status).
 * Sprint 2–3.
 */

import type {
  VaultState,
  VaultStatus,
  PendingRequestSummary,
  NormalizedEvent,
  NormalizedEventKind,
  VaultMetadata,
  ExcessDepositedPayload,
  WithdrawalRequestedPayload,
  WithdrawalCanceledPayload,
  WithdrawalExecutedPayload,
  RequestExpiredPayload,
} from '@brigid/beacon-shared-types';

export type { VaultState, VaultStatus, PendingRequestSummary };

type RequestType = 0 | 1 | 2;
type TerminalEventKind = Extract<
  NormalizedEventKind,
  'withdrawal_canceled' | 'withdrawal_executed' | 'request_expired'
>;

interface ReplayState {
  funded: boolean;
  totalWithdrawn: bigint;
  totalExcessWithdrawn: bigint;
  totalExcessDeposited: bigint;
  pendingRequest: PendingRequestSummary | null;
  pendingRequestType: RequestType;
  lastTerminalKind: TerminalEventKind | null;
  updatedAtBlock: number;
  updatedAt: string;
}

interface RequestedEventSummary {
  requestType: Exclude<RequestType, 0>;
}

function toBigInt(value: string): bigint {
  return BigInt(value);
}

function clampBigInt(value: bigint): bigint {
  return value < 0n ? 0n : value;
}

function getUnixTimestampSeconds(isoDate: string): number {
  return Math.floor(new Date(isoDate).getTime() / 1000);
}

function computeVestedAmount(metadata: VaultMetadata, now: number): bigint {
  const totalAllocation = toBigInt(metadata.totalAllocation);
  const startTime = Number(metadata.startTime);
  const cliffDuration = Number(metadata.cliffDuration);
  const intervalDuration = Math.max(1, Number(metadata.intervalDuration));
  const intervalCount = Math.max(1, Number(metadata.intervalCount));
  const cliffEnd = startTime + cliffDuration;

  if (now < cliffEnd) {
    return 0n;
  }

  const elapsedSinceCliff = now - cliffEnd;
  let intervalsVested = Math.floor(elapsedSinceCliff / intervalDuration);
  if (intervalsVested > intervalCount) {
    intervalsVested = intervalCount;
  }

  return (totalAllocation * BigInt(intervalsVested)) / BigInt(intervalCount);
}

export function computeState(
  params: {
    funded: boolean;
    pendingExists: boolean;
    pendingRequestType: RequestType;
    requestedAt: number;
    executableAt: number;
    expiresAt: number;
    cancelWindow: number;
    now: number;
    lastTerminalKind?: TerminalEventKind | null;
  }
): VaultState {
  if (!params.funded) {
    return 'idle';
  }

  if (params.pendingExists) {
    if (params.now > params.expiresAt) {
      return 'request_expired';
    }

    const requestType = params.pendingRequestType === 2 ? 'excess' : 'protected';
    if (params.now <= params.requestedAt + params.cancelWindow) {
      return requestType === 'protected'
        ? 'protected_request_pending_cancel'
        : 'excess_request_pending_cancel';
    }

    if (params.now < params.executableAt) {
      return requestType === 'protected'
        ? 'protected_request_pending_execution'
        : 'excess_request_pending_execution';
    }

    return 'request_executable';
  }

  if (params.lastTerminalKind === 'withdrawal_executed') {
    return 'completed_recently';
  }
  if (params.lastTerminalKind === 'withdrawal_canceled') {
    return 'canceled_recently';
  }
  if (params.lastTerminalKind === 'request_expired') {
    return 'request_expired';
  }

  return 'active_no_request';
}

function sortEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  return [...events].sort((a, b) => {
    const blockDiff = a.blockNumber - b.blockNumber;
    if (blockDiff !== 0) return blockDiff;
    return a.logIndex - b.logIndex;
  });
}

function replayEvents(metadata: VaultMetadata, events: NormalizedEvent[], now: number): ReplayState {
  const requestTypeByPurposeHash = new Map<string, RequestedEventSummary>();
  let funded = false;
  let totalWithdrawn = 0n;
  let totalExcessWithdrawn = 0n;
  let totalExcessDeposited = 0n;
  let pendingRequest: PendingRequestSummary | null = null;
  let pendingRequestType: RequestType = 0;
  let lastTerminalKind: TerminalEventKind | null = null;
  let updatedAtBlock = metadata.deployedAtBlock;
  let updatedAt = metadata.createdAt;

  for (const event of sortEvents(events)) {
    updatedAtBlock = event.blockNumber;
    updatedAt = event.timestamp.includes('T')
      ? event.timestamp
      : new Date(Number(event.timestamp) * 1000).toISOString();

    switch (event.kind) {
      case 'vault_created':
        break;
      case 'vault_funded':
        funded = true;
        break;
      case 'excess_deposited':
        totalExcessDeposited += toBigInt((event.payload as ExcessDepositedPayload).amount);
        break;
      case 'protected_withdrawal_requested':
      case 'excess_withdrawal_requested': {
        const requestType = event.kind === 'protected_withdrawal_requested' ? 'protected' : 'excess';
        const payload = event.payload as WithdrawalRequestedPayload;
        pendingRequest = {
          amount: payload.amount,
          purposeHash: payload.purposeHash,
          requestType,
          requestedAt: payload.requestedAt,
          executableAt: payload.executableAt,
          expiresAt: payload.expiresAt,
          isCancelable: false,
          isExecutable: false,
        };
        pendingRequestType = requestType === 'protected' ? 1 : 2;
        requestTypeByPurposeHash.set(pendingRequest.purposeHash, { requestType: pendingRequestType });
        lastTerminalKind = null;
        break;
      }
      case 'withdrawal_canceled':
      case 'request_expired': {
        const purposeHash =
          event.kind === 'withdrawal_canceled'
            ? (event.payload as WithdrawalCanceledPayload).purposeHash
            : (event.payload as RequestExpiredPayload).purposeHash;
        if (pendingRequest?.purposeHash === purposeHash) {
          pendingRequest = null;
          pendingRequestType = 0;
        }
        lastTerminalKind = event.kind;
        break;
      }
      case 'withdrawal_executed': {
        const payload = event.payload as WithdrawalExecutedPayload;
        const purposeHash = payload.purposeHash;
        const requestType = requestTypeByPurposeHash.get(purposeHash)?.requestType ?? pendingRequestType;
        const amount = toBigInt(payload.amount);
        if (requestType === 2) {
          totalExcessWithdrawn += amount;
        } else {
          totalWithdrawn += amount;
        }
        if (pendingRequest?.purposeHash === purposeHash) {
          pendingRequest = null;
          pendingRequestType = 0;
        }
        lastTerminalKind = 'withdrawal_executed';
        break;
      }
    }
  }

  if (pendingRequest) {
    pendingRequest = {
      ...pendingRequest,
      isCancelable: now <= Number(pendingRequest.requestedAt) + Number(metadata.cancelWindow),
      isExecutable:
        now >= Number(pendingRequest.executableAt) && now <= Number(pendingRequest.expiresAt),
    };
  }

  return {
    funded,
    totalWithdrawn,
    totalExcessWithdrawn,
    totalExcessDeposited,
    pendingRequest,
    pendingRequestType,
    lastTerminalKind,
    updatedAtBlock,
    updatedAt,
  };
}

export function computeVaultStatus(params: {
  metadata: VaultMetadata;
  events: NormalizedEvent[];
  now?: number;
}): VaultStatus {
  const now = params.now ?? Math.floor(Date.now() / 1000);
  const replayed = replayEvents(params.metadata, params.events, now);
  const totalAllocation = toBigInt(params.metadata.totalAllocation);
  const vestedAmount = replayed.funded ? computeVestedAmount(params.metadata, now) : 0n;
  const protectedOutstandingBalance = replayed.funded
    ? clampBigInt(totalAllocation - replayed.totalWithdrawn)
    : 0n;
  const activeProtectedRequestedAmount =
    replayed.pendingRequest?.requestType === 'protected' && now <= Number(replayed.pendingRequest.expiresAt)
      ? toBigInt(replayed.pendingRequest.amount)
      : 0n;
  const activeExcessRequestedAmount =
    replayed.pendingRequest?.requestType === 'excess' && now <= Number(replayed.pendingRequest.expiresAt)
      ? toBigInt(replayed.pendingRequest.amount)
      : 0n;
  const rawAvailableToWithdraw = vestedAmount - replayed.totalWithdrawn - activeProtectedRequestedAmount;
  const availableToWithdraw = clampBigInt(
    rawAvailableToWithdraw > protectedOutstandingBalance ? protectedOutstandingBalance : rawAvailableToWithdraw
  );
  const excessBalance = clampBigInt(replayed.totalExcessDeposited - replayed.totalExcessWithdrawn);
  const excessAvailableToWithdraw = clampBigInt(excessBalance - activeExcessRequestedAmount);

  return {
    address: params.metadata.address,
    state: computeState({
      funded: replayed.funded,
      pendingExists: replayed.pendingRequest != null,
      pendingRequestType: replayed.pendingRequestType,
      requestedAt: replayed.pendingRequest ? Number(replayed.pendingRequest.requestedAt) : 0,
      executableAt: replayed.pendingRequest ? Number(replayed.pendingRequest.executableAt) : 0,
      expiresAt: replayed.pendingRequest ? Number(replayed.pendingRequest.expiresAt) : 0,
      cancelWindow: Number(params.metadata.cancelWindow),
      now,
      lastTerminalKind: replayed.lastTerminalKind,
    }),
    funded: replayed.funded,
    totalWithdrawn: replayed.totalWithdrawn.toString(),
    totalExcessWithdrawn: replayed.totalExcessWithdrawn.toString(),
    vestedAmount: vestedAmount.toString(),
    protectedOutstandingBalance: protectedOutstandingBalance.toString(),
    excessBalance: excessBalance.toString(),
    availableToWithdraw: availableToWithdraw.toString(),
    excessAvailableToWithdraw: excessAvailableToWithdraw.toString(),
    pendingRequest: replayed.pendingRequest,
    updatedAtBlock: replayed.updatedAtBlock,
    updatedAt: replayed.updatedAt,
  };
}

export function computeVaultSnapshot(params: {
  metadata: VaultMetadata;
  events: NormalizedEvent[];
  now: number;
}): Pick<
  VaultStatus,
  | 'funded'
  | 'state'
  | 'totalWithdrawn'
  | 'totalExcessWithdrawn'
  | 'vestedAmount'
  | 'protectedOutstandingBalance'
  | 'excessBalance'
  | 'availableToWithdraw'
  | 'excessAvailableToWithdraw'
  | 'pendingRequest'
  | 'updatedAtBlock'
  | 'updatedAt'
> {
  return computeVaultStatus(params);
}
