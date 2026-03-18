import { ethers } from 'ethers';

export const NETWORK_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  56: 'BNB Smart Chain',
  97: 'BNB Smart Chain (Testnet)',
  11155111: 'Sepolia',
};

export const EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  56: 'https://bscscan.com',
  97: 'https://testnet.bscscan.com',
  11155111: 'https://sepolia.etherscan.io',
};

export const DEFAULT_RPC_URL =
  (typeof import.meta !== 'undefined' &&
  typeof import.meta.env === 'object' &&
  import.meta.env &&
  'VITE_OPERATOR_RPC_URL' in import.meta.env
    ? import.meta.env.VITE_OPERATOR_RPC_URL
    : '') || 'https://bsc-testnet.publicnode.com';

export const DEFAULT_OPERATOR_CHAIN_ID = Number(
  (typeof import.meta !== 'undefined' &&
  typeof import.meta.env === 'object' &&
  import.meta.env &&
  'VITE_OPERATOR_CHAIN_ID' in import.meta.env
    ? import.meta.env.VITE_OPERATOR_CHAIN_ID
    : '') || '97',
);

export const WALLETCONNECT_CDN_URL =
  (typeof import.meta !== 'undefined' &&
  typeof import.meta.env === 'object' &&
  import.meta.env &&
  'VITE_WALLETCONNECT_CDN_URL' in import.meta.env
    ? import.meta.env.VITE_WALLETCONNECT_CDN_URL
    : '') || 'https://esm.sh/@walletconnect/ethereum-provider@2.23.8';

export const VAULT_ABI = [
  'function owner() view returns(address)',
  'function token() view returns(address)',
  'function totalAllocation() view returns(uint256)',
  'function totalWithdrawn() view returns(uint256)',
  'function vestedAmount() view returns(uint256)',
  'function availableToWithdraw() view returns(uint256)',
  'function excessAvailableToWithdraw() view returns(uint256)',
  'function funded() view returns(bool)',
  'function startTime() view returns(uint256)',
  'function cliffDuration() view returns(uint256)',
  'function intervalDuration() view returns(uint256)',
  'function intervalCount() view returns(uint256)',
  'function cancelWindow() view returns(uint256)',
  'function withdrawalDelay() view returns(uint256)',
  'function executionWindow() view returns(uint256)',
  'function pendingWithdrawal() view returns(uint256 amount,bytes32 purposeHash,uint256 requestedAt,uint256 executableAt,uint256 expiresAt,bool exists)',
  'function requestWithdrawal(uint256,bytes32)',
  'function requestExcessWithdrawal(uint256,bytes32)',
  'function cancelWithdrawal()',
  'function executeWithdrawal()',
] as const;

export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
] as const;

export type OperatorEthereumProvider = {
  isMetaMask?: boolean;
  isRabby?: boolean;
  isWalletConnect?: boolean;
  providers?: OperatorEthereumProvider[];
  on?(event: string, callback: (...args: unknown[]) => void): void;
  removeListener?(event: string, callback: (...args: unknown[]) => void): void;
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export type WalletConnectionKind = 'injected' | 'walletconnect';
export type WalletSession = {
  provider: ethers.BrowserProvider;
  signer: ethers.JsonRpcSigner;
  address: string;
  chainId: number;
  kind: WalletConnectionKind;
};

export type PendingWithdrawalView = {
  amount: bigint;
  purposeHash: string;
  requestedAt: number;
  executableAt: number;
  expiresAt: number;
  exists: boolean;
};

export type OperatorVaultSnapshot = {
  owner: string;
  token: string;
  tokenSymbol: string;
  chainId: number;
  totalAllocation: bigint;
  totalWithdrawn: bigint;
  vestedAmount: bigint;
  availableToWithdraw: bigint;
  excessAvailable: bigint;
  excessSupported: boolean;
  excessBalance: bigint;
  funded: boolean;
  startTime: number;
  cliffDuration: number;
  intervalDuration: number;
  intervalCount: number;
  cancelWindow: number;
  withdrawalDelay: number;
  executionWindow: number;
  pendingWithdrawal: PendingWithdrawalView;
  currentBlock: number;
};

export function getEthereumProvider(): OperatorEthereumProvider | null {
  const ethereum = (window as Window & { ethereum?: OperatorEthereumProvider }).ethereum ?? null;
  if (!ethereum) return null;

  const providers = Array.isArray(ethereum.providers) ? ethereum.providers : [ethereum];
  return providers.find((provider) => provider.isRabby) ?? providers[0] ?? null;
}

export function getWalletConnectProjectId(): string {
  const env =
    typeof import.meta !== 'undefined' &&
    typeof import.meta.env === 'object' &&
    import.meta.env &&
    'VITE_WALLETCONNECT_PROJECT_ID' in import.meta.env
      ? import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
      : '';

  return typeof env === 'string' ? env.trim() : '';
}

export function walletConnectEnabled(): boolean {
  return getWalletConnectProjectId().length > 0;
}

export async function readOperatorSnapshot(vaultAddress: string): Promise<OperatorVaultSnapshot> {
  const provider = new ethers.JsonRpcProvider(DEFAULT_RPC_URL);
  const currentBlock = await provider.getBlockNumber();
  const contract = new ethers.Contract(vaultAddress, VAULT_ABI, provider);

  const [
    owner,
    token,
    totalAllocation,
    totalWithdrawn,
    vestedAmount,
    availableToWithdraw,
    funded,
    startTime,
    cliffDuration,
    intervalDuration,
    intervalCount,
    cancelWindow,
    withdrawalDelay,
    executionWindow,
    pendingWithdrawal,
    chain,
  ] = await Promise.all([
    contract.owner(),
    contract.token(),
    contract.totalAllocation(),
    contract.totalWithdrawn(),
    contract.vestedAmount(),
    contract.availableToWithdraw(),
    contract.funded(),
    contract.startTime(),
    contract.cliffDuration(),
    contract.intervalDuration(),
    contract.intervalCount(),
    contract.cancelWindow(),
    contract.withdrawalDelay(),
    contract.executionWindow(),
    contract.pendingWithdrawal(),
    provider.getNetwork(),
  ]);

  const tokenContract = new ethers.Contract(token, ERC20_ABI, provider);

  let tokenSymbol = 'TOKEN';
  let tokenBalance = 0n;
  try {
    const [balance, symbol] = await Promise.all([
      tokenContract.balanceOf(vaultAddress),
      tokenContract.symbol().catch(() => 'TOKEN'),
    ]);
    tokenBalance = balance as bigint;
    tokenSymbol = symbol as string;
  } catch {
    tokenBalance = 0n;
  }

  let excessAvailable = 0n;
  let excessSupported = false;
  try {
    excessAvailable = (await contract.excessAvailableToWithdraw()) as bigint;
    excessSupported = true;
  } catch {
    excessAvailable = 0n;
  }

  const remaining = (totalAllocation as bigint) - (totalWithdrawn as bigint);
  const excessBalance = tokenBalance > remaining ? tokenBalance - remaining : 0n;

  return {
    owner: owner as string,
    token: token as string,
    tokenSymbol,
    chainId: Number(chain.chainId),
    totalAllocation: totalAllocation as bigint,
    totalWithdrawn: totalWithdrawn as bigint,
    vestedAmount: vestedAmount as bigint,
    availableToWithdraw: availableToWithdraw as bigint,
    excessAvailable,
    excessSupported,
    excessBalance,
    funded: funded as boolean,
    startTime: Number(startTime),
    cliffDuration: Number(cliffDuration),
    intervalDuration: Number(intervalDuration),
    intervalCount: Number(intervalCount),
    cancelWindow: Number(cancelWindow),
    withdrawalDelay: Number(withdrawalDelay),
    executionWindow: Number(executionWindow),
    pendingWithdrawal: {
      amount: pendingWithdrawal.amount as bigint,
      purposeHash: String(pendingWithdrawal.purposeHash ?? ''),
      requestedAt: Number(pendingWithdrawal.requestedAt ?? 0),
      executableAt: Number(pendingWithdrawal.executableAt ?? 0),
      expiresAt: Number(pendingWithdrawal.expiresAt ?? 0),
      exists: Boolean(pendingWithdrawal.exists),
    },
    currentBlock,
  };
}

type WalletConnectProvider = OperatorEthereumProvider & {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
};

let walletConnectProvider: WalletConnectProvider | null = null;
let activeWalletSession: WalletSession | null = null;

async function getWalletConnectProvider(): Promise<WalletConnectProvider> {
  if (walletConnectProvider) {
    return walletConnectProvider;
  }

  const projectId = getWalletConnectProjectId();
  if (!projectId) {
    throw new Error('WalletConnect is not configured. Set VITE_WALLETCONNECT_PROJECT_ID for iPhone and QR pairing support.');
  }

  const walletConnectModule = await import(/* @vite-ignore */ WALLETCONNECT_CDN_URL);
  walletConnectProvider = (await walletConnectModule.EthereumProvider.init({
    projectId,
    chains: [DEFAULT_OPERATOR_CHAIN_ID],
    optionalChains: [1, 56, 97, 11155111].filter((chainId, index, list) => list.indexOf(chainId) === index && chainId !== DEFAULT_OPERATOR_CHAIN_ID),
    showQrModal: false,
    metadata: {
      name: 'BrigidVault Operator Panel',
      description: 'Operator transactions and Beacon notifications for BrigidVault.',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://brigidforge.com',
      icons: ['https://brigidforge.com/favicon.ico'],
    },
  })) as unknown as WalletConnectProvider;

  return walletConnectProvider;
}

export async function connectWallet(
  kind: WalletConnectionKind,
  options?: {
    onDisplayUri?: (uri: string) => void;
    silent?: boolean;
  },
): Promise<WalletSession>;

export async function connectWallet(
  kind: 'walletconnect',
  options?: {
    onDisplayUri?: (uri: string) => void;
    silent?: boolean;
  },
): Promise<WalletSession>;

export async function connectWallet(kind?: WalletConnectionKind): Promise<WalletSession>;

export async function connectWallet(
  kind: WalletConnectionKind = 'injected',
  options?: {
    onDisplayUri?: (uri: string) => void;
    silent?: boolean;
  },
): Promise<WalletSession> {
  if (activeWalletSession && activeWalletSession.kind === kind) {
    return activeWalletSession;
  }

  let eip1193Provider: OperatorEthereumProvider;

  if (kind === 'walletconnect') {
    const walletConnect = await getWalletConnectProvider();
    walletConnect.on?.('display_uri', (uri: unknown) => {
      if (typeof uri === 'string') {
        options?.onDisplayUri?.(uri);
      }
    });
    if (!options?.silent) {
      await walletConnect.connect();
    }
    eip1193Provider = walletConnect as unknown as OperatorEthereumProvider;
  } else {
    const injected = getEthereumProvider();
    if (!injected) {
      throw new Error('No injected wallet detected. Open the operator panel in a browser wallet session.');
    }

    const accounts = (await injected.request({
      method: options?.silent ? 'eth_accounts' : 'eth_requestAccounts',
    })) as string[];
    if (!accounts?.[0]) {
      throw new Error('No wallet session available.');
    }
    eip1193Provider = injected;
  }

  const provider = new ethers.BrowserProvider(eip1193Provider as ethers.Eip1193Provider);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();

  activeWalletSession = {
    provider,
    signer,
    address,
    chainId: Number(network.chainId),
    kind,
  };

  return activeWalletSession;
}

export async function disconnectWallet(kind: WalletConnectionKind | null): Promise<void> {
  if (kind === 'walletconnect' && walletConnectProvider) {
    await walletConnectProvider.disconnect();
    walletConnectProvider = null;
  }
  activeWalletSession = null;
}

export function getActiveWalletSession(): WalletSession | null {
  return activeWalletSession;
}

export async function requestWithdrawalTx(args: {
  vaultAddress: string;
  signer: ethers.JsonRpcSigner;
  amountInput: string;
  bucket: 'protected' | 'excess';
  purposeText: string;
}): Promise<string> {
  const amount = ethers.parseUnits(args.amountInput, 18);
  const contract = new ethers.Contract(args.vaultAddress, VAULT_ABI, args.signer);
  const purposeHash = ethers.id(args.purposeText);
  const tx =
    args.bucket === 'excess'
      ? await contract.requestExcessWithdrawal(amount, purposeHash)
      : await contract.requestWithdrawal(amount, purposeHash);

  await tx.wait();
  return tx.hash as string;
}

export async function cancelWithdrawalTx(vaultAddress: string, signer: ethers.JsonRpcSigner): Promise<string> {
  const contract = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
  const tx = await contract.cancelWithdrawal();
  await tx.wait();
  return tx.hash as string;
}

export async function executeWithdrawalTx(vaultAddress: string, signer: ethers.JsonRpcSigner): Promise<string> {
  const contract = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
  const tx = await contract.executeWithdrawal();
  await tx.wait();
  return tx.hash as string;
}
