import { Type } from '@google/genai';
import { getGeminiClient, CRIPPO_GEMINI_MODEL } from '../lib/gemini';

export interface NewsImpactInput {
  entityName: string;
  entityCategory?: string;
  entityCity?: string;
  entityBio?: string;
  entityGenres?: string[];
  subscribers?: number;
  headline: string;
  summary: string;
  segment: string;
  sourceName?: string;
  activeRaises?: Array<{
    title: string;
    currentSharePriceXAF: number;
    fundedPct: number;
    revSharePct: number;
  }>;
  activePredictions?: string[];
}

export interface NewsImpactResult {
  sentiment: 'bullish' | 'neutral' | 'risk_alert';
  priceImpactPct: number;
  aiMarketAssessment: string;
  aiPredictionImpact: string;
  aiConfidence: number;
  aiGeneratedAt: string;
  source: 'gemini' | 'heuristic';
}

function buildDeterministicAssessment(input: NewsImpactInput): NewsImpactResult {
  const text = `${input.headline} ${input.summary}`.toLowerCase();
  const bullishTerms = [
    'album', 'release', 'award', 'tour', 'hit', 'viral', 'million', 'deal',
    'collab', 'featured', 'sold out', 'chart', 'win', 'winner', 'concert', 'milestone',
  ];
  const riskTerms = [
    'cancel', 'lawsuit', 'controversy', 'ban', 'arrest', 'delay', 'feud',
    'scandal', 'injury', 'boycott', 'dropped', 'postpone',
  ];

  let score = 0;
  for (const w of bullishTerms) if (text.includes(w)) score += 1;
  for (const w of riskTerms) if (text.includes(w)) score -= 1.5;

  const sentiment: 'bullish' | 'neutral' | 'risk_alert' =
    score > 0.5 ? 'bullish' : score < -0.5 ? 'risk_alert' : 'neutral';
  const priceImpactPct =
    sentiment === 'bullish'
      ? Math.min(18, Math.max(3, Math.round(score * 4)))
      : sentiment === 'risk_alert'
      ? Math.max(-18, Math.min(-3, Math.round(score * 4)))
      : 0;

  const raiseText =
    input.activeRaises && input.activeRaises.length > 0
      ? `Active raise "${input.activeRaises[0].title}" (${input.activeRaises[0].currentSharePriceXAF.toLocaleString()} XAF/share) is projected to absorb ${priceImpactPct >= 0 ? '+' : ''}${priceImpactPct}% momentum.`
      : `${input.entityName}'s catalog valuation and upcoming raise pricing reflect a ${priceImpactPct >= 0 ? '+' : ''}${priceImpactPct}% sentiment shift.`;

  return {
    sentiment,
    priceImpactPct,
    aiMarketAssessment: `${
      sentiment === 'bullish'
        ? 'Positive cultural catalyst'
        : sentiment === 'risk_alert'
        ? 'Reputational or execution risk signal'
        : 'Steady informational signal'
    } for ${input.entityName}. ${raiseText}`,
    aiPredictionImpact:
      input.activePredictions && input.activePredictions.length > 0
        ? `Watch for fan voting momentum shifts on "${input.activePredictions[0]}" following this ${input.segment.toLowerCase()} update.`
        : `Fan sentiment polls tied to ${input.entityName}'s milestones may see ${sentiment === 'bullish' ? 'higher YES/leader conviction' : sentiment === 'risk_alert' ? 'cautious reassessment' : 'stable voting odds'}.`,
    aiConfidence: 0.72,
    aiGeneratedAt: new Date().toISOString(),
    source: 'heuristic',
  };
}

export async function analyzeNewsMarketImpact(input: NewsImpactInput): Promise<NewsImpactResult> {
  try {
    const ai = getGeminiClient();
    const raiseContext =
      input.activeRaises && input.activeRaises.length > 0
        ? input.activeRaises
            .map(
              (r) =>
                `- "${r.title}" | Share Price: ${r.currentSharePriceXAF} XAF | Funded: ${r.fundedPct}% | Rev Share: ${r.revSharePct}%`
            )
            .join('\n')
        : 'No currently open raises (baseline creator catalog index).';

    const predContext =
      input.activePredictions && input.activePredictions.length > 0
        ? input.activePredictions.map((p) => `- ${p}`).join('\n')
        : 'No specific open poll linked yet.';

    const prompt = `You are Crippo's live Market Impact & Cultural Intelligence Agent for an African/Cameroonian creator equity & fan-prediction exchange.
Because automated third-party social/streaming APIs are currently offline, news articles published by the editorial team are the primary real-time market oracle.

Analyze the following news post and tagged creator dossier, and output a realistic market impact assessment.

TAGGED CREATOR DOSSIER:
- Stage Name: ${input.entityName}
- Category / Genres: ${input.entityCategory || 'Music'}${input.entityGenres?.length ? ` (${input.entityGenres.join(', ')})` : ''}
- Location: ${input.entityCity || 'Cameroon'}
- Subscribers / Followers: ${(input.subscribers || 0).toLocaleString()}
- Bio Context: ${(input.entityBio || 'Indexed Cameroonian/African digital creator.').slice(0, 500)}

ACTIVE PROJECT RAISES FOR THIS CREATOR:
${raiseContext}

OPEN FAN PREDICTIONS / POLLS:
${predContext}

NEWS ARTICLE:
- Segment: ${input.segment}
- Source: ${input.sourceName || 'Crippo Editorial'}
- Headline: ${input.headline}
- Summary: ${input.summary}

INSTRUCTIONS:
1. Classify sentiment strictly as "bullish", "neutral", or "risk_alert".
2. Estimate priceImpactPct as an integer between -25 and +25 reflecting realistic short-term share price revaluation for this creator's raises (0 if purely routine/neutral).
3. Write "aiMarketAssessment" (2 concise, sharp analytical sentences explaining how this news affects the creator's market value, fan demand, and active raise pricing).
4. Write "aiPredictionImpact" (1-2 concise sentences explaining how this affects fan voting/cultural predictions for the creator).
5. Provide "aiConfidence" between 0.35 and 0.96.`;

    const response = await ai.models.generateContent({
      model: CRIPPO_GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sentiment: { type: Type.STRING, enum: ['bullish', 'neutral', 'risk_alert'] },
            priceImpactPct: { type: Type.NUMBER },
            aiMarketAssessment: { type: Type.STRING },
            aiPredictionImpact: { type: Type.STRING },
            aiConfidence: { type: Type.NUMBER },
          },
          required: ['sentiment', 'priceImpactPct', 'aiMarketAssessment', 'aiPredictionImpact', 'aiConfidence'],
        },
      },
    });

    const parsed = JSON.parse((response.text || '{}').trim()) as Partial<NewsImpactResult>;
    const sentiment: 'bullish' | 'neutral' | 'risk_alert' =
      parsed.sentiment === 'bullish' || parsed.sentiment === 'risk_alert' ? parsed.sentiment : 'neutral';
    const priceImpactPct = Math.max(-25, Math.min(25, Math.round(Number(parsed.priceImpactPct) || 0)));
    const aiConfidence = Math.max(0.1, Math.min(0.99, Number(parsed.aiConfidence) || 0.78));

    return {
      sentiment,
      priceImpactPct,
      aiMarketAssessment: String(parsed.aiMarketAssessment || '').trim().slice(0, 1000) ||
        buildDeterministicAssessment(input).aiMarketAssessment,
      aiPredictionImpact: String(parsed.aiPredictionImpact || '').trim().slice(0, 600) ||
        buildDeterministicAssessment(input).aiPredictionImpact,
      aiConfidence,
      aiGeneratedAt: new Date().toISOString(),
      source: 'gemini',
    };
  } catch {
    return buildDeterministicAssessment(input);
  }
}
