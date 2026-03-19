import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchOwnerPortfolio, fetchOwnerSession, getStoredOwnerSession, type OwnerPortfolioResponse } from '../lib/api';
import { OwnerPortfolioDashboard } from '../components/OwnerPortfolioDashboard';

export default function OwnerPortfolioPage() {
  const [portfolio, setPortfolio] = useState<OwnerPortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const stored = getStoredOwnerSession();
        if (!stored) {
          throw new Error('No owner session found on this device yet. Claim a vault first, then return here.');
        }

        await fetchOwnerSession(stored.sessionToken);
        const nextPortfolio = await fetchOwnerPortfolio(stored.sessionToken);
        if (!cancelled) {
          setPortfolio(nextPortfolio);
        }
      } catch (err) {
        if (!cancelled) {
          setPortfolio(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-slate-300">
        Loading owner portfolio...
      </div>
    );
  }

  if (error || !portfolio) {
    return (
      <div className="space-y-4 rounded-[2rem] border border-amber-300/20 bg-amber-300/10 p-8">
        <p className="text-sm uppercase tracking-[0.25em] text-amber-200/70">Owner Portfolio</p>
        <h1 className="text-3xl font-semibold text-white">Portfolio unavailable</h1>
        <p className="max-w-2xl text-slate-200/90">{error ?? 'Unable to load owner portfolio.'}</p>
        <div className="flex gap-3">
          <Link to="/" className="inline-flex rounded-2xl border border-white/10 px-4 py-2 text-sm text-white">
            Back home
          </Link>
          <Link to="/vault/0x524F04724632eED237cbA3c37272e018b3A7967e" className="inline-flex rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm text-emerald-50">
            Open demo vault
          </Link>
        </div>
      </div>
    );
  }

  return <OwnerPortfolioDashboard portfolio={portfolio} />;
}
