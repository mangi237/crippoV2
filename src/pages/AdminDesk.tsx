import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import type { Race, Entity, CatalystSegment, PredictionMarket } from '../types/crippo';

const APIFY_ACTORS = [
  { id: 'auto', label: 'Auto Multi-Platform Hub (Spotify + Google News + TikTok + FB)' },
  { id: 'automation-lab/spotify-scraper', label: 'Spotify Artist & Stream Scraper' },
  { id: 'clockworks/tiktok-profile-scraper', label: 'TikTok Profile & Velocity Scraper' },
  { id: 'apify/instagram-scraper', label: 'Instagram Profile & Hashtag Scraper' },
  { id: 'apify/facebook-posts-scraper', label: 'Facebook Posts Scraper' },
  { id: 'apify/facebook-pages-scraper', label: 'Facebook Pages Ranking Scraper' },
  { id: 'apify/facebook-comments-scraper', label: 'Facebook Comments Sentiment Scraper' },
  { id: 'apify/facebook-likes-scraper', label: 'Facebook Likes Velocity Scraper' },
  { id: 'apify/google-search-scraper', label: 'Google Search & Press News Scraper' },
  { id: 'apify/website-content-crawler', label: 'Website Content Crawler' },
  { id: 'apidojo/youtube-scraper', label: 'YouTube Channel & Video Scraper' },
];

interface AdminDeskProps {
  onOpenApiSetup: () => void;
}

export function AdminDesk({ onOpenApiSetup }: AdminDeskProps) {
  const { user } = useAuth();
  const {
    races,
    entities,
    catalysts,
    myMemos,
    myPayments,
    publicOrders,
    integrationStatus,
    isAdmin,
    showToast,
  } = useMarket();

  const [adminTab, setAdminTab] = useState<'queue' | 'clearing' | 'entities' | 'scrapers' | 'ledger'>('queue');

  // Counter-Terms Modal State (React UI, zero window.prompt)
  const [counterRace, setCounterRace] = useState<Race | null>(null);
  const [counterBudget, setCounterBudget] = useState(1000000);
  const [counterNote, setCounterNote] = useState('');
  const [busyId, setBusyId] = useState('');

  // Royalty Clearing & AI Agent Telemetry State
  const [selectedRaceId, setSelectedRaceId] = useState('');
  const [isrcInput, setIsrcInput] = useState('');
  const [clearingPoolAmount, setClearingPoolAmount] = useState(500000);
  const [clearingCurrency, setClearingCurrency] = useState<'XAF' | 'USD' | 'EUR'>('XAF');
  const [periodLabel, setPeriodLabel] = useState('Q4 2026 Streaming');
  const [clearingBusy, setClearingBusy] = useState(false);
  const [watchdogResult, setWatchdogResult] = useState<{
    clearedForTranche2: boolean;
    splitMatchVerified: boolean;
    antiOmissionStatus: string;
    riskFlags: string[];
    auditSummary: string;
    checkedApis: string[];
  } | null>(null);

  // Wikipedia Entity CRUD State
  const [entStageName, setEntStageName] = useState('');
  const [entLegalName, setEntLegalName] = useState('');
  const [entCategory, setEntCategory] = useState('Music');
  const [entCity, setEntCity] = useState('Douala');
  const [entGrade, setEntGrade] = useState('A-Index');
  const [entNiu, setEntNiu] = useState('');
  const [entSubscribers, setEntSubscribers] = useState(50000);
  const [entBusy, setEntBusy] = useState(false);

  // Apify & Cultural Scraper State
  const [scraperActor, setScraperActor] = useState(APIFY_ACTORS[0].id);
  const [scraperQuery, setScraperQuery] = useState('Cameroon Afropop creator');
  const [scraperUrl, setScraperUrl] = useState('');
  const [scraperBusy, setScraperBusy] = useState(false);

  const pendingRaces = useMemo(
    () => races.filter((r) => r.status === 'auditing' || r.status === 'awaiting_creator_acceptance'),
    [races]
  );
  const pendingKycEntities = useMemo(
    () => entities.filter((e) => e.kycStatus === 'pending' && e.isClaimed),
    [entities]
  );
  const paidMemos = useMemo(
    () => myMemos.filter((m) => m.status !== 'pending_payment' && m.paymentCompleted !== false),
    [myMemos]
  );
  const pendingMemos = useMemo(
    () => paidMemos.filter((m) => m.status === 'auditing'),
    [paidMemos]
  );
  const volatilityAlerts = useMemo(
    () => catalysts.filter((c) => c.sentiment === 'risk_alert' || Math.abs(c.priceImpactPct) >= 10),
    [catalysts]
  );
  const totalEscrowReserveXAF = useMemo(
    () =>
      myPayments
        .filter((p) => p.status === 'SUCCESSFUL')
        .reduce((a, p) => a + p.amountXAF, 0),
    [myPayments]
  );

  const clearingRace = useMemo(
    () => races.find((r) => r.id === selectedRaceId) || races.find((r) => r.status !== 'rejected') || null,
    [races, selectedRaceId]
  );

  // Compute net shareholder map for clearingRace
  const shareholders = useMemo(() => {
    if (!clearingRace) return [];
    const map = new Map<string, { uid: string; anonId: string; shares: number }>();
    for (const o of publicOrders) {
      if (o.raceId !== clearingRace.id || o.status !== 'settled') continue;
      const cur = map.get(o.buyerUid) || {
        uid: o.buyerUid,
        anonId: o.anonymousId,
        shares: 0,
      };
      cur.shares += o.side === 'BUY' ? o.shares : -o.shares;
      map.set(o.buyerUid, cur);
    }
    return Array.from(map.values()).filter((s) => s.shares > 0);
  }, [clearingRace, publicOrders]);

  if (!isAdmin) {
    return (
      <div className="py-12 max-w-2xl mx-auto flex flex-col gap-4 text-center">
        <div className="w-12 h-12 rounded-lg bg-black text-white mx-auto flex items-center justify-center">
          <span className="material-symbols-outlined text-[26px]">admin_panel_settings</span>
        </div>
        <h1 className="font-headline-sm text-on-surface font-bold">Master Admin Underwriting Desk</h1>
        <p className="font-body-md text-on-surface-variant">
          Restricted to verified Crippo Clearing Administrators (
          <span className="font-mono-num">mangilerinelasliejr@gmail.com</span>). Currently signed in as{' '}
          <strong className="text-on-surface">{user?.email || 'Guest'}</strong>.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            to="/auth?skipSplash=1&mode=login&returnTo=%2Fadmin"
            className="px-5 py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
          >
            Sign In as Admin
          </Link>
          <Link
            to="/"
            className="px-5 py-2.5 rounded-xl border border-outline-variant/50 text-on-surface font-label-md font-bold hover:border-secondary"
          >
            Return to Markets
          </Link>
        </div>
      </div>
    );
  }

  const sendNotification = async (payload: {
    recipientUid: string;
    type:
      | 'kyc_approved'
      | 'kyc_rejected'
      | 'raise_offer'
      | 'raise_rejected'
      | 'memo_status'
      | 'dividend';
    title: string;
    message: string;
    raceId?: string;
    entityId?: string;
    offerSummary?: {
      totalShares: number;
      unitSharePriceXAF: number;
      grossTargetXAF: number;
      revSharePct: number;
      pctPerShare: number;
      projectedRevenueXAF: number;
      regionalNote?: string;
    };
  }) => {
    const notifId = `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await setDoc(doc(db, 'notifications', notifId), {
      id: notifId,
      recipientUid: payload.recipientUid,
      type: payload.type,
      title: payload.title.slice(0, 140),
      message: payload.message.slice(0, 600),
      ...(payload.raceId ? { raceId: payload.raceId } : {}),
      ...(payload.entityId ? { entityId: payload.entityId } : {}),
      ...(payload.offerSummary ? { offerSummary: payload.offerSummary } : {}),
      read: false,
      createdAt: serverTimestamp(),
    });
  };

  const handleApproveRace = async (r: Race, directOpen = false) => {
    setBusyId(r.id);
    const pctPerShare =
      r.pctPerShare ?? Number((r.revSharePct / Math.max(1, r.totalShares)).toFixed(4));
    const nextStatus = directOpen ? 'open' : 'awaiting_creator_acceptance';
    try {
      await updateDoc(doc(db, 'races', r.id), {
        status: nextStatus,
        pctPerShare,
        isPublic: true,
        updatedAt: serverTimestamp(),
      });

      await sendNotification({
        recipientUid: r.creatorUid,
        type: 'raise_offer',
        title: directOpen
          ? `Raise Published Live: ${r.title}`
          : `Share-Split Offer Ready: ${r.title}`,
        message: directOpen
          ? `Admin published "${r.title}" live (${r.totalShares} shares @ ${r.unitSharePriceXAF.toLocaleString()} XAF, ${pctPerShare}% per share).`
          : `Admin approved "${r.title}". Review and accept your share split (${r.totalShares} shares @ ${r.unitSharePriceXAF.toLocaleString()} XAF, ${pctPerShare}% per share) to go live.`,
        raceId: r.id,
        offerSummary: {
          totalShares: r.totalShares,
          unitSharePriceXAF: r.unitSharePriceXAF,
          grossTargetXAF: r.grossTargetXAF,
          revSharePct: r.revSharePct,
          pctPerShare,
          projectedRevenueXAF: r.projectedRevenueXAF || r.grossTargetXAF * 2,
          ...(r.regionalValuationNote ? { regionalNote: r.regionalValuationNote } : {}),
        },
      });

      showToast(
        directOpen ? 'Raise Published Live' : 'Share-Split Offer Sent',
        directOpen
          ? `${r.title} is now live on the market.`
          : `${r.creatorName} received your share-split offer notification to confirm and go live.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `races/${r.id}`);
    } finally {
      setBusyId('');
    }
  };

  const handleRejectRace = async (r: Race, reason = 'Failed underwriting compliance.') => {
    setBusyId(r.id);
    try {
      await updateDoc(doc(db, 'races', r.id), {
        status: 'rejected',
        isPublic: false,
        rejectionReason: reason.slice(0, 600),
        updatedAt: serverTimestamp(),
      });
      await sendNotification({
        recipientUid: r.creatorUid,
        type: 'raise_rejected',
        title: `Raise Declined: ${r.title}`,
        message: reason.slice(0, 600),
        raceId: r.id,
      });
      showToast('Race Rejected', `${r.title} removed from public queue and creator notified.`, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `races/${r.id}`);
    } finally {
      setBusyId('');
    }
  };

  const handleSaveCounterTerms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterRace) return;
    setBusyId(counterRace.id);
    const nextGross = Math.ceil(counterBudget * 1.05);
    const nextUnit = Math.max(500, Math.round(nextGross / Math.max(1, counterRace.totalShares)));
    const nextPctPerShare = Number(
      (counterRace.revSharePct / Math.max(1, counterRace.totalShares)).toFixed(4)
    );
    try {
      await updateDoc(doc(db, 'races', counterRace.id), {
        netBudgetXAF: counterBudget,
        grossTargetXAF: nextGross,
        unitSharePriceXAF: nextUnit,
        currentSharePriceXAF: nextUnit,
        pctPerShare: nextPctPerShare,
        status: 'awaiting_creator_acceptance',
        isPublic: true,
        ...(counterNote.trim() ? { rejectionReason: `Counter-Terms: ${counterNote.trim()}` } : {}),
        updatedAt: serverTimestamp(),
      });

      await sendNotification({
        recipientUid: counterRace.creatorUid,
        type: 'raise_offer',
        title: `Counter-Offer Ready: ${counterRace.title}`,
        message: `Admin proposed revised terms: ${nextGross.toLocaleString()} XAF gross target (${counterRace.totalShares} shares @ ${nextUnit.toLocaleString()} XAF, ${nextPctPerShare}%/share). Accept to go live.`,
        raceId: counterRace.id,
        offerSummary: {
          totalShares: counterRace.totalShares,
          unitSharePriceXAF: nextUnit,
          grossTargetXAF: nextGross,
          revSharePct: counterRace.revSharePct,
          pctPerShare: nextPctPerShare,
          projectedRevenueXAF: counterRace.projectedRevenueXAF || nextGross * 2,
          ...(counterNote.trim() ? { regionalNote: counterNote.trim() } : {}),
        },
      });

      showToast(
        'Counter-Offer Sent',
        `${counterRace.title} repriced to ${nextUnit.toLocaleString()} XAF/share and sent to creator for confirmation.`
      );
      setCounterRace(null);
      setCounterNote('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `races/${counterRace.id}`);
    } finally {
      setBusyId('');
    }
  };

  const handleMemoDecision = async (
    memo: { id: string; requesterUid: string; stageName: string; platformLink: string; auditSummary?: string },
    decision: 'approved' | 'rejected'
  ) => {
    setBusyId(memo.id);
    try {
      await updateDoc(doc(db, 'memos', memo.id), {
        status: decision,
      });

      let createdEntityId: string | undefined;
      if (decision === 'approved') {
        const exists = entities.some(
          (e) => e.stageName.toLowerCase() === memo.stageName.trim().toLowerCase()
        );
        if (!exists) {
          createdEntityId = `ent_${memo.stageName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 36)}_${Date.now().toString(36).slice(-4)}`;
          await setDoc(doc(db, 'entities', createdEntityId), {
            id: createdEntityId,
            stageName: memo.stageName.slice(0, 100),
            category: 'Music',
            city: 'Douala',
            country: 'Cameroon',
            entityType: 'solo',
            bio: (memo.auditSummary || `${memo.stageName} added via Crippo Memo underwriting.`).slice(0, 600),
            isClaimed: false,
            kycStatus: 'unverified',
            isPublic: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      await sendNotification({
        recipientUid: memo.requesterUid,
        type: 'memo_status',
        title: `Memo ${decision === 'approved' ? 'Approved' : 'Declined'}: ${memo.stageName}`,
        message:
          decision === 'approved'
            ? `${memo.stageName} passed AI & Admin memo review and is indexed in the Creators Directory.`
            : `Your listing memo for ${memo.stageName} was declined by Admin underwriting.`,
        ...(createdEntityId ? { entityId: createdEntityId } : {}),
      });

      showToast('Memo Updated', `Memo marked ${decision.toUpperCase()} and requester notified.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `memos/${memo.id}`);
    } finally {
      setBusyId('');
    }
  };

  const handleKycDecision = async (ent: Entity, decision: 'verified' | 'rejected') => {
    setBusyId(ent.id);
    try {
      await updateDoc(doc(db, 'entities', ent.id), {
        kycStatus: decision,
        updatedAt: serverTimestamp(),
      });
      if (ent.claimedByUid) {
        await updateDoc(doc(db, 'users', ent.claimedByUid), {
          kycStatus: decision,
          creatorModeEnabled: decision === 'verified',
          updatedAt: serverTimestamp(),
        });
        await sendNotification({
          recipientUid: ent.claimedByUid,
          type: decision === 'verified' ? 'kyc_approved' : 'kyc_rejected',
          title:
            decision === 'verified'
              ? `Creator KYC Approved: ${ent.stageName}`
              : `Creator KYC Declined: ${ent.stageName}`,
          message:
            decision === 'verified'
              ? `Your identity & profile claim for ${ent.stageName} are verified. You can now launch project Raises.`
              : `Your verification submission for ${ent.stageName} was not approved. Please review your CNI/NIU details.`,
          entityId: ent.id,
        });
      }
      showToast(
        decision === 'verified' ? 'Creator KYC Approved' : 'Creator KYC Rejected',
        `${ent.stageName} ${decision === 'verified' ? 'can now launch Raises.' : 'claim marked rejected.'}`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `entities/${ent.id}`);
    } finally {
      setBusyId('');
    }
  };

  const handleReleaseTranche1 = async (r: Race) => {
    setClearingBusy(true);
    try {
      await updateDoc(doc(db, 'races', r.id), {
        tranche1Released: true,
        status: 'closed',
        updatedAt: serverTimestamp(),
      });
      showToast('Tranche 1 (50%) Released', `${Math.round(r.netBudgetXAF * 0.5).toLocaleString()} XAF unlocked.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `races/${r.id}`);
    } finally {
      setClearingBusy(false);
    }
  };

  const handleRunComplianceWatchdog = async (r: Race) => {
    setClearingBusy(true);
    try {
      const res = await apiFetch<{
        clearedForTranche2: boolean;
        splitMatchVerified: boolean;
        antiOmissionStatus: string;
        riskFlags: string[];
        auditSummary: string;
        checkedApis: string[];
      }>('/api/agents/compliance-watchdog', {
        method: 'POST',
        body: JSON.stringify({
          raceId: r.id,
          creatorName: r.creatorName,
          trackTitle: r.title,
          distributor: r.legalDetails?.distributor || 'DistroKid',
          clearingEmail: r.clearingEmail || `race-${r.id}@clearing.crippo.cm`,
          revSharePct: r.revSharePct,
          isrcCode: isrcInput.trim() || r.isrcCode || '',
        }),
      });
      setWatchdogResult(res);
      showToast(
        res.clearedForTranche2 ? 'Compliance Watchdog Cleared' : 'Compliance Flags Detected',
        res.auditSummary,
        res.clearedForTranche2 ? 'success' : 'info'
      );
    } catch (err) {
      showToast('Watchdog Error', (err as Error).message || 'Compliance check failed.', 'error');
    } finally {
      setClearingBusy(false);
    }
  };

  const handleVerifyIsrcTranche2 = async (r: Race) => {
    if (!isrcInput.trim()) {
      showToast('ISRC Required', 'Enter valid ISRC / Distributor Release ID.', 'error');
      return;
    }
    setClearingBusy(true);
    try {
      await updateDoc(doc(db, 'races', r.id), {
        isrcCode: isrcInput.trim().slice(0, 40),
        tranche2Released: true,
        splitVerified: true,
        status: 'clearing',
        updatedAt: serverTimestamp(),
      });
      setIsrcInput('');
      showToast('ISRC & Tranche 2 Verified', `${r.title} entered Phase 3 Royalty Clearing.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `races/${r.id}`);
    } finally {
      setClearingBusy(false);
    }
  };

  const handleDistributeDividends = async (r: Race) => {
    if (shareholders.length === 0) {
      showToast('No Shareholders', 'No settled BUY shares found in order book for this race.', 'error');
      return;
    }
    setClearingBusy(true);
    try {
      const clearRes = await apiFetch<{
        grossXAF: number;
        investorPoolXAF: number;
        clearingNote: string;
        allocations: Array<{
          uid: string;
          anonymousId: string;
          sharesHeld: number;
          payoutAmountXAF: number;
          momoReference?: string;
        }>;
      }>('/api/agents/dividend-clearing', {
        method: 'POST',
        body: JSON.stringify({
          raceId: r.id,
          raceTitle: r.title,
          periodLabel: periodLabel.trim() || 'Royalty Clearing',
          grossRevenueAmount: clearingPoolAmount,
          currency: clearingCurrency,
          revSharePct: r.revSharePct,
          totalShares: shareholders.reduce((a, s) => a + s.shares, 0),
          holders: shareholders.map((s) => ({
            uid: s.uid,
            anonymousId: s.anonId,
            sharesHeld: s.shares,
          })),
        }),
      });

      let disbursedCount = 0;
      for (const alloc of clearRes.allocations || []) {
        const payoutId = `div_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const amount = Math.max(1, alloc.payoutAmountXAF);
        await setDoc(doc(db, 'dividend_payouts', payoutId), {
          id: payoutId,
          raceId: r.id,
          raceTitle: r.title,
          recipientUid: alloc.uid,
          recipientAnonymousId: alloc.anonymousId,
          sharesHeld: alloc.sharesHeld,
          clearedPoolXAF: clearRes.investorPoolXAF,
          payoutAmountXAF: amount,
          momoReference: alloc.momoReference || `DIV-${Date.now().toString().slice(-6)}`,
          periodLabel: periodLabel.trim() || 'Royalty Clearing',
          status: 'disbursed',
          createdAt: serverTimestamp(),
        });
        await sendNotification({
          recipientUid: alloc.uid,
          type: 'dividend',
          title: `Dividend Disbursed: +${amount.toLocaleString()} XAF`,
          message: `Payout for ${alloc.sharesHeld} shares in "${r.title}" (${periodLabel.trim() || 'Royalty Clearing'}).`,
          raceId: r.id,
        });
        disbursedCount++;
      }
      showToast(
        'Dividends Cleared & Disbursed',
        `${clearRes.clearingNote} (${disbursedCount} payouts logged)`
      );
    } catch (err) {
      showToast('Clearing Error', (err as Error).message || 'Could not disburse dividends.', 'error');
    } finally {
      setClearingBusy(false);
    }
  };

  const handleCreateEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entStageName.trim()) return;
    setEntBusy(true);
    const id = `ent_${entStageName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 36)}_${Date.now().toString(36).slice(-4)}`;
    try {
      const newEnt: Entity = {
        id,
        stageName: entStageName.trim(),
        ...(entLegalName.trim() ? { legalFullName: entLegalName.trim() } : {}),
        category: entCategory,
        city: entCity,
        country: 'Cameroon',
        entityType: 'solo',
        wikiGrade: entGrade,
        ...(entNiu.trim() ? { niuNumber: entNiu.trim() } : {}),
        subscribers: entSubscribers,
        catalogValuationXAF: entSubscribers * 250,
        isClaimed: false,
        kycStatus: 'unverified',
        isPublic: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'entities', id), newEnt);
      setEntStageName('');
      setEntLegalName('');
      setEntNiu('');
      showToast('Entity Published', `${newEnt.stageName} added to Crippo Wikipedia Index.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `entities/${id}`);
    } finally {
      setEntBusy(false);
    }
  };

  const handleRunScraper = async (type: 'creators' | 'pulse' | 'predictions') => {
    setScraperBusy(true);
    try {
      if (type === 'creators') {
        const resp = await apiFetch<{
          creators?: Array<{
            stageName: string;
            category: string;
            city: string;
            country: string;
            youtubeChannelId?: string;
            tiktokHandle?: string;
            facebookPage?: string;
            spotifyArtistId?: string;
            avatarUrl?: string;
            subscribers?: number;
            monthlyViews?: number;
            engagementRate?: number;
            catalogValuationXAF?: number;
            wikiGrade?: string;
          }>;
        }>('/api/scrapers/seed-creators', {
          method: 'POST',
          body: JSON.stringify({
            query: scraperQuery.trim() || 'Cameroon Afropop creator',
            actor: scraperActor,
            ...(scraperUrl.trim() ? { startUrl: scraperUrl.trim() } : {}),
          }),
        });
        let saved = 0;
        for (const item of resp.creators || []) {
          const cleanId = `ent_${item.stageName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40)}_${Date.now().toString(36).slice(-4)}`;
          await setDoc(doc(db, 'entities', cleanId), {
            id: cleanId,
            stageName: item.stageName.slice(0, 100),
            category: item.category || 'Music',
            city: item.city || 'Douala',
            country: item.country || 'Cameroon',
            entityType: 'solo',
            ...(item.youtubeChannelId ? { youtubeChannelId: item.youtubeChannelId } : {}),
            ...(item.tiktokHandle ? { tiktokHandle: item.tiktokHandle } : {}),
            ...(item.facebookPage ? { facebookPage: item.facebookPage } : {}),
            ...(item.spotifyArtistId ? { spotifyArtistId: item.spotifyArtistId } : {}),
            ...(item.avatarUrl ? { avatarUrl: item.avatarUrl } : {}),
            ...(typeof item.subscribers === 'number' ? { subscribers: item.subscribers } : {}),
            ...(typeof item.monthlyViews === 'number' ? { monthlyViews: item.monthlyViews } : {}),
            ...(typeof item.engagementRate === 'number' ? { engagementRate: item.engagementRate } : {}),
            ...(typeof item.catalogValuationXAF === 'number' ? { catalogValuationXAF: item.catalogValuationXAF } : {}),
            ...(item.wikiGrade ? { wikiGrade: item.wikiGrade } : {}),
            isClaimed: false,
            kycStatus: 'unverified',
            isPublic: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          saved++;
        }
        showToast('Scraper Complete', `${saved} creator dossiers ranked & stored via ${scraperActor}.`);
      } else if (type === 'pulse') {
        const resp = await apiFetch<{
          catalysts: Array<{
            entityName: string;
            segment: CatalystSegment;
            sourcePlatform: 'TikTok' | 'Facebook' | 'YouTube' | 'Web';
            sourceName: string;
            headline: string;
            summary: string;
            sentiment: 'bullish' | 'neutral' | 'risk_alert';
            priceImpactPct: number;
          }>;
        }>('/api/agents/cultural-pulse', {
          method: 'POST',
          body: JSON.stringify({
            entityNames: entities.slice(0, 5).map((e) => e.stageName),
            actor: scraperActor,
            ...(scraperUrl.trim() ? { targetUrls: [scraperUrl.trim()] } : {}),
          }),
        });
        let count = 0;
        for (const item of resp.catalysts || []) {
          const cid = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await setDoc(doc(db, 'catalysts', cid), {
            id: cid,
            entityName: (item.entityName || 'Cameroon Scene').slice(0, 100),
            segment: item.segment || 'Trending',
            sourcePlatform: item.sourcePlatform || 'Web',
            sourceName: item.sourceName || scraperActor,
            headline: (item.headline || 'Signal').slice(0, 200),
            summary: (item.summary || 'Telemetry captured').slice(0, 600),
            sentiment: item.sentiment || 'neutral',
            priceImpactPct: Math.max(-50, Math.min(50, Number(item.priceImpactPct) || 0)),
            isPublic: true,
            createdAt: serverTimestamp(),
          });
          count++;
        }
        showToast('Pulse Ingested', `${count} catalysts logged via ${scraperActor}.`);
      } else {
        const resp = await apiFetch<{
          predictions: Array<{
            entityName: string;
            topicCategory: PredictionMarket['topicCategory'];
            question: string;
            resolutionSource: string;
            aiProbability: number;
            yesPriceXAF: number;
            noPriceXAF: number;
            reasoning: string;
            endsAt: string;
          }>;
        }>('/api/agents/trend-probabilities', {
          method: 'POST',
          body: JSON.stringify({
            entityNames: entities.slice(0, 8).map((e) => e.stageName),
            recentHeadlines: catalysts.slice(0, 8).map((c) => `${c.entityName}: ${c.headline}`),
            count: 3,
          }),
        });
        let minted = 0;
        for (const p of resp.predictions || []) {
          const pid = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await setDoc(doc(db, 'predictions', pid), {
            id: pid,
            creatorUid: user?.uid || 'admin',
            entityName: p.entityName,
            topicCategory: p.topicCategory,
            pollType: 'yes_no',
            question: p.question,
            resolutionSource: p.resolutionSource,
            aiProbability: p.aiProbability,
            reasoning: p.reasoning,
            yesVotes: 0,
            noVotes: 0,
            votedUids: [],
            endsAt: new Date(p.endsAt).toISOString(),
            status: 'open',
            isPublic: true,
            createdAt: serverTimestamp(),
          });
          minted++;
        }
        showToast('Fan Polls Minted', `${minted} free Yes/No fan voting polls published.`);
      }
    } catch (err: unknown) {
      const er = err as Error & { missingKeys?: string[] };
      if (er.missingKeys?.length) onOpenApiSetup();
      showToast('Scraper Error', er.message || 'Scraper execution failed.', 'error');
    } finally {
      setScraperBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header + KPI Ribbon */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-outline-variant/25 pb-4">
        <div>
          <span className="font-label-xs uppercase tracking-widest text-secondary font-bold">
            Master Governance &amp; Underwriting Terminal
          </span>
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-on-surface mt-1 font-bold">
            Crippo Admin Desk
          </h1>
        </div>
        <button
          type="button"
          onClick={onOpenApiSetup}
          className="px-4 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-xs uppercase font-bold self-start hover:border-secondary"
        >
          API Keys ({integrationStatus?.campayConfigured ? 'CamPay Ready' : 'Check Keys'})
        </button>
      </div>

      {/* KPI Ribbon (Borderless) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pb-6 border-b border-outline-variant/25 tabular-nums">
        <div>
          <span className="font-label-xs uppercase text-on-surface-variant">
            Pending Human Audits &amp; Memos
          </span>
          <div className="font-headline-lg-mobile font-mono-num text-secondary mt-1">
            {pendingRaces.length + pendingMemos.length}
          </div>
          <span className="font-body-sm text-on-surface-variant">
            {pendingRaces.length} Races · {pendingMemos.length} Paid Memos
          </span>
        </div>
        <div>
          <span className="font-label-xs uppercase text-on-surface-variant">
            Cultural Volatility Flags
          </span>
          <div className="font-headline-lg-mobile font-mono-num text-error mt-1">
            {volatilityAlerts.length}
          </div>
          <span className="font-body-sm text-on-surface-variant">
            Real-time Apify / YouTube Pulse
          </span>
        </div>
        <div>
          <span className="font-label-xs uppercase text-on-surface-variant">
            Escrow Liquid Reserve
          </span>
          <div className="font-headline-lg-mobile font-mono-num text-on-tertiary-container mt-1">
            {totalEscrowReserveXAF.toLocaleString()} XAF
          </div>
          <span className="font-body-sm text-on-surface-variant">
            5% Origination Fee: {Math.round(totalEscrowReserveXAF * 0.05).toLocaleString()} XAF
          </span>
        </div>
      </div>

      {/* Admin Nav Tabs */}
      <div className="flex items-center gap-5 overflow-x-auto no-scrollbar border-b border-outline-variant/25">
        {[
          { key: 'queue', label: `Underwriting & KYC (${pendingRaces.length + pendingKycEntities.length + pendingMemos.length})` },
          { key: 'clearing', label: 'Royalty & Escrow Clearing' },
          { key: 'entities', label: `Wikipedia Entities (${entities.length})` },
          { key: 'scrapers', label: 'AI Agents & Scrapers' },
          { key: 'ledger', label: `CamPay Ledger (${myPayments.length})` },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setAdminTab(t.key as typeof adminTab)}
            className={`pb-2.5 font-label-md whitespace-nowrap border-b-2 transition-colors ${
              adminTab === t.key
                ? 'border-secondary text-secondary font-bold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: UNDERWRITING QUEUE */}
      {adminTab === 'queue' && (
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <h2 className="font-headline-sm text-on-surface font-bold">
              Master Underwriting Queue (Races)
            </h2>
            {races.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant py-6 text-center">
                No capital races submitted yet.
              </p>
            ) : (
              <div className="divide-y divide-outline-variant/25 border-t border-outline-variant/25">
                {races.map((r) => (
                  <div
                    key={r.id}
                    className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-secondary-fixed text-secondary font-label-xs uppercase font-bold">
                          {r.status}
                        </span>
                        <span className="font-label-xs font-mono-num text-on-tertiary-container font-bold">
                          AI Score: {r.crippoScore}/100
                        </span>
                      </div>
                      <h3 className="font-headline-sm text-[17px] text-on-surface mt-1 font-bold">
                        {r.title} — {r.creatorName}
                      </h3>
                      <p className="font-body-sm text-on-surface-variant">
                        Net: {r.netBudgetXAF.toLocaleString()} XAF · Gross:{' '}
                        {r.grossTargetXAF.toLocaleString()} XAF · {r.totalShares} shares @{' '}
                        {r.unitSharePriceXAF.toLocaleString()} XAF · {r.revSharePct}% ({r.roiDurationMonths}m)
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {(r.status === 'auditing' || r.status === 'rejected') && (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => handleApproveRace(r, false)}
                          className="px-3.5 py-2 rounded-xl bg-on-tertiary-container text-white font-label-xs uppercase font-bold"
                        >
                          Send Share-Split Offer
                        </button>
                      )}
                      {r.status !== 'open' && (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => handleApproveRace(r, true)}
                          className="px-3.5 py-2 rounded-xl bg-primary-container text-on-primary font-label-xs uppercase font-bold"
                        >
                          Publish Live Now
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => {
                          setCounterRace(r);
                          setCounterBudget(r.netBudgetXAF);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-secondary text-on-secondary font-label-xs uppercase font-bold"
                      >
                        Counter-Terms
                      </button>
                      {r.status !== 'rejected' && (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => handleRejectRace(r)}
                          className="px-3.5 py-2 rounded-xl bg-error text-white font-label-xs uppercase font-bold"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Creator KYC Claims Approval Queue */}
          <div className="border-t border-outline-variant/25 pt-6 flex flex-col gap-3">
            <h2 className="font-headline-sm text-on-surface font-bold">
              Creator Profile Claims &amp; KYC Queue ({pendingKycEntities.length})
            </h2>
            {pendingKycEntities.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant">
                No pending creator KYC claims awaiting review.
              </p>
            ) : (
              <div className="divide-y divide-outline-variant/25">
                {pendingKycEntities.map((ent) => (
                  <div
                    key={ent.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-label-md font-bold text-on-surface">{ent.stageName}</span>
                        <span className="px-2 py-0.5 rounded bg-secondary-fixed text-secondary font-label-xs uppercase">
                          {ent.entityType} · {ent.kycStatus}
                        </span>
                      </div>
                      <p className="font-body-sm text-on-surface-variant mt-0.5">
                        Legal: {ent.legalFullName || 'N/A'} · NIU: {ent.niuNumber || 'N/A'} · Bio Code:{' '}
                        <strong className="font-mono-num text-secondary">{ent.bioVerificationCode || 'N/A'}</strong>
                        {ent.rccmNumber ? ` · RCCM: ${ent.rccmNumber}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busyId === ent.id}
                        onClick={() => handleKycDecision(ent, 'verified')}
                        className="px-3.5 py-2 rounded-xl bg-on-tertiary-container text-white font-label-xs uppercase font-bold"
                      >
                        Approve Creator KYC
                      </button>
                      <button
                        type="button"
                        disabled={busyId === ent.id}
                        onClick={() => handleKycDecision(ent, 'rejected')}
                        className="px-3.5 py-2 rounded-xl bg-error text-white font-label-xs uppercase font-bold"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Paid Memos Queue (Strictly Payment-Verified Applications Only) */}
          <div className="border-t border-outline-variant/25 pt-6 flex flex-col gap-3">
            <h2 className="font-headline-sm text-on-surface font-bold">
              Paid Creator Applications &amp; Memos ({paidMemos.length})
            </h2>
            {paidMemos.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant">
                No payment-verified creator applications submitted yet.
              </p>
            ) : (
              <div className="divide-y divide-outline-variant/25">
                {paidMemos.map((m) => (
                  <div
                    key={m.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-label-md font-bold text-on-surface">{m.stageName}</span>
                        {m.fullName && (
                          <span className="font-body-sm text-on-surface-variant">({m.fullName})</span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-secondary-fixed text-secondary font-label-xs uppercase">
                          {m.status}
                        </span>
                        <span className="font-mono-num text-[12px] text-on-tertiary-container font-bold">
                          Paid {m.feeXAF.toLocaleString()} XAF → {m.recipientNumber || '672638094'}
                        </span>
                      </div>
                      <p className="font-body-sm text-on-surface-variant truncate">
                        Channel: {m.platformLink}
                        {m.paymentReference ? ` · Ref: ${m.paymentReference}` : ''}
                      </p>
                      {m.socialAccounts && (
                        <p className="font-body-sm text-on-surface">
                          <strong>Socials:</strong> {m.socialAccounts}
                        </p>
                      )}
                      {m.shortBio && (
                        <p className="font-body-sm text-on-surface-variant">
                          <strong className="text-on-surface">Bio:</strong> {m.shortBio}
                        </p>
                      )}
                      {m.motivation && (
                        <p className="font-body-sm text-on-surface-variant">
                          <strong className="text-on-surface">Why Crippo:</strong> {m.motivation}
                        </p>
                      )}
                      {m.auditSummary && (
                        <p className="font-body-sm text-secondary mt-1">{m.auditSummary}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => handleMemoDecision(m, 'approved')}
                        className="px-3 py-1.5 rounded-lg bg-on-tertiary-container text-white font-label-xs uppercase font-bold"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => handleMemoDecision(m, 'rejected')}
                        className="px-3 py-1.5 rounded-lg bg-error text-white font-label-xs uppercase font-bold"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ROYALTY & ESCROW CLEARING */}
      {adminTab === 'clearing' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-headline-sm text-on-surface font-bold">
                50/50 Escrow Tranche &amp; Dividend Waterfall
              </h2>
              <p className="font-body-sm text-on-surface-variant">
                Release studio tranches upon proof and distribute streaming revenue shares to shareholders.
              </p>
            </div>
            <select
              value={clearingRace?.id || ''}
              onChange={(e) => setSelectedRaceId(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface font-label-md"
            >
              {races.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.status})
                </option>
              ))}
            </select>
          </div>

          {!clearingRace ? (
            <p className="font-body-sm text-on-surface-variant">No active races available for clearing.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Tranche & ISRC Controls */}
              <div className="flex flex-col gap-4">
                <span className="font-label-xs uppercase text-secondary font-bold">
                  Milestone Escrow Releases
                </span>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-label-md font-bold">Tranche 1 (50% Mobilization)</div>
                    <div className="font-body-sm text-on-surface-variant">
                      {Math.round(clearingRace.netBudgetXAF * 0.5).toLocaleString()} XAF
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={clearingBusy || Boolean(clearingRace.tranche1Released)}
                    onClick={() => handleReleaseTranche1(clearingRace)}
                    className="px-3.5 py-2 rounded-xl bg-secondary text-on-secondary font-label-xs uppercase font-bold disabled:opacity-50"
                  >
                    {clearingRace.tranche1Released ? 'Released' : 'Release Tranche 1'}
                  </button>
                </div>

                <div className="pt-3 border-t border-outline-variant/25 flex flex-col gap-2">
                  <div className="font-label-md font-bold">
                    Tranche 2 (50% Upon Master Proof &amp; ISRC)
                  </div>
                  <input
                    type="text"
                    value={isrcInput}
                    onChange={(e) => setIsrcInput(e.target.value)}
                    placeholder={clearingRace.isrcCode || 'Enter ISRC e.g. CM-CRP-26-00104'}
                    className="px-3 py-2 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num"
                  />
                  <button
                    type="button"
                    disabled={clearingBusy}
                    onClick={() => handleRunComplianceWatchdog(clearingRace)}
                    className="py-2 rounded-xl bg-secondary text-white font-label-xs uppercase font-bold disabled:opacity-50"
                  >
                    Run AI Compliance Watchdog (Spotify + YouTube Check)
                  </button>
                  {watchdogResult && (
                    <div className="py-2 border-l-2 border-secondary pl-3 text-[12px] space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span>Watchdog: {watchdogResult.antiOmissionStatus.toUpperCase()}</span>
                        <span className={watchdogResult.clearedForTranche2 ? 'text-on-tertiary-container' : 'text-error'}>
                          {watchdogResult.clearedForTranche2 ? 'CLEARED' : 'FLAGGED'}
                        </span>
                      </div>
                      <p className="text-on-surface-variant">{watchdogResult.auditSummary}</p>
                      {watchdogResult.riskFlags.length > 0 && (
                        <ul className="text-error list-disc pl-4">
                          {watchdogResult.riskFlags.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={clearingBusy || Boolean(clearingRace.tranche2Released)}
                    onClick={() => handleVerifyIsrcTranche2(clearingRace)}
                    className="py-2.5 rounded-xl bg-on-tertiary-container text-white font-label-xs uppercase font-bold disabled:opacity-50"
                  >
                    {clearingRace.tranche2Released
                      ? `Verified (${clearingRace.isrcCode})`
                      : 'Verify ISRC & Release Tranche 2'}
                  </button>
                </div>
              </div>

              {/* Royalty Pool Waterfall (Multi-Currency AI Dividend Clearing Agent) */}
              <div className="lg:border-l lg:border-outline-variant/25 lg:pl-6 flex flex-col gap-3">
                <span className="font-label-xs uppercase text-secondary font-bold">
                  AI Dividend Clearing &amp; FX Pool ({shareholders.length} Shareholders)
                </span>
                <input
                  type="text"
                  value={periodLabel}
                  onChange={(e) => setPeriodLabel(e.target.value)}
                  placeholder="Clearing Period Label"
                  className="px-3 py-2 rounded-xl border border-outline-variant/40 bg-transparent"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min={100}
                    step={1000}
                    value={clearingPoolAmount}
                    onChange={(e) => setClearingPoolAmount(Math.max(100, Number(e.target.value) || 100))}
                    className="col-span-2 px-3 py-2 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num"
                  />
                  <select
                    value={clearingCurrency}
                    onChange={(e) => setClearingCurrency(e.target.value as 'XAF' | 'USD' | 'EUR')}
                    className="px-2 py-2 rounded-xl border border-outline-variant/40 bg-transparent font-label-md"
                  >
                    <option value="XAF">XAF</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <div className="font-body-sm text-on-surface-variant">
                  Pledged Share: <strong className="text-on-tertiary-container">{clearingRace.revSharePct}%</strong> · Auto-converted via BEAC FX rate in server clearing agent.
                </div>
                <button
                  type="button"
                  disabled={clearingBusy || shareholders.length === 0}
                  onClick={() => handleDistributeDividends(clearingRace)}
                  className="py-3 rounded-xl bg-primary-container text-white font-label-md font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  {clearingBusy ? 'Running Clearing Agent...' : 'Run Dividend Clearing Agent & Disburse'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: WIKIPEDIA ENTITIES CRUD */}
      {adminTab === 'entities' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form
            onSubmit={handleCreateEntity}
            className="lg:col-span-5 flex flex-col gap-3"
          >
            <h2 className="font-headline-sm text-on-surface font-bold">
              Publish Canonical Creator Entity
            </h2>
            <input
              type="text"
              required
              value={entStageName}
              onChange={(e) => setEntStageName(e.target.value)}
              placeholder="Stage Name"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent"
            />
            <input
              type="text"
              value={entLegalName}
              onChange={(e) => setEntLegalName(e.target.value)}
              placeholder="Legal Name (Optional)"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={entCategory}
                onChange={(e) => setEntCategory(e.target.value)}
                placeholder="Category"
                className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent"
              />
              <input
                type="text"
                value={entCity}
                onChange={(e) => setEntCity(e.target.value)}
                placeholder="City"
                className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={entGrade}
                onChange={(e) => setEntGrade(e.target.value)}
                placeholder="Wiki Grade (A-Index)"
                className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent"
              />
              <input
                type="number"
                min={0}
                value={entSubscribers}
                onChange={(e) => setEntSubscribers(Number(e.target.value) || 0)}
                placeholder="Subscribers"
                className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num"
              />
            </div>
            <input
              type="text"
              value={entNiu}
              onChange={(e) => setEntNiu(e.target.value)}
              placeholder="NIU Number (Optional)"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num"
            />
            <button
              type="submit"
              disabled={entBusy}
              className="py-3 rounded-xl bg-secondary text-on-secondary font-label-md font-bold uppercase"
            >
              {entBusy ? 'Publishing...' : 'Publish to Wikipedia Index'}
            </button>
          </form>

          <div className="lg:col-span-7 lg:border-l lg:border-outline-variant/25 lg:pl-6 flex flex-col gap-3">
            <h2 className="font-headline-sm text-on-surface font-bold">
              Indexed Entities ({entities.length})
            </h2>
            <div className="divide-y divide-outline-variant/25 border-t border-outline-variant/25">
              {entities.map((ent) => (
                <div
                  key={ent.id}
                  className="py-3.5 flex items-center justify-between gap-3"
                >
                  <div>
                    <span className="font-label-md font-bold text-on-surface">{ent.stageName}</span>
                    <span className="block text-[12px] text-on-surface-variant">
                      {ent.category} · {ent.city} · Claimed: {ent.isClaimed ? 'Yes' : 'No'} · KYC:{' '}
                      {ent.kycStatus}
                    </span>
                  </div>
                  <span className="font-mono-num text-[12px] text-secondary font-bold">
                    {(ent.subscribers || 0).toLocaleString()} subs
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: APIFY & CULTURAL SCRAPERS */}
      {adminTab === 'scrapers' && (
        <div className="flex flex-col gap-4 max-w-3xl">
          <div>
            <h2 className="font-headline-sm text-on-surface font-bold">
              Apify, YouTube &amp; Cultural Pulse Control Panel
            </h2>
            <p className="font-body-sm text-on-surface-variant">
              Run free-tier web crawlers or pay-per-use social actors directly from the server proxy.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-label-xs uppercase text-on-surface-variant">
              Select Apify Actor
            </label>
            <select
              value={scraperActor}
              onChange={(e) => setScraperActor(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            >
              {APIFY_ACTORS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={scraperQuery}
              onChange={(e) => setScraperQuery(e.target.value)}
              placeholder="Search query (e.g. Cameroon Afropop)"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent"
            />
            <input
              type="url"
              value={scraperUrl}
              onChange={(e) => setScraperUrl(e.target.value)}
              placeholder="Optional public URL for Crawler"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={scraperBusy}
              onClick={() => handleRunScraper('creators')}
              className="px-4 py-3 rounded-xl bg-secondary text-on-secondary font-label-md font-bold disabled:opacity-60"
            >
              {scraperBusy ? 'Running...' : 'Ingest Creator Entities'}
            </button>
            <button
              type="button"
              disabled={scraperBusy}
              onClick={() => handleRunScraper('pulse')}
              className="px-4 py-3 rounded-xl bg-primary-container text-on-primary font-label-md font-bold disabled:opacity-60"
            >
              {scraperBusy ? 'Running...' : 'Ingest Cultural Pulse Catalysts'}
            </button>
            <button
              type="button"
              disabled={scraperBusy}
              onClick={() => handleRunScraper('predictions')}
              className="px-4 py-3 rounded-xl bg-on-tertiary-container text-white font-label-md font-bold disabled:opacity-60"
            >
              {scraperBusy ? 'Running...' : 'Synthesize Trend AI Predictions'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 5: CAMPAY RESERVE LEDGER */}
      {adminTab === 'ledger' && (
        <div className="flex flex-col gap-3">
          <h2 className="font-headline-sm text-on-surface font-bold">CamPay Escrow Reserve Ledger</h2>
          <div className="divide-y divide-outline-variant/25 border-t border-outline-variant/25">
            {myPayments.map((p) => (
              <div
                key={p.id}
                className="py-3.5 flex items-center justify-between"
              >
                <div>
                  <span className="font-label-xs uppercase text-secondary font-bold">
                    {p.type} · {p.provider}
                  </span>
                  <div className="font-mono-num text-[12px]">{p.reference}</div>
                </div>
                <div className="text-right tabular-nums">
                  <span className="font-ticker-val font-bold block">
                    {p.amountXAF.toLocaleString()} XAF
                  </span>
                  <span className="font-label-xs uppercase text-on-tertiary-container">{p.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Counter-Terms Modal */}
      {counterRace && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCounterRace(null);
          }}
        >
          <form
            onSubmit={handleSaveCounterTerms}
            className="w-full max-w-md bg-surface text-on-surface border border-outline-variant/40 rounded-2xl shadow-2xl p-6 flex flex-col gap-4"
          >
            <h3 className="font-headline-sm text-on-surface">
              Counter-Terms: {counterRace.title}
            </h3>
            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">
                Revised Net Budget (XAF)
              </label>
              <input
                type="number"
                min={50000}
                step={50000}
                required
                value={counterBudget}
                onChange={(e) => setCounterBudget(Number(e.target.value) || 50000)}
                className="px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 font-mono-num"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">
                Underwriting Note
              </label>
              <textarea
                rows={2}
                value={counterNote}
                onChange={(e) => setCounterNote(e.target.value)}
                placeholder="Adjusted budget to align with 90-day YouTube velocity."
                className="px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCounterRace(null)}
                className="px-4 py-2 rounded-xl bg-surface-container font-label-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyId === counterRace.id}
                className="px-4 py-2 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
              >
                Send Counter-Offer
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
