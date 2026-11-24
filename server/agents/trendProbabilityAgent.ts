import { Type } from '@google/genai';
import { getGeminiClient, CRIPPO_GEMINI_MODEL } from '../lib/gemini.ts';
import { runCulturalPulsePipeline } from './culturalPulseAgent.ts';

export interface MintedPrediction {
  entityName: string;
  topicCategory: 'Music Milestones' | 'Viral View Milestones' | 'Culture & Awards' | 'Creator Releases';
  question: string;
  resolutionSource: string;
  aiProbability: number;
  yesPriceXAF: number;
  noPriceXAF: number;
  reasoning: string;
  endsAt: string;
}

export async function generateTrendProbabilities(input: {
  entityNames?: string[];
  recentHeadlines?: string[];
  count?: number;
}): Promise<{
  predictions: MintedPrediction[];
  missingKeys: string[];
  sourceSignalCount: number;
}> {
  const missingKeys: string[] = [];
  if (!process.env.YOUTUBE_API_KEY) missingKeys.push('YOUTUBE_API_KEY');
  if (!process.env.APIFY_API_TOKEN) missingKeys.push('APIFY_API_TOKEN');

  const entityNames = (input.entityNames || []).slice(0, 15);
  const recentHeadlines = (input.recentHeadlines || []).slice(0, 12);
  const count = Math.max(1, Math.min(5, Number(input.count || 3)));

  let liveSignalsSummary: string[] = [...recentHeadlines];

  if (missingKeys.length < 2) {
    try {
      const pulse = await runCulturalPulsePipeline(entityNames);
      if (pulse.catalysts.length > 0) {
        liveSignalsSummary = [
          ...pulse.catalysts.map(
            (c) => `[${c.sourcePlatform} • ${c.entityName}] ${c.headline} — ${c.summary} (${c.sentiment})`
          ),
          ...liveSignalsSummary,
        ].slice(0, 12);
      }
    } catch {
      // Proceed if recentHeadlines are present; otherwise handled below
    }
  }

  if (liveSignalsSummary.length === 0 && missingKeys.length === 2) {
    return { predictions: [], missingKeys, sourceSignalCount: 0 };
  }

  const ai = getGeminiClient();
  const futureDefault = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const prompt = `You are Crippo's Trend Probability & Event Market Underwriter for Cameroon & Africa.
Given these live creator signals and tracked entities, generate ${count} strictly NON-POLITICAL, objectively verifiable binary YES/NO Prediction Contracts in English/237 cultural context.

HARD RULES:
- ZERO politics, elections, government policy, or violence/crime topics. Only Music Milestones, Viral View Milestones, Culture & Awards, or Creator Releases.
- Every question MUST resolve cleanly from a public data source (Spotify streams, YouTube view count, DistroKid release, or TikTok hashtags).
- aiProbability must be a calibrated decimal strictly between 0.08 and 0.92.
- Set endsAt as YYYY-MM-DD within the next 7 to 45 days (default reference: ${futureDefault}).

Tracked Entities: ${entityNames.join(', ') || 'Kameni, Ko-C, Stanley Enow, Libianca, Maahlox, Tzy Panchak'}
Live Cultural & Social Signals:
${liveSignalsSummary.length > 0 ? liveSignalsSummary.join('\n') : 'Analyze active Cameroonian music and creator milestones for the tracked entities.'}`;

  const response = await ai.models.generateContent({
    model: CRIPPO_GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            entityName: { type: Type.STRING },
            topicCategory: { type: Type.STRING },
            question: { type: Type.STRING },
            resolutionSource: { type: Type.STRING },
            aiProbability: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
            endsAt: { type: Type.STRING },
          },
          required: [
            'entityName',
            'topicCategory',
            'question',
            'resolutionSource',
            'aiProbability',
            'reasoning',
            'endsAt',
          ],
        },
      },
    },
  });

  const parsed = JSON.parse((response.text || '[]').trim()) as Array<{
    entityName: string;
    topicCategory: string;
    question: string;
    resolutionSource: string;
    aiProbability: number;
    reasoning: string;
    endsAt: string;
  }>;

  const validTopics = new Set([
    'Music Milestones',
    'Viral View Milestones',
    'Culture & Awards',
    'Creator Releases',
  ]);

  const predictions: MintedPrediction[] = parsed.slice(0, count).map((item) => {
    const prob = Math.max(0.05, Math.min(0.95, Number(item.aiProbability) || 0.5));
    const yesPriceXAF = Math.max(5, Math.min(95, Math.round(prob * 100)));
    const noPriceXAF = 100 - yesPriceXAF;
    const topicCategory = (
      validTopics.has(item.topicCategory) ? item.topicCategory : 'Music Milestones'
    ) as MintedPrediction['topicCategory'];

    return {
      entityName: String(item.entityName || 'Crippo Creator').slice(0, 100),
      topicCategory,
      question: String(item.question || '').slice(0, 240),
      resolutionSource: String(item.resolutionSource || 'Spotify & YouTube Official Analytics').slice(0, 140),
      aiProbability: Number(prob.toFixed(2)),
      yesPriceXAF,
      noPriceXAF,
      reasoning: String(item.reasoning || '').slice(0, 400),
      endsAt: String(item.endsAt || futureDefault).slice(0, 40),
    };
  });

  return {
    predictions,
    missingKeys,
    sourceSignalCount: liveSignalsSummary.length,
  };
}
