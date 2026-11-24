import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import { useLanguage } from '../contexts/LanguageContext';
import { RaceCard } from '../components/RaceCard';
import { CamPayCheckoutModal } from '../components/CamPayCheckoutModal';
import { AuthPromptModal } from '../components/AuthPromptModal';
import { VerifiedCreatorOnly } from '../components/VerifiedCreatorOnly';
import type { Race } from '../types/crippo';

const CATEGORIES = ['All', 'Music Albums', 'TikTok Mini-Series', 'YouTube Shows', 'Movies'];

interface RacesCatalogProps {
  onOpenApiSetup: () => void;
}

export function RacesCatalog({ onOpenApiSetup }: RacesCatalogProps) {
  const { user } = useAuth();
  const { races, searchQuery, showToast } = useMarket();
  const { lang } = useLanguage();

  const [stageTab, setStageTab] = useState<'active' | 'auditing' | 'clearing'>('active');
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState<'score' | 'roi' | 'closing'>('score');
  const [checkoutRace, setCheckoutRace] = useState<Race | null>(null);
  const [authPromptAction, setAuthPromptAction] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = races
      .filter((r) => {
        if (stageTab === 'active') return r.status === 'open';
        if (stageTab === 'auditing')
          return r.status === 'auditing' || r.status === 'awaiting_creator_acceptance';
        return r.status === 'closed' || r.status === 'clearing';
      })
      .filter((r) => {
        if (category === 'All') return true;
        if (category === 'Music Albums')
          return (
            r.category.toLowerCase().includes('music') ||
            r.category.toLowerCase().includes('album') ||
            r.category.toLowerCase().includes('single') ||
            r.category.toLowerCase().includes('ep')
          );
        if (category === 'TikTok Mini-Series') return r.category.toLowerCase().includes('tiktok');
        if (category === 'YouTube Shows') return r.category.toLowerCase().includes('youtube');
        return r.category.toLowerCase().includes('movie') || r.category.toLowerCase().includes('film');
      })
      .filter((r) => {
        if (!q) return true;
        return (
          r.title.toLowerCase().includes(q) ||
          r.creatorName.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)
        );
      });

    return [...list].sort((a, b) => {
      if (sortBy === 'score') return b.crippoScore - a.crippoScore;
      if (sortBy === 'roi') return b.revSharePct - a.revSharePct;
      return new Date(a.raceCloseDate).getTime() - new Date(b.raceCloseDate).getTime();
    });
  }, [races, stageTab, category, sortBy, searchQuery]);

  return (
    <div className="flex flex-col gap-6">
      {/* Stage Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/25 pb-4">
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar self-start max-w-full">
          <button
            type="button"
            onClick={() => setStageTab('active')}
            className={`pb-2 font-label-md text-[13px] whitespace-nowrap transition-colors border-b-2 tabular-nums ${
              stageTab === 'active'
                ? 'border-secondary text-secondary font-bold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Active Raises ({races.filter((r) => r.status === 'open').length})
          </button>
          <button
            type="button"
            onClick={() => setStageTab('auditing')}
            className={`pb-2 font-label-md text-[13px] whitespace-nowrap transition-colors border-b-2 tabular-nums ${
              stageTab === 'auditing'
                ? 'border-secondary text-secondary font-bold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Pending Review ({races.filter((r) => r.status === 'auditing' || r.status === 'awaiting_creator_acceptance').length})
          </button>
          <button
            type="button"
            onClick={() => setStageTab('clearing')}
            className={`pb-2 font-label-md text-[13px] whitespace-nowrap transition-colors border-b-2 tabular-nums ${
              stageTab === 'clearing'
                ? 'border-secondary text-secondary font-bold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Funded &amp; Payout ({races.filter((r) => r.status === 'closed' || r.status === 'clearing').length})
          </button>
        </div>

        <VerifiedCreatorOnly requireCanLaunch>
          <Link
            to="/launch-race"
            className="px-4 py-2 rounded-xl bg-secondary text-white font-label-md font-bold self-start md:self-auto"
          >
            + Launch a Raise
          </Link>
        </VerifiedCreatorOnly>
      </div>

      {/* Category Pill Rail */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`px-4 py-1.5 rounded-full font-label-xs uppercase tracking-wider whitespace-nowrap transition-colors ${
              category === c
                ? 'bg-primary text-on-primary font-bold'
                : 'text-on-surface-variant hover:text-secondary border border-outline-variant/35'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Catalog Header + Sort */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="font-headline-lg-mobile text-on-surface font-bold">Live Raises</h1>
          <span className="px-2.5 py-0.5 rounded bg-secondary-fixed text-secondary font-label-xs uppercase font-bold tabular-nums">
            {filtered.length} LIVE
          </span>
        </div>

        <div className="border-b border-outline-variant/40 pb-1">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'score' | 'roi' | 'closing')}
            className="bg-transparent font-label-md text-on-surface outline-none"
          >
            <option value="score">Top Crippo Score</option>
            <option value="roi">Highest Rev Share</option>
            <option value="closing">Closing Soonest</option>
          </select>
        </div>
      </div>

      {/* Grid Stream */}
      {filtered.length === 0 ? (
        <div className="py-12 border-t border-outline-variant/25 text-center flex flex-col items-center gap-3">
          <h3 className="font-headline-sm text-on-surface font-bold">
            {lang === 'fr' ? 'Aucun projet dans cette étape' : 'No Raises in this Stage Yet'}
          </h3>
          <p className="font-body-md text-on-surface-variant max-w-md">
            {lang === 'fr'
              ? 'Les projets soumis par les créateurs vérifiés apparaissent ici après validation.'
              : 'Verified creator projects appear here after clearing valuation audit and creator terms confirmation.'}
          </p>
          <VerifiedCreatorOnly
            requireCanLaunch
            fallback={
              <Link
                to="/creators"
                className="mt-1 px-5 py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
              >
                Explore Creators
              </Link>
            }
          >
            <Link
              to="/launch-race"
              className="mt-1 px-5 py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
            >
              + Launch a Project Raise
            </Link>
          </VerifiedCreatorOnly>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-7 gap-y-8">
          {filtered.map((race) => (
            <RaceCard
              key={race.id}
              race={race}
              onInvest={(r) => {
                if (!user) {
                  setAuthPromptAction(`buy shares in "${r.title}"`);
                  return;
                }
                setCheckoutRace(r);
              }}
            />
          ))}
        </div>
      )}

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
        <AuthPromptModal
          actionLabel={authPromptAction}
          onClose={() => setAuthPromptAction(null)}
        />
      )}
    </div>
  );
}
