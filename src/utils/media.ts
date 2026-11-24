import heroImg from '../assets/images/crippo_market_hero_1795503879636.jpg';
import defaultCoverImg from '../assets/images/crippo_default_cover_1795503879700.jpg';
import afropopCoverImg from '../assets/images/crippo_afropop_cover_1795505089320.jpg';
import cinemaCoverImg from '../assets/images/crippo_cinema_cover_1795505090492.jpg';
import type { Race } from '../types/crippo';

export const MARKET_HERO_IMG = heroImg;
export const DEFAULT_COVER_IMG = defaultCoverImg;
export const AFROPOP_COVER_IMG = afropopCoverImg;
export const CINEMA_COVER_IMG = cinemaCoverImg;

export function getCoverImage(category?: string, customUrl?: string): string {
  if (
    customUrl &&
    customUrl.trim().length > 8 &&
    !customUrl.includes('lh3.googleusercontent.com/aida-public')
  ) {
    return customUrl;
  }
  const cat = (category || '').toLowerCase();
  if (cat.includes('music') || cat.includes('album') || cat.includes('single') || cat.includes('ep')) {
    return afropopCoverImg;
  }
  if (cat.includes('movie') || cat.includes('film') || cat.includes('cinema') || cat.includes('doc')) {
    return cinemaCoverImg;
  }
  return defaultCoverImg;
}

export function formatTimeRemaining(isoDate?: string, lang: 'en' | 'fr' = 'en'): string {
  if (!isoDate) return lang === 'fr' ? 'Ouvert' : 'Open';
  const target = new Date(isoDate).getTime();
  if (Number.isNaN(target)) return isoDate;
  const diff = target - Date.now();
  if (diff <= 0) return lang === 'fr' ? 'Clôturé' : 'Ended';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export interface TimelinePhaseSummary {
  phaseIndex: 1 | 2 | 3;
  phaseLabel: string;
  phaseLabelFr: string;
  progressPct: number;
  countdownLabel: string;
  nextMilestoneTitle: string;
  trancheStatus: string;
}

export function getRaceTimelineStage(race: Race, lang: 'en' | 'fr' = 'en'): TimelinePhaseSummary {
  const now = Date.now();
  const closeMs = new Date(race.raceCloseDate).getTime();
  const prodMs = new Date(race.productionDeadline).getTime();
  const roiEndMs =
    (!Number.isNaN(prodMs) ? prodMs : now) +
    race.roiDurationMonths * 30 * 24 * 60 * 60 * 1000;

  if (race.status === 'clearing' || race.splitVerified) {
    const pct = Number.isNaN(prodMs)
      ? 65
      : Math.min(100, Math.max(10, Math.round(((now - prodMs) / Math.max(1, roiEndMs - prodMs)) * 100)));
    return {
      phaseIndex: 3,
      phaseLabel: 'Phase 3: Royalty Clearing & MoMo Payouts',
      phaseLabelFr: 'Phase 3 : Compensation & Paiements MoMo',
      progressPct: pct,
      countdownLabel: formatTimeRemaining(new Date(roiEndMs).toISOString(), lang),
      nextMilestoneTitle: race.isrcCode
        ? `ISRC ${race.isrcCode} Streaming Waterfall`
        : 'Monthly CamPay Dividend Split',
      trancheStatus: '100% Released · Live ROI',
    };
  }

  if (race.status === 'closed' || race.tranche1Released) {
    const startMs = Number.isNaN(closeMs) ? now - 86400000 : closeMs;
    const pct = Number.isNaN(prodMs)
      ? 50
      : Math.min(95, Math.max(15, Math.round(((now - startMs) / Math.max(1, prodMs - startMs)) * 100)));
    return {
      phaseIndex: 2,
      phaseLabel: 'Phase 2: Production & 50/50 Escrow Delivery',
      phaseLabelFr: 'Phase 2 : Production & Séquestre 50/50',
      progressPct: pct,
      countdownLabel: formatTimeRemaining(race.productionDeadline, lang),
      nextMilestoneTitle: race.tranche2Released
        ? 'Master Cut & ISRC Verification'
        : 'Tranche 2 (50%) Upon Master Proof',
      trancheStatus: race.tranche2Released ? 'Tranche 1 & 2 Released' : 'Tranche 1 (50%) Active',
    };
  }

  const fundedPct = Math.min(100, Math.round((race.sharesSold / Math.max(1, race.totalShares)) * 100));
  return {
    phaseIndex: 1,
    phaseLabel: 'Phase 1: Pre-Production Capital Race',
    phaseLabelFr: 'Phase 1 : Levée de Capital Pré-Production',
    progressPct: fundedPct,
    countdownLabel: formatTimeRemaining(race.raceCloseDate, lang),
    nextMilestoneTitle: 'Race Close & 50% Escrow Release',
    trancheStatus: `${fundedPct}% Subscribed`,
  };
}
