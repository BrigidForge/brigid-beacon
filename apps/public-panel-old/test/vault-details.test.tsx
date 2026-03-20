import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DeploymentProof, NormalizedEvent, VaultMetadata, VaultStatus } from '@brigid/beacon-shared-types';
import { VaultDetails } from '../src/components/VaultDetails';

const metadata: VaultMetadata = {
  address: '0xeEBe00Ac0756308ac4AaBfD76c05c4F3088B8883',
  chainId: 31337,
  owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  token: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  totalAllocation: '1000000000000000000000',
  startTime: '1773521050',
  cliffDuration: '0',
  intervalDuration: '60',
  intervalCount: '4',
  cancelWindow: '20',
  withdrawalDelay: '40',
  executionWindow: '60',
  createdAt: '2026-03-14T20:43:40.000Z',
  deployedAtBlock: 8,
  deployedAtTx: '0xdeploy',
};

const status: VaultStatus = {
  address: metadata.address,
  state: 'completed_recently',
  funded: true,
  totalWithdrawn: '200000000000000000000',
  totalExcessWithdrawn: '0',
  vestedAmount: '1000000000000000000000',
  protectedOutstandingBalance: '800000000000000000000',
  excessBalance: '50000000000000000000',
  availableToWithdraw: '800000000000000000000',
  excessAvailableToWithdraw: '50000000000000000000',
  pendingRequest: null,
  updatedAtBlock: 14,
  updatedAt: '2026-03-14T21:01:59.000Z',
};

const events: NormalizedEvent[] = [
  {
    id: 'evt-created',
    vaultAddress: metadata.address,
    kind: 'vault_created',
    blockNumber: 8,
    transactionHash: '0xdeploy',
    logIndex: 0,
    timestamp: '2026-03-14T20:43:40.000Z',
    payload: {
      deployer: metadata.owner,
      token: metadata.token,
      owner: metadata.owner,
      totalAllocation: metadata.totalAllocation,
      startTime: metadata.startTime,
      cliffDuration: metadata.cliffDuration,
      intervalDuration: metadata.intervalDuration,
      intervalCount: metadata.intervalCount,
      cancelWindow: metadata.cancelWindow,
      withdrawalDelay: metadata.withdrawalDelay,
      executionWindow: metadata.executionWindow,
    },
  },
  {
    id: 'evt-excess',
    vaultAddress: metadata.address,
    kind: 'excess_deposited',
    blockNumber: 14,
    transactionHash: '0xexcess',
    logIndex: 0,
    timestamp: '2026-03-14T21:01:59.000Z',
    payload: {
      from: metadata.owner,
      token: metadata.token,
      amount: '50000000000000000000',
    },
  },
];

const proof: DeploymentProof = {
  vault: metadata.address,
  chainId: metadata.chainId,
  factory: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  deployer: metadata.owner,
  blockNumber: metadata.deployedAtBlock,
  transactionHash: metadata.deployedAtTx,
  config: {
    token: metadata.token,
    owner: metadata.owner,
    totalAllocation: metadata.totalAllocation,
    startTime: metadata.startTime,
    cliffDuration: metadata.cliffDuration,
    intervalDuration: metadata.intervalDuration,
    intervalCount: metadata.intervalCount,
    cancelWindow: metadata.cancelWindow,
    withdrawalDelay: metadata.withdrawalDelay,
    executionWindow: metadata.executionWindow,
  },
};

test('VaultDetails renders seeded vault summary, events, and proof', () => {
  const html = renderToStaticMarkup(
    React.createElement(VaultDetails, {
      metadata,
      status,
      events,
      proof,
    })
  );

  assert.match(html, /Completed Recently/);
  assert.match(html, /Schedule progress/);
  assert.match(html, /850 available now/);
  assert.match(html, /Extra tokens arrived/);
  assert.match(html, /Event Timeline/);
  assert.match(html, /Excess deposited/);
  assert.match(html, /Deployment Proof/);
  assert.match(html, /0x5FbDB2315678afecb367f032d93F642f64180aa3/);
});
