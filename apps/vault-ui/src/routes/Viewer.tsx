import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { NormalizedEvent, VaultMetadata, VaultStatus } from '@brigid/beacon-shared-types';
import { fetchVaultBundle, createPublicEmailSubscription } from '../lib/api';
import {
  formatTokenAmount,
  formatUnixSeconds,
  formatDurationSeconds,
  formatRelativeCountdown,
  formatStateLabel,
  shortenHash,
} from '../lib/format';
import { CopyableAddress } from '../components/CopyableAddress';

type Tab = 'status' | 'activity' | 'notifications';

type VaultBundle = {
  metadata: VaultMetadata;
  status: VaultStatus;
  events: NormalizedEvent[];
  purposeTexts: Record<string, string>;
};

const REFRESH_MS = 60_000;

export default function Viewer() {
  const { vault: vaultAddress = '' } = useParams<{ vault: string }>();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<VaultBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('status');

  useEffect(() => {
    if (!vaultAddress) return;
    let cancelled = false;

    async function load(background = false) {
      if (!background) { setLoading(true); setError(null); }
      try {
        const result = await fetchVaultBundle(vaultAddress);
        if (!cancelled) { setBundle(result); setError(null); }
      } catch (err) {
        if (!cancelled && !background) {
          setBundle(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled && !background) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => { void load(true); }, REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [vaultAddress]);

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-slate-300">
        Loading vault <span className="font-mono text-sm text-white">{vaultAddress.slice(0, 10)}…</span>…
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="space-y-4 rounded-[2rem] border border-rose-300/20 bg-rose-300/10 p-8">
        <p className="text-sm uppercase tracking-widest text-rose-300/70">Vault unavailable</p>
        <p className="text-slate-200">{error ?? 'Unable to load vault data.'}</p>
        <button
          type="button"
          onClick={() => navigate('/view')}
          className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white transition hover:border-white/30"
        >
          ← Try another address
        </button>
      </div>
    );
  }

  const { metadata, status, events, purposeTexts } = bundle;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/view" className="text-sm text-slate-400 transition hover:text-slate-200">← Back</Link>
          <CopyableAddress value={metadata.address} className="mt-2 text-sm text-slate-400" />
          <div className="mt-1 flex items-center gap-2">
            <StateBadge state={status.state} />
            {status.funded ? (
              <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-xs text-emerald-300">Funded</span>
            ) : (
              <span className="rounded-full border border-rose-300/30 bg-rose-300/10 px-2 py-0.5 text-xs text-rose-300">Unfunded</span>
            )}
          </div>
        </div>
        <a
          href={`/operator/${metadata.address}`}
          className="rounded-2xl border border-sky-300/20 px-4 py-2 text-sm text-sky-200 transition hover:border-sky-300/40 hover:bg-sky-300/10"
        >
          Manage as operator →
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/5 p-1">
        {(['status', 'activity', 'notifications'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium capitalize transition ${
              tab === t
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'status' && <StatusTab metadata={metadata} status={status} purposeTexts={purposeTexts} />}
      {tab === 'activity' && <ActivityTab events={events} purposeTexts={purposeTexts} />}
      {tab === 'notifications' && <NotificationsTab vaultAddress={metadata.address} />}
    </div>
  );
}

/* ── Status tab ───────────────────────────────────────────────── */

function StatusTab({ metadata, status, purposeTexts }: { metadata: VaultMetadata; status: VaultStatus; purposeTexts: Record<string, string> }) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const activePendingRequest =
    status.pendingRequest && Number(status.pendingRequest.expiresAt) > nowSeconds
      ? status.pendingRequest
      : null;
  const pendingPurposeText = activePendingRequest
    ? purposeTexts[activePendingRequest.purposeHash.toLowerCase()] ?? ''
    : '';

  return (
    <div className="flex flex-col gap-4">
      {activePendingRequest && (
        <div className="rounded-[2rem] border border-amber-300/20 bg-amber-300/10 p-5">
          <p className="text-xs uppercase tracking-widest text-amber-300/70">Pending Request</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Field label="Amount" value={formatTokenAmount(activePendingRequest.amount)} />
            <Field label="Type" value={activePendingRequest.requestType} />
            <Field label="Requested at" value={formatUnixSeconds(activePendingRequest.requestedAt)} />
            <Field label="Executable at" value={formatUnixSeconds(activePendingRequest.executableAt)} />
            <Field label="Expires at" value={`${formatUnixSeconds(activePendingRequest.expiresAt)} (${formatRelativeCountdown(activePendingRequest.expiresAt)})`} />
          </div>
          {pendingPurposeText ? <p className="mt-3 text-sm leading-6 text-slate-200">{pendingPurposeText}</p> : null}
        </div>
      )}

      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
        <p className="mb-4 text-xs uppercase tracking-widest text-slate-400">Balances</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Total Allocation" value={formatTokenAmount(metadata.totalAllocation)} />
          <Field label="Vested Amount" value={formatTokenAmount(status.vestedAmount)} />
          <Field label="Available to Withdraw" value={formatTokenAmount(status.availableToWithdraw)} />
          <Field label="Total Withdrawn" value={formatTokenAmount(status.totalWithdrawn)} />
          <Field label="Protected Balance" value={formatTokenAmount(status.protectedOutstandingBalance)} />
          <Field label="Excess Balance" value={formatTokenAmount(status.excessBalance)} />
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
        <p className="mb-4 text-xs uppercase tracking-widest text-slate-400">Schedule</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
            <p className="text-[11px] uppercase tracking-widest text-slate-400">Token</p>
            <CopyableAddress value={metadata.token} className="mt-1 text-sm text-slate-100" />
          </div>
          <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
            <p className="text-[11px] uppercase tracking-widest text-slate-400">Owner</p>
            <CopyableAddress value={metadata.owner} className="mt-1 text-sm text-slate-100" />
          </div>
          <Field label="Start Time" value={formatUnixSeconds(metadata.startTime)} />
          <Field label="Cliff" value={formatDurationSeconds(metadata.cliffDuration)} />
          <Field label="Interval" value={`${formatDurationSeconds(metadata.intervalDuration)} × ${metadata.intervalCount}`} />
          <Field label="Withdrawal Delay" value={formatDurationSeconds(metadata.withdrawalDelay)} />
          <Field label="Cancel Window" value={formatDurationSeconds(metadata.cancelWindow)} />
          <Field label="Execution Window" value={formatDurationSeconds(metadata.executionWindow)} />
        </div>
      </div>
    </div>
  );
}

/* ── Activity tab ─────────────────────────────────────────────── */

const EVENT_LABELS: Record<string, string> = {
  vault_created: 'Vault Created',
  vault_funded: 'Vault Funded',
  excess_deposited: 'Excess Deposited',
  protected_withdrawal_requested: 'Withdrawal Requested',
  excess_withdrawal_requested: 'Excess Withdrawal Requested',
  withdrawal_canceled: 'Withdrawal Canceled',
  withdrawal_executed: 'Withdrawal Executed',
  request_expired: 'Request Expired',
};

const EVENT_COLOR: Record<string, string> = {
  vault_created: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-300',
  vault_funded: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-300',
  excess_deposited: 'border-sky-300/20 bg-sky-300/10 text-sky-300',
  protected_withdrawal_requested: 'border-amber-300/20 bg-amber-300/10 text-amber-300',
  excess_withdrawal_requested: 'border-amber-300/20 bg-amber-300/10 text-amber-300',
  withdrawal_canceled: 'border-slate-300/20 bg-slate-300/10 text-slate-300',
  withdrawal_executed: 'border-sky-300/20 bg-sky-300/10 text-sky-300',
  request_expired: 'border-rose-300/20 bg-rose-300/10 text-rose-300',
};

function ActivityTab({ events, purposeTexts }: { events: NormalizedEvent[]; purposeTexts: Record<string, string> }) {
  if (events.length === 0) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center text-slate-400">
        No events recorded yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {[...events].reverse().map((event) => {
        const payload = (event.payload ?? {}) as unknown as Record<string, unknown>;
        const purposeHash = typeof payload.purposeHash === 'string' ? payload.purposeHash.toLowerCase() : '';
        const purposeText = purposeHash ? purposeTexts[purposeHash] ?? '' : '';
        return (
        <div key={event.id} className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`rounded-full border px-3 py-0.5 text-xs font-medium ${EVENT_COLOR[event.kind] ?? 'border-white/10 text-slate-300'}`}>
              {EVENT_LABELS[event.kind] ?? event.kind}
            </span>
            <span className="text-xs text-slate-500">{formatUnixSeconds(event.timestamp)}</span>
          </div>
          {purposeText ? <p className="mt-3 text-sm leading-6 text-slate-300">{purposeText}</p> : null}
          <a
            href={`https://bscscan.com/tx/${event.transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block font-mono text-xs text-slate-500 transition hover:text-slate-300"
          >
            {shortenHash(event.transactionHash)}
          </a>
        </div>
      )})}
    </div>
  );
}

/* ── Notifications tab ────────────────────────────────────────── */

const ALL_EVENT_KINDS = [
  'vault_funded',
  'protected_withdrawal_requested',
  'excess_withdrawal_requested',
  'withdrawal_canceled',
  'withdrawal_executed',
  'request_expired',
];

function NotificationsTab({ vaultAddress }: { vaultAddress: string }) {
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<string[]>(ALL_EVENT_KINDS);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  function toggle(kind: string) {
    setSelected((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || selected.length === 0) return;
    setStatus('loading');
    try {
      const result = await createPublicEmailSubscription({
        vaultAddress,
        email: email.trim(),
        eventKinds: selected,
      });
      setStatus('success');
      setMessage(result.message);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Subscription failed.');
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-300/10 p-8">
        <p className="text-sm uppercase tracking-widest text-emerald-300/70">Subscribed</p>
        <p className="mt-2 text-slate-100">{message}</p>
        <button
          type="button"
          onClick={() => { setStatus('idle'); setMessage(''); setEmail(''); }}
          className="mt-4 rounded-2xl border border-white/10 px-4 py-2 text-sm text-white"
        >
          Add another
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
      <p className="text-xs uppercase tracking-widest text-slate-400">Email Alerts</p>
      <p className="mt-2 text-sm text-slate-400">
        Receive email notifications when vault events occur. Check your inbox to confirm.
      </p>

      <form onSubmit={(e) => { void handleSubmit(e); }} className="mt-6 flex flex-col gap-5">
        <div>
          <label htmlFor="notify-email" className="block text-sm text-slate-300">Email address</label>
          <input
            id="notify-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20"
          />
        </div>

        <div>
          <p className="mb-3 text-sm text-slate-300">Notify me about</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_EVENT_KINDS.map((kind) => (
              <label key={kind} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-4 py-2.5 transition hover:border-white/20">
                <input
                  type="checkbox"
                  checked={selected.includes(kind)}
                  onChange={() => toggle(kind)}
                  className="accent-amber-300"
                />
                <span className="text-sm text-slate-300">{EVENT_LABELS[kind] ?? kind}</span>
              </label>
            ))}
          </div>
        </div>

        {status === 'error' && (
          <p className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{message}</p>
        )}

        <button
          type="submit"
          disabled={!email.trim() || selected.length === 0 || status === 'loading'}
          className="rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'loading' ? 'Subscribing…' : 'Subscribe to alerts'}
        </button>
      </form>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
      <p className="text-[11px] uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-100">{value}</p>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const active = state.startsWith('active') || state === 'request_executable';
  const warn = state.includes('pending');
  const muted = state === 'idle' || state.includes('recently');
  const cls = active
    ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-300'
    : warn
    ? 'border-amber-300/30 bg-amber-300/10 text-amber-300'
    : muted
    ? 'border-slate-300/20 bg-slate-300/10 text-slate-300'
    : 'border-rose-300/30 bg-rose-300/10 text-rose-300';
  return (
    <span className={`rounded-full border px-3 py-0.5 text-xs font-medium ${cls}`}>
      {formatStateLabel(state)}
    </span>
  );
}
