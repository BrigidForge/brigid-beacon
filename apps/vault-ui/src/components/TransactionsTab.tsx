import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { NormalizedEvent } from '@brigid/beacon-shared-types';
import { ethers } from 'ethers';
import { getStoredOwnerSession, saveWithdrawalPurpose } from '../lib/api';
import { formatDurationSeconds, formatTokenAmount, formatUnixSeconds, shortenAddress } from '../lib/format';
import {
  clearWalletOpenTimer,
  cancelWithdrawalTx,
  DEFAULT_OPERATOR_CHAIN_ID,
  executeWithdrawalTx,
  EXPLORERS,
  getWalletApprovalAssistUrl,
  openWalletForSigning,
  readOperatorSnapshot,
  requestWithdrawalTx,
  switchToOperatorChain,
  walletNeedsSigningAssist,
  type OperatorVaultSnapshot,
  type WalletSession,
  type WalletConnectionKind,
} from '../lib/operatorVault';
import { TimelineComponent } from './TimelineComponent';

type RequestLifecycleView = {
  amount: bigint;
  purposeHash: string;
  requestedAt: number;
  executableAt: number;
  expiresAt: number;
  requestType: 'protected' | 'excess';
  outcome: 'active' | 'canceled' | 'executed' | 'expired';
  settledAt: number | null;
};

function DisabledWalletHint(props: { enabled: boolean; children: ReactNode; className?: string }) {
  if (props.enabled) return <>{props.children}</>;
  return (
    <div className={props.className ?? 'group relative inline-flex'}>
      {props.children}
      <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max max-w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-xs font-medium text-white opacity-0 shadow-[0_18px_40px_rgba(15,23,42,0.45)] transition duration-150 group-hover:opacity-100">
        Wallet not connected.
      </div>
    </div>
  );
}

function parseEventSeconds(value: unknown): number {
  if (typeof value === 'string' || typeof value === 'number') return Number(value);
  return 0;
}

function deriveLatestRequestLifecycle(events: NormalizedEvent[], snapshot: OperatorVaultSnapshot | null, nowSeconds: number): RequestLifecycleView | null {
  const sortedEvents = [...events].sort((a, b) => {
    const blockCmp = a.blockNumber - b.blockNumber;
    return blockCmp !== 0 ? blockCmp : a.logIndex - b.logIndex;
  });

  const requests = sortedEvents.filter((e) => e.kind === 'protected_withdrawal_requested' || e.kind === 'excess_withdrawal_requested');
  const latestRequest = requests.at(-1);

  const pendingSnapshotRequest = snapshot?.pendingWithdrawal.exists
    ? { amount: snapshot.pendingWithdrawal.amount, purposeHash: snapshot.pendingWithdrawal.purposeHash, requestedAt: snapshot.pendingWithdrawal.requestedAt, executableAt: snapshot.pendingWithdrawal.executableAt, expiresAt: snapshot.pendingWithdrawal.expiresAt, requestType: 'protected' as const, outcome: 'active' as const, settledAt: null }
    : null;

  if (!latestRequest) return pendingSnapshotRequest;

  const payload = latestRequest.payload as unknown as Record<string, unknown>;
  const purposeHash = String(payload.purposeHash ?? '');
  const terminalEvent = [...sortedEvents].reverse().find((e) => {
    if (!['withdrawal_canceled', 'withdrawal_executed', 'request_expired'].includes(e.kind)) return false;
    const tp = e.payload as unknown as Record<string, unknown>;
    return String(tp.purposeHash ?? '') === purposeHash;
  });

  const requestType = latestRequest.kind === 'protected_withdrawal_requested' ? ('protected' as const) : ('excess' as const);
  const requestedAt = parseEventSeconds(payload.requestedAt);
  const executableAt = parseEventSeconds(payload.executableAt);
  const expiresAt = parseEventSeconds(payload.expiresAt);
  const cancelEndsAt = snapshot ? requestedAt + snapshot.cancelWindow : requestedAt;

  let outcome: RequestLifecycleView['outcome'] = 'active';
  let settledAt: number | null = null;

  if (terminalEvent) {
    const tp = terminalEvent.payload as unknown as Record<string, unknown>;
    if (terminalEvent.kind === 'withdrawal_canceled') { outcome = 'canceled'; settledAt = parseEventSeconds(tp.canceledAt); }
    else if (terminalEvent.kind === 'withdrawal_executed') { outcome = 'executed'; settledAt = parseEventSeconds(tp.executedAt); }
    else { outcome = 'expired'; settledAt = parseEventSeconds(tp.expiredAt); }
  } else if (snapshot?.pendingWithdrawal.exists && snapshot.pendingWithdrawal.purposeHash.toLowerCase() === purposeHash.toLowerCase()) {
    outcome = 'active';
  } else if (snapshot && !snapshot.pendingWithdrawal.exists) {
    if (expiresAt <= nowSeconds) {
      outcome = 'expired'; settledAt = expiresAt;
    } else if (nowSeconds < cancelEndsAt) {
      outcome = 'canceled'; settledAt = nowSeconds;
    } else {
      outcome = 'executed'; settledAt = nowSeconds;
    }
  } else if (expiresAt <= nowSeconds) {
    outcome = 'expired'; settledAt = expiresAt;
  }

  const derivedRequest = { amount: BigInt(String(payload.amount ?? '0')), purposeHash, requestedAt, executableAt, expiresAt, requestType, outcome, settledAt };

  if (pendingSnapshotRequest && (pendingSnapshotRequest.purposeHash.toLowerCase() !== derivedRequest.purposeHash.toLowerCase() || pendingSnapshotRequest.requestedAt >= derivedRequest.requestedAt)) {
    return pendingSnapshotRequest;
  }
  return derivedRequest;
}

function readStoredPurpose(hash: string): string {
  if (!hash) return '';
  try { return window.localStorage.getItem(`brigidPurpose:${hash.toLowerCase()}`) ?? ''; }
  catch { return ''; }
}

function storePurpose(hash: string, text: string) {
  if (!hash || !text) return;
  try { window.localStorage.setItem(`brigidPurpose:${hash.toLowerCase()}`, text); }
  catch { /* ignore */ }
}

export function TransactionsTab(props: {
  vaultAddress: string;
  indexedOwnerAddress: string;
  events: NormalizedEvent[];
  purposeTexts: Record<string, string>;
  walletSession: WalletSession | null;
  onRequireWallet: (kind?: WalletConnectionKind) => Promise<WalletSession>;
}) {
  const [snapshot, setSnapshot] = useState<OperatorVaultSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [purposeInput, setPurposeInput] = useState('');
  const [withdrawalType, setWithdrawalType] = useState<'protected' | 'excess'>('protected');
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const [requestOverride, setRequestOverride] = useState<RequestLifecycleView | null>(null);
  const [walletApproveUrl, setWalletApproveUrl] = useState<string | null>(null);
  const [walletCountdown, setWalletCountdown] = useState<number | null>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const walletCountdownTimerRef = useRef<number | null>(null);

  // Must be called synchronously before the first await in a click handler.
  // For iOS WalletConnect, open the handoff page in a trusted user gesture
  // so Safari allows the deep link back into the wallet app.
  function startWalletApprovalFlow(session: WalletSession) {
    const assistUrl = getWalletApprovalAssistUrl(session);
    setWalletApproveUrl(assistUrl);
    if (assistUrl && walletNeedsSigningAssist(session)) {
      setWalletCountdown(5);
      if (walletCountdownTimerRef.current != null) {
        window.clearInterval(walletCountdownTimerRef.current);
      }
      walletCountdownTimerRef.current = window.setInterval(() => {
        setWalletCountdown((current) => {
          if (current == null || current <= 1) {
            if (walletCountdownTimerRef.current != null) {
              window.clearInterval(walletCountdownTimerRef.current);
            }
            walletCountdownTimerRef.current = null;
            return null;
          }
          return current - 1;
        });
      }, 1_000);
      openWalletForSigning(session, 5_000);
      return;
    }
    setWalletCountdown(null);
    openWalletForSigning(session);
  }

  function clearWalletApprovalFlow() {
    clearWalletOpenTimer();
    if (walletCountdownTimerRef.current != null) {
      window.clearInterval(walletCountdownTimerRef.current);
    }
    walletCountdownTimerRef.current = null;
    setWalletCountdown(null);
    setWalletApproveUrl(null);
  }

  useEffect(() => () => {
    if (walletCountdownTimerRef.current != null) {
      window.clearInterval(walletCountdownTimerRef.current);
    }
  }, []);

  async function persistPurposeText(purposeHash: string, purposeText: string) {
    const storedSession = getStoredOwnerSession();
    if (!storedSession || storedSession.ownerAddress.toLowerCase() !== props.indexedOwnerAddress.toLowerCase()) {
      return;
    }

    await saveWithdrawalPurpose({
      sessionToken: storedSession.sessionToken,
      vaultAddress: props.vaultAddress,
      purposeHash,
      purposeText,
    });
  }

  function restoreScrollPosition() {
    if (pendingScrollRestoreRef.current == null) return;
    const targetY = pendingScrollRestoreRef.current;
    pendingScrollRestoreRef.current = null; // clear so a second call after layout changes is a no-op
    const restore = () => { window.scrollTo({ top: targetY, behavior: 'auto' }); };
    restore(); window.setTimeout(restore, 0); window.setTimeout(restore, 120); window.setTimeout(restore, 300);
  }
  function preserveScrollPosition() { pendingScrollRestoreRef.current = window.scrollY; }

  async function refresh(options?: { background?: boolean }) {
    const background = options?.background ?? false;
    if (!background) setLoading(true);
    try {
      const nextSnapshot = await readOperatorSnapshot(props.vaultAddress);
      setSnapshot(nextSnapshot); setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (!background) setSnapshot(null);
    } finally { if (!background) setLoading(false); }
  }

  useEffect(() => {
    void refresh();
    const refreshTimer = window.setInterval(() => { void refresh({ background: true }); }, 30_000);
    const clockTimer = window.setInterval(() => { setNowSeconds(Math.floor(Date.now() / 1000)); }, 1_000);
    return () => { window.clearInterval(refreshTimer); window.clearInterval(clockTimer); };
  }, [props.vaultAddress]);

  useEffect(() => {
    function handleReturnToApp() {
      restoreScrollPosition();
      void refresh({ background: true });
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        handleReturnToApp();
      }
    }
    function handlePageShow() { handleReturnToApp(); }
    function handleFocus() { handleReturnToApp(); }
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const selectedAvailable = useMemo(() => {
    if (!snapshot) return 0n;
    return withdrawalType === 'excess' ? snapshot.excessAvailable : snapshot.availableToWithdraw;
  }, [snapshot, withdrawalType]);

  const derivedLatestRequest = useMemo(() => deriveLatestRequestLifecycle(props.events, snapshot, nowSeconds), [props.events, snapshot, nowSeconds]);
  const latestRequest = requestOverride ?? derivedLatestRequest;
  const currentRequest = latestRequest?.outcome === 'active' ? latestRequest : null;
  const pending = currentRequest != null && currentRequest.expiresAt > nowSeconds;
  const cancelEnd = pending && currentRequest && snapshot ? currentRequest.requestedAt + snapshot.cancelWindow : 0;
  const state = !pending || !snapshot || !currentRequest
    ? 'idle'
    : nowSeconds < cancelEnd ? 'cancel'
    : nowSeconds < currentRequest.executableAt ? 'delay'
    : nowSeconds < currentRequest.expiresAt ? 'exec'
    : 'expired';

  useEffect(() => {
    if (!requestOverride) return;
    if (derivedLatestRequest && (derivedLatestRequest.requestedAt > requestOverride.requestedAt || (derivedLatestRequest.purposeHash.toLowerCase() === requestOverride.purposeHash.toLowerCase() && derivedLatestRequest.outcome === requestOverride.outcome))) {
      setRequestOverride(null);
    }
  }, [derivedLatestRequest, requestOverride]);

  const walletConnected = props.walletSession != null;
  const walletMatchesOwner = props.walletSession?.address != null && props.walletSession.address.toLowerCase() === props.indexedOwnerAddress.toLowerCase();
  const storedOwnerSession = getStoredOwnerSession();
  const hasActiveBeaconSession =
    storedOwnerSession != null &&
    storedOwnerSession.ownerAddress.toLowerCase() === props.indexedOwnerAddress.toLowerCase() &&
    Date.parse(storedOwnerSession.expiresAt) > Date.now();

  const canRequest = snapshot != null && walletConnected && hasActiveBeaconSession && !pending && amountInput.trim().length > 0 && purposeInput.trim().length > 0;
  const requestButtonDisabled = !canRequest || busy || (() => { try { return ethers.parseUnits(amountInput || '0', 18) > selectedAvailable; } catch { return true; } })();

  async function ensureCorrectChain(connection: WalletSession): Promise<WalletSession> {
    if (!snapshot || connection.chainId === snapshot.chainId) return connection;

    if (snapshot.chainId !== DEFAULT_OPERATOR_CHAIN_ID) {
      throw new Error(`Unsupported vault chain ${snapshot.chainId}.`);
    }

    setMessage('Switching wallet to BNB Smart Chain Testnet...');
    const chainSwitchUrl = getWalletApprovalAssistUrl(connection);
    if (chainSwitchUrl) setWalletApproveUrl(chainSwitchUrl);
    try {
      const updated = await switchToOperatorChain();
      return updated;
    } finally {
      setWalletApproveUrl(null);
    }
  }

  async function handleRequestWithdrawal() {
    if (!props.walletSession?.address || !canRequest) return;
    let connection = props.walletSession;
    preserveScrollPosition(); setBusy(true); setError(null); setMessage(null);
    try {
      connection = await ensureCorrectChain(connection);
      const purposeHash = ethers.id(purposeInput.trim());
      storePurpose(purposeHash, purposeInput.trim());
      await persistPurposeText(purposeHash, purposeInput.trim()).catch(() => undefined);
      const txHashPromise = requestWithdrawalTx({
        vaultAddress: props.vaultAddress,
        signer: connection.signer,
        amountInput: amountInput.trim(),
        bucket: withdrawalType,
        purposeText: purposeInput.trim(),
        onSubmitted: (hash) => {
          clearWalletApprovalFlow();
          setMessage(`Transaction submitted (${hash.slice(0, 10)}…). Waiting for confirmation...`);
        },
      });
      startWalletApprovalFlow(connection);
      const txHash = await txHashPromise;
      const refreshedSnapshot = await readOperatorSnapshot(props.vaultAddress);
      setSnapshot(refreshedSnapshot);
      setRequestOverride({ amount: refreshedSnapshot.pendingWithdrawal.amount, purposeHash: refreshedSnapshot.pendingWithdrawal.purposeHash, requestedAt: refreshedSnapshot.pendingWithdrawal.requestedAt, executableAt: refreshedSnapshot.pendingWithdrawal.executableAt, expiresAt: refreshedSnapshot.pendingWithdrawal.expiresAt, requestType: withdrawalType, outcome: 'active', settledAt: null });
      setAmountInput(''); setPurposeInput('');
      setMessage(`Withdrawal request confirmed: ${txHash}`);
      restoreScrollPosition(); void refresh({ background: true });
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); clearWalletApprovalFlow(); }
  }

  async function handleCancelWithdrawal() {
    if (!props.walletSession?.address) return;
    let connection = props.walletSession;
    preserveScrollPosition(); setBusy(true); setError(null); setMessage(null);
    try {
      connection = await ensureCorrectChain(connection);
      const txHashPromise = cancelWithdrawalTx(props.vaultAddress, connection.signer, (hash) => {
        clearWalletApprovalFlow();
        setMessage(`Transaction submitted (${hash.slice(0, 10)}…). Waiting for confirmation...`);
      });
      startWalletApprovalFlow(connection);
      const txHash = await txHashPromise;
      if (latestRequest) setRequestOverride({ ...latestRequest, outcome: 'canceled', settledAt: Math.floor(Date.now() / 1000) });
      setMessage(`Withdrawal canceled: ${txHash}`);
      restoreScrollPosition(); void refresh({ background: true });
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); clearWalletApprovalFlow(); }
  }

  async function handleExecuteWithdrawal() {
    if (!props.walletSession?.address) return;
    let connection = props.walletSession;
    preserveScrollPosition(); setBusy(true); setError(null); setMessage(null);
    try {
      connection = await ensureCorrectChain(connection);
      const txHashPromise = executeWithdrawalTx(props.vaultAddress, connection.signer, (hash) => {
        clearWalletApprovalFlow();
        setMessage(`Transaction submitted (${hash.slice(0, 10)}…). Waiting for confirmation...`);
      });
      startWalletApprovalFlow(connection);
      const txHash = await txHashPromise;
      if (latestRequest) setRequestOverride({ ...latestRequest, outcome: 'executed', settledAt: Math.floor(Date.now() / 1000) });
      setMessage(`Withdrawal executed: ${txHash}`);
      restoreScrollPosition(); void refresh({ background: true });
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); clearWalletApprovalFlow(); }
  }

  if (loading) return <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-slate-300">Loading transaction controls...</div>;
  if (error && !snapshot) return (
    <div className="rounded-[2rem] border border-rose-300/20 bg-rose-300/10 p-8 text-slate-100">
      <p className="text-sm uppercase tracking-[0.25em] text-rose-200/70">Transactions</p>
      <h2 className="mt-2 text-3xl font-semibold text-white">Vault contract unavailable</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/90">{error}</p>
    </div>
  );
  if (!snapshot) return null;

  const explorerBase = EXPLORERS[snapshot.chainId];
  const requestPurposeText = latestRequest
    ? props.purposeTexts[latestRequest.purposeHash.toLowerCase()] ?? readStoredPurpose(latestRequest.purposeHash)
    : '';
  const cancelButtonActive = walletMatchesOwner && hasActiveBeaconSession && state === 'cancel' && !busy;
  const executeButtonActive = hasActiveBeaconSession && state === 'exec' && !busy && walletConnected;
  const requestButtonActive = !requestButtonDisabled;
  const mostRecentPhase = !latestRequest
    ? null
    : latestRequest.outcome === 'canceled'
      ? 'Canceled'
      : latestRequest.outcome === 'executed'
        ? 'Executed'
        : latestRequest.outcome === 'expired'
          ? 'Expired'
          : state === 'cancel'
            ? 'Cancel phase'
            : state === 'delay'
              ? 'Delay phase'
              : state === 'exec'
                ? 'Execution phase'
                : state === 'expired'
                  ? 'Expired'
                  : 'Requested';

  return (
    <section className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Vested Available</p>
          <p className="mt-3 text-2xl font-semibold text-white">{formatTokenAmount(snapshot.availableToWithdraw.toString())} {snapshot.tokenSymbol}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Surplus Available</p>
          <p className="mt-3 text-2xl font-semibold text-white">{snapshot.excessSupported ? `${formatTokenAmount(snapshot.excessAvailable.toString())} ${snapshot.tokenSymbol}` : 'Unsupported'}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Withdrawal Delay</p>
          <p className="mt-3 text-2xl font-semibold text-white">{formatDurationSeconds(String(snapshot.withdrawalDelay))}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.25em] text-amber-200/70">Withdrawals</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Owner withdrawal controls</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">Choose the withdrawal allocation,enter an amount, submit a purpose, and manage the pending request lifecycle.</p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-200">
              <span className="block text-xs uppercase tracking-[0.22em] text-slate-400">Select Allocation</span>
              <DisabledWalletHint enabled={walletConnected} className="group relative mt-3 block">
                <select value={withdrawalType} onChange={(e) => setWithdrawalType(e.target.value as 'protected' | 'excess')} disabled={!walletConnected || !hasActiveBeaconSession || pending || busy}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none">
                  <option value="protected">Vested Funds</option>
                  <option value="excess" disabled={!snapshot.excessSupported}>Surplus Funds</option>
                </select>
              </DisabledWalletHint>
            </label>
            <label className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-200">
              <span className="block text-xs uppercase tracking-[0.22em] text-slate-400">Amount</span>
              <DisabledWalletHint enabled={walletConnected} className="group relative mt-3 block">
                <input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} disabled={!walletConnected || !hasActiveBeaconSession || pending || busy} placeholder="Enter withdrawal amount"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none" />
              </DisabledWalletHint>
              <span className="mt-2 block text-xs text-slate-400">Max: {formatTokenAmount(selectedAvailable.toString())} {snapshot.tokenSymbol}</span>
            </label>
          </div>
          <label className="mt-4 block rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-200">
            <span className="block text-xs uppercase tracking-[0.22em] text-slate-400">Purpose Description</span>
            <DisabledWalletHint enabled={walletConnected} className="group relative mt-3 block">
              <input value={purposeInput} onChange={(e) => setPurposeInput(e.target.value)} disabled={!walletConnected || !hasActiveBeaconSession || pending || busy} placeholder="Required — describe withdrawal purpose"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none" />
            </DisabledWalletHint>
          </label>
          {!hasActiveBeaconSession ? (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-4 text-sm leading-6 text-amber-100">
              <p className="font-medium text-white">Reconnect Beacon before using withdrawal controls.</p>
              <p className="mt-2">
                Beacon verification is required so the operator panel can store the withdrawal purpose as readable text and include it in shared activity history and notifications.
              </p>
              <p className="mt-2">
                Once connected, that Beacon session stays active for 7 days of withdrawals. After it expires, you will be asked to reconnect Beacon before these controls become available again.
              </p>
              <p className="mt-2 text-amber-50/90">
                Open the <span className="font-medium text-white">Beacon Notifications</span> tab to reconnect.
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <DisabledWalletHint enabled={walletConnected}>
              <button type="button" onClick={() => void handleRequestWithdrawal()} disabled={requestButtonDisabled}
                className={`rounded-2xl bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:opacity-35 ${requestButtonActive ? 'animate-pulse shadow-[0_0_28px_rgba(251,191,36,0.35)]' : ''}`}>
                Request Withdrawal
              </button>
            </DisabledWalletHint>
            <DisabledWalletHint enabled={walletConnected && walletMatchesOwner}>
              <button type="button" onClick={() => void handleCancelWithdrawal()} disabled={!walletMatchesOwner || !hasActiveBeaconSession || state !== 'cancel' || busy}
                className={`rounded-2xl border border-rose-500/60 bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-800 disabled:text-slate-500 disabled:opacity-35 ${cancelButtonActive ? 'animate-pulse shadow-[0_0_28px_rgba(244,63,94,0.32)]' : ''}`}>
                Cancel Withdrawal
              </button>
            </DisabledWalletHint>
            <DisabledWalletHint enabled={walletConnected}>
              <button type="button" onClick={() => void handleExecuteWithdrawal()} disabled={state !== 'exec' || busy || !walletConnected || !hasActiveBeaconSession}
                className={`rounded-2xl border border-emerald-300/70 bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-800 disabled:text-slate-500 disabled:opacity-35 ${executeButtonActive ? 'animate-pulse shadow-[0_0_28px_rgba(52,211,153,0.32)]' : ''}`}>
                Execute Withdrawal
              </button>
            </DisabledWalletHint>
          </div>
          {busy && (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm">
              <p className="text-amber-100">Connecting to wallet...</p>
              {walletCountdown != null ? (
                <p className="mt-2 text-amber-200">
                  Sending request to Wallet. Wallet will open in {walletCountdown} second{walletCountdown === 1 ? '' : 's'}.
                </p>
              ) : walletApproveUrl ? (
                <a
                  href={walletApproveUrl}
                  className="mt-2 flex items-center justify-between text-amber-200 transition hover:text-amber-100"
                >
                  <span>Open MetaMask manually if it does not launch</span>
                  <span className="ml-3 shrink-0">→</span>
                </a>
              ) : null}
            </div>
          )}
          {message ? (
            <p className="mt-4 break-all rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-50">
              {message}
            </p>
          ) : null}
          {error ? <p className="mt-4 break-all rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-50">{error}</p> : null}
        </div>

        <div className="space-y-6">
          {currentRequest ? (
            <TimelineComponent requestedAt={currentRequest.requestedAt} cancelWindow={snapshot.cancelWindow} executableAt={currentRequest.executableAt} expiresAt={currentRequest.expiresAt} nowSeconds={nowSeconds} purposeText={requestPurposeText || undefined} outcome={currentRequest.outcome} settledAt={currentRequest.settledAt} />
          ) : (
            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
              <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Pending Request</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">No active withdrawal</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">Submit a new request to open the cancel, delay, and execution timeline.</p>
            </div>
          )}

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Request Details</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <MiniCard label="Owner" value={shortenAddress(snapshot.owner)} />
              <MiniCard label="Token" value={shortenAddress(snapshot.token)} />
              <MiniCard label="Request state" value={state.toUpperCase()} />
              <MiniCard label="Funding" value={snapshot.funded ? 'Funded' : 'Not funded'} />
            </div>
            {latestRequest ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Most recent request</p>
                <p className="mt-2 text-sm text-white">{formatTokenAmount(latestRequest.amount.toString())} {snapshot.tokenSymbol}</p>
                <p className="mt-2 text-sm text-slate-300">Purpose: {requestPurposeText || 'Purpose text unavailable on this device'}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {latestRequest.requestType === 'protected' ? 'Protected' : 'Excess'} request · Requested {formatUnixSeconds(String(latestRequest.requestedAt))} · Expires {formatUnixSeconds(String(latestRequest.expiresAt))}
                </p>
                <p className="mt-2 text-xs text-slate-400">Phase: {mostRecentPhase}</p>
                <p className="mt-2 text-xs text-slate-400">Status: {latestRequest.outcome === 'active' ? state.toUpperCase() : latestRequest.outcome.toUpperCase()}</p>
                {explorerBase ? (
                  <a href={`${explorerBase}/address/${props.vaultAddress}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm text-sky-200 hover:text-sky-100">
                    View vault on explorer
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-sm text-white">{value}</p>
    </div>
  );
}
