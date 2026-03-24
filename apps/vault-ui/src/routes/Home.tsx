import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const PWA_PUBLIC_ONBOARDING_SEEN_KEY = 'beacon_pwa_public_push_onboarding_seen';

function shouldStartPwaPublicOnboarding() {
  if (typeof window === 'undefined') return false;

  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (typeof navigator !== 'undefined' &&
      'standalone' in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const isTouchDevice =
    typeof navigator !== 'undefined' &&
    ((navigator.maxTouchPoints ?? 0) > 0 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent ?? ''));

  if (!standalone || !isTouchDevice) {
    return false;
  }

  try {
    if (window.localStorage.getItem(PWA_PUBLIC_ONBOARDING_SEEN_KEY) === '1') {
      return false;
    }
    window.localStorage.setItem(PWA_PUBLIC_ONBOARDING_SEEN_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    if (shouldStartPwaPublicOnboarding()) {
      navigate('/view?setupPush=1', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="flex flex-col items-center gap-12 py-10">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.35em] text-amber-300/70">BrigidVault Beacon</p>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">What would you like to do?</h1>
        <p className="mt-4 text-slate-400">Choose your role to get started.</p>
      </div>

      <div className="grid w-full max-w-3xl gap-5 sm:grid-cols-2">
        {/* Public Viewer */}
        <button
          type="button"
          onClick={() => navigate('/view')}
          className="group flex flex-col gap-5 rounded-[2rem] border border-white/10 bg-white/5 p-8 text-left transition hover:border-amber-300/30 hover:bg-amber-300/5"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-2xl">
            👁
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Public Vault Viewer</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              View vault status, vesting schedule, activity history, and set up email alerts — no wallet required.
            </p>
          </div>
          <span className="mt-auto rounded-2xl border border-amber-300/30 px-4 py-2 text-sm font-medium text-amber-200 transition group-hover:border-amber-300/60 group-hover:bg-amber-300/10">
            Enter vault address →
          </span>
        </button>

        {/* Operator Panel */}
        <button
          type="button"
          onClick={() => navigate('/operator')}
          className="group flex flex-col gap-5 rounded-[2rem] border border-white/10 bg-white/5 p-8 text-left transition hover:border-sky-300/30 hover:bg-sky-300/5"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-300/20 bg-sky-300/10 text-2xl">
            🔐
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Operator Panel</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Connect your wallet to manage withdrawals, monitor your vaults, and configure Beacon notification alerts.
            </p>
          </div>
          <span className="mt-auto rounded-2xl border border-sky-300/30 px-4 py-2 text-sm font-medium text-sky-200 transition group-hover:border-sky-300/60 group-hover:bg-sky-300/10">
            Connect wallet →
          </span>
        </button>
      </div>
    </div>
  );
}
