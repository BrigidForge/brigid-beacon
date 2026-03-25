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
    'https://vault.brigidforge.com',
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
    'https://vault.brigidforge.com',
  );

  assert.equal(formatted.amount, '12');
});

test('formatNotification includes richer withdrawal request details and viewer link', () => {
  const formatted = formatNotification(
    {
      id: '31337:0xtest:2',
      vaultAddress: '0x524F04724632eED237cbA3c37272e018b3A7967e',
      kind: 'protected_withdrawal_requested',
      blockNumber: 44,
      transactionHash: '0x9f27b6e4eb77d77c13f2783d16dab1d7e4aa8cb4a6d5cdf7300d49b112233445',
      timestamp: new Date('2026-03-15T06:00:00.000Z'),
      payload: {
        amount: '250000000000000000000',
        purposeHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        requestedAt: '1773554400',
        executableAt: '1773640800',
        expiresAt: '1773727200',
      },
      chainId: 31337,
    },
    'https://testnet.bscscan.com',
    'https://vault.brigidforge.com',
  );

  assert.equal(formatted.requestTypeLabel, 'Vested allocation');
  assert.equal(formatted.delayLabel, '1d');
  assert.equal(formatted.publicViewerLink, 'https://vault.brigidforge.com/view/0x524F04724632eED237cbA3c37272e018b3A7967e');
  assert.match(formatted.body, /Allocation: Vested allocation/);
  assert.match(formatted.body, /Reason reference: 0x12345678\.\.\.abcdef/);
  assert.match(formatted.body, /Vault viewer: https:\/\/vault\.brigidforge\.com\/view\//);
});
