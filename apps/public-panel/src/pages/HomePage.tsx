import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConfiguredVaults } from '../lib/config';
import { shortenAddress } from '../lib/format';

export default function HomePage() {
  const [address, setAddress] = useState('');
  const navigate = useNavigate();
  const configuredVaults = getConfiguredVaults();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextAddress = address.trim();
    if (!nextAddress) return;
    navigate(`/vault/${nextAddress}`);
  }

  return (
    <section className="space-y-10">
      <div className="grid gap-8 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="space-y-5">
          <p className="text-sm uppercase tracking-[0.35em] text-amber-300/70">Public Beacon Surface</p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-tight text-white sm:text-6xl">
            Vault activity for visitors, not operators.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">
            Track multiple BrigidVaults through the Beacon lens: current state, recent activity, deployment
            proof, and timing posture without exposing owner controls.
          </p>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.4)] backdrop-blur">
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-400">Lookup</p>
          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm text-slate-300" htmlFor="vault-address">
              Vault address
            </label>
            <input
              id="vault-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="0x..."
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 font-mono text-sm text-slate-100 outline-none transition focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20"
            />
            <button
              type="submit"
              className="w-full rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Open Vault
            </button>
          </form>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            The public panel reads metadata, computed status, deployment proof, and recent normalized events
            from the Beacon API.
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-sky-200/70">Configured Vaults</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Quick access for public monitoring</h2>
          </div>
          <p className="max-w-xl text-right text-sm leading-6 text-slate-400">
            Set `VITE_PUBLIC_VAULTS` as `address|label|note;address|label|note` to curate the visitor dashboard.
          </p>
        </div>

        {configuredVaults.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {configuredVaults.map((vault) => (
              <button
                key={vault.address}
                type="button"
                onClick={() => navigate(`/vault/${vault.address}`)}
                className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 text-left transition hover:border-amber-300/40 hover:bg-white/10"
              >
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Vault</p>
                <h3 className="mt-3 text-xl font-semibold text-white">{vault.label}</h3>
                <p className="mt-2 font-mono text-sm text-sky-100">{shortenAddress(vault.address)}</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">{vault.note}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/5 p-6 text-sm leading-6 text-slate-300">
            No curated vault list is configured yet. Visitors can still open any indexed vault by address using the
            lookup panel above.
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-5">
          <p className="text-sm uppercase tracking-[0.25em] text-emerald-200/70">Status</p>
          <p className="mt-2 text-sm leading-6 text-emerald-50/90">
            Live vault state derived from indexed events plus time-based vesting math.
          </p>
        </div>
        <div className="rounded-3xl border border-sky-300/20 bg-sky-300/10 p-5">
          <p className="text-sm uppercase tracking-[0.25em] text-sky-200/70">Events</p>
          <p className="mt-2 text-sm leading-6 text-sky-50/90">
            A normalized timeline for funding, request, cancel, execute, and expiry actions.
          </p>
        </div>
        <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5">
          <p className="text-sm uppercase tracking-[0.25em] text-amber-200/70">Proof</p>
          <p className="mt-2 text-sm leading-6 text-amber-50/90">
            Deployment parameters and factory provenance, ready for public verification.
          </p>
        </div>
      </div>
    </section>
  );
}
