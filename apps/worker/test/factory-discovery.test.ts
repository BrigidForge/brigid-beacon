import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface, getAddress, zeroPadValue, type Log } from 'ethers';
import { BrigidVaultFactoryAbi } from '@brigid/beacon-contracts-abi';
import {
  FACTORY_BRIGID_VAULT_DEPLOYED_TOPIC,
  FACTORY_VAULT_DEPLOYED_TOPIC,
  dedupeLogs,
  parseFactoryDeploymentLog,
  readFactoryRegistryVaults,
  reconcileFactoryRegistryVaults,
  type VaultConfigData,
} from '../src/factory-discovery.js';

const factoryInterface = new Interface([...BrigidVaultFactoryAbi] as never[]);

const deployer = getAddress('0x00000000000000000000000000000000000000d1');
const vault = getAddress('0x00000000000000000000000000000000000000a1');
const token = getAddress('0x00000000000000000000000000000000000000c3');
const owner = getAddress('0x00000000000000000000000000000000000000b2');

const vaultConfig: VaultConfigData = {
  token,
  owner,
  totalAllocation: 1_000n,
  startTime: 200n,
  cliff: 10n,
  interval: 60n,
  intervals: 8n,
  cancelWindow: 20n,
  withdrawalDelay: 40n,
  executionWindow: 80n,
};

function fakeLog(params: {
  fragment: 'VaultDeployed' | 'BrigidVaultDeployed';
  args: unknown[];
  transactionHash: string;
  logIndex: number;
  blockNumber?: number;
}): Log {
  const event = factoryInterface.getEvent(params.fragment)!;
  const encoded = factoryInterface.encodeEventLog(event, params.args);

  return {
    address: getAddress('0x00000000000000000000000000000000000000f1'),
    blockHash: '0x' + '11'.repeat(32),
    blockNumber: params.blockNumber ?? 12,
    data: encoded.data,
    index: params.logIndex,
    removed: false,
    topics: encoded.topics,
    transactionHash: params.transactionHash,
    transactionIndex: 0,
  } as Log;
}

test('parseFactoryDeploymentLog normalizes legacy BrigidVaultDeployed events directly', async () => {
  const log = fakeLog({
    fragment: 'BrigidVaultDeployed',
    args: [deployer, vault, token, owner, 1_000n, 200n, 10n, 60n, 8n, 20n, 40n, 80n],
    transactionHash: '0x' + 'aa'.repeat(32),
    logIndex: 0,
  });

  const deployment = await parseFactoryDeploymentLog(log, async () => {
    throw new Error('readConfig should not be called for legacy events');
  });

  assert.ok(deployment);
  assert.equal(deployment.sourceEvent, 'BrigidVaultDeployed');
  assert.equal(deployment.deployer, deployer);
  assert.equal(deployment.vault, vault);
  assert.equal(deployment.owner, owner);
  assert.equal(deployment.withdrawalDelay, 40n);
});

test('parseFactoryDeploymentLog hydrates config for VaultDeployed events from the vault contract', async () => {
  const log = fakeLog({
    fragment: 'VaultDeployed',
    args: [vault, deployer, token, 1_000n, 200n],
    transactionHash: '0x' + 'bb'.repeat(32),
    logIndex: 1,
  });

  let requestedVault: string | null = null;
  const deployment = await parseFactoryDeploymentLog(log, async (vaultAddress) => {
    requestedVault = vaultAddress;
    return vaultConfig;
  });

  assert.ok(deployment);
  assert.equal(requestedVault, vault);
  assert.equal(deployment.sourceEvent, 'VaultDeployed');
  assert.equal(deployment.vault, vault);
  assert.equal(deployment.token, token);
  assert.equal(deployment.owner, owner);
  assert.equal(deployment.executionWindow, 80n);
});

test('reconcileFactoryRegistryVaults recovers only missing vaults and dedupes recovered logs', async () => {
  const missingVault = getAddress('0x00000000000000000000000000000000000000a2');
  const missingLog = fakeLog({
    fragment: 'VaultDeployed',
    args: [missingVault, deployer, token, 2_000n, 400n],
    transactionHash: '0x' + 'cc'.repeat(32),
    logIndex: 2,
  });

  const recovered = await reconcileFactoryRegistryVaults({
    registryVaults: [vault, missingVault, missingVault],
    knownVaults: [vault],
    toBlock: 99,
    findDeploymentLog: async (vaultAddress, toBlock) => {
      assert.equal(toBlock, 99);
      return vaultAddress === missingVault ? missingLog : null;
    },
  });

  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].transactionHash, missingLog.transactionHash);
});

test('readFactoryRegistryVaults returns null when registry methods are unavailable', async () => {
  const registryVaults = await readFactoryRegistryVaults({
    async totalVaults() {
      throw new Error('missing method');
    },
    async allVaults() {
      throw new Error('should not be called');
    },
  });

  assert.equal(registryVaults, null);
});

test('readFactoryRegistryVaults normalizes addresses when registry methods are available', async () => {
  const registryVaults = await readFactoryRegistryVaults({
    async totalVaults() {
      return 2n;
    },
    async allVaults(index: number) {
      return index === 0 ? vault.toLowerCase() : owner.toLowerCase();
    },
  });

  assert.deepEqual(registryVaults, [vault, owner]);
});

test('dedupeLogs collapses duplicate deployment logs by tx hash and log index', () => {
  const logA = fakeLog({
    fragment: 'VaultDeployed',
    args: [vault, deployer, token, 1_000n, 200n],
    transactionHash: '0x' + 'dd'.repeat(32),
    logIndex: 3,
  });
  const logB = fakeLog({
    fragment: 'BrigidVaultDeployed',
    args: [deployer, vault, token, owner, 1_000n, 200n, 10n, 60n, 8n, 20n, 40n, 80n],
    transactionHash: '0x' + 'dd'.repeat(32),
    logIndex: 3,
  });

  const deduped = dedupeLogs([logA, logB]);
  assert.equal(deduped.length, 1);
});

test('factory deployment topics stay aligned with the ABI', () => {
  assert.equal(FACTORY_VAULT_DEPLOYED_TOPIC, factoryInterface.getEvent('VaultDeployed')!.topicHash);
  assert.equal(
    FACTORY_BRIGID_VAULT_DEPLOYED_TOPIC,
    factoryInterface.getEvent('BrigidVaultDeployed')!.topicHash
  );

  assert.equal(zeroPadValue(vault, 32).length, 66);
});
