import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { AnimatePresence, motion } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import { useLanguage } from '../contexts/LanguageContext';
import { CamPayCheckoutModal } from '../components/CamPayCheckoutModal';
import { AuthPromptModal } from '../components/AuthPromptModal';
import { VerifiedCreatorOnly } from '../components/VerifiedCreatorOnly';
import { formatTimeRemaining, getCoverImage } from '../utils/media';
import type { Race, PredictionMarket, CatalystSegment } from '../types/crippo';

const CATEGORIES = ['All', 'Single', 'EP / Album', 'TikTok Series', 'YouTube Show', 'Movie'];
const SEGMENTS: Array<'All' | CatalystSegment> = [
  'All',
  'Trending',
  'Entertainment',
  'Music',
  'Tech',
  'Local News',
];

interface HomeProps {
  onOpenApiSetup: () => void;
}

export function Home({ onOpenApiSetup }: HomeProps) {
  const { user } = useAuth();
  const { races, entities, catalysts, predictions, searchQuery, showToast, isAdmin } = useMarket();
  const { lang, t } = useLanguage();

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSegment, setSelectedSegment] = useState<'All' | CatalystSegment>('All');
  const [viewMode, setViewMode] = useState<'compact' | 'table'>('compact');

  const [activePredIdx, setActivePredIdx] = useState(0);
  const [hoverPred, setHoverPred] = useState(false);

  const [checkoutRace, setCheckoutRace] = useState<Race | null>(null);
  const [checkoutPred, setCheckoutPred] = useState<{
    pred: PredictionMarket;
    side: 'YES' | 'NO';
  } | null>(null);
  const [authPromptAction, setAuthPromptAction] = useState<string | null>(null);

  const [syncingPulse, setSyncingPulse] = useState(false);
  const [mintingPreds, setMintingPreds] = useState(false);

  const [showNewPredModal, setShowNewPredModal] = useState(false);
  const [predEntityName, setPredEntityName] = useState('');
  const [predQuestion, setPredQuestion] = useState('');
  const [predEndsAt, setPredEndsAt] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [predBusy, setPredBusy] = useState(false);

  useEffect(() => {
    if (predictions.length <= 1 || hoverPred) return;
    const timer = setInterval(() => {
      setActivePredIdx((idx) => (idx + 1) % predictions.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [predictions.length, hoverPred]);

  useEffect(() => {
    if (activePredIdx >= predictions.length && predictions.length > 0) {
      setActivePredIdx(0);
    }
  }, [predictions.length, activePredIdx]);

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

  const filteredCatalysts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalysts
      .filter((c) => (selectedSegment === 'All' ? true : c.segment === selectedSegment))
      .filter((c) => {
        if (!q) return true;
        return (
          c.entityName.toLowerCase().includes(q) ||
          c.headline.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q)
        );
      });
  }, [catalysts, selectedSegment, searchQuery]);

  const handleRefreshPulse = async () => {
    if (!user) {
      setAuthPromptAction('refresh live Trending News');
      return;
    }
    if (!user.emailVerified) {
      showToast(
        lang === 'fr' ? 'Vérification Requise' : 'Verified Email Required',
        lang === 'fr'
          ? 'Vérifiez votre e-mail pour actualiser les actualités.'
          : 'Verify your email address to refresh live Trending News.',
        'info'
      );
      return;
    }
    setSyncingPulse(true);
    try {
      const names = entities.slice(0, 6).map((e) => e.stageName);
      const resp = await apiFetch<{
        catalysts: Array<{
          entityName: string;
          segment: CatalystSegment;
          sourcePlatform: 'TikTok' | 'Facebook' | 'YouTube' | 'Web';
          sourceName: string;
          sourceUrl?: string;
          headline: string;
          summary: string;
          sentiment: 'bullish' | 'neutral' | 'risk_alert';
          priceImpactPct: number;
          engagementCount?: number;
        }>;
      }>('/api/agents/cultural-pulse', {
        method: 'POST',
        body: JSON.stringify({
          entityNames: names.length ? names : ['Cameroon Music', 'Douala Creators', 'Afropop'],
        }),
      });

      let count = 0;
      let repricedRaces = 0;
      const nowMs = Date.now();

      for (const item of resp.catalysts || []) {
        const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const seg: CatalystSegment = ['Trending', 'Entertainment', 'Music', 'Tech', 'Local News'].includes(
          item.segment
        )
          ? item.segment
          : 'Trending';
        const plat: 'TikTok' | 'Facebook' | 'YouTube' | 'Web' = ['TikTok', 'Facebook', 'YouTube', 'Web'].includes(
          item.sourcePlatform
        )
          ? item.sourcePlatform
          : 'Web';
        const impact = Math.max(-50, Math.min(50, Number(item.priceImpactPct) || 0));
        const cleanEntityName = (item.entityName || 'Cameroon Scene').slice(0, 100);

        await setDoc(doc(db, 'catalysts', id), {
          id,
          entityName: cleanEntityName,
          segment: seg,
          sourcePlatform: plat,
          sourceName: (item.sourceName || plat).slice(0, 100),
          ...(item.sourceUrl ? { sourceUrl: item.sourceUrl.slice(0, 500) } : {}),
          headline: (item.headline || 'Market Signal').slice(0, 200),
          summary: (item.summary || 'Live market update captured.').slice(0, 600),
          sentiment: ['bullish', 'neutral', 'risk_alert'].includes(item.sentiment)
            ? item.sentiment
            : 'neutral',
          priceImpactPct: impact,
          ...(typeof item.engagementCount === 'number'
            ? { engagementCount: Math.max(0, item.engagementCount) }
            : {}),
          publishedAt: new Date().toISOString(),
          isPublic: true,
          createdAt: serverTimestamp(),
        });
        count++;

        // Automatically adjust share price for active open Raises matching this creator (only before raceCloseDate)
        if (impact !== 0) {
          const matchedOpenRaces = races.filter(
            (r) =>
              r.status === 'open' &&
              new Date(r.raceCloseDate).getTime() > nowMs &&
              !(r.appliedCatalystIds || []).includes(id) &&
              (r.creatorName.toLowerCase().includes(cleanEntityName.toLowerCase()) ||
                cleanEntityName.toLowerCase().includes(r.creatorName.toLowerCase()))
          );
          for (const race of matchedOpenRaces) {
            const boundedImpact = Math.max(-25, Math.min(25, impact));
            const nextPrice = Math.max(
              100,
              Math.round(race.currentSharePriceXAF * (1 + boundedImpact / 100))
            );
            if (nextPrice !== race.currentSharePriceXAF) {
              const nextHistory = [
                ...(race.priceHistory || []).slice(-39),
                {
                  timestamp: new Date().toISOString(),
                  priceXAF: nextPrice,
                  reason: `News: ${item.headline.slice(0, 48)}`,
                },
              ];
              await updateDoc(doc(db, 'races', race.id), {
                currentSharePriceXAF: nextPrice,
                priceHistory: nextHistory,
                appliedCatalystIds: [...(race.appliedCatalystIds || []).slice(-49), id],
                updatedAt: serverTimestamp(),
              });
              repricedRaces++;
            }
          }
        }
      }

      showToast(
        lang === 'fr' ? 'Actualités Mises à Jour' : 'Trending News Updated',
        repricedRaces > 0
          ? `${count} stories ingested · ${repricedRaces} active Raise prices adjusted.`
          : `${count} live stories ingested.`
      );
    } catch (err: unknown) {
      const e = err as Error & { missingKeys?: string[] };
      if (isAdmin && e.missingKeys?.length) onOpenApiSetup();
      showToast('News Update Error', e.message || 'Could not refresh news.', 'error');
    } finally {
      setSyncingPulse(false);
    }
  };

  const handleAutoMintPredictions = async () => {
    if (!user) {
      setAuthPromptAction('generate predictions');
      return;
    }
    if (!user.emailVerified) {
      showToast('Verified Email Required', 'Verify your email to generate predictions.', 'info');
      return;
    }
    setMintingPreds(true);
    try {
      const resp = await apiFetch<{
        predictions: Array<{
          entityName: string;
          topicCategory: PredictionMarket['topicCategory'];
          question: string;
          resolutionSource: string;
          aiProbability: number;
          yesPriceXAF: number;
          noPriceXAF: number;
          reasoning: string;
          endsAt: string;
        }>;
      }>('/api/agents/trend-probabilities', {
        method: 'POST',
        body: JSON.stringify({
          entityNames: entities.slice(0, 8).map((e) => e.stageName),
          recentHeadlines: catalysts.slice(0, 8).map((c) => `${c.entityName}: ${c.headline}`),
          count: 3,
        }),
      });

      let created = 0;
      for (const p of resp.predictions || []) {
        const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await setDoc(doc(db, 'predictions', id), {
          id,
          creatorUid: user.uid,
          entityName: p.entityName,
          topicCategory: p.topicCategory,
          question: p.question,
          resolutionSource: p.resolutionSource,
          aiProbability: p.aiProbability,
          reasoning: p.reasoning,
          yesPriceXAF: p.yesPriceXAF,
          noPriceXAF: p.noPriceXAF,
          yesVotes: Math.max(1, p.yesPriceXAF),
          noVotes: Math.max(1, p.noPriceXAF),
          totalVolumeXAF: 0,
          endsAt: new Date(p.endsAt).toISOString(),
          status: 'open',
          isPublic: true,
          createdAt: serverTimestamp(),
        });
        created++;
      }
      showToast('Predictions Published', `${created} cultural prediction markets live.`);
    } catch (err: unknown) {
      const e = err as Error & { missingKeys?: string[] };
      if (isAdmin && e.missingKeys?.length) onOpenApiSetup();
      showToast('Prediction Error', e.message || 'Failed to synthesize predictions.', 'error');
    } finally {
      setMintingPreds(false);
    }
  };

  const handleCreatePrediction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.emailVerified) {
      showToast('Sign-In Required', 'Verified email required to launch a prediction.', 'error');
      return;
    }
    if (predQuestion.trim().length < 5 || !predEntityName.trim()) {
      showToast('Validation', 'Enter entity name and a question (5+ chars).', 'error');
      return;
    }

    setPredBusy(true);
    const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      await setDoc(doc(db, 'predictions', id), {
        id,
        creatorUid: user.uid,
        entityName: predEntityName.trim().slice(0, 100),
        question: predQuestion.trim().slice(0, 240),
        yesPriceXAF: 50,
        noPriceXAF: 50,
        yesVotes: 1,
        noVotes: 1,
        totalVolumeXAF: 0,
        endsAt: new Date(predEndsAt).toISOString(),
        status: 'open',
        isPublic: true,
        createdAt: serverTimestamp(),
      });
      setShowNewPredModal(false);
      setPredEntityName('');
      setPredQuestion('');
      showToast('Prediction Live', 'Cultural prediction contract published on the live floor.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `predictions/${id}`);
    } finally {
      setPredBusy(false);
    }
  };

  const activePred = predictions[activePredIdx];
  const predTotalVotes = activePred ? Math.max(1, activePred.yesVotes + activePred.noVotes) : 2;
  const yesPct = activePred ? Math.round((activePred.yesVotes / predTotalVotes) * 100) : 50;
  const noPct = 100 - yesPct;

  return (
    <div className="flex flex-col gap-10">
      {/* 1. SECTION ONE (TOP): LIVE RAISES */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="font-headline-lg-mobile md:font-headline-lg text-on-surface font-bold">
              Live Raises
            </h1>
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
            <Link
              to="/races"
              className="font-label-xs uppercase text-secondary font-bold hover:underline"
            >
              VIEW ALL ({filteredRaces.length})
            </Link>
            <div className="flex items-center gap-1 border-b border-outline-variant/30 pb-0.5">
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                className={`px-2.5 py-1 rounded-lg font-label-xs uppercase transition-colors ${
                  viewMode === 'compact'
                    ? 'bg-secondary text-on-secondary font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Feed
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 rounded-lg font-label-xs uppercase transition-colors ${
                  viewMode === 'table'
                    ? 'bg-secondary text-on-secondary font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Table
              </button>
            </div>
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

        {/* Races Stream (Borderless Continuous Layout) */}
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
        ) : viewMode === 'compact' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {filteredRaces.map((race) => {
              const fundedPct = Math.min(
                100,
                Math.round((race.sharesSold / Math.max(1, race.totalShares)) * 100)
              );
              const raisedXAF = race.sharesSold * race.currentSharePriceXAF;
              const sharesLeft = Math.max(0, race.totalShares - race.sharesSold);
              const isOpenWindow =
                race.status === 'open' &&
                Date.now() < new Date(race.raceCloseDate).getTime() &&
                sharesLeft > 0;
              const sparkData =
                race.priceHistory && race.priceHistory.length >= 2
                  ? race.priceHistory.slice(-10).map((p, idx) => ({ idx, price: p.priceXAF }))
                  : [
                      { idx: 0, price: race.unitSharePriceXAF },
                      { idx: 1, price: race.currentSharePriceXAF },
                    ];

              return (
                <article
                  key={race.id}
                  className="pt-4 border-t border-outline-variant/25 flex flex-col gap-3"
                >
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
                      <span className="font-body-sm text-[11px] text-on-surface-variant">
                        {race.roiDurationMonths}m Term
                      </span>
                    </div>
                  </div>

                  {/* Seamless Metric Row + Sparkline */}
                  <div className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0 tabular-nums">
                      <span className="font-label-xs uppercase text-on-surface-variant block">
                        FUNDED
                      </span>
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
                      <span className="font-label-xs uppercase text-on-surface-variant block">
                        SHARE PRICE
                      </span>
                      <span className="font-ticker-val text-secondary font-bold">
                        {race.currentSharePriceXAF.toLocaleString()} XAF
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="flex flex-col gap-1">
                    <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                      <div
                        className="h-full rounded-full bg-secondary transition-all"
                        style={{ width: `${fundedPct}%` }}
                      />
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
        ) : (
          <div className="border-t border-outline-variant/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/30 font-label-xs uppercase text-on-surface-variant">
                    <th className="py-3 pr-4">Project / Creator</th>
                    <th className="py-3 px-3">Price</th>
                    <th className="py-3 px-3">Rev Share</th>
                    <th className="py-3 px-3">Funded</th>
                    <th className="py-3 px-3">Score</th>
                    <th className="py-3 pl-4 text-right">Trade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20 font-body-sm tabular-nums">
                  {filteredRaces.map((r) => {
                    const pct = Math.min(
                      100,
                      Math.round((r.sharesSold / Math.max(1, r.totalShares)) * 100)
                    );
                    const openWindow =
                      r.status === 'open' && Date.now() < new Date(r.raceCloseDate).getTime();
                    return (
                      <tr key={r.id} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="py-3 pr-4">
                          <Link
                            to={`/race/${r.id}`}
                            className="font-bold text-on-surface hover:text-secondary block"
                          >
                            {r.title}
                          </Link>
                          <span className="text-[11px] text-on-surface-variant">
                            {r.creatorName} · {r.category}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-ticker-val text-on-surface">
                          {r.currentSharePriceXAF.toLocaleString()} XAF
                        </td>
                        <td className="py-3 px-3 font-ticker-val text-secondary">
                          {r.revSharePct}% / {r.roiDurationMonths}m
                        </td>
                        <td className="py-3 px-3 font-mono-num">{pct}%</td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded bg-secondary-fixed text-secondary font-label-xs">
                            {r.crippoScore}/100
                          </span>
                        </td>
                        <td className="py-3 pl-4 text-right">
                          <button
                            type="button"
                            disabled={!openWindow}
                            onClick={() => {
                              if (!user) {
                                setAuthPromptAction(`buy shares in "${r.title}"`);
                                return;
                              }
                              setCheckoutRace(r);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-on-tertiary-container text-white font-label-xs uppercase font-bold disabled:opacity-50"
                          >
                            {openWindow ? 'Buy' : 'Closed'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 2. SECTION TWO: CULTURAL PREDICTIONS (Borderless Seamless Flow) */}
      <section
        id="predictions"
        className="border-t border-outline-variant/25 pt-8 flex flex-col gap-5"
        onMouseEnter={() => setHoverPred(true)}
        onMouseLeave={() => setHoverPred(false)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-headline-lg-mobile text-on-surface font-bold">
            {lang === 'fr' ? 'Prédictions Culturelles' : 'Cultural Predictions'}
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            {user && (
              <button
                type="button"
                disabled={mintingPreds}
                onClick={handleAutoMintPredictions}
                className="px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface font-label-xs uppercase hover:border-secondary hover:text-secondary transition-colors disabled:opacity-60"
              >
                {mintingPreds ? '...' : 'Refresh Predictions'}
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowNewPredModal(true)}
                className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-xs uppercase font-bold"
              >
                + New
              </button>
            )}
          </div>
        </div>

        {activePred ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={activePred.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
              className="flex flex-col gap-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2.5 py-0.5 rounded bg-secondary-fixed text-secondary font-label-xs uppercase tracking-wider truncate">
                    {activePred.topicCategory || 'Cultural Milestone'}
                  </span>
                  <span className="font-body-sm text-on-surface-variant shrink-0 tabular-nums">
                    {activePredIdx + 1} / {predictions.length}
                  </span>
                </div>

                {predictions.length > 1 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setActivePredIdx((i) => (i - 1 + predictions.length) % predictions.length)
                      }
                      className="w-8 h-8 rounded-lg border border-outline-variant/40 flex items-center justify-center text-on-surface hover:border-secondary"
                    >
                      <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePredIdx((i) => (i + 1) % predictions.length)}
                      className="w-8 h-8 rounded-lg border border-outline-variant/40 flex items-center justify-center text-on-surface hover:border-secondary"
                    >
                      <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-4">
                <img
                  src={getCoverImage('Music', activePred.coverArtUrl)}
                  alt={activePred.entityName}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-xl object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-headline-sm text-on-surface text-[18px] sm:text-[20px] leading-snug font-bold">
                    {activePred.question}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[12px] tabular-nums">
                    <span className="text-on-tertiary-container font-semibold">
                      Vol: {activePred.totalVolumeXAF.toLocaleString()} FCFA
                    </span>
                    <span className="text-outline-variant">·</span>
                    <span className="text-on-surface-variant">
                      Ends {formatTimeRemaining(activePred.endsAt, lang)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Crowd Consensus Split Bar */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tabular-nums">
                  <span className="text-on-tertiary-container">{yesPct}% YES CONSENSUS</span>
                  <span className="text-error">{noPct}% NO CONSENSUS</span>
                </div>
                <div className="w-full h-2 rounded-full bg-error overflow-hidden flex">
                  <div
                    className="h-full bg-on-tertiary-container transition-all duration-500"
                    style={{ width: `${yesPct}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      setAuthPromptAction('vote YES on cultural predictions');
                      return;
                    }
                    setCheckoutPred({ pred: activePred, side: 'YES' });
                  }}
                  className="py-3 px-4 rounded-xl bg-on-tertiary-container text-white flex flex-col gap-0.5 text-left hover:opacity-95 active:scale-[0.99] transition-all"
                >
                  <div className="w-full flex items-center justify-between font-headline-sm text-[15px] font-bold tabular-nums">
                    <span>YES ({yesPct}%)</span>
                    <span className="font-mono-num">{activePred.yesPriceXAF} XAF</span>
                  </div>
                  <span className="text-[11px] text-white/85 tabular-nums">
                    Return {(100 / Math.max(5, activePred.yesPriceXAF)).toFixed(2)}x · MoMo
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      setAuthPromptAction('vote NO on cultural predictions');
                      return;
                    }
                    setCheckoutPred({ pred: activePred, side: 'NO' });
                  }}
                  className="py-3 px-4 rounded-xl bg-error text-white flex flex-col gap-0.5 text-left hover:opacity-95 active:scale-[0.99] transition-all"
                >
                  <div className="w-full flex items-center justify-between font-headline-sm text-[15px] font-bold tabular-nums">
                    <span>NO ({noPct}%)</span>
                    <span className="font-mono-num">{activePred.noPriceXAF} XAF</span>
                  </div>
                  <span className="text-[11px] text-white/85 tabular-nums">
                    Return {(100 / Math.max(5, activePred.noPriceXAF)).toFixed(2)}x · Orange
                  </span>
                </button>
              </div>

              {predictions.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  {predictions.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActivePredIdx(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === activePredIdx ? 'w-6 bg-secondary' : 'w-2 bg-outline-variant/50'
                      }`}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="flex flex-col items-start justify-center gap-3 py-2">
            <p className="font-body-md text-on-surface-variant">
              {lang === 'fr'
                ? 'Aucune prédiction culturelle publiée pour le moment.'
                : 'No live cultural predictions yet.'}
            </p>
            {user && (
              <button
                type="button"
                disabled={mintingPreds}
                onClick={handleAutoMintPredictions}
                className="px-4 py-2.5 rounded-xl bg-secondary text-white font-label-md font-bold"
              >
                {mintingPreds ? 'Generating...' : 'Generate Cultural Predictions'}
              </button>
            )}
          </div>
        )}
      </section>

      {/* 3. SECTION THREE: TRENDING NEWS (Seamless Title & Category Filters) */}
      <section id="news" className="border-t border-outline-variant/25 pt-8 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-headline-lg-mobile text-on-surface font-bold">Trending News</h2>
          <button
            type="button"
            disabled={syncingPulse}
            onClick={handleRefreshPulse}
            className="px-3.5 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-xs uppercase font-bold hover:border-secondary hover:text-secondary transition-colors disabled:opacity-60"
          >
            {syncingPulse ? 'Refreshing...' : 'Refresh News'}
          </button>
        </div>

        {/* Clean Category Filters */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {SEGMENTS.map((seg) => (
            <button
              key={seg}
              type="button"
              onClick={() => setSelectedSegment(seg)}
              className={`px-3.5 py-1.5 rounded-full font-label-xs uppercase whitespace-nowrap transition-colors ${
                selectedSegment === seg
                  ? 'bg-secondary text-on-secondary font-bold'
                  : 'text-on-surface-variant border border-outline-variant/35 hover:text-on-surface'
              }`}
            >
              {seg}
            </button>
          ))}
        </div>

        {filteredCatalysts.length === 0 ? (
          <div className="py-8 text-center">
            <p className="font-label-md text-on-surface">{t('no_catalysts_title')}</p>
            <p className="font-body-sm text-on-surface-variant mt-1">{t('no_catalysts_desc')}</p>
          </div>
        ) : (
          <motion.div
            key={selectedSegment}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6"
          >
            {filteredCatalysts.map((c) => {
              const badgeCls =
                c.sentiment === 'bullish'
                  ? 'bg-on-tertiary-container/15 text-on-tertiary-container'
                  : c.sentiment === 'risk_alert'
                  ? 'bg-error/15 text-error'
                  : 'bg-surface-container text-on-surface-variant';

              return (
                <article
                  key={c.id}
                  className="pt-4 border-t border-outline-variant/25 flex flex-col justify-between gap-2.5"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-label-xs font-bold text-secondary uppercase truncate">
                        {c.entityName}
                      </span>
                      <span className="font-label-xs text-on-surface-variant shrink-0">
                        {c.segment}
                      </span>
                    </div>
                    <h3 className="font-label-md text-on-surface font-bold leading-snug">
                      {c.headline}
                    </h3>
                    <p className="font-body-sm text-on-surface-variant leading-relaxed line-clamp-3">
                      {c.summary}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <span className="text-[11px] text-on-surface-variant truncate">{c.sourceName}</span>
                    <span className={`px-2 py-0.5 rounded font-label-xs uppercase font-bold tabular-nums ${badgeCls}`}>
                      {c.priceImpactPct >= 0 ? `+${c.priceImpactPct}%` : `${c.priceImpactPct}%`}
                    </span>
                  </div>
                </article>
              );
            })}
          </motion.div>
        )}
      </section>

      {/* CamPay Modals */}
      {checkoutRace && (
        <CamPayCheckoutModal
          mode="race"
          race={checkoutRace}
          onClose={() => setCheckoutRace(null)}
          onSuccess={(msg) => showToast('Trade Settled', msg, 'success')}
          onOpenApiSetup={onOpenApiSetup}
        />
      )}

      {checkoutPred && (
        <CamPayCheckoutModal
          mode="prediction"
          prediction={checkoutPred.pred}
          predictionSide={checkoutPred.side}
          onClose={() => setCheckoutPred(null)}
          onSuccess={(msg) => showToast('Prediction Position Locked', msg, 'success')}
          onOpenApiSetup={onOpenApiSetup}
        />
      )}

      {authPromptAction && (
        <AuthPromptModal
          actionLabel={authPromptAction}
          onClose={() => setAuthPromptAction(null)}
        />
      )}

      {/* New Prediction Modal (Admin Only) */}
      {showNewPredModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !predBusy) setShowNewPredModal(false);
          }}
        >
          <form
            onSubmit={handleCreatePrediction}
            className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl p-6 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-headline-sm text-on-surface">
                {lang === 'fr' ? 'Publier un Contrat Prédictif' : 'Publish Cultural Prediction'}
              </h3>
              <button
                type="button"
                onClick={() => setShowNewPredModal(false)}
                className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">
                Creator / Entity Name
              </label>
              <input
                type="text"
                required
                value={predEntityName}
                onChange={(e) => setPredEntityName(e.target.value)}
                placeholder="e.g. Locko / Blanche Bailly"
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">
                Binary Question (YES/NO)
              </label>
              <textarea
                required
                rows={3}
                value={predQuestion}
                onChange={(e) => setPredQuestion(e.target.value)}
                placeholder="Will the upcoming music video cross 500,000 YouTube views within 14 days?"
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">
                Settlement Date
              </label>
              <input
                type="date"
                required
                value={predEndsAt}
                onChange={(e) => setPredEndsAt(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <button
              type="submit"
              disabled={predBusy}
              className="w-full py-3 rounded-xl bg-secondary text-on-secondary font-headline-sm text-[14px] font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {predBusy ? '...' : 'Publish Live Contract'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
