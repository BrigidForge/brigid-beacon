import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNotification } from '../src/notifications/format.js';

test('formatNotification renders 18-decimal token amounts in a human-readable form', () => {
  const formatted = formatNotification(
    {
      id: '31337:0xtest:0',
      vaultAddress: '0x524F04724632eED237cbA3c37272e018b3A7967e',
      kind: 'vault_funded',
      blockNumber: 20,
      transactionHash: '0x36aaf17424b9a1a26c917087b94cfad0b92d285e4356af8dc9c83838d916f640',
      timestamp: new Date('2026-03-15T03:28:05.000Z'),
      payload: {
        amount: '1000000000000000000000',
      },
      chainId: 31337,
    },
    'http://localhost:8545',
  );

  assert.equal(formatted.amount, '1,000');
  assert.match(formatted.body, /Amount: 1,000/);
  assert.match(formatted.shortSummary, /Amount: 1,000/);
});

test('formatNotification keeps sub-token precision for smaller 18-decimal amounts', () => {
  const formatted = formatNotification(
    {
      id: '31337:0xtest:1',
      vaultAddress: '0x524F04724632eED237cbA3c37272e018b3A7967e',
      kind: 'excess_deposited',
      blockNumber: 32,
      transactionHash: '0xb83ca6ad9c9d0d7106539f6c032ddfb032d6529c43dd5855dd9f0a9b1747b528',
      timestamp: new Date('2026-03-15T05:22:53.000Z'),
      payload: {
        amount: '12000000000000000000',
      },
      chainId: 31337,
    },
    'http://localhost:8545',
  );

  assert.equal(formatted.amount, '12');
});
