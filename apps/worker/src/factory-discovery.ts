import { Contract, Interface, getAddress, zeroPadValue, type JsonRpcProvider, type Log } from 'ethers';
import { BrigidVaultAbi, BrigidVaultFactoryAbi } from '@brigid/beacon-contracts-abi';

const factoryInterface = new Interface([...BrigidVaultFactoryAbi] as never[]);
const FACTORY_DEPLOYMENT_SEARCH_CHUNK_SIZE = 2_000;

export const FACTORY_VAULT_DEPLOYED_TOPIC = factoryInterface.getEvent('VaultDeployed')!.topicHash;
export const FACTORY_BRIGID_VAULT_DEPLOYED_TOPIC = factoryInterface.getEvent('BrigidVaultDeployed')!.topicHash;

export type VaultConfigData = {
  token: string;
  owner: string;
  totalAllocation: bigint;
  startTime: bigint;
  cliff: bigint;
  interval: bigint;
  intervals: bigint;
  cancelWindow: bigint;
  withdrawalDelay: bigint;
  executionWindow: bigint;
};

export type FactoryDeploymentData = VaultConfigData & {
  deployer: string;
  vault: string;
  sourceEvent: 'VaultDeployed' | 'BrigidVaultDeployed';
};

export type FactoryRegistryContract = {
  totalVaults(): Promise<bigint>;
  allVaults(index: number): Promise<string>;
};

export function dedupeLogs(logs: Log[]): Log[] {
  return [...new Map(logs.map((log) => [`${log.transactionHash.toLowerCase()}:${log.index}`, log])).values()];
}

export async function readVaultConfig(provider: JsonRpcProvider, vaultAddress: string): Promise<VaultConfigData> {
  const vaultContract = new Contract(vaultAddress, BrigidVaultAbi, provider);
  const [
    token,
    owner,
    totalAllocation,
    startTime,
    cliff,
    interval,
    intervals,
    cancelWindow,
    withdrawalDelay,
    executionWindow,
  ] = await Promise.all([
    vaultContract.token(),
    vaultContract.owner(),
    vaultContract.totalAllocation(),
    vaultContract.startTime(),
    vaultContract.cliffDuration(),
    vaultContract.intervalDuration(),
    vaultContract.intervalCount(),
    vaultContract.cancelWindow(),
    vaultContract.withdrawalDelay(),
    vaultContract.executionWindow(),
  ]);

  return {
    token: getAddress(token),
    owner: getAddress(owner),
    totalAllocation,
    startTime,
    cliff,
    interval,
    intervals,
    cancelWindow,
    withdrawalDelay,
    executionWindow,
  };
}

export async function parseFactoryDeploymentLog(
  log: Log,
  readConfig: (vaultAddress: string) => Promise<VaultConfigData>
): Promise<FactoryDeploymentData | null> {
  const parsed = factoryInterface.parseLog({ topics: log.topics as string[], data: log.data });
  if (!parsed) return null;

  if (parsed.name === 'BrigidVaultDeployed') {
    return {
      sourceEvent: 'BrigidVaultDeployed',
      deployer: getAddress(parsed.args[0] as string),
      vault: getAddress(parsed.args[1] as string),
      token: getAddress(parsed.args[2] as string),
      owner: getAddress(parsed.args[3] as string),
      totalAllocation: parsed.args[4] as bigint,
      startTime: parsed.args[5] as bigint,
      cliff: parsed.args[6] as bigint,
      interval: parsed.args[7] as bigint,
      intervals: parsed.args[8] as bigint,
      cancelWindow: parsed.args[9] as bigint,
      withdrawalDelay: parsed.args[10] as bigint,
      executionWindow: parsed.args[11] as bigint,
    };
  }

  if (parsed.name === 'VaultDeployed') {
    const vault = getAddress(parsed.args[0] as string);
    return {
      sourceEvent: 'VaultDeployed',
      deployer: getAddress(parsed.args[1] as string),
      vault,
      ...(await readConfig(vault)),
    };
  }

  return null;
}

export async function findFactoryDeploymentLog(
  provider: JsonRpcProvider,
  factoryAddress: string,
  vaultAddress: string,
  toBlock: number,
  fromBlock = 0,
): Promise<Log | null> {
  const normalizedVault = getAddress(vaultAddress);
  for (let chunkStart = fromBlock; chunkStart <= toBlock; chunkStart += FACTORY_DEPLOYMENT_SEARCH_CHUNK_SIZE) {
    const chunkEnd = Math.min(toBlock, chunkStart + FACTORY_DEPLOYMENT_SEARCH_CHUNK_SIZE - 1);
    const [newEventLogs, legacyEventLogs] = await Promise.all([
      provider.getLogs({
        address: factoryAddress,
        topics: [FACTORY_VAULT_DEPLOYED_TOPIC, zeroPadValue(normalizedVault, 32)],
        fromBlock: chunkStart,
        toBlock: chunkEnd,
      }),
      provider.getLogs({
        address: factoryAddress,
        topics: [FACTORY_BRIGID_VAULT_DEPLOYED_TOPIC, null, zeroPadValue(normalizedVault, 32)],
        fromBlock: chunkStart,
        toBlock: chunkEnd,
      }),
    ]);

    const combined = dedupeLogs([...newEventLogs, ...legacyEventLogs]).sort((a, b) => {
      const blockCmp = a.blockNumber - b.blockNumber;
      return blockCmp !== 0 ? blockCmp : a.index - b.index;
    });

    if (combined[0]) {
      return combined[0];
    }
  }

  return null;
}

export async function readFactoryRegistryVaults(factoryContract: FactoryRegistryContract): Promise<string[] | null> {
  try {
    const registryVaultCount = Number(await factoryContract.totalVaults());
    if (registryVaultCount === 0) {
      return [];
    }

    const registryVaults = await Promise.all(
      Array.from({ length: registryVaultCount }, (_, index) => factoryContract.allVaults(index)),
    );

    return registryVaults.map((vault) => getAddress(vault));
  } catch {
    return null;
  }
}

export async function reconcileFactoryRegistryVaults(params: {
  registryVaults: string[];
  knownVaults: string[];
  toBlock: number;
  findDeploymentLog: (vaultAddress: string, toBlock: number) => Promise<Log | null>;
}): Promise<Log[]> {
  const knownVaults = new Set(params.knownVaults.map((vault) => getAddress(vault)));
  const missingVaults = params.registryVaults
    .map((vault) => getAddress(vault))
    .filter((vault) => !knownVaults.has(vault));

  const recoveredLogs = await Promise.all(
    missingVaults.map((vaultAddress) => params.findDeploymentLog(vaultAddress, params.toBlock))
  );

  return dedupeLogs(recoveredLogs.filter((log): log is Log => log != null));
}
