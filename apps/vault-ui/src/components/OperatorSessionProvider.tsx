import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchOperatorOwnedVaults, type OperatorOwnedVaultsResponse } from '../lib/api';
import {
  connectWallet,
  disconnectWallet,
  getActiveWalletSession,
  refreshActiveWalletSession,
  switchToOperatorChain,
  subscribeActiveWalletSession,
  walletConnectEnabled,
  type WalletConnectionKind,
  type WalletSession,
} from '../lib/operatorVault';

const WALLET_SESSION_STORAGE_KEY = 'brigid-operator-wallet-session';

const NO_VAULTS_MESSAGE =
  'No vaults found for this wallet address. Connect using the wallet that was used to create the vault (or that holds vault ownership).\n\n' +
  'Before trying again, clear this site\'s access in your wallet: open your wallet → Connected sites or Permissions → find this site → Disconnect.';

type OperatorSessionContextValue = {
  walletSession: WalletSession | null;
  walletBusy: boolean;
  walletError: string | null;
  walletMessage: string | null;
  walletConnectUri: string | null;
  walletConnectStatus: string | null;
  ownedVaults: OperatorOwnedVaultsResponse | null;
  ownedVaultsLoading: boolean;
  ensureWallet: (kind?: WalletConnectionKind) => Promise<WalletSession>;
  switchChain: () => Promise<void>;
  handleDisconnect: () => Promise<void>;
  clearWalletFeedback: () => void;
  walletConnectAvailable: boolean;
  refreshOwnedVaults: () => Promise<void>;
};

const OperatorSessionContext = createContext<OperatorSessionContextValue | null>(null);

function storeWalletSession(kind: WalletConnectionKind) {
  try {
    window.localStorage.setItem(WALLET_SESSION_STORAGE_KEY, kind);
  } catch {
    // Ignore local storage failures.
  }
}

function readStoredWalletSession(): WalletConnectionKind | null {
  try {
    const raw = window.localStorage.getItem(WALLET_SESSION_STORAGE_KEY);
    if (raw === 'injected' || raw === 'walletconnect') {
      return raw;
    }
  } catch {
    // Ignore local storage failures.
  }
  return null;
}

function clearStoredWalletSession() {
  try {
    window.localStorage.removeItem(WALLET_SESSION_STORAGE_KEY);
  } catch {
    // Ignore local storage failures.
  }
}

export function OperatorSessionProvider(props: { children: ReactNode }) {
  const [walletSession, setWalletSession] = useState<WalletSession | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletMessage, setWalletMessage] = useState<string | null>(null);
  const [walletConnectUri, setWalletConnectUri] = useState<string | null>(null);
  const [walletConnectStatus, setWalletConnectStatus] = useState<string | null>(null);
  const [ownedVaults, setOwnedVaults] = useState<OperatorOwnedVaultsResponse | null>(null);
  const [ownedVaultsLoading, setOwnedVaultsLoading] = useState(false);

  async function restoreStoredSession(kind: WalletConnectionKind) {
    const session = await connectWallet(kind, { silent: true });
    const vaults = await loadOwnedVaults(session.address);
    if (vaults.vaults.length === 0) {
      await disconnectWallet(session.kind);
      clearStoredWalletSession();
      setOwnedVaults(null);
      setWalletError(NO_VAULTS_MESSAGE);
      return;
    }
    setWalletSession(session);
    setWalletConnectStatus(null);
    setWalletConnectUri(null);
    setWalletError(null);
    setWalletMessage(null);
  }

  async function loadOwnedVaults(ownerAddress: string) {
    setOwnedVaultsLoading(true);
    try {
      const nextVaults = await fetchOperatorOwnedVaults(ownerAddress);
      setOwnedVaults(nextVaults);
      setWalletError(null);
      return nextVaults;
    } catch (err) {
      setOwnedVaults(null);
      const nextError = err instanceof Error ? err.message : String(err);
      setWalletError(nextError);
      throw err;
    } finally {
      setOwnedVaultsLoading(false);
    }
  }

  useEffect(() => {
    return subscribeActiveWalletSession((session) => {
      setWalletSession(session);
    });
  }, []);

  useEffect(() => {
    const existingSession = getActiveWalletSession();
    if (existingSession) {
      void loadOwnedVaults(existingSession.address).then((vaults) => {
        if (vaults.vaults.length > 0) {
          setWalletSession(existingSession);
        } else {
          void disconnectWallet(existingSession.kind);
          clearStoredWalletSession();
          setOwnedVaults(null);
          setWalletError(NO_VAULTS_MESSAGE);
        }
      }).catch(() => undefined);
      return;
    }

    const storedKind = readStoredWalletSession();
    if (!storedKind) return;

    if (storedKind === 'walletconnect') {
      setWalletConnectStatus('Reconnecting to WalletConnect...');
    }

    void restoreStoredSession(storedKind).catch(() => {
      if (storedKind === 'walletconnect') {
        setWalletConnectStatus('Waiting for wallet session to return...');
        return;
      }
      clearStoredWalletSession();
      setOwnedVaults(null);
    });
  }, []);

  useEffect(() => {
    function shouldRetry() {
      return !walletSession && readStoredWalletSession() === 'walletconnect';
    }

    function retryRestore() {
      if (!shouldRetry()) return;
      setWalletConnectStatus('Reconnecting to WalletConnect...');
      void restoreStoredSession('walletconnect').catch(() => {
        setWalletConnectStatus('Waiting for wallet session to return...');
      });
    }

    function syncActiveSession() {
      const existingSession = getActiveWalletSession();
      if (!existingSession) return;
      void refreshActiveWalletSession().catch(() => undefined);
    }

    function refreshVaultSummaries() {
      const existingSession = getActiveWalletSession();
      if (!existingSession) return;
      void loadOwnedVaults(existingSession.address).catch(() => undefined);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        retryRestore();
        syncActiveSession();
        refreshVaultSummaries();
      }
    }

    window.addEventListener('pageshow', retryRestore);
    window.addEventListener('focus', retryRestore);
    window.addEventListener('pageshow', syncActiveSession);
    window.addEventListener('focus', syncActiveSession);
    window.addEventListener('pageshow', refreshVaultSummaries);
    window.addEventListener('focus', refreshVaultSummaries);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pageshow', retryRestore);
      window.removeEventListener('focus', retryRestore);
      window.removeEventListener('pageshow', syncActiveSession);
      window.removeEventListener('focus', syncActiveSession);
      window.removeEventListener('pageshow', refreshVaultSummaries);
      window.removeEventListener('focus', refreshVaultSummaries);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [walletSession]);

  async function ensureWallet(kind: WalletConnectionKind = walletSession?.kind ?? 'injected') {
    if (walletSession && walletSession.kind === kind) {
      try {
        return await refreshActiveWalletSession();
      } catch {
        await disconnectWallet(kind).catch(() => undefined);
        clearStoredWalletSession();
        setWalletSession(null);
      }
    }

    setWalletBusy(true);
    try {
      if (kind === 'walletconnect') {
        setWalletConnectStatus('Preparing WalletConnect pairing...');
        setWalletConnectUri(null);
      }

      // Store the WalletConnect intent before connect() so that if iOS Safari
      // refreshes the page when the user switches back from their wallet, the
      // startup effect can silently re-attach to WalletConnect's own persisted
      // session instead of dropping back to the login screen.
      if (kind === 'walletconnect') {
        storeWalletSession('walletconnect');
      }

      const session =
        kind === 'walletconnect'
          ? await connectWallet(kind, {
              onDisplayUri: (uri) => {
                setWalletConnectUri(uri);
                setWalletConnectStatus('Pairing URI ready.');
                setWalletMessage('Approve the WalletConnect pairing in your iPhone wallet, or copy the URI below.');
              },
            })
          : await connectWallet(kind);

      setWalletConnectUri(null);
      setWalletConnectStatus(null);
      setWalletError(null);
      setWalletMessage(null);
      const vaults = await loadOwnedVaults(session.address);
      if (vaults.vaults.length === 0) {
        await disconnectWallet(session.kind);
        clearStoredWalletSession();
        setOwnedVaults(null);
        throw new Error(NO_VAULTS_MESSAGE);
      }
      setWalletSession(session);
      storeWalletSession(session.kind);
      return session;
    } catch (err) {
      clearStoredWalletSession();
      const nextError = err instanceof Error ? err.message : String(err);
      setWalletError(
        kind === 'walletconnect'
          ? `${nextError} If WalletConnect still fails here, clear this site's connection in your wallet and try again.`
          : nextError,
      );
      throw err;
    } finally {
      setWalletBusy(false);
    }
  }

  async function switchChain() {
    setWalletBusy(true);
    try {
      const updated = await switchToOperatorChain();
      setWalletSession(updated);
      setWalletError(null);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setWalletBusy(false);
    }
  }

  async function handleDisconnect() {
    await disconnectWallet(walletSession?.kind ?? null);
    clearStoredWalletSession();
    setWalletSession(null);
    setOwnedVaults(null);
    setWalletConnectUri(null);
    setWalletConnectStatus(null);
    setWalletError(null);
    setWalletMessage(null);
  }

  function clearWalletFeedback() {
    setWalletError(null);
    setWalletMessage(null);
  }

  async function refreshOwnedVaults() {
    const session = walletSession;
    if (!session) return;
    await loadOwnedVaults(session.address).catch(() => undefined);
  }

  const value = useMemo<OperatorSessionContextValue>(
    () => ({
      walletSession,
      walletBusy,
      walletError,
      walletMessage,
      walletConnectUri,
      walletConnectStatus,
      ownedVaults,
      ownedVaultsLoading,
      ensureWallet,
      switchChain,
      handleDisconnect,
      clearWalletFeedback,
      walletConnectAvailable: walletConnectEnabled(),
      refreshOwnedVaults,
    }),
    [
      ownedVaults,
      ownedVaultsLoading,
      walletBusy,
      walletConnectStatus,
      walletConnectUri,
      walletError,
      walletMessage,
      walletSession,
    ],
  );

  return <OperatorSessionContext.Provider value={value}>{props.children}</OperatorSessionContext.Provider>;
}

export function useOperatorSession() {
  const value = useContext(OperatorSessionContext);
  if (!value) {
    throw new Error('useOperatorSession must be used within OperatorSessionProvider.');
  }
  return value;
}
