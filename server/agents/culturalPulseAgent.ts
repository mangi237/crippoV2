import { Type } from '@google/genai';
import { getGeminiClient, CRIPPO_GEMINI_MODEL } from '../lib/gemini';

export interface RawSocialSignal {
  sourcePlatform: 'TikTok' | 'Facebook' | 'YouTube' | 'Web';
  sourceName: string;
  sourceUrl: string;
  title: string;
  description: string;
  engagementCount: number;
  publishedAt: string;
  entityNameHint?: string;
}

export interface AnalyzedCatalyst {
  entityName: string;
  segment: 'Trending' | 'Entertainment' | 'Music' | 'Tech' | 'Local News';
  sourcePlatform: 'TikTok' | 'Facebook' | 'YouTube' | 'Web';
  sourceName: string;
  sourceUrl: string;
  headline: string;
  summary: string;
  sentiment: 'bullish' | 'neutral' | 'risk_alert';
  priceImpactPct: number;
  engagementCount: number;
  publishedAt: string;
}

export type CulturalPulseActor =
  | 'apify/website-content-crawler'
  | 'apify/playwright-scraper'
  | 'apidojo/tiktok-scraper'
  | 'apidojo/youtube-scraper'
  | 'apify/facebook-search-scraper'
  | 'apify/facebook-reels-scraper';

async function fetchYouTubeCulturalSignals(queryTerms: string[]): Promise<RawSocialSignal[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  const q = queryTerms.length > 0 ? queryTerms.slice(0, 3).join(' OR ') : 'Cameroon music OR 237 entertainment';
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=8&q=${encodeURIComponent(q)}&key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`YouTube API error (${resp.status}): ${errText}`);
  }

  const data = (await resp.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        description?: string;
        channelTitle?: string;
        publishedAt?: string;
      };
    }>;
  };

  return (data.items || [])
    .filter((item) => item.id?.videoId && item.snippet?.title)
    .map((item) => ({
      sourcePlatform: 'YouTube' as const,
      sourceName: item.snippet?.channelTitle || 'YouTube 237',
      sourceUrl: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      title: item.snippet?.title || '',
      description: (item.snippet?.description || '').slice(0, 350),
      engagementCount: 0,
      publishedAt: item.snippet?.publishedAt || new Date().toISOString(),
    }));
}

async function fetchApifyCulturalSignals(
  actor: CulturalPulseActor = 'apify/website-content-crawler',
  targetUrls?: string[],
  queryTerms?: string[]
): Promise<RawSocialSignal[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return [];

  const slug = actor.replace('/', '~');
  const results: RawSocialSignal[] = [];

  if (actor === 'apify/website-content-crawler' || actor === 'apify/playwright-scraper') {
    const urls =
      targetUrls && targetUrls.length > 0
        ? targetUrls.map((u) => ({ url: u }))
        : [{ url: 'https://www.237showbiz.com' }, { url: 'https://www.camerounweb.com/CameroonHomePage/entertainment/' }];
    const resp = await fetch(
      `https://api.apify.com/v2/acts/${slug}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=35`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: urls,
          maxCrawlPages: 6,
          maxCrawlDepth: 1,
        }),
      }
    );
    if (resp.ok) {
      const items = (await resp.json()) as Array<{
        url?: string;
        text?: string;
        metadata?: { title?: string; description?: string };
      }>;
      for (const item of items.slice(0, 6)) {
        const headline = item.metadata?.title || item.text?.slice(0, 110);
        if (!headline) continue;
        results.push({
          sourcePlatform: 'Web',
          sourceName: new URL(item.url || 'https://237showbiz.com').hostname.replace(/^www\./, ''),
          sourceUrl: item.url || 'https://www.237showbiz.com',
          title: headline.slice(0, 140),
          description: (item.metadata?.description || item.text || '').slice(0, 350),
          engagementCount: 0,
          publishedAt: new Date().toISOString(),
        });
      }
    }
  } else if (actor === 'apidojo/tiktok-scraper') {
    const resp = await fetch(
      `https://api.apify.com/v2/acts/${slug}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=35`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: queryTerms && queryTerms.length > 0 ? queryTerms.slice(0, 3) : ['237', 'cameroon music'],
          maxItems: 8,
        }),
      }
    );
    if (resp.ok) {
      const items = (await resp.json()) as Array<{
        title?: string;
        text?: string;
        postPage?: string;
        webVideoUrl?: string;
        channel?: { name?: string; username?: string };
        authorMeta?: { name?: string; nickName?: string };
        views?: number;
        likes?: number;
      }>;
      for (const item of items.slice(0, 8)) {
        const text = item.title || item.text;
        if (!text) continue;
        results.push({
          sourcePlatform: 'TikTok',
          sourceName: item.channel?.name || item.authorMeta?.nickName || 'TikTok #237',
          sourceUrl: item.postPage || item.webVideoUrl || 'https://www.tiktok.com',
          title: text.slice(0, 120),
          description: text.slice(0, 350),
          engagementCount: Number(item.views || 0) + Number(item.likes || 0),
          publishedAt: new Date().toISOString(),
          entityNameHint: item.channel?.name || item.authorMeta?.nickName,
        });
      }
    }
  } else if (actor === 'apify/facebook-search-scraper' || actor === 'apify/facebook-reels-scraper') {
    const resp = await fetch(
      `https://api.apify.com/v2/acts/${slug}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=35`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          actor === 'apify/facebook-search-scraper'
            ? { queries: queryTerms?.length ? queryTerms.slice(0, 2) : ['237 showbiz cameroon'], resultsLimit: 6 }
            : { startUrls: [{ url: 'https://www.facebook.com/237Showbiz' }], resultsLimit: 6 }
        ),
      }
    );
    if (resp.ok) {
      const items = (await resp.json()) as Array<{
        text?: string;
        title?: string;
        url?: string;
        pageName?: string;
        likes?: number;
        comments?: number;
      }>;
      for (const item of items.slice(0, 6)) {
        const body = item.text || item.title;
        if (!body) continue;
        results.push({
          sourcePlatform: 'Facebook',
          sourceName: item.pageName || '237 Social Pulse',
          sourceUrl: item.url || 'https://www.facebook.com',
          title: body.slice(0, 120),
          description: body.slice(0, 350),
          engagementCount: Number(item.likes || 0) + Number(item.comments || 0),
          publishedAt: new Date().toISOString(),
        });
      }
    }
  } else if (actor === 'apidojo/youtube-scraper') {
    const resp = await fetch(
      `https://api.apify.com/v2/acts/${slug}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=35`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQueries: queryTerms?.length ? queryTerms.slice(0, 2) : ['Cameroon 237 entertainment'],
          maxResults: 6,
        }),
      }
    );
    if (resp.ok) {
      const items = (await resp.json()) as Array<{
        title?: string;
        text?: string;
        url?: string;
        channelName?: string;
        viewCount?: number;
        date?: string;
      }>;
      for (const item of items.slice(0, 6)) {
        if (!item.title) continue;
        results.push({
          sourcePlatform: 'YouTube',
          sourceName: item.channelName || 'YouTube 237',
          sourceUrl: item.url || 'https://www.youtube.com',
          title: item.title.slice(0, 140),
          description: (item.text || item.title).slice(0, 350),
          engagementCount: Number(item.viewCount || 0),
          publishedAt: item.date || new Date().toISOString(),
        });
      }
    }
  }

  return results;
}

export async function runCulturalPulsePipeline(
  entityNames: string[],
  options?: { actor?: CulturalPulseActor; targetUrls?: string[] }
): Promise<{
  catalysts: AnalyzedCatalyst[];
  missingKeys: string[];
  actorUsed: string;
}> {
  const missingKeys: string[] = [];
  if (!process.env.YOUTUBE_API_KEY) missingKeys.push('YOUTUBE_API_KEY');
  if (!process.env.APIFY_API_TOKEN) missingKeys.push('APIFY_API_TOKEN');

  if (missingKeys.length === 2) {
    return { catalysts: [], missingKeys, actorUsed: 'none' };
  }

  const chosenActor = options?.actor || 'apify/website-content-crawler';

  const [ytSignals, apifySignals] = await Promise.all([
    fetchYouTubeCulturalSignals(entityNames).catch(() => []),
    fetchApifyCulturalSignals(chosenActor, options?.targetUrls, entityNames).catch(() => []),
  ]);

  const rawSignals = [...ytSignals, ...apifySignals];
  if (rawSignals.length === 0) {
    return { catalysts: [], missingKeys, actorUsed: chosenActor };
  }

  const ai = getGeminiClient();

  const prompt = `You are Crippo's Cultural Pulse & Disadvantage Analyst for Cameroonian and African digital creators.
Analyze the following REAL fetched posts from YouTube, Web Entertainment Press, TikTok (#237), and Facebook.
Understand Pidgin, Camfranglais, and French context carefully:
- Separate TRUE commercial disadvantages (brand sponsor pullout, account ban, fan boycott, legal dispute, missed release deadline -> sentiment: "risk_alert", priceImpactPct between -25 and -4) from harmless viral clout/memes/beef that actually boosts streams (sentiment: "bullish", priceImpactPct between +2 and +30) or routine announcements ("neutral", -2 to +3).
- Categorize every post into one clean unified segment: "Trending", "Entertainment", "Music", "Tech", or "Local News".
- Match entityName to one of these tracked creators if relevant, or extract the subject creator's name: [${entityNames.join(', ')}].

Raw Signals:
${JSON.stringify(rawSignals, null, 2)}`;

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
            index: { type: Type.INTEGER },
            entityName: { type: Type.STRING },
            segment: { type: Type.STRING },
            headline: { type: Type.STRING },
            summary: { type: Type.STRING },
            sentiment: { type: Type.STRING },
            priceImpactPct: { type: Type.NUMBER },
          },
          required: [
            'index',
            'entityName',
            'segment',
            'headline',
            'summary',
            'sentiment',
            'priceImpactPct',
          ],
        },
      },
    },
  });

  const analyzed = JSON.parse((response.text || '[]').trim()) as Array<{
    index: number;
    entityName: string;
    segment: string;
    headline: string;
    summary: string;
    sentiment: string;
    priceImpactPct: number;
  }>;

  const validSegments = new Set(['Trending', 'Entertainment', 'Music', 'Tech', 'Local News']);
  const validSentiments = new Set(['bullish', 'neutral', 'risk_alert']);

  const catalysts: AnalyzedCatalyst[] = analyzed
    .filter((item) => rawSignals[item.index])
    .map((item) => {
      const src = rawSignals[item.index];
      const segment = (validSegments.has(item.segment) ? item.segment : 'Trending') as AnalyzedCatalyst['segment'];
      const sentiment = (validSentiments.has(item.sentiment) ? item.sentiment : 'neutral') as AnalyzedCatalyst['sentiment'];
      const impact = Math.max(-25, Math.min(35, Number(item.priceImpactPct) || 0));

      return {
        entityName: item.entityName.slice(0, 100),
        segment,
        sourcePlatform: src.sourcePlatform,
        sourceName: src.sourceName.slice(0, 100),
        sourceUrl: src.sourceUrl,
        headline: item.headline.slice(0, 200),
        summary: item.summary.slice(0, 600),
        sentiment,
        priceImpactPct: Number(impact.toFixed(1)),
        engagementCount: src.engagementCount,
        publishedAt: src.publishedAt,
      };
    });

  return { catalysts, missingKeys, actorUsed: apifySignals.length > 0 ? chosenActor : 'youtube-data-api-v3' };
}
