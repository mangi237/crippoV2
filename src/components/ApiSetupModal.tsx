import React, { useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import type { IntegrationStatus } from '../types/crippo';

interface ApiSetupModalProps {
  onClose: () => void;
}

export function ApiSetupModal({ onClose }: ApiSetupModalProps) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);

  useEffect(() => {
    apiFetch<IntegrationStatus>('/api/integrations/status')
      .then(setStatus)
      .catch(() => null);
  }, []);

  const items = [
    {
      name: 'Fapshi Payments (MTN MoMo & Orange XAF Sandbox)',
      ready: Boolean(status?.fapshiConfigured || status?.campayConfigured),
      envVars: 'FAPSHI_API_USER, FAPSHI_API_KEY, FAPSHI_ENV=sandbox',
      note: 'Configured with Initiate Pay (hosted checkout session) in Sandbox environment.',
    },
    {
      name: 'Apify Web & Social Crawlers',
      ready: Boolean(status?.apifyConfigured),
      envVars: 'APIFY_API_TOKEN',
      note: 'Free platform-usage crawlers: apify/website-content-crawler & apify/playwright-scraper. Optional pay-per-result actors: apidojo/tiktok-scraper, apidojo/youtube-scraper, apify/facebook-search-scraper, apify/facebook-reels-scraper.',
    },
    {
      name: 'YouTube Data API v3',
      ready: Boolean(status?.youtubeConfigured),
      envVars: 'YOUTUBE_API_KEY',
      note: 'Audits subscriber velocity, lifetime views, and recent uploads for Race underwriting and Cultural Pulse.',
    },
    {
      name: 'Spotify Web API',
      ready: Boolean(status?.spotifyConfigured),
      envVars: 'SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET',
      note: 'Verifies catalog monthly listeners & ISRC audio releases on Creator Wikipedia Dossiers.',
    },
    {
      name: 'AI Underwriter & Cultural Pulse Engine',
      ready: Boolean(status?.geminiConfigured),
      envVars: 'GEMINI_API_KEY',
      note: 'Configured via AI Studio Secrets. Powers Crippo Score (0-100), Pidgin/Camfranglais sentiment analysis, and Memo audits.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-surface-container-lowest dark:border dark:border-outline-variant rounded-2xl shadow-2xl p-6 max-h-[88vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">checklist</span>
            <div>
              <h2 className="font-headline-sm text-on-surface">API &amp; Integration Readiness</h2>
              <p className="font-body-sm text-on-surface-variant">
                Server-side environment keys configured via AI Studio Secrets (.env)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.name} className="p-4 rounded-xl bg-surface-container-low space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined text-[20px] ${
                      item.ready ? 'text-on-tertiary-container' : 'text-error'
                    }`}
                  >
                    {item.ready ? 'check_circle' : 'pending'}
                  </span>
                  <span className="font-label-md text-on-surface font-bold">{item.name}</span>
                </div>
                <span
                  className={`font-label-xs px-2 py-0.5 rounded-full uppercase ${
                    item.ready
                      ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                      : 'bg-error-container text-on-error-container'
                  }`}
                >
                  {item.ready ? 'READY' : 'NEEDS KEY'}
                </span>
              </div>
              <p className="font-body-sm text-on-surface-variant">{item.note}</p>
              <code className="block p-2 rounded bg-surface-container-lowest text-secondary font-mono-num text-[11px] break-all">
                {item.envVars}
              </code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
