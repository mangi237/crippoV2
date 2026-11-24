import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { formatTimeRemaining, getCoverImage } from '../utils/media';
import type { Race } from '../types/crippo';

interface RaceCardProps {
  race: Race;
  onInvest: (race: Race) => void;
}

export function RaceCard({ race, onInvest }: RaceCardProps) {
  const { lang } = useLanguage();

  const fundedPct = Math.min(
    100,
    Math.round((race.sharesSold / Math.max(1, race.totalShares)) * 100)
  );
  const raisedXAF = race.sharesSold * race.currentSharePriceXAF;
  const sharesLeft = Math.max(0, race.totalShares - race.sharesSold);
  const isWindowOpen =
    race.status === 'open' && Date.now() < new Date(race.raceCloseDate).getTime() && sharesLeft > 0;

  const priceDeltaPct =
    race.unitSharePriceXAF > 0
      ? Number(
          (
            ((race.currentSharePriceXAF - race.unitSharePriceXAF) /
              race.unitSharePriceXAF) *
            100
          ).toFixed(1)
        )
      : 0;
  const isUp = priceDeltaPct >= 0;

  const initials =
    race.creatorName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || 'CR';

  const coverUrl = getCoverImage(race.category, race.coverArtUrl);

  return (
    <article className="pb-5 border-b border-outline-variant/25 flex flex-col gap-3.5">
      {/* Clean Cover Media */}
      <div className="relative h-44 rounded-xl overflow-hidden bg-primary-container">
        <img
          src={coverUrl}
          alt={race.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[#0d051a]/50" />

        {/* Clean Verification & Score Labels */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
          <span className="px-2.5 py-1 rounded-md bg-white/95 text-[#131b2e] font-label-xs uppercase tracking-wider">
            VERIFIED ISSUER
          </span>
          <span className="px-2.5 py-1 rounded-md bg-[#09291e]/90 text-[#68dba9] font-label-xs uppercase tracking-wider tabular-nums">
            {race.crippoScore}/100 · {race.crippoScore >= 80 ? 'Low Risk' : 'Moderate'}
          </span>
        </div>

        {/* Bottom Overlay: Initials + Title + Countdown Chip */}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
          <Link to={`/race/${race.id}`} className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-secondary text-white font-headline-sm text-[13px] font-bold flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h3 className="font-headline-sm text-[15px] leading-tight text-white font-bold truncate">
                {race.title}
              </h3>
              <p className="text-[11px] text-white/80 truncate">
                {race.creatorName} · {race.category}
              </p>
            </div>
          </Link>
          <span className="px-2 py-1 rounded-md bg-error text-white font-label-xs shrink-0 tabular-nums">
            {formatTimeRemaining(race.raceCloseDate, lang)}
          </span>
        </div>
      </div>

      {/* Seamless Card Body */}
      <div className="flex flex-col gap-3 flex-1">
        {/* Capital Progress Header */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2 tabular-nums">
            <span className="font-ticker-val text-on-surface font-bold">
              {raisedXAF.toLocaleString()}{' '}
              <span className="font-body-sm font-normal text-on-surface-variant">
                FCFA {lang === 'fr' ? 'Levés' : 'Raised'}
              </span>
            </span>
            <span className="font-label-xs text-secondary font-bold">
              {fundedPct}% of {(race.grossTargetXAF / 1_000_000).toFixed(1)}M FCFA
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
            <div
              className="h-full rounded-full bg-secondary transition-all duration-300"
              style={{ width: `${fundedPct}%` }}
            />
          </div>
        </div>

        {/* 2-Column Unboxed Metrics */}
        <div className="grid grid-cols-2 gap-4 py-1 border-t border-b border-outline-variant/20">
          <div className="py-1 flex flex-col justify-between">
            <span className="font-label-xs uppercase text-on-surface-variant">
              {lang === 'fr' ? 'PRIX UNITAIRE' : 'UNIT SHARE PRICE'}
            </span>
            <span className="font-ticker-val text-[15px] text-on-surface font-bold mt-0.5 tabular-nums">
              {race.currentSharePriceXAF.toLocaleString()} FCFA
            </span>
            <span className={`font-label-xs mt-0.5 tabular-nums ${isUp ? 'text-on-tertiary-container' : 'text-error'}`}>
              {isUp ? '+' : ''}
              {priceDeltaPct}% · Min 1 Unit
            </span>
          </div>
          <div className="py-1 flex flex-col justify-between">
            <span className="font-label-xs uppercase text-on-surface-variant">
              {lang === 'fr' ? 'PART REVENUS' : 'REVENUE SHARE'}
            </span>
            <span className="font-ticker-val text-[15px] text-secondary font-bold mt-0.5 tabular-nums">
              {race.revSharePct}% Gross
            </span>
            <span className="font-body-sm text-[11px] text-on-surface-variant truncate mt-0.5">
              {race.pctPerShare ? `${race.pctPerShare}% / share` : race.monitorableSources.slice(0, 2).join(' + ')}
            </span>
          </div>
        </div>

        {/* Clean Metadata Footnote */}
        <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
          <span className="truncate">
            {race.legalDetails?.distributor || 'DistroKid'} · {race.roiDurationMonths} Mo
          </span>
          <Link to={`/race/${race.id}`} className="font-label-xs text-secondary uppercase hover:underline shrink-0">
            Details →
          </Link>
        </div>

        {/* Action Row */}
        <div className="mt-auto pt-1 flex items-center gap-2.5">
          <button
            type="button"
            disabled={!isWindowOpen}
            onClick={() => onInvest(race)}
            className="flex-1 py-3 px-4 rounded-xl bg-on-tertiary-container text-white font-label-md text-[12px] font-bold uppercase tracking-wider flex items-center justify-center hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <span className="truncate">
              {!isWindowOpen
                ? race.status !== 'open'
                  ? race.status.replace(/_/g, ' ').toUpperCase()
                  : sharesLeft <= 0
                  ? 'SOLD OUT'
                  : 'WINDOW CLOSED'
                : lang === 'fr'
                ? 'INVESTIR VIA MOMO'
                : 'INVEST VIA MOMO'}
            </span>
          </button>
          <Link
            to={`/race/${race.id}`}
            className="px-3.5 h-11 rounded-xl border border-outline-variant/50 text-on-surface hover:border-secondary hover:text-secondary transition-colors flex items-center justify-center shrink-0 font-label-xs uppercase"
          >
            Book
          </Link>
        </div>
      </div>
    </article>
  );
}
