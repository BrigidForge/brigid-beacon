import { Link } from 'react-router-dom';
import type { OwnerPortfolioResponse } from '../lib/api';
import {
  formatAmountLabel,
  formatIso,
  formatTokenAmount,
  formatStateLabel,
  shortenAddress,
} from '../lib/format';

export function OwnerPortfolioDashboard(props: { portfolio: OwnerPortfolioResponse }) {
  const { portfolio } = props;

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_25px_90px_rgba(15,23,42,0.25)]">
        <p className="text-sm uppercase tracking-[0.32em] text-emerald-200/70">Owner Portfolio</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Your indexed vaults</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Beacon groups every indexed vault owned by this session address and surfaces the ones that need attention first.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-300">
          <span className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-2">
            Owner <span className="font-mono text-white">{shortenAddress(portfolio.ownerAddress)}</span>
          </span>
          <span className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-2">
            {portfolio.vaults.length} tracked vault{portfolio.vaults.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="grid gap-5">
        {portfolio.vaults.map((entry) => (
          <article
            key={entry.metadata.address}
            className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.8),rgba(15,23,42,0.45))] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.3)]"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Vault</p>
                <h2 className="text-2xl font-semibold text-white">{formatStateLabel(entry.status.state)}</h2>
                <p className="font-mono text-sm text-slate-300">{entry.metadata.address}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Subscriptions</p>
                  <p className="mt-2 text-sm font-medium text-white">{entry.activeSubscriptionCount}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Delivery failures</p>
                  <p className="mt-2 text-sm font-medium text-white">{entry.recentDeliveryFailures}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-sky-300/25 bg-sky-300/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Protected available</p>
                <p className="mt-2 text-sm text-white">{formatAmountLabel(entry.status.availableToWithdraw)}</p>
              </div>
              <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Excess available</p>
                <p className="mt-2 text-sm text-white">{formatAmountLabel(entry.status.excessAvailableToWithdraw)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Claimed</p>
                <p className="mt-2 text-sm text-white">
                  {entry.claim.claimed ? `Yes${entry.claim.claimedAt ? ` • ${formatIso(entry.claim.claimedAt)}` : ''}` : 'No'}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Last delivery</p>
                <p className="mt-2 text-sm text-white">{entry.lastDeliveryAt ? formatIso(entry.lastDeliveryAt) : 'None yet'}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm leading-6 text-slate-300">
                <p>
                  Outstanding protected balance: <span className="text-white">{formatTokenAmount(entry.status.protectedOutstandingBalance)}</span>
                </p>
                <p>
                  Pending request:{' '}
                  <span className="text-white">
                    {entry.status.pendingRequest
                      ? `${formatStateLabel(entry.status.pendingRequest.requestType)} for ${formatAmountLabel(entry.status.pendingRequest.amount)}`
                      : 'none'}
                  </span>
                </p>
              </div>
              <Link
                to={`/vault/${entry.metadata.address}`}
                className="inline-flex rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm font-medium text-emerald-50"
              >
                Open vault
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
