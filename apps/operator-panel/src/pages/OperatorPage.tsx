import { useEffect, useState } from 'react';
import { fetchOperatorHealth, type OperatorHealthResponse } from '../lib/api';
import { OperatorDashboard } from '../components/OperatorDashboard';

export default function OperatorPage() {
  const [health, setHealth] = useState<OperatorHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const nextHealth = await fetchOperatorHealth();
        if (!cancelled) {
          setHealth(nextHealth);
        }
      } catch (err) {
        if (!cancelled) {
          setHealth(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (loading) {
    return <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-slate-300">Loading operator health...</div>;
  }

  if (error || !health) {
    return (
      <div className="rounded-[2rem] border border-rose-300/20 bg-rose-300/10 p-8 text-slate-100">
        <p className="text-sm uppercase tracking-[0.25em] text-rose-200/70">Operator</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Operator health unavailable</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/90">{error ?? 'Unable to load operator health.'}</p>
      </div>
    );
  }

  return <OperatorDashboard health={health} />;
}
