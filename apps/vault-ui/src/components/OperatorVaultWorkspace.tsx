import { useEffect, useState } from 'react';
import type { DeploymentProof, NormalizedEvent, VaultMetadata, VaultStatus } from '@brigid/beacon-shared-types';
import { fetchVaultBundle } from '../lib/api';
import type { WalletSession } from '../lib/operatorVault';
import { VaultStatusTab } from './VaultStatusTab';
import { VaultActivityTab } from './VaultActivityTab';
import { TransactionsTab } from './TransactionsTab';
import { OwnerSettings } from './OwnerSettings';

const REFRESH_INTERVAL_MS = 60_000;
const ACTIVE_TAB_STORAGE_KEY = 'brigid-vault-ui-active-tab';

type VaultTab = 'status' | 'withdrawals' | 'activity' | 'notifications';

interface VaultBundle {
  metadata: VaultMetadata;
  status: VaultStatus;
  events: NormalizedEvent[];
  purposeTexts: Record<string, string>;
  proof: DeploymentProof;
}

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

const TABS = [
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

export function OperatorVaultWorkspace(props: {
  vaultAddress: string;
  walletSession: WalletSession;
  ensureWallet: () => Promise<WalletSession>;
}) {
  const { vaultAddress, walletSession, ensureWallet } = props;

  const [bundle, setBundle] = useState<VaultBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<VaultTab>(() => readStoredActiveTab(vaultAddress));

  useEffect(() => {
    setActiveTab(readStoredActiveTab(vaultAddress));
  }, [vaultAddress]);

  useEffect(() => {
    if (typeof window === 'undefined' || !vaultAddress) return;
    try {
      window.sessionStorage.setItem(`${ACTIVE_TAB_STORAGE_KEY}:${vaultAddress.toLowerCase()}`, activeTab);
    } catch {
      // Ignore storage failures.
    }
  }, [activeTab, vaultAddress]);

  useEffect(() => {
    let cancelled = false;

    async function load(opts?: { background?: boolean }) {
      const bg = opts?.background ?? false;
      if (!bg) {
        setLoading(true);
        setError(null);
      }
      try {
        const next = await fetchVaultBundle(vaultAddress);
        if (!cancelled) {
          setBundle(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && !bg) {
          setBundle(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled && !bg) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => { void load({ background: true }); }, REFRESH_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [vaultAddress]);

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-slate-300">
        Loading vault data for <span className="font-mono text-sm text-white">{vaultAddress}</span>…
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="space-y-4 rounded-[2rem] border border-rose-300/20 bg-rose-300/10 p-8">
        <p className="text-sm uppercase tracking-[0.25em] text-rose-200/70">Lookup failed</p>
        <h2 className="text-2xl font-semibold text-white">Vault unavailable</h2>
        <p className="max-w-2xl text-slate-200/90">{error ?? 'Unable to load this vault.'}</p>
      </div>
    );
  }

  const { metadata, status, events, purposeTexts, proof } = bundle;

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap gap-3">
          {TABS.map((tab) => (
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
          purposeTexts={purposeTexts}
          walletSession={walletSession}
          onRequireWallet={ensureWallet}
        />
      ) : activeTab === 'activity' ? (
        <VaultActivityTab events={events} purposeTexts={purposeTexts} chainId={metadata.chainId} />
      ) : (
        <OwnerSettings vaultAddress={metadata.address} indexedOwnerAddress={metadata.owner} walletSession={walletSession} />
      )}
    </div>
  );
}
