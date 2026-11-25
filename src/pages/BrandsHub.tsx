import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { doc, setDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import { useLanguage } from '../contexts/LanguageContext';
import { AuthPromptModal } from '../components/AuthPromptModal';
import { VerifiedCreatorOnly } from '../components/VerifiedCreatorOnly';
import { isBrandEntity } from '../utils/entityDirectory';

interface BrandsHubProps {
  onOpenApiSetup: () => void;
}

export function BrandsHub({ onOpenApiSetup }: BrandsHubProps) {
  const { user, profile, privateInfo } = useAuth();
  const { campaigns, entities, races, myPayments, isAdmin, isVerifiedCreator, showToast } = useMarket();
  const { lang } = useLanguage();

  const [hubTab, setHubTab] = useState<'brands' | 'creator'>('brands');
  const [authPromptAction, setAuthPromptAction] = useState<string | null>(null);

  if (!isVerifiedCreator && !isAdmin) {
    return (
      <div className="max-w-xl mx-auto py-14 text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-black text-white flex items-center justify-center">
          <span className="material-symbols-outlined text-[24px]">verified_user</span>
        </div>
        <h1 className="font-headline-sm text-on-surface font-bold">
          Verified Creators Only
        </h1>
        <p className="font-body-md text-on-surface-variant">
          The Brands &amp; Partnerships Hub is exclusive to KYC-verified creators and labels on Crippo. Claim your creator profile or submit an application memo to unlock access.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link
            to="/creators?claim=1"
            className="px-5 py-2.5 rounded-xl bg-secondary text-white font-label-md font-bold"
          >
            Verify Creator Profile
          </Link>
          <Link
            to="/"
            className="px-5 py-2.5 rounded-xl border border-outline-variant/50 text-on-surface font-label-md font-bold hover:border-secondary"
          >
            Back to Market Feed
          </Link>
        </div>
      </div>
    );
  }

  // Corporate Escrow Builder
  const [brandName, setBrandName] = useState(profile?.displayName || '');
  const [title, setTitle] = useState('');
  const [niche, setNiche] = useState('Music & Entertainment');
  const [city, setCity] = useState(profile?.city || 'Douala');
  const [budgetXAF, setBudgetXAF] = useState(250000);
  const [brief, setBrief] = useState('');
  const [phone, setPhone] = useState(privateInfo?.phone || '2376');
  const [busy, setBusy] = useState(false);

  const myEntity = useMemo(
    () =>
      entities.find(
        (e) => e.id === profile?.claimedEntityId || e.claimedByUid === user?.uid
      ) || null,
    [entities, profile, user]
  );

  const myCreatorRaces = useMemo(
    () => (user ? races.filter((r) => r.creatorUid === user.uid) : []),
    [races, user]
  );

  const brandEscrowPayments = useMemo(
    () => myPayments.filter((p) => p.type === 'BRAND_ESCROW'),
    [myPayments]
  );

  const totalBrandEscrowXAF = useMemo(
    () => campaigns.reduce((a, c) => a + c.budgetXAF, 0),
    [campaigns]
  );
  const totalFanRaceCapitalXAF = useMemo(
    () => races.reduce((a, r) => a + r.sharesSold * r.currentSharePriceXAF, 0),
    [races]
  );

  const indexedBrands = useMemo(
    () => entities.filter((e) => isBrandEntity(e)),
    [entities]
  );

  const handleCreateEscrowCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setAuthPromptAction('bond a brand sponsorship escrow');
      return;
    }
    if (!user.emailVerified) {
      showToast('Verified Account Required', 'Sign in with a verified email first.', 'error');
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (!/^2376[0-9]{8}$/.test(cleanPhone)) {
      showToast('Valid MoMo Line Required', 'Use format 2376XXXXXXXX.', 'error');
      return;
    }
    if (budgetXAF < 10000 || brief.trim().length < 10 || title.trim().length < 2) {
      showToast(
        'Campaign Validation',
        'Title (2+ chars), brief (10+ chars), and minimum 10,000 XAF budget required.',
        'error'
      );
      return;
    }

    setBusy(true);
    const campId = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const payId = `pay_brand_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      const resp = await apiFetch<{ reference: string; ussd_code?: string; link?: string }>(
        '/api/payments/fapshi/collect',
        {
          method: 'POST',
          body: JSON.stringify({
            amountXAF: budgetXAF,
            phone: cleanPhone,
            description: `Crippo Brand Escrow: ${title.trim()}`,
            externalReference: payId,
            redirectUrl: window.location.href,
          }),
        }
      );

      await setDoc(doc(db, 'payments', payId), {
        id: payId,
        uid: user.uid,
        type: 'BRAND_ESCROW',
        reference: resp.reference,
        amountXAF: budgetXAF,
        provider: 'FAPSHI',
        status: 'PENDING',
        campaignId: campId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (resp.link) {
        window.open(resp.link, '_blank');
      }

      showToast(
        'Authorize Corporate Escrow',
        `Complete Fapshi payment for ${budgetXAF.toLocaleString()} XAF...`,
        'info'
      );

      let settled = false;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const check = await apiFetch<{ status: string }>(
          `/api/payments/fapshi/status/${encodeURIComponent(resp.reference)}`
        );
        if (check.status === 'SUCCESSFUL') {
          settled = true;
          break;
        }
        if (check.status === 'FAILED') throw new Error('Fapshi payment declined.');
      }
      if (!settled) throw new Error('Payment confirmation timed out.');

      await updateDoc(doc(db, 'payments', payId), {
        status: 'SUCCESSFUL',
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'campaigns', campId), {
        id: campId,
        brandUid: user.uid,
        brandName: (brandName || profile?.displayName || 'Sponsor').trim().slice(0, 100),
        title: title.trim().slice(0, 140),
        niche,
        city,
        budgetXAF,
        commissionPct: 8,
        brief: brief.trim().slice(0, 1000),
        applicantEntityIds: [],
        escrowPaymentRef: resp.reference,
        status: 'funded_escrow',
        isPublic: true,
        createdAt: serverTimestamp(),
      });

      setTitle('');
      setBrief('');
      showToast(
        'Corporate Escrow Bonded',
        `${budgetXAF.toLocaleString()} XAF locked in Fapshi escrow for creators.`
      );
    } catch (err: unknown) {
      const er = err as Error & { missingKeys?: string[] };
      if (isAdmin && er.missingKeys?.length) onOpenApiSetup();
      showToast('Escrow Error', er.message || 'Could not fund brand escrow.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleApplyToCampaign = async (campId: string) => {
    if (!user) {
      setAuthPromptAction('apply to a brand sponsorship');
      return;
    }
    if (!user.emailVerified || !myEntity || myEntity.kycStatus !== 'verified') {
      showToast(
        'Verified Creator Required',
        'Claim and verify your Creator Profile before applying to funded brand deals.',
        'error'
      );
      return;
    }
    try {
      await updateDoc(doc(db, 'campaigns', campId), {
        applicantEntityIds: arrayUnion(myEntity.id),
      });
      showToast('Application Submitted', `${myEntity.stageName} submitted to sponsor brief.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `campaigns/${campId}`);
    }
  };

  const handleAwardCampaign = async (campId: string, entityId: string) => {
    try {
      await updateDoc(doc(db, 'campaigns', campId), {
        selectedEntityId: entityId,
        status: 'completed',
      });
      showToast('Creator Awarded', 'Sponsor escrow assigned to selected verified creator.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `campaigns/${campId}`);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header & Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-outline-variant/25 pb-4">
        <div>
          <span className="font-label-xs uppercase tracking-widest text-secondary">
            {lang === 'fr' ? 'Partenariats & Gestion Labels' : 'Corporate Escrow & Roster Desk'}
          </span>
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-on-surface mt-1 font-bold">
            {hubTab === 'brands' ? 'Brand Deals & Fapshi Escrow' : 'Creator & Label Hub'}
          </h1>
        </div>

        <div className="flex items-center gap-5 self-start">
          <button
            type="button"
            onClick={() => setHubTab('brands')}
            className={`pb-2 font-label-xs uppercase font-bold border-b-2 transition-colors ${
              hubTab === 'brands'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Brand Deals &amp; Escrow
          </button>
          <button
            type="button"
            onClick={() => setHubTab('creator')}
            className={`pb-2 font-label-xs uppercase font-bold border-b-2 transition-colors ${
              hubTab === 'creator'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Creator &amp; Label Hub
          </button>
        </div>
      </div>

      {hubTab === 'brands' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left 7 Cols: Live Funded Campaigns & Capital Injection Matrix */}
          <div className="lg:col-span-7 flex flex-col gap-7">
            {/* Non-Dilutive Capital Injection Matrix (Borderless) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pb-5 border-b border-outline-variant/25 tabular-nums">
              <div>
                <span className="font-label-xs uppercase text-on-surface-variant block">
                  Corporate Brand Escrow
                </span>
                <span className="font-headline-sm font-mono-num text-on-surface mt-1 block font-bold">
                  {totalBrandEscrowXAF.toLocaleString()} XAF
                </span>
              </div>
              <div>
                <span className="font-label-xs uppercase text-on-surface-variant block">
                  Fan Capital Raises
                </span>
                <span className="font-headline-sm font-mono-num text-on-tertiary-container mt-1 block font-bold">
                  {totalFanRaceCapitalXAF.toLocaleString()} XAF
                </span>
              </div>
              <div>
                <span className="font-label-xs uppercase text-on-surface-variant block">
                  Clearing Commission
                </span>
                <span className="font-headline-sm font-mono-num text-on-surface mt-1 block font-bold">
                  8.0% Flat
                </span>
              </div>
            </div>

            {/* Active Briefs */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="font-headline-sm text-on-surface font-bold">
                  Funded Corporate Briefs ({campaigns.length})
                </h2>
                <span className="font-label-xs uppercase text-on-tertiary-container font-bold">
                  100% Upfront Escrow
                </span>
              </div>

              {campaigns.length === 0 ? (
                <p className="font-body-md text-on-surface-variant py-6 text-center">
                  No corporate sponsorship escrows published yet. Fund the first brief using the Corporate Escrow Builder.
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/25 border-t border-outline-variant/25">
                  {campaigns.map((c) => {
                    const isOwner = user && c.brandUid === user.uid;
                    const alreadyApplied =
                      myEntity && c.applicantEntityIds?.includes(myEntity.id);
                    return (
                      <div
                        key={c.id}
                        className="py-4 flex flex-col gap-2.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-secondary-fixed text-secondary font-label-xs uppercase font-bold">
                                {c.brandName}
                              </span>
                              <span className="font-label-xs text-on-surface-variant">
                                {c.niche} · {c.city}
                              </span>
                            </div>
                            <h3 className="font-headline-sm text-[17px] text-on-surface mt-1 font-bold">
                              {c.title}
                            </h3>
                          </div>
                          <div className="text-right tabular-nums">
                            <span className="font-ticker-val text-on-tertiary-container font-bold block">
                              {c.budgetXAF.toLocaleString()} XAF
                            </span>
                            <span className="font-label-xs uppercase text-secondary">
                              {c.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>

                        <p className="font-body-sm text-on-surface-variant">{c.brief}</p>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span className="font-label-xs text-on-surface-variant">
                            {c.applicantEntityIds?.length || 0} verified applicants · Ref:{' '}
                            {c.escrowPaymentRef || 'Pending'}
                          </span>
                          {!isOwner && c.status !== 'completed' && (
                            <button
                              type="button"
                              disabled={Boolean(alreadyApplied)}
                              onClick={() => handleApplyToCampaign(c.id)}
                              className="px-3.5 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-xs uppercase font-bold disabled:opacity-50"
                            >
                              {alreadyApplied ? 'Applied' : 'Apply as Creator'}
                            </button>
                          )}
                        </div>

                        {isOwner &&
                          c.status !== 'completed' &&
                          c.applicantEntityIds &&
                          c.applicantEntityIds.length > 0 && (
                            <div className="pt-2 border-t border-outline-variant/25 flex flex-wrap items-center gap-2">
                              <span className="font-label-xs uppercase text-on-surface-variant">
                                Award Escrow To:
                              </span>
                              {c.applicantEntityIds.map((entId) => {
                                const ent = entities.find((e) => e.id === entId);
                                return (
                                  <button
                                    key={entId}
                                    type="button"
                                    onClick={() => handleAwardCampaign(c.id, entId)}
                                    className="px-2.5 py-1 rounded bg-on-tertiary-container text-white font-label-xs font-bold"
                                  >
                                    Select {ent?.stageName || entId}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Indexed Cameroonian Brand Sponsors (20) */}
            <div className="border-t border-outline-variant/25 pt-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-sm text-on-surface font-bold">
                  Indexed Cameroon Brand Sponsors ({indexedBrands.length})
                </h3>
                <Link
                  to="/creators"
                  className="font-label-xs uppercase text-secondary font-bold hover:underline"
                >
                  Open Directory →
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {indexedBrands.map((b) => (
                  <Link
                    key={b.id}
                    to={`/creator/${b.id}`}
                    className="p-3.5 rounded-xl border border-outline-variant/25 hover:border-secondary transition-colors flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-label-md font-bold text-on-surface truncate">
                        {b.brandName || b.stageName}
                      </span>
                      <span className="text-[10px] font-label-xs uppercase font-bold text-secondary shrink-0">
                        {b.industryVertical || b.category}
                      </span>
                    </div>
                    <span className="text-[12px] text-on-surface-variant">
                      {b.typicalCampaignTier || 'Mid-Market (250K–1M XAF)'} · {b.city}
                    </span>
                    {b.targetNiches && b.targetNiches.length > 0 && (
                      <span className="text-[11px] text-on-surface-variant truncate">
                        Niches: {b.targetNiches.join(', ')}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>

            {/* BEAC Clearing Log */}
            {brandEscrowPayments.length > 0 && (
              <div className="border-t border-outline-variant/25 pt-5 flex flex-col gap-3">
                <h3 className="font-headline-sm text-on-surface font-bold">
                  BEAC &amp; Fapshi Corporate Clearing Log
                </h3>
                <div className="divide-y divide-outline-variant/20">
                  {brandEscrowPayments.map((p) => (
                    <div
                      key={p.id}
                      className="py-2.5 flex justify-between font-body-sm tabular-nums"
                    >
                      <span className="font-mono-num">{p.reference}</span>
                      <span className="font-bold text-on-tertiary-container">
                        {p.amountXAF.toLocaleString()} XAF ({p.status})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right 5 Cols: Corporate Escrow Builder (Borderless) */}
          <form
            onSubmit={handleCreateEscrowCampaign}
            className="lg:col-span-5 lg:border-l lg:border-outline-variant/25 lg:pl-6 flex flex-col gap-4"
          >
            <div>
              <span className="font-label-xs uppercase text-secondary font-bold">
                Corporate Escrow Builder
              </span>
              <h2 className="font-headline-sm text-on-surface mt-1 font-bold">
                Bond Sponsorship via Fapshi
              </h2>
              <p className="font-body-sm text-on-surface-variant mt-0.5">
                Lock campaign funds in escrow upfront; 8% protocol clearing fee applies upon creator delivery.
              </p>
            </div>

            <input
              type="text"
              required
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Brand / Company Name (e.g. Orange Cameroon)"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            />
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Campaign Title (e.g. Summer #237 Creator Challenge)"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="Niche"
                className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
              />
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">
                Escrow Budget (min 10,000 XAF)
              </label>
              <input
                type="number"
                min={10000}
                step={10000}
                required
                value={budgetXAF}
                onChange={(e) => setBudgetXAF(Math.max(10000, Number(e.target.value) || 10000))}
                className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num text-on-surface"
              />
            </div>
            <textarea
              required
              rows={3}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Deliverables, TikTok/YouTube hashtag integration, and payout milestones..."
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            />
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="237677821940"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num text-on-surface"
            />

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3.5 rounded-xl bg-on-tertiary-container text-white font-headline-sm text-[14px] font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {busy ? 'Settling Fapshi...' : `Lock ${budgetXAF.toLocaleString()} XAF Escrow`}
            </button>
          </form>
        </div>
      ) : (
        /* Creator & Label Hub Tab (Borderless) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 flex flex-col gap-4">
            <span className="font-label-xs uppercase text-secondary font-bold">
              Active Roster &amp; Mandate Vault
            </span>
            {myEntity ? (
              <div className="flex flex-col gap-3">
                <h3 className="font-headline-sm text-on-surface font-bold">{myEntity.stageName}</h3>
                <div className="py-3 border-t border-b border-outline-variant/25 font-body-sm flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Classification:</span>
                    <span className="font-bold uppercase">{myEntity.entityType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">KYC Status:</span>
                    <span className="font-bold uppercase text-on-tertiary-container">
                      {myEntity.kycStatus}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">NIU / Tax ID:</span>
                    <span className="font-mono-num">{myEntity.niuNumber || 'Pending'}</span>
                  </div>
                  {myEntity.rccmNumber && (
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">OHADA RCCM:</span>
                      <span className="font-mono-num">{myEntity.rccmNumber}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    to="/profile"
                    className="flex-1 py-2.5 rounded-xl border border-outline-variant/50 text-center font-label-md font-bold text-on-surface hover:border-secondary"
                  >
                    Manage Dossier
                  </Link>
                  <VerifiedCreatorOnly targetEntityId={myEntity.id} requireCanLaunch>
                    <Link
                      to="/launch-race"
                      className="flex-1 py-2.5 rounded-xl bg-secondary text-center font-label-md font-bold text-white"
                    >
                      + Launch Raise
                    </Link>
                  </VerifiedCreatorOnly>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="font-body-sm text-on-surface-variant">
                  No creator or agency dossier claimed yet on this account.
                </p>
                <Link
                  to="/profile"
                  className="py-2.5 px-4 rounded-xl bg-secondary text-on-secondary font-label-md font-bold text-center"
                >
                  Claim Creator / Label Profile
                </Link>
              </div>
            )}
          </div>

          <div className="lg:col-span-7 lg:border-l lg:border-outline-variant/25 lg:pl-6 flex flex-col gap-4">
            <h2 className="font-headline-sm text-on-surface font-bold">
              Your Issued Capital Raises ({myCreatorRaces.length})
            </h2>
            {myCreatorRaces.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant py-6">
                You have not launched any capital Raises yet.
              </p>
            ) : (
              <div className="divide-y divide-outline-variant/25 border-t border-outline-variant/25">
                {myCreatorRaces.map((r) => (
                  <Link
                    key={r.id}
                    to={`/race/${r.id}`}
                    className="py-4 hover:text-secondary flex items-center justify-between gap-3"
                  >
                    <div>
                      <h4 className="font-label-md font-bold text-on-surface">{r.title}</h4>
                      <span className="font-body-sm text-on-surface-variant">
                        {r.sharesSold}/{r.totalShares} shares · {r.revSharePct}% Rev Share · Status:{' '}
                        <strong className="uppercase text-secondary">{r.status}</strong>
                      </span>
                    </div>
                    <span className="font-ticker-val text-on-surface tabular-nums">
                      {r.currentSharePriceXAF.toLocaleString()} XAF
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {authPromptAction && (
        <AuthPromptModal
          actionLabel={authPromptAction}
          onClose={() => setAuthPromptAction(null)}
        />
      )}
    </div>
  );
}
