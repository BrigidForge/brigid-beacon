import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchTokenAnalyticsDetail, type TokenAnalyticsDetailResponse } from '../lib/api';
import { TokenAnalyticsDashboard } from '../components/AnalyticsTokensDashboard';

export default function TokenAnalyticsPage() {
  const { tokenAddress = '' } = useParams();
  const [detail, setDetail] = useState<TokenAnalyticsDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const nextDetail = await fetchTokenAnalyticsDetail(tokenAddress);
        if (!cancelled) {
          setDetail(nextDetail);
        }
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (!tokenAddress) {
      setError('No token address was provided.');
      setLoading(false);
      return;
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);

  if (loading) {
    return <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-slate-300">Loading token analytics...</div>;
  }

  if (error || !detail) {
    return (
      <div className="space-y-4 rounded-[2rem] border border-rose-300/20 bg-rose-300/10 p-8 text-slate-100">
        <p className="text-sm uppercase tracking-[0.25em] text-rose-200/70">Token Analytics</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Token view unavailable</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-200/90">{error ?? 'Unable to load token analytics.'}</p>
        <Link
          to="/analytics/tokens"
          className="inline-flex rounded-2xl border border-white/10 px-4 py-2 text-sm text-white"
        >
          Back to analytics
        </Link>
      </div>
    );
  }

  return <TokenAnalyticsDashboard detail={detail} />;
}
