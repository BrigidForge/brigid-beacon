import { useEffect, useState } from 'react';
import {
  clearStoredOwnerSession,
  createDestination,
  createSubscription,
  createTelegramConnectLink,
  disableDestination,
  disableSubscription,
  fetchDeliveries,
  fetchClaimStatus,
  fetchDestinations,
  fetchOwnerSession,
  fetchSubscriptions,
  getStoredOwnerSession,
  requestClaimNonce,
  revokeOwnerSession,
  storeOwnerSession,
  verifyClaim,
  type NotificationDestinationRecord,
  type NotificationSubscriptionRecord,
} from '../lib/api';
import { formatIso, formatStateLabel, shortenAddress } from '../lib/format';

const EVENT_OPTIONS = [
  'vault_funded',
  'protected_withdrawal_requested',
  'excess_withdrawal_requested',
  'withdrawal_executed',
  'request_expired',
  'withdrawal_canceled',
  'excess_deposited',
] as const;

type EthereumProvider = {
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: EthereumProvider[];
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

function getEthereumProvider(): EthereumProvider | null {
  const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum ?? null;
  if (!ethereum) return null;
  const injectedProviders = Array.isArray(ethereum.providers) ? ethereum.providers : [ethereum];
  const rabbyProvider = injectedProviders.find((provider) => provider.isRabby);
  if (rabbyProvider) return rabbyProvider;
  const nonMetaMaskProvider = injectedProviders.find((provider) => !provider.isMetaMask);
  if (nonMetaMaskProvider) return nonMetaMaskProvider;
  return injectedProviders[0] ?? null;
}

export function OwnerSettings(props: { vaultAddress: string; indexedOwnerAddress: string }) {
  const { vaultAddress, indexedOwnerAddress } = props;
  const [ownerAddress, setOwnerAddress] = useState(indexedOwnerAddress);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [claimStatus, setClaimStatus] = useState<{ claimed: boolean; claimedAt: string | null } | null>(null);
  const [destinations, setDestinations] = useState<NotificationDestinationRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<NotificationSubscriptionRecord[]>([]);
  const [deliveries, setDeliveries] = useState<Array<{
    id: string; status: string; eventKind: string;
    destination: { label: string; kind: string };
    createdAt: string; attemptCount: number;
    lastAttemptAt: string | null; deliveredAt: string | null; errorMessage: string | null;
  }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [destinationKind, setDestinationKind] = useState<'webhook' | 'discord_webhook' | 'telegram'>('webhook');
  const [destinationLabel, setDestinationLabel] = useState('Ops webhook');
  const [destinationUrl, setDestinationUrl] = useState('https://example.com/hook');
  const [selectedDestinationId, setSelectedDestinationId] = useState('');
  const [selectedEventKinds, setSelectedEventKinds] = useState<string[]>(['withdrawal_executed', 'request_expired']);
  const [telegramConnectLink, setTelegramConnectLink] = useState<{ botUsername: string; deepLinkUrl: string; expiresAt: string } | null>(null);
  const [awaitingTelegramConnection, setAwaitingTelegramConnection] = useState(false);

  const walletMatchesIndexedOwner = ownerAddress.toLowerCase() === indexedOwnerAddress.toLowerCase();
  const hasSession = sessionToken != null;
  const canManage = claimStatus?.claimed === true && walletMatchesIndexedOwner && hasSession;
  const selectedDestination = destinations.find((d) => d.id === selectedDestinationId) ?? null;
  const duplicateSubscription = subscriptions.find((s) => s.destinationId === selectedDestinationId) ?? null;
  const destinationConfigValid = destinationKind === 'telegram' ? true : destinationUrl.trim().length > 0;

  async function refreshOwnerData(nextSessionToken = sessionToken) {
    if (!nextSessionToken) { setClaimStatus({ claimed: false, claimedAt: null }); setDestinations([]); setSubscriptions([]); setDeliveries([]); return; }
    const [claim, destinationList, subscriptionList, deliveryList] = await Promise.all([
      fetchClaimStatus(vaultAddress, nextSessionToken),
      fetchDestinations(nextSessionToken),
      fetchSubscriptions(nextSessionToken, vaultAddress),
      fetchDeliveries(nextSessionToken, vaultAddress),
    ]);
    setClaimStatus({ claimed: claim.claimed, claimedAt: claim.claimedAt });
    setDestinations(destinationList.destinations);
    setSubscriptions(subscriptionList.subscriptions);
    setDeliveries(deliveryList.deliveries);
    setSelectedDestinationId((current) =>
      destinationList.destinations.some((d) => d.id === current) ? current : destinationList.destinations[0]?.id ?? '',
    );
  }

  useEffect(() => {
    const stored = getStoredOwnerSession();
    setOwnerAddress(indexedOwnerAddress);
    setSessionToken(stored?.sessionToken ?? null);
    setClaimStatus(null); setDestinations([]); setSubscriptions([]); setDeliveries([]);
    setSelectedDestinationId(''); setMessage(null); setError(null);
    setTelegramConnectLink(null); setAwaitingTelegramConnection(false);
  }, [indexedOwnerAddress, vaultAddress]);

  useEffect(() => {
    if (!awaitingTelegramConnection || !sessionToken) return;
    const intervalId = window.setInterval(() => {
      void refreshOwnerData(sessionToken).catch(() => undefined);
    }, 4000);
    const timeoutId = window.setTimeout(() => { setAwaitingTelegramConnection(false); }, 90_000);
    return () => { window.clearInterval(intervalId); window.clearTimeout(timeoutId); };
  }, [awaitingTelegramConnection, sessionToken]);

  useEffect(() => {
    if (!awaitingTelegramConnection) return;
    const linked = destinations.find((d) => d.kind === 'telegram');
    if (!linked) return;
    setSelectedDestinationId(linked.id);
    setAwaitingTelegramConnection(false);
    setTelegramConnectLink(null);
    setMessage(`Telegram connected. "${linked.label}" is ready for subscriptions.`);
  }, [awaitingTelegramConnection, destinations]);

  async function connectWallet() {
    const provider = getEthereumProvider();
    if (!provider) throw new Error('No injected wallet detected.');
    const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
    const nextOwnerAddress = accounts[0] ?? '';
    if (!nextOwnerAddress) throw new Error('Wallet did not provide an account.');
    setOwnerAddress(nextOwnerAddress);
    const stored = getStoredOwnerSession();
    if (stored && stored.ownerAddress.toLowerCase() === nextOwnerAddress.toLowerCase()) {
      try {
        await fetchOwnerSession(stored.sessionToken);
        setSessionToken(stored.sessionToken);
        await refreshOwnerData(stored.sessionToken);
        return;
      } catch { clearStoredOwnerSession(); setSessionToken(null); }
    }
    setClaimStatus({ claimed: false, claimedAt: null }); setDestinations([]); setSubscriptions([]); setDeliveries([]);
  }

  async function handleClaim() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const provider = getEthereumProvider();
      if (!provider) throw new Error('No injected wallet detected.');
      const nonce = await requestClaimNonce(vaultAddress, ownerAddress);
      const signature = (await provider.request({ method: 'personal_sign', params: [nonce.message, ownerAddress] })) as string;
      const verified = await verifyClaim(vaultAddress, ownerAddress, nonce.nonce, signature);
      storeOwnerSession({ sessionToken: verified.sessionToken, ownerAddress, expiresAt: verified.sessionExpiresAt });
      setSessionToken(verified.sessionToken);
      await refreshOwnerData(verified.sessionToken);
      setMessage('Vault claim verified. You can now manage destinations and subscriptions.');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  async function handleCreateDestination() {
    setBusy(true); setError(null); setMessage(null);
    try {
      if (destinationKind === 'telegram') {
        const link = await createTelegramConnectLink(sessionToken!, destinationLabel.trim() || 'Telegram alerts');
        setTelegramConnectLink({ botUsername: link.botUsername, deepLinkUrl: link.deepLinkUrl, expiresAt: link.expiresAt });
        setAwaitingTelegramConnection(true);
        if (typeof window !== 'undefined') window.open(link.deepLinkUrl, '_blank', 'noopener,noreferrer');
        setMessage('Telegram connect opened. Tap Start in the bot, then come back here.');
        return;
      }
      const destination = await createDestination({ sessionToken: sessionToken!, ownerAddress, kind: destinationKind, label: destinationLabel, config: { url: destinationUrl } });
      setDestinations([...destinations, destination]);
      setSelectedDestinationId(destination.id);
      setMessage(`${formatStateLabel(destinationKind)} destination saved.`);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  async function handleCreateSubscription() {
    setBusy(true); setError(null); setMessage(null);
    try {
      if (duplicateSubscription) throw new Error('This destination already has an active subscription for the current vault.');
      await createSubscription({ sessionToken: sessionToken!, vaultAddress, ownerAddress, destinationId: selectedDestinationId, eventKinds: selectedEventKinds });
      const subscriptionList = await fetchSubscriptions(sessionToken!, vaultAddress);
      setSubscriptions(subscriptionList.subscriptions);
      const deliveryList = await fetchDeliveries(sessionToken!, vaultAddress);
      setDeliveries(deliveryList.deliveries);
      setMessage('Subscription saved for this vault.');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  function toggleEventKind(kind: string) {
    setSelectedEventKinds((cur) => cur.includes(kind) ? cur.filter((e) => e !== kind) : [...cur, kind]);
  }

  async function handleDisableDestination(destinationId: string) {
    setBusy(true); setError(null); setMessage(null);
    try { await disableDestination(sessionToken!, destinationId); await refreshOwnerData(sessionToken!); setMessage('Destination disabled.'); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  async function handleDisableSubscription(subscriptionId: string) {
    setBusy(true); setError(null); setMessage(null);
    try { await disableSubscription(sessionToken!, subscriptionId); await refreshOwnerData(sessionToken!); setMessage('Subscription disabled.'); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  async function handleSignOut() {
    setBusy(true); setError(null); setMessage(null);
    try { if (sessionToken) { await revokeOwnerSession(sessionToken).catch(() => undefined); } }
    finally {
      clearStoredOwnerSession(); setSessionToken(null);
      setClaimStatus({ claimed: false, claimedAt: null }); setDestinations([]); setSubscriptions([]); setDeliveries([]);
      setBusy(false); setMessage('Owner session cleared on this device.');
    }
  }

  function deliveryTone(status: string) {
    if (status === 'sent') return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-50';
    if (status === 'failed') return 'border-rose-300/30 bg-rose-300/10 text-rose-50';
    return 'border-amber-300/30 bg-amber-300/10 text-amber-50';
  }

  return (
    <section className="space-y-6 rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_25px_90px_rgba(15,23,42,0.25)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.32em] text-emerald-200/70">Owner Settings</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Claim and manage alerts</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Beacon keeps vault pages public, but alert destinations stay private to the verified vault owner.
          </p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => { setError(null); setMessage(null); void connectWallet().catch((err) => { setError(err instanceof Error ? err.message : String(err)); }); }}
            className="inline-flex rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm font-medium text-emerald-50">
            Connect wallet
          </button>
          {hasSession ? (
            <button type="button" onClick={() => void handleSignOut()}
              className="inline-flex rounded-2xl border border-white/10 px-4 py-2 text-sm font-medium text-white">
              Clear session
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Claim status</p>
          <p className="mt-3 text-lg font-medium text-white">{claimStatus?.claimed ? 'Claimed for notifications' : 'Not yet claimed'}</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">Indexed owner: <span className="font-mono text-white">{shortenAddress(indexedOwnerAddress)}</span></p>
          <p className="mt-2 text-sm leading-6 text-slate-300">Active context: <span className="font-mono text-white">{shortenAddress(ownerAddress)}</span></p>
          <p className="mt-2 text-sm leading-6 text-slate-300">Session: <span className="text-white">{hasSession ? 'active' : 'not established'}</span></p>
          {!walletMatchesIndexedOwner ? <p className="mt-2 text-sm text-amber-100/90">Connected wallet does not match the indexed vault owner.</p> : null}
          {claimStatus?.claimedAt ? <p className="mt-2 text-sm text-emerald-100/90">Claimed at {formatIso(claimStatus.claimedAt)}</p> : null}
          <button type="button" disabled={busy || claimStatus?.claimed === true || !walletMatchesIndexedOwner}
            onClick={() => void handleClaim()}
            className="mt-4 inline-flex rounded-2xl border border-white/10 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
            {claimStatus?.claimed ? 'Claim verified' : busy ? 'Working...' : 'Claim this vault'}
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Notification destination</p>
          <div className="mt-4 grid gap-3">
            <label className="space-y-2">
              <span className="text-sm text-slate-300">Kind</span>
              <select value={destinationKind}
                onChange={(e) => {
                  const nextKind = e.target.value as 'webhook' | 'discord_webhook' | 'telegram';
                  setDestinationKind(nextKind); setTelegramConnectLink(null); setAwaitingTelegramConnection(false);
                  setDestinationLabel(nextKind === 'telegram' ? 'Telegram alerts' : nextKind === 'discord_webhook' ? 'Discord alerts' : 'Ops webhook');
                }}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none">
                <option value="webhook">Webhook</option>
                <option value="discord_webhook">Discord Webhook</option>
                <option value="telegram">Telegram</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-300">Label</span>
              <input value={destinationLabel} onChange={(e) => setDestinationLabel(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none" />
            </label>
            {destinationKind === 'telegram' ? (
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-4 text-sm text-emerald-50">
                <p className="font-medium text-white">Guided Telegram setup</p>
                <p className="mt-2 leading-6 text-emerald-50/90">Beacon will open the official bot. Tap <strong>Start</strong> in Telegram and come back here.</p>
                {telegramConnectLink ? (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-slate-200">
                    <p>Bot: <span className="font-mono text-white">@{telegramConnectLink.botUsername}</span></p>
                    <p className="mt-2 text-xs text-slate-300">Link expires {formatIso(telegramConnectLink.expiresAt)}</p>
                    <button type="button" onClick={() => { if (typeof window !== 'undefined') window.open(telegramConnectLink.deepLinkUrl, '_blank', 'noopener,noreferrer'); }}
                      className="mt-3 inline-flex rounded-2xl border border-white/10 px-4 py-2 text-sm font-medium text-white">
                      Open Telegram again
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <label className="space-y-2">
                <span className="text-sm text-slate-300">{destinationKind === 'discord_webhook' ? 'Discord webhook URL' : 'Webhook URL'}</span>
                <input value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none" />
              </label>
            )}
            <button type="button" disabled={busy || !canManage || destinationLabel.trim().length === 0 || !destinationConfigValid}
              onClick={() => void handleCreateDestination()}
              className="inline-flex rounded-2xl border border-sky-300/30 bg-sky-300/10 px-4 py-2 text-sm font-medium text-sky-50 disabled:cursor-not-allowed disabled:opacity-50">
              {destinationKind === 'telegram' ? 'Connect Telegram' : 'Save destination'}
            </button>
            {destinationKind === 'telegram' && awaitingTelegramConnection ? (
              <p className="text-sm text-slate-300">Waiting for Telegram confirmation. After you press Start in the bot, Beacon will connect the chat automatically.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Destinations</p>
          <div className="mt-4 space-y-3">
            {destinations.length === 0 ? <p className="text-sm text-slate-400">No active destinations yet.</p> : (
              destinations.map((destination) => (
                <label key={destination.id}
                  className={`block rounded-2xl border px-4 py-3 ${selectedDestinationId === destination.id ? 'border-emerald-300/35 bg-emerald-300/10' : 'border-white/10 bg-white/5'}`}>
                  <input type="radio" name="destination" value={destination.id} checked={selectedDestinationId === destination.id}
                    onChange={() => setSelectedDestinationId(destination.id)} className="sr-only" />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{destination.label}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{formatStateLabel(destination.kind)}</p>
                    </div>
                    <button type="button" disabled={busy || !canManage}
                      onClick={(e) => { e.preventDefault(); void handleDisableDestination(destination.id); }}
                      className="rounded-xl border border-rose-300/30 px-3 py-1 text-xs text-rose-100 disabled:cursor-not-allowed disabled:opacity-50">
                      Disable
                    </button>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Subscription</p>
          {selectedDestination ? <p className="mt-3 text-sm text-slate-300">Selected: <span className="text-white">{selectedDestination.label}</span></p> : null}
          {duplicateSubscription ? <p className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">This destination already has an active subscription for this vault.</p> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {EVENT_OPTIONS.map((kind) => (
              <label key={kind} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <input type="checkbox" checked={selectedEventKinds.includes(kind)} onChange={() => toggleEventKind(kind)} className="mt-1" />
                <span className="text-sm text-white">{formatStateLabel(kind)}</span>
              </label>
            ))}
          </div>
          <button type="button" disabled={busy || !canManage || !selectedDestinationId || selectedEventKinds.length === 0 || Boolean(duplicateSubscription)}
            onClick={() => void handleCreateSubscription()}
            className="mt-4 inline-flex rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-50 disabled:cursor-not-allowed disabled:opacity-50">
            Save subscription
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Active subscriptions</p>
        <div className="mt-4 space-y-3">
          {subscriptions.length === 0 ? <p className="text-sm text-slate-400">No subscriptions yet for this vault.</p> : (
            subscriptions.map((subscription) => (
              <div key={subscription.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{subscription.destination?.label ?? subscription.destinationId}</p>
                    <p className="mt-2 text-sm text-slate-300">{subscription.eventKinds.map(formatStateLabel).join(', ')}</p>
                    <p className="mt-2 text-xs text-slate-400">Created {formatIso(subscription.createdAt)}</p>
                  </div>
                  <button type="button" disabled={busy || !canManage} onClick={() => void handleDisableSubscription(subscription.id)}
                    className="rounded-xl border border-rose-300/30 px-3 py-1 text-xs text-rose-100 disabled:cursor-not-allowed disabled:opacity-50">
                    Disable
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Recent deliveries</p>
          <button type="button" disabled={busy || !hasSession} onClick={() => void refreshOwnerData(sessionToken)}
            className="rounded-xl border border-white/10 px-3 py-1 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-50">
            Refresh
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {deliveries.length === 0 ? <p className="text-sm text-slate-400">No delivery attempts yet for this vault.</p> : (
            deliveries.map((delivery) => (
              <div key={delivery.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-white">{formatStateLabel(delivery.eventKind)} to {delivery.destination.label}</p>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${deliveryTone(delivery.status)}`}>{formatStateLabel(delivery.status)}</span>
                      <span className="rounded-full border border-white/10 bg-slate-950/60 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">{formatStateLabel(delivery.destination.kind)}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">
                      {delivery.status === 'sent' ? `Delivered ${delivery.deliveredAt ? formatIso(delivery.deliveredAt) : 'successfully'} after ${delivery.attemptCount ?? 1} attempt${(delivery.attemptCount ?? 1) === 1 ? '' : 's'}` : `Status: ${formatStateLabel(delivery.status)}`}
                    </p>
                    {delivery.lastAttemptAt ? <p className="mt-2 text-xs text-slate-400">Last attempt {formatIso(delivery.lastAttemptAt)}</p> : null}
                    {delivery.errorMessage ? <p className="mt-2 text-xs text-rose-100/90">{delivery.errorMessage}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">{formatIso(delivery.createdAt)}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">{delivery.attemptCount} attempt{delivery.attemptCount === 1 ? '' : 's'}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {message ? <p className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-50">{message}</p> : null}
      {error ? <p className="rounded-2xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-50">{error}</p> : null}
    </section>
  );
}
