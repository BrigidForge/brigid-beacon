import { Link } from 'react-router-dom';
import brigidLogoWhite from '../../media/brigid-logo-white.png';

type LayoutProps = {
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  banners?: React.ReactNode;
};

export default function Layout({ children, headerRight, banners }: LayoutProps) {
  return (
    <div className="min-h-screen text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(56,189,248,0.14),_transparent_24%),linear-gradient(180deg,_#09111f_0%,_#020617_55%,_#02030a_100%)]" />
      <header
        className="border-b border-white/10 bg-slate-950/35 px-3 pb-4 pt-5 backdrop-blur sm:px-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.9rem)' }}
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
      {banners}
      <main className="mx-auto max-w-7xl px-3 py-8 sm:px-4 sm:py-9">{children}</main>
    </div>
  );
}
