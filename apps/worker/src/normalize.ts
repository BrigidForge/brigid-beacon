/**
 * Map raw contract log to normalized Beacon event.
 */

import { getAddress } from 'ethers';
import type { NormalizedEvent, NormalizedEventKind } from '@brigid/beacon-shared-types';
import { eventId } from '@brigid/beacon-shared-types';
import type { ContractLog } from './types.js';

const bigIntToString = (v: bigint | number) => String(v);

export function normalizeVaultCreated(
  chainId: number,
  log: ContractLog,
  deployer: string,
  vault: string,
  token: string,
  owner: string,
  totalAllocation: bigint,
  startTime: bigint,
  cliff: bigint,
  interval: bigint,
  intervals: bigint,
  cancelWindow: bigint,
  withdrawalDelay: bigint,
  executionWindow: bigint,
  timestamp: string
): NormalizedEvent {
  return {
    id: eventId(chainId, log.transactionHash, log.index),
    vaultAddress: getAddress(vault),
    kind: 'vault_created',
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.index,
    timestamp,
    payload: {
      deployer: getAddress(deployer),
      token: getAddress(token),
      owner: getAddress(owner),
      totalAllocation: bigIntToString(totalAllocation),
      startTime: bigIntToString(startTime),
      cliffDuration: bigIntToString(cliff),
      intervalDuration: bigIntToString(interval),
      intervalCount: bigIntToString(intervals),
      cancelWindow: bigIntToString(cancelWindow),
      withdrawalDelay: bigIntToString(withdrawalDelay),
      executionWindow: bigIntToString(executionWindow),
    },
  };
}

export function normalizeFunded(
  chainId: number,
  log: ContractLog,
  vaultAddress: string,
  token: string,
  amount: bigint,
  timestamp: string
): NormalizedEvent {
  return {
    id: eventId(chainId, log.transactionHash, log.index),
    vaultAddress: getAddress(vaultAddress),
    kind: 'vault_funded',
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.index,
    timestamp,
    payload: { token: getAddress(token), amount: bigIntToString(amount) },
  };
}

export function normalizeExcessDeposited(
  chainId: number,
  log: ContractLog,
  vaultAddress: string,
  from: string,
  token: string,
  amount: bigint,
  timestamp: string
): NormalizedEvent {
  return {
    id: eventId(chainId, log.transactionHash, log.index),
    vaultAddress: getAddress(vaultAddress),
    kind: 'excess_deposited',
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.index,
    timestamp,
    payload: {
      from: getAddress(from),
      token: getAddress(token),
      amount: bigIntToString(amount),
    },
  };
}

export function normalizeWithdrawalRequested(
  chainId: number,
  log: ContractLog,
  vaultAddress: string,
  owner: string,
  amount: bigint,
  purposeHash: string,
  requestedAt: bigint,
  executableAt: bigint,
  expiresAt: bigint,
  requestType: 1 | 2,
  timestamp: string
): NormalizedEvent {
  const kind: NormalizedEventKind =
    requestType === 1 ? 'protected_withdrawal_requested' : 'excess_withdrawal_requested';
  return {
    id: eventId(chainId, log.transactionHash, log.index),
    vaultAddress: getAddress(vaultAddress),
    kind,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.index,
    timestamp,
    payload: {
      owner: getAddress(owner),
      amount: bigIntToString(amount),
      purposeHash,
      requestedAt: bigIntToString(requestedAt),
      executableAt: bigIntToString(executableAt),
      expiresAt: bigIntToString(expiresAt),
    },
  };
}

export function normalizeWithdrawalCanceled(
  chainId: number,
  log: ContractLog,
  vaultAddress: string,
  owner: string,
  amount: bigint,
  purposeHash: string,
  canceledAt: bigint,
  timestamp: string
): NormalizedEvent {
  return {
    id: eventId(chainId, log.transactionHash, log.index),
    vaultAddress: getAddress(vaultAddress),
    kind: 'withdrawal_canceled',
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.index,
    timestamp,
    payload: {
      owner: getAddress(owner),
      amount: bigIntToString(amount),
      purposeHash,
      canceledAt: bigIntToString(canceledAt),
    },
  };
}

export function normalizeWithdrawalExecuted(
  chainId: number,
  log: ContractLog,
  vaultAddress: string,
  executor: string,
  owner: string,
  amount: bigint,
  purposeHash: string,
  executedAt: bigint,
  timestamp: string
): NormalizedEvent {
  return {
    id: eventId(chainId, log.transactionHash, log.index),
    vaultAddress: getAddress(vaultAddress),
    kind: 'withdrawal_executed',
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.index,
    timestamp,
    payload: {
      executor: getAddress(executor),
      owner: getAddress(owner),
      amount: bigIntToString(amount),
      purposeHash,
      executedAt: bigIntToString(executedAt),
    },
  };
}

export function normalizeRequestExpired(
  chainId: number,
  log: ContractLog,
  vaultAddress: string,
  owner: string,
  amount: bigint,
  purposeHash: string,
  expiredAt: bigint,
  requestType: number,
  timestamp: string
): NormalizedEvent {
  const rt = requestType === 2 ? 2 : 1; // 0 -> treat as 1 for type
  return {
    id: eventId(chainId, log.transactionHash, log.index),
    vaultAddress: getAddress(vaultAddress),
    kind: 'request_expired',
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.index,
    timestamp,
    payload: {
      owner: getAddress(owner),
      amount: bigIntToString(amount),
      purposeHash,
      expiredAt: bigIntToString(expiredAt),
      requestType: rt as 1 | 2,
    },
  };
}
