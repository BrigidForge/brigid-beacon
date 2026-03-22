import type { NormalizedEvent } from '@brigid/beacon-shared-types';
import { formatIso, formatStateLabel, formatTokenAmount, shortenAddress, shortenHash } from '../lib/format';
import { EXPLORERS } from '../lib/operatorVault';

function summarizeEvent(event: NormalizedEvent, purposeTexts: Record<string, string>): { title: string; detail: string; amount?: string; accent: string } {
  const payload = (event.payload ?? {}) as unknown as Record<string, unknown>;
  const amount = typeof payload.amount === 'string' ? payload.amount : undefined;
  const purposeHash = typeof payload.purposeHash === 'string' ? payload.purposeHash.toLowerCase() : '';
  const purposeText = purposeHash ? purposeTexts[purposeHash] ?? '' : '';

  const accent = 'border-white/10 bg-white/5';
  switch (event.kind) {
    case 'vault_created':
      return { title: 'Vault created', detail: `Owner ${shortenAddress(String(payload.owner ?? event.vaultAddress))} locked the schedule on-chain.`, accent };
    case 'vault_funded':
      return { title: 'Vault funded', detail: 'Protected vesting principal reached the vault.', amount, accent };
    case 'protected_withdrawal_requested':
      return { title: 'Protected withdrawal requested', detail: purposeText ? `Reason: ${purposeText}` : 'A vested principal withdrawal entered the request flow.', amount, accent };
    case 'excess_withdrawal_requested':
      return { title: 'Excess withdrawal requested', detail: purposeText ? `Reason: ${purposeText}` : 'An excess balance withdrawal entered the request flow.', amount, accent };
    case 'withdrawal_executed':
      return { title: 'Withdrawal executed', detail: purposeText ? `Executed request: ${purposeText}` : 'The pending request was executed on-chain.', amount, accent };
    case 'withdrawal_canceled':
      return { title: 'Withdrawal canceled', detail: purposeText ? `Canceled request: ${purposeText}` : 'The pending withdrawal request was canceled before execution.', amount, accent };
    case 'request_expired':
      return { title: 'Withdrawal expired', detail: purposeText ? `Expired request: ${purposeText}` : 'The execution window closed before the request was used.', amount, accent };
    case 'excess_deposited':
      return { title: 'Excess deposited', detail: `Extra tokens arrived from ${shortenAddress(String(payload.from ?? 'unknown source'))}.`, amount, accent };
    default:
      return { title: formatStateLabel(event.kind), detail: 'A normalized beacon event was indexed for this vault.', amount, accent };
  }
}

export function VaultActivityTab(props: { events: NormalizedEvent[]; purposeTexts: Record<string, string>; chainId: number }) {
  const explorerBase = EXPLORERS[props.chainId];

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.25em] text-fuchsia-200/70">Activity History</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Indexed vault activity</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          A readable replay of the vault lifecycle, ordered newest first so you can quickly inspect recent actions.
        </p>
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Event Timeline</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">Recent funding, request, execution, and expiry events from Beacon indexing.</p>
          </div>
          <p className="text-sm text-slate-400">{props.events.length} indexed event{props.events.length === 1 ? '' : 's'}</p>
        </div>
        <div className="mt-6 space-y-4">
          {props.events.length === 0 ? (
            <p className="text-sm text-slate-400">No events have been indexed for this vault yet.</p>
          ) : (
            props.events
              .slice()
              .reverse()
              .map((event) => {
                const summary = summarizeEvent(event, props.purposeTexts);
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
                      {explorerBase ? (
                        <a
                          href={`${explorerBase}/tx/${event.transactionHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-sky-400 transition hover:text-sky-200"
                        >
                          {shortenHash(event.transactionHash)} ↗
                        </a>
                      ) : (
                        <span className="font-mono text-slate-500">{shortenHash(event.transactionHash)}</span>
                      )}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>
    </section>
  );
}
