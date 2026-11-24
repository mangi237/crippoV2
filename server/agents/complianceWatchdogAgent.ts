import { Type } from '@google/genai';
import { getGeminiClient, CRIPPO_GEMINI_MODEL } from '../lib/gemini';
import { scrapeGoogleSearchNews, scrapeSpotifyArtists } from '../scrapers/apifyHub';

export interface ComplianceCheckInput {
  raceId: string;
  creatorName: string;
  trackTitle: string;
  distributor: string;
  clearingEmail: string;
  revSharePct: number;
  isrcCode?: string;
}

export interface DuplicateMatch {
  platform: 'Spotify' | 'YouTube';
  title: string;
  channelOrArtist: string;
  url: string;
  isrcFound?: string;
}

export interface ComplianceAuditResult {
  clearedForTranche2: boolean;
  splitMatchVerified: boolean;
  antiOmissionStatus: 'clean' | 'duplicate_warning' | 'unverified_apis';
  duplicateMatches: DuplicateMatch[];
  riskFlags: string[];
  auditSummary: string;
  checkedApis: string[];
}

async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!resp.ok) return null;
  const data = (await resp.json()) as { access_token?: string };
  return data.access_token || null;
}

async function searchSpotifyTracks(query: string, token: string): Promise<DuplicateMatch[]> {
  const resp = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    tracks?: {
      items?: Array<{
        name?: string;
        external_urls?: { spotify?: string };
        external_ids?: { isrc?: string };
        artists?: Array<{ name?: string }>;
      }>;
    };
  };

  return (data.tracks?.items || []).map((t) => ({
    platform: 'Spotify',
    title: t.name || query,
    channelOrArtist: t.artists?.map((a) => a.name).filter(Boolean).join(', ') || 'Unknown',
    url: t.external_urls?.spotify || 'https://open.spotify.com',
    isrcFound: t.external_ids?.isrc,
  }));
}

async function searchYouTubeDuplicates(query: string): Promise<DuplicateMatch[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  const resp = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`
  );
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: { title?: string; channelTitle?: string };
    }>;
  };

  return (data.items || [])
    .filter((i) => i.id?.videoId)
    .map((i) => ({
      platform: 'YouTube',
      title: i.snippet?.title || query,
      channelOrArtist: i.snippet?.channelTitle || 'YouTube',
      url: `https://www.youtube.com/watch?v=${i.id?.videoId}`,
    }));
}

export async function runComplianceWatchdog(input: ComplianceCheckInput): Promise<ComplianceAuditResult> {
  const checkedApis: string[] = [];
  const matches: DuplicateMatch[] = [];

  const expectedClearingEmail = `race-${input.raceId}@clearing.crippo.cm`;
  const splitEmailValid =
    input.clearingEmail.toLowerCase().trim() === expectedClearingEmail.toLowerCase();

  const isrcValid = Boolean(input.isrcCode && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(input.isrcCode.trim()));

  const searchQuery = input.isrcCode
    ? `${input.isrcCode} ${input.trackTitle}`
    : `${input.creatorName} ${input.trackTitle}`;

  const spotifyToken = await getSpotifyToken().catch(() => null);
  if (spotifyToken) {
    checkedApis.push('Spotify Web API');
    const spMatches = await searchSpotifyTracks(searchQuery, spotifyToken).catch(() => []);
    matches.push(...spMatches);
  } else if (process.env.APIFY_API_TOKEN) {
    checkedApis.push('Spotify Scraper (Apify)');
    const apifySp = await scrapeSpotifyArtists({ searchTerms: [searchQuery], maxResults: 4 }).catch(() => ({
      creators: [],
      signals: [],
    }));
    for (const c of apifySp.creators) {
      matches.push({
        platform: 'Spotify',
        title: input.trackTitle,
        channelOrArtist: c.stageName,
        url: c.handleOrUrl,
        isrcFound: input.isrcCode,
      });
    }
  }

  if (process.env.YOUTUBE_API_KEY) {
    checkedApis.push('YouTube Data API v3');
    const ytMatches = await searchYouTubeDuplicates(searchQuery).catch(() => []);
    matches.push(...ytMatches);
  } else if (process.env.APIFY_API_TOKEN) {
    checkedApis.push('Google Search Index (Apify)');
    const gMatches = await scrapeGoogleSearchNews([
      `${input.creatorName} ${input.trackTitle} Spotify OR Audiomack OR YouTube`,
    ]).catch(() => []);
    for (const g of gMatches.slice(0, 4)) {
      matches.push({
        platform: 'YouTube',
        title: g.title,
        channelOrArtist: g.sourceName,
        url: g.sourceUrl,
      });
    }
  }

  const ai = getGeminiClient();
  const prompt = `You are Crippo's Royalty Compliance Watchdog protecting Tranche 2 escrow releases against creator revenue diversion or duplicate ISRC uploads.

Audit Data:
- Race ID: ${input.raceId}
- Creator: ${input.creatorName}
- Track/Project Title: ${input.trackTitle}
- Distributor: ${input.distributor}
- Pledged Investor Revenue Share: ${input.revSharePct}%
- Expected Clearing Split Email: ${expectedClearingEmail}
- Submitted Clearing Email: ${input.clearingEmail} (exact match: ${splitEmailValid})
- Submitted ISRC: ${input.isrcCode || 'MISSING'} (valid 12-char format: ${isrcValid})
- APIs Queried: ${checkedApis.join(', ') || 'None configured (structural validation only)'}
- Live Search Matches Found (${matches.length}):
${JSON.stringify(matches, null, 2)}

Determine:
1. Whether splitMatchVerified should be true (requires exact clearing email match and valid ISRC).
2. Whether any suspicious duplicate or unauthorized re-upload exists in the live matches (compare artist/channel names against "${input.creatorName}").
3. Concise institutional auditSummary and actionable riskFlags.`;

  const response = await ai.models.generateContent({
    model: CRIPPO_GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          hasSuspiciousDuplicate: { type: Type.BOOLEAN },
          riskFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
          auditSummary: { type: Type.STRING },
        },
        required: ['hasSuspiciousDuplicate', 'riskFlags', 'auditSummary'],
      },
    },
  });

  const parsed = JSON.parse((response.text || '{}').trim()) as {
    hasSuspiciousDuplicate: boolean;
    riskFlags: string[];
    auditSummary: string;
  };

  const riskFlags = [...(parsed.riskFlags || [])];
  if (!splitEmailValid) {
    riskFlags.unshift(`Clearing email mismatch: expected ${expectedClearingEmail}.`);
  }
  if (!isrcValid) {
    riskFlags.unshift('Valid 12-character ISRC/UPC code required before Tranche 2 disbursement.');
  }

  const clearedForTranche2 = splitEmailValid && isrcValid && !parsed.hasSuspiciousDuplicate;
  const antiOmissionStatus: ComplianceAuditResult['antiOmissionStatus'] =
    parsed.hasSuspiciousDuplicate
      ? 'duplicate_warning'
      : checkedApis.length > 0
      ? 'clean'
      : 'unverified_apis';

  return {
    clearedForTranche2,
    splitMatchVerified: splitEmailValid && isrcValid,
    antiOmissionStatus,
    duplicateMatches: matches.slice(0, 6),
    riskFlags: riskFlags.slice(0, 6),
    auditSummary: String(parsed.auditSummary || 'Compliance audit completed.').slice(0, 600),
    checkedApis,
  };
}
