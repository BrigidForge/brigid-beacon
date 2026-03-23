import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { NormalizedEvent, VaultMetadata, VaultStatus } from '@brigid/beacon-shared-types';
import {
  fetchVaultBundle,
  createPublicEmailSubscription,
  confirmPublicEmailSubscription,
  fetchManagedPublicEmailSubscriptionStatus,
  fetchPublicEmailSubscriptionStatus,
  requestPublicEmailManageLink,
  type PublicEmailSubscriptionResponse,
  type PublicEmailManageLinkResponse,
  type PublicEmailSubscriptionStatusResponse,
  unsubscribePublicEmailSubscription,
} from '../lib/api';
import {
  formatTokenAmount,
  formatUnixSeconds,
  formatDurationSeconds,
  formatRelativeCountdown,
  shortenHash,
} from '../lib/format';
import { CopyableAddress } from '../components/CopyableAddress';
import { TimelineComponent } from '../components/TimelineComponent';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [bundle, setBundle] = useState<VaultBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('status');
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const [emailActionStatus, setEmailActionStatus] = useState<{
    tone: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (
      searchParams.has('confirmEmailToken') ||
      searchParams.has('unsubscribeEmailToken') ||
      searchParams.has('manageEmailToken')
    ) {
      setTab('notifications');
    }
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 1_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

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

  useEffect(() => {
    if (!vaultAddress) return;
    const confirmToken = searchParams.get('confirmEmailToken');
    const unsubscribeToken = searchParams.get('unsubscribeEmailToken');
    if (!confirmToken && !unsubscribeToken) return;

    let cancelled = false;

    async function handleEmailAction() {
      try {
        if (confirmToken) {
          const result = await confirmPublicEmailSubscription(confirmToken);
          if (!cancelled) {
            setEmailActionStatus({
              tone: 'success',
              title: 'Subscription confirmed',
              message: `${result.email} is now subscribed to vault alerts.`,
            });
          }
        } else if (unsubscribeToken) {
          const result = await unsubscribePublicEmailSubscription(unsubscribeToken);
          if (!cancelled) {
            setEmailActionStatus({
              tone: 'success',
              title: 'Subscription removed',
              message: `${result.email} will no longer receive alerts for this vault.`,
            });
          }
        }
      } catch (actionError) {
        if (!cancelled) {
          setEmailActionStatus({
            tone: 'error',
            title: 'Email action failed',
            message: actionError instanceof Error ? actionError.message : 'Unable to complete the email action.',
          });
        }
      } finally {
        if (!cancelled) {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete('confirmEmailToken');
          nextParams.delete('unsubscribeEmailToken');
          setSearchParams(nextParams, { replace: true });
        }
      }
    }

    void handleEmailAction();
    return () => { cancelled = true; };
  }, [vaultAddress, searchParams, setSearchParams]);

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
            <StateBadge status={status} />
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
      {emailActionStatus ? (
        <div className={`rounded-[2rem] border px-5 py-4 ${
          emailActionStatus.tone === 'success'
            ? 'border-emerald-300/20 bg-emerald-300/10'
            : 'border-rose-300/20 bg-rose-300/10'
        }`}>
          <p className={`text-sm uppercase tracking-widest ${
            emailActionStatus.tone === 'success' ? 'text-emerald-300/70' : 'text-rose-300/70'
          }`}>
            {emailActionStatus.title}
          </p>
          <p className="mt-2 text-slate-100">{emailActionStatus.message}</p>
        </div>
      ) : null}

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
      {tab === 'status' && <StatusTab metadata={metadata} status={status} purposeTexts={purposeTexts} nowSeconds={nowSeconds} />}
      {tab === 'activity' && <ActivityTab events={events} purposeTexts={purposeTexts} />}
      {tab === 'notifications' && <NotificationsTab vaultAddress={metadata.address} />}
    </div>
  );
}

/* ── Status tab ───────────────────────────────────────────────── */

function StatusTab({ metadata, status, purposeTexts, nowSeconds }: { metadata: VaultMetadata; status: VaultStatus; purposeTexts: Record<string, string>; nowSeconds: number }) {
  const activePendingRequest =
    status.pendingRequest && Number(status.pendingRequest.expiresAt) > nowSeconds
      ? status.pendingRequest
      : null;
  const pendingPurposeText = activePendingRequest
    ? purposeTexts[activePendingRequest.purposeHash.toLowerCase()] ?? ''
    : '';

  return (
    <div className="flex flex-col gap-4">
      {activePendingRequest ? (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <TimelineComponent
            requestedAt={Number(activePendingRequest.requestedAt)}
            cancelWindow={Number(metadata.cancelWindow)}
            executableAt={Number(activePendingRequest.executableAt)}
            expiresAt={Number(activePendingRequest.expiresAt)}
            nowSeconds={nowSeconds}
            purposeText={pendingPurposeText || undefined}
          />
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Request Details</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Amount" value={formatTokenAmount(activePendingRequest.amount)} />
              <Field label="Allocation" value={activePendingRequest.requestType === 'protected' ? 'Vested allocation' : 'Surplus allocation'} />
              <Field label="Requested at" value={formatUnixSeconds(activePendingRequest.requestedAt)} />
              <Field label="Executable at" value={formatUnixSeconds(activePendingRequest.executableAt)} />
              <Field label="Expires at" value={`${formatUnixSeconds(activePendingRequest.expiresAt)} (${formatRelativeCountdown(activePendingRequest.expiresAt)})`} />
              <Field
                label="Phase"
                value={
                  activePendingRequest.isCancelable
                    ? 'Cancel phase'
                    : activePendingRequest.isExecutable
                      ? 'Execution phase'
                      : 'Delay phase'
                }
              />
            </div>
            {pendingPurposeText ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Purpose</p>
                <p className="mt-2 text-sm leading-6 text-slate-100">{pendingPurposeText}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

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
  'excess_deposited',
  'protected_withdrawal_requested',
  'excess_withdrawal_requested',
  'withdrawal_executed',
  'request_expired',
];

function NotificationsTab({ vaultAddress }: { vaultAddress: string }) {
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<string[]>(ALL_EVENT_KINDS);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [subscriptionResult, setSubscriptionResult] = useState<PublicEmailSubscriptionResponse | null>(null);
  const [existingStatus, setExistingStatus] = useState<PublicEmailSubscriptionStatusResponse | null>(null);
  const [manageMode, setManageMode] = useState(false);
  const [managedUnsubscribeToken, setManagedUnsubscribeToken] = useState<string | null>(null);
  const [manageLinkPreview, setManageLinkPreview] = useState<PublicEmailManageLinkResponse | null>(null);

  useEffect(() => {
    if (!existingStatus) return;
    if (email.trim().toLowerCase() !== existingStatus.email.toLowerCase()) {
      setExistingStatus(null);
      setManageMode(false);
      setManagedUnsubscribeToken(null);
      setSubscriptionResult(null);
      setManageLinkPreview(null);
    }
  }, [email, existingStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const manageTokenFromUrl = params.get('manageEmailToken');
    if (!manageTokenFromUrl) return;
    const verifiedManageToken = manageTokenFromUrl;

    let cancelled = false;

    async function loadManagedStatus() {
      setStatus('loading');
      try {
        const subscriptionStatus = await fetchManagedPublicEmailSubscriptionStatus(verifiedManageToken);
        if (cancelled) return;
        setEmail(subscriptionStatus.email);
        setSelected(subscriptionStatus.eventKinds);
        setExistingStatus(subscriptionStatus);
        setManageMode(true);
        setManagedUnsubscribeToken(subscriptionStatus.unsubscribeToken ?? null);
        setMessage('Secure management link verified. You can update or unsubscribe from this subscription below.');
        setStatus('idle');
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setMessage(err instanceof Error ? err.message : 'Unable to load secure subscription management.');
        }
      }
    }

    void loadManagedStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(kind: string) {
    setSelected((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );
  }

  async function loadExistingStatus(emailAddress: string) {
    const subscriptionStatus = await fetchPublicEmailSubscriptionStatus(vaultAddress, emailAddress);
    setExistingStatus(subscriptionStatus);
    if (subscriptionStatus.subscribed && subscriptionStatus.eventKinds.length > 0) {
      setSelected(subscriptionStatus.eventKinds);
    }
    return subscriptionStatus;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || selected.length === 0) return;
    setStatus('loading');
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const needsLookup =
        !manageMode ||
        !existingStatus ||
        existingStatus.email.toLowerCase() !== normalizedEmail;

      if (needsLookup) {
        const subscriptionStatus = await loadExistingStatus(normalizedEmail);
        if (subscriptionStatus.subscribed && !subscriptionStatus.disabled) {
          if (subscriptionStatus.confirmed) {
            setManageMode(false);
            setStatus('idle');
            setMessage(
              'Email Address Already Subscribed. If you would like to make changes to an existing subscription click here.',
            );
            return;
          }

          setManageMode(false);
          setMessage('Pending subscription found. Submitting again will refresh the confirmation email and save the selections below.');
        }

        if (subscriptionStatus.disabled) {
          setManageMode(false);
          setMessage('This email had a previous subscription. Current selections are shown below. Submit again to start a fresh subscription.');
        }
      }

      const result = await createPublicEmailSubscription({
        vaultAddress,
        email: normalizedEmail,
        eventKinds: selected,
      });
      setSubscriptionResult(result);
      setManageLinkPreview(null);
      setExistingStatus({
        vaultAddress: result.vaultAddress,
        email: result.email,
        subscribed: true,
        confirmed: result.status === 'confirmed',
        disabled: false,
        eventKinds: result.eventKinds,
        confirmedAt: result.status === 'confirmed' ? new Date().toISOString() : null,
        disabledAt: null,
      });
      setManageMode(false);
      setStatus('success');
      setMessage(
        result.status === 'confirmed'
          ? 'Email alert subscriptions updated.'
          : result.message,
      );
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Subscription failed.');
    }
  }

  async function handleResendConfirmation() {
    if (!email.trim() || selected.length === 0) return;
    setStatus('loading');
    setMessage('');
    setSubscriptionResult(null);
    try {
      const result = await createPublicEmailSubscription({
        vaultAddress,
        email: email.trim().toLowerCase(),
        eventKinds: selected,
      });
      setSubscriptionResult(result);
      setManageLinkPreview(null);
      setExistingStatus({
        vaultAddress: result.vaultAddress,
        email: result.email,
        subscribed: true,
        confirmed: false,
        disabled: false,
        eventKinds: result.eventKinds,
        confirmedAt: null,
        disabledAt: null,
      });
      setManageMode(false);
      setStatus('success');
      setMessage(
        result.deliveryMode === 'brevo'
          ? 'Confirmation email re-sent. Please check your inbox and spam folder.'
          : 'Confirmation link refreshed. Use the preview link below to continue locally.',
      );
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unable to resend the confirmation email.');
    }
  }

  async function handleSendManageLink() {
    if (!email.trim()) return;
    setStatus('loading');
    setMessage('');
    setSubscriptionResult(null);
    try {
      const result = await requestPublicEmailManageLink(vaultAddress, email.trim());
      setManageLinkPreview(result);
      setStatus('success');
      setMessage(result.message);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unable to send a secure management link.');
    }
  }

  async function handleManagedUnsubscribe() {
    if (!managedUnsubscribeToken) return;
    setStatus('loading');
    setMessage('');
    setSubscriptionResult(null);
    try {
      const result = await unsubscribePublicEmailSubscription(managedUnsubscribeToken);
      setExistingStatus({
        vaultAddress: result.vaultAddress,
        email: result.email,
        subscribed: true,
        confirmed: false,
        disabled: true,
        eventKinds: [],
        confirmedAt: null,
        disabledAt: result.unsubscribedAt,
      });
      setManageMode(false);
      setManagedUnsubscribeToken(null);
      setStatus('success');
      setMessage(`${result.email} has been unsubscribed from vault email notifications.`);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unable to unsubscribe this email.');
    }
  }

  const actionLabel = manageMode ? 'Update subscriptions' : 'Subscribe to alerts';
  const currentStatusLabel =
    existingStatus == null
      ? null
      : existingStatus.disabled
        ? 'Unsubscribed'
        : existingStatus.confirmed
          ? 'Subscribed'
          : existingStatus.subscribed
            ? 'Pending confirmation'
            : 'Not subscribed';

  if (status === 'success') {
    return (
      <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-300/10 p-8">
        <p className="text-sm uppercase tracking-widest text-emerald-300/70">Email Alerts</p>
        <p className="mt-2 text-slate-100">{message}</p>
        {subscriptionResult?.deliveryMode === 'preview' ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4 text-sm text-sky-100">
            <p className="font-medium text-white">Preview mode</p>
            <p>Brevo is not active here, so use the generated confirmation link below to finish the subscription locally.</p>
            {subscriptionResult.previewConfirmUrl ? (
              <a
                href={subscriptionResult.previewConfirmUrl}
                className="inline-flex text-sky-200 underline decoration-sky-300/60 underline-offset-4 transition hover:text-sky-50"
              >
                Open confirmation link
              </a>
            ) : null}
            {subscriptionResult.previewConfirmToken ? (
              <p className="font-mono text-xs break-all text-sky-50">Confirm token: {subscriptionResult.previewConfirmToken}</p>
            ) : null}
            {subscriptionResult.previewUnsubscribeUrl ? (
              <a
                href={subscriptionResult.previewUnsubscribeUrl}
                className="inline-flex text-sky-200 underline decoration-sky-300/60 underline-offset-4 transition hover:text-sky-50"
              >
                Open unsubscribe link
              </a>
            ) : null}
          </div>
        ) : null}
        {subscriptionResult?.deliveryMode === 'brevo' && subscriptionResult.status === 'pending_confirmation' ? (
          <div className="mt-4 rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4 text-sm text-sky-100">
            Check your inbox and spam folder for the confirmation email before trying again.
          </div>
        ) : null}
        {manageLinkPreview?.deliveryMode === 'preview' ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4 text-sm text-sky-100">
            <p className="font-medium text-white">Preview management link</p>
            <p>Use this local preview link to manage the subscription without email delivery.</p>
            {manageLinkPreview.previewManageUrl ? (
              <a
                href={manageLinkPreview.previewManageUrl}
                className="inline-flex text-sky-200 underline decoration-sky-300/60 underline-offset-4 transition hover:text-sky-50"
              >
                Open preview manage link
              </a>
            ) : null}
            {manageLinkPreview.previewManageToken ? (
              <p className="font-mono text-xs break-all text-sky-50">Manage token: {manageLinkPreview.previewManageToken}</p>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => { setStatus('idle'); setMessage(''); setSubscriptionResult(null); setManageLinkPreview(null); }}
          className="mt-4 rounded-2xl border border-white/10 px-4 py-2 text-sm text-white"
        >
          Back to notifications
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
      <p className="text-xs uppercase tracking-widest text-slate-400">Email Alerts</p>
      <p className="mt-2 text-sm text-slate-400">
        Receive email notifications when vault events occur. If this email is already subscribed, Beacon will load the current selections so you can update them without another confirmation step.
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

        {currentStatusLabel ? (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${
            existingStatus?.disabled
              ? 'border-rose-300/20 bg-rose-300/10 text-rose-100'
              : existingStatus?.confirmed
                ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                : 'border-amber-300/20 bg-amber-300/10 text-amber-100'
          }`}>
            <p className="font-medium text-white">{currentStatusLabel}</p>
            {existingStatus?.subscribed && !existingStatus.disabled ? (
              <p className="mt-1">
                Current subscriptions: {existingStatus.eventKinds.map((kind) => EVENT_LABELS[kind] ?? kind).join(', ')}
              </p>
            ) : null}
            {existingStatus?.subscribed && !existingStatus.disabled && !existingStatus.confirmed ? (
              <p className="mt-2 text-amber-50/90">
                Check your inbox and spam folder for the confirmation email. If it never arrived, you can resend it below.
              </p>
            ) : null}
          </div>
        ) : null}

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

        {status === 'idle' && message ? (
          <div className="rounded-2xl border border-sky-300/20 bg-sky-300/10 px-4 py-3 text-sm text-sky-100">
            <p>{message}</p>
            {existingStatus?.confirmed && !manageMode && message === 'Email Address Already Subscribed. If you would like to make changes to an existing subscription click here.' ? (
              <button
                type="button"
                onClick={() => void handleSendManageLink()}
                disabled={!email.trim()}
                className="mt-2 text-sm underline decoration-sky-300/60 underline-offset-4 transition hover:text-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Click here
              </button>
            ) : null}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={
            !email.trim() ||
            selected.length === 0 ||
            status === 'loading' ||
            (existingStatus?.confirmed === true && !manageMode)
          }
          className="rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'loading' ? 'Working…' : actionLabel}
        </button>

        {existingStatus?.subscribed && !existingStatus.disabled && !existingStatus.confirmed && !manageMode ? (
          <button
            type="button"
            onClick={() => void handleResendConfirmation()}
            disabled={!email.trim() || selected.length === 0 || status === 'loading'}
            className="w-fit text-sm text-sky-300 underline decoration-sky-400/60 underline-offset-4 transition hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Re-send confirmation email
          </button>
        ) : null}

        {manageMode ? (
          <button
            type="button"
            onClick={() => void handleManagedUnsubscribe()}
            disabled={status === 'loading'}
            className="w-fit text-sm text-slate-400 underline decoration-slate-500/60 underline-offset-4 transition hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Unsubscribe from email notifications
          </button>
        ) : null}

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

function StateBadge({ status }: { status: VaultStatus }) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const hasPendingWithdrawal =
    status.pendingRequest != null && Number(status.pendingRequest.expiresAt) > nowSeconds;
  const cls = hasPendingWithdrawal
    ? 'border-amber-300/30 bg-amber-300/10 text-amber-300'
    : 'border-emerald-300/30 bg-emerald-300/10 text-emerald-300';
  return (
    <span className={`rounded-full border px-3 py-0.5 text-xs font-medium ${cls}`}>
      {hasPendingWithdrawal ? 'Withdrawal Pending' : 'No Pending Activity'}
    </span>
  );
}
