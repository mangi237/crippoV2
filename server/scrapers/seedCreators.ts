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
  avatarUrl?: string;
  subscribers: number;
  monthlyViews: number;
  engagementRate: number;
}

export type SupportedSeedActor =
  | 'auto'
  | 'apify/website-content-crawler'
  | 'apify/playwright-scraper'
  | 'apidojo/youtube-scraper'
  | 'apidojo/tiktok-scraper'
  | 'apify/facebook-search-scraper';

function toApifySlug(actor: string): string {
  return actor.replace('/', '~');
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

  const missingKeys: string[] = [];
  if (!youtubeKey) missingKeys.push('YOUTUBE_API_KEY');
  if (!apifyToken) missingKeys.push('APIFY_API_TOKEN');

  const creators: RealCreatorSeed[] = [];
  let actorUsed = 'none';

  // 1. Direct YouTube Data API v3 when configured and actor is auto
  if (youtubeKey && (selectedActor === 'auto' || selectedActor === 'apidojo/youtube-scraper')) {
    const q = searchQuery.trim() || 'Cameroon music artist OR 237 comedy';
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=10&q=${encodeURIComponent(q)}&key=${encodeURIComponent(youtubeKey)}`;
    const searchResp = await fetch(searchUrl);

    if (searchResp.ok) {
      actorUsed = 'youtube-data-api-v3';
      const searchData = (await searchResp.json()) as {
        items?: Array<{ id?: { channelId?: string } }>;
      };

      const channelIds = (searchData.items || [])
        .map((i) => i.id?.channelId)
        .filter((id): id is string => Boolean(id));

      if (channelIds.length > 0) {
        const statsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(channelIds.join(','))}&key=${encodeURIComponent(youtubeKey)}`;
        const statsResp = await fetch(statsUrl);
        if (statsResp.ok) {
          const statsData = (await statsResp.json()) as {
            items?: Array<{
              id: string;
              snippet?: {
                title?: string;
                country?: string;
                thumbnails?: { high?: { url?: string }; default?: { url?: string } };
              };
              statistics?: {
                subscriberCount?: string;
                viewCount?: string;
                videoCount?: string;
              };
            }>;
          };

          for (const ch of statsData.items || []) {
            const subs = Number(ch.statistics?.subscriberCount || 0);
            const totalViews = Number(ch.statistics?.viewCount || 0);
            const videos = Math.max(1, Number(ch.statistics?.videoCount || 1));
            const avgViewsPerVideo = Math.round(totalViews / videos);

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
              monthlyViews: Math.round(avgViewsPerVideo * 2),
              engagementRate:
                subs > 0 ? Number(Math.min(18, Math.max(1.5, (avgViewsPerVideo / subs) * 10)).toFixed(1)) : 3.2,
            });
          }
        }
      }
    }
  }

  // 2. Apify Actors (explicitly chosen or fallback when token exists)
  if (apifyToken && (selectedActor !== 'auto' || creators.length === 0)) {
    const targetActor =
      selectedActor === 'auto' ? 'apify/website-content-crawler' : selectedActor;
    actorUsed = targetActor;

    if (targetActor === 'apidojo/tiktok-scraper') {
      const ttResp = await fetch(
        `https://api.apify.com/v2/acts/${toApifySlug(targetActor)}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}&timeout=35`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keywords: [searchQuery.trim() || '237 cameroon music'],
            maxItems: 10,
          }),
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
            monthlyViews: plays * 4,
            engagementRate: plays > 0 ? Number(Math.min(25, (likes / plays) * 100).toFixed(1)) : 4.5,
          });
        }
      }
    } else if (targetActor === 'apidojo/youtube-scraper') {
      const ytApifyResp = await fetch(
        `https://api.apify.com/v2/acts/${toApifySlug(targetActor)}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}&timeout=35`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            searchQueries: [searchQuery.trim() || 'Cameroon afrobeats'],
            maxResults: 10,
          }),
        }
      );
      if (ytApifyResp.ok) {
        const items = (await ytApifyResp.json()) as Array<{
          channelName?: string;
          channelUrl?: string;
          channelId?: string;
          numberOfSubscribers?: number;
          viewCount?: number;
          thumbnailUrl?: string;
        }>;
        const seen = new Set<string>();
        for (const item of items) {
          const name = item.channelName;
          if (!name || seen.has(name)) continue;
          seen.add(name);
          const chId = item.channelId || name.toLowerCase().replace(/[^a-z0-9]/g, '');
          creators.push({
            id: `yt_${chId.slice(0, 60)}`,
            stageName: name.slice(0, 100),
            category: 'Music & Video',
            city: 'Douala',
            country: 'CM',
            entityType: 'solo',
            youtubeChannelId: item.channelId || item.channelUrl,
            avatarUrl: item.thumbnailUrl,
            subscribers: Number(item.numberOfSubscribers || 0),
            monthlyViews: Number(item.viewCount || 0),
            engagementRate: 4.8,
          });
        }
      }
    } else if (targetActor === 'apify/facebook-search-scraper') {
      const fbResp = await fetch(
        `https://api.apify.com/v2/acts/${toApifySlug(targetActor)}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}&timeout=35`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queries: [searchQuery.trim() || '237 Cameroon music artist'],
            resultsLimit: 8,
          }),
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
          creators.push({
            id: `fb_${name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 48)}`,
            stageName: name.slice(0, 100),
            category: 'Entertainment',
            city: 'Douala',
            country: 'CM',
            entityType: 'solo',
            facebookPage: item.url,
            subscribers: Number(item.followers || item.likes || 0),
            monthlyViews: Number(item.likes || 0) * 5,
            engagementRate: 3.9,
          });
        }
      }
    } else {
      // Platform-usage-only web crawlers: apify/website-content-crawler or apify/playwright-scraper
      const urlToCrawl = options?.startUrl?.trim() || 'https://www.237showbiz.com';
      const crawlerResp = await fetch(
        `https://api.apify.com/v2/acts/${toApifySlug(targetActor)}/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}&timeout=40`,
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
            engagementRate: 3.5,
          });
        });
      }
    }
  }

  return { creators, missingKeys, actorUsed };
}
