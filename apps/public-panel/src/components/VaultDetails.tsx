import { useEffect, useState } from 'react';
import type { DeploymentProof, NormalizedEvent, VaultMetadata, VaultStatus } from '@brigid/beacon-shared-types';
import {
  formatAmountLabel,
  formatDurationSeconds,
  formatIso,
  formatNumberString,
  formatRelativeCountdown,
  formatRelativeDelta,
  formatStateLabel,
  formatTokenAmount,
  formatUnixSeconds,
  shortenAddress,
  shortenHash,
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

function SummaryBadge(props: { label: string; value: string; tone?: 'default' | 'warm' | 'cool' | 'success' }) {
  const toneClass =
    props.tone === 'warm'
      ? 'border-amber-300/30 bg-amber-300/10 text-amber-100'
      : props.tone === 'cool'
        ? 'border-sky-300/30 bg-sky-300/10 text-sky-100'
        : props.tone === 'success'
          ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
          : 'border-white/10 bg-white/5 text-white';

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{props.label}</p>
      <p className="mt-2 text-sm font-medium">{props.value}</p>
    </div>
  );
}

function describeVaultState(status: VaultStatus): string {
  switch (status.state) {
    case 'idle':
      return status.funded ? 'Funds are present, but vesting has not started to unlock yet.' : 'Waiting for the initial funding transaction.';
    case 'active_no_request':
      return 'Vesting is active and there is no pending withdrawal request.';
    case 'protected_request_pending_cancel':
    case 'excess_request_pending_cancel':
      return 'A withdrawal request exists and is still inside the cancel window.';
    case 'protected_request_pending_execution':
    case 'excess_request_pending_execution':
      return 'The cancel window has passed. The request is approaching its execution window.';
    case 'request_executable':
      return 'A withdrawal request can be executed right now.';
    case 'request_expired':
      return 'The last withdrawal request expired without being executed.';
    case 'completed_recently':
      return 'The allocation has effectively finished vesting and recent activity completed.';
    case 'canceled_recently':
      return 'The vault was canceled recently and only post-cancel balances may remain.';
    default:
      return 'Vault status is available.';
  }
}

function describePendingRequest(status: VaultStatus, nowSeconds: number): string {
  if (!status.pendingRequest) return 'No withdrawal request is active.';

  const request = status.pendingRequest;
  if (request.isCancelable) {
    return `Cancel window remains open ${formatRelativeDelta(Number(request.executableAt) - nowSeconds)}.`;
  }

  if (request.isExecutable) {
    return `This ${request.requestType} request is executable until ${formatUnixSeconds(request.expiresAt)}.`;
  }

  return `Execution opens ${formatRelativeDelta(Number(request.executableAt) - nowSeconds)} and expires ${formatRelativeDelta(Number(request.expiresAt) - nowSeconds)}.`;
}

function summarizeEvent(event: NormalizedEvent): { title: string; detail: string; amount?: string; accent: string } {
  const payload = (event.payload ?? {}) as unknown as Record<string, unknown>;
  const amount = typeof payload.amount === 'string' ? payload.amount : undefined;

  switch (event.kind) {
    case 'vault_created':
      return {
        title: 'Vault created',
        detail: `Owner ${shortenAddress(String(payload.owner ?? event.vaultAddress))} locked the schedule on-chain.`,
        accent: 'border-white/10 bg-white/5',
      };
    case 'vault_funded':
      return {
        title: 'Vault funded',
        detail: 'Protected vesting principal reached the vault.',
        amount,
        accent: 'border-emerald-300/25 bg-emerald-300/10',
      };
    case 'protected_withdrawal_requested':
      return {
        title: 'Protected withdrawal requested',
        detail: 'A vested principal withdrawal entered the request flow.',
        amount,
        accent: 'border-sky-300/25 bg-sky-300/10',
      };
    case 'excess_withdrawal_requested':
      return {
        title: 'Excess withdrawal requested',
        detail: 'An excess balance withdrawal entered the request flow.',
        amount,
        accent: 'border-amber-300/25 bg-amber-300/10',
      };
    case 'withdrawal_executed':
      return {
        title: 'Withdrawal executed',
        detail: 'The pending request was executed on-chain.',
        amount,
        accent: 'border-emerald-300/25 bg-emerald-300/10',
      };
    case 'withdrawal_canceled':
      return {
        title: 'Withdrawal canceled',
        detail: 'The pending withdrawal request was canceled before execution.',
        amount,
        accent: 'border-rose-300/25 bg-rose-300/10',
      };
    case 'request_expired':
      return {
        title: 'Withdrawal expired',
        detail: 'The execution window closed before the request was used.',
        amount,
        accent: 'border-amber-300/25 bg-amber-300/10',
      };
    case 'excess_deposited':
      return {
        title: 'Excess deposited',
        detail: `Extra tokens arrived from ${shortenAddress(String(payload.from ?? 'unknown source'))}.`,
        amount,
        accent: 'border-fuchsia-300/25 bg-fuchsia-300/10',
      };
    default:
      return {
        title: formatStateLabel(event.kind),
        detail: 'A normalized beacon event was indexed for this vault.',
        amount,
        accent: 'border-white/10 bg-white/5',
      };
  }
}

export function VaultDetails(props: {
  metadata: VaultMetadata;
  status: VaultStatus;
  events: NormalizedEvent[];
  proof: DeploymentProof;
}) {
  const { metadata, status, events, proof } = props;
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const protectedCoverage = metadata.totalAllocation === '0'
    ? '0%'
    : `${Math.min(100, Math.round((Number(status.vestedAmount) / Number(metadata.totalAllocation)) * 100))}% vested`;
  const totalAvailable = (BigInt(status.availableToWithdraw) + BigInt(status.excessAvailableToWithdraw)).toString();

  return (
    <section className="space-y-8">
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_38%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.14),transparent_34%),rgba(255,255,255,0.05)] p-8 shadow-[0_25px_90px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.35em] text-amber-300/80">Vault Overview</p>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold text-white">{formatStateLabel(status.state)}</h1>
              <p className="max-w-2xl text-base leading-7 text-slate-200/90">{describeVaultState(status)}</p>
            </div>
            <p className="font-mono text-sm text-slate-300">{metadata.address}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryBadge label="Last indexed block" value={`#${status.updatedAtBlock}`} tone="cool" />
            <SummaryBadge label="Updated" value={formatIso(status.updatedAt)} />
            <SummaryBadge label="Owner" value={shortenAddress(metadata.owner)} />
            <SummaryBadge label="Funding" value={status.funded ? 'Funded and tracked' : 'Awaiting funding'} tone={status.funded ? 'success' : 'warm'} />
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Withdrawal posture</p>
            <p className="mt-3 text-lg font-medium text-white">{formatAmountLabel(totalAvailable, 'available now')}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {status.pendingRequest ? describePendingRequest(status, nowSeconds) : 'There is no pending request slowing down the next withdrawal.'}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Schedule progress</p>
            <p className="mt-3 text-lg font-medium text-white">{protectedCoverage}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {formatAmountLabel(status.vestedAmount)} vested out of {formatAmountLabel(metadata.totalAllocation)} total allocation.
            </p>
          </div>
        </div>

        {status.pendingRequest ? (
          <div className="mt-6 rounded-3xl border border-amber-300/25 bg-amber-300/10 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-amber-200/80">Pending request</p>
                <p className="mt-2 text-lg font-medium text-white">
                  {formatStateLabel(status.pendingRequest.requestType)} request for {formatAmountLabel(status.pendingRequest.amount)}
                </p>
              </div>
              <p className="text-sm text-amber-50/90">
                {status.pendingRequest.isExecutable
                  ? `Executable ${formatRelativeCountdown(status.pendingRequest.expiresAt)}`
                  : `Execution ${formatRelativeCountdown(status.pendingRequest.executableAt)}`}
              </p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-xs text-slate-400">Requested</p>
                <p className="mt-1 text-sm text-white">{formatUnixSeconds(status.pendingRequest.requestedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Executable at</p>
                <p className="mt-1 text-sm text-white">{formatUnixSeconds(status.pendingRequest.executableAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Expires at</p>
                <p className="mt-1 text-sm text-white">{formatUnixSeconds(status.pendingRequest.expiresAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Current state</p>
                <p className="mt-1 text-sm text-white">
                  {status.pendingRequest.isCancelable
                    ? 'Cancelable'
                    : status.pendingRequest.isExecutable
                      ? 'Executable now'
                      : 'Waiting to unlock'}
                </p>
              </div>
            </div>
          </div>
        ) : null}
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
          label="Vested Amount"
          value={formatTokenAmount(status.vestedAmount)}
          hint="Protected amount unlocked by the schedule so far."
          tone="success"
        />
        <StatCard
          label="Protected Withdrawn"
          value={formatTokenAmount(status.totalWithdrawn)}
          hint="Principal already withdrawn through the request flow."
        />
        <StatCard
          label="Excess Withdrawn"
          value={formatTokenAmount(status.totalExcessWithdrawn)}
          hint="Excess balance already withdrawn."
        />
        <StatCard
          label="Excess Balance"
          value={formatTokenAmount(status.excessBalance)}
          hint="Extra tokens sitting in the vault beyond the protected schedule."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Event Timeline</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">A readable replay of the vault lifecycle, newest first.</p>
            </div>
            <p className="text-sm text-slate-400">{events.length} indexed event{events.length === 1 ? '' : 's'}</p>
          </div>
          <div className="mt-6 space-y-4">
            {events.length === 0 ? (
              <p className="text-sm text-slate-400">No events have been indexed for this vault yet.</p>
            ) : (
              events
                .slice()
                .reverse()
                .map((event) => {
                  const summary = summarizeEvent(event);
                  return (
                    <div key={event.id} className={`rounded-3xl border p-4 ${summary.accent}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <p className="text-base font-medium text-white">{summary.title}</p>
                          <p className="text-sm leading-6 text-slate-200/90">{summary.detail}</p>
                        </div>
                        {summary.amount ? (
                          <div className="rounded-2xl border border-white/10 bg-slate-950/55 px-3 py-2 text-sm font-medium text-white">
                            {formatTokenAmount(summary.amount)}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-4 flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                        <span>{formatIso(event.timestamp)}</span>
                        <span>Block #{event.blockNumber}</span>
                        <span className="font-mono text-slate-500">{shortenHash(event.transactionHash)}</span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        <div className="space-y-6">
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
      </div>
    </section>
  );
}
