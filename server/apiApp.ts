import express from 'express';
import path from 'path';
import fs from 'fs';
import bundledFirebaseConfig from '../firebase-applet-config.json';
import { requireAuth, type AuthenticatedRequest } from './lib/auth';
import {
  isCamPayConfigured,
  initiateCamPayCollect,
  checkCamPayStatus,
  initiateCamPayWithdraw,
  verifyCamPayWebhookSignature,
} from './payments/campay';
import { underwriteRace } from './agents/underwriterAgent';
import { runCulturalPulsePipeline } from './agents/culturalPulseAgent';
import { auditCreatorMemo } from './agents/memoAuditAgent';
import { generateTrendProbabilities } from './agents/trendProbabilityAgent';
import { runComplianceWatchdog } from './agents/complianceWatchdogAgent';
import { runDividendClearing } from './agents/dividendClearingAgent';
import { fetchRealCreatorsFromAPIs } from './scrapers/seedCreators';

export function createApiApp(): express.Express {
  const app = express();

  // Capture raw body for CamPay webhook signature verification
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
    const campayConfigured = isCamPayConfigured();
    const youtubeConfigured = Boolean(process.env.YOUTUBE_API_KEY);
    const apifyConfigured = Boolean(process.env.APIFY_API_TOKEN);
    const spotifyConfigured = Boolean(
      process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
    );

    res.json({
      firebaseConfigured,
      geminiConfigured,
      campayConfigured,
      campayEnv: process.env.CAMPAY_ENV || 'demo',
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
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Underwriting failed.',
      });
    }
  });

  // Unified Cultural Pulse & Disadvantage Agent (Protected)
  app.post('/api/agents/cultural-pulse', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
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
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Cultural Pulse pipeline failed.',
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

  // Automated Dividend Clearing & CamPay Withdrawal Agent (Protected)
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
        dispatchCamPay: Boolean(body.dispatchCamPay),
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
      if (result.creators.length === 0 && result.missingKeys.length === 2) {
        res.status(424).json({
          error: 'Configure YOUTUBE_API_KEY or APIFY_API_TOKEN to fetch real creators.',
          missingKeys: result.missingKeys,
        });
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to fetch real creators.',
      });
    }
  });

  // CamPay Mobile Money Collection (USSD Push) (Protected)
  app.post('/api/payments/campay/collect', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isCamPayConfigured()) {
        res.status(424).json({
          error: 'CamPay Mobile Money credentials are not configured on the server.',
          missingKeys: ['CAMPAY_APP_USERNAME', 'CAMPAY_APP_PASSWORD'],
        });
        return;
      }

      const { amountXAF, phone, description, externalReference } = req.body || {};
      const amount = Number(amountXAF);
      const cleanPhone = String(phone || '').replace(/\D/g, '');

      if (!Number.isFinite(amount) || amount < 100) {
        res.status(400).json({ error: 'Minimum transaction amount is 100 XAF.' });
        return;
      }
      if (!/^2376[0-9]{8}$/.test(cleanPhone)) {
        res.status(400).json({ error: 'Valid Cameroon Mobile Money number required (2376XXXXXXXX).' });
        return;
      }

      const result = await initiateCamPayCollect({
        amountXAF: amount,
        phone: cleanPhone,
        description: String(description || 'Crippo XAF Order'),
        externalReference: String(externalReference || `crippo_${Date.now()}`),
      });

      res.json(result);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'CamPay collection request failed.',
      });
    }
  });

  // CamPay Transaction Status Polling (Protected)
  app.get('/api/payments/campay/status/:reference', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isCamPayConfigured()) {
        res.status(424).json({
          error: 'CamPay Mobile Money credentials are not configured on the server.',
          missingKeys: ['CAMPAY_APP_USERNAME', 'CAMPAY_APP_PASSWORD'],
        });
        return;
      }
      const reference = String(req.params.reference || '');
      if (!reference) {
        res.status(400).json({ error: 'Transaction reference is required.' });
        return;
      }
      const status = await checkCamPayStatus(reference);
      res.json(status);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'CamPay status check failed.',
      });
    }
  });

  // CamPay Disbursement / Payout (Protected)
  app.post('/api/payments/campay/withdraw', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!isCamPayConfigured()) {
        res.status(424).json({
          error: 'CamPay Mobile Money credentials are not configured on the server.',
          missingKeys: ['CAMPAY_APP_USERNAME', 'CAMPAY_APP_PASSWORD'],
        });
        return;
      }
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
      const result = await initiateCamPayWithdraw({
        amountXAF: amount,
        phone: cleanPhone,
        description: String(description || 'Crippo Royalty Payout'),
        externalReference: String(externalReference || `payout_${Date.now()}`),
      });
      res.json(result);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'CamPay disbursement failed.',
      });
    }
  });

  // CamPay Webhook Receiver
  app.post('/api/payments/campay/webhook', (req, res) => {
    const rawBody = (req as express.Request & { rawBody?: string }).rawBody || JSON.stringify(req.body || {});
    const sigHeader = req.header('X-CamPay-Signature') || req.header('x-campay-signature');

    if (process.env.CAMPAY_WEBHOOK_KEY && !verifyCamPayWebhookSignature(rawBody, sigHeader)) {
      res.status(401).json({ error: 'Invalid CamPay webhook signature.' });
      return;
    }

    res.status(200).json({ received: true, reference: req.body?.reference || null });
  });

  return app;
}
