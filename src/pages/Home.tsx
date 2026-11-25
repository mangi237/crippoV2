import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import { useLanguage } from '../contexts/LanguageContext';
import { CamPayCheckoutModal } from '../components/CamPayCheckoutModal';
import { AuthPromptModal } from '../components/AuthPromptModal';
import { VerifiedCreatorOnly } from '../components/VerifiedCreatorOnly';
import { PredictionsSection } from '../components/PredictionsSection';
import { NewsSection } from '../components/NewsSection';
import { formatTimeRemaining, getCoverImage } from '../utils/media';
import type { Race } from '../types/crippo';

const CATEGORIES = ['All', 'Single', 'EP / Album', 'TikTok Series', 'YouTube Show', 'Movie'];

interface HomeProps {
  onOpenApiSetup: () => void;
}

export function Home({ onOpenApiSetup }: HomeProps) {
  const { user } = useAuth();
  const { races, searchQuery, showToast } = useMarket();
  const { lang, t } = useLanguage();

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [checkoutRace, setCheckoutRace] = useState<Race | null>(null);
  const [authPromptAction, setAuthPromptAction] = useState<string | null>(null);

  const filteredRaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return races
      .filter((r) => r.isPublic)
      .filter((r) => {
        if (selectedCategory === 'All') return true;
        return r.category.toLowerCase().includes(selectedCategory.toLowerCase().split(' ')[0]);
      })
      .filter((r) => {
        if (!q) return true;
        return (
          r.title.toLowerCase().includes(q) ||
          r.creatorName.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)
        );
      });
  }, [races, selectedCategory, searchQuery]);

  return (
    <div className="flex flex-col gap-10">
      {/* 1. LIVE RAISES */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="font-headline-lg-mobile md:font-headline-lg text-on-surface font-bold">Live Raises</h1>
            <span className="px-2 py-0.5 rounded bg-on-tertiary-container/15 text-on-tertiary-container font-label-xs uppercase font-bold tabular-nums">
              {filteredRaces.length} ACTIVE
            </span>
          </div>

          <div className="flex items-center gap-3">
            <VerifiedCreatorOnly requireCanLaunch>
              <Link
                to="/launch-race"
                className="px-3.5 py-2 rounded-xl bg-secondary text-on-secondary font-label-md font-bold hover:opacity-95"
              >
                + Launch a Raise
              </Link>
            </VerifiedCreatorOnly>
            <Link to="/races" className="font-label-xs uppercase text-secondary font-bold hover:underline">
              VIEW ALL ({filteredRaces.length})
            </Link>
          </div>
        </div>

        {/* Category Filter Strip */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full font-label-md whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-primary text-on-primary font-semibold'
                  : 'text-on-surface-variant hover:text-secondary border border-outline-variant/35'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {filteredRaces.length === 0 ? (
          <div className="py-10 border-t border-outline-variant/25 text-center flex flex-col items-center gap-3">
            <h3 className="font-headline-sm text-on-surface font-bold">{t('no_races_title')}</h3>
            <p className="font-body-md text-on-surface-variant max-w-md">{t('no_races_desc')}</p>
            <VerifiedCreatorOnly
              requireCanLaunch
              fallback={
                <Link
                  to="/creators"
                  className="mt-1 px-4 py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
                >
                  Explore Creators Directory
                </Link>
              }
            >
              <Link
                to="/launch-race"
                className="mt-1 px-4 py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
              >
                {t('launch_first_race')}
              </Link>
            </VerifiedCreatorOnly>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {filteredRaces.map((race) => {
              const fundedPct = Math.min(100, Math.round((race.sharesSold / Math.max(1, race.totalShares)) * 100));
              const raisedXAF = race.sharesSold * race.currentSharePriceXAF;
              const sharesLeft = Math.max(0, race.totalShares - race.sharesSold);
              const isOpenWindow =
                race.status === 'open' && Date.now() < new Date(race.raceCloseDate).getTime() && sharesLeft > 0;
              const sparkData =
                race.priceHistory && race.priceHistory.length >= 2
                  ? race.priceHistory.slice(-10).map((p, idx) => ({ idx, price: p.priceXAF }))
                  : [
                      { idx: 0, price: race.unitSharePriceXAF },
                      { idx: 1, price: race.currentSharePriceXAF },
                    ];

              return (
                <article key={race.id} className="pt-4 border-t border-outline-variant/25 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <img
                        src={getCoverImage(race.category, race.coverArtUrl)}
                        alt={race.title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/race/${race.id}`}
                            className="font-headline-sm text-[16px] text-on-surface font-bold hover:text-secondary truncate"
                          >
                            {race.creatorName}: {race.title}
                          </Link>
                          <span className="px-2 py-0.5 rounded bg-on-tertiary-container/15 text-on-tertiary-container font-label-xs font-bold shrink-0 tabular-nums">
                            {race.crippoScore}/100
                          </span>
                        </div>
                        <p className="font-body-sm text-on-surface-variant truncate mt-0.5">
                          {race.category} · {race.monitorableSources[0] || 'Digital Revenue Share'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <span className="font-ticker-val text-on-tertiary-container font-bold block">
                        +{race.revSharePct}% REV
                      </span>
                      <span className="font-body-sm text-[11px] text-on-surface-variant">{race.roiDurationMonths}m Term</span>
                    </div>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0 tabular-nums">
                      <span className="font-label-xs uppercase text-on-surface-variant block">FUNDED</span>
                      <span className="font-ticker-val text-on-surface font-bold">
                        {raisedXAF.toLocaleString()} FCFA{' '}
                        <span className="font-body-sm text-on-surface-variant font-normal">
                          / {(race.grossTargetXAF / 1_000_000).toFixed(1)}M
                        </span>
                      </span>
                    </div>

                    <div className="w-20 h-9 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sparkData}>
                          <Area
                            type="monotone"
                            dataKey="price"
                            stroke="#6f30dc"
                            strokeWidth={2}
                            fill="#6f30dc"
                            fillOpacity={0.14}
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <span className="font-label-xs uppercase text-on-surface-variant block">SHARE PRICE</span>
                      <span className="font-ticker-val text-secondary font-bold">
                        {race.currentSharePriceXAF.toLocaleString()} XAF
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                      <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${fundedPct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-on-surface-variant tabular-nums">
                      <span>{fundedPct}% Funded</span>
                      <span>
                        {sharesLeft} Shares Left · {formatTimeRemaining(race.raceCloseDate, lang)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      disabled={!isOpenWindow}
                      onClick={() => {
                        if (!user) {
                          setAuthPromptAction(`buy shares in "${race.title}"`);
                          return;
                        }
                        setCheckoutRace(race);
                      }}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-on-primary font-label-md text-[12px] font-bold uppercase tracking-wider hover:opacity-95 disabled:opacity-50"
                    >
                      {!isOpenWindow ? 'WINDOW CLOSED' : 'INVEST VIA MOMO'}
                    </button>
                    <Link
                      to={`/race/${race.id}`}
                      className="py-2.5 px-4 rounded-xl border border-outline-variant/50 text-on-surface font-label-md text-[12px] font-bold uppercase tracking-wider hover:border-secondary hover:text-secondary transition-colors"
                    >
                      DETAILS
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. CULTURAL PREDICTIONS & FAN VOTING */}
      <div className="border-t border-outline-variant/25 pt-8">
        <PredictionsSection
          onOpenApiSetup={onOpenApiSetup}
          onRequireAuth={(actionLabel) => setAuthPromptAction(actionLabel)}
        />
      </div>

      {/* 3. TRENDING NEWS */}
      <div className="border-t border-outline-variant/25 pt-8">
        <NewsSection
          onOpenApiSetup={onOpenApiSetup}
          onRequireAuth={(actionLabel) => setAuthPromptAction(actionLabel)}
        />
      </div>

      {checkoutRace && (
        <CamPayCheckoutModal
          mode="race"
          race={checkoutRace}
          onClose={() => setCheckoutRace(null)}
          onSuccess={(msg) => showToast('Trade Settled', msg, 'success')}
          onOpenApiSetup={onOpenApiSetup}
        />
      )}

      {authPromptAction && (
        <AuthPromptModal actionLabel={authPromptAction} onClose={() => setAuthPromptAction(null)} />
      )}
    </div>
  );
}
