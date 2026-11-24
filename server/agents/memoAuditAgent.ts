import { Type } from '@google/genai';
import { getGeminiClient, CRIPPO_GEMINI_MODEL } from '../lib/gemini';

export interface MemoAuditInput {
  stageName: string;
  platformLink: string;
  tier: 'fan_2000' | 'fast_track_5000';
}

export interface MemoAuditResult {
  approved: boolean;
  category: string;
  city: string;
  country: string;
  auditSummary: string;
  youtubeChannelId?: string;
  tiktokHandle?: string;
}

export async function auditCreatorMemo(input: MemoAuditInput): Promise<MemoAuditResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.platformLink);
  } catch {
    throw new Error('Invalid platform URL provided.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Platform URL must use HTTP or HTTPS.');
  }

  const allowedHosts = [
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'tiktok.com',
    'www.tiktok.com',
    'facebook.com',
    'www.facebook.com',
    'instagram.com',
    'www.instagram.com',
    'open.spotify.com',
  ];

  const hostAllowed = allowedHosts.some(
    (h) => parsedUrl.hostname === h || parsedUrl.hostname.endsWith(`.${h}`)
  );
  if (!hostAllowed) {
    throw new Error('Platform link must be from YouTube, TikTok, Facebook, Instagram, or Spotify.');
  }

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: CRIPPO_GEMINI_MODEL,
    contents: `Evaluate this creator listing memo request for Crippo (African creator stock exchange).
Stage Name: ${input.stageName}
Platform Link: ${input.platformLink}
Listing Tier: ${input.tier}

Verify that the platform link matches a public digital creator presence and classify their likely category (Music, Comedy & Skits, Film & Video, Podcast & Talk, Tech & Education) and primary city/country.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          approved: { type: Type.BOOLEAN },
          category: { type: Type.STRING },
          city: { type: Type.STRING },
          country: { type: Type.STRING },
          auditSummary: { type: Type.STRING },
        },
        required: ['approved', 'category', 'city', 'country', 'auditSummary'],
      },
    },
  });

  const parsed = JSON.parse((response.text || '{}').trim()) as MemoAuditResult;
  const isTikTok = parsedUrl.hostname.includes('tiktok.com');
  const handleMatch = parsedUrl.pathname.match(/@([a-zA-Z0-9._-]+)/);

  return {
    approved: Boolean(parsed.approved),
    category: parsed.category || 'Music',
    city: parsed.city || 'Douala',
    country: parsed.country || 'Cameroon',
    auditSummary: parsed.auditSummary || 'Memo audited by Crippo AI Underwriter.',
    tiktokHandle: isTikTok && handleMatch ? `@${handleMatch[1]}` : undefined,
  };
}
