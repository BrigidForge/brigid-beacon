import { useEffect, useState } from 'react';
import type { VaultMetadata } from '@brigid/beacon-shared-types';
import { formatIso, shortenAddress } from '../lib/format';
import { fetchOperatorHealth, type OperatorHealthResponse } from '../lib/api';

const HEALTHY_LAG_BLOCKS = 100;

function SummaryField(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{props.label}</p>
      <p className={`mt-2 text-sm text-white ${props.mono ? 'font-mono break-all' : ''}`}>{props.value}</p>
    </div>
  );
}

export function VaultSummaryPanel(props: { metadata: VaultMetadata }) {
  const [rpcHealth, setRpcHealth] = useState<{
    tone: 'green' | 'yellow' | 'red';
    label: string;
    detail: string;
  }>({
    tone: 'yellow',
    label: 'Checking',
    detail: 'Verifying operator RPC connectivity.',
  });

  useEffect(() => {
    let cancelled = false;

    function toRpcHealth(health: OperatorHealthResponse) {
      if (health.indexer.lastErrorMessage) {
        return {
          tone: 'yellow' as const,
          label: 'Degraded',
          detail: health.indexer.lastErrorMessage,
        };
      }

      if (health.indexer.isStale || health.indexer.lagBlocks > HEALTHY_LAG_BLOCKS) {
        return {
          tone: 'yellow' as const,
          label: 'Delayed',
          detail: `RPC reachable, but Beacon is ${health.indexer.lagBlocks} blocks behind.`,
        };
      }

      return {
        tone: 'green' as const,
        label: 'Healthy',
        detail: `RPC responding at block #${health.chainHeadBlock}.`,
      };
    }

    async function loadHealth() {
      try {
        const health = await fetchOperatorHealth();
        if (!cancelled) {
          setRpcHealth(toRpcHealth(health));
        }
      } catch (error) {
        if (!cancelled) {
          setRpcHealth({
            tone: 'red',
            label: 'Unavailable',
            detail: error instanceof Error ? error.message : 'RPC health check failed.',
          });
        }
      }
    }

    void loadHealth();
    const intervalId = window.setInterval(() => {
      void loadHealth();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const rpcToneClass =
    rpcHealth.tone === 'green'
      ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]'
      : rpcHealth.tone === 'yellow'
        ? 'bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.75)]'
        : 'bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.75)]';

  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_34%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_30%),rgba(255,255,255,0.04)] p-8 shadow-[0_25px_90px_rgba(15,23,42,0.45)] backdrop-blur">
      <div className="space-y-4">
        <p className="text-sm uppercase tracking-[0.35em] text-amber-300/80">Operator Vault</p>
        <h1 className="text-3xl font-semibold text-white">Vault Identity</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-300">
          Core vault identity only. Status, withdrawals, activity, and notification controls live in the tabs below.
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <SummaryField label="Vault Address" value={props.metadata.address} mono />
        <SummaryField label="Owner" value={shortenAddress(props.metadata.owner)} />
        <SummaryField label="Date Deployed" value={formatIso(props.metadata.createdAt)} />
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${rpcToneClass}`} />
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">RPC Status</p>
              <p className="mt-1 text-sm font-medium text-white">{rpcHealth.label}</p>
            </div>
          </div>
          <p className="max-w-2xl text-sm text-slate-300">{rpcHealth.detail}</p>
        </div>
      </div>
    </section>
  );
}
