import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DeploymentProof, NormalizedEvent, VaultMetadata, VaultStatus } from '@brigid/beacon-shared-types';
import { fetchVaultBundle } from '../lib/api';
import { VaultSummaryPanel } from '../components/VaultSummaryPanel';
import { VaultStatusTab } from '../components/VaultStatusTab';
import { VaultActivityTab } from '../components/VaultActivityTab';
import { TransactionsTab } from '../components/TransactionsTab';
import { NotificationsTab } from '../components/NotificationsTab';
import { useOperatorSession } from '../components/OperatorSessionProvider';

const REFRESH_INTERVAL_MS = 60_000;
const ACTIVE_TAB_STORAGE_KEY = 'brigid-operator-active-tab';
type VaultTab = 'status' | 'withdrawals' | 'activity' | 'notifications';

function readStoredActiveTab(address: string): VaultTab {
  if (typeof window === 'undefined' || !address) return 'status';
  try {
    const raw = window.sessionStorage.getItem(`${ACTIVE_TAB_STORAGE_KEY}:${address.toLowerCase()}`);
    if (raw === 'status' || raw === 'withdrawals' || raw === 'activity' || raw === 'notifications') {
      return raw;
    }
  } catch {
    // Ignore storage failures.
  }
  return 'status';
}

export interface VaultBundle {
  metadata: VaultMetadata;
  status: VaultStatus;
  events: NormalizedEvent[];
  proof: DeploymentProof;
}

export default function VaultPage() {
  const { address = '' } = useParams<{ address: string }>();
  const { walletSession, ensureWallet } = useOperatorSession();
  const [bundle, setBundle] = useState<VaultBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<VaultTab>(() => readStoredActiveTab(address));

  useEffect(() => {
    setActiveTab(readStoredActiveTab(address));
  }, [address]);

  useEffect(() => {
    if (typeof window === 'undefined' || !address) return;
    try {
      window.sessionStorage.setItem(`${ACTIVE_TAB_STORAGE_KEY}:${address.toLowerCase()}`, activeTab);
    } catch {
      // Ignore storage failures.
    }
  }, [activeTab, address]);

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
  const tabs = [
    {
      id: 'status' as const,
      label: 'Vault Status',
      activeClass: 'bg-sky-300 text-slate-950',
      idleClass: 'border border-white/10 bg-slate-950/40 text-slate-200 hover:border-sky-300/40',
    },
    {
      id: 'withdrawals' as const,
      label: 'Withdrawals',
      activeClass: 'bg-amber-300 text-slate-950',
      idleClass: 'border border-white/10 bg-slate-950/40 text-slate-200 hover:border-amber-300/40',
    },
    {
      id: 'activity' as const,
      label: 'Activity History',
      activeClass: 'bg-fuchsia-300 text-slate-950',
      idleClass: 'border border-white/10 bg-slate-950/40 text-slate-200 hover:border-fuchsia-300/40',
    },
    {
      id: 'notifications' as const,
      label: 'Beacon Notifications',
      activeClass: 'bg-emerald-300 text-slate-950',
      idleClass: 'border border-white/10 bg-slate-950/40 text-slate-200 hover:border-emerald-300/40',
    },
  ];

  return (
    <div className="space-y-8">
      <VaultSummaryPanel metadata={metadata} />
      <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap gap-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id ? tab.activeClass : tab.idleClass
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>
      {activeTab === 'status' ? (
        <VaultStatusTab metadata={metadata} status={status} proof={proof} />
      ) : activeTab === 'withdrawals' ? (
        <TransactionsTab
          vaultAddress={metadata.address}
          indexedOwnerAddress={metadata.owner}
          events={events}
          walletSession={walletSession}
          onRequireWallet={ensureWallet}
        />
      ) : activeTab === 'activity' ? (
        <VaultActivityTab events={events} />
      ) : (
        <NotificationsTab vaultAddress={metadata.address} indexedOwnerAddress={metadata.owner} />
      )}
    </div>
  );
}
