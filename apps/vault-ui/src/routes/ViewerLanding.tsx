import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function ViewerLanding() {
  const [address, setAddress] = useState('');
  const navigate = useNavigate();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = address.trim();
    if (!next) return;
    void navigate(`/view/${next}`);
  }

  return (
    <div className="flex flex-col items-center gap-10 py-6">
      <div className="w-full max-w-xl">
        <Link to="/" className="text-sm text-slate-400 transition hover:text-slate-200">
          ← Back
        </Link>

        <div className="mt-6 space-y-3">
          <p className="text-sm uppercase tracking-[0.35em] text-amber-300/70">Public Vault Viewer</p>
          <h1 className="text-3xl font-semibold text-white">Enter a vault address</h1>
          <p className="text-slate-400">
            View vault status, vesting schedule, activity history, and set up email notifications.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur"
        >
          <label htmlFor="vault-address" className="block text-sm font-medium text-slate-300">
            Vault address
          </label>
          <input
            id="vault-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            autoFocus
            className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 font-mono text-sm text-slate-100 outline-none transition focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20"
          />
          <button
            type="submit"
            disabled={!address.trim()}
            className="mt-4 w-full rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            View Vault
          </button>
        </form>
      </div>
    </div>
  );
}
