import express from 'express';
import path from 'path';
import fs from 'fs';
import bundledFirebaseConfig from '../firebase-applet-config.json';
import { requireAuth, type AuthenticatedRequest } from './lib/auth';
import {
  isFapshiConfigured,
  initiateFapshiPay,
  checkFapshiStatus,
  initiateFapshiPayout,
  verifyFapshiWebhookSecret,
} from './payments/fapshi';
import { underwriteRace, UnderwriteValidationError } from './agents/underwriterAgent';
import { runCulturalPulsePipeline } from './agents/culturalPulseAgent';
import { auditCreatorMemo } from './agents/memoAuditAgent';
import { generateTrendProbabilities } from './agents/trendProbabilityAgent';
import { runComplianceWatchdog } from './agents/complianceWatchdogAgent';
import { runDividendClearing } from './agents/dividendClearingAgent';
import { analyzeNewsMarketImpact } from './agents/newsImpactAgent';
import { fetchRealCreatorsFromAPIs } from './scrapers/seedCreators';

export function createApiApp(): express.Express {
  const app = express();

  // Capture raw body for webhook verification
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf-8');
      },
    })
  );

  // Public Integration Readiness Status (booleans only, never exposes secrets)
  app.get('/api/integrations/status', (_req, res) => {
    const firebaseConfigured =
      fs.existsSync(path.resolve(process.cwd(), 'firebase-applet-config.json')) ||
      Boolean((bundledFirebaseConfig as { projectId?: string })?.projectId);
    const geminiConfigured = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    );
    const fapshiConfigured = isFapshiConfigured();
    const fapshiEnv = (process.env.FAPSHI_ENV || 'sandbox').toLowerCase();
    const youtubeConfigured = Boolean(process.env.YOUTUBE_API_KEY);
    const apifyConfigured = Boolean(process.env.APIFY_API_TOKEN);
    const spotifyConfigured = Boolean(
      (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) ||
        process.env.APIFY_API_TOKEN
    );

    res.json({
      firebaseConfigured,
      geminiConfigured,
      fapshiConfigured,
      fapshiEnv,
      youtubeConfigured,
      apifyConfigured,
      spotifyConfigured,
    });
  });

  // AI Underwriter Agent (Protected)
  app.post('/api/agents/underwrite', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body;
      if (!body || typeof body.title !== 'string' || typeof body.netBudgetXAF !== 'number') {
        res.status(400).json({ error: 'Invalid race underwriting payload.' });
        return;
      }

      const result = await underwriteRace({
        raceId: String(body.raceId || ''),
        creatorName: String(body.creatorName || ''),
        title: String(body.title || ''),
        category: String(body.category || ''),
        monitorableSources: Array.isArray(body.monitorableSources) ? body.monitorableSources : [],
        netBudgetXAF: Number(body.netBudgetXAF),
        revSharePct: Number(body.revSharePct),
        roiDurationMonths: Number(body.roiDurationMonths),
        productionDeadline: String(body.productionDeadline || ''),
        subscribers: Number(body.subscribers || 0),
        monthlyViews: Number(body.monthlyViews || 0),
        engagementRate: Number(body.engagementRate || 0),
        entityType: body.entityType === 'agency' ? 'agency' : 'solo',
        masterRightsOwned: Boolean(body.masterRightsOwned),
        distributor: String(body.distributor || 'DistroKid'),
        listenerRegion:
          body.listenerRegion === 'diaspora_mixed' || body.listenerRegion === 'global_eu_us'
            ? body.listenerRegion
            : 'cameroon_africa',
        wikiGrade: typeof body.wikiGrade === 'string' ? body.wikiGrade : undefined,
      });

      res.json(result);
    } catch (err) {
      const status = err instanceof UnderwriteValidationError ? err.statusCode : 500;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Underwriting failed.',
      });
    }
  });

  // Cultural Pulse Agent (Protected)
  let cachedPulse: { catalysts: unknown[]; actorUsed?: string; cachedAt: number } | null = null;
  app.post('/api/agents/cultural-pulse', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const forceRefresh = Boolean(req.body?.forceRefresh);
      if (!forceRefresh && cachedPulse && Date.now() - cachedPulse.cachedAt < 10 * 60 * 1000) {
        res.json({
          catalysts: cachedPulse.catalysts,
          missingKeys: [],
          actorUsed: cachedPulse.actorUsed,
          cached: true,
        });
        return;
      }

      const entityNames = Array.isArray(req.body?.entityNames)
        ? req.body.entityNames.map((n: unknown) => String(n)).slice(0, 20)
        : [];
      const actor = typeof req.body?.actor === 'string' ? req.body.actor : undefined;
      const targetUrls = Array.isArray(req.body?.targetUrls)
        ? req.body.targetUrls.map((u: unknown) => String(u)).slice(0, 5)
        : undefined;
      const result = await runCulturalPulsePipeline(entityNames, {
        actor: actor as never,
        targetUrls,
      });
      if (result.catalysts.length === 0 && result.missingKeys.length > 0) {
        res.status(424).json({
          error: 'Social media & news data APIs are not configured yet.',
          missingKeys: result.missingKeys,
        });
        return;
      }
      if (result.catalysts.length > 0) {
        cachedPulse = {
          catalysts: result.catalysts,
          actorUsed: result.actorUsed,
          cachedAt: Date.now(),
        };
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Cultural Pulse pipeline failed.',
      });
    }
  });

  // AI News Tagging & Live Market Impact Agent (Protected)
  app.post('/api/agents/news-impact', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body || {};
      if (!body.entityName || !body.headline) {
        res.status(400).json({ error: 'entityName and headline are required.' });
        return;
      }
      const result = await analyzeNewsMarketImpact({
        entityName: String(body.entityName),
        entityCategory: body.entityCategory ? String(body.entityCategory) : undefined,
        entityCity: body.entityCity ? String(body.entityCity) : undefined,
        entityBio: body.entityBio ? String(body.entityBio) : undefined,
        entityGenres: Array.isArray(body.entityGenres) ? body.entityGenres.map(String) : undefined,
        subscribers: typeof body.subscribers === 'number' ? body.subscribers : undefined,
        headline: String(body.headline),
        summary: String(body.summary || body.headline),
        segment: String(body.segment || 'Trending'),
        sourceName: body.sourceName ? String(body.sourceName) : undefined,
        activeRaises: Array.isArray(body.activeRaises) ? body.activeRaises : undefined,
        activePredictions: Array.isArray(body.activePredictions) ? body.activePredictions.map(String) : undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'News impact analysis failed.',
      });
    }
  });

  // Paid Memo Listing AI Audit (Protected)
  app.post('/api/agents/memo-audit', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { stageName, platformLink, tier } = req.body || {};
      if (!stageName || !platformLink) {
        res.status(400).json({ error: 'stageName and platformLink are required.' });
        return;
      }
      const result = await auditCreatorMemo({
        stageName: String(stageName),
        platformLink: String(platformLink),
        tier: tier === 'fast_track_5000' ? 'fast_track_5000' : 'fan_2000',
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Memo audit failed.',
      });
    }
  });

  // Trend Probability & Vote-Unit Generator Agent (Protected)
  app.post('/api/agents/trend-probabilities', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const entityNames = Array.isArray(req.body?.entityNames)
        ? req.body.entityNames.map((n: unknown) => String(n)).slice(0, 15)
        : [];
      const recentHeadlines = Array.isArray(req.body?.recentHeadlines)
        ? req.body.recentHeadlines.map((h: unknown) => String(h)).slice(0, 12)
        : [];
      const count = Number(req.body?.count || 3);
      const result = await generateTrendProbabilities({ entityNames, recentHeadlines, count });
      if (result.predictions.length === 0 && result.missingKeys.length === 2) {
        res.status(424).json({
          error: 'Configure YOUTUBE_API_KEY or APIFY_API_TOKEN or seed cultural headlines first.',
          missingKeys: result.missingKeys,
        });
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Trend probability generation failed.',
      });
    }
  });

  // Royalty Compliance Watchdog Agent (Protected)
  app.post('/api/agents/compliance-watchdog', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body || {};
      if (!body.raceId || !body.trackTitle || !body.creatorName) {
        res.status(400).json({ error: 'raceId, creatorName, and trackTitle are required.' });
        return;
      }
      const result = await runComplianceWatchdog({
        raceId: String(body.raceId),
        creatorName: String(body.creatorName),
        trackTitle: String(body.trackTitle),
        distributor: String(body.distributor || 'DistroKid'),
        clearingEmail: String(body.clearingEmail || ''),
        revSharePct: Number(body.revSharePct || 0),
        isrcCode: body.isrcCode ? String(body.isrcCode) : undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Compliance watchdog check failed.',
      });
    }
  });

  // Automated Dividend Clearing Agent (Protected)
  app.post('/api/agents/dividend-clearing', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body || {};
      if (!body.raceId || !body.raceTitle || typeof body.grossRevenueAmount !== 'number') {
        res.status(400).json({ error: 'raceId, raceTitle, and grossRevenueAmount are required.' });
        return;
      }
      const result = await runDividendClearing({
        raceId: String(body.raceId),
        raceTitle: String(body.raceTitle),
        periodLabel: String(body.periodLabel || 'Current Period'),
        grossRevenueAmount: Number(body.grossRevenueAmount),
        currency: body.currency === 'USD' || body.currency === 'EUR' ? body.currency : 'XAF',
        revSharePct: Number(body.revSharePct || 25),
        totalShares: Number(body.totalShares || 1),
        holders: Array.isArray(body.holders) ? body.holders : [],
        dispatchPayout: Boolean(body.dispatchPayout ?? body.dispatchCamPay),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Dividend clearing calculation failed.',
      });
    }
  });

  // Real Creator Seeder via YouTube Data API v3 + Apify Actors (Protected)
  app.post('/api/scrapers/seed-creators', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const query = String(req.body?.query || 'Cameroon music artist');
      const actor = typeof req.body?.actor === 'string' ? req.body.actor : 'auto';
      const startUrl = typeof req.body?.startUrl === 'string' ? req.body.startUrl : undefined;
      const result = await fetchRealCreatorsFromAPIs(query, {
        actor: actor as never,
        startUrl,
      });
      if (result.creators.length === 0 && result.missingKeys.length >= 2) {
        res.status(424).json({
          error: 'Configure APIFY_API_TOKEN or YOUTUBE_API_KEY to fetch real creators.',
          missingKeys: result.missingKeys,
        });
        return;
      }
      res.json({
        ...result,
        entities: result.creators,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to fetch real creators.',
      });
    }
  });

  // Dynamic Share Repricing & Creator Rank Calculator (Protected)
  app.post('/api/agents/reprice-market', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const unitSharePriceXAF = Math.max(100, Number(req.body?.unitSharePriceXAF || 5000));
      const sharesSold = Math.max(0, Number(req.body?.sharesSold || 0));
      const totalShares = Math.max(1, Number(req.body?.totalShares || 100));
      const catalystImpacts = Array.isArray(req.body?.catalystImpacts)
        ? req.body.catalystImpacts.map((n: unknown) => Number(n) || 0)
        : [];
      const netMomentumPct = catalystImpacts.reduce((acc: number, v: number) => acc + v, 0);
      const demandRatio = Math.min(1, sharesSold / totalShares);
      const demandBoostPct = demandRatio * 12; // up to +12% from active raise demand
      const boundedShiftPct = Math.max(-35, Math.min(50, netMomentumPct * 0.4 + demandBoostPct));
      const nextSharePriceXAF = Math.max(
        500,
        Math.round((unitSharePriceXAF * (1 + boundedShiftPct / 100)) / 50) * 50
      );

      res.json({
        unitSharePriceXAF,
        nextSharePriceXAF,
        netMomentumPct: Number(netMomentumPct.toFixed(1)),
        demandBoostPct: Number(demandBoostPct.toFixed(1)),
        appliedShiftPct: Number(boundedShiftPct.toFixed(1)),
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Market repricing calculation failed.',
      });
    }
  });

  // Fapshi Mobile Money & Card Payment Link / Collect (Protected)
  // Handles both /api/payments/fapshi/collect and legacy /api/payments/campay/collect
  app.post(
    ['/api/payments/fapshi/collect', '/api/payments/campay/collect', '/api/payments/fapshi/payment-link', '/api/payments/campay/payment-link'],
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { amountXAF, phone, description, externalReference, email, redirectUrl } = req.body || {};
        const amount = Number(amountXAF);
        const cleanPhone = String(phone || '').replace(/\D/g, '');

        if (!Number.isFinite(amount) || amount < 100) {
          res.status(400).json({ error: 'Minimum transaction amount is 100 XAF.' });
          return;
        }

        const fallbackOrigin = process.env.APP_URL || 'https://crippomarket.vercel.app';
        let safeRedirect = fallbackOrigin;
        if (typeof redirectUrl === 'string' && redirectUrl.trim()) {
          try {
            const parsed = new URL(redirectUrl.trim());
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
              safeRedirect = parsed.toString();
            }
          } catch {
            safeRedirect = fallbackOrigin;
          }
        }

        const result = await initiateFapshiPay({
          amount,
          email: typeof email === 'string' && email.trim() ? email.trim() : req.firebaseUser?.email,
          userId: req.firebaseUser?.uid,
          externalId: String(externalReference || `crippo_${Date.now()}`),
          redirectUrl: safeRedirect,
          message: String(description || 'Crippo Order'),
        });

        res.json({
          reference: result.transId,
          transId: result.transId,
          link: result.link,
          status: 'CREATED',
        });
      } catch (err) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'Fapshi payment collection request failed.',
        });
      }
    }
  );

  // Fapshi Transaction Status Polling (Protected)
  // Supports both /api/payments/fapshi/status/:reference and /api/payments/campay/status/:reference
  app.get(
    ['/api/payments/fapshi/status/:reference', '/api/payments/campay/status/:reference'],
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      try {
        const reference = String(req.params.reference || '');
        if (!reference) {
          res.status(400).json({ error: 'Transaction reference is required.' });
          return;
        }
        const status = await checkFapshiStatus(reference);
        res.json(status);
      } catch (err) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'Payment status check failed.',
        });
      }
    }
  );

  // Fapshi Disbursement / Payout (Protected)
  app.post(
    ['/api/payments/fapshi/withdraw', '/api/payments/campay/withdraw'],
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { amountXAF, phone, description, externalReference } = req.body || {};
        const amount = Number(amountXAF);
        const cleanPhone = String(phone || '').replace(/\D/g, '');
        if (!Number.isFinite(amount) || amount < 100) {
          res.status(400).json({ error: 'Invalid disbursement amount.' });
          return;
        }
        if (!/^2376[0-9]{8}$/.test(cleanPhone)) {
          res.status(400).json({ error: 'Valid recipient phone required (2376XXXXXXXX).' });
          return;
        }
        const result = await initiateFapshiPayout({
          amount,
          phone: cleanPhone,
          message: String(description || 'Crippo Royalty Payout'),
          externalId: String(externalReference || `payout_${Date.now()}`),
        });
        res.json(result);
      } catch (err) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'Fapshi disbursement failed.',
        });
      }
    }
  );

  // Fapshi Webhook Receiver
  app.post(['/api/payments/fapshi/webhook', '/api/payments/campay/webhook'], (req, res) => {
    const sigHeader = req.header('x-wh-secret');
    const configuredSecret = process.env.FAPSHI_WEBHOOK_SECRET;

    if (configuredSecret && !verifyFapshiWebhookSecret(sigHeader)) {
      res.status(401).json({ error: 'Invalid webhook secret.' });
      return;
    }

    res.status(200).json({ received: true, reference: req.body?.transId || null });
  });

  return app;
}
