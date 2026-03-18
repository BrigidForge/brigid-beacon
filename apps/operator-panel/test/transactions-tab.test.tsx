import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NormalizedEvent } from '@brigid/beacon-shared-types';
import { TransactionsTab } from '../src/components/TransactionsTab';
import { TimelineComponent } from '../src/components/TimelineComponent';
import { WalletConnector } from '../src/components/WalletConnector';

const baseProps = {
  vaultAddress: '0xeEBe00Ac0756308ac4AaBfD76c05c4F3088B8883',
  indexedOwnerAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  events: [] as NormalizedEvent[],
};

test('TransactionsTab renders loading state for operator controls', () => {
  const html = renderToStaticMarkup(
    React.createElement(TransactionsTab, {
      ...baseProps,
    }),
  );

  assert.match(html, /Loading transaction controls/);
});

test('WalletConnector renders WalletConnect path for iPhone users when enabled', () => {
  const html = renderToStaticMarkup(
    React.createElement(WalletConnector, {
      address: null,
      chainLabel: 'BNB Smart Chain (Testnet)',
      ownerAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      connectionKind: null,
      walletConnectEnabled: true,
      onInjectedConnect: () => undefined,
      onWalletConnect: () => undefined,
      onDisconnect: () => undefined,
    }),
  );

  assert.match(html, /Browser Wallet/);
  assert.match(html, /iPhone \/ WalletConnect/);
  assert.match(html, /pair from mobile Safari/);
});

test('TimelineComponent fills the active phase and completes prior milestones', () => {
  const html = renderToStaticMarkup(
    React.createElement(TimelineComponent, {
      requestedAt: 1_000,
      cancelWindow: 300,
      executableAt: 1_900,
      expiresAt: 2_500,
      nowSeconds: 1_450,
    }),
  );

  assert.match(html, /Delay active/);
  assert.match(html, /Cancel phase/);
  assert.match(html, /Delay phase/);
  assert.match(html, /25%/);
});

test('TransactionsTab keeps the most recent request visible after cancellation', () => {
  const events: NormalizedEvent[] = [
    {
      id: 'req',
      vaultAddress: baseProps.vaultAddress,
      kind: 'protected_withdrawal_requested',
      blockNumber: 10,
      transactionHash: '0xreq',
      logIndex: 0,
      timestamp: '2026-03-17T12:00:00.000Z',
      payload: {
        owner: baseProps.indexedOwnerAddress,
        amount: '1000000000000000000',
        purposeHash: '0xabc',
        requestedAt: '1000',
        executableAt: '1600',
        expiresAt: '2200',
      },
    },
    {
      id: 'cancel',
      vaultAddress: baseProps.vaultAddress,
      kind: 'withdrawal_canceled',
      blockNumber: 11,
      transactionHash: '0xcancel',
      logIndex: 0,
      timestamp: '2026-03-17T12:02:00.000Z',
      payload: {
        owner: baseProps.indexedOwnerAddress,
        amount: '1000000000000000000',
        purposeHash: '0xabc',
        canceledAt: '1100',
      },
    },
  ];

  const html = renderToStaticMarkup(
    React.createElement(TimelineComponent, {
      requestedAt: 1000,
      cancelWindow: 300,
      executableAt: 1600,
      expiresAt: 2200,
      nowSeconds: 1400,
      outcome: 'canceled',
      settledAt: 1100,
    }),
  );

  assert.match(html, /Canceled/);
  assert.match(html, /Settled/);
  assert.match(html, /This withdrawal request was canceled before execution/);
  assert.doesNotMatch(html, /33%/);
  assert.ok(events.length === 2);
});
