import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import brigidLogoWhite from '../../media/brigid-logo-white.png';

type LayoutProps = {
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  banners?: React.ReactNode;
};

function MoreMenuButtonPreview() {
  return (
    <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-2xl border border-white/15 bg-slate-950/70 px-3 shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
      <span className="font-semibold tracking-[0.3em] text-white">...</span>
    </span>
  );
}

function ShareButtonPreview() {
  return (
    <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-2xl border border-white/15 bg-slate-950/70 px-3 shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 16V5" />
        <path d="m8.5 8.5 3.5-3.5 3.5 3.5" />
        <path d="M6 14.5v3A1.5 1.5 0 0 0 7.5 19h9a1.5 1.5 0 0 0 1.5-1.5v-3" />
      </svg>
    </span>
  );
}

export default function Layout({ children, headerRight, banners }: LayoutProps) {
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const dismissed = window.localStorage.getItem('beacon_ios_install_hint_dismissed') === '1';
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (typeof navigator !== 'undefined' &&
        'standalone' in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

    const userAgent = navigator.userAgent ?? '';
    const isIos = /iPad|iPhone|iPod/i.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);

    setShowIosInstallHint(isIos && isSafari && !standalone && !dismissed);
  }, []);

  function dismissIosInstallHint() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('beacon_ios_install_hint_dismissed', '1');
    }
    setShowIosInstallHint(false);
  }

  return (
    <div className="min-h-screen text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(56,189,248,0.14),_transparent_24%),linear-gradient(180deg,_#09111f_0%,_#020617_55%,_#02030a_100%)]" />
      <header
        className="border-b border-white/10 bg-slate-950/35 px-3 pb-4 pt-5 backdrop-blur sm:px-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.65rem)' }}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <div className={`flex items-center gap-4 ${headerRight ? 'justify-between' : 'justify-center'}`}>
            <Link to="/" className="flex items-center gap-3">
              <img
                src={brigidLogoWhite}
                alt="Brigid Forge"
                style={{ height: 120, transform: 'translateY(10%)' }}
                className="w-auto"
              />
            </Link>
            {headerRight ? <div className="flex flex-wrap items-center justify-end gap-3">{headerRight}</div> : null}
          </div>
        </div>
      </header>
      {showIosInstallHint ? (
        <div className="mx-auto mt-3 max-w-7xl px-3 sm:px-4">
          <div className="rounded-[1.75rem] border border-sky-300/20 bg-sky-300/10 px-4 py-4 text-sm text-sky-50 shadow-[0_18px_50px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-white">Install Brigid Beacon on your iPhone</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sky-50/90">
                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2">
                    <MoreMenuButtonPreview />
                    <span className="leading-5">1. Tap the <span className="font-medium text-white">...</span> menu in Safari</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2">
                    <ShareButtonPreview />
                    <span className="leading-5">2. Tap <span className="font-medium text-white">Share</span></span>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 leading-5">
                    3. Choose <span className="font-medium text-white">Add to Home Screen</span>, then tap <span className="font-medium text-white">Add</span>
                  </div>
                </div>
                <p className="mt-3 leading-6 text-sky-50/90">
                  Open Beacon from your home screen to enable iPhone push notifications.
                </p>
              </div>
              <button
                type="button"
                onClick={dismissIosInstallHint}
                className="shrink-0 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-medium text-sky-100 transition hover:border-white/20 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {banners}
      <main className="mx-auto max-w-7xl px-3 py-8 sm:px-4 sm:py-9">{children}</main>
    </div>
  );
}
