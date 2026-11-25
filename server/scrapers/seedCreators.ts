import {
  scrapeFacebookPages,
  scrapeGoogleSearchNews,
  scrapeInstagramProfiles,
  scrapeSpotifyArtists,
  scrapeTikTokProfiles,
} from './apifyHub';

export interface RealCreatorSeed {
  id: string;
  stageName: string;
  category: string;
  city: string;
  country: string;
  entityType: 'solo' | 'agency';
  youtubeChannelId?: string;
  tiktokHandle?: string;
  facebookPage?: string;
  spotifyArtistId?: string;
  avatarUrl?: string;
  subscribers: number;
  monthlyViews: number;
  engagementRate: number;
  catalogValuationXAF: number;
  wikiGrade: string;
  rankScore: number;
}

export type SupportedSeedActor =
  | 'auto'
  | 'automation-lab/spotify-scraper'
  | 'clockworks/tiktok-profile-scraper'
  | 'apify/instagram-scraper'
  | 'apify/facebook-pages-scraper'
  | 'apify/google-search-scraper'
  | 'apify/website-content-crawler'
  | 'apify/playwright-scraper'
  | 'apidojo/youtube-scraper'
  | 'apidojo/tiktok-scraper'
  | 'apify/facebook-search-scraper';

function toApifySlug(actor: string): string {
  return actor.replace('/', '~');
}

export function computeCreatorRankAndValuation(metrics: {
  subscribers: number;
  monthlyViews: number;
  engagementRate: number;
}): { rankScore: number; wikiGrade: string; catalogValuationXAF: number } {
  const reachScore = Math.min(40, Math.log10(Math.max(10, metrics.subscribers)) * 6.8);
  const velocityScore = Math.min(40, Math.log10(Math.max(10, metrics.monthlyViews)) * 6.0);
  const engScore = Math.min(20, Math.max(2, metrics.engagementRate * 2.2));
  const rankScore = Math.max(15, Math.min(99, Math.round(reachScore + velocityScore + engScore)));

  const wikiGrade =
    rankScore >= 85 ? 'A+ Tier' : rankScore >= 72 ? 'A-Index' : rankScore >= 55 ? 'B-Index' : 'C-Index';

  // Conservative 12-month Cameroon/Diaspora blended digital catalog valuation (XAF)
  const monthlyStreamValueXAF = Math.round(metrics.monthlyViews * 0.72);
  const fanBaseFloorXAF = Math.round(metrics.subscribers * 180);
  const catalogValuationXAF = Math.max(500_000, Math.round(monthlyStreamValueXAF * 12 + fanBaseFloorXAF));

  return { rankScore, wikiGrade, catalogValuationXAF };
}

/** YouTube via the official Data API v3 (used when YOUTUBE_API_KEY is set). */
async function fetchYouTubeChannelsViaGoogle(q: string, youtubeKey: string): Promise<RealCreatorSeed[]> {
  const creators: RealCreatorSeed[] = [];
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=10&q=${encodeURIComponent(q)}&key=${encodeURIComponent(youtubeKey)}`;
  const searchResp = await fetch(searchUrl);
  if (!searchResp.ok) return creators;

  const searchData = (await searchResp.json()) as {
    items?: Array<{ id?: { channelId?: string } }>;
  };
  const channelIds = (searchData.items || [])
    .map((i) => i.id?.channelId)
    .filter((id): id is string => Boolean(id));
  if (channelIds.length === 0) return creators;

  const statsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(channelIds.join(','))}&key=${encodeURIComponent(youtubeKey)}`;
  const statsResp = await fetch(statsUrl);
  if (!statsResp.ok) return creators;

  const statsData = (await statsResp.json()) as {
    items?: Array<{
      id: string;
      snippet?: {
        title?: string;
        country?: string;
        thumbnails?: { high?: { url?: string }; default?: { url?: string } };
      };
      statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
    }>;
  };

  for (const ch of statsData.items || []) {
    const subs = Number(ch.statistics?.subscriberCount || 0);
    const totalViews = Number(ch.statistics?.viewCount || 0);
    const videos = Math.max(1, Number(ch.statistics?.videoCount || 1));
    const avgViewsPerVideo = Math.round(totalViews / videos);
    // Channel-level data has no monthly figure; the average per video is the closest real measure.
    const monthlyViews = avgViewsPerVideo;
    // The channel endpoint has no like or comment totals, so engagement is 0 until a video-level
    // source supplies it. Do not invent a value here.
    const engagementRate = 0;
    const rank = computeCreatorRankAndValuation({ subscribers: subs, monthlyViews, engagementRate });

    creators.push({
      id: `yt_${ch.id.replace(/[^a-zA-Z0-9_-]/g, '')}`,
      stageName: (ch.snippet?.title || 'Creator').slice(0, 100),
      category: 'Music & Video',
      city: 'Douala',
      country: ch.snippet?.country || 'CM',
      entityType: 'solo',
      youtubeChannelId: ch.id,
      avatarUrl: ch.snippet?.thumbnails?.high?.url || ch.snippet?.thumbnails?.default?.url,
      subscribers: subs,
      monthlyViews,
      engagementRate,
      ...rank,
    });
  }
  return creators;
}

/**
 * YouTube via the Apify actor apidojo/youtube-scraper (used when no YOUTUBE_API_KEY is set,
 * or when the Google API returns nothing). Only real fields from the actor are used.
 */
async function fetchYouTubeChannelsViaApify(q: string, apifyToken: string): Promise<RealCreatorSeed[]> {
  const creators: RealCreatorSeed[] = [];
  const resp = await fetch(
    `https://api.apify.com/v2/acts/${toApifySlug('apidojo/youtube-scraper')}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}&timeout=35`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchQueries: [q], maxResults: 10 }),
    }
  );
  if (!resp.ok) return creators;

  const items = (await resp.json()) as Array<{
    channelName?: string;
    channelUrl?: string;
    channelId?: string;
    numberOfSubscribers?: number;
    viewCount?: number;
    likeCount?: number;
    likes?: number;
    commentCount?: number;
    comments?: number;
    thumbnailUrl?: string;
  }>;

  const seen = new Set<string>();
  for (const item of items) {
    const name = item.channelName;
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const chId = item.channelId || name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const subscribers = Number(item.numberOfSubscribers || 0);
    const views = Number(item.viewCount || 0);
    const likes = Number(item.likeCount ?? item.likes ?? 0);
    const comments = Number(item.commentCount ?? item.comments ?? 0);
    // Real engagement only: (likes + comments) / views, or 0 when the actor didn't return them.
    const engagementRate =
      views > 0 && likes + comments > 0 ? Number((((likes + comments) / views) * 100).toFixed(2)) : 0;
    const monthlyViews = views;
    const rank = computeCreatorRankAndValuation({ subscribers, monthlyViews, engagementRate });

    creators.push({
      id: `yt_${chId.slice(0, 60)}`,
      stageName: name.slice(0, 100),
      category: 'Music & Video',
      city: 'Douala',
      country: 'CM',
      entityType: 'solo',
      youtubeChannelId: item.channelId || item.channelUrl,
      avatarUrl: item.thumbnailUrl,
      subscribers,
      monthlyViews,
      engagementRate,
      ...rank,
    });
  }
  return creators;
}

export async function fetchRealCreatorsFromAPIs(
  searchQuery: string,
  options?: { actor?: SupportedSeedActor; startUrl?: string }
): Promise<{
  creators: RealCreatorSeed[];
  missingKeys: string[];
  actorUsed: string;
}> {
  const youtubeKey = process.env.YOUTUBE_API_KEY;
  const apifyToken = process.env.APIFY_API_TOKEN;
  const selectedActor = options?.actor || 'auto';
  const q = searchQuery.trim() || 'Cameroon music artist';

  const missingKeys: string[] = [];
  if (!apifyToken) missingKeys.push('APIFY_API_TOKEN');
  if (!youtubeKey && !apifyToken) missingKeys.push('YOUTUBE_API_KEY');

  const creators: RealCreatorSeed[] = [];
  let actorUsed = 'none';

  // 1. YouTube. Google Data API first when its key is set; Apify actor as the fallback.
  if (selectedActor === 'auto' || selectedActor === 'apidojo/youtube-scraper') {
    if (youtubeKey && selectedActor === 'auto') {
      const fromGoogle = await fetchYouTubeChannelsViaGoogle(q, youtubeKey);
      if (fromGoogle.length > 0) {
        creators.push(...fromGoogle);
        actorUsed = 'youtube-data-api-v3';
      }
    }
    if (creators.length === 0 && apifyToken) {
      const fromApify = await fetchYouTubeChannelsViaApify(q, apifyToken);
      if (fromApify.length > 0) {
        creators.push(...fromApify);
        actorUsed = 'apidojo/youtube-scraper';
      }
    }
  }

  // 2. Other Apify actors. YouTube is handled above, so it is skipped here.
  const runOtherActors =
    apifyToken &&
    selectedActor !== 'apidojo/youtube-scraper' &&
    (selectedActor !== 'auto' || creators.length === 0);

  if (runOtherActors) {
    const targetActor: SupportedSeedActor =
      selectedActor === 'auto' ? 'automation-lab/spotify-scraper' : selectedActor;
    actorUsed = targetActor;
    const cleanQuery = searchQuery.trim() || 'Cameroon Afropop';

    if (targetActor === 'automation-lab/spotify-scraper') {
      const spRes = await scrapeSpotifyArtists({
        urls: options?.startUrl ? [options.startUrl] : undefined,
        searchTerms: [cleanQuery],
        maxResults: 10,
      });
      for (const item of spRes.creators) {
        const rank = computeCreatorRankAndValuation({
          subscribers: item.followers,
          monthlyViews: item.monthlyViewsOrStreams,
          engagementRate: item.engagementRate,
        });
        creators.push({
          id: `sp_${item.stageName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 48)}`,
          stageName: item.stageName,
          category: 'Music',
          city: 'Douala',
          country: 'CM',
          entityType: 'solo',
          spotifyArtistId: item.handleOrUrl,
          avatarUrl: item.avatarUrl,
          subscribers: item.followers,
          monthlyViews: item.monthlyViewsOrStreams,
          engagementRate: item.engagementRate,
          ...rank,
        });
      }
    } else if (targetActor === 'clockworks/tiktok-profile-scraper') {
      const handles = options?.startUrl
        ? [options.startUrl.split('/').pop() || cleanQuery]
        : cleanQuery
            .split(',')
            .map((s) => s.trim().replace(/\s+/g, ''))
            .filter(Boolean);
      const ttRes = await scrapeTikTokProfiles(handles.length > 0 ? handles : ['stanleyenow', 'libianca']);
      for (const item of ttRes.creators) {
        const rank = computeCreatorRankAndValuation({
          subscribers: item.followers,
          monthlyViews: item.monthlyViewsOrStreams,
          engagementRate: item.engagementRate,
        });
        creators.push({
          id: `tt_${item.handleOrUrl.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)}`,
          stageName: item.stageName,
          category: 'TikTok & Skits',
          city: 'Yaoundé',
          country: 'CM',
          entityType: 'solo',
          tiktokHandle: item.handleOrUrl,
          avatarUrl: item.avatarUrl,
          subscribers: item.followers,
          monthlyViews: item.monthlyViewsOrStreams,
          engagementRate: item.engagementRate,
          ...rank,
        });
      }
    } else if (targetActor === 'apify/instagram-scraper') {
      const urls = options?.startUrl
        ? [options.startUrl]
        : [`https://www.instagram.com/${cleanQuery.replace(/[^a-zA-Z0-9._]/g, '')}/`];
      const igRes = await scrapeInstagramProfiles(urls, 25);
      for (const item of igRes.creators) {
        const rank = computeCreatorRankAndValuation({
          subscribers: item.followers,
          monthlyViews: item.monthlyViewsOrStreams,
          engagementRate: item.engagementRate,
        });
        creators.push({
          id: `ig_${item.stageName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 48)}`,
          stageName: item.stageName,
          category: 'Entertainment',
          city: 'Douala',
          country: 'CM',
          entityType: 'solo',
          avatarUrl: item.avatarUrl,
          subscribers: item.followers,
          monthlyViews: item.monthlyViewsOrStreams,
          engagementRate: item.engagementRate,
          ...rank,
        });
      }
    } else if (targetActor === 'apify/facebook-pages-scraper') {
      const urls = options?.startUrl ? [options.startUrl] : ['https://www.facebook.com/237Showbiz'];
      const fbPages = await scrapeFacebookPages(urls);
      for (const item of fbPages) {
        const rank = computeCreatorRankAndValuation({
          subscribers: item.followers,
          monthlyViews: item.monthlyViewsOrStreams,
          engagementRate: item.engagementRate,
        });
        creators.push({
          id: `fb_${item.stageName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 48)}`,
          stageName: item.stageName,
          category: 'Entertainment',
          city: 'Douala',
          country: 'CM',
          entityType: 'solo',
          facebookPage: item.handleOrUrl,
          avatarUrl: item.avatarUrl,
          subscribers: item.followers,
          monthlyViews: item.monthlyViewsOrStreams,
          engagementRate: item.engagementRate,
          ...rank,
        });
      }
    } else if (targetActor === 'apify/google-search-scraper') {
      const gSignals = await scrapeGoogleSearchNews([`${cleanQuery} Cameroon artist Audiomack Spotify YouTube`]);
      gSignals.slice(0, 8).forEach((sig, idx) => {
        const stageName = sig.title.split(/[-|•]/)[0]?.trim().slice(0, 80) || sig.sourceName;
        // No real metrics come from a search result, so these rows get zero reach and zero
        // engagement. They rank low and fail the listing gate until a profile is verified.
        const rank = computeCreatorRankAndValuation({ subscribers: 0, monthlyViews: 0, engagementRate: 0 });
        creators.push({
          id: `gs_${Date.now()}_${idx}`,
          stageName,
          category: 'Music & Press',
          city: 'Douala',
          country: 'CM',
          entityType: 'solo',
          facebookPage: sig.sourceUrl,
          subscribers: 0,
          monthlyViews: 0,
          engagementRate: 0,
          ...rank,
        });
      });
    } else if (targetActor === 'apidojo/tiktok-scraper') {
      const ttResp = await fetch(
        `https://api.apify.com/v2/acts/${toApifySlug(targetActor)}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken!)}&timeout=35`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keywords: [cleanQuery], maxItems: 10 }),
        }
      );
      if (ttResp.ok) {
        const items = (await ttResp.json()) as Array<{
          channel?: { username?: string; name?: string; followers?: number; avatar?: string };
          authorMeta?: { name?: string; nickName?: string; fans?: number; avatar?: string };
          views?: number;
          playCount?: number;
          likes?: number;
          diggCount?: number;
        }>;
        const seen = new Set<string>();
        for (const item of items) {
          const handle = item.channel?.username || item.authorMeta?.name;
          if (!handle || seen.has(handle)) continue;
          seen.add(handle);
          const fans = Number(item.channel?.followers || item.authorMeta?.fans || 0);
          const plays = Number(item.views || item.playCount || 0);
          const likes = Number(item.likes || item.diggCount || 0);
          const monthlyViews = plays;
          const engagementRate = plays > 0 ? Number(Math.min(25, (likes / plays) * 100).toFixed(1)) : 0;
          const rank = computeCreatorRankAndValuation({ subscribers: fans, monthlyViews, engagementRate });
          creators.push({
            id: `tt_${handle.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)}`,
            stageName: (item.channel?.name || item.authorMeta?.nickName || handle).slice(0, 100),
            category: 'TikTok & Skits',
            city: 'Yaoundé',
            country: 'CM',
            entityType: 'solo',
            tiktokHandle: `@${handle}`,
            avatarUrl: item.channel?.avatar || item.authorMeta?.avatar,
            subscribers: fans,
            monthlyViews,
            engagementRate,
            ...rank,
          });
        }
      }
    } else if (targetActor === 'apify/facebook-search-scraper') {
      const fbResp = await fetch(
        `https://api.apify.com/v2/acts/${toApifySlug(targetActor)}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken!)}&timeout=35`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queries: [cleanQuery], resultsLimit: 8 }),
        }
      );
      if (fbResp.ok) {
        const items = (await fbResp.json()) as Array<{
          name?: string;
          title?: string;
          url?: string;
          pageName?: string;
          likes?: number;
          followers?: number;
        }>;
        for (const item of items.slice(0, 8)) {
          const name = item.pageName || item.name || item.title;
          if (!name) continue;
          const subscribers = Number(item.followers || item.likes || 0);
          const monthlyViews = 0;
          const engagementRate = 0;
          const rank = computeCreatorRankAndValuation({ subscribers, monthlyViews, engagementRate });
          creators.push({
            id: `fb_${name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 48)}`,
            stageName: name.slice(0, 100),
            category: 'Entertainment',
            city: 'Douala',
            country: 'CM',
            entityType: 'solo',
            facebookPage: item.url,
            subscribers,
            monthlyViews,
            engagementRate,
            ...rank,
          });
        }
      }
    } else {
      // Website crawler: pages give titles only, so no reach or engagement is assumed.
      const urlToCrawl = options?.startUrl?.trim() || 'https://www.237showbiz.com';
      const crawlerResp = await fetch(
        `https://api.apify.com/v2/acts/${toApifySlug(targetActor)}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken!)}&timeout=40`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startUrls: [{ url: urlToCrawl }],
            maxCrawlPages: 5,
            maxCrawlDepth: 1,
          }),
        }
      );
      if (crawlerResp.ok) {
        const pages = (await crawlerResp.json()) as Array<{
          url?: string;
          metadata?: { title?: string };
          text?: string;
        }>;
        pages.slice(0, 6).forEach((p, idx) => {
          const title = (p.metadata?.title || '').split('|')[0]?.trim();
          if (!title) return;
          const rank = computeCreatorRankAndValuation({ subscribers: 0, monthlyViews: 0, engagementRate: 0 });
          creators.push({
            id: `web_${Date.now()}_${idx}`,
            stageName: title.slice(0, 80),
            category: 'Entertainment',
            city: 'Douala',
            country: 'CM',
            entityType: 'solo',
            facebookPage: p.url,
            subscribers: 0,
            monthlyViews: 0,
            engagementRate: 0,
            ...rank,
          });
        });
      }
    }
  }

  creators.sort((a, b) => b.rankScore - a.rankScore);
  return { creators, missingKeys, actorUsed };
}