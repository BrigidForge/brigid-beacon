import { formatUnixSeconds } from '../lib/format';

type TimelinePhase = 'requested' | 'cancel' | 'delay' | 'execution' | 'expired';
type TimelineOutcome = 'active' | 'canceled' | 'executed' | 'expired';

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, value));
}

function phaseProgress(now: number, start: number, end: number, alreadyComplete: boolean) {
  if (alreadyComplete) return 100;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return clampProgress(((now - start) / Math.max(1, end - start)) * 100);
}

export function TimelineComponent(props: {
  requestedAt: number;
  cancelWindow: number;
  executableAt: number;
  expiresAt: number;
  nowSeconds: number;
  purposeText?: string;
  outcome?: TimelineOutcome;
  settledAt?: number | null;
}) {
  const cancelEnd = props.requestedAt + props.cancelWindow;
  const outcome = props.outcome ?? 'active';
  const effectiveNow = props.settledAt != null ? Math.min(props.settledAt, props.nowSeconds) : props.nowSeconds;
  const phase: TimelinePhase =
    effectiveNow < props.requestedAt
      ? 'requested'
      : effectiveNow < cancelEnd
        ? 'cancel'
        : effectiveNow < props.executableAt
          ? 'delay'
          : effectiveNow < props.expiresAt
            ? 'execution'
            : 'expired';

  const livePhaseLabel =
    phase === 'requested'
      ? 'Requested'
      : phase === 'cancel'
        ? 'Cancellation window'
        : phase === 'delay'
          ? 'Delay active'
          : phase === 'execution'
            ? 'Execution window'
            : 'Expired';

  const phaseLabel =
    outcome === 'canceled'
      ? 'Canceled'
      : outcome === 'executed'
        ? 'Executed'
        : outcome === 'expired'
          ? 'Expired'
          : livePhaseLabel;
  const isSettled = outcome !== 'active';

  const segments = [
    {
      label: 'Cancel phase',
      progress: isSettled ? 100 : phaseProgress(effectiveNow, props.requestedAt, cancelEnd, effectiveNow >= cancelEnd),
      active: outcome === 'active' && phase === 'cancel',
      complete: isSettled || effectiveNow >= cancelEnd,
      className:
        outcome === 'active' && phase === 'cancel'
          ? 'from-rose-500 via-rose-400 to-rose-300 shadow-[0_0_24px_rgba(244,63,94,0.45)]'
          : 'from-rose-300 to-amber-300',
    },
    {
      label: 'Delay phase',
      progress: isSettled ? 100 : phaseProgress(effectiveNow, cancelEnd, props.executableAt, effectiveNow >= props.executableAt),
      active: outcome === 'active' && phase === 'delay',
      complete: isSettled || effectiveNow >= props.executableAt,
      className: 'from-amber-300 to-sky-300',
    },
    {
      label: 'Execution phase',
      progress: isSettled ? 100 : phaseProgress(effectiveNow, props.executableAt, props.expiresAt, effectiveNow >= props.expiresAt),
      active: outcome === 'active' && phase === 'execution',
      complete: isSettled || effectiveNow >= props.expiresAt,
      className: 'from-sky-300 to-emerald-300',
    },
  ];

  const settledMessage =
    outcome === 'canceled'
      ? 'This withdrawal request was canceled before execution.'
      : outcome === 'executed'
        ? 'This withdrawal request was executed successfully on-chain.'
        : outcome === 'expired'
          ? 'This withdrawal request expired before it was executed.'
          : null;

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Withdrawal Timeline</p>
          <p className="mt-2 text-lg font-medium text-white">{phaseLabel}</p>
          {props.purposeText ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Reason: {props.purposeText}</p> : null}
        </div>
        <div className="text-right text-sm text-slate-300">
          <p>Requested {formatUnixSeconds(String(props.requestedAt))}</p>
          <p>Executable {formatUnixSeconds(String(props.executableAt))}</p>
          {props.settledAt ? <p>Settled {formatUnixSeconds(String(props.settledAt))}</p> : null}
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {segments.map((segment) => (
          <div key={segment.label}>
            <div className="mb-2 flex min-h-[2.5rem] items-start justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-slate-400">
              <span className="leading-5">{segment.label}</span>
              {!isSettled ? (
                <span className={`shrink-0 leading-5 ${segment.complete ? 'text-emerald-200' : segment.active ? 'text-white' : 'text-slate-500'}`}>
                  {Math.round(segment.progress)}%
                </span>
              ) : null}
            </div>
            <div className="h-3 rounded-full bg-white/10">
              <div
                className={`h-3 rounded-full bg-gradient-to-r ${segment.className} transition-[width] duration-500`}
                style={{ width: `${segment.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {settledMessage ? <p className="mt-4 text-sm text-slate-300">{settledMessage}</p> : null}
    </div>
  );
}
