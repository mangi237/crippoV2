import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { motion } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import { useLanguage } from '../contexts/LanguageContext';
import type { Catalyst, CatalystSegment, Entity } from '../types/crippo';

const SEGMENTS: Array<'All' | CatalystSegment> = [
  'All',
  'Trending',
  'Entertainment',
  'Music',
  'Tech',
  'Local News',
];
const ARTICLE_SEGMENTS: CatalystSegment[] = ['Trending', 'Entertainment', 'Music', 'Tech', 'Local News'];

interface NewsSectionProps {
  onOpenApiSetup: () => void;
  onRequireAuth: (actionLabel: string) => void;
  filterEntityId?: string;
  filterEntityName?: string;
  title?: string;
}

export function NewsSection({
  onOpenApiSetup,
  onRequireAuth,
  filterEntityId,
  filterEntityName,
  title = 'Trending News',
}: NewsSectionProps) {
  const { user } = useAuth();
  const { races, entities, catalysts, predictions, searchQuery, showToast, isAdmin } = useMarket();
  const { lang, t } = useLanguage();

  const [selectedSegment, setSelectedSegment] = useState<'All' | CatalystSegment>('All');
  const [syncingPulse, setSyncingPulse] = useState(false);
  const [liveScrapedCatalysts, setLiveScrapedCatalysts] = useState<Catalyst[]>([]);

  // Admin Write Article Modal & Searchable Creator Dropdown
  const [showArticleModal, setShowArticleModal] = useState(false);
  const [creatorQuery, setCreatorQuery] = useState('');
  const [creatorDropdownOpen, setCreatorDropdownOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [artHeadline, setArtHeadline] = useState('');
  const [artSummary, setArtSummary] = useState('');
  const [artSegment, setArtSegment] = useState<CatalystSegment>('Trending');
  const [artSourceName, setArtSourceName] = useState('');
  const [artSourceUrl, setArtSourceUrl] = useState('');
  const [artBusy, setArtBusy] = useState(false);

  // Close searchable dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCreatorDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Fetch fresh feed content from the backend scraping pipeline on load (only when global news view)
  useEffect(() => {
    if (filterEntityId || filterEntityName) return;
    let active = true;
    fetch('/api/feed/pulse')
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: {
          catalysts?: Array<{
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
            publishedAt?: string;
          }>;
        } | null) => {
          if (!active || !data?.catalysts?.length) return;
          const mapped: Catalyst[] = data.catalysts.map((item, idx) => ({
            id: `live_${idx}_${item.headline.slice(0, 12).replace(/[^a-zA-Z0-9]/g, '')}`,
            entityName: item.entityName || 'Cameroon Scene',
            segment: item.segment || 'Trending',
            sourcePlatform: item.sourcePlatform || 'Web',
            sourceName: item.sourceName || 'Crippo Pulse',
            sourceUrl: item.sourceUrl,
            headline: item.headline,
            summary: item.summary,
            sentiment: item.sentiment || 'neutral',
            priceImpactPct: Number(item.priceImpactPct || 0),
            engagementCount: item.engagementCount,
            publishedAt: item.publishedAt,
            isPublic: true,
          }));
          setLiveScrapedCatalysts(mapped);
        }
      )
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [filterEntityId, filterEntityName]);

  const combinedCatalysts = useMemo(() => {
    const seen = new Set(catalysts.map((c) => c.headline.toLowerCase()));
    const extras = liveScrapedCatalysts.filter((c) => !seen.has(c.headline.toLowerCase()));
    return [...catalysts, ...extras];
  }, [catalysts, liveScrapedCatalysts]);

  const filteredCatalysts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return combinedCatalysts
      .filter((c) => {
        if (filterEntityId && c.entityId === filterEntityId) return true;
        if (filterEntityName) {
          return (
            c.entityName.toLowerCase().includes(filterEntityName.toLowerCase()) ||
            filterEntityName.toLowerCase().includes(c.entityName.toLowerCase())
          );
        }
        return !filterEntityId;
      })
      .filter((c) => (selectedSegment === 'All' ? true : c.segment === selectedSegment))
      .filter((c) => {
        if (!q || filterEntityId || filterEntityName) return true;
        return (
          c.entityName.toLowerCase().includes(q) ||
          c.headline.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q)
        );
      });
  }, [combinedCatalysts, selectedSegment, searchQuery, filterEntityId, filterEntityName]);

  const searchableCreators = useMemo(() => {
    const q = creatorQuery.trim().toLowerCase();
    return entities
      .filter((ent) => {
        if (!q) return true;
        return (
          ent.stageName.toLowerCase().includes(q) ||
          ent.category.toLowerCase().includes(q) ||
          ent.city.toLowerCase().includes(q) ||
          (ent.genres || []).some((g) => g.toLowerCase().includes(q))
        );
      })
      .slice(0, 25);
  }, [entities, creatorQuery]);

  const handleRefreshPulse = async () => {
    if (!user) {
      onRequireAuth('refresh live Trending News');
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
        const seg: CatalystSegment = ARTICLE_SEGMENTS.includes(item.segment) ? item.segment : 'Trending';
        const plat: 'TikTok' | 'Facebook' | 'YouTube' | 'Web' = ['TikTok', 'Facebook', 'YouTube', 'Web'].includes(
          item.sourcePlatform
        )
          ? item.sourcePlatform
          : 'Web';
        const impact = Math.max(-50, Math.min(50, Number(item.priceImpactPct) || 0));
        const cleanEntityName = (item.entityName || 'Cameroon Scene').slice(0, 100);
        const matchedEnt = entities.find(
          (e) => e.stageName.toLowerCase() === cleanEntityName.toLowerCase()
        );

        await setDoc(doc(db, 'catalysts', id), {
          id,
          ...(matchedEnt ? { entityId: matchedEnt.id } : {}),
          entityName: cleanEntityName,
          segment: seg,
          sourcePlatform: plat,
          sourceName: (item.sourceName || plat).slice(0, 100),
          ...(item.sourceUrl ? { sourceUrl: item.sourceUrl.slice(0, 500) } : {}),
          headline: (item.headline || 'Market Signal').slice(0, 200),
          summary: (item.summary || 'Live market update captured.').slice(0, 1200),
          sentiment: ['bullish', 'neutral', 'risk_alert'].includes(item.sentiment) ? item.sentiment : 'neutral',
          priceImpactPct: impact,
          ...(typeof item.engagementCount === 'number'
            ? { engagementCount: Math.max(0, item.engagementCount) }
            : {}),
          publishedAt: new Date().toISOString(),
          isPublic: true,
          createdAt: serverTimestamp(),
        });
        count++;

        if (impact !== 0) {
          const matchedOpenRaces = races.filter(
            (r) =>
              r.status === 'open' &&
              new Date(r.raceCloseDate).getTime() > nowMs &&
              !(r.appliedCatalystIds || []).includes(id) &&
              ((matchedEnt && r.entityId === matchedEnt.id) ||
                r.creatorName.toLowerCase().includes(cleanEntityName.toLowerCase()) ||
                cleanEntityName.toLowerCase().includes(r.creatorName.toLowerCase()))
          );
          for (const race of matchedOpenRaces) {
            const boundedImpact = Math.max(-25, Math.min(25, impact));
            const nextPrice = Math.max(100, Math.round(race.currentSharePriceXAF * (1 + boundedImpact / 100)));
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

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!selectedEntity) {
      showToast('Select Creator', 'Choose an onboarded creator from the searchable dropdown.', 'error');
      return;
    }
    if (artHeadline.trim().length < 5) {
      showToast('Validation', 'Enter a headline of at least 5 characters.', 'error');
      return;
    }

    setArtBusy(true);
    const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowMs = Date.now();
    const headlineClean = artHeadline.trim().slice(0, 200);
    const summaryClean = (artSummary.trim() || headlineClean).slice(0, 1200);
    const sourceClean = (artSourceName.trim() || 'Crippo Editorial').slice(0, 100);

    try {
      const entityOpenRaces = races.filter(
        (r) =>
          r.status === 'open' &&
          (r.entityId === selectedEntity.id ||
            r.creatorName.toLowerCase() === selectedEntity.stageName.toLowerCase())
      );

      const relatedPredictions = predictions
        .filter(
          (p) =>
            p.status === 'open' &&
            (p.entityName.toLowerCase().includes(selectedEntity.stageName.toLowerCase()) ||
              p.question.toLowerCase().includes(selectedEntity.stageName.toLowerCase()))
        )
        .map((p) => p.question);

      // Run AI Market Impact Agent automatically when publishing a tagged article
      const impactRes = await apiFetch<{
        sentiment: 'bullish' | 'neutral' | 'risk_alert';
        priceImpactPct: number;
        aiMarketAssessment: string;
        aiPredictionImpact: string;
        aiConfidence: number;
        aiGeneratedAt: string;
      }>('/api/agents/news-impact', {
        method: 'POST',
        body: JSON.stringify({
          entityName: selectedEntity.stageName,
          entityCategory: selectedEntity.category,
          entityCity: selectedEntity.city,
          entityBio: selectedEntity.bio || selectedEntity.description,
          entityGenres: selectedEntity.genres,
          subscribers: selectedEntity.subscribers,
          headline: headlineClean,
          summary: summaryClean,
          segment: artSegment,
          sourceName: sourceClean,
          activeRaises: entityOpenRaces.map((r) => ({
            title: r.title,
            currentSharePriceXAF: r.currentSharePriceXAF,
            fundedPct: Math.min(100, Math.round((r.sharesSold / Math.max(1, r.totalShares)) * 100)),
            revSharePct: r.revSharePct,
          })),
          activePredictions: relatedPredictions,
        }),
      });

      const boundedImpact = Math.max(-50, Math.min(50, Number(impactRes.priceImpactPct) || 0));

      await setDoc(doc(db, 'catalysts', id), {
        id,
        entityId: selectedEntity.id,
        entityName: selectedEntity.stageName.slice(0, 100),
        segment: artSegment,
        sourcePlatform: 'Web',
        sourceName: sourceClean,
        ...(artSourceUrl.trim() ? { sourceUrl: artSourceUrl.trim().slice(0, 500) } : {}),
        headline: headlineClean,
        summary: summaryClean,
        sentiment: impactRes.sentiment,
        priceImpactPct: boundedImpact,
        aiMarketAssessment: impactRes.aiMarketAssessment.slice(0, 1200),
        aiPredictionImpact: impactRes.aiPredictionImpact.slice(0, 800),
        aiConfidence: impactRes.aiConfidence,
        aiGeneratedAt: impactRes.aiGeneratedAt,
        publishedAt: new Date().toISOString(),
        isPublic: true,
        createdBy: 'admin_manual',
        createdAt: serverTimestamp(),
      });

      // Automatically update share prices on matching open raises for this creator
      let repricedCount = 0;
      if (boundedImpact !== 0) {
        for (const race of entityOpenRaces) {
          if (new Date(race.raceCloseDate).getTime() <= nowMs) continue;
          const clampedShift = Math.max(-25, Math.min(25, boundedImpact));
          const nextPrice = Math.max(100, Math.round(race.currentSharePriceXAF * (1 + clampedShift / 100)));
          if (nextPrice !== race.currentSharePriceXAF) {
            const nextHistory = [
              ...(race.priceHistory || []).slice(-39),
              {
                timestamp: new Date().toISOString(),
                priceXAF: nextPrice,
                reason: `AI News Impact: ${headlineClean.slice(0, 44)}`,
              },
            ];
            await updateDoc(doc(db, 'races', race.id), {
              currentSharePriceXAF: nextPrice,
              priceHistory: nextHistory,
              appliedCatalystIds: [...(race.appliedCatalystIds || []).slice(-49), id],
              updatedAt: serverTimestamp(),
            });
            repricedCount++;
          }
        }
      }

      setShowArticleModal(false);
      setSelectedEntity(null);
      setCreatorQuery('');
      setArtHeadline('');
      setArtSummary('');
      setArtSourceName('');
      setArtSourceUrl('');

      showToast(
        'Article Published & Assessed',
        repricedCount > 0
          ? `AI Market Impact applied (${boundedImpact >= 0 ? '+' : ''}${boundedImpact}%) across ${repricedCount} live raise(s).`
          : `AI Market Impact Assessment generated (${impactRes.sentiment.toUpperCase()} · ${boundedImpact >= 0 ? '+' : ''}${boundedImpact}%).`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `catalysts/${id}`);
    } finally {
      setArtBusy(false);
    }
  };

  return (
    <section id="news" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-headline-lg-mobile text-on-surface font-bold">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                if (filterEntityId) {
                  const found = entities.find((e) => e.id === filterEntityId) || null;
                  setSelectedEntity(found);
                  setCreatorQuery(found?.stageName || '');
                }
                setShowArticleModal(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-secondary text-on-secondary font-label-xs uppercase font-bold"
            >
              + Write Article
            </button>
          )}
          {!filterEntityId && !filterEntityName && (
            <button
              type="button"
              disabled={syncingPulse}
              onClick={handleRefreshPulse}
              className="px-3.5 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-xs uppercase font-bold hover:border-secondary hover:text-secondary transition-colors disabled:opacity-60"
            >
              {syncingPulse ? 'Refreshing...' : 'Refresh News'}
            </button>
          )}
        </div>
      </div>

      {!filterEntityId && !filterEntityName && (
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
      )}

      {filteredCatalysts.length === 0 ? (
        <div className="py-8 text-center">
          <p className="font-label-md text-on-surface dark:text-white">{t('no_catalysts_title')}</p>
          <p className="font-body-sm text-on-surface-variant dark:text-white mt-1">{t('no_catalysts_desc')}</p>
        </div>
      ) : (
        <motion.div
          key={selectedSegment}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-7"
        >
          {filteredCatalysts.map((c) => {
            const linkedEntity =
              (c.entityId && entities.find((e) => e.id === c.entityId)) ||
              entities.find((e) => e.stageName.toLowerCase() === c.entityName.toLowerCase());

            const impactColor =
              c.sentiment === 'bullish'
                ? 'bg-on-tertiary-container/20 text-on-tertiary-container dark:text-white dark:bg-[#069669]/40'
                : c.sentiment === 'risk_alert'
                ? 'bg-error/15 text-error dark:text-white dark:bg-error/45'
                : 'bg-surface-container text-on-surface dark:text-white dark:bg-zinc-800';

            return (
              <article
                key={c.id}
                className="pt-4 border-t border-outline-variant/25 flex flex-col justify-between gap-3 dark:text-white"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    {linkedEntity ? (
                      <Link
                        to={`/creator/${linkedEntity.id}`}
                        className="font-label-xs font-bold text-secondary dark:text-white uppercase truncate hover:underline"
                      >
                        {c.entityName}
                      </Link>
                    ) : (
                      <span className="font-label-xs font-bold text-secondary dark:text-white uppercase truncate">
                        {c.entityName}
                      </span>
                    )}
                    <span className="font-label-xs text-on-surface-variant dark:text-white shrink-0">
                      {c.segment}
                    </span>
                  </div>

                  <h3 className="font-label-md text-on-surface dark:text-white font-bold leading-snug text-[15px]">
                    {c.headline}
                  </h3>

                  <p className="font-body-sm text-on-surface dark:text-white leading-relaxed line-clamp-3">
                    {c.summary}
                  </p>

                  {c.aiMarketAssessment && (
                    <div className="pt-2 border-t border-outline-variant/20 space-y-1">
                      <span className="font-label-xs uppercase tracking-wider text-secondary dark:text-white font-bold block">
                        AI Live Market Impact
                      </span>
                      <p className="font-body-sm text-on-surface dark:text-white leading-relaxed">
                        {c.aiMarketAssessment}
                      </p>
                      {c.aiPredictionImpact && (
                        <p className="font-body-sm text-on-surface-variant dark:text-white leading-relaxed">
                          {c.aiPredictionImpact}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  <div className="min-w-0 flex items-center gap-2 text-[11px] text-on-surface-variant dark:text-white truncate">
                    {c.sourceUrl ? (
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate hover:underline dark:text-white"
                      >
                        {c.sourceName}
                      </a>
                    ) : (
                      <span className="truncate dark:text-white">{c.sourceName}</span>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded font-label-xs uppercase font-bold tabular-nums shrink-0 ${impactColor}`}>
                    {c.priceImpactPct >= 0 ? `+${c.priceImpactPct}%` : `${c.priceImpactPct}%`}
                  </span>
                </div>
              </article>
            );
          })}
        </motion.div>
      )}

      {/* Admin: Write Article Modal with Searchable Creator Dropdown & Auto AI Market Impact Agent */}
      {showArticleModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !artBusy) setShowArticleModal(false);
          }}
        >
          <form
            onSubmit={handleCreateArticle}
            className="w-full max-w-lg bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-headline-sm text-on-surface font-bold">Write Article</h3>
                <span className="font-body-sm text-on-surface-variant">
                  Tag an onboarded creator — Crippo&apos;s AI Market Agent evaluates impact upon publish.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowArticleModal(false)}
                className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Searchable Creator Dropdown linked to Firestore Entities */}
            <div className="flex flex-col gap-1 relative" ref={dropdownRef}>
              <label className="font-label-xs uppercase text-on-surface-variant">
                Tag Onboarded Creator ({entities.length} indexed)
              </label>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 focus-within:border-secondary">
                <span className="material-symbols-outlined text-[17px] text-outline">search</span>
                <input
                  type="text"
                  value={creatorQuery}
                  onFocus={() => setCreatorDropdownOpen(true)}
                  onChange={(e) => {
                    setCreatorQuery(e.target.value);
                    setCreatorDropdownOpen(true);
                    if (selectedEntity && e.target.value !== selectedEntity.stageName) {
                      setSelectedEntity(null);
                    }
                  }}
                  placeholder="Search onboarded creators by name, genre, or city..."
                  className="w-full bg-transparent text-on-surface text-sm outline-none"
                />
                {selectedEntity && (
                  <span className="px-2 py-0.5 rounded bg-on-tertiary-container/15 text-on-tertiary-container font-label-xs font-bold shrink-0">
                    Tagged
                  </span>
                )}
              </div>

              {creatorDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-56 overflow-y-auto rounded-xl bg-surface-container-lowest border border-outline-variant shadow-xl divide-y divide-outline-variant/20">
                  {searchableCreators.length === 0 ? (
                    <div className="p-3 text-xs text-on-surface-variant">
                      No onboarded creators match &quot;{creatorQuery}&quot;. Add creators via Admin Desk first.
                    </div>
                  ) : (
                    searchableCreators.map((ent) => (
                      <button
                        key={ent.id}
                        type="button"
                        onClick={() => {
                          setSelectedEntity(ent);
                          setCreatorQuery(ent.stageName);
                          setCreatorDropdownOpen(false);
                        }}
                        className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-3 hover:bg-surface-container-low transition-colors ${
                          selectedEntity?.id === ent.id ? 'bg-secondary/10' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="font-label-md font-bold text-on-surface block truncate">
                            {ent.stageName}
                          </span>
                          <span className="text-[11px] text-on-surface-variant block truncate">
                            {ent.genres?.length ? ent.genres.join(', ') : ent.category} · {ent.city}
                          </span>
                        </div>
                        <span className="font-mono-num text-[11px] text-on-surface-variant shrink-0 tabular-nums">
                          {(ent.subscribers || 0).toLocaleString()} followers
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Headline</label>
              <input
                type="text"
                required
                value={artHeadline}
                onChange={(e) => setArtHeadline(e.target.value)}
                placeholder="e.g. Locko announces Douala stadium tour ahead of EP drop"
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Article Body / Summary</label>
              <textarea
                rows={4}
                required
                value={artSummary}
                onChange={(e) => setArtSummary(e.target.value)}
                placeholder="Write key details, numbers, dates, or partnerships so the AI Market Impact Agent can assess price and prediction shifts accurately..."
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-label-xs uppercase text-on-surface-variant">Segment</label>
                <select
                  value={artSegment}
                  onChange={(e) => setArtSegment(e.target.value as CatalystSegment)}
                  className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
                >
                  {ARTICLE_SEGMENTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-label-xs uppercase text-on-surface-variant">Source Name</label>
                <input
                  type="text"
                  value={artSourceName}
                  onChange={(e) => setArtSourceName(e.target.value)}
                  placeholder="Crippo Editorial"
                  className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Source Link (optional)</label>
              <input
                type="url"
                value={artSourceUrl}
                onChange={(e) => setArtSourceUrl(e.target.value)}
                placeholder="https://"
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <div className="py-2.5 px-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-[12px] text-on-surface-variant">
              Publishing triggers Crippo&apos;s <strong className="text-on-surface">AI Market Impact Agent</strong> to classify sentiment, generate a live valuation &amp; prediction assessment, and reprice matching active raises.
            </div>

            <button
              type="submit"
              disabled={artBusy}
              className="w-full py-3 rounded-xl bg-secondary text-on-secondary font-headline-sm text-[14px] font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {artBusy ? 'Analyzing Market Impact & Publishing...' : 'Publish & Run AI Market Assessment'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
