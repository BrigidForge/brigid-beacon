import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AnalyticsTokensDashboard,
  TokenAnalyticsDashboard,
} from '../src/components/AnalyticsTokensDashboard';

test('AnalyticsTokensDashboard renders ecosystem token summaries', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      undefined,
      React.createElement(AnalyticsTokensDashboard, {
        overview: {
          vaultCount: 3,
          tokenCount: 2,
          ownerCount: 2,
          deployerCount: 2,
          beaconEventCount: 12,
        },
        tokenList: {
          tokens: [
            {
              tokenAddress: '0x9A676e781A523b5d0C0e43731313A708CB607508',
              vaultCount: 2,
              ownerCount: 1,
              deployerCount: 1,
              totalAllocation: '1500000000000000000000',
              protectedOutstandingBalance: '900000000000000000000',
              excessBalance: '25000000000000000000',
            },
          ],
        },
      }),
    ),
  );

  assert.match(html, /Token and ecosystem coverage/);
  assert.match(html, /Open token view/);
  assert.match(html, /Protected outstanding/);
});

test('TokenAnalyticsDashboard renders vault detail cards for one token', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      undefined,
      React.createElement(TokenAnalyticsDashboard, {
        detail: {
          tokenAddress: '0x9A676e781A523b5d0C0e43731313A708CB607508',
          vaultCount: 1,
          ownerCount: 1,
          deployerCount: 1,
          totalAllocation: '1000000000000000000000',
          protectedOutstandingBalance: '750000000000000000000',
          excessBalance: '25000000000000000000',
          vaults: [
            {
              deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
              metadata: {
                address: '0x524F04724632eED237cbA3c37272e018b3A7967e',
                chainId: 31337,
                owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
                token: '0x9A676e781A523b5d0C0e43731313A708CB607508',
                totalAllocation: '1000000000000000000000',
                startTime: '100',
                cliffDuration: '0',
                intervalDuration: '60',
                intervalCount: '4',
                cancelWindow: '20',
                withdrawalDelay: '40',
                executionWindow: '60',
                createdAt: '2026-01-01T00:00:00.000Z',
                deployedAtBlock: 10,
                deployedAtTx: '0xtx',
              },
              status: {
                address: '0x524F04724632eED237cbA3c37272e018b3A7967e',
                state: 'active_no_request',
                funded: true,
                totalWithdrawn: '250000000000000000000',
                totalExcessWithdrawn: '0',
                vestedAmount: '750000000000000000000',
                protectedOutstandingBalance: '750000000000000000000',
                excessBalance: '25000000000000000000',
                availableToWithdraw: '500000000000000000000',
                excessAvailableToWithdraw: '25000000000000000000',
                pendingRequest: null,
                updatedAtBlock: 25,
                updatedAt: '2026-01-01T00:03:00.000Z',
              },
            },
          ],
        },
      }),
    ),
  );

  assert.match(html, /Official vault footprint/);
  assert.match(html, /Protected available/);
  assert.match(html, /Open vault/);
});
