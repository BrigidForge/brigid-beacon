import type { DeploymentProof, VaultMetadata, VaultStatus } from '@brigid/beacon-shared-types';
import {
  formatDurationSeconds,
  formatNumberString,
  formatTokenAmount,
  formatUnixSeconds,
} from '../lib/format';

function StatCard(props: {
  label: string;
  value: string;
  hint: string;
  tone?: 'default' | 'warm' | 'cool' | 'success';
}) {
  const toneClass =
    props.tone === 'warm'
      ? 'border-amber-300/30 bg-amber-300/10'
      : props.tone === 'cool'
        ? 'border-sky-300/30 bg-sky-300/10'
        : props.tone === 'success'
          ? 'border-emerald-300/30 bg-emerald-300/10'
          : 'border-white/10 bg-white/5';

  return (
    <div className={`rounded-3xl border p-5 shadow-[0_18px_50px_rgba(15,23,42,0.18)] ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{props.label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{props.value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{props.hint}</p>
    </div>
  );
}

export function VaultStatusTab(props: {
  metadata: VaultMetadata;
  status: VaultStatus;
  proof: DeploymentProof;
}) {
  const { metadata, status, proof } = props;
  const protectedCoverage = metadata.totalAllocation === '0'
    ? '0%'
    : `${Math.min(100, Math.round((Number(status.vestedAmount) / Number(metadata.totalAllocation)) * 100))}% vested`;

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.25em] text-sky-200/70">Vault Status</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Status, health, and immutable rules</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          This tab gathers the core operating context for the vault: balances, vesting posture, deployment rules,
          and provenance details.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Protected Available"
          value={formatTokenAmount(status.availableToWithdraw)}
          hint="Vested principal currently available to withdraw."
          tone="cool"
        />
        <StatCard
          label="Excess Available"
          value={formatTokenAmount(status.excessAvailableToWithdraw)}
          hint="Extra balance that can be requested without affecting protected vesting."
          tone="warm"
        />
        <StatCard
          label="Schedule Progress"
          value={protectedCoverage}
          hint="How much of the protected allocation has vested so far."
          tone="success"
        />
        <StatCard
          label="Funding Health"
          value={status.funded ? 'Funded' : 'Pending'}
          hint="Whether Beacon sees the vault as funded and ready for full tracking."
          tone={status.funded ? 'success' : 'warm'}
        />
        <StatCard
          label="Protected Outstanding"
          value={formatTokenAmount(status.protectedOutstandingBalance)}
          hint="Protected principal still sitting in the vault after withdrawals."
        />
        <StatCard
          label="Total Allocation"
          value={formatTokenAmount(metadata.totalAllocation)}
          hint="Immutable protected allocation written into the deployment config."
        />
        <StatCard
          label="Protected Withdrawn"
          value={formatTokenAmount(status.totalWithdrawn)}
          hint="Principal already withdrawn through the request flow."
        />
        <StatCard
          label="Excess Withdrawn"
          value={formatTokenAmount(status.totalExcessWithdrawn)}
          hint="Extra balance already withdrawn from the vault."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Immutable Rules</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">These parameters were fixed when the vault was deployed.</p>
          <dl className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-slate-400">Start time</dt>
              <dd className="text-sm text-white">{formatUnixSeconds(metadata.startTime)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-slate-400">Cliff duration</dt>
              <dd className="text-sm text-white">{formatDurationSeconds(metadata.cliffDuration)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-slate-400">Interval duration</dt>
              <dd className="text-sm text-white">{formatDurationSeconds(metadata.intervalDuration)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-slate-400">Intervals</dt>
              <dd className="text-sm text-white">{formatNumberString(metadata.intervalCount)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-slate-400">Cancel window</dt>
              <dd className="text-sm text-white">{formatDurationSeconds(metadata.cancelWindow)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-slate-400">Withdrawal delay</dt>
              <dd className="text-sm text-white">{formatDurationSeconds(metadata.withdrawalDelay)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-slate-400">Execution window</dt>
              <dd className="text-sm text-white">{formatDurationSeconds(metadata.executionWindow)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Deployment Proof</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">Quick provenance details for verifying where this vault came from.</p>
          <dl className="mt-5 space-y-4">
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Factory</dt>
              <dd className="mt-1 font-mono text-sm text-white">{proof.factory || 'Not configured'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Deployer</dt>
              <dd className="mt-1 font-mono text-sm text-white">{proof.deployer}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Transaction</dt>
              <dd className="mt-1 font-mono text-sm text-white">{proof.transactionHash}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Block</dt>
              <dd className="mt-1 text-sm text-white">{proof.blockNumber}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
