import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  confirmPublicEmailSubscription,
  createPublicEmailSubscription,
  fetchManagedPublicEmailSubscriptionStatus,
  fetchPublicEmailSubscriptionStatus,
  unsubscribePublicEmailSubscription,
  type PublicEmailSubscriptionStatusResponse,
  type PublicEmailSubscriptionResponse,
} from '../lib/api';
import { formatIso, formatStateLabel } from '../lib/format';

const PUBLIC_EVENT_OPTIONS = [
  'vault_funded',
  'excess_deposited',
  'withdrawal_executed',
  'request_expired',
] as const;

export function PublicEmailFollowPanel(props: { vaultAddress: string }) {
  const { vaultAddress } = props;
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [selectedEventKinds, setSelectedEventKinds] = useState<string[]>([
    'withdrawal_executed',
    'request_expired',
  ]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingSubscription, setPendingSubscription] = useState<PublicEmailSubscriptionResponse | null>(null);
  const [existingStatus, setExistingStatus] = useState<PublicEmailSubscriptionStatusResponse | null>(null);

  const confirmToken = searchParams.get('confirmEmailToken');
  const manageToken = searchParams.get('manageEmailToken');
  const unsubscribeToken = searchParams.get('unsubscribeEmailToken');
  const actionKey = useMemo(
    () => `${confirmToken ?? ''}:${manageToken ?? ''}:${unsubscribeToken ?? ''}:${vaultAddress}`,
    [confirmToken, manageToken, unsubscribeToken, vaultAddress],
  );
  const isManagedSession = manageToken == null
    ? message?.includes('secure link') ?? false
    : true;

  useEffect(() => {
    let cancelled = false;

    async function handleTokenAction() {
      if (!confirmToken && !manageToken && !unsubscribeToken) {
        return;
      }

      setBusy(true);
      setError(null);
      setMessage(null);

      try {
        if (confirmToken) {
          const confirmed = await confirmPublicEmailSubscription(confirmToken);
          if (!cancelled) {
            setMessage(`Email alerts confirmed for ${confirmed.email} on this vault.`);
            setPendingSubscription(null);
            setEmail(confirmed.email);
            setSelectedEventKinds(confirmed.eventKinds);
            setExistingStatus({
              vaultAddress: confirmed.vaultAddress,
              email: confirmed.email,
              subscribed: true,
              confirmed: true,
              disabled: false,
              eventKinds: confirmed.eventKinds,
              confirmedAt: confirmed.confirmedAt,
              disabledAt: null,
            });
          }
        } else if (manageToken) {
          const status = await fetchManagedPublicEmailSubscriptionStatus(manageToken);
          if (!cancelled) {
            setEmail(status.email);
            setSelectedEventKinds(status.eventKinds);
            setExistingStatus(status);
            setMessage('Managed email alert settings loaded from your secure link.');
          }
        } else if (unsubscribeToken) {
          const unsubscribed = await unsubscribePublicEmailSubscription(unsubscribeToken);
          if (!cancelled) {
            setMessage(`Email alerts unsubscribed for ${unsubscribed.email}.`);
            setPendingSubscription(null);
            setExistingStatus({
              vaultAddress: unsubscribed.vaultAddress,
              email: unsubscribed.email,
              subscribed: true,
              confirmed: false,
              disabled: true,
              eventKinds: [],
              confirmedAt: null,
              disabledAt: unsubscribed.unsubscribedAt,
            });
          }
        }

        if (!cancelled) {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete('confirmEmailToken');
          nextParams.delete('manageEmailToken');
          nextParams.delete('unsubscribeEmailToken');
          setSearchParams(nextParams, { replace: true });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    void handleTokenAction();

    return () => {
      cancelled = true;
    };
  }, [actionKey, confirmToken, manageToken, unsubscribeToken, searchParams, setSearchParams]);

  function toggleEventKind(kind: string) {
    setSelectedEventKinds((current) =>
      current.includes(kind) ? current.filter((entry) => entry !== kind) : [...current, kind],
    );
  }

  async function handleSubscribe() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await createPublicEmailSubscription({
        vaultAddress,
        email,
        eventKinds: selectedEventKinds,
      });
      setPendingSubscription(response);
      setExistingStatus({
        vaultAddress: response.vaultAddress,
        email: response.email,
        subscribed: true,
        confirmed: response.status === 'confirmed',
        disabled: false,
        eventKinds: response.eventKinds,
        confirmedAt: response.status === 'confirmed' ? new Date().toISOString() : null,
        disabledAt: null,
      });
      setMessage(
        existingStatus?.confirmed
          ? 'Public email alert settings saved.'
          : response.message,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePreviewConfirm() {
    if (!pendingSubscription?.previewConfirmToken) return;

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const confirmed = await confirmPublicEmailSubscription(pendingSubscription.previewConfirmToken);
      setPendingSubscription(null);
      setExistingStatus({
        vaultAddress: confirmed.vaultAddress,
        email: confirmed.email,
        subscribed: true,
        confirmed: true,
        disabled: false,
        eventKinds: confirmed.eventKinds,
        confirmedAt: confirmed.confirmedAt,
        disabledAt: null,
      });
      setMessage(`Email alerts confirmed for ${confirmed.email} on this vault.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckStatus() {
    if (email.trim().length === 0) {
      setError('Enter an email address to check follow status.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const status = await fetchPublicEmailSubscriptionStatus(vaultAddress, email);
      setExistingStatus(status);
      if (status.subscribed && status.eventKinds.length > 0) {
        setSelectedEventKinds(status.eventKinds);
      }

      if (!status.subscribed) {
        setMessage('No public email follow exists for that address on this vault yet.');
      } else if (status.disabled) {
        setMessage('This email follow is currently disabled. Submit again to reactivate it.');
      } else if (status.confirmed) {
        setMessage('This email follow is active and confirmed. You can update event selections below.');
      } else {
        setMessage('A follow exists for this email but is still waiting for confirmation.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const actionLabel =
    existingStatus?.subscribed && existingStatus.confirmed
      ? existingStatus.disabled
        ? 'Reactivate email alerts'
        : 'Save email alert changes'
      : existingStatus?.subscribed
        ? 'Resend confirmation'
        : 'Follow by email';

  const statusToneClass =
    existingStatus?.disabled
      ? 'border-rose-300/20 bg-rose-300/10 text-rose-50'
      : existingStatus?.confirmed
        ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-50'
        : 'border-amber-300/20 bg-amber-300/10 text-amber-50';

  const statusLabel = existingStatus?.disabled
    ? `Disabled${existingStatus.disabledAt ? ` on ${formatIso(existingStatus.disabledAt)}` : ''}`
    : existingStatus?.confirmed
      ? `Confirmed${existingStatus.confirmedAt ? ` on ${formatIso(existingStatus.confirmedAt)}` : ''}`
      : existingStatus?.subscribed
        ? 'Pending confirmation'
        : null;

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_25px_90px_rgba(15,23,42,0.25)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.28em] text-sky-200/75">Public Follow</p>
          <h2 className="text-3xl font-semibold text-white">
            {isManagedSession ? 'Manage public email alerts' : 'Email alerts for public viewers'}
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-slate-300">
            {isManagedSession
              ? 'This secure link opened your existing public follower settings for this vault. Review your event selections and save any changes here.'
              : 'Follow this vault without claiming ownership. Choose a small public-safe event set and confirm your email before alerts are activated.'}
          </p>
        </div>
        <div className="rounded-2xl border border-sky-300/20 bg-sky-300/10 px-4 py-3 text-sm text-sky-100">
          {isManagedSession ? 'Managed through secure email link' : 'Public follower email onboarding'}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5 rounded-3xl border border-white/10 bg-slate-950/35 p-5">
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Email address</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-sky-300/50"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleCheckStatus()}
              disabled={busy || email.trim().length === 0}
              className="rounded-2xl border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Check status
            </button>
            {statusLabel ? (
              <div className={`rounded-2xl border px-4 py-2 text-sm ${statusToneClass}`}>
                {statusLabel}
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Public event types</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {PUBLIC_EVENT_OPTIONS.map((kind) => {
                const checked = selectedEventKinds.includes(kind);
                return (
                  <label
                    key={kind}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                      checked
                        ? 'border-sky-300/40 bg-sky-300/10 text-sky-50'
                        : 'border-white/10 bg-white/5 text-slate-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEventKind(kind)}
                      className="h-4 w-4 accent-sky-400"
                    />
                    <span>{formatStateLabel(kind)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleSubscribe()}
            disabled={busy || email.trim().length === 0 || selectedEventKinds.length === 0}
            className="inline-flex rounded-2xl bg-sky-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Working...' : actionLabel}
          </button>
        </div>

        <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/35 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Confirmation state</p>

          {message ? <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-50">{message}</div> : null}
          {error ? <div className="rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm text-rose-50">{error}</div> : null}

          {pendingSubscription ? (
            <div className="space-y-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-50">
              <p>A confirmation step is still required for <span className="font-medium">{pendingSubscription.email}</span>.</p>
              <p>Expires: {pendingSubscription.expiresAt ? formatIso(pendingSubscription.expiresAt) : 'Already confirmed'}</p>
              <p>Delivery mode: {pendingSubscription.deliveryMode === 'ses' ? 'SES email sent' : 'Local preview'}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handlePreviewConfirm()}
                  disabled={busy}
                  className="rounded-2xl border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Confirm locally
                </button>
                {pendingSubscription.previewConfirmUrl ? (
                  <a
                    href={pendingSubscription.previewConfirmUrl}
                    className="rounded-2xl border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10"
                  >
                    Open preview link
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm leading-7 text-slate-300">
              Once this is connected to live SES sending, viewers will receive a confirmation email instead of the local preview prompt.
            </p>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            <p className="font-medium text-white">What public followers can see</p>
            <p className="mt-2 leading-7">
              This flow is separate from owner controls. It is meant for transparency and public monitoring, not vault management.
            </p>
          </div>

          {existingStatus?.subscribed ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">
                {isManagedSession ? 'Loaded subscription' : 'Current event selection'}
              </p>
              <p className="mt-2 leading-7">
                {existingStatus.eventKinds.length > 0
                  ? existingStatus.eventKinds.map((kind) => formatStateLabel(kind)).join(', ')
                  : 'No public events selected yet.'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
