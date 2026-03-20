import { Link, useLocation, useNavigate } from 'react-router-dom';
import { shortenAddress } from '../lib/format';
import { NETWORK_NAMES } from '../lib/operatorVault';
import { useOperatorSession } from './OperatorSessionProvider';
import brigidLogoWhite from '../../media/brigid-logo-white.png';

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
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
  } = useOperatorSession();
  const currentVaultAddress = location.pathname.startsWith('/vault/') ? location.pathname.slice('/vault/'.length) : '';
  const networkLabel = NETWORK_NAMES[walletSession?.chainId ?? 97] ?? `Chain ${walletSession?.chainId ?? 97}`;
  const showHeaderConnectControls = walletSession != null || location.pathname !== '/';

  return (
    <div className="min-h-screen text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(56,189,248,0.14),_transparent_24%),linear-gradient(180deg,_#09111f_0%,_#020617_55%,_#02030a_100%)]" />
      <header className="border-b border-white/10 bg-slate-950/35 px-6 py-5 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div
            className={`flex items-center gap-4 ${walletSession ? 'justify-between' : 'justify-center'}`}
          >
            <div className="flex items-center gap-5">
              <Link to="/" className="flex items-center gap-3">
                <img
                  src={brigidLogoWhite}
                  alt="Brigid Forge"
                  style={{ height: 120 }}
                  className="w-auto"
                />
              </Link>
            </div>
            {walletSession ? (
              <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="min-w-[15rem] rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-2 text-right">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Wallet</p>
                  <p className="mt-1 text-sm font-medium text-white">{shortenAddress(walletSession.address)}</p>
                  <p className="mt-1 text-xs text-slate-400">{networkLabel}</p>
                </div>
                {ownedVaults?.vaults.length ? (
                  <label className="min-w-[17rem] rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-2 text-sm text-slate-200">
                      <span className="block text-[11px] uppercase tracking-[0.2em] text-slate-400">Select Vault:</span>
                    <select
                      value={currentVaultAddress || ownedVaults.vaults[0].metadata.address}
                      onChange={(event) => navigate(`/vault/${event.target.value}`)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    >
                      {ownedVaults.vaults.map((entry) => (
                        <option key={entry.metadata.address} value={entry.metadata.address}>
                          {shortenAddress(entry.metadata.address)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="min-w-[17rem] rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm text-amber-50">
                    {ownedVaultsLoading ? 'Finding indexed vaults...' : 'No indexed vaults for this wallet'}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void handleDisconnect();
                    void navigate('/');
                  }}
                  className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white transition hover:border-rose-300/40"
                >
                  Disconnect
                </button>
              </div>
            ) : showHeaderConnectControls ? (
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void ensureWallet('injected');
                  }}
                  disabled={walletBusy}
                  className="min-w-[13rem] rounded-2xl bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Connect Wallet
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void ensureWallet('walletconnect');
                  }}
                  disabled={walletBusy || !walletConnectAvailable}
                  className="min-w-[13rem] rounded-2xl border border-sky-300/30 px-5 py-2.5 text-sm text-sky-100 transition hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  iPhone / WalletConnect
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {walletConnectUri && !walletSession ? (
        <div className="border-b border-sky-300/20 bg-sky-300/10 px-6 py-4">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-sky-200/70">WalletConnect Pairing</p>
              <p className="mt-2 text-sm text-slate-100">
                Open the pairing URI in your iPhone wallet, or copy it into a WalletConnect-compatible app.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={walletConnectUri}
                className="rounded-2xl bg-sky-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                Open Pairing URI
              </a>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(walletConnectUri);
                }}
                className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white transition hover:border-sky-300/40"
              >
                Copy URI
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {walletConnectStatus && !walletConnectUri && !walletSession ? (
        <div className="border-b border-white/10 bg-white/5 px-6 py-3 text-sm text-slate-200">
          <div className="mx-auto max-w-6xl">{walletConnectStatus}</div>
        </div>
      ) : null}
      {walletMessage ? (
        <div className="border-b border-emerald-300/20 bg-emerald-300/10 px-6 py-3 text-sm text-emerald-50">
          <div className="mx-auto max-w-6xl">{walletMessage}</div>
        </div>
      ) : null}
      {walletError && location.pathname !== '/' ? (
        <div className="border-b border-rose-300/20 bg-rose-300/10 px-6 py-3 text-sm text-rose-50">
          <div className="mx-auto max-w-6xl whitespace-pre-line">{walletError}</div>
        </div>
      ) : null}
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
