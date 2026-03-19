import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NormalizedEvent } from '@brigid/beacon-shared-types';
import { ethers } from 'ethers';
import { formatDurationSeconds, formatTokenAmount, formatUnixSeconds, shortenAddress } from '../lib/format';
import {
  cancelWithdrawalTx,
  executeWithdrawalTx,
  EXPLORERS,
  readOperatorSnapshot,
  requestWithdrawalTx,
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

function DisabledWalletHint(props: {
  enabled: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (props.enabled) {
    return <>{props.children}</>;
  }

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
  if (typeof value === 'string' || typeof value === 'number') {
    return Number(value);
  }
  return 0;
}

function deriveLatestRequestLifecycle(events: NormalizedEvent[], snapshot: OperatorVaultSnapshot | null, nowSeconds: number): RequestLifecycleView | null {
  const sortedEvents = [...events].sort((a, b) => {
    const blockCmp = a.blockNumber - b.blockNumber;
    return blockCmp !== 0 ? blockCmp : a.logIndex - b.logIndex;
  });

  const requests = sortedEvents.filter(
    (event) => event.kind === 'protected_withdrawal_requested' || event.kind === 'excess_withdrawal_requested',
  );
  const latestRequest = requests.at(-1);

  const pendingSnapshotRequest =
    snapshot?.pendingWithdrawal.exists
      ? {
          amount: snapshot.pendingWithdrawal.amount,
          purposeHash: snapshot.pendingWithdrawal.purposeHash,
          requestedAt: snapshot.pendingWithdrawal.requestedAt,
          executableAt: snapshot.pendingWithdrawal.executableAt,
          expiresAt: snapshot.pendingWithdrawal.expiresAt,
          requestType: 'protected' as const,
          outcome: 'active' as const,
          settledAt: null,
        }
      : null;

  if (!latestRequest) {
    return pendingSnapshotRequest;
  }

  const payload = latestRequest.payload as unknown as Record<string, unknown>;
  const purposeHash = String(payload.purposeHash ?? '');
  const terminalEvent = [...sortedEvents]
    .reverse()
    .find((event) => {
      if (!['withdrawal_canceled', 'withdrawal_executed', 'request_expired'].includes(event.kind)) return false;
      const terminalPayload = event.payload as unknown as Record<string, unknown>;
      return String(terminalPayload.purposeHash ?? '') === purposeHash;
    });

  const requestType = latestRequest.kind === 'protected_withdrawal_requested' ? ('protected' as const) : ('excess' as const);
  const requestedAt = parseEventSeconds(payload.requestedAt);
  const executableAt = parseEventSeconds(payload.executableAt);
  const expiresAt = parseEventSeconds(payload.expiresAt);

  let outcome: RequestLifecycleView['outcome'] = 'active';
  let settledAt: number | null = null;

  if (terminalEvent) {
    const terminalPayload = terminalEvent.payload as unknown as Record<string, unknown>;
    if (terminalEvent.kind === 'withdrawal_canceled') {
      outcome = 'canceled';
      settledAt = parseEventSeconds(terminalPayload.canceledAt);
    } else if (terminalEvent.kind === 'withdrawal_executed') {
      outcome = 'executed';
      settledAt = parseEventSeconds(terminalPayload.executedAt);
    } else {
      outcome = 'expired';
      settledAt = parseEventSeconds(terminalPayload.expiredAt);
    }
  } else if (snapshot?.pendingWithdrawal.exists && snapshot.pendingWithdrawal.purposeHash.toLowerCase() === purposeHash.toLowerCase()) {
    outcome = 'active';
  } else if (expiresAt <= nowSeconds) {
    outcome = 'expired';
    settledAt = expiresAt;
  }

  const derivedRequest = {
    amount: BigInt(String(payload.amount ?? '0')),
    purposeHash,
    requestedAt,
    executableAt,
    expiresAt,
    requestType,
    outcome,
    settledAt,
  };

  if (
    pendingSnapshotRequest &&
    (pendingSnapshotRequest.purposeHash.toLowerCase() !== derivedRequest.purposeHash.toLowerCase() ||
      pendingSnapshotRequest.requestedAt >= derivedRequest.requestedAt)
  ) {
    return pendingSnapshotRequest;
  }

  return derivedRequest;
}

function readStoredPurpose(hash: string): string {
  if (!hash) return '';
  try {
    return window.localStorage.getItem(`brigidPurpose:${hash.toLowerCase()}`) ?? '';
  } catch {
    return '';
  }
}

function storePurpose(hash: string, text: string) {
  if (!hash || !text) return;
  try {
    window.localStorage.setItem(`brigidPurpose:${hash.toLowerCase()}`, text);
  } catch {
    // Ignore local storage failures in private contexts.
  }
}

export function TransactionsTab(props: {
  vaultAddress: string;
  indexedOwnerAddress: string;
  events: NormalizedEvent[];
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
  const pendingScrollRestoreRef = useRef<number | null>(null);

  function restoreScrollPosition() {
    if (pendingScrollRestoreRef.current == null) return;
    const targetY = pendingScrollRestoreRef.current;
    const restore = () => {
      window.scrollTo({ top: targetY, behavior: 'auto' });
    };
    restore();
    window.setTimeout(restore, 0);
    window.setTimeout(restore, 120);
    window.setTimeout(restore, 300);
  }

  function preserveScrollPosition() {
    pendingScrollRestoreRef.current = window.scrollY;
  }

  async function refresh(options?: { background?: boolean }) {
    const background = options?.background ?? false;
    if (!background) {
      setLoading(true);
    }
    try {
      const nextSnapshot = await readOperatorSnapshot(props.vaultAddress);
      setSnapshot(nextSnapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (!background) {
        setSnapshot(null);
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void refresh();
    const refreshTimer = window.setInterval(() => {
      void refresh({ background: true });
    }, 30_000);
    const clockTimer = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 1_000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [props.vaultAddress]);

  useEffect(() => {
    function handleFocus() {
      restoreScrollPosition();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        restoreScrollPosition();
      }
    }

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const selectedAvailable = useMemo(() => {
    if (!snapshot) return 0n;
    return withdrawalType === 'excess' ? snapshot.excessAvailable : snapshot.availableToWithdraw;
  }, [snapshot, withdrawalType]);

  const derivedLatestRequest = useMemo(
    () => deriveLatestRequestLifecycle(props.events, snapshot, nowSeconds),
    [props.events, snapshot, nowSeconds],
  );
  const latestRequest = requestOverride ?? derivedLatestRequest;
  const currentRequest = latestRequest?.outcome === 'active' ? latestRequest : null;
  const pending = currentRequest != null && currentRequest.expiresAt > nowSeconds;
  const cancelEnd = pending && currentRequest ? currentRequest.requestedAt + snapshot!.cancelWindow : 0;
  const state = !pending || !snapshot || !currentRequest
    ? 'idle'
    : nowSeconds < cancelEnd
      ? 'cancel'
      : nowSeconds < currentRequest.executableAt
        ? 'delay'
        : nowSeconds < currentRequest.expiresAt
          ? 'exec'
          : 'expired';

  useEffect(() => {
    if (!requestOverride) return;
    if (
      derivedLatestRequest &&
      (
        derivedLatestRequest.requestedAt > requestOverride.requestedAt ||
        (
          derivedLatestRequest.purposeHash.toLowerCase() === requestOverride.purposeHash.toLowerCase() &&
          derivedLatestRequest.outcome === requestOverride.outcome
        )
      )
    ) {
      setRequestOverride(null);
    }
  }, [derivedLatestRequest, requestOverride]);

  const canRequest =
    snapshot != null &&
    props.walletSession != null &&
    props.walletSession.address.toLowerCase() === props.indexedOwnerAddress.toLowerCase() &&
    !pending &&
    amountInput.trim().length > 0 &&
    purposeInput.trim().length > 0;

  async function handleRequestWithdrawal() {
    if (!props.walletSession?.address || !canRequest) return;
    try {
      preserveScrollPosition();
      setBusy(true);
      setError(null);
      setMessage(`Submitting ${withdrawalType} withdrawal request...`);
      const walletKind = props.walletSession.kind;
      const connection = props.walletSession ?? await props.onRequireWallet(walletKind);
      const purposeHash = ethers.id(purposeInput.trim());
      storePurpose(purposeHash, purposeInput.trim());
      const txHash = await requestWithdrawalTx({
        vaultAddress: props.vaultAddress,
        signer: connection.signer,
        amountInput: amountInput.trim(),
        bucket: withdrawalType,
        purposeText: purposeInput.trim(),
      });
      const refreshedSnapshot = await readOperatorSnapshot(props.vaultAddress);
      setSnapshot(refreshedSnapshot);
      setRequestOverride({
        amount: refreshedSnapshot.pendingWithdrawal.amount,
        purposeHash: refreshedSnapshot.pendingWithdrawal.purposeHash,
        requestedAt: refreshedSnapshot.pendingWithdrawal.requestedAt,
        executableAt: refreshedSnapshot.pendingWithdrawal.executableAt,
        expiresAt: refreshedSnapshot.pendingWithdrawal.expiresAt,
        requestType: withdrawalType,
        outcome: 'active',
        settledAt: null,
      });
      setAmountInput('');
      setPurposeInput('');
      setMessage(`Withdrawal request confirmed: ${txHash}`);
      restoreScrollPosition();
      void refresh({ background: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelWithdrawal() {
    if (!props.walletSession?.address) return;
    try {
      preserveScrollPosition();
      setBusy(true);
      setError(null);
      const walletKind = props.walletSession.kind;
      const connection = props.walletSession ?? await props.onRequireWallet(walletKind);
      const txHash = await cancelWithdrawalTx(props.vaultAddress, connection.signer);
      if (latestRequest) {
        setRequestOverride({
          ...latestRequest,
          outcome: 'canceled',
          settledAt: Math.floor(Date.now() / 1000),
        });
      }
      setMessage(`Withdrawal canceled: ${txHash}`);
      restoreScrollPosition();
      void refresh({ background: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleExecuteWithdrawal() {
    if (!props.walletSession?.address) return;
    try {
      preserveScrollPosition();
      setBusy(true);
      setError(null);
      const walletKind = props.walletSession.kind;
      const connection = props.walletSession ?? await props.onRequireWallet(walletKind);
      const txHash = await executeWithdrawalTx(props.vaultAddress, connection.signer);
      if (latestRequest) {
        setRequestOverride({
          ...latestRequest,
          outcome: 'executed',
          settledAt: Math.floor(Date.now() / 1000),
        });
      }
      setMessage(`Withdrawal executed: ${txHash}`);
      restoreScrollPosition();
      void refresh({ background: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-slate-300">Loading transaction controls...</div>;
  }

  if (error && !snapshot) {
    return (
      <div className="rounded-[2rem] border border-rose-300/20 bg-rose-300/10 p-8 text-slate-100">
        <p className="text-sm uppercase tracking-[0.25em] text-rose-200/70">Transactions</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Vault contract unavailable</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/90">{error}</p>
      </div>
    );
  }

  if (!snapshot) return null;

  const walletMatchesOwner =
    props.walletSession?.address != null && props.walletSession.address.toLowerCase() === props.indexedOwnerAddress.toLowerCase();
  const explorerBase = EXPLORERS[snapshot.chainId];
  const requestPurposeText = latestRequest ? readStoredPurpose(latestRequest.purposeHash) : '';
  const requestButtonDisabled =
    !canRequest ||
    busy ||
    (() => {
      try {
        return ethers.parseUnits(amountInput || '0', 18) > selectedAvailable;
      } catch {
        return true;
      }
    })();
  const cancelButtonActive = walletMatchesOwner && state === 'cancel' && !busy;
  const executeButtonActive = state === 'exec' && !busy && props.walletSession?.address != null;
  const requestButtonActive = !requestButtonDisabled;
  const walletConnected = props.walletSession != null;
  const requestButtonClass = requestButtonActive
    ? 'animate-pulse shadow-[0_0_28px_rgba(251,191,36,0.35)] hover:shadow-[0_0_36px_rgba(251,191,36,0.45)]'
    : '';
  const cancelButtonClass = cancelButtonActive
    ? 'animate-pulse shadow-[0_0_28px_rgba(244,63,94,0.32)] hover:shadow-[0_0_36px_rgba(244,63,94,0.42)] bg-rose-300/10'
    : '';
  const executeButtonClass = executeButtonActive
    ? 'animate-pulse shadow-[0_0_28px_rgba(52,211,153,0.32)] hover:shadow-[0_0_36px_rgba(52,211,153,0.42)]'
    : '';

  return (
    <section className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Protected Available</p>
          <p className="mt-3 text-2xl font-semibold text-white">{formatTokenAmount(snapshot.availableToWithdraw.toString())} {snapshot.tokenSymbol}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Excess Available</p>
          <p className="mt-3 text-2xl font-semibold text-white">
            {snapshot.excessSupported ? `${formatTokenAmount(snapshot.excessAvailable.toString())} ${snapshot.tokenSymbol}` : 'Unsupported'}
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Delay</p>
          <p className="mt-3 text-2xl font-semibold text-white">{formatDurationSeconds(String(snapshot.withdrawalDelay))}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Current Block</p>
          <p className="mt-3 text-2xl font-semibold text-white">#{snapshot.currentBlock.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.25em] text-amber-200/70">Transactions</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Owner withdrawal controls</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            This panel preserves the old operator flow: connect the owner wallet, choose the withdrawal bucket,
            submit a purpose hash, and manage the pending request lifecycle.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-200">
              <span className="block text-xs uppercase tracking-[0.22em] text-slate-400">Bucket</span>
              <DisabledWalletHint enabled={walletConnected} className="group relative mt-3 block">
                <select
                  value={withdrawalType}
                  onChange={(event) => setWithdrawalType(event.target.value as 'protected' | 'excess')}
                  disabled={!walletConnected || pending || busy}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none"
                >
                  <option value="protected">Protected vesting</option>
                  <option value="excess" disabled={!snapshot.excessSupported}>
                    Excess treasury
                  </option>
                </select>
              </DisabledWalletHint>
            </label>

            <label className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-200">
              <span className="block text-xs uppercase tracking-[0.22em] text-slate-400">Amount</span>
              <DisabledWalletHint enabled={walletConnected} className="group relative mt-3 block">
                <input
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  disabled={!walletConnected || pending || busy}
                  placeholder="Enter withdrawal amount"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none"
                />
              </DisabledWalletHint>
              <span className="mt-2 block text-xs text-slate-400">
                Max available: {formatTokenAmount(selectedAvailable.toString())} {snapshot.tokenSymbol}
              </span>
            </label>
          </div>

          <label className="mt-4 block rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-200">
            <span className="block text-xs uppercase tracking-[0.22em] text-slate-400">Purpose Description</span>
            <DisabledWalletHint enabled={walletConnected} className="group relative mt-3 block">
              <input
                value={purposeInput}
                onChange={(event) => setPurposeInput(event.target.value)}
                disabled={!walletConnected || pending || busy}
                placeholder="Required - describe withdrawal purpose"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none"
              />
            </DisabledWalletHint>
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <DisabledWalletHint enabled={walletConnected}>
              <button
                type="button"
                onClick={() => void handleRequestWithdrawal()}
                disabled={requestButtonDisabled}
                className={`rounded-2xl bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60 ${requestButtonClass}`}
              >
                Request Withdrawal
              </button>
            </DisabledWalletHint>
            <DisabledWalletHint enabled={walletConnected && walletMatchesOwner}>
              <button
                type="button"
                onClick={() => void handleCancelWithdrawal()}
                disabled={!walletMatchesOwner || state !== 'cancel' || busy}
                className={`rounded-2xl border border-rose-500/60 bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50 ${cancelButtonClass}`}
              >
                Cancel Withdrawal
              </button>
            </DisabledWalletHint>
            <DisabledWalletHint enabled={walletConnected}>
              <button
                type="button"
                onClick={() => void handleExecuteWithdrawal()}
                disabled={state !== 'exec' || busy || props.walletSession?.address == null}
                className={`rounded-2xl border border-emerald-300/70 bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 ${executeButtonClass}`}
              >
                Execute Withdrawal
              </button>
            </DisabledWalletHint>
          </div>

          {message ? <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-50">{message}</p> : null}
          {error ? <p className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-50">{error}</p> : null}
        </div>

        <div className="space-y-6">
          {latestRequest ? (
            <TimelineComponent
              requestedAt={latestRequest.requestedAt}
              cancelWindow={snapshot.cancelWindow}
              executableAt={latestRequest.executableAt}
              expiresAt={latestRequest.expiresAt}
              nowSeconds={nowSeconds}
              outcome={latestRequest.outcome}
              settledAt={latestRequest.settledAt}
            />
          ) : (
            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
              <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Pending Request</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">No active withdrawal</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Submit a new request to open the cancel, delay, and execution timeline.
              </p>
            </div>
          )}

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Request Details</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
                <p className="text-xs text-slate-400">Owner</p>
                <p className="mt-2 text-sm text-white">{shortenAddress(snapshot.owner)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
                <p className="text-xs text-slate-400">Token</p>
                <p className="mt-2 text-sm text-white">{shortenAddress(snapshot.token)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
                <p className="text-xs text-slate-400">Request state</p>
                <p className="mt-2 text-sm text-white">{state.toUpperCase()}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
                <p className="text-xs text-slate-400">Funding</p>
                <p className="mt-2 text-sm text-white">{snapshot.funded ? 'Funded' : 'Not funded'}</p>
              </div>
            </div>
            {latestRequest ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  {latestRequest.outcome === 'active' ? 'Current request' : 'Most recent request'}
                </p>
                <p className="mt-2 text-sm text-white">
                  {formatTokenAmount(latestRequest.amount.toString())} {snapshot.tokenSymbol}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Purpose: {requestPurposeText || 'Purpose text unavailable on this device'}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {latestRequest.requestType === 'protected' ? 'Protected' : 'Excess'} request · Requested{' '}
                  {formatUnixSeconds(String(latestRequest.requestedAt))} · Expires {formatUnixSeconds(String(latestRequest.expiresAt))}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Status:{' '}
                  {latestRequest.outcome === 'active'
                    ? state.toUpperCase()
                    : latestRequest.outcome.toUpperCase()}
                </p>
                {explorerBase ? (
                  <a
                    href={`${explorerBase}/address/${props.vaultAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex text-sm text-sky-200 hover:text-sky-100"
                  >
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
