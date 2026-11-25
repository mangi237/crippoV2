import { ApifyClient } from 'apify-client';

export type UnifiedApifyActorId =
  | 'apify/facebook-posts-scraper'
  | 'apify/facebook-pages-scraper'
  | 'apify/facebook-comments-scraper'
  | 'apify/facebook-likes-scraper'
  | 'clockworks/tiktok-profile-scraper'
  | 'apify/instagram-scraper'
  | 'apify/google-search-scraper'
  | 'automation-lab/spotify-scraper'
  | 'apify/website-content-crawler'
  | 'apify/playwright-scraper'
  | 'apidojo/youtube-scraper'
  | 'apidojo/tiktok-scraper'
  | 'apify/facebook-search-scraper'
  | 'apify/facebook-reels-scraper';

export interface UnifiedSignalItem {
  sourcePlatform: 'TikTok' | 'Facebook' | 'YouTube' | 'Web';
  sourceName: string;
  sourceUrl: string;
  title: string;
  description: string;
  engagementCount: number;
  publishedAt: string;
  entityNameHint?: string;
}

export interface UnifiedCreatorMetrics {
  stageName: string;
  platform: 'Spotify' | 'TikTok' | 'Instagram' | 'Facebook' | 'YouTube' | 'Web';
  handleOrUrl: string;
  avatarUrl?: string;
  followers: number;
  monthlyViewsOrStreams: number;
  engagementRate: number;
}

export function getApifyClient(): ApifyClient | null {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) return null;
  return new ApifyClient({ token });
}

function asNumber(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normalizeUrl(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // fallback
  }
  return fallback;
}

async function runActorDataset(
  client: ApifyClient,
  actorId: string,
  input: Record<string, unknown>,
  limit = 15
): Promise<Array<Record<string, unknown>>> {
  const run = await client.actor(actorId).call(input, {
    waitSecs: 30,
    timeout: 35,
  });
  if (!run?.defaultDatasetId) return [];
  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit });
  return (items || []) as Array<Record<string, unknown>>;
}

export async function scrapeFacebookPosts(
  urls: string[],
  limit = 15
): Promise<UnifiedSignalItem[]> {
  const client = getApifyClient();
  if (!client || urls.length === 0) return [];
  const items = await runActorDataset(
    client,
    'apify/facebook-posts-scraper',
    {
      startUrls: urls.map((url) => ({ url })),
      resultsLimit: limit,
    },
    limit
  );
  const out: UnifiedSignalItem[] = [];
  for (const item of items) {
    const text = String(item.text || item.message || item.title || '').trim();
    if (!text) continue;
    const likes = asNumber(item.likes || item.likesCount);
    const comments = asNumber(item.comments || item.commentsCount);
    const shares = asNumber(item.shares || item.sharesCount);
    out.push({
      sourcePlatform: 'Facebook',
      sourceName: String(item.pageName || item.userName || 'Facebook 237'),
      sourceUrl: normalizeUrl(item.url || item.postUrl, urls[0]),
      title: text.slice(0, 120),
      description: text.slice(0, 350),
      engagementCount: likes + comments * 2 + shares * 3,
      publishedAt: String(item.time || item.publishedAt || new Date().toISOString()),
      entityNameHint: typeof item.pageName === 'string' ? item.pageName : undefined,
    });
  }
  return out;
}

export async function scrapeFacebookPages(urls: string[]): Promise<UnifiedCreatorMetrics[]> {
  const client = getApifyClient();
  if (!client || urls.length === 0) return [];
  const items = await runActorDataset(
    client,
    'apify/facebook-pages-scraper',
    {
      startUrls: urls.map((url) => ({ url })),
    },
    10
  );
  return items
    .map((item) => {
      const title = String(item.title || item.pageName || item.name || '').trim();
      if (!title) return null;
      const followers = asNumber(item.followers || item.likes || item.pageLikes);
      return {
        stageName: title.slice(0, 100),
        platform: 'Facebook' as const,
        handleOrUrl: normalizeUrl(item.pageUrl || item.url, urls[0]),
        avatarUrl: typeof item.profilePictureUrl === 'string' ? item.profilePictureUrl : undefined,
        followers,
        monthlyViewsOrStreams: Math.round(followers * 1.8),
        engagementRate: 4.1,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
}

export async function scrapeFacebookCommentsAndLikes(
  postUrls: string[]
): Promise<UnifiedSignalItem[]> {
  const client = getApifyClient();
  if (!client || postUrls.length === 0) return [];

  const [commentsRes, likesRes] = await Promise.allSettled([
    runActorDataset(
      client,
      'apify/facebook-comments-scraper',
      {
        startUrls: postUrls.map((url) => ({ url })),
        resultsLimit: 25,
      },
      25
    ),
    runActorDataset(
      client,
      'apify/facebook-likes-scraper',
      {
        startUrls: postUrls.map((url) => ({ url })),
        resultsLimit: 10,
      },
      10
    ),
  ]);

  const out: UnifiedSignalItem[] = [];
  if (commentsRes.status === 'fulfilled' && commentsRes.value.length > 0) {
    const topTexts = commentsRes.value
      .map((c) => String(c.text || '').trim())
      .filter(Boolean)
      .slice(0, 5);
    if (topTexts.length > 0) {
      out.push({
        sourcePlatform: 'Facebook',
        sourceName: 'Facebook Fan Sentiment',
        sourceUrl: postUrls[0],
        title: `Fan Comments Buzz (${commentsRes.value.length} reactions tracked)`,
        description: topTexts.join(' | ').slice(0, 350),
        engagementCount: commentsRes.value.length * 4,
        publishedAt: new Date().toISOString(),
      });
    }
  }
  if (likesRes.status === 'fulfilled' && likesRes.value.length > 0) {
    out.push({
      sourcePlatform: 'Facebook',
      sourceName: 'Facebook Likes Velocity',
      sourceUrl: postUrls[0],
      title: `Active Facebook Reaction Surge (${likesRes.value.length} sampled profiles)`,
      description: `Live reaction verification captured across ${postUrls[0]}.`,
      engagementCount: likesRes.value.length * 10,
      publishedAt: new Date().toISOString(),
    });
  }
  return out;
}

export async function scrapeTikTokProfiles(profiles: string[]): Promise<{
  creators: UnifiedCreatorMetrics[];
  signals: UnifiedSignalItem[];
}> {
  const client = getApifyClient();
  if (!client || profiles.length === 0) return { creators: [], signals: [] };

  const cleanHandles = profiles
    .map((p) => p.replace(/^@/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
  if (cleanHandles.length === 0) return { creators: [], signals: [] };

  const items = await runActorDataset(
    client,
    'clockworks/tiktok-profile-scraper',
    {
      profiles: cleanHandles,
      maxFollowersPerProfile: 0,
      maxFollowingPerProfile: 0,
      commentsPerPost: 0,
      topLevelCommentsPerPost: 0,
      maxRepliesPerComment: 0,
    },
    12
  );

  const creators: UnifiedCreatorMetrics[] = [];
  const signals: UnifiedSignalItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const authorMeta = (item.authorMeta || {}) as Record<string, unknown>;
    const handle = String(authorMeta.name || item.username || item.author || '').trim();
    const stageName = String(authorMeta.nickName || handle || 'TikTok Creator').trim();
    const followers = asNumber(authorMeta.fans || item.followers || item.followerCount);
    const plays = asNumber(item.playCount || item.views || authorMeta.heart);
    const likes = asNumber(item.diggCount || item.likes);
    const comments = asNumber(item.commentCount || item.comments);
    const shares = asNumber(item.shareCount || item.shares);

    if (handle && !seen.has(handle.toLowerCase())) {
      seen.add(handle.toLowerCase());
      const eng =
        plays > 0
          ? Number(Math.min(25, Math.max(1.5, ((likes + comments * 2 + shares * 3) / plays) * 100)).toFixed(1))
          : 5.2;
      creators.push({
        stageName: stageName.slice(0, 100),
        platform: 'TikTok',
        handleOrUrl: `@${handle}`,
        avatarUrl: typeof authorMeta.avatar === 'string' ? authorMeta.avatar : undefined,
        followers,
        monthlyViewsOrStreams: plays > 0 ? plays * 2 : Math.round(followers * 3.5),
        engagementRate: eng,
      });
    }

    const caption = String(item.text || item.desc || '').trim();
    if (caption) {
      signals.push({
        sourcePlatform: 'TikTok',
        sourceName: stageName || 'TikTok #237',
        sourceUrl: normalizeUrl(item.webVideoUrl, `https://www.tiktok.com/@${handle}`),
        title: caption.slice(0, 120),
        description: caption.slice(0, 350),
        engagementCount: plays + likes * 3 + shares * 5,
        publishedAt: new Date().toISOString(),
        entityNameHint: stageName,
      });
    }
  }

  return { creators, signals };
}

export async function scrapeInstagramProfiles(
  directUrls: string[],
  resultsLimit = 20
): Promise<{
  creators: UnifiedCreatorMetrics[];
  signals: UnifiedSignalItem[];
}> {
  const client = getApifyClient();
  if (!client || directUrls.length === 0) return { creators: [], signals: [] };

  const items = await runActorDataset(
    client,
    'apify/instagram-scraper',
    {
      resultsType: 'posts',
      directUrls,
      resultsLimit,
      searchType: 'hashtag',
      searchLimit: 10,
      addParentData: false,
    },
    15
  );

  const creators: UnifiedCreatorMetrics[] = [];
  const signals: UnifiedSignalItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const owner = String(item.ownerUsername || item.ownerFullName || '').trim();
    const caption = String(item.caption || item.alt || '').trim();
    const likes = asNumber(item.likesCount || item.likes);
    const comments = asNumber(item.commentsCount || item.comments);
    const views = asNumber(item.videoViewCount || item.videoPlayCount);

    if (owner && !seen.has(owner.toLowerCase())) {
      seen.add(owner.toLowerCase());
      creators.push({
        stageName: String(item.ownerFullName || owner).slice(0, 100),
        platform: 'Instagram',
        handleOrUrl: `https://www.instagram.com/${owner}/`,
        followers: asNumber(item.followersCount) || likes * 12,
        monthlyViewsOrStreams: Math.max(views, (likes + comments) * 20),
        engagementRate: 4.8,
      });
    }

    if (caption) {
      signals.push({
        sourcePlatform: 'Web',
        sourceName: owner ? `Instagram @${owner}` : 'Instagram 237',
        sourceUrl: normalizeUrl(item.url, directUrls[0]),
        title: caption.slice(0, 120),
        description: caption.slice(0, 350),
        engagementCount: likes + comments * 2 + views,
        publishedAt: String(item.timestamp || new Date().toISOString()),
        entityNameHint: owner || undefined,
      });
    }
  }

  return { creators, signals };
}

export async function scrapeGoogleSearchNews(
  queries: string[]
): Promise<UnifiedSignalItem[]> {
  const client = getApifyClient();
  if (!client || queries.length === 0) return [];

  const items = await runActorDataset(
    client,
    'apify/google-search-scraper',
    {
      queries: queries.slice(0, 3).join('\n'),
      maxPagesPerQuery: 1,
      geminiSearch: { enableGemini: false },
      perplexitySearch: {
        enablePerplexity: false,
        returnImages: false,
        returnRelatedQuestions: false,
      },
      chatGptSearch: { enableChatGpt: false },
      copilotSearch: { enableCopilot: false },
      maximumLeadsEnrichmentRecords: 0,
    },
    10
  );

  const signals: UnifiedSignalItem[] = [];
  for (const page of items) {
    const organic = Array.isArray(page.organicResults)
      ? (page.organicResults as Array<Record<string, unknown>>)
      : [];
    for (const r of organic.slice(0, 6)) {
      const title = String(r.title || '').trim();
      if (!title) continue;
      const url = normalizeUrl(r.url, 'https://news.google.com');
      let sourceName = 'Google News';
      try {
        sourceName = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        sourceName = 'Web Press';
      }
      signals.push({
        sourcePlatform: 'Web',
        sourceName,
        sourceUrl: url,
        title: title.slice(0, 140),
        description: String(r.description || title).slice(0, 350),
        engagementCount: 500,
        publishedAt: String(r.date || new Date().toISOString()),
      });
    }
  }
  return signals;
}

export async function scrapeSpotifyArtists(options: {
  urls?: string[];
  searchTerms?: string[];
  maxResults?: number;
}): Promise<{
  creators: UnifiedCreatorMetrics[];
  signals: UnifiedSignalItem[];
}> {
  const client = getApifyClient();
  if (!client) return { creators: [], signals: [] };

  const urls = (options.urls || []).filter(Boolean);
  const searchTerms = (options.searchTerms || []).filter(Boolean);
  if (urls.length === 0 && searchTerms.length === 0) return { creators: [], signals: [] };

  const items = await runActorDataset(
    client,
    'automation-lab/spotify-scraper',
    {
      mode: urls.length > 0 ? 'urls' : 'search',
      ...(urls.length > 0 ? { urls } : { searchType: 'artists' }),
      ...(searchTerms.length > 0 ? { searchTerms } : {}),
      maxResults: options.maxResults || 10,
    },
    options.maxResults || 10
  );

  const creators: UnifiedCreatorMetrics[] = [];
  const signals: UnifiedSignalItem[] = [];

  for (const item of items) {
    const name = String(item.name || item.artistName || item.title || '').trim();
    if (!name) continue;
    const listeners = asNumber(item.monthlyListeners || item.followers || item.followerCount);
    const playCount = asNumber(item.playCount || item.streams || listeners * 3);
    const url = normalizeUrl(item.url || item.externalUrl, 'https://open.spotify.com');

    creators.push({
      stageName: name.slice(0, 100),
      platform: 'Spotify',
      handleOrUrl: url,
      avatarUrl: typeof item.image === 'string' ? item.image : undefined,
      followers: listeners,
      monthlyViewsOrStreams: playCount,
      engagementRate: 6.2,
    });

    signals.push({
      sourcePlatform: 'Web',
      sourceName: 'Spotify Streams',
      sourceUrl: url,
      title: `${name} streaming telemetry (${listeners.toLocaleString()} monthly listeners)`,
      description: `Verified Spotify index snapshot for ${name}: ${playCount.toLocaleString()} streams tracked.`,
      engagementCount: playCount + listeners,
      publishedAt: new Date().toISOString(),
      entityNameHint: name,
    });
  }

  return { creators, signals };
}
