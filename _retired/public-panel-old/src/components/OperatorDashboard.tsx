import type { OperatorHealthResponse } from '../lib/api';
import { formatIso, formatNumberString, shortenAddress } from '../lib/format';

function statusTone(isHealthy: boolean) {
  return isHealthy
    ? 'border-emerald-300/25 bg-emerald-300/10'
    : 'border-rose-300/25 bg-rose-300/10';
}

export function OperatorDashboard(props: { health: OperatorHealthResponse }) {
  const { health } = props;
  const healthy = !health.indexer.isStale && !health.indexer.lastErrorMessage;

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_25px_90px_rgba(15,23,42,0.25)]">
        <p className="text-sm uppercase tracking-[0.32em] text-sky-200/70">Operator</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Beacon health</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Operational visibility for the indexer, dispatcher, and current workload on the configured official factory.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className={`rounded-3xl border p-5 ${statusTone(healthy)}`}>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Health</p>
          <p className="mt-3 text-2xl font-semibold text-white">{healthy ? 'Healthy' : 'Attention needed'}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Lag blocks</p>
          <p className="mt-3 text-2xl font-semibold text-white">{formatNumberString(String(health.indexer.lagBlocks))}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Indexed vaults</p>
          <p className="mt-3 text-2xl font-semibold text-white">{formatNumberString(String(health.stats.vaultCount))}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Active subscriptions</p>
          <p className="mt-3 text-2xl font-semibold text-white">{formatNumberString(String(health.stats.activeSubscriptionCount))}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Failed deliveries</p>
          <p className="mt-3 text-2xl font-semibold text-white">{formatNumberString(String(health.stats.failedDeliveryCount))}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Indexer state</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
              <p className="text-xs text-slate-400">Factory</p>
              <p className="mt-2 font-mono text-sm text-white">{shortenAddress(health.factoryAddress)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
              <p className="text-xs text-slate-400">Discovery mode</p>
              <p className="mt-2 text-sm text-white">{health.indexer.discoveryMode ?? 'unknown'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
              <p className="text-xs text-slate-400">Chain head</p>
              <p className="mt-2 text-sm text-white">#{health.chainHeadBlock}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
              <p className="text-xs text-slate-400">Last indexed block</p>
              <p className="mt-2 text-sm text-white">#{health.indexer.lastIndexedBlock}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
              <p className="text-xs text-slate-400">Last indexer run</p>
              <p className="mt-2 text-sm text-white">{health.indexer.lastIndexerRunAt ? formatIso(health.indexer.lastIndexerRunAt) : 'Never'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
              <p className="text-xs text-slate-400">Last dispatcher run</p>
              <p className="mt-2 text-sm text-white">{health.indexer.lastDispatcherRunAt ? formatIso(health.indexer.lastDispatcherRunAt) : 'Never'}</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Workload</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
                <p className="text-xs text-slate-400">Indexed events</p>
                <p className="mt-2 text-sm text-white">{formatNumberString(String(health.stats.beaconEventCount))}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3">
                <p className="text-xs text-slate-400">Pending deliveries</p>
                <p className="mt-2 text-sm text-white">{formatNumberString(String(health.stats.pendingDeliveryCount))}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Last error</p>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {health.indexer.lastErrorMessage
                ? `${health.indexer.lastErrorMessage}${health.indexer.lastErrorAt ? ` • ${formatIso(health.indexer.lastErrorAt)}` : ''}`
                : 'No recent indexer error recorded.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
