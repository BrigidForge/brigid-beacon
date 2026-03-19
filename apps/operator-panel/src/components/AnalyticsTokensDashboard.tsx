import { Link } from 'react-router-dom';
import type {
  AnalyticsOverviewResponse,
  TokenAnalyticsDetailResponse,
  TokenAnalyticsListResponse,
} from '../lib/api';
import {
  formatAmountLabel,
  formatNumberString,
  formatStateLabel,
  shortenAddress,
} from '../lib/format';

export function AnalyticsTokensDashboard(props: {
  overview: AnalyticsOverviewResponse;
  tokenList: TokenAnalyticsListResponse;
}) {
  const { overview, tokenList } = props;

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_25px_90px_rgba(15,23,42,0.25)]">
        <p className="text-sm uppercase tracking-[0.32em] text-amber-200/70">Analytics</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Token and ecosystem coverage</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Beacon aggregates the official BrigidVault footprint by token so you can see where deployments, owners,
          and protected balances are concentrating.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Vaults" value={formatNumberString(String(overview.vaultCount))} />
        <MetricCard label="Tokens" value={formatNumberString(String(overview.tokenCount))} />
        <MetricCard label="Owners" value={formatNumberString(String(overview.ownerCount))} />
        <MetricCard label="Deployers" value={formatNumberString(String(overview.deployerCount))} />
        <MetricCard label="Events" value={formatNumberString(String(overview.beaconEventCount))} />
      </div>

      <div className="grid gap-5">
        {tokenList.tokens.map((token) => (
          <article
            key={token.tokenAddress}
            className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.82),rgba(15,23,42,0.45))] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.3)]"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Token</p>
                <h2 className="text-2xl font-semibold text-white">{shortenAddress(token.tokenAddress)}</h2>
                <p className="font-mono text-sm text-slate-300">{token.tokenAddress}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniCard label="Vaults" value={formatNumberString(String(token.vaultCount))} />
                <MiniCard label="Owners" value={formatNumberString(String(token.ownerCount))} />
                <MiniCard label="Deployers" value={formatNumberString(String(token.deployerCount))} />
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <AmountCard
                label="Total allocation"
                value={formatAmountLabel(token.totalAllocation)}
                tone="border-white/10 bg-white/5"
              />
              <AmountCard
                label="Protected outstanding"
                value={formatAmountLabel(token.protectedOutstandingBalance)}
                tone="border-sky-300/25 bg-sky-300/10"
              />
              <AmountCard
                label="Excess balance"
                value={formatAmountLabel(token.excessBalance)}
                tone="border-amber-300/25 bg-amber-300/10"
              />
            </div>

            <div className="mt-5 flex justify-end">
              <Link
                to={`/analytics/tokens/${token.tokenAddress}`}
                className="inline-flex rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-50"
              >
                Open token view
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function TokenAnalyticsDashboard(props: { detail: TokenAnalyticsDetailResponse }) {
  const { detail } = props;

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_25px_90px_rgba(15,23,42,0.25)]">
        <p className="text-sm uppercase tracking-[0.32em] text-amber-200/70">Token Analytics</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Official vault footprint</h1>
        <p className="mt-3 font-mono text-sm text-slate-300">{detail.tokenAddress}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Vaults" value={formatNumberString(String(detail.vaultCount))} />
        <MetricCard label="Owners" value={formatNumberString(String(detail.ownerCount))} />
        <MetricCard label="Deployers" value={formatNumberString(String(detail.deployerCount))} />
        <MetricCard label="Total allocation" value={formatAmountLabel(detail.totalAllocation)} />
        <MetricCard label="Excess balance" value={formatAmountLabel(detail.excessBalance)} />
      </div>

      <div className="grid gap-5">
        {detail.vaults.map((entry) => (
          <article
            key={entry.metadata.address}
            className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.82),rgba(15,23,42,0.45))] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.3)]"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Vault</p>
                <h2 className="text-2xl font-semibold text-white">{formatStateLabel(entry.status.state)}</h2>
                <p className="font-mono text-sm text-slate-300">{entry.metadata.address}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Deployer</p>
                <p className="mt-2 font-mono text-sm text-white">{shortenAddress(entry.deployer)}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <AmountCard
                label="Allocation"
                value={formatAmountLabel(entry.metadata.totalAllocation)}
                tone="border-white/10 bg-white/5"
              />
              <AmountCard
                label="Protected available"
                value={formatAmountLabel(entry.status.availableToWithdraw)}
                tone="border-sky-300/25 bg-sky-300/10"
              />
              <AmountCard
                label="Protected outstanding"
                value={formatAmountLabel(entry.status.protectedOutstandingBalance)}
                tone="border-emerald-300/25 bg-emerald-300/10"
              />
              <AmountCard
                label="Excess available"
                value={formatAmountLabel(entry.status.excessAvailableToWithdraw)}
                tone="border-amber-300/25 bg-amber-300/10"
              />
            </div>

            <div className="mt-5 flex justify-end">
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

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{props.label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{props.value}</p>
    </div>
  );
}

function MiniCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{props.label}</p>
      <p className="mt-2 text-sm font-medium text-white">{props.value}</p>
    </div>
  );
}

function AmountCard(props: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${props.tone}`}>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{props.label}</p>
      <p className="mt-2 text-sm text-white">{props.value}</p>
    </div>
  );
}
