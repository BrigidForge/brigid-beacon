import { shortenAddress } from '../lib/format';

export function WalletConnector(props: {
  address: string | null;
  chainLabel: string;
  ownerAddress: string;
  connectionKind: 'injected' | 'walletconnect' | null;
  walletConnectEnabled: boolean;
  onInjectedConnect: () => Promise<void> | void;
  onWalletConnect: () => Promise<void> | void;
  onDisconnect: () => void;
  busy?: boolean;
}) {
  const walletMatchesOwner =
    props.address != null && props.address.toLowerCase() === props.ownerAddress.toLowerCase();
  const selectableButtonClass =
    'animate-pulse shadow-[0_0_24px_rgba(251,191,36,0.35)] hover:shadow-[0_0_32px_rgba(251,191,36,0.45)]';
  const selectableSkyButtonClass =
    'animate-pulse shadow-[0_0_24px_rgba(56,189,248,0.28)] hover:shadow-[0_0_32px_rgba(56,189,248,0.38)]';

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Wallet Session</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {props.address ? shortenAddress(props.address) : 'No wallet connected'}
          </h2>
          {props.connectionKind ? (
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-sky-200/80">
              Connected via {props.connectionKind === 'walletconnect' ? 'WalletConnect' : 'Browser Wallet'}
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {props.address
              ? walletMatchesOwner
                ? `Connected as the indexed owner on ${props.chainLabel}.`
                : `Connected on ${props.chainLabel}, but this wallet does not match the indexed owner.`
              : 'Connect the indexed owner wallet to request or cancel withdrawals.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {props.address ? (
            <button
              type="button"
              onClick={props.onDisconnect}
              className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white transition hover:border-rose-300/40"
            >
              Disconnect
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void props.onInjectedConnect()}
                disabled={props.busy}
                className={`rounded-2xl bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60 ${!props.busy ? selectableButtonClass : ''}`}
              >
                Browser Wallet
              </button>
              <button
                type="button"
                onClick={() => void props.onWalletConnect()}
                disabled={props.busy || !props.walletConnectEnabled}
                className={`rounded-2xl border border-sky-300/30 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:opacity-50 ${!props.busy && props.walletConnectEnabled ? selectableSkyButtonClass : ''}`}
              >
                iPhone / WalletConnect
              </button>
            </>
          )}
        </div>
      </div>
      {!props.walletConnectEnabled && !props.address ? (
        <p className="mt-4 text-xs leading-5 text-slate-400">
          WalletConnect is disabled until `VITE_WALLETCONNECT_PROJECT_ID` is configured.
        </p>
      ) : null}
      {props.walletConnectEnabled && !props.address ? (
        <p className="mt-4 text-xs leading-5 text-slate-400">
          Use <span className="font-medium text-sky-100">iPhone / WalletConnect</span> to pair from mobile Safari or another iPhone wallet browser.
        </p>
      ) : null}
    </section>
  );
}
