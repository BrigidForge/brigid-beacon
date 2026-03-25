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

// WalletConnect routes read calls (eth_estimateGas, eth_call) through rpcMap
// rather than the WC relay. Using the same URL as DEFAULT_RPC_URL risks tx
// estimation failures if the configured RPC has allowlist restrictions (e.g.
// dRPC rejects requests without a matching Origin), which prevents the signing
// request from ever reaching MetaMask. Use a hardcoded reliable public endpoint
// for WC's internal reads only — signing still goes through the WC relay.
const WC_FALLBACK_RPC_URL = 'https://bsc-testnet.publicnode.com';

export const DEFAULT_OPERATOR_CHAIN_ID = Number(
  (typeof import.meta !== 'undefined' &&
  typeof import.meta.env === 'object' &&
  import.meta.env &&
  'VITE_OPERATOR_CHAIN_ID' in import.meta.env
    ? import.meta.env.VITE_OPERATOR_CHAIN_ID
    : '') || '97',
);

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

const tokenSymbolCache = new Map<string, string>();

export async function fetchTokenSymbol(tokenAddress: string): Promise<string> {
  const key = tokenAddress.toLowerCase();
  if (tokenSymbolCache.has(key)) return tokenSymbolCache.get(key)!;
  try {
    const provider = new ethers.JsonRpcProvider(DEFAULT_RPC_URL, undefined, { batchMaxCount: 1 });
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const symbol = await (contract.symbol() as Promise<string>);
    tokenSymbolCache.set(key, symbol);
    return symbol;
  } catch {
    return '';
  }
}

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
  transport: OperatorEthereumProvider;
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
  const provider = new ethers.JsonRpcProvider(DEFAULT_RPC_URL, undefined, { batchMaxCount: 1 });
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
  connect(opts?: { chains?: number[]; optionalChains?: number[] }): Promise<void>;
  disconnect(): Promise<void>;
  signer?: {
    uri?: string;
  };
  session?: {
    peer?: { metadata?: { redirect?: { native?: string; universal?: string } } };
  };
};

let walletConnectProvider: WalletConnectProvider | null = null;
let activeWalletSession: WalletSession | null = null;
let walletConnectDisplayUriHandlerBound = false;
let walletConnectDisplayUriCallback: ((uri: string) => void) | undefined;
const activeWalletSessionListeners = new Set<(session: WalletSession | null) => void>();
const boundSessionProviders = new WeakSet<object>();

function setActiveWalletSession(session: WalletSession | null): WalletSession | null {
  activeWalletSession = session;
  for (const listener of activeWalletSessionListeners) {
    listener(session);
  }
  return session;
}

function bindSessionProviderEvents(provider: OperatorEthereumProvider): void {
  if (typeof provider !== 'object' || provider == null || boundSessionProviders.has(provider as object)) {
    return;
  }

  provider.on?.('accountsChanged', () => {
    void refreshActiveWalletSession().catch(() => {
      setActiveWalletSession(null);
    });
  });
  provider.on?.('chainChanged', () => {
    void refreshActiveWalletSession().catch(() => {
      setActiveWalletSession(null);
    });
  });
  provider.on?.('disconnect', () => {
    setActiveWalletSession(null);
  });
  boundSessionProviders.add(provider as object);
}

async function buildWalletSession(
  transport: OperatorEthereumProvider,
  kind: WalletConnectionKind,
): Promise<WalletSession> {
  bindSessionProviderEvents(transport);
  const provider = new ethers.BrowserProvider(transport as ethers.Eip1193Provider);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();

  return {
    provider,
    signer,
    address,
    chainId: Number(network.chainId),
    kind,
    transport,
  };
}

async function getWalletConnectProvider(): Promise<WalletConnectProvider> {
  if (walletConnectProvider) {
    return walletConnectProvider;
  }

  const projectId = getWalletConnectProjectId();
  if (!projectId) {
    throw new Error('WalletConnect is not configured. Set VITE_WALLETCONNECT_PROJECT_ID for iPhone and QR pairing support.');
  }

  const walletConnectModule = await import('@walletconnect/ethereum-provider');
  const EthereumProvider = walletConnectModule.EthereumProvider ?? walletConnectModule.default;
  if (!EthereumProvider?.init) {
    throw new Error('WalletConnect provider module loaded without EthereumProvider support.');
  }

  walletConnectProvider = (await EthereumProvider.init({
    projectId,
    // Require the Beacon operator chain up front so WalletConnect sessions
    // are negotiated for BSC testnet instead of inheriting an arbitrary
    // active network from the wallet.
    chains: [DEFAULT_OPERATOR_CHAIN_ID],
    rpcMap: {
      [DEFAULT_OPERATOR_CHAIN_ID]: WC_FALLBACK_RPC_URL,
    },
    showQrModal: false,
    methods: [
      'eth_sendTransaction',
      'personal_sign',
      'eth_sign',
      'eth_signTypedData',
      'eth_signTypedData_v4',
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
    ],
    events: ['accountsChanged', 'chainChanged', 'disconnect'],
    metadata: {
      name: 'BrigidVault',
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
    return refreshActiveWalletSession();
  }

  let eip1193Provider: OperatorEthereumProvider;

  if (kind === 'walletconnect') {
    const walletConnect = await getWalletConnectProvider();
    if (!walletConnectDisplayUriHandlerBound) {
      walletConnect.on?.('display_uri', (uri: unknown) => {
        if (typeof uri === 'string') {
          walletConnectDisplayUriCallback?.(uri);
        }
      });
      walletConnect.on?.('disconnect', () => {
        setActiveWalletSession(null);
      });
      walletConnectDisplayUriHandlerBound = true;
    }
    const onDisplayUri = options?.onDisplayUri;
    walletConnectDisplayUriCallback = onDisplayUri;
    if (!options?.silent) {
      let connectUriSeen = false;
      const emitUri = (uri: string) => {
        if (!connectUriSeen) {
          connectUriSeen = true;
        }
        onDisplayUri?.(uri);
      };
      walletConnectDisplayUriCallback = emitUri;

      const uriPollPromise = new Promise<void>((resolve) => {
        const startedAt = Date.now();
        const timer = window.setInterval(() => {
          const uri = walletConnect.signer?.uri;
          if (typeof uri === 'string' && uri.length > 0) {
            window.clearInterval(timer);
            emitUri(uri);
            resolve();
            return;
          }
          if (Date.now() - startedAt >= 10_000) {
            window.clearInterval(timer);
            resolve();
          }
        }, 200);
      });

      const connectPromise = walletConnect.connect({
        chains: [DEFAULT_OPERATOR_CHAIN_ID],
      });
      await Promise.race([
        connectPromise,
        new Promise<never>((_, reject) => {
          window.setTimeout(() => {
            reject(new Error('WalletConnect pairing timed out before the pairing link became available. Clear this site in your wallet and try again.'));
          }, 30_000);
        }),
      ]).catch(async (error) => {
        await walletConnect.disconnect().catch(() => undefined);
        walletConnectProvider = null;
        walletConnectDisplayUriHandlerBound = false;
        walletConnectDisplayUriCallback = undefined;
        throw error;
      });
      await uriPollPromise;
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

  return setActiveWalletSession(await buildWalletSession(eip1193Provider, kind))!;
}

export async function disconnectWallet(kind: WalletConnectionKind | null): Promise<void> {
  if (kind === 'walletconnect' && walletConnectProvider) {
    await walletConnectProvider.disconnect();
    walletConnectProvider = null;
    walletConnectDisplayUriHandlerBound = false;
    walletConnectDisplayUriCallback = undefined;
  }
  setActiveWalletSession(null);
}

export function getActiveWalletSession(): WalletSession | null {
  return activeWalletSession;
}

export function subscribeActiveWalletSession(
  listener: (session: WalletSession | null) => void,
): () => void {
  activeWalletSessionListeners.add(listener);
  return () => {
    activeWalletSessionListeners.delete(listener);
  };
}

export async function refreshActiveWalletSession(): Promise<WalletSession> {
  if (!activeWalletSession) {
    throw new Error('No active wallet session.');
  }

  return setActiveWalletSession(
    await buildWalletSession(activeWalletSession.transport, activeWalletSession.kind),
  )!;
}

// Chain params used by wallet_addEthereumChain if BSC testnet isn't in the wallet yet.
const BSC_TESTNET_CHAIN_PARAMS = {
  chainId: '0x' + DEFAULT_OPERATOR_CHAIN_ID.toString(16),
  chainName: 'BNB Smart Chain Testnet',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: [DEFAULT_RPC_URL],
  blockExplorerUrls: ['https://testnet.bscscan.com'],
};

// Requests a chain switch to DEFAULT_OPERATOR_CHAIN_ID and updates the active session.
// Throws if the user rejects or the switch fails.
export async function switchToOperatorChain(): Promise<WalletSession> {
  if (!activeWalletSession) throw new Error('No active wallet session.');
  const hexChainId = '0x' + DEFAULT_OPERATOR_CHAIN_ID.toString(16);
  try {
    await activeWalletSession.transport.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    });
  } catch (err: unknown) {
    // 4902 = chain not yet added to wallet — add it first, then switch.
    if ((err as { code?: number }).code === 4902) {
      await activeWalletSession.transport.request({
        method: 'wallet_addEthereumChain',
        params: [BSC_TESTNET_CHAIN_PARAMS],
      });
      await activeWalletSession.transport.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      });
    } else {
      throw err;
    }
  }
  return refreshActiveWalletSession();
}

export async function ensureExpectedChain(expectedChainId: number): Promise<WalletSession> {
  let session = await refreshActiveWalletSession();
  if (session.chainId === expectedChainId) {
    return session;
  }

  if (expectedChainId !== DEFAULT_OPERATOR_CHAIN_ID) {
    throw new Error(`Unsupported vault chain ${expectedChainId}.`);
  }

  session = await switchToOperatorChain();
  if (session.chainId !== expectedChainId) {
    throw new Error(`Wrong network. Please switch to ${NETWORK_NAMES[expectedChainId] ?? `Chain ${expectedChainId}`}.`);
  }

  return session;
}

// Returns the WalletConnect session deep-link URL, or null if unavailable.
export function getWalletOpenUrl(session: WalletSession): string | null {
  if (session.kind !== 'walletconnect' || !walletConnectProvider) return null;
  const redirect = walletConnectProvider.session?.peer?.metadata?.redirect;
  return redirect?.native ?? redirect?.universal ?? null;
}

export function walletNeedsSigningAssist(session: WalletSession): boolean {
  if (session.kind !== 'walletconnect' || typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent ?? '';
  const touchMac =
    typeof navigator.platform === 'string' &&
    navigator.platform === 'MacIntel' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/i.test(userAgent) || touchMac;
}

let walletOpenTimer: number | null = null;

export function clearWalletOpenTimer(): void {
  if (walletOpenTimer != null && typeof window !== 'undefined') {
    window.clearTimeout(walletOpenTimer);
  }
  walletOpenTimer = null;
}

export function getWalletApprovalAssistUrl(session: WalletSession): string | null {
  return getWalletOpenUrl(session);
}

// Schedules a same-tab handoff back into the connected wallet app after the
// WalletConnect request has been started from the page.
export function openWalletForSigning(session: WalletSession, delayMs = 5_000): string | null {
  clearWalletOpenTimer();
  const redirect = getWalletOpenUrl(session);
  if (!redirect || typeof window === 'undefined' || !walletNeedsSigningAssist(session)) {
    return redirect;
  }

  walletOpenTimer = window.setTimeout(() => {
    walletOpenTimer = null;
    window.location.assign(redirect);
  }, delayMs);

  return redirect;
}

// Waits for a transaction receipt using a direct RPC provider rather than
// the WalletConnect signer, so mining confirmation works even if the
// WalletConnect connection is disrupted when the user returns from the wallet.
async function waitForTx(hash: string): Promise<void> {
  const provider = new ethers.JsonRpcProvider(DEFAULT_RPC_URL, undefined, { batchMaxCount: 1 });
  await provider.waitForTransaction(hash);
}

export async function requestWithdrawalTx(args: {
  vaultAddress: string;
  signer: ethers.JsonRpcSigner;
  amountInput: string;
  bucket: 'protected' | 'excess';
  purposeText: string;
  onSubmitted?: (hash: string) => void;
}): Promise<string> {
  const amount = ethers.parseUnits(args.amountInput, 18);
  const contract = new ethers.Contract(args.vaultAddress, VAULT_ABI, args.signer);
  const purposeHash = ethers.id(args.purposeText);
  const tx =
    args.bucket === 'excess'
      ? await contract.requestExcessWithdrawal(amount, purposeHash)
      : await contract.requestWithdrawal(amount, purposeHash);

  const hash = tx.hash as string;
  args.onSubmitted?.(hash);
  await waitForTx(hash);
  return hash;
}

export async function cancelWithdrawalTx(
  vaultAddress: string,
  signer: ethers.JsonRpcSigner,
  onSubmitted?: (hash: string) => void,
): Promise<string> {
  const contract = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
  const tx = await contract.cancelWithdrawal();
  const hash = tx.hash as string;
  onSubmitted?.(hash);
  await waitForTx(hash);
  return hash;
}

export async function executeWithdrawalTx(
  vaultAddress: string,
  signer: ethers.JsonRpcSigner,
  onSubmitted?: (hash: string) => void,
): Promise<string> {
  const contract = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
  const tx = await contract.executeWithdrawal();
  const hash = tx.hash as string;
  onSubmitted?.(hash);
  await waitForTx(hash);
  return hash;
}
