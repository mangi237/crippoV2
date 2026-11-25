import crypto from 'crypto';
import { Type } from '@google/genai';
import { getGeminiClient, CRIPPO_GEMINI_MODEL } from '../lib/gemini';
import { scrapeSpotifyArtists } from '../scrapers/apifyHub';

export type ListenerRegion = 'cameroon_africa' | 'diaspora_mixed' | 'global_eu_us';

export class UnderwriteValidationError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'UnderwriteValidationError';
  }
}

export interface UnderwriteInput {
  raceId: string;
  creatorName: string;
  title: string;
  category: string;
  monitorableSources: string[];
  netBudgetXAF: number;
  revSharePct: number;
  roiDurationMonths: number;
  productionDeadline: string;
  subscribers: number;
  monthlyViews: number;
  engagementRate: number;
  entityType: 'solo' | 'agency';
  masterRightsOwned: boolean;
  distributor: string;
  listenerRegion?: ListenerRegion;
  preferredSharePriceXAF?: number;
  wikiGrade?: string;
}

export interface ValuationBreakdown {
  listenerRegion: ListenerRegion;
  spotifyRateXAF: number;
  audiomackRateXAF: number;
  youtubeRpmXAF: number;
  fairSharePriceXAF: number;
  recommendedTotalShares: number;
  pctPerShare: number;
}

export interface UnderwriteResult {
  approved: boolean;
  status: 'open' | 'rejected';
  crippoScore: number;
  scoreBreakdown: {
    growth: number;
    engagement: number;
    monitorability: number;
    roiSpeed: number;
    consistency: number;
  };
  projectedRevenueXAF: number;
  grossTargetXAF: number;
  unitSharePriceXAF: number;
  totalShares: number;
  pctPerShare: number;
  regionalValuationNote: string;
  valuationBreakdown: ValuationBreakdown;
  clearingEmail: string;
  capTableHash: string;
  reasoning: string;
  counterTerms?: string;
}

const ALLOWED_MONITORABLE_SOURCES = new Set([
  'YouTube AdSense',
  'Spotify / Boomplay / Apple Music Streams',
  'TikTok Creator Rewards',
  'Crippo Brand Campaign Escrow',
]);

const REGIONAL_STREAM_RATES: Record<
  ListenerRegion,
  { label: string; spotifyRateXAF: number; audiomackRateXAF: number; youtubeRpmXAF: number }
> = {
  cameroon_africa: {
    label: 'Cameroon & West/Central Africa (Local Listener Base)',
    spotifyRateXAF: 1.0,
    audiomackRateXAF: 0.65,
    youtubeRpmXAF: 460,
  },
  diaspora_mixed: {
    label: 'Blended Cameroon + African Diaspora (France/UK/US)',
    spotifyRateXAF: 2.05,
    audiomackRateXAF: 1.35,
    youtubeRpmXAF: 1465,
  },
  global_eu_us: {
    label: 'Global EU / US / UK Dominant Audience',
    spotifyRateXAF: 2.75,
    audiomackRateXAF: 1.65,
    youtubeRpmXAF: 2745,
  },
};

export function pickCreatorFairSharePrice(
  listenerRegion: ListenerRegion,
  subscribers: number,
  monthlyViews: number,
  preferredSharePriceXAF?: number
): { unitSharePriceXAF: number; maxSafeSharePriceXAF: number } {
  const reachScore = Math.max(subscribers, Math.round(monthlyViews / 3));

  let recommended = 2_500;
  let maxSafe = 5_000;

  if (listenerRegion === 'cameroon_africa') {
    if (reachScore < 25_000) {
      recommended = 1_000;
      maxSafe = 5_000;
    } else if (reachScore < 150_000) {
      recommended = 2_500;
      maxSafe = 5_000;
    } else {
      recommended = 5_000;
      maxSafe = 10_000;
    }
  } else if (listenerRegion === 'diaspora_mixed') {
    if (reachScore < 25_000) {
      recommended = 2_500;
      maxSafe = 10_000;
    } else if (reachScore < 150_000) {
      recommended = 5_000;
      maxSafe = 10_000;
    } else {
      recommended = 10_000;
      maxSafe = 10_000;
    }
  } else {
    recommended = reachScore >= 50_000 ? 10_000 : 5_000;
    maxSafe = 15_000;
  }

  const chosen =
    typeof preferredSharePriceXAF === 'number' && Number.isFinite(preferredSharePriceXAF) && preferredSharePriceXAF >= 500
      ? Math.min(maxSafe, Math.max(500, Math.round(preferredSharePriceXAF)))
      : recommended;

  return { unitSharePriceXAF: chosen, maxSafeSharePriceXAF: maxSafe };
}

function buildDeterministicUnderwriteScores(
  input: UnderwriteInput,
  regionRates: { label: string; spotifyRateXAF: number; audiomackRateXAF: number; youtubeRpmXAF: number },
  effectiveSubscribers: number,
  effectiveMonthlyViews: number,
  deterministicRegionalCapXAF: number
) {
  const reachSignal = Math.log10(Math.max(1000, effectiveSubscribers + effectiveMonthlyViews));
  const growth = Math.max(48, Math.min(92, Math.round(reachSignal * 14)));
  const engagement = Math.max(45, Math.min(94, Math.round(48 + Math.min(10, input.engagementRate || 4) * 4.5)));
  const monitorability = Math.max(60, Math.min(95, 58 + input.monitorableSources.length * 9));
  const roiSpeed = input.roiDurationMonths <= 6 ? 86 : input.roiDurationMonths <= 12 ? 78 : input.roiDurationMonths <= 18 ? 70 : 64;
  const consistency = input.entityType === 'agency' ? 82 : 74;
  const projectedRevenueXAF = Math.max(350_000, Math.round(deterministicRegionalCapXAF * 1.15));

  return {
    growth,
    engagement,
    monitorability,
    roiSpeed,
    consistency,
    projectedRevenueXAF,
    regionalValuationNote: `${regionRates.label}: YT ${regionRates.youtubeRpmXAF} XAF/1k · Spotify ${regionRates.spotifyRateXAF} XAF/str · Audiomack ${regionRates.audiomackRateXAF} XAF/str.`,
    reasoning: `Evaluated ${input.creatorName || 'Creator'}'s ${effectiveSubscribers.toLocaleString()} reach and ${effectiveMonthlyViews.toLocaleString()} monthly streams across ${input.monitorableSources.join(', ')} under ${regionRates.label} benchmarks.`,
    counterTerms: '',
  };
}

export async function underwriteRace(input: UnderwriteInput): Promise<UnderwriteResult> {
  if (!input.masterRightsOwned) {
    throw new UnderwriteValidationError(
      'Master rights ownership confirmation or written no-objection release is legally required.'
    );
  }

  const validSources = input.monitorableSources.filter((s) => ALLOWED_MONITORABLE_SOURCES.has(s));
  if (validSources.length === 0) {
    throw new UnderwriteValidationError('Select at least one publicly monitorable digital revenue stream.');
  }

  const listenerRegion: ListenerRegion =
    input.listenerRegion && input.listenerRegion in REGIONAL_STREAM_RATES
      ? input.listenerRegion
      : 'cameroon_africa';
  const regionRates = REGIONAL_STREAM_RATES[listenerRegion];

  let effectiveSubscribers = Math.max(0, Number(input.subscribers) || 0);
  let effectiveMonthlyViews = Math.max(0, Number(input.monthlyViews) || 0);
  let liveTelemetrySource = 'Creator Dossier';

  if (process.env.APIFY_API_TOKEN && input.creatorName.trim()) {
    try {
      const spData = await scrapeSpotifyArtists({
        searchTerms: [input.creatorName.trim()],
        maxResults: 2,
      });
      const match = spData.creators[0];
      if (match) {
        effectiveSubscribers = Math.max(effectiveSubscribers, match.followers);
        effectiveMonthlyViews = Math.max(effectiveMonthlyViews, match.monthlyViewsOrStreams);
        liveTelemetrySource = `Spotify Apify (${match.followers.toLocaleString()} listeners)`;
      }
    } catch {
      // Keep baseline dossier metrics if Apify call times out
    }
  }

  // Deterministic regional floor/sanity check from live monthly views/streams + region rates
  const baselineMonthlyStreams = Math.max(10_000, effectiveMonthlyViews || effectiveSubscribers * 2);
  const blendedPerStreamXAF = (regionRates.spotifyRateXAF + regionRates.audiomackRateXAF) / 2;
  const deterministicRegionalCapXAF = Math.round(
    baselineMonthlyStreams *
      Math.max(6, Number(input.roiDurationMonths) || 12) *
      (blendedPerStreamXAF * 0.45 + (regionRates.youtubeRpmXAF / 1000) * 0.55) *
      1.35
  );

  let parsed = buildDeterministicUnderwriteScores(
    { ...input, monitorableSources: validSources },
    regionRates,
    effectiveSubscribers,
    effectiveMonthlyViews,
    deterministicRegionalCapXAF
  );

  try {
    const ai = getGeminiClient();
    const prompt = `You are Crippo's institutional AI Underwriter evaluating a Cameroonian/African digital creator project Raise.
Evaluate the project strictly based on REGIONAL streaming economics so fans are never exploited by inflated targets:
- Selected Listener Region: ${regionRates.label}
- Regional Benchmarks: YouTube RPM ~ ${regionRates.youtubeRpmXAF} XAF per 1,000 views; Spotify blended payout ~ ${regionRates.spotifyRateXAF} XAF/stream; Audiomack ~ ${regionRates.audiomackRateXAF} XAF/stream (1 USD ≈ 610 XAF).
- Telemetry Source: ${liveTelemetrySource}

Project Input:
- Creator: ${input.creatorName} (${input.entityType})
- Title: ${input.title}
- Category: ${input.category}
- Monitorable Sources: ${validSources.join(', ')}
- Net Budget Needed: ${input.netBudgetXAF} XAF
- Revenue Share Pledged to Investors: ${input.revSharePct}%
- ROI Payout Duration: ${input.roiDurationMonths} months
- Distributor: ${input.distributor}
- Creator Subscribers/Listeners: ${effectiveSubscribers}
- Monthly Views/Streams: ${effectiveMonthlyViews}
- Engagement Rate: ${input.engagementRate}%

Score each dimension from 0 to 100 conservatively:
1. growth (audience velocity)
2. engagement (comments/shares/likes depth)
3. monitorability (strength of digital tracking across selected sources)
4. roiSpeed (how quickly the ${input.roiDurationMonths}-month window clears capital)
5. consistency (release track record)

Estimate conservative projected gross digital + brand revenue in XAF over ${input.roiDurationMonths} months (projectedRevenueXAF), grounded strictly in the ${regionRates.label} streaming rates above.
Provide concise underwriting reasoning, a short regionalValuationNote summarizing the fair regional Spotify/Audiomack/YouTube valuation math, and counterTerms if the budget appears inflated relative to conservative fan returns.`;

    const response = await ai.models.generateContent({
      model: CRIPPO_GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            growth: { type: Type.NUMBER },
            engagement: { type: Type.NUMBER },
            monitorability: { type: Type.NUMBER },
            roiSpeed: { type: Type.NUMBER },
            consistency: { type: Type.NUMBER },
            projectedRevenueXAF: { type: Type.NUMBER },
            regionalValuationNote: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            counterTerms: { type: Type.STRING },
          },
          required: [
            'growth',
            'engagement',
            'monitorability',
            'roiSpeed',
            'consistency',
            'projectedRevenueXAF',
            'regionalValuationNote',
            'reasoning',
            'counterTerms',
          ],
        },
      },
    });

    const rawText = (response.text || '{}').trim().replace(/^```json\s*/i, '').replace(/```$/, '');
    const aiParsed = JSON.parse(rawText) as Partial<typeof parsed>;
    if (typeof aiParsed.growth === 'number') {
      parsed = {
        growth: Number(aiParsed.growth) || parsed.growth,
        engagement: Number(aiParsed.engagement) || parsed.engagement,
        monitorability: Number(aiParsed.monitorability) || parsed.monitorability,
        roiSpeed: Number(aiParsed.roiSpeed) || parsed.roiSpeed,
        consistency: Number(aiParsed.consistency) || parsed.consistency,
        projectedRevenueXAF: Number(aiParsed.projectedRevenueXAF) || parsed.projectedRevenueXAF,
        regionalValuationNote: String(aiParsed.regionalValuationNote || parsed.regionalValuationNote),
        reasoning: String(aiParsed.reasoning || parsed.reasoning),
        counterTerms: String(aiParsed.counterTerms || ''),
      };
    }
  } catch {
    // Graceful deterministic fallback keeps Raise underwriting 100% operational even if GEMINI_API_KEY is missing/rate-limited
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number(n) || 70)));
  const scoreBreakdown = {
    growth: clamp(parsed.growth),
    engagement: clamp(parsed.engagement),
    monitorability: clamp(parsed.monitorability),
    roiSpeed: clamp(parsed.roiSpeed),
    consistency: clamp(parsed.consistency),
  };

  const crippoScore = Math.round(
    0.25 * scoreBreakdown.growth +
      0.2 * scoreBreakdown.engagement +
      0.25 * scoreBreakdown.monitorability +
      0.15 * scoreBreakdown.roiSpeed +
      0.15 * scoreBreakdown.consistency
  );

  const aiProjected = Math.max(100_000, Math.round(parsed.projectedRevenueXAF || 0));
  const projectedRevenueXAF = Math.max(
    100_000,
    Math.min(aiProjected, Math.max(deterministicRegionalCapXAF * 1.8, 350_000))
  );

  const investorPoolXAF = projectedRevenueXAF * (input.revSharePct / 100);
  const maxSupportableBudget = Math.floor(investorPoolXAF / 1.25);

  const netBudget = Math.max(10_000, Math.round(input.netBudgetXAF));
  const grossTargetXAF = Math.ceil(netBudget * 1.05);
  const { unitSharePriceXAF } = pickCreatorFairSharePrice(
    listenerRegion,
    effectiveSubscribers,
    effectiveMonthlyViews,
    input.preferredSharePriceXAF
  );
  const totalShares = Math.max(10, Math.ceil(grossTargetXAF / unitSharePriceXAF));
  const pctPerShare = Number((input.revSharePct / Math.max(1, totalShares)).toFixed(4));

  const clearingEmail = `race-${input.raceId}@clearing.crippo.cm`;
  const capTableHash = crypto
    .createHash('sha256')
    .update(`${input.raceId}:${totalShares}:${input.revSharePct}:${netBudget}`)
    .digest('hex');

  const valuationBreakdown: ValuationBreakdown = {
    listenerRegion,
    spotifyRateXAF: regionRates.spotifyRateXAF,
    audiomackRateXAF: regionRates.audiomackRateXAF,
    youtubeRpmXAF: regionRates.youtubeRpmXAF,
    fairSharePriceXAF: unitSharePriceXAF,
    recommendedTotalShares: totalShares,
    pctPerShare,
  };

  const regionalValuationNote = (
    parsed.regionalValuationNote ||
    `${regionRates.label}: YT ${regionRates.youtubeRpmXAF} XAF/1k · Spotify ${regionRates.spotifyRateXAF} XAF/str · Audiomack ${regionRates.audiomackRateXAF} XAF/str.`
  ).slice(0, 600);

  const isInflated = netBudget > maxSupportableBudget;

  if (isInflated) {
    const recommendedRevShare = Math.min(
      85,
      Math.ceil(((netBudget * 1.25) / projectedRevenueXAF) * 100)
    );
    return {
      approved: false,
      status: 'rejected',
      crippoScore,
      scoreBreakdown,
      projectedRevenueXAF,
      grossTargetXAF,
      unitSharePriceXAF,
      totalShares,
      pctPerShare,
      regionalValuationNote,
      valuationBreakdown,
      clearingEmail,
      capTableHash,
      reasoning: parsed.reasoning,
      counterTerms:
        parsed.counterTerms ||
        `Inflation Blocker triggered: Under ${regionRates.label} streaming rates, conservative ${input.roiDurationMonths}-month projection is ${projectedRevenueXAF.toLocaleString()} XAF. Max fair budget at ${input.revSharePct}% rev-share for >=1.25x fan ROI is ${maxSupportableBudget.toLocaleString()} XAF (or raise rev-share to ${recommendedRevShare}%).`,
    };
  }

  return {
    approved: true,
    status: 'open',
    crippoScore,
    scoreBreakdown,
    projectedRevenueXAF,
    grossTargetXAF,
    unitSharePriceXAF,
    totalShares,
    pctPerShare,
    regionalValuationNote,
    valuationBreakdown,
    clearingEmail,
    capTableHash,
    reasoning: parsed.reasoning,
  };
}
