import type { DeploymentProof, VaultMetadata, VaultStatus } from '@brigid/beacon-shared-types';
import {
  formatDurationSeconds,
  formatNumberString,
  formatTokenAmount,
  formatUnixSeconds,
} from '../lib/format';
import { CopyableAddress } from './CopyableAddress';
import { VaultSummaryPanel } from './VaultSummaryPanel';

function SubStat(props: { label: string; value: string; hint: string; accent?: string }) {
  return (
    <div className="border-b border-white/5 pb-4 last:border-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-xs uppercase tracking-[0.2em] text-slate-400">{props.label}</dt>
        <dd className={`text-base font-semibold ${props.accent ?? 'text-white'}`}>{props.value}</dd>
      </div>
      <p className="mt-1 text-xs text-slate-500">{props.hint}</p>
    </div>
  );
}

export function VaultStatusTab(props: {
  metadata: VaultMetadata;
  status: VaultStatus;
  proof: DeploymentProof;
  purposeTexts: Record<string, string>;
}) {
  const { metadata, status, proof, purposeTexts } = props;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const activePendingRequest =
    status.pendingRequest && Number(status.pendingRequest.expiresAt) > nowSeconds
      ? status.pendingRequest
      : null;
  const totalAllocationNum = Number(metadata.totalAllocation);
  const intervalCount = Number(metadata.intervalCount);
  const intervalDurationSec = Number(metadata.intervalDuration);
  const pendingPurposeText = activePendingRequest
    ? purposeTexts[activePendingRequest.purposeHash.toLowerCase()] ?? ''
    : '';

  const remainingToVest = formatTokenAmount(
    String(Math.max(0, totalAllocationNum - Number(status.vestedAmount))),
  );

  const vestedIntervals =
    totalAllocationNum === 0 || intervalCount === 0
      ? 0
      : Math.min(intervalCount, Math.round((Number(status.vestedAmount) / totalAllocationNum) * intervalCount));

  const vestedPct =
    totalAllocationNum === 0
      ? 0
      : Math.min(100, Math.round((Number(status.vestedAmount) / totalAllocationNum) * 100));

  const intervalUnit =
    intervalDurationSec >= 86400 * 25 ? 'month' :
    intervalDurationSec >= 86400 * 6 ? 'week' :
    intervalDurationSec >= 3600 ? 'day' : 'interval';

  const totalVestedDisplay = `${vestedIntervals}/${intervalCount} ${intervalUnit}${intervalCount !== 1 ? 's' : ''} (${vestedPct}%)`;

  return (
    <section className="space-y-6">
      <VaultSummaryPanel metadata={metadata} />

      {activePendingRequest ? (
        <div className="rounded-[2rem] border border-amber-300/20 bg-amber-300/10 p-6">
          <p className="text-sm uppercase tracking-[0.25em] text-amber-300/80">Pending Request</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">The current withdrawal request is in progress and waiting for its next execution window.</p>
          <dl className="mt-5 grid gap-4 md:grid-cols-2">
            <Row label="Amount" value={formatTokenAmount(activePendingRequest.amount)} />
            <Row label="Allocation" value={activePendingRequest.requestType === 'protected' ? 'Protected allocation' : 'Surplus allocation'} />
            <Row label="Requested at" value={formatUnixSeconds(activePendingRequest.requestedAt)} />
            <Row label="Executable at" value={formatUnixSeconds(activePendingRequest.executableAt)} />
            <Row label="Expires at" value={formatUnixSeconds(activePendingRequest.expiresAt)} />
            <Row label="Status" value={activePendingRequest.isExecutable ? 'Executable now' : activePendingRequest.isCancelable ? 'Cancelable' : 'Waiting for execution'} />
          </dl>
          {pendingPurposeText ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Purpose</p>
              <p className="mt-2 text-sm leading-6 text-slate-100">{pendingPurposeText}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Vesting allocation + surplus containers */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Vesting Allocation */}
        <div className="rounded-[2rem] border border-sky-300/20 bg-sky-300/5 p-6">
          <p className="text-sm uppercase tracking-[0.25em] text-sky-300/80">Vesting Allocation</p>
          <p className="mt-1 text-xs text-slate-400">Funds released over time based on the vesting schedule</p>
          <dl className="mt-6 space-y-4">
            <SubStat
              label="Funding Status"
              value={status.funded ? 'Funded' : 'Pending'}
              hint="Whether Beacon sees the vault as funded and ready for full tracking."
              accent={status.funded ? 'text-emerald-400' : 'text-amber-400'}
            />
            <SubStat
              label="Total Allocation"
              value={formatTokenAmount(metadata.totalAllocation)}
              hint="Immutable allocation written into the deployment config."
            />
            <SubStat
              label="Remaining to Vest"
              value={remainingToVest}
              hint="Principal not yet released by the vesting schedule."
            />
            <SubStat
              label="Total Vested"
              value={totalVestedDisplay}
              hint="Intervals completed out of total, with overall percentage."
              accent="text-emerald-400"
            />
            <SubStat
              label="Available to Withdraw"
              value={formatTokenAmount(status.availableToWithdraw)}
              hint="Vested principal currently ready to request a withdrawal."
              accent="text-sky-300"
            />
            <SubStat
              label="Vested Already Withdrawn"
              value={formatTokenAmount(status.totalWithdrawn)}
              hint="Principal already withdrawn through the request flow."
            />
          </dl>
        </div>

        {/* Surplus Funds */}
        <div className="rounded-[2rem] border border-amber-300/20 bg-amber-300/5 p-6">
          <p className="text-sm uppercase tracking-[0.25em] text-amber-300/80">Surplus Funds</p>
          <p className="mt-1 text-xs text-slate-400">Funds not subject to the vesting schedule</p>
          <dl className="mt-6 space-y-4">
            <SubStat
              label="Surplus Available"
              value={formatTokenAmount(status.excessAvailableToWithdraw)}
              hint="Extra balance available to withdraw freely without affecting the vesting schedule."
            />
            <SubStat
              label="Surplus Withdrawn"
              value={formatTokenAmount(status.totalExcessWithdrawn)}
              hint="Extra balance already withdrawn from the vault."
            />
          </dl>
        </div>
      </div>

      {/* Immutable Rules + Deployment Proof */}
      <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Immutable Rules</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">These parameters were fixed when the vault was deployed.</p>
          <dl className="mt-5 space-y-4">
            <Row label="Start time" value={formatUnixSeconds(metadata.startTime)} />
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
