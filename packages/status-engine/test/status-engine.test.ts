import test from 'node:test';
import assert from 'node:assert/strict';
import type { NormalizedEvent, VaultMetadata } from '@brigid/beacon-shared-types';
import { computeVaultStatus } from '../src/index.js';

const vaultAddress = '0x0000000000000000000000000000000000000AaA';
const tokenAddress = '0x0000000000000000000000000000000000000BbB';
const ownerAddress = '0x0000000000000000000000000000000000000CcC';

function createMetadata(overrides: Partial<VaultMetadata> = {}): VaultMetadata {
  return {
    address: vaultAddress,
    chainId: 97,
    owner: ownerAddress,
    token: tokenAddress,
    totalAllocation: '1200',
    startTime: '1000',
    cliffDuration: '100',
    intervalDuration: '50',
    intervalCount: '4',
    cancelWindow: '20',
    withdrawalDelay: '40',
    executionWindow: '60',
    createdAt: new Date(1000 * 1000).toISOString(),
    deployedAtBlock: 10,
    deployedAtTx: '0xdeploy',
    ...overrides,
  };
}

function createEvent(event: Partial<NormalizedEvent> & Pick<NormalizedEvent, 'kind' | 'payload'>): NormalizedEvent {
  return {
    id: event.id ?? `${event.blockNumber ?? 1}:${event.logIndex ?? 0}`,
    vaultAddress,
    blockNumber: event.blockNumber ?? 1,
    transactionHash: event.transactionHash ?? '0xtx',
    logIndex: event.logIndex ?? 0,
    timestamp: event.timestamp ?? new Date((1000 + (event.blockNumber ?? 1)) * 1000).toISOString(),
    kind: event.kind,
    payload: event.payload,
  };
}

test('returns idle for an unfunded vault', () => {
  const status = computeVaultStatus({
    metadata: createMetadata(),
    events: [createEvent({ kind: 'vault_created', payload: {} })],
    now: 1020,
  });

  assert.equal(status.state, 'idle');
  assert.equal(status.funded, false);
  assert.equal(status.availableToWithdraw, '0');
});

test('unlocks the first vesting interval immediately at cliff end', () => {
  const status = computeVaultStatus({
    metadata: createMetadata(),
    events: [
      createEvent({ kind: 'vault_created', payload: {}, blockNumber: 10 }),
      createEvent({ kind: 'vault_funded', payload: { token: tokenAddress, amount: '1200' }, blockNumber: 11 }),
    ],
    now: 1100,
  });

  assert.equal(status.state, 'active_no_request');
  assert.equal(status.vestedAmount, '300');
  assert.equal(status.availableToWithdraw, '300');
  assert.equal(status.protectedOutstandingBalance, '1200');
});

test('tracks a protected request through the cancel window and execution delay', () => {
  const status = computeVaultStatus({
    metadata: createMetadata(),
    events: [
      createEvent({ kind: 'vault_created', payload: {}, blockNumber: 10 }),
      createEvent({ kind: 'vault_funded', payload: { token: tokenAddress, amount: '1200' }, blockNumber: 11 }),
      createEvent({
        kind: 'protected_withdrawal_requested',
        blockNumber: 12,
        timestamp: new Date(1120 * 1000).toISOString(),
        payload: {
          owner: ownerAddress,
          amount: '200',
          purposeHash: '0xabc',
          requestedAt: '1120',
          executableAt: '1160',
          expiresAt: '1220',
        },
      }),
    ],
    now: 1130,
  });

  assert.equal(status.state, 'protected_request_pending_cancel');
  assert.equal(status.pendingRequest?.isCancelable, true);
  assert.equal(status.pendingRequest?.isExecutable, false);
  assert.equal(status.availableToWithdraw, '100');
});

test('accounts for protected executions and recent terminal state', () => {
  const status = computeVaultStatus({
    metadata: createMetadata(),
    events: [
      createEvent({ kind: 'vault_created', payload: {}, blockNumber: 10 }),
      createEvent({ kind: 'vault_funded', payload: { token: tokenAddress, amount: '1200' }, blockNumber: 11 }),
      createEvent({
        kind: 'protected_withdrawal_requested',
        blockNumber: 12,
        timestamp: new Date(1120 * 1000).toISOString(),
        payload: {
          owner: ownerAddress,
          amount: '200',
          purposeHash: '0xabc',
          requestedAt: '1120',
          executableAt: '1160',
          expiresAt: '1220',
        },
      }),
      createEvent({
        kind: 'withdrawal_executed',
        blockNumber: 13,
        timestamp: new Date(1165 * 1000).toISOString(),
        payload: {
          executor: ownerAddress,
          owner: ownerAddress,
          amount: '200',
          purposeHash: '0xabc',
          executedAt: '1165',
        },
      }),
    ],
    now: 1165,
  });

  assert.equal(status.state, 'completed_recently');
  assert.equal(status.totalWithdrawn, '200');
  assert.equal(status.totalExcessWithdrawn, '0');
  assert.equal(status.pendingRequest, null);
  assert.equal(status.protectedOutstandingBalance, '1000');
});

test('tracks excess deposits and excess withdrawal execution separately from protected vesting', () => {
  const status = computeVaultStatus({
    metadata: createMetadata(),
    events: [
      createEvent({ kind: 'vault_created', payload: {}, blockNumber: 10 }),
      createEvent({ kind: 'vault_funded', payload: { token: tokenAddress, amount: '1200' }, blockNumber: 11 }),
      createEvent({
        kind: 'excess_deposited',
        blockNumber: 12,
        payload: { from: ownerAddress, token: tokenAddress, amount: '500' },
      }),
      createEvent({
        kind: 'excess_withdrawal_requested',
        blockNumber: 13,
        timestamp: new Date(1130 * 1000).toISOString(),
        payload: {
          owner: ownerAddress,
          amount: '150',
          purposeHash: '0xdef',
          requestedAt: '1130',
          executableAt: '1170',
          expiresAt: '1230',
        },
      }),
      createEvent({
        kind: 'withdrawal_executed',
        blockNumber: 14,
        timestamp: new Date(1175 * 1000).toISOString(),
        payload: {
          executor: ownerAddress,
          owner: ownerAddress,
          amount: '150',
          purposeHash: '0xdef',
          executedAt: '1175',
        },
      }),
    ],
    now: 1175,
  });

  assert.equal(status.totalWithdrawn, '0');
  assert.equal(status.totalExcessWithdrawn, '150');
  assert.equal(status.excessBalance, '350');
  assert.equal(status.availableToWithdraw, '600');
  assert.equal(status.excessAvailableToWithdraw, '350');
});

test('surfaces expired requests when no clearing event has been indexed yet', () => {
  const status = computeVaultStatus({
    metadata: createMetadata(),
    events: [
      createEvent({ kind: 'vault_created', payload: {}, blockNumber: 10 }),
      createEvent({ kind: 'vault_funded', payload: { token: tokenAddress, amount: '1200' }, blockNumber: 11 }),
      createEvent({
        kind: 'protected_withdrawal_requested',
        blockNumber: 12,
        timestamp: new Date(1120 * 1000).toISOString(),
        payload: {
          owner: ownerAddress,
          amount: '100',
          purposeHash: '0xexpired',
          requestedAt: '1120',
          executableAt: '1160',
          expiresAt: '1220',
        },
      }),
    ],
    now: 1225,
  });

  assert.equal(status.state, 'request_expired');
  assert.equal(status.pendingRequest?.isExecutable, false);
  assert.equal(status.pendingRequest?.isCancelable, false);
});
