import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { shortenAddress } from '../lib/format';
import { useOperatorSession } from '../components/OperatorSessionProvider';

const PUBLIC_PANEL_URL =
  (typeof import.meta !== 'undefined' &&
  typeof import.meta.env === 'object' &&
  import.meta.env &&
  'VITE_PUBLIC_PANEL_URL' in import.meta.env
    ? import.meta.env.VITE_PUBLIC_PANEL_URL
    : '') || 'http://localhost:5174/';

export default function HomePage() {
  const navigate = useNavigate();
  const { walletSession, ownedVaults, ownedVaultsLoading, ensureWallet, walletBusy, walletConnectAvailable, walletError } = useOperatorSession();
  const vaults = ownedVaults?.vaults ?? [];

  // Immediately open the operator workspace once a vault is available.
  // This prevents an intermediate vault-selection step.
  useMemo(() => {
    if (vaults.length > 0) {
      void navigate(`/vault/${vaults[0].metadata.address}`);
    }
  }, [navigate, vaults]);

  return (
    <section className="flex min-h-[calc(100vh-14rem)] items-center">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-[0_20px_80px_rgba(15,23,42,0.35)] backdrop-blur">
          <div className="grid lg:grid-cols-2">
            <div className="flex min-h-full flex-col justify-center p-8 lg:p-10">
              <div className="space-y-4">
                <p className="text-sm uppercase tracking-[0.35em] text-amber-300/70">Operator Panel</p>
                <h1 className="text-5xl font-semibold leading-tight text-white sm:text-6xl">
                  Vault controls for operators only.
                </h1>
                <p className="max-w-xl text-lg leading-8 text-slate-300">
                  Not an operator?{' '}
                  <a
                    href={PUBLIC_PANEL_URL}
                    className="font-medium text-sky-100 underline decoration-sky-300/60 underline-offset-4 transition hover:text-sky-50"
                  >
                    Visit the Vault Public Viewer
                  </a>
                  .
                </p>
              </div>
            </div>

            <div className="border-t border-white/10 p-8 lg:min-h-full lg:border-l lg:border-t-0 lg:p-10">
              {!walletSession ? (
                <div className="flex h-full flex-col justify-center space-y-6">
                  {walletError ? (
                    <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-50 whitespace-pre-line">
                      {walletError}
                    </div>
                  ) : null}
                  <p className="text-lg leading-8 text-slate-300">
                    Connect your owner wallet to manage withdrawals, review vault activity, and configure Beacon notifications.
                  </p>
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={() => {
                        void ensureWallet('injected');
                      }}
                      disabled={walletBusy}
                      className="w-full rounded-2xl bg-amber-300 px-5 py-3 text-base font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Connect Wallet
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void ensureWallet('walletconnect');
                      }}
                      disabled={walletBusy || !walletConnectAvailable}
                      className="w-full rounded-2xl border border-sky-300/30 px-5 py-3 text-base text-sky-100 transition hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      iPhone / WalletConnect
                    </button>
                  </div>
                </div>
              ) : ownedVaultsLoading ? (
                <div className="flex h-full flex-col justify-center space-y-3">
                  <h2 className="text-2xl font-semibold text-white">Checking indexed vaults</h2>
                  <p className="text-sm leading-6 text-slate-300">
                    Matching <span className="font-mono text-white">{shortenAddress(walletSession.address)}</span> to indexed vault ownership.
                  </p>
                </div>
              ) : vaults.length === 0 ? (
                <div className="flex h-full flex-col justify-center space-y-3">
                  <h2 className="text-2xl font-semibold text-white">No indexed vaults found</h2>
                  <p className="text-sm leading-6 text-slate-300">
                    This wallet is connected, but Beacon does not currently have indexed vaults for it.
                  </p>
                  <p className="text-xs leading-6 text-slate-400 whitespace-pre-line">
                    Connect using the wallet that was used to create the vault (or that holds vault ownership). Before trying again, clear this site&apos;s access in your wallet: open your wallet → Connected sites or Settings → Connections → find this site → Disconnect.
                  </p>
                </div>
              ) : (
                <div className="flex h-full flex-col justify-center space-y-4 text-left">
                  <h2 className="text-2xl font-semibold text-white">Opening operator panel...</h2>
                  <p className="text-sm leading-6 text-slate-300">
                    Automatically loading your latest indexed vault.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
