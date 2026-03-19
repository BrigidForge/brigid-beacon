import { OwnerSettings } from './OwnerSettings';

export function NotificationsTab(props: { vaultAddress: string; indexedOwnerAddress: string }) {
  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.25em] text-sky-200/70">Beacon Notifications</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Destinations and subscriptions</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          This tab preserves the Beacon claim flow so the indexed owner can connect Telegram, webhook, or Discord
          destinations separately from vault transaction actions.
        </p>
      </div>
      <OwnerSettings vaultAddress={props.vaultAddress} indexedOwnerAddress={props.indexedOwnerAddress} />
    </section>
  );
}
