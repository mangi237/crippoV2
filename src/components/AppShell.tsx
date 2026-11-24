import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useMarket } from '../contexts/MarketContext';
import { CrippoLogo } from './CrippoLogo';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const { lang } = useLanguage();
  const {
    races,
    catalysts,
    myDividends,
    notifications,
    unreadNotifCount,
    affiliationRequests,
    searchQuery,
    setSearchQuery,
    toast,
    dismissToast,
    isAdmin,
    canLaunchRace,
    markNotificationRead,
    acceptRaiseOffer,
    acceptAffiliationRequest,
    declineAffiliationRequest,
  } = useMarket();
  const location = useLocation();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const isAuthPage = location.pathname === '/auth' || location.pathname === '/onboarding';

  const openRacesCount = races.filter((r) => r.status === 'open').length;

  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-surface text-on-surface flex flex-col">
        {children}
      </div>
    );
  }

  // Strict Role-Based Navigation (Creators replaces standalone Memo; Launch a Race hidden unless verified unaffiliated creator/agency/admin)
  const desktopNav = [
    { path: '/', label: lang === 'fr' ? 'Marché' : 'Market Feed' },
    { path: '/races', label: lang === 'fr' ? 'Projets (Races)' : 'Raises' },
    { path: '/creators', label: lang === 'fr' ? 'Créateurs' : 'Creators' },
    ...(user
      ? [
          { path: '/trades', label: lang === 'fr' ? 'Mes Trades' : 'My Trades' },
          { path: '/brands', label: lang === 'fr' ? 'Marques' : 'Brands' },
        ]
      : []),
    ...(canLaunchRace
      ? [{ path: '/launch-race', label: lang === 'fr' ? 'Lancer un Projet' : 'Launch a Raise' }]
      : []),
    ...(isAdmin ? [{ path: '/admin', label: 'Master Admin' }] : []),
  ];

  const sidebarDesks: Array<{
    path: string;
    label: string;
    badge?: string;
    highlight?: boolean;
  }> = [
    { path: '/', label: lang === 'fr' ? 'Marché & Actualités' : 'Market Feed', badge: `${openRacesCount}` },
    { path: '/races', label: lang === 'fr' ? 'Projets (Raises)' : 'Project Raises' },
    { path: '/creators', label: lang === 'fr' ? 'Créateurs' : 'Creators' },
    ...(user
      ? [
          { path: '/trades', label: lang === 'fr' ? 'Mes Trades' : 'My Trades & Timers' },
          { path: '/brands', label: lang === 'fr' ? 'Partenariats Marques' : 'Brands Hub' },
          { path: '/profile', label: lang === 'fr' ? 'Mon Profil' : 'My Profile' },
        ]
      : []),
    ...(canLaunchRace
      ? [{ path: '/launch-race', label: lang === 'fr' ? 'Lancer un Projet' : 'Launch a Raise', highlight: true }]
      : []),
    ...(isAdmin ? [{ path: '/admin', label: 'Master Admin', badge: 'ADMIN' }] : []),
  ];

  const isActive = (p: string) => {
    const clean = p.split('?')[0];
    if (clean === '/') return location.pathname === '/';
    return location.pathname.startsWith(clean);
  };

  // Horizontal stock-style scrolling ticker showing live project share price increases/decreases and trending movers
  const tickerEntries: Array<{
    key: string;
    type: 'race' | 'mover';
    label: string;
    value: string;
    positive: boolean;
    to: string;
  }> = [
    ...races.slice(0, 12).map((r) => {
      const delta =
        r.unitSharePriceXAF > 0
          ? Number((((r.currentSharePriceXAF - r.unitSharePriceXAF) / r.unitSharePriceXAF) * 100).toFixed(1))
          : 0;
      const arrow = delta >= 0 ? '▲' : '▼';
      return {
        key: `r_${r.id}`,
        type: 'race' as const,
        label: `${r.creatorName.toUpperCase()} · ${r.title.slice(0, 26)}`,
        value: `${r.currentSharePriceXAF.toLocaleString()} XAF ${arrow} ${delta >= 0 ? '+' : ''}${delta}%`,
        positive: delta >= 0,
        to: `/race/${r.id}`,
      };
    }),
    ...catalysts.slice(0, 10).map((c) => {
      const impact = Number(c.priceImpactPct || 0);
      const positive = c.sentiment !== 'risk_alert' && impact >= 0;
      const arrow = positive ? '▲' : '▼';
      return {
        key: `c_${c.id}`,
        type: 'mover' as const,
        label: `${c.entityName.toUpperCase()} · ${c.headline.slice(0, 42)}`,
        value: `${arrow} ${impact >= 0 ? '+' : ''}${impact}%`,
        positive,
        to: '/',
      };
    }),
  ];

  const totalNotifBadge = unreadNotifCount;

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col">
      {/* ================= DESKTOP HEADER (>= 1024px) ================= */}
      <header className="hidden lg:block fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest border-b border-outline-variant/40">
        <div className="w-full px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 shrink-0">
            <Link to="/" className="flex items-center gap-2.5">
              <CrippoLogo size={34} />
              <span className="font-headline-sm tracking-tight text-on-surface font-bold">CRIPPO</span>
            </Link>
          </div>

          <div className="flex-1 max-w-md">
            <div className="flex items-center gap-2 bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-secondary">
              <span className="material-symbols-outlined text-outline text-[18px]">search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  lang === 'fr'
                    ? 'Rechercher projets, créateurs, actualités...'
                    : 'Search Raises, Creators, News...'
                }
                className="w-full bg-transparent text-body-sm text-on-surface placeholder:text-outline outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-outline hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>
          </div>

          {/* Header Actions: ONLY Notifications icon & Minimalist Black Rounded-Rectangle Profile icon */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              aria-label="Notifications"
              className="relative w-9 h-9 rounded-lg bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-on-surface border border-outline-variant/30 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">notifications</span>
              {totalNotifBadge > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-secondary text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {totalNotifBadge}
                </span>
              )}
            </button>

            <Link
              to={user ? '/profile' : `/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
              aria-label={user ? 'My Profile' : 'Sign In'}
              title={user ? profile?.displayName || user.email || 'Profile' : 'Sign In / Get Started'}
              className="w-9 h-9 rounded-lg bg-black text-white border border-zinc-800 hover:bg-zinc-900 flex items-center justify-center transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">person</span>
            </Link>
          </div>
        </div>

        {/* Subnavigation Row */}
        <div className="w-full px-6 h-10 bg-surface-container-low border-t border-outline-variant/20 flex items-center justify-between overflow-x-auto no-scrollbar">
          <nav className="flex items-center gap-1 h-full">
            {desktopNav.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 h-7 rounded-lg inline-flex items-center font-label-md whitespace-nowrap transition-colors ${
                  isActive(item.path)
                    ? 'bg-surface-container-highest text-on-surface font-bold'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden xl:flex items-center gap-4 shrink-0">
            <span className="font-label-xs text-secondary uppercase tabular-nums">
              {openRacesCount} OPEN RAISES
            </span>
          </div>
        </div>
      </header>

      {/* ================= MOBILE HEADER (< 1024px) ================= */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 pt-safe bg-surface-container-lowest/95 backdrop-blur-xl border-b border-outline-variant/30">
        <div className="h-14 px-3.5 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <CrippoLogo size={32} />
            <span className="font-headline-sm uppercase tracking-tight text-on-surface font-bold text-[17px]">
              CRIPPO
            </span>
          </Link>

          {/* Mobile Header Actions: ONLY Notifications icon & Minimalist Black Rounded-Rectangle Profile icon */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              aria-label="Notifications"
              className="relative w-9 h-9 flex items-center justify-center rounded-lg bg-surface-container-low border border-outline-variant/30 text-on-surface hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-[19px]">notifications</span>
              {totalNotifBadge > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-secondary text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {totalNotifBadge}
                </span>
              )}
            </button>
            <Link
              to={user ? '/profile' : `/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
              aria-label={user ? 'My Profile' : 'Sign In'}
              className="w-9 h-9 rounded-lg bg-black text-white border border-zinc-800 flex items-center justify-center shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">person</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ================= DESKTOP LEFT SIDEBAR (256px) ================= */}
      <aside className="fixed left-0 top-[6.5rem] h-[calc(100vh-6.5rem)] w-64 bg-surface-container-lowest border-r border-outline-variant/30 z-40 hidden lg:flex flex-col justify-between py-4 px-3">
        <div className="flex flex-col gap-3">
          <div className="px-3 flex items-center justify-between">
            <span className="font-label-xs uppercase tracking-widest text-on-surface-variant">
              Exchange
            </span>
          </div>
          <nav className="flex flex-col gap-1">
            {sidebarDesks.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl font-label-md transition-colors ${
                  isActive(item.path)
                    ? 'bg-primary-container text-white font-bold'
                    : item.highlight
                    ? 'bg-secondary/10 text-secondary font-bold hover:bg-secondary/20'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <span className="truncate">{item.label}</span>
                {item.badge && (
                  <span className="font-label-xs bg-secondary-fixed text-on-secondary-fixed px-1.5 py-0.5 rounded-full tabular-nums">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5 px-3 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="font-label-xs uppercase text-on-surface-variant">CAMPAY ESCROW</span>
              <span className="font-ticker-val text-on-tertiary-container">XAF</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-label-xs uppercase text-on-surface-variant">SETTLEMENT</span>
              <span className="font-label-xs text-on-surface">MOMO / OM</span>
            </div>
          </div>
          {user ? (
            <button
              type="button"
              onClick={signOut}
              className="px-3 py-2 rounded-xl text-left font-label-xs uppercase text-error hover:bg-error-container/40 flex items-center justify-between"
            >
              <span>{lang === 'fr' ? 'Déconnexion' : 'Sign Out'}</span>
              <span className="material-symbols-outlined text-[16px]">logout</span>
            </button>
          ) : (
            <Link
              to="/auth"
              className="px-3 py-2.5 rounded-xl bg-secondary text-on-secondary font-label-xs uppercase text-center font-bold"
            >
              {lang === 'fr' ? 'Connexion / Démarrer' : 'Sign In / Get Started'}
            </Link>
          )}
        </div>
      </aside>

      {/* ================= SLIDE-OVER NOTIFICATIONS DRAWER ================= */}
      {notifOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setNotifOpen(false);
          }}
        >
          <div className="w-full max-w-sm bg-surface-container-lowest border-l border-outline-variant h-full p-5 overflow-y-auto flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-sm text-on-surface font-bold">Notifications</h3>
              <button
                type="button"
                onClick={() => setNotifOpen(false)}
                className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {notifications.length === 0 && myDividends.length === 0 && catalysts.length === 0 ? (
              <div className="p-4 rounded-xl bg-surface-container-low text-body-sm text-on-surface-variant">
                {lang === 'fr'
                  ? 'Aucune notification pour le moment.'
                  : 'No alerts yet. Market updates, raise offers, and dividends appear here.'}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Personal Real-Time Notifications (Raise Offers, Affiliations, KYC, Memos) */}
                {notifications.map((n) => {
                  const linkedRace = n.raceId ? races.find((r) => r.id === n.raceId) : undefined;
                  const linkedAff = n.requestId
                    ? affiliationRequests.find((a) => a.id === n.requestId)
                    : undefined;
                  const canAcceptOffer =
                    n.type === 'raise_offer' &&
                    linkedRace &&
                    linkedRace.status === 'awaiting_creator_acceptance';
                  const canRespondAff =
                    n.type === 'affiliation_request' && linkedAff && linkedAff.status === 'pending';

                  return (
                    <div
                      key={n.id}
                      className={`p-3.5 rounded-xl border space-y-2 ${
                        n.read
                          ? 'bg-surface-container-low border-outline-variant/30'
                          : 'bg-secondary-fixed/25 border-secondary/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-label-xs uppercase text-secondary font-bold">
                          {n.title}
                        </span>
                        {!n.read && (
                          <button
                            type="button"
                            onClick={() => markNotificationRead(n.id)}
                            className="text-[10px] font-label-xs uppercase text-on-surface-variant hover:text-on-surface"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                      <p className="font-body-sm text-on-surface">{n.message}</p>

                      {n.offerSummary && (
                        <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                          <div>
                            <span className="text-on-surface-variant block">Share Price</span>
                            <strong className="text-on-surface">
                              {n.offerSummary.unitSharePriceXAF.toLocaleString()} XAF
                            </strong>
                          </div>
                          <div>
                            <span className="text-on-surface-variant block">Total Shares</span>
                            <strong className="text-on-surface">
                              {n.offerSummary.totalShares.toLocaleString()}
                            </strong>
                          </div>
                          <div>
                            <span className="text-on-surface-variant block">Pool Rev Share</span>
                            <strong className="text-secondary">{n.offerSummary.revSharePct}%</strong>
                          </div>
                          <div>
                            <span className="text-on-surface-variant block">Per Share</span>
                            <strong className="text-on-tertiary-container">
                              {n.offerSummary.pctPerShare}%
                            </strong>
                          </div>
                        </div>
                      )}

                      {canAcceptOffer && linkedRace && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={actionBusyId === n.id}
                            onClick={async () => {
                              setActionBusyId(n.id);
                              try {
                                await acceptRaiseOffer(linkedRace.id, n.id);
                              } finally {
                                setActionBusyId(null);
                              }
                            }}
                            className="flex-1 py-2 px-3 rounded-lg bg-on-tertiary-container text-white font-label-xs uppercase font-bold"
                          >
                            {actionBusyId === n.id ? 'Publishing...' : 'Accept Split & Go Live'}
                          </button>
                          <Link
                            to={`/race/${linkedRace.id}`}
                            onClick={() => setNotifOpen(false)}
                            className="py-2 px-2.5 rounded-lg bg-surface-container text-on-surface font-label-xs uppercase"
                          >
                            View
                          </Link>
                        </div>
                      )}

                      {canRespondAff && linkedAff && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={actionBusyId === n.id}
                            onClick={async () => {
                              setActionBusyId(n.id);
                              try {
                                await acceptAffiliationRequest(linkedAff, n.id);
                              } finally {
                                setActionBusyId(null);
                              }
                            }}
                            className="flex-1 py-2 rounded-lg bg-on-tertiary-container text-white font-label-xs uppercase font-bold"
                          >
                            Accept Label
                          </button>
                          <button
                            type="button"
                            disabled={actionBusyId === n.id}
                            onClick={async () => {
                              setActionBusyId(n.id);
                              try {
                                await declineAffiliationRequest(linkedAff, n.id);
                              } finally {
                                setActionBusyId(null);
                              }
                            }}
                            className="flex-1 py-2 rounded-lg bg-error text-white font-label-xs uppercase font-bold"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {myDividends.slice(0, 4).map((d) => (
                  <div key={d.id} className="p-3 rounded-xl bg-tertiary-fixed/30 space-y-1">
                    <span className="font-label-xs text-on-tertiary-container uppercase">
                      DIVIDEND DISBURSED
                    </span>
                    <p className="font-ticker-val text-on-surface tabular-nums">
                      +{d.payoutAmountXAF.toLocaleString()} FCFA · {d.raceTitle}
                    </p>
                  </div>
                ))}

                {catalysts.slice(0, 5).map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-label-xs text-secondary uppercase">{c.sourceName}</span>
                      <span
                        className={`font-label-xs tabular-nums ${
                          c.sentiment === 'risk_alert' ? 'text-error' : 'text-on-tertiary-container'
                        }`}
                      >
                        {c.priceImpactPct >= 0 ? `+${c.priceImpactPct}%` : `${c.priceImpactPct}%`}
                      </span>
                    </div>
                    <p className="font-body-sm text-on-surface font-medium">{c.headline}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MAIN CONTENT VIEWPORT ================= */}
      <div className="lg:pl-64 flex-1 flex flex-col bg-surface">
        {/* Horizontal Stock-Style Project Price Ticker Crawl */}
        <div className="pt-14 lg:pt-[6.5rem]">
          <div className="w-full h-9 bg-primary-container text-white border-b border-outline-variant/40 overflow-hidden flex items-center">
            <div className="flex-1 overflow-hidden">
              {tickerEntries.length > 0 ? (
                <div className="animate-ticker flex items-center gap-6 px-4">
                  {[...tickerEntries, ...tickerEntries].map((item, idx) => (
                    <Link
                      key={`${item.key}_${idx}`}
                      to={item.to}
                      className="inline-flex items-center gap-2 text-[11px] font-mono-num whitespace-nowrap hover:underline tabular-nums"
                    >
                      <span className={item.type === 'mover' ? 'text-secondary-fixed font-semibold' : 'text-white font-semibold'}>
                        {item.label}
                      </span>
                      <span className={item.positive ? 'text-[#34D399] font-bold' : 'text-[#F87171] font-bold'}>
                        {item.value}
                      </span>
                      <span className="text-white/30">|</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="animate-ticker flex items-center gap-6 px-4 text-[11px] font-mono-num text-white/85 whitespace-nowrap tabular-nums">
                  <span>CRIPPO SHARE MARKET · LIVE PROJECT PRICING</span>
                  <span className="text-white/30">|</span>
                  <span>XAF CREATOR EQUITIES · DOUALA · YAOUNDE · BUEA</span>
                  <span className="text-white/30">|</span>
                  <span>MTN MOMO &amp; ORANGE MONEY CLEARING</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <main className="flex-1 w-full pb-24 lg:pb-8 bg-surface">
          {children}
        </main>

        {/* Global Clean Institutional Footer */}
        <footer className="hidden lg:block border-t border-outline-variant/25 bg-surface px-8 py-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <span className="font-headline-sm font-bold text-on-surface text-[15px]">CRIPPO</span>
                <span className="font-label-xs text-on-surface-variant uppercase">
                  XAF · OHADA COMPLIANT
                </span>
              </div>
              <p className="font-body-sm text-on-surface-variant max-w-xl">
                {lang === 'fr'
                  ? 'Grandissez avec les créateurs que vous aimez. Paiements directs via MTN MoMo & Orange Money.'
                  : 'Grow with the creators you love. Direct XAF escrow & verified royalty clearing.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 font-label-xs uppercase text-on-surface-variant">
              <Link to="/" className="hover:text-secondary">Market Feed</Link>
              <Link to="/races" className="hover:text-secondary">Raises</Link>
              <Link to="/creators" className="hover:text-secondary">Creators</Link>
              <Link to="/brands" className="hover:text-secondary">Brands Hub</Link>
            </div>
          </div>
        </footer>
      </div>

      {/* ================= MOBILE FIXED BOTTOM 5-TAB BAR (< 1024px) ================= */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 pb-safe bg-surface-container-lowest/95 border-t border-outline-variant/40 backdrop-blur-xl">
        <div className="flex justify-around items-center h-16 px-1 max-w-md mx-auto">
          <Link
            to="/"
            className={`flex flex-col items-center justify-center min-w-[56px] h-12 transition-colors ${
              location.pathname === '/' ? 'text-secondary font-semibold' : 'text-on-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-[21px]">candlestick_chart</span>
            <span className="font-label-xs mt-0.5">Market</span>
          </Link>
          <Link
            to="/races"
            className={`flex flex-col items-center justify-center min-w-[56px] h-12 transition-colors ${
              location.pathname.startsWith('/races') || location.pathname.startsWith('/race/')
                ? 'text-secondary font-semibold'
                : 'text-on-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-[21px]">trending_up</span>
            <span className="font-label-xs mt-0.5">Raises</span>
          </Link>
          <a
            href="/#predictions"
            onClick={(e) => {
              if (location.pathname !== '/') {
                e.preventDefault();
                navigate('/');
              }
            }}
            className="flex flex-col items-center justify-center min-w-[60px] h-12 transition-colors text-secondary font-semibold"
          >
            <span className="material-symbols-outlined text-[21px]">electric_bolt</span>
            <span className="font-label-xs mt-0.5">Predict</span>
          </a>
          <Link
            to="/creators"
            className={`flex flex-col items-center justify-center min-w-[56px] h-12 transition-colors ${
              location.pathname.startsWith('/creators') || location.pathname.startsWith('/creator/')
                ? 'text-secondary font-semibold'
                : 'text-on-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-[21px]">groups</span>
            <span className="font-label-xs mt-0.5">Creators</span>
          </Link>
          <Link
            to={isAdmin ? '/admin' : user ? '/trades' : '/profile'}
            className={`flex flex-col items-center justify-center min-w-[56px] h-12 transition-colors ${
              location.pathname.startsWith('/admin') ||
              location.pathname.startsWith('/trades') ||
              location.pathname.startsWith('/profile')
                ? 'text-secondary font-semibold'
                : 'text-on-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-[21px]">
              {isAdmin ? 'admin_panel_settings' : 'account_balance_wallet'}
            </span>
            <span className="font-label-xs mt-0.5">{isAdmin ? 'Admin' : 'Trades'}</span>
          </Link>
        </div>
      </nav>

      {/* ================= FLOATING TOAST ================= */}
      {toast && (
        <aside className="fixed bottom-20 lg:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 transition-all">
          <div className="bg-primary-container text-white rounded-xl p-3.5 shadow-xl flex items-center justify-between gap-3 border border-secondary/50">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 ${
                  toast.tone === 'error'
                    ? 'bg-error'
                    : toast.tone === 'info'
                    ? 'bg-secondary'
                    : 'bg-on-tertiary-container'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {toast.tone === 'error' ? 'warning' : 'check_circle'}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-ticker-val text-white truncate">{toast.title}</span>
                <span className="font-body-sm text-white/80 truncate">{toast.message}</span>
              </div>
            </div>
            <button type="button" onClick={dismissToast} className="text-white/80 p-1">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
