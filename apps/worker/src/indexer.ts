/**
 * Beacon event indexer: poll factory + vault events, normalize, persist.
 */

import { Prisma } from '@prisma/client';
import { JsonRpcProvider, Contract, Interface, getAddress, zeroPadValue, type Log } from 'ethers';
import { BrigidVaultFactoryAbi, BrigidVaultAbi } from '@brigid/beacon-contracts-abi';
import type { NormalizedEvent, VaultMetadata } from '@brigid/beacon-shared-types';
import { computeVaultSnapshot } from '@brigid/beacon-status-engine';
import { config } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';
import type { ContractLog } from './types.js';
import {
  FACTORY_BRIGID_VAULT_DEPLOYED_TOPIC,
  FACTORY_VAULT_DEPLOYED_TOPIC,
  dedupeLogs,
  findFactoryDeploymentLog,
  parseFactoryDeploymentLog,
  type FactoryRegistryContract,
  readFactoryRegistryVaults,
  readVaultConfig,
  reconcileFactoryRegistryVaults,
  type FactoryDeploymentData,
} from './factory-discovery.js';
import {
  normalizeVaultCreated,
  normalizeFunded,
  normalizeExcessDeposited,
  normalizeWithdrawalRequested,
  normalizeWithdrawalCanceled,
  normalizeWithdrawalExecuted,
  normalizeRequestExpired,
} from './normalize.js';

const factoryInterface = new Interface([...BrigidVaultFactoryAbi] as never[]);
const vaultInterface = new Interface([...BrigidVaultAbi] as never[]);
const erc20Interface = new Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);

// Topic hashes for vault events (so we can filter getLogs)
const VAULT_TOPICS = [
  vaultInterface.getEvent('Funded')!.topicHash,
  vaultInterface.getEvent('ExcessDeposited')!.topicHash,
  vaultInterface.getEvent('WithdrawalRequested')!.topicHash,
  vaultInterface.getEvent('WithdrawalCanceled')!.topicHash,
  vaultInterface.getEvent('WithdrawalExecuted')!.topicHash,
  vaultInterface.getEvent('WithdrawalExpired')!.topicHash,
].filter(Boolean) as string[];
const ERC20_TRANSFER_TOPIC = erc20Interface.getEvent('Transfer')!.topicHash;

function toContractLog(log: Log): ContractLog {
  return {
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    index: log.index,
    address: log.address,
    topics: log.topics as string[],
    data: log.data,
  };
}

async function getOrCreateIndexerState(): Promise<number> {
  const initialLastBlock = Math.max(0, config.startBlock - 1);
  const state = await prisma.indexerState.upsert({
    where: { id: config.indexerStateId },
    create: { id: config.indexerStateId, lastBlockNumber: initialLastBlock, lastBlockHash: null },
    update: {},
  });
  return state.lastBlockNumber;
}

async function getIndexerState(): Promise<{ lastBlockNumber: number; lastBlockHash: string | null }> {
  const initialLastBlock = Math.max(0, config.startBlock - 1);
  const state = await prisma.indexerState.upsert({
    where: { id: config.indexerStateId },
    create: { id: config.indexerStateId, lastBlockNumber: initialLastBlock, lastBlockHash: null },
    update: {},
    select: { lastBlockNumber: true, lastBlockHash: true },
  });
  return state;
}

async function bootstrapIndexerStateFromStartBlock(): Promise<void> {
  if (config.startBlock <= 1) return;

  const state = await prisma.indexerState.findUnique({
    where: { id: config.indexerStateId },
    select: { lastBlockNumber: true, lastBlockHash: true },
  });

  if (!state || state.lastBlockNumber > 0 || state.lastBlockHash != null) {
    return;
  }

  await setLastBlock(config.startBlock - 1, null);
}

async function setLastBlock(
  blockNumber: number,
  blockHash: string | null,
  discoveryMode?: 'registry' | 'event_only',
): Promise<void> {
  await prisma.indexerState.upsert({
    where: { id: config.indexerStateId },
    create: {
      id: config.indexerStateId,
      lastBlockNumber: blockNumber,
      lastBlockHash: blockHash,
      lastIndexedAt: new Date(),
      ...(discoveryMode ? { discoveryMode } : {}),
    },
    update: {
      lastBlockNumber: blockNumber,
      lastBlockHash: blockHash,
      lastIndexedAt: new Date(),
      ...(discoveryMode ? { discoveryMode } : {}),
    },
  });
}

async function getBlockTimestamp(provider: JsonRpcProvider, blockNumber: number): Promise<string> {
  const block = await provider.getBlock(blockNumber);
  if (!block?.timestamp) return String(Math.floor(Date.now() / 1000));
  return String(block.timestamp);
}

function toVaultMetadata(vault: {
  id: string;
  chainId: number;
  owner: string;
  token: string;
  totalAllocation: string;
  startTime: string;
  cliffDuration: string;
  intervalDuration: string;
  intervalCount: string;
  cancelWindow: string;
  withdrawalDelay: string;
  executionWindow: string;
  createdAt: Date;
  deployedAtBlock: number;
  deployedAtTx: string;
}): VaultMetadata {
  return {
    address: vault.id,
    chainId: vault.chainId,
    owner: vault.owner,
    token: vault.token,
    totalAllocation: vault.totalAllocation,
    startTime: vault.startTime,
    cliffDuration: vault.cliffDuration,
    intervalDuration: vault.intervalDuration,
    intervalCount: vault.intervalCount,
    cancelWindow: vault.cancelWindow,
    withdrawalDelay: vault.withdrawalDelay,
    executionWindow: vault.executionWindow,
    createdAt: vault.createdAt.toISOString(),
    deployedAtBlock: vault.deployedAtBlock,
    deployedAtTx: vault.deployedAtTx,
  };
}

function toNormalizedEvent(row: {
  id: string;
  vaultAddress: string;
  kind: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  timestamp: Date;
  payload: unknown;
}): NormalizedEvent {
  return {
    id: row.id,
    vaultAddress: row.vaultAddress,
    kind: row.kind as NormalizedEvent['kind'],
    blockNumber: row.blockNumber,
    transactionHash: row.transactionHash,
    logIndex: row.logIndex,
    timestamp: row.timestamp.toISOString(),
    payload: row.payload as NormalizedEvent['payload'],
  };
}

async function refreshVaultSnapshot(vaultAddress: string): Promise<void> {
  const vault = await prisma.vault.findUnique({ where: { id: vaultAddress } });
  if (!vault) return;

  const events = await prisma.beaconEvent.findMany({
    where: { vaultAddress },
    orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
  });

  const latestEvent = events.at(-1);
  const now = latestEvent
    ? Math.floor(latestEvent.timestamp.getTime() / 1000)
    : Math.floor(vault.createdAt.getTime() / 1000);
  const snapshot = computeVaultSnapshot({
    metadata: toVaultMetadata(vault),
    events: events.map(toNormalizedEvent),
    now,
  });

  const existing = await prisma.vaultSnapshot.findFirst({
    where: {
      vaultAddress,
      blockNumber: snapshot.updatedAtBlock,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const data = {
    vaultAddress,
    blockNumber: snapshot.updatedAtBlock,
    updatedAt: new Date(snapshot.updatedAt),
    funded: snapshot.funded,
    totalWithdrawn: snapshot.totalWithdrawn,
    totalExcessWithdrawn: snapshot.totalExcessWithdrawn,
    vestedAmount: snapshot.vestedAmount,
    protectedOutstanding: snapshot.protectedOutstandingBalance,
    excessBalance: snapshot.excessBalance,
    availableToWithdraw: snapshot.availableToWithdraw,
    excessAvailable: snapshot.excessAvailableToWithdraw,
    state: snapshot.state,
    pendingRequestJson:
      snapshot.pendingRequest == null
        ? Prisma.JsonNull
        : (snapshot.pendingRequest as unknown as Prisma.InputJsonValue),
  };

  if (existing) {
    await prisma.vaultSnapshot.update({
      where: { id: existing.id },
      data,
    });
    return;
  }

  await prisma.vaultSnapshot.create({ data });
}

async function inferWithdrawalRequestType(params: {
  provider: JsonRpcProvider;
  vaultAddress: string;
  log: Log;
  purposeHash: string;
}): Promise<1 | 2> {
  const vaultContractForRead = new Contract(params.vaultAddress, BrigidVaultAbi, params.provider);
  const requestType = Number(await vaultContractForRead.pendingRequestType({ blockTag: params.log.blockNumber }));
  if (requestType === 1 || requestType === 2) {
    return requestType;
  }

  const sameBlockTerminalLogs = await params.provider.getLogs({
    address: params.vaultAddress,
    topics: [[
      vaultInterface.getEvent('WithdrawalCanceled')!.topicHash,
      vaultInterface.getEvent('WithdrawalExecuted')!.topicHash,
      vaultInterface.getEvent('WithdrawalExpired')!.topicHash,
    ]],
    fromBlock: params.log.blockNumber,
    toBlock: params.log.blockNumber,
  });

  for (const candidate of sameBlockTerminalLogs) {
    if (candidate.index <= params.log.index) continue;
    const parsed = vaultInterface.parseLog({ topics: candidate.topics as string[], data: candidate.data });
    if (!parsed) continue;

    const candidatePurposeHash = String(parsed.args[2]).toLowerCase();
    if (candidatePurposeHash !== params.purposeHash) continue;

    if (parsed.name === 'WithdrawalExpired') {
      const terminalRequestType = Number(parsed.args[4]);
      if (terminalRequestType === 1 || terminalRequestType === 2) {
        return terminalRequestType;
      }
    }
  }

  // If the request was already cleared by the end of the block and no typed terminal
  // event exists to disambiguate it, keep the legacy protected fallback.
  return 1;
}

function transferIgnoreKey(transactionHash: string, vaultAddress: string): string {
  return `${transactionHash.toLowerCase()}:${getAddress(vaultAddress)}`;
}

async function upsertVaultCreated(normalized: NormalizedEvent, timestampSeconds: string): Promise<void> {
  await prisma.vault.upsert({
    where: { id: normalized.vaultAddress },
    create: {
      id: normalized.vaultAddress,
      chainId: config.chainId,
      owner: (normalized.payload as { owner: string }).owner,
      token: (normalized.payload as { token: string }).token,
      totalAllocation: (normalized.payload as { totalAllocation: string }).totalAllocation,
      startTime: (normalized.payload as { startTime: string }).startTime,
      cliffDuration: (normalized.payload as { cliffDuration: string }).cliffDuration,
      intervalDuration: (normalized.payload as { intervalDuration: string }).intervalDuration,
      intervalCount: (normalized.payload as { intervalCount: string }).intervalCount,
      cancelWindow: (normalized.payload as { cancelWindow: string }).cancelWindow,
      withdrawalDelay: (normalized.payload as { withdrawalDelay: string }).withdrawalDelay,
      executionWindow: (normalized.payload as { executionWindow: string }).executionWindow,
      deployedAtBlock: normalized.blockNumber,
      deployedAtTx: normalized.transactionHash,
      deployer: (normalized.payload as { deployer: string }).deployer,
    },
    update: {},
  });

  await prisma.beaconEvent.upsert({
    where: { id: normalized.id },
    create: {
      id: normalized.id,
      vaultAddress: normalized.vaultAddress,
      kind: normalized.kind,
      blockNumber: normalized.blockNumber,
      transactionHash: normalized.transactionHash,
      logIndex: normalized.logIndex,
      timestamp: new Date(Number(timestampSeconds) * 1000),
      payload: normalized.payload as object,
    },
    update: {},
  });
}


async function cleanupIndexedRange(fromBlock: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const vaultsCreatedInRange = await tx.vault.findMany({
      where: { deployedAtBlock: { gte: fromBlock } },
      select: { id: true },
    });

    if (vaultsCreatedInRange.length > 0) {
      await tx.vault.deleteMany({
        where: { id: { in: vaultsCreatedInRange.map((vault) => vault.id) } },
      });
    }

    await tx.beaconEvent.deleteMany({
      where: { blockNumber: { gte: fromBlock } },
    });
    await tx.vaultSnapshot.deleteMany({
      where: { blockNumber: { gte: fromBlock } },
    });
  });
}

export async function runIndexerCycle(provider: JsonRpcProvider): Promise<{
  processed: number;
  toBlock: number;
  discoveryMode: 'registry' | 'event_only';
}> {
  const currentState = await getIndexerState();
  let lastBlock = currentState.lastBlockNumber;
  const currentBlock = await provider.getBlockNumber();
  if (lastBlock > 0 && !currentState.lastBlockHash) {
    const currentLastBlock = await provider.getBlock(lastBlock);
    const currentLastBlockHash = currentLastBlock?.hash ?? null;
    await setLastBlock(lastBlock, currentLastBlockHash);
    if (currentBlock <= lastBlock) {
      return { processed: 0, toBlock: lastBlock, discoveryMode: 'registry' };
    }
  }
  if (lastBlock > 0 && currentState.lastBlockHash) {
    const lastProcessedBlock = await provider.getBlock(lastBlock);
    const canonicalHash = lastProcessedBlock?.hash ?? null;
    if (canonicalHash == null || canonicalHash.toLowerCase() !== currentState.lastBlockHash.toLowerCase()) {
      const rewindTo = Math.max(0, lastBlock - config.reorgLookbackBlocks);
      const rewindFromBlock = rewindTo + 1;
      await cleanupIndexedRange(rewindFromBlock);
      lastBlock = rewindTo;
      await setLastBlock(rewindTo, rewindTo > 0 ? (await provider.getBlock(rewindTo))?.hash ?? null : null);
    }
  }

  const toBlock = Math.max(lastBlock, Math.min(currentBlock - config.confirmations, lastBlock + config.blockChunkSize));

  if (lastBlock >= toBlock) {
    return { processed: 0, toBlock: lastBlock, discoveryMode: 'registry' };
  }

  const fromBlock = lastBlock + 1;
  const blockTimestamps = new Map<number, string>();

  async function blockTimestamp(blockNumber: number): Promise<string> {
    let ts = blockTimestamps.get(blockNumber);
    if (ts == null) {
      ts = await getBlockTimestamp(provider, blockNumber);
      blockTimestamps.set(blockNumber, ts);
    }
    return ts;
  }

  // 1) Factory logs plus registry reconciliation for any missed deploys.
  const factoryContract = new Contract(config.factoryAddress, BrigidVaultFactoryAbi, provider);
  const registryVaults = await readFactoryRegistryVaults(factoryContract as unknown as FactoryRegistryContract);
  const discoveryMode = registryVaults == null ? 'event_only' : 'registry';
  if (registryVaults == null) {
    logger.warn('Factory registry unavailable, falling back to event-only discovery', {
      factory: config.factoryAddress,
    });
  }
  const knownVaultRows = await prisma.vault.findMany({ select: { id: true } });

  const [freshFactoryLogs, reconciledFactoryLogs] = await Promise.all([
    provider.getLogs({
      address: config.factoryAddress,
      topics: [[FACTORY_VAULT_DEPLOYED_TOPIC, FACTORY_BRIGID_VAULT_DEPLOYED_TOPIC]],
      fromBlock,
      toBlock,
    }),
    registryVaults == null
      ? Promise.resolve([])
      : reconcileFactoryRegistryVaults({
          registryVaults,
          knownVaults: knownVaultRows.map((vault) => vault.id),
          toBlock,
          findDeploymentLog: (vaultAddress, registryToBlock) =>
            findFactoryDeploymentLog(
              provider,
              config.factoryAddress,
              vaultAddress,
              registryToBlock,
              Math.max(0, config.startBlock - 1)
            ),
        }),
  ]);
  const factoryLogs = dedupeLogs([...freshFactoryLogs, ...reconciledFactoryLogs]).sort((a, b) => {
    const blockCmp = a.blockNumber - b.blockNumber;
    return blockCmp !== 0 ? blockCmp : a.index - b.index;
  });

  // 2) Vault addresses: existing + newly deployed this chunk
  const deploymentDataByLogKey = new Map<string, FactoryDeploymentData>();
  const newVaultsFromLogs: string[] = [];
  for (const log of factoryLogs) {
    const parsedDeployment = await parseFactoryDeploymentLog(log, (vaultAddress) => readVaultConfig(provider, vaultAddress));
    if (!parsedDeployment) continue;
    deploymentDataByLogKey.set(`${log.transactionHash.toLowerCase()}:${log.index}`, parsedDeployment);
    newVaultsFromLogs.push(parsedDeployment.vault);
  }
  const preferredFactoryDeployments = new Set<string>();
  for (const deployment of deploymentDataByLogKey.values()) {
    if (deployment.sourceEvent === 'VaultDeployed') {
      preferredFactoryDeployments.add(`${deployment.vault.toLowerCase()}:${deployment.deployer.toLowerCase()}`);
    }
  }
  const existingVaultRows = await prisma.vault.findMany({ select: { id: true, token: true } });
  const existingVaults = existingVaultRows.map((row) => getAddress(row.id));
  const allVaultAddresses = [...new Set([...existingVaults, ...newVaultsFromLogs])];
  const vaultTokenByAddress = new Map<string, string>(
    existingVaultRows.map((row) => [getAddress(row.id), getAddress(row.token)])
  );
  for (const log of factoryLogs) {
    const deploymentData = deploymentDataByLogKey.get(`${log.transactionHash.toLowerCase()}:${log.index}`);
    if (!deploymentData) continue;
    vaultTokenByAddress.set(deploymentData.vault, deploymentData.token);
  }

  // 3) Vault logs (all events from all known vaults)
  let vaultLogs: Log[] = [];
  if (allVaultAddresses.length > 0) {
    vaultLogs = await provider.getLogs({
      address: allVaultAddresses,
      topics: [VAULT_TOPICS],
      fromBlock,
      toBlock,
    });
  }

  // 3b) Raw ERC20 transfers into known vaults, used to synthesize excess deposits
  const transferIgnoreKeys = new Set<string>();
  for (const log of vaultLogs) {
    const parsed = vaultInterface.parseLog({ topics: log.topics as string[], data: log.data });
    if (!parsed) continue;
    if (parsed.name === 'Funded' || parsed.name === 'ExcessDeposited') {
      transferIgnoreKeys.add(transferIgnoreKey(log.transactionHash, log.address));
    }
  }

  const tokenTransferLogs: Log[] = [];
  for (const vaultAddress of allVaultAddresses) {
    const tokenAddress = vaultTokenByAddress.get(getAddress(vaultAddress));
    if (!tokenAddress) continue;
    const inboundTransfers = await provider.getLogs({
      address: tokenAddress,
      topics: [ERC20_TRANSFER_TOPIC, null, zeroPadValue(getAddress(vaultAddress), 32)],
      fromBlock,
      toBlock,
    });
    tokenTransferLogs.push(...inboundTransfers);
  }

  // 4) Merge and sort by (blockNumber, logIndex)
  type Entry =
    | { type: 'factory'; log: Log }
    | { type: 'vault'; log: Log }
    | { type: 'token_transfer'; log: Log };
  const entries: Entry[] = [
    ...factoryLogs.map((log) => ({ type: 'factory' as const, log })),
    ...vaultLogs.map((log) => ({ type: 'vault' as const, log })),
    ...tokenTransferLogs.map((log) => ({ type: 'token_transfer' as const, log })),
  ];
  entries.sort((a, b) => {
    const blk = a.log.blockNumber - b.log.blockNumber;
    return blk !== 0 ? blk : a.log.index - b.log.index;
  });

  let processed = 0;
  const touchedVaults = new Set<string>();

  for (const { type, log } of entries) {
    const cLog = toContractLog(log);
    const ts = await blockTimestamp(log.blockNumber);

    if (type === 'factory') {
      const deploymentData = deploymentDataByLogKey.get(`${log.transactionHash.toLowerCase()}:${log.index}`);
      if (!deploymentData) continue;
      const {
        vault,
        deployer,
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
      } = deploymentData;

      if (
        deploymentData.sourceEvent === 'BrigidVaultDeployed' &&
        preferredFactoryDeployments.has(`${vault.toLowerCase()}:${deployer.toLowerCase()}`)
      ) {
        continue;
      }

      const normalized = normalizeVaultCreated(
        config.chainId,
        cLog,
        deployer,
        vault,
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
        ts
      );

      await upsertVaultCreated(normalized, ts);
      touchedVaults.add(normalized.vaultAddress);
      processed++;
      continue;
    }

    if (type === 'token_transfer') {
      const parsed = erc20Interface.parseLog({ topics: log.topics as string[], data: log.data });
      if (!parsed || parsed.name !== 'Transfer') continue;

      const from = parsed.args[0] as string;
      const to = parsed.args[1] as string;
      const amount = parsed.args[2] as bigint;
      const normalizedVaultAddress = getAddress(to);

      if (transferIgnoreKeys.has(transferIgnoreKey(log.transactionHash, normalizedVaultAddress))) {
        continue;
      }

      const normalized = normalizeExcessDeposited(
        config.chainId,
        cLog,
        normalizedVaultAddress,
        from,
        log.address,
        amount,
        ts
      );

      await prisma.beaconEvent.upsert({
        where: { id: normalized.id },
        create: {
          id: normalized.id,
          vaultAddress: normalized.vaultAddress,
          kind: normalized.kind,
          blockNumber: normalized.blockNumber,
          transactionHash: normalized.transactionHash,
          logIndex: normalized.logIndex,
          timestamp: new Date(Number(ts) * 1000),
          payload: normalized.payload as object,
        },
        update: {},
      });
      touchedVaults.add(normalized.vaultAddress);
      processed++;
      continue;
    }

    // type === 'vault'
    const parsed = vaultInterface.parseLog({ topics: log.topics as string[], data: log.data });
    if (!parsed) continue;

    const vaultAddress = log.address;
    let normalized: NormalizedEvent;

    switch (parsed.name) {
      case 'Funded': {
        const token = parsed.args[0] as string;
        const amount = parsed.args[1] as bigint;
        normalized = normalizeFunded(config.chainId, cLog, vaultAddress, token, amount, ts);
        break;
      }
      case 'ExcessDeposited': {
        const from = parsed.args[0] as string;
        const token = parsed.args[1] as string;
        const amount = parsed.args[2] as bigint;
        normalized = normalizeExcessDeposited(config.chainId, cLog, vaultAddress, from, token, amount, ts);
        break;
      }
      case 'WithdrawalRequested': {
        const owner = parsed.args[0] as string;
        const amount = parsed.args[1] as bigint;
        const purposeHash = (parsed.args[2] as string).toLowerCase();
        const requestedAt = parsed.args[3] as bigint;
        const executableAt = parsed.args[4] as bigint;
        const expiresAt = parsed.args[5] as bigint;
        const rt = await inferWithdrawalRequestType({
          provider,
          vaultAddress,
          log,
          purposeHash,
        });
        normalized = normalizeWithdrawalRequested(
          config.chainId,
          cLog,
          vaultAddress,
          owner,
          amount,
          purposeHash,
          requestedAt,
          executableAt,
          expiresAt,
          rt,
          ts
        );
        break;
      }
      case 'WithdrawalCanceled': {
        const owner = parsed.args[0] as string;
        const amount = parsed.args[1] as bigint;
        const purposeHash = (parsed.args[2] as string).toLowerCase();
        const canceledAt = parsed.args[3] as bigint;
        normalized = normalizeWithdrawalCanceled(config.chainId, cLog, vaultAddress, owner, amount, purposeHash, canceledAt, ts);
        break;
      }
      case 'WithdrawalExecuted': {
        const executor = parsed.args[0] as string;
        const owner = parsed.args[1] as string;
        const amount = parsed.args[2] as bigint;
        const purposeHash = (parsed.args[3] as string).toLowerCase();
        const executedAt = parsed.args[4] as bigint;
        normalized = normalizeWithdrawalExecuted(
          config.chainId,
          cLog,
          vaultAddress,
          executor,
          owner,
          amount,
          purposeHash,
          executedAt,
          ts
        );
        break;
      }
      case 'WithdrawalExpired': {
        const owner = parsed.args[0] as string;
        const amount = parsed.args[1] as bigint;
        const purposeHash = (parsed.args[2] as string).toLowerCase();
        const expiredAt = parsed.args[3] as bigint;
        const requestType = Number(parsed.args[4]);
        normalized = normalizeRequestExpired(
          config.chainId,
          cLog,
          vaultAddress,
          owner,
          amount,
          purposeHash,
          expiredAt,
          requestType,
          ts
        );
        break;
      }
      default:
        continue;
    }

    await prisma.beaconEvent.upsert({
      where: { id: normalized.id },
      create: {
        id: normalized.id,
        vaultAddress: normalized.vaultAddress,
        kind: normalized.kind,
        blockNumber: normalized.blockNumber,
        transactionHash: normalized.transactionHash,
        logIndex: normalized.logIndex,
        timestamp: new Date(Number(ts) * 1000),
        payload: normalized.payload as object,
      },
      update: {},
    });
    touchedVaults.add(normalized.vaultAddress);
    processed++;
  }

  for (const vaultAddress of touchedVaults) {
    await refreshVaultSnapshot(vaultAddress);
  }

  const finalizedBlock = await provider.getBlock(toBlock);
  await setLastBlock(toBlock, finalizedBlock?.hash ?? null, discoveryMode);
  return { processed, toBlock, discoveryMode };
}
