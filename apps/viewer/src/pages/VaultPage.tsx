import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DeploymentProof, NormalizedEvent, VaultMetadata, VaultStatus } from '@brigid/beacon-shared-types';
import { fetchVaultBundle } from '../lib/api';
import { VaultDetails } from '../components/VaultDetails';
import { OwnerSettings } from '../components/OwnerSettings';

const REFRESH_INTERVAL_MS = 60_000;

export interface VaultBundle {
  metadata: VaultMetadata;
  status: VaultStatus;
  events: NormalizedEvent[];
  proof: DeploymentProof;
}

export default function VaultPage() {
  const { address = '' } = useParams<{ address: string }>();
  const [bundle, setBundle] = useState<VaultBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(options?: { background?: boolean }) {
      const background = options?.background ?? false;
      if (!background) {
        setLoading(true);
        setError(null);
      }

      try {
        const nextBundle = await fetchVaultBundle(address);
        if (!cancelled) {
          setBundle(nextBundle);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          if (!background) {
            setBundle(null);
            setError(err instanceof Error ? err.message : String(err));
          }
        }
      } finally {
        if (!cancelled && !background) {
          setLoading(false);
        }
      }
    }

    if (address) {
      void load();
    }

    const intervalId = window.setInterval(() => {
      if (address) {
        void load({ background: true });
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [address]);

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-slate-300">
        Loading vault data for <span className="font-mono text-sm text-white">{address}</span>...
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="space-y-4 rounded-[2rem] border border-rose-300/20 bg-rose-300/10 p-8">
        <p className="text-sm uppercase tracking-[0.25em] text-rose-200/70">Lookup failed</p>
        <h1 className="text-3xl font-semibold text-white">Vault unavailable</h1>
        <p className="max-w-2xl text-slate-200/90">{error ?? 'Unable to load this vault.'}</p>
        <Link to="/" className="inline-flex rounded-2xl border border-white/10 px-4 py-2 text-sm text-white">
          Back to lookup
        </Link>
      </div>
    );
  }

  const { metadata, status, events, proof } = bundle;
  return (
    <div className="space-y-8">
      <VaultDetails metadata={metadata} status={status} events={events} proof={proof} />
      <OwnerSettings vaultAddress={metadata.address} indexedOwnerAddress={metadata.owner} />
    </div>
  );
}
