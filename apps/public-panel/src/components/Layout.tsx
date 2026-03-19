import { Link } from 'react-router-dom';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(56,189,248,0.14),_transparent_24%),linear-gradient(180deg,_#09111f_0%,_#020617_55%,_#02030a_100%)]" />
      <header className="border-b border-white/10 bg-slate-950/35 px-6 py-5 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <Link to="/" className="text-xl font-semibold tracking-[0.08em] text-amber-300 hover:text-amber-200">
              BrigidVault Public Panel
            </Link>
            <nav className="hidden items-center gap-3 text-sm text-slate-400 sm:flex">
              <Link to="/" className="rounded-full border border-white/10 px-3 py-1.5 hover:border-sky-300/30 hover:text-sky-100">
                Vault Activity
              </Link>
              <Link to="/analytics/tokens" className="rounded-full border border-white/10 px-3 py-1.5 hover:border-amber-300/30 hover:text-amber-100">
                Analytics
              </Link>
            </nav>
          </div>
          <p className="hidden text-sm text-slate-400 sm:block">Visitor-facing visibility for indexed BrigidVaults</p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
