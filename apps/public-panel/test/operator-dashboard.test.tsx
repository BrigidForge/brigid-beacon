import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperatorDashboard } from '../src/components/OperatorDashboard';

test('OperatorDashboard renders health and workload metrics', () => {
  const html = renderToStaticMarkup(
    React.createElement(OperatorDashboard, {
      health: {
        chainId: 31337,
        factoryAddress: '0x0B306BF915C4d645ff596e518fAf3F9669b97016',
        chainHeadBlock: 25,
        indexer: {
          stateId: 'default',
          stateIdConfigured: 'default',
          lastIndexedBlock: 25,
          lastIndexedBlockHash: '0xhash',
          lastIndexedAt: '2026-01-01T00:00:00.000Z',
          lastIndexerRunAt: '2026-01-01T00:00:00.000Z',
          lastDispatcherRunAt: '2026-01-01T00:00:00.000Z',
          discoveryMode: 'registry',
          lagBlocks: 0,
          lagSeconds: 0,
          isStale: false,
          staleThresholdMs: 36000,
          lastErrorAt: null,
          lastErrorMessage: null,
        },
        stats: {
          vaultCount: 3,
          beaconEventCount: 12,
          activeSubscriptionCount: 2,
          pendingDeliveryCount: 1,
          failedDeliveryCount: 0,
        },
      },
    }),
  );

  assert.match(html, /Beacon health/);
  assert.match(html, /Indexed vaults/);
  assert.match(html, /Pending deliveries/);
  assert.match(html, /No recent indexer error recorded/);
});
