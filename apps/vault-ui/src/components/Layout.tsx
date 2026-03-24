import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import brigidLogoWhite from '../../media/brigid-logo-white.png';
import beaconAppIcon from '../../media/icon-180.png';

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

function ViewMoreButtonPreview() {
  return (
    <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-2xl border border-white/15 bg-slate-950/70 px-3 shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m7 10 5 5 5-5" />
        </svg>
      </span>
    </span>
  );
}

function AppIconPreview() {
  return (
    <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-[1rem] border border-white/15 bg-slate-950/70 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
      <img src={beaconAppIcon} alt="Brigid Beacon app icon" className="h-full w-full rounded-[0.8rem] object-contain" />
    </span>
  );
}

function AddToHomeScreenPreview() {
  return (
    <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-2xl border border-white/15 bg-slate-950/70 px-3 shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-white/20">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 7v10" />
          <path d="M7 12h10" />
        </svg>
      </span>
    </span>
  );
}

export default function Layout({ children, headerRight, banners }: LayoutProps) {
  const [showMobileNonSafariHint, setShowMobileNonSafariHint] = useState(false);
  const [iosInstallHintEligible, setIosInstallHintEligible] = useState(false);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const installSeen = window.localStorage.getItem('beacon_ios_pwa_opened_once') === '1';
    const dismissed = window.localStorage.getItem('beacon_ios_install_hint_collapsed') === '1';
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (typeof navigator !== 'undefined' &&
        'standalone' in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

    const userAgent = navigator.userAgent ?? '';
    const isIos = /iPad|iPhone|iPod/i.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(userAgent);
    const isMobile = isIos || isAndroid;
    const isSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);

    if (standalone) {
      window.localStorage.setItem('beacon_ios_pwa_opened_once', '1');
    }

    const eligible = isIos && isSafari && !standalone && !installSeen;
    setShowMobileNonSafariHint(isMobile && !standalone && !isSafari);
    setIosInstallHintEligible(eligible);
    setShowIosInstallHint(eligible && !dismissed);
  }, []);

  function dismissIosInstallHint() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('beacon_ios_install_hint_collapsed', '1');
    }
    setShowIosInstallHint(false);
  }

  function expandIosInstallHint() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('beacon_ios_install_hint_collapsed');
    }
    setShowIosInstallHint(true);
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
      {showMobileNonSafariHint ? (
        <div className="mx-auto mt-3 max-w-7xl px-3 sm:px-4">
          <div className="rounded-[1.75rem] border border-amber-300/20 bg-amber-300/10 px-4 py-4 text-sm text-amber-50 shadow-[0_18px_50px_rgba(15,23,42,0.22)]">
            <p className="font-medium text-white">For iPhone and iPad, install Brigid Beacon from Safari</p>
            <p className="mt-2 leading-6 text-amber-50/90">
              You are using a mobile browser other than Safari. To add Brigid Beacon to your home screen and enable iPhone push notifications, open this site in <span className="font-medium text-white">Safari</span>.
            </p>
          </div>
        </div>
      ) : null}
      {iosInstallHintEligible && !showIosInstallHint ? (
        <div className="mx-auto mt-3 max-w-7xl px-3 sm:px-4">
          <button
            type="button"
            onClick={expandIosInstallHint}
            className="inline-flex items-center gap-2 rounded-2xl border border-sky-300/20 bg-sky-300/10 px-4 py-2 text-sm font-medium text-sky-50 shadow-[0_12px_30px_rgba(15,23,42,0.18)] transition hover:border-sky-200/30 hover:bg-sky-300/15"
          >
            <span>Show iPhone install steps</span>
            <span aria-hidden="true">↓</span>
          </button>
        </div>
      ) : null}
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
                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2">
                    <ViewMoreButtonPreview />
                    <span className="leading-5">3. Tap the down arrow to <span className="font-medium text-white">View More</span></span>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2">
                    <AddToHomeScreenPreview />
                    <span className="leading-5">4. Choose <span className="font-medium text-white">Add to Home Screen</span>, then tap <span className="font-medium text-white">Add</span></span>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2">
                    <AppIconPreview />
                    <span className="leading-5">5. Open the <span className="font-medium text-white">Brigid Beacon</span> app from your home screen</span>
                  </div>
                </div>
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
