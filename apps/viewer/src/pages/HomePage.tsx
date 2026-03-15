import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const [address, setAddress] = useState('');
  const navigate = useNavigate();

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
          <p className="text-sm uppercase tracking-[0.35em] text-amber-300/70">Beacon System</p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-tight text-white sm:text-6xl">
            Visibility before execution.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">
            Inspect BrigidVault timing rules, withdrawal windows, and event history from a single public
            address.
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
            The viewer reads metadata, computed status, deployment proof, and the latest normalized events
            from the Beacon API.
          </p>
        </div>
      </div>

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
