import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { OperatorSessionProvider, useOperatorSession } from '../components/OperatorSessionProvider';
import { OperatorVaultWorkspace } from '../components/OperatorVaultWorkspace';
import { CopyableAddress } from '../components/CopyableAddress';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { NETWORK_NAMES, fetchTokenSymbol } from '../lib/operatorVault';

function WalletConnectQrPanel(props: { uri: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderQr() {
      try {
        const { toDataURL } = await import('qrcode');
        const nextDataUrl = await toDataURL(props.uri, {
          margin: 1,
          width: 320,
          color: {
            dark: '#e2e8f0',
            light: '#0f172a',
          },
        });
        if (!cancelled) {
          setQrDataUrl(nextDataUrl);
        }
      } catch {
        if (!cancelled) {
          setQrDataUrl(null);
        }
      }
    }

    void renderQr();
    return () => {
      cancelled = true;
    };
  }, [props.uri]);

  return (
    <div className="mt-5 rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4">
      <p className="text-xs uppercase tracking-widest text-sky-300/70">Scan With MetaMask Mobile</p>
      <p className="mt-1 text-sm leading-6 text-slate-200">
        Open MetaMask on your phone, scan this QR code, and approve transactions there while keeping Beacon open on this desktop browser.
      </p>
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex h-44 w-44 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/90 p-3">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="WalletConnect QR code" className="h-full w-full rounded-xl" />
          ) : (
            <p className="text-center text-xs text-slate-400">Generating QR code...</p>
          )}
        </div>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Pairing URI</p>
          <p className="mt-2 break-all rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-xs text-slate-300">
            {props.uri}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void navigator.clipboard.writeText(props.uri); }}
              className="rounded-xl bg-sky-300 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-200"
            >
              Copy URI
            </button>
            <a
              href={props.uri}
              className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white hover:border-sky-300/40"
            >
              Open On This Device
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Operator() {
  return (
    <ErrorBoundary label="Operator panel error">
      <OperatorSessionProvider>
        <OperatorContent />
      </OperatorSessionProvider>
    </ErrorBoundary>
  );
}

function OperatorContent() {
  const { vault: vaultAddress } = useParams<{ vault: string }>();
  const navigate = useNavigate();
  const {
    walletSession,
    walletBusy,
    walletError,
    walletMessage,
    walletConnectUri,
    walletConnectStatus,
    ownedVaults,
    ownedVaultsLoading,
    ensureWallet,
    handleDisconnect,
    walletConnectAvailable,
    clearWalletFeedback,
  } = useOperatorSession();

  const networkLabel = NETWORK_NAMES[walletSession?.chainId ?? 97] ?? `Chain ${walletSession?.chainId ?? 97}`;

  const [tokenSymbols, setTokenSymbols] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!ownedVaults) return;
    for (const entry of ownedVaults.vaults) {
      const addr = entry.metadata.token;
      void fetchTokenSymbol(addr).then((sym) => {
        if (sym) setTokenSymbols((prev) => ({ ...prev, [addr.toLowerCase()]: sym }));
      });
    }
  }, [ownedVaults]);

  // ── Not connected: landing ───────────────────────────────────
  const hasInjectedWallet = typeof window !== 'undefined' && 'ethereum' in window;
  const prefersDesktopLayout =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(min-width: 1024px)').matches;
  const showDesktopWalletConnectQr = !hasInjectedWallet && prefersDesktopLayout;
  const walletConnectButtonLabel = showDesktopWalletConnectQr ? 'Scan With MetaMask Mobile' : 'iPhone / WalletConnect';

  if (!walletSession) {
    return (
      <div className="flex flex-col items-center gap-8 py-6">
        <div className="w-full max-w-lg">
          <Link to="/" className="text-sm text-slate-400 transition hover:text-slate-200">← Back</Link>

          <div className="mt-6 space-y-3">
            <p className="text-sm uppercase tracking-[0.35em] text-sky-300/70">Operator Panel</p>
            <h1 className="text-3xl font-semibold text-white">Connect your wallet</h1>
            <p className="text-slate-400">
              Connect the wallet that owns your BrigidVault to manage withdrawals and configure Beacon alerts.
            </p>
          </div>

          <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => { void ensureWallet('walletconnect'); }}
                disabled={walletBusy || !walletConnectAvailable}
                className={`flex items-center justify-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  !hasInjectedWallet
                    ? 'bg-sky-300 text-slate-950 hover:bg-sky-200'
                    : 'border border-sky-300/30 text-sky-100 hover:bg-sky-300/10'
                }`}
              >
                <span className="text-lg">📱</span>
                {walletConnectButtonLabel}
              </button>
              <button
                type="button"
                onClick={() => { void ensureWallet('injected'); }}
                disabled={walletBusy || !hasInjectedWallet}
                className={`flex items-center justify-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  hasInjectedWallet
                    ? 'bg-amber-300 text-slate-950 hover:bg-amber-200'
                    : 'border border-white/10 text-slate-400'
                }`}
              >
                <span className="text-lg">🦊</span>
                Connect Browser Wallet
              </button>
              {!hasInjectedWallet && (
                <p className="text-center text-xs text-slate-500">
                  {showDesktopWalletConnectQr
                    ? 'No browser wallet extension detected. Use the WalletConnect QR code below to sign with MetaMask mobile.'
                    : 'No browser wallet extension detected'}
                </p>
              )}
            </div>

            {/* WalletConnect URI */}
            {walletConnectUri ? (
              showDesktopWalletConnectQr ? (
                <WalletConnectQrPanel uri={walletConnectUri} />
              ) : (
                <div className="mt-5 rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4">
                  <p className="text-xs uppercase tracking-widest text-sky-300/70">Pairing URI ready</p>
                  <p className="mt-1 text-sm text-slate-200">Open in your iPhone wallet or copy the URI.</p>
                  <div className="mt-3 flex gap-2">
                    <a
                      href={walletConnectUri}
                      className="rounded-xl bg-sky-300 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-200"
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      onClick={() => { void navigator.clipboard.writeText(walletConnectUri); }}
                      className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white hover:border-sky-300/40"
                    >
                      Copy URI
                    </button>
                  </div>
                </div>
              )
            ) : walletConnectStatus ? (
              <p className="mt-4 text-sm text-slate-400">{walletConnectStatus}</p>
            ) : null}

            {/* Error */}
            {walletError && (
              <div className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100 whitespace-pre-line">
                {walletError}
                <button
                  type="button"
                  onClick={clearWalletFeedback}
                  className="mt-2 block text-xs text-rose-300 underline"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Connected: show vault list ───────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {/* Wallet bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-white/10 bg-white/5 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400">Connected wallet</p>
          <CopyableAddress value={walletSession.address} className="mt-1 text-sm text-white" />
          <p className="text-xs text-slate-400">{networkLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => { void handleDisconnect(); }}
          className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white transition hover:border-rose-300/40"
        >
          Disconnect
        </button>
      </div>

      {/* Message */}
      {walletMessage && (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 text-sm text-emerald-100">
          {walletMessage}
        </div>
      )}

      {/* Vault list */}
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
        <p className="text-xs uppercase tracking-widest text-slate-400">Select your vault</p>
        <p className="mt-1 text-xs text-slate-500">Tap a vault below to open the operator panel</p>

        {ownedVaultsLoading ? (
          <p className="mt-4 text-sm text-slate-400">Finding your vaults…</p>
        ) : ownedVaults && ownedVaults.vaults.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3">
            {ownedVaults.vaults.map((entry) => {
              const isActive = vaultAddress?.toLowerCase() === entry.metadata.address.toLowerCase();
              return (
                <button
                  key={entry.metadata.address}
                  type="button"
                  onClick={() => navigate(`/operator/${entry.metadata.address}`)}
                  className={`group flex cursor-pointer items-center justify-between rounded-2xl border px-5 py-4 text-left transition-all duration-150 ${
                    isActive
                      ? 'border-sky-300/50 bg-sky-300/10 shadow-[0_0_0_1px_rgba(125,211,252,0.15)]'
                      : 'border-white/15 bg-white/5 hover:border-sky-300/30 hover:bg-sky-300/5 hover:shadow-[0_0_0_1px_rgba(125,211,252,0.1)]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm text-slate-100">{entry.metadata.address}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                      <span>Token: {tokenSymbols[entry.metadata.token.toLowerCase()] ?? '…'}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                          ['idle', 'active_no_request', 'completed_recently', 'canceled_recently', 'request_expired'].includes(entry.status.state)
                            ? 'bg-emerald-400'
                            : 'bg-amber-400'
                        }`} />
                        {['idle', 'active_no_request', 'completed_recently', 'canceled_recently', 'request_expired'].includes(entry.status.state)
                          ? 'Status: Ready'
                          : 'Status: Request Processing'}
                      </span>
                    </p>
                  </div>
                  <span className={`ml-4 shrink-0 text-base transition-transform duration-150 group-hover:translate-x-0.5 ${isActive ? 'text-sky-300' : 'text-slate-500 group-hover:text-sky-300'}`}>→</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm text-amber-100">
            No indexed vaults found for this wallet. Make sure you're connected with the owner wallet.
          </div>
        )}
      </div>

      {/* Full vault workspace if a vault is selected */}
      {vaultAddress && (() => {
        const owned = ownedVaults?.vaults.find(
          (v) => v.metadata.address.toLowerCase() === vaultAddress.toLowerCase(),
        );
        if (!owned) {
          return (
            <div className="rounded-[2rem] border border-rose-300/20 bg-rose-300/10 p-6 text-sm text-rose-100">
              This vault is not owned by your connected wallet.
            </div>
          );
        }
        return (
          <ErrorBoundary label="Vault workspace error">
            <OperatorVaultWorkspace
              vaultAddress={vaultAddress}
              walletSession={walletSession}
              ensureWallet={ensureWallet}
            />
          </ErrorBoundary>
        );
      })()}
    </div>
  );
}
