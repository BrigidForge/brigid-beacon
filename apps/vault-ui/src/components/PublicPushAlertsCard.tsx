import { useEffect, useState } from 'react';
import {
  createPublicPushSubscription,
  fetchPublicPushConfig,
  fetchPublicPushSubscriptionStatus,
  unsubscribePublicPushSubscription,
  type PublicPushConfigResponse,
  type PublicPushSubscriptionStatusResponse,
} from '../lib/api';
import {
  browserPushSupported,
  createBrowserPushSubscription,
  getExistingPushSubscription,
  removeBrowserPushSubscription,
} from '../lib/push';

const ALL_EVENT_KINDS = [
  'vault_funded',
  'excess_deposited',
  'protected_withdrawal_requested',
  'excess_withdrawal_requested',
  'withdrawal_executed',
  'request_expired',
];

const EVENT_LABELS: Record<string, string> = {
  vault_funded: 'Vault Funded',
  excess_deposited: 'Excess Deposited',
  protected_withdrawal_requested: 'Withdrawal Requested',
  excess_withdrawal_requested: 'Excess Withdrawal Requested',
  withdrawal_executed: 'Withdrawal Executed',
  request_expired: 'Request Expired',
};

type Status = 'idle' | 'loading' | 'success' | 'error';

function toSubscriptionConfig(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const auth = json.keys?.auth;
  const p256dh = json.keys?.p256dh;
  if (!json.endpoint || !auth || !p256dh) {
    throw new Error('Browser push subscription is missing endpoint or keys.');
  }

  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: {
      auth,
      p256dh,
    },
  };
}

export function PublicPushAlertsCard({
  vaultAddress,
  highlightEnableAction = false,
}: {
  vaultAddress: string;
  highlightEnableAction?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(ALL_EVENT_KINDS);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [config, setConfig] = useState<PublicPushConfigResponse | null>(null);
  const [existingStatus, setExistingStatus] = useState<PublicPushSubscriptionStatusResponse | null>(null);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!browserPushSupported()) return;
      try {
        const [pushConfig, existing] = await Promise.all([
          fetchPublicPushConfig(),
          getExistingPushSubscription(),
        ]);
        if (cancelled) return;
        setConfig(pushConfig);
        const endpoint = existing?.endpoint ?? null;
        setCurrentEndpoint(endpoint);
        if (endpoint) {
          const subscriptionStatus = await fetchPublicPushSubscriptionStatus(vaultAddress, endpoint);
          if (cancelled) return;
          setExistingStatus(subscriptionStatus);
          if (subscriptionStatus.subscribed && subscriptionStatus.eventKinds.length > 0) {
            setSelected(subscriptionStatus.eventKinds);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setMessage(err instanceof Error ? err.message : 'Unable to load browser push status.');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [vaultAddress]);

  function toggle(kind: string) {
    setSelected((prev) => (prev.includes(kind) ? prev.filter((entry) => entry !== kind) : [...prev, kind]));
  }

  async function refreshStatusFromEndpoint(endpoint: string | null) {
    setCurrentEndpoint(endpoint);
    if (!endpoint) {
      setExistingStatus(null);
      return;
    }
    const subscriptionStatus = await fetchPublicPushSubscriptionStatus(vaultAddress, endpoint);
    setExistingStatus(subscriptionStatus);
    if (subscriptionStatus.subscribed && subscriptionStatus.eventKinds.length > 0) {
      setSelected(subscriptionStatus.eventKinds);
    }
  }

  async function handleSubscribe() {
    if (selected.length === 0) return;
    setStatus('loading');
    setMessage('');
    try {
      const pushConfig = config ?? await fetchPublicPushConfig();
      setConfig(pushConfig);
      if (!pushConfig.configured || !pushConfig.vapidPublicKey) {
        throw new Error('Browser push is not configured on this deployment yet.');
      }

      const subscription = await createBrowserPushSubscription(pushConfig.vapidPublicKey);
      const result = await createPublicPushSubscription({
        vaultAddress,
        eventKinds: selected,
        subscription: toSubscriptionConfig(subscription),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      });
      await refreshStatusFromEndpoint(result.endpoint);
      setStatus('success');
      setMessage(result.message);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unable to enable browser push alerts.');
    }
  }

  async function handleUnsubscribe() {
    const endpoint = currentEndpoint ?? existingStatus?.endpoint ?? null;
    if (!endpoint) return;
    setStatus('loading');
    setMessage('');
    try {
      await unsubscribePublicPushSubscription(vaultAddress, endpoint);
      await removeBrowserPushSubscription().catch(() => null);
      setExistingStatus({
        vaultAddress,
        endpoint,
        subscribed: false,
        disabled: true,
        eventKinds: [],
        createdAt: existingStatus?.createdAt ?? null,
        updatedAt: existingStatus?.updatedAt ?? null,
        disabledAt: new Date().toISOString(),
      });
      setCurrentEndpoint(null);
      setStatus('success');
      setMessage('Browser push alerts have been disabled for this device.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unable to disable browser push alerts.');
    }
  }

  const unsupported = !browserPushSupported();
  const permissionState =
    typeof Notification !== 'undefined' ? Notification.permission : 'default';
  const currentStatusLabel =
    unsupported
      ? 'Unsupported'
      : existingStatus?.subscribed
        ? 'Subscribed'
        : existingStatus?.disabled
          ? 'Unsubscribed'
          : currentEndpoint
            ? 'Ready to subscribe'
            : 'Not subscribed';
  const shouldPulseEnableButton = highlightEnableAction && !existingStatus?.subscribed;

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
      <p className="text-xs uppercase tracking-widest text-slate-400">Browser Push Alerts</p>
      <p className="mt-2 text-sm text-slate-400">
        Subscribe this browser or installed PWA to the same vault alerts without using email. On iPhone and iPad, web push requires adding Brigid Beacon to the home screen first.
      </p>

      <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
        unsupported
          ? 'border-rose-300/20 bg-rose-300/10 text-rose-100'
          : existingStatus?.subscribed
            ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
            : 'border-sky-300/20 bg-sky-300/10 text-sky-100'
      }`}>
        <p className="font-medium text-white">{currentStatusLabel}</p>
        {existingStatus?.subscribed ? (
          <p className="mt-1">
            Current subscriptions: {existingStatus.eventKinds.map((kind) => EVENT_LABELS[kind] ?? kind).join(', ')}
          </p>
        ) : null}
        {permissionState === 'denied' ? (
          <p className="mt-2 text-rose-50/90">
            Browser notification permission is currently blocked for this site. Re-enable notifications in your browser settings, then try again.
          </p>
        ) : null}
        {!unsupported && !config?.configured ? (
          <p className="mt-2 text-sky-50/90">
            Browser push is not configured on this deployment yet.
          </p>
        ) : null}
      </div>

      {shouldPulseEnableButton ? (
        <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">
          This is the fastest way to turn on Brigid Beacon app notifications for this device. Tap <span className="font-medium text-white">Enable browser alerts</span> below.
        </div>
      ) : null}

      <div className="mt-5">
        <p className="mb-3 text-sm text-slate-300">Notify this device about</p>
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

      {status === 'error' && message ? (
        <p className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{message}</p>
      ) : null}
      {(status === 'success' || (status === 'idle' && message)) && message ? (
        <p className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">{message}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleSubscribe()}
          disabled={unsupported || !config?.configured || selected.length === 0 || status === 'loading'}
          className={`rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 ${
            shouldPulseEnableButton ? 'animate-pulse shadow-[0_0_0_1px_rgba(252,211,77,0.3),0_0_28px_rgba(252,211,77,0.2)]' : ''
          }`}
        >
          {status === 'loading'
            ? 'Working...'
            : existingStatus?.subscribed
              ? 'Update browser alerts'
              : 'Enable browser alerts'}
        </button>
        {existingStatus?.subscribed ? (
          <button
            type="button"
            onClick={() => void handleUnsubscribe()}
            disabled={status === 'loading'}
            className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Disable on this device
          </button>
        ) : null}
      </div>
    </div>
  );
}
