import type { DeploymentProof, VaultMetadata, VaultStatus } from '@brigid/beacon-shared-types';
import {
  formatDurationSeconds,
  formatNumberString,
  formatTokenAmount,
  formatUnixSeconds,
} from '../lib/format';
import { CopyableAddress } from './CopyableAddress';

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
  const protectedCoverage =
    metadata.totalAllocation === '0'
      ? '0%'
      : `${Math.min(100, Math.round((Number(status.vestedAmount) / Number(metadata.totalAllocation)) * 100))}% vested`;

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Protected Available" value={formatTokenAmount(status.availableToWithdraw)} hint="Vested principal currently available to withdraw." tone="cool" />
        <StatCard label="Excess Available" value={formatTokenAmount(status.excessAvailableToWithdraw)} hint="Extra balance that can be requested without affecting protected vesting." tone="warm" />
        <StatCard label="Schedule Progress" value={protectedCoverage} hint="How much of the protected allocation has vested so far." tone="success" />
        <StatCard label="Funding Health" value={status.funded ? 'Funded' : 'Pending'} hint="Whether Beacon sees the vault as funded and ready for full tracking." tone={status.funded ? 'success' : 'warm'} />
        <StatCard label="Protected Outstanding" value={formatTokenAmount(status.protectedOutstandingBalance)} hint="Protected principal still sitting in the vault after withdrawals." />
        <StatCard label="Total Allocation" value={formatTokenAmount(metadata.totalAllocation)} hint="Immutable protected allocation written into the deployment config." />
        <StatCard label="Protected Withdrawn" value={formatTokenAmount(status.totalWithdrawn)} hint="Principal already withdrawn through the request flow." />
        <StatCard label="Excess Withdrawn" value={formatTokenAmount(status.totalExcessWithdrawn)} hint="Extra balance already withdrawn from the vault." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Immutable Rules</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">These parameters were fixed when the vault was deployed.</p>
          <dl className="mt-5 space-y-4">
            <Row label="Start time" value={formatUnixSeconds(metadata.startTime)} />
            <Row label="Cliff duration" value={formatDurationSeconds(metadata.cliffDuration)} />
            <Row label="Interval duration" value={formatDurationSeconds(metadata.intervalDuration)} />
            <Row label="Intervals" value={formatNumberString(metadata.intervalCount)} />
            <Row label="Cancel window" value={formatDurationSeconds(metadata.cancelWindow)} />
            <Row label="Withdrawal delay" value={formatDurationSeconds(metadata.withdrawalDelay)} />
            <Row label="Execution window" value={formatDurationSeconds(metadata.executionWindow)} />
          </dl>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Deployment Proof</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">Provenance details for verifying where this vault came from.</p>
          <dl className="mt-5 space-y-4">
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Factory</dt>
              <dd className="mt-1 text-sm text-white">
                {proof.factory ? <CopyableAddress value={proof.factory} className="text-white" /> : 'Not configured'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Deployer</dt>
              <dd className="mt-1 text-sm text-white">
                <CopyableAddress value={proof.deployer} className="text-white" />
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Transaction</dt>
              <dd className="mt-1 text-sm text-white">
                <CopyableAddress value={proof.transactionHash} className="text-white" />
              </dd>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="text-sm text-white">{value}</dd>
    </div>
  );
}
