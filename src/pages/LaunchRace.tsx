import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../services/firebase';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import type { ListenerRegion, RaceMilestone, ValuationBreakdown } from '../types/crippo';

const CATEGORIES = ['Single', 'EP / Album', 'TikTok Series', 'YouTube Show', 'Movie / Documentary'];
const SOURCES = [
  'YouTube AdSense',
  'Spotify / Boomplay / Apple Music Streams',
  'TikTok Creator Rewards',
  'Crippo Brand Campaign Escrow',
];
const ROI_WINDOWS: Array<6 | 12 | 18 | 24> = [6, 12, 18, 24];
const REGIONS: Array<{ id: ListenerRegion; label: string; desc: string }> = [
  {
    id: 'cameroon_africa',
    label: 'Cameroon & West/Central Africa',
    desc: 'Local MoMo fan base (~460 XAF / 1k YT views · ~1.0 XAF Spotify stream)',
  },
  {
    id: 'diaspora_mixed',
    label: 'Blended Cameroon + Diaspora (EU/US)',
    desc: 'Mixed Douala/Yaoundé + Paris/London/US audience (~1,465 XAF / 1k YT views)',
  },
  {
    id: 'global_eu_us',
    label: 'Global EU / US / UK Dominant',
    desc: 'Majority Tier-1 international streaming (~2,745 XAF / 1k YT views)',
  },
];

const STEPS = [
  { key: 'scope', label: 'Scope & Region' },
  { key: 'terms', label: 'Financial Terms' },
  { key: 'plan', label: 'Flight Plan' },
  { key: 'rights', label: 'Rights & Signature' },
  { key: 'review', label: 'Review & Submit' },
];

interface LaunchRaceProps {
  onOpenApiSetup: () => void;
}

export function LaunchRace({ onOpenApiSetup }: LaunchRaceProps) {
  const { user, profile, privateInfo, loading: authLoading } = useAuth();
  const {
    entities,
    isAdmin,
    isVerifiedCreator,
    isLabelAffiliatedCreator,
    isVerifiedAgency,
    canLaunchRace,
    claimedEntity: ctxClaimedEntity,
    showToast,
  } = useMarket();
  const navigate = useNavigate();

  // All hooks run unconditionally at the top (no early returns above them)
  const claimedEntity = useMemo(
    () =>
      ctxClaimedEntity ||
      entities.find((e) => e.id === profile?.claimedEntityId || e.claimedByUid === user?.uid) ||
      null,
    [ctxClaimedEntity, entities, profile, user]
  );

  const availableIssuers = useMemo(() => {
    if (isAdmin) return entities;
    if (!user || !claimedEntity) return [];
    const roster = entities.filter((e) => e.id === claimedEntity.id || e.affiliatedAgencyUid === user.uid);
    return roster.length > 0 ? roster : [claimedEntity];
  }, [isAdmin, entities, user, claimedEntity]);

  const [selectedIssuerId, setSelectedIssuerId] = useState<string>('');

  useEffect(() => {
    if (!selectedIssuerId && availableIssuers[0]) {
      setSelectedIssuerId(availableIssuers[0].id);
    }
  }, [availableIssuers, selectedIssuerId]);

  const targetIssuer = useMemo(
    () => availableIssuers.find((e) => e.id === selectedIssuerId) || claimedEntity || entities[0] || null,
    [availableIssuers, selectedIssuerId, claimedEntity, entities]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!isLabelAffiliatedCreator && !canLaunchRace) {
      showToast('Verified Creator Required', 'Claim and verify your profile first to launch a Raise.', 'info');
      navigate('/creators', { replace: true });
    }
  }, [authLoading, isLabelAffiliatedCreator, canLaunchRace, navigate, showToast]);

  const isKycCleared =
    isAdmin || (Boolean(claimedEntity?.isClaimed) && claimedEntity?.kycStatus === 'verified');

  const [step, setStep] = useState(0);

  // 01 Scope & Monitorable Streams
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('EP / Album');
  const [listenerRegion, setListenerRegion] = useState<ListenerRegion>('cameroon_africa');
  const [coverArtUrl, setCoverArtUrl] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [monitorableSources, setMonitorableSources] = useState<string[]>([
    'YouTube AdSense',
    'Spotify / Boomplay / Apple Music Streams',
  ]);
  const [clearingEmail, setClearingEmail] = useState(user?.email || '');

  // 02 Financial Terms
  const [netBudgetXAF, setNetBudgetXAF] = useState(1500000);
  const [totalShares, setTotalShares] = useState(300);
  const [revSharePct, setRevSharePct] = useState(25);
  const [roiDurationMonths, setRoiDurationMonths] = useState<6 | 12 | 18 | 24>(12);
  const [raceCloseDate, setRaceCloseDate] = useState(new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10));
  const [productionDeadline, setProductionDeadline] = useState(
    new Date(Date.now() + 65 * 86400000).toISOString().slice(0, 10)
  );

  // 03 Flight Plan
  const [milestones, setMilestones] = useState<RaceMilestone[]>([
    {
      phase: 'Phase 01',
      title: 'Capital Raise Close & CamPay Escrow Lock',
      targetDate: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
      status: 'active',
      escrowReleasePct: 0,
    },
    {
      phase: 'Phase 02',
      title: 'Tranche 1 (50% Studio, Cast & Production Start)',
      targetDate: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10),
      status: 'upcoming',
      escrowReleasePct: 50,
    },
    {
      phase: 'Phase 03',
      title: 'Tranche 2 (50% Upon Master Cut & ISRC Registration)',
      targetDate: new Date(Date.now() + 65 * 86400000).toISOString().slice(0, 10),
      status: 'upcoming',
      escrowReleasePct: 50,
    },
    {
      phase: 'Phase 04',
      title: 'Monthly Streaming & MoMo Royalty Clearing',
      targetDate: new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10),
      status: 'upcoming',
      escrowReleasePct: 100,
    },
  ]);

  // 04 Master Rights & Digital Signature
  const [distributor, setDistributor] = useState('DistroKid / Believe');
  const [nextOfKinName, setNextOfKinName] = useState('');
  const [nextOfKinPhone, setNextOfKinPhone] = useState('');
  const [masterRightsOwned, setMasterRightsOwned] = useState(true);
  const [signatureText, setSignatureText] = useState(profile?.displayName || '');

  // AI Underwriter
  const [submitting, setSubmitting] = useState(false);
  const [auditPreview, setAuditPreview] = useState<{
    crippoScore: number;
    projectedRevenueXAF: number;
    pctPerShare: number;
    regionalValuationNote: string;
    valuationBreakdown: ValuationBreakdown;
    rationale: string;
    scoreBreakdown: {
      growth: number;
      engagement: number;
      monitorability: number;
      roiSpeed: number;
      consistency: number;
    };
  } | null>(null);

  const grossTargetXAF = Math.ceil(Math.max(10000, netBudgetXAF) * 1.05);
  const unitSharePriceXAF = Math.max(500, Math.round(grossTargetXAF / Math.max(1, totalShares)));
  const pctPerShare = Number((revSharePct / Math.max(1, totalShares)).toFixed(4));

  const toggleSource = (src: string) => {
    setMonitorableSources((prev) =>
      prev.includes(src) ? (prev.length > 1 ? prev.filter((s) => s !== src) : prev) : [...prev, src]
    );
  };

  const handleCoverUpload = async (file: File) => {
    if (!user) return;
    setUploadingCover(true);
    try {
      const storageRef = ref(storage, `races/${user.uid}/cover_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      setCoverArtUrl(await getDownloadURL(storageRef));
      showToast('Cover Uploaded', 'Project key art stored securely.');
    } catch (err: unknown) {
      showToast('Upload Failed', (err as Error).message || 'Could not upload cover.', 'error');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleRunUnderwriter = async (publishAfter: boolean) => {
    if (!user || !user.emailVerified) {
      showToast('Verified Account Required', 'Sign in with a verified email first.', 'error');
      return;
    }
    if (title.trim().length < 2 || !signatureText.trim() || !masterRightsOwned) {
      showToast(
        'Legal Validation',
        'Project Title, Master Rights attestation, and Digital Signature are required.',
        'error'
      );
      return;
    }

    setSubmitting(true);
    try {
      const entityToUse = targetIssuer;
      const raceId = `race_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const auditResp = await apiFetch<{
        approved: boolean;
        crippoScore: number;
        projectedRevenueXAF: number;
        pctPerShare: number;
        regionalValuationNote: string;
        valuationBreakdown: ValuationBreakdown;
        reasoning: string;
        counterTerms?: string;
        clearingEmail: string;
        capTableHash: string;
        scoreBreakdown: {
          growth: number;
          engagement: number;
          monitorability: number;
          roiSpeed: number;
          consistency: number;
        };
      }>('/api/agents/underwrite', {
        method: 'POST',
        body: JSON.stringify({
          raceId,
          title: title.trim(),
          category,
          listenerRegion,
          netBudgetXAF,
          revSharePct,
          roiDurationMonths,
          productionDeadline,
          monitorableSources,
          creatorName: entityToUse?.stageName || profile?.displayName || 'Creator',
          subscribers: entityToUse?.subscribers || 25000,
          monthlyViews: entityToUse?.monthlyViews || 120000,
          engagementRate: entityToUse?.engagementRate || 4.2,
          entityType: isVerifiedAgency ? 'agency' : 'solo',
          masterRightsOwned,
          distributor,
        }),
      });

      setAuditPreview({
        crippoScore: auditResp.crippoScore,
        projectedRevenueXAF: auditResp.projectedRevenueXAF,
        pctPerShare: auditResp.pctPerShare || pctPerShare,
        regionalValuationNote: auditResp.regionalValuationNote,
        valuationBreakdown: auditResp.valuationBreakdown,
        rationale: auditResp.counterTerms || auditResp.reasoning,
        scoreBreakdown: auditResp.scoreBreakdown,
      });

      if (publishAfter) {
        const entityId = entityToUse?.id || `ent_${user.uid.slice(0, 12)}`;
        const creatorName = entityToUse?.stageName || profile?.displayName || 'Verified Creator';
        const score = Math.max(0, Math.min(100, Math.round(auditResp.crippoScore || 75)));

        const raceDoc = {
          id: raceId,
          entityId,
          creatorUid: user.uid,
          creatorName: creatorName.slice(0, 100),
          title: title.trim().slice(0, 140),
          ...(coverArtUrl ? { coverArtUrl } : {}),
          category,
          monitorableSources,
          netBudgetXAF,
          grossTargetXAF,
          revSharePct,
          pctPerShare,
          roiDurationMonths,
          productionDeadline: new Date(productionDeadline).toISOString(),
          raceCloseDate: new Date(raceCloseDate).toISOString(),
          unitSharePriceXAF,
          currentSharePriceXAF: unitSharePriceXAF,
          totalShares,
          sharesSold: 0,
          crippoScore: score,
          scoreBreakdown: auditResp.scoreBreakdown,
          projectedRevenueXAF: Math.max(0, Math.round(auditResp.projectedRevenueXAF || grossTargetXAF * 2)),
          regionalValuationNote: auditResp.regionalValuationNote,
          valuationBreakdown: auditResp.valuationBreakdown,
          capTableHash: `SHA256-${raceId.toUpperCase()}`,
          clearingEmail: clearingEmail.trim() || user.email || 'clearing@crippo.cm',
          tranche1Released: false,
          tranche2Released: false,
          splitVerified: false,
          milestones,
          status: 'auditing',
          legalDetails: {
            issuerType: isVerifiedAgency ? 'agency' : 'solo',
            legalFullName: privateInfo?.fullNameLegal || profile?.displayName || creatorName,
            cniNumber: privateInfo?.cniNumber || 'VERIFIED-KYC',
            niuNumber: privateInfo?.niuNumber || entityToUse?.niuNumber || 'VERIFIED-NIU',
            ...(nextOfKinName ? { nextOfKinName } : {}),
            ...(nextOfKinPhone ? { nextOfKinPhone } : {}),
            ...(claimedEntity?.agencyName ? { companyName: claimedEntity.agencyName } : {}),
            masterRightsOwned,
            distributor,
            signatureText: signatureText.trim(),
            signedAt: new Date().toISOString(),
          },
          priceHistory: [
            {
              timestamp: new Date().toISOString(),
              priceXAF: unitSharePriceXAF,
              reason: 'Regional Underwriting Submission',
            },
          ],
          isPublic: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        try {
          await setDoc(doc(db, 'races', raceId), raceDoc);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `races/${raceId}`);
        }

        showToast(
          'Raise Submitted for Admin Review',
          `Score ${score}/100 recorded. Once Admin approves your share split, you will receive an offer notification to go live.`
        );
        navigate(`/race/${raceId}`);
      } else {
        showToast('Regional Valuation Ready', `Crippo Score: ${auditResp.crippoScore}/100 calculated.`);
      }
    } catch (err: unknown) {
      const e = err as Error & { missingKeys?: string[] };
      if (isAdmin && e.missingKeys?.length) onOpenApiSetup();
      showToast('Underwriter Error', e.message || 'Could not run AI underwriter.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const canGoNext =
    step === 0
      ? title.trim().length >= 2
      : step === 3
      ? Boolean(signatureText.trim()) && masterRightsOwned
      : true;

  const scoreVal = auditPreview?.crippoScore ?? 0;
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const strokeDashoffset = circ - (scoreVal / 100) * circ;

  // Label-affiliated solo creators cannot initiate raises (rendered after all hooks)
  if (!authLoading && isLabelAffiliatedCreator && !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-12 flex flex-col gap-4 text-center">
        <span className="font-label-xs uppercase tracking-widest text-secondary font-bold">Label Affiliation Policy</span>
        <h1 className="font-headline-sm text-on-surface font-bold">
          Raises Are Managed by {claimedEntity?.agencyName || 'Your Record Label'}
        </h1>
        <p className="font-body-md text-on-surface-variant">
          Because your Crippo profile is affiliated with <strong>{claimedEntity?.agencyName}</strong>, solo Raise
          initiation is locked. Only your verified agency/label can submit a project Raise on your behalf.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link to="/profile" className="px-5 py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md font-bold">
            Back to My Profile
          </Link>
          <Link
            to="/creators"
            className="px-5 py-2.5 rounded-xl border border-outline-variant/50 text-on-surface font-label-md font-bold"
          >
            Creators Directory
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="border-b border-outline-variant/25 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="font-label-xs uppercase tracking-widest text-secondary font-bold">
            OHADA Uniform Act Compliant · Regional Streaming Valuation
          </span>
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-on-surface mt-1 font-bold">
            Launch a Project Raise
          </h1>
        </div>
        <span className="px-3.5 py-2 rounded-xl border border-outline-variant/40 font-label-xs uppercase text-on-tertiary-container font-bold shrink-0">
          50/50 CamPay Escrow
        </span>
      </div>

      {/* Hard KYC Gate */}
      {!isKycCleared && (
        <div className="py-3 border-l-2 border-error pl-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-label-md font-bold text-error">Creator KYC &amp; Profile Claim Required Before Publishing</h3>
            <p className="font-body-sm text-on-surface-variant mt-0.5">
              Claim your creator profile and verify CNI + NIU before minting revenue-share stakes.
            </p>
          </div>
          <Link
            to="/creators?claim=1"
            className="px-4 py-2 rounded-xl bg-primary text-on-primary font-label-xs uppercase font-bold shrink-0 text-center"
          >
            Claim &amp; Verify Profile
          </Link>
        </div>
      )}

      {/* Step indicator: one step on screen at a time */}
      <ol className="grid grid-cols-5 gap-2">
        {STEPS.map((s, idx) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => idx <= step && setStep(idx)}
              className={`w-full flex flex-col gap-1 border-t-2 pt-2 text-left ${
                idx === step ? 'border-secondary' : idx < step ? 'border-on-tertiary-container' : 'border-outline-variant/40'
              }`}
            >
              <span className="font-label-xs uppercase text-on-surface-variant">Step {idx + 1}</span>
              <span
                className={`font-label-xs font-bold ${idx === step ? 'text-secondary' : 'text-on-surface-variant'}`}
              >
                {s.label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: current step only */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {step === 0 && (
            <section className="flex flex-col gap-4">
              <span className="font-label-xs uppercase text-secondary font-bold">01 · Project Scope &amp; Listener Region</span>

              {availableIssuers.length > 1 && (
                <div className="flex flex-col gap-1">
                  <label className="font-label-xs uppercase text-on-surface-variant">Launching For Artist / Roster Profile</label>
                  <select
                    value={targetIssuer?.id || ''}
                    onChange={(e) => setSelectedIssuerId(e.target.value)}
                    className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface font-label-md"
                  >
                    {availableIssuers.map((iss) => (
                      <option key={iss.id} value={iss.id}>
                        {iss.stageName} ({iss.category} · {iss.city})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="font-label-xs uppercase text-on-surface-variant">Project / Album / Series Title</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Douala Nights Deluxe EP"
                    className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-xs uppercase text-on-surface-variant">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-xs uppercase text-on-surface-variant">Royalty Clearing Email</label>
                  <input
                    type="email"
                    value={clearingEmail}
                    onChange={(e) => setClearingEmail(e.target.value)}
                    className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-label-xs uppercase text-on-surface-variant">
                  Primary Listener Region (Determines Fair Spotify / Audiomack / YouTube Valuation)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {REGIONS.map((reg) => {
                    const active = listenerRegion === reg.id;
                    return (
                      <button
                        key={reg.id}
                        type="button"
                        onClick={() => setListenerRegion(reg.id)}
                        className={`p-3 rounded-xl border text-left transition-colors ${
                          active ? 'border-secondary bg-secondary-fixed/20 text-on-surface' : 'border-outline-variant/35 text-on-surface-variant'
                        }`}
                      >
                        <span className="font-label-md font-bold text-on-surface block">{reg.label}</span>
                        <span className="text-[11px] leading-snug block mt-0.5">{reg.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-label-xs uppercase text-on-surface-variant">Monitorable Public Revenue Channels</label>
                <div className="flex flex-wrap gap-2">
                  {SOURCES.map((src) => {
                    const active = monitorableSources.includes(src);
                    return (
                      <button
                        key={src}
                        type="button"
                        onClick={() => toggleSource(src)}
                        className={`px-3.5 py-2 rounded-xl font-label-md transition-colors border ${
                          active ? 'bg-secondary border-secondary text-on-secondary font-bold' : 'border-outline-variant/35 text-on-surface-variant'
                        }`}
                      >
                        {src}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="p-3.5 rounded-xl border border-dashed border-outline-variant cursor-pointer flex items-center justify-between">
                <span className="font-label-md text-secondary font-semibold">
                  {uploadingCover
                    ? 'Uploading Key Art...'
                    : coverArtUrl
                    ? 'Project Cover Art Uploaded'
                    : 'Upload Project Key Art (Optional)'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCoverUpload(f);
                  }}
                />
              </label>
            </section>
          )}

          {step === 1 && (
            <section className="flex flex-col gap-4">
              <span className="font-label-xs uppercase text-secondary font-bold">02 · Financial Terms &amp; Share Split</span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="font-label-xs uppercase text-on-surface-variant">Net Production Budget (XAF)</label>
                  <input
                    type="number"
                    min={50000}
                    step={50000}
                    value={netBudgetXAF}
                    onChange={(e) => setNetBudgetXAF(Math.max(10000, Number(e.target.value) || 10000))}
                    className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num text-on-surface"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-xs uppercase text-on-surface-variant">Total Shares to Mint</label>
                  <input
                    type="number"
                    min={10}
                    max={50000}
                    value={totalShares}
                    onChange={(e) => setTotalShares(Math.max(10, Number(e.target.value) || 10))}
                    className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num text-on-surface"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-xs uppercase text-on-surface-variant">Revenue Share % (1-90%)</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={revSharePct}
                    onChange={(e) => setRevSharePct(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                    className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num text-on-surface"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="font-label-xs uppercase text-on-surface-variant">Payout Term</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {ROI_WINDOWS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setRoiDurationMonths(m)}
                        className={`py-2 rounded-lg font-label-xs font-bold border ${
                          roiDurationMonths === m ? 'bg-secondary border-secondary text-on-secondary' : 'border-outline-variant/35 text-on-surface'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-xs uppercase text-on-surface-variant">Raise Close Date</label>
                  <input
                    type="date"
                    value={raceCloseDate}
                    onChange={(e) => setRaceCloseDate(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-xs uppercase text-on-surface-variant">Master Delivery Deadline</label>
                  <input
                    type="date"
                    value={productionDeadline}
                    onChange={(e) => setProductionDeadline(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-t border-b border-outline-variant/25 tabular-nums">
                <div>
                  <span className="font-label-xs uppercase text-on-surface-variant block">5% Gross Target</span>
                  <span className="font-ticker-val font-mono-num text-on-surface font-bold">{grossTargetXAF.toLocaleString()} XAF</span>
                </div>
                <div>
                  <span className="font-label-xs uppercase text-on-surface-variant block">Unit Share Price</span>
                  <span className="font-ticker-val font-mono-num text-secondary font-bold">{unitSharePriceXAF.toLocaleString()} XAF</span>
                </div>
                <div>
                  <span className="font-label-xs uppercase text-on-surface-variant block">% Rev Per Share</span>
                  <span className="font-ticker-val font-mono-num text-on-tertiary-container font-bold">{pctPerShare}%</span>
                </div>
                <div>
                  <span className="font-label-xs uppercase text-on-surface-variant block">Tranche Split</span>
                  <span className="font-ticker-val font-mono-num text-on-surface font-bold">
                    {Math.round(netBudgetXAF / 2).toLocaleString()} × 2
                  </span>
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="flex flex-col gap-3">
              <span className="font-label-xs uppercase text-secondary font-bold">03 · 4-Phase Production Flight Plan</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {milestones.map((ms, idx) => (
                  <div key={idx} className="py-2 border-l-2 border-secondary/50 pl-3 flex flex-col gap-2">
                    <span className="font-label-xs uppercase text-secondary font-bold">{ms.phase}</span>
                    <input
                      type="text"
                      value={ms.title}
                      onChange={(e) => {
                        const next = [...milestones];
                        next[idx] = { ...ms, title: e.target.value };
                        setMilestones(next);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-outline-variant/40 bg-transparent text-on-surface font-body-sm"
                    />
                    <input
                      type="date"
                      value={ms.targetDate}
                      onChange={(e) => {
                        const next = [...milestones];
                        next[idx] = { ...ms, targetDate: e.target.value };
                        setMilestones(next);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-outline-variant/40 bg-transparent text-on-surface font-body-sm"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="flex flex-col gap-4">
              <span className="font-label-xs uppercase text-secondary font-bold">04 · Master Rights &amp; OHADA Digital Signature</span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="font-label-xs uppercase text-on-surface-variant">Distributor / DSP Oracle</label>
                  <input
                    type="text"
                    value={distributor}
                    onChange={(e) => setDistributor(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-xs uppercase text-on-surface-variant">Next-of-Kin / Witness</label>
                  <input
                    type="text"
                    value={nextOfKinName}
                    onChange={(e) => setNextOfKinName(e.target.value)}
                    placeholder="Full legal name"
                    className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-label-xs uppercase text-on-surface-variant">Witness Phone (+237)</label>
                  <input
                    type="tel"
                    value={nextOfKinPhone}
                    onChange={(e) => setNextOfKinPhone(e.target.value)}
                    placeholder="2376XXXXXXXX"
                    className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num text-on-surface"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={masterRightsOwned}
                  onChange={(e) => setMasterRightsOwned(e.target.checked)}
                  className="mt-1 accent-secondary"
                />
                <span className="font-body-sm text-on-surface-variant">
                  I legally attest under Cameroon &amp; OHADA Uniform Act provisions that I hold 100% of master &amp; neighboring
                  rights (or label mandate) for this project and authorize Crippo CamPay Escrow to administer the {revSharePct}%
                  revenue share ({pctPerShare}% per share) for {roiDurationMonths} months.
                </span>
              </label>

              <div className="flex flex-col gap-1">
                <label className="font-label-xs uppercase text-on-surface-variant">Typed Digital Signature</label>
                <input
                  type="text"
                  required
                  value={signatureText}
                  onChange={(e) => setSignatureText(e.target.value)}
                  placeholder="Type your full legal name to sign"
                  className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-headline-sm text-secondary"
                />
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="flex flex-col gap-4">
              <span className="font-label-xs uppercase text-secondary font-bold">05 · Review &amp; Submit</span>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 font-body-sm tabular-nums">
                <div>
                  <dt className="font-label-xs uppercase text-on-surface-variant">Project</dt>
                  <dd className="text-on-surface font-bold">{title || '—'}</dd>
                </div>
                <div>
                  <dt className="font-label-xs uppercase text-on-surface-variant">Category · Region</dt>
                  <dd className="text-on-surface">
                    {category} · {REGIONS.find((r) => r.id === listenerRegion)?.label}
                  </dd>
                </div>
                <div>
                  <dt className="font-label-xs uppercase text-on-surface-variant">Net Budget → Gross Target</dt>
                  <dd className="text-on-surface">
                    {netBudgetXAF.toLocaleString()} → {grossTargetXAF.toLocaleString()} XAF
                  </dd>
                </div>
                <div>
                  <dt className="font-label-xs uppercase text-on-surface-variant">Shares · Price · Rev Share</dt>
                  <dd className="text-on-surface">
                    {totalShares} × {unitSharePriceXAF.toLocaleString()} XAF · {revSharePct}% for {roiDurationMonths}m
                  </dd>
                </div>
                <div>
                  <dt className="font-label-xs uppercase text-on-surface-variant">Revenue Channels</dt>
                  <dd className="text-on-surface">{monitorableSources.join(', ')}</dd>
                </div>
                <div>
                  <dt className="font-label-xs uppercase text-on-surface-variant">Signed By</dt>
                  <dd className="text-on-surface">{signatureText || '—'}</dd>
                </div>
              </dl>
              <p className="font-body-sm text-on-surface-variant">
                Submitting runs the AI underwriter, then sends the raise to Admin for review. It goes live only after the
                share-split offer is confirmed.
              </p>
            </section>
          )}

          {/* Step navigation */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-outline-variant/25">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="px-4 py-2.5 rounded-xl border border-outline-variant/50 text-on-surface font-label-md font-bold disabled:opacity-40"
            >
              Back
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                disabled={!canGoNext}
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                className="px-4 py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md font-bold disabled:opacity-50"
              >
                Next: {STEPS[step + 1].label}
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting || !isKycCleared}
                onClick={() => handleRunUnderwriter(true)}
                className="px-4 py-3 rounded-xl bg-on-tertiary-container text-white font-headline-sm text-[14px] font-bold uppercase tracking-wider hover:opacity-95 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit for Admin Offer'}
              </button>
            )}
          </div>
        </div>

        {/* Right: sticky valuation audit (visible on every step) */}
        <aside className="lg:col-span-4 lg:sticky lg:top-28 lg:border-l lg:border-outline-variant/25 lg:pl-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="font-label-xs uppercase tracking-wider text-secondary font-bold">Crippo Valuation Audit</span>
          </div>

          <div className="flex flex-col items-center py-2">
            <svg width="136" height="136" className="-rotate-90">
              <circle cx="68" cy="68" r={radius} stroke="currentColor" strokeWidth="10" fill="transparent" className="text-surface-container" />
              <circle
                cx="68"
                cy="68"
                r={radius}
                stroke="currentColor"
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={circ}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="text-secondary transition-all duration-500"
              />
            </svg>
            <div className="-mt-24 mb-10 text-center tabular-nums">
              <span className="font-display-lg-mobile font-mono-num text-on-surface block">
                {auditPreview ? auditPreview.crippoScore : '--'}
              </span>
              <span className="font-label-xs uppercase text-on-surface-variant">/ 100 Index</span>
            </div>
          </div>

          {auditPreview && (
            <div className="flex flex-col gap-2.5 py-3 border-t border-b border-outline-variant/25 text-[12px] tabular-nums">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Projected Gross:</span>
                <span className="font-mono-num font-bold text-on-tertiary-container">
                  {auditPreview.projectedRevenueXAF.toLocaleString()} XAF
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">AI Fair Split:</span>
                <span className="font-mono-num font-bold text-secondary">
                  {auditPreview.valuationBreakdown.recommendedTotalShares.toLocaleString()} sh @{' '}
                  {auditPreview.valuationBreakdown.fairSharePriceXAF.toLocaleString()} XAF
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Spotify / Audiomack:</span>
                <span className="font-mono-num font-bold text-on-surface">
                  {auditPreview.valuationBreakdown.spotifyRateXAF} / {auditPreview.valuationBreakdown.audiomackRateXAF} XAF
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">YouTube RPM:</span>
                <span className="font-mono-num font-bold text-on-surface">
                  {auditPreview.valuationBreakdown.youtubeRpmXAF.toLocaleString()} XAF/1k
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTotalShares(auditPreview.valuationBreakdown.recommendedTotalShares);
                  showToast(
                    'Share Split Applied',
                    `${auditPreview.valuationBreakdown.recommendedTotalShares} shares @ ${auditPreview.valuationBreakdown.fairSharePriceXAF.toLocaleString()} XAF covers your ${grossTargetXAF.toLocaleString()} XAF gross target.`
                  );
                }}
                className="py-2 px-3 rounded-lg bg-secondary/15 text-secondary font-label-xs uppercase font-bold hover:bg-secondary/25 transition-colors"
              >
                Apply AI Share Split ({auditPreview.valuationBreakdown.recommendedTotalShares} shares)
              </button>
              <p className="font-body-sm text-on-surface-variant pt-1 border-t border-outline-variant/20">
                {auditPreview.regionalValuationNote}
              </p>
              <p className="font-body-sm text-on-surface">{auditPreview.rationale}</p>
            </div>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={() => handleRunUnderwriter(false)}
            className="w-full py-3 rounded-xl border border-outline-variant/50 text-on-surface font-label-md font-bold hover:border-secondary disabled:opacity-60"
          >
            {submitting ? 'Auditing Metrics...' : 'Preview Regional Valuation'}
          </button>
        </aside>
      </div>
    </div>
  );
}
