import { useEffect, useState } from 'react';
import {
  fetchAnalyticsOverview,
  fetchTokenAnalyticsList,
  type AnalyticsOverviewResponse,
  type TokenAnalyticsListResponse,
} from '../lib/api';
import { AnalyticsTokensDashboard } from '../components/AnalyticsTokensDashboard';

export default function AnalyticsTokensPage() {
  const [overview, setOverview] = useState<AnalyticsOverviewResponse | null>(null);
  const [tokenList, setTokenList] = useState<TokenAnalyticsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [nextOverview, nextTokenList] = await Promise.all([
          fetchAnalyticsOverview(),
          fetchTokenAnalyticsList(),
        ]);

        if (!cancelled) {
          setOverview(nextOverview);
          setTokenList(nextTokenList);
        }
      } catch (err) {
        if (!cancelled) {
          setOverview(null);
          setTokenList(null);
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
    return <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-slate-300">Loading analytics...</div>;
  }

  if (error || !overview || !tokenList) {
    return (
      <div className="rounded-[2rem] border border-rose-300/20 bg-rose-300/10 p-8 text-slate-100">
        <p className="text-sm uppercase tracking-[0.25em] text-rose-200/70">Analytics</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Analytics unavailable</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/90">{error ?? 'Unable to load analytics.'}</p>
      </div>
    );
  }

  return <AnalyticsTokensDashboard overview={overview} tokenList={tokenList} />;
}
