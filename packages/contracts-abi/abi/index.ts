/**
 * BrigidVault and Factory ABIs for Beacon indexer.
 * Keep in sync with contracts/BrigidVault.sol and BrigidVaultFactory.sol.
 */

export const BrigidVaultFactoryAbi = [
  {
    type: 'event',
    name: 'VaultDeployed',
    inputs: [
      { name: 'vault', type: 'address', indexed: true },
      { name: 'deployer', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'allocation', type: 'uint256', indexed: false },
      { name: 'startTime', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BrigidVaultDeployed',
    inputs: [
      { name: 'deployer', type: 'address', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: false },
      { name: 'totalAllocation', type: 'uint256', indexed: false },
      { name: 'startTime', type: 'uint256', indexed: false },
      { name: 'cliff', type: 'uint256', indexed: false },
      { name: 'interval', type: 'uint256', indexed: false },
      { name: 'intervals', type: 'uint256', indexed: false },
      { name: 'cancelWindow', type: 'uint256', indexed: false },
      { name: 'withdrawalDelay', type: 'uint256', indexed: false },
      { name: 'executionWindow', type: 'uint256', indexed: false },
    ],
  },
  'function totalVaults() view returns (uint256)',
  'function allVaults(uint256) view returns (address)',
  'function vaultCreator(address) view returns (address)',
  'function tokenVaults(address,uint256) view returns (address)',
] as const;

export const BrigidVaultAbi = [
  {
    type: 'event',
    name: 'Funded',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ExcessDeposited',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'WithdrawalRequested',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'purposeHash', type: 'bytes32', indexed: true },
      { name: 'requestedAt', type: 'uint256', indexed: false },
      { name: 'executableAt', type: 'uint256', indexed: false },
      { name: 'expiresAt', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'WithdrawalCanceled',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'purposeHash', type: 'bytes32', indexed: true },
      { name: 'canceledAt', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'WithdrawalExecuted',
    inputs: [
      { name: 'executor', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'purposeHash', type: 'bytes32', indexed: true },
      { name: 'executedAt', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'WithdrawalExpired',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'purposeHash', type: 'bytes32', indexed: true },
      { name: 'expiredAt', type: 'uint256', indexed: false },
      { name: 'requestType', type: 'uint8', indexed: false },
    ],
  },
  // Read function for requestType at a given block
  'function token() view returns (address)',
  'function owner() view returns (address)',
  'function totalAllocation() view returns (uint256)',
  'function startTime() view returns (uint256)',
  'function cliffDuration() view returns (uint256)',
  'function intervalDuration() view returns (uint256)',
  'function intervalCount() view returns (uint256)',
  'function cancelWindow() view returns (uint256)',
  'function withdrawalDelay() view returns (uint256)',
  'function executionWindow() view returns (uint256)',
  'function pendingRequestType() view returns (uint8)',
] as const;
