import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../services/firebase';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import { useLanguage } from '../contexts/LanguageContext';
import { AuthPromptModal } from '../components/AuthPromptModal';
import { VerifiedCreatorOnly } from '../components/VerifiedCreatorOnly';
import { getCoverImage } from '../utils/media';
import type { Entity } from '../types/crippo';

interface CreatorProfileProps {
  onOpenApiSetup: () => void;
}

export function CreatorProfile({ onOpenApiSetup }: CreatorProfileProps) {
  const { user, profile, privateInfo } = useAuth();
  const {
    entities,
    races,
    myMemos,
    isAdmin,
    isVerifiedCreator,
    claimedEntity,
    isVerifiedAgency,
    showToast,
  } = useMarket();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const { id: routeEntityId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();

  const initialTab: 'dossier' | 'kyc' | 'memo' =
    searchParams.get('memo') === '1'
      ? 'memo'
      : searchParams.get('claim') === '1'
      ? 'kyc'
      : 'dossier';

  const [viewTab, setViewTab] = useState<'dossier' | 'kyc' | 'memo'>(initialTab);
  const [selectedEntityId, setSelectedEntityId] = useState<string>(routeEntityId || '');
  const [directorySearch, setDirectorySearch] = useState('');
  const [authPromptAction, setAuthPromptAction] = useState<string | null>(null);

  useEffect(() => {
    if (routeEntityId) setSelectedEntityId(routeEntityId);
  }, [routeEntityId]);

  useEffect(() => {
    if (searchParams.get('memo') === '1') setViewTab('memo');
    else if (searchParams.get('claim') === '1') setViewTab('kyc');
  }, [searchParams]);

  // KYC & Claim Terminal States
  const [affiliation, setAffiliation] = useState<'solo' | 'agency'>(
    profile?.affiliationType || 'solo'
  );
  const [agencyName, setAgencyName] = useState(profile?.agencyName || '');
  const [rccmNumber, setRccmNumber] = useState('');
  const [legalFullName, setLegalFullName] = useState(
    privateInfo?.fullNameLegal || profile?.displayName || ''
  );
  const [cniNumber, setCniNumber] = useState(privateInfo?.cniNumber || '');
  const [niuNumber, setNiuNumber] = useState(privateInfo?.niuNumber || '');
  const [cniFrontUrl, setCniFrontUrl] = useState(privateInfo?.cniFrontUrl || '');
  const [cniBackUrl, setCniBackUrl] = useState(privateInfo?.cniBackUrl || '');
  const [uploadingField, setUploadingField] = useState<string>('');

  const [entitySearch, setEntitySearch] = useState('');
  const [claimTarget, setClaimTarget] = useState<Entity | null>(null);
  const [syncingCreators, setSyncingCreators] = useState(false);
  const [savingKyc, setSavingKyc] = useState(false);

  // Wikipedia Bio & Upcoming Projects editing (for profile owner)
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [projectsDraft, setProjectsDraft] = useState('');
  const [savingBio, setSavingBio] = useState(false);

  // Agency -> Solo Creator Affiliation Request
  const [affMessage, setAffMessage] = useState('');
  const [sendingAff, setSendingAff] = useState(false);

  // Paid Memo States (Submitted to Admin ONLY after CamPay settlement)
  const [memoTier, setMemoTier] = useState<'fan_2000' | 'fast_track_5000'>('fast_track_5000');
  const [memoFullName, setMemoFullName] = useState(profile?.displayName || '');
  const [memoStageName, setMemoStageName] = useState('');
  const [memoLink, setMemoLink] = useState('');
  const [memoSocialAccounts, setMemoSocialAccounts] = useState('');
  const [memoShortBio, setMemoShortBio] = useState('');
  const [memoMotivation, setMemoMotivation] = useState('');
  const [memoPhone, setMemoPhone] = useState(privateInfo?.phone || '2376');
  const [memoBusy, setMemoBusy] = useState(false);

  const paidMyMemos = useMemo(
    () => myMemos.filter((m) => m.status !== 'pending_payment' && m.paymentCompleted !== false),
    [myMemos]
  );

  useEffect(() => {
    if (!selectedEntityId) {
      if (claimedEntity) setSelectedEntityId(claimedEntity.id);
      else if (entities[0]) setSelectedEntityId(entities[0].id);
    }
  }, [entities, claimedEntity, selectedEntityId]);

  useEffect(() => {
    if (claimedEntity) {
      setClaimTarget(claimedEntity);
      if (claimedEntity.rccmNumber) setRccmNumber(claimedEntity.rccmNumber);
      if (claimedEntity.niuNumber) setNiuNumber(claimedEntity.niuNumber);
      if (claimedEntity.legalFullName) setLegalFullName(claimedEntity.legalFullName);
      if (claimedEntity.agencyName) setAgencyName(claimedEntity.agencyName);
    }
  }, [claimedEntity]);

  useEffect(() => {
    if (privateInfo?.phone && memoPhone === '2376') {
      setMemoPhone(privateInfo.phone);
    }
  }, [privateInfo?.phone, memoPhone]);

  const filteredDirectory = useMemo(() => {
    const q = directorySearch.trim().toLowerCase();
    return entities.filter((e) => {
      if (!q) return true;
      return (
        e.stageName.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q) ||
        (e.agencyName || '').toLowerCase().includes(q)
      );
    });
  }, [entities, directorySearch]);

  const activeDossier = useMemo(
    () =>
      entities.find((e) => e.id === selectedEntityId) ||
      filteredDirectory[0] ||
      claimedEntity ||
      entities[0] ||
      null,
    [entities, filteredDirectory, selectedEntityId, claimedEntity]
  );

  useEffect(() => {
    if (activeDossier) {
      setBioDraft(activeDossier.bio || '');
      setProjectsDraft((activeDossier.upcomingProjects || []).join('\n'));
    }
  }, [activeDossier?.id]);

  const entityRaces = useMemo(
    () => (activeDossier ? races.filter((r) => r.entityId === activeDossier.id) : []),
    [races, activeDossier]
  );

  const rosterArtists = useMemo(() => {
    if (!activeDossier || activeDossier.entityType !== 'agency') return [];
    return entities.filter(
      (e) =>
        e.affiliatedAgencyId === activeDossier.id ||
        (activeDossier.claimedByUid && e.affiliatedAgencyUid === activeDossier.claimedByUid)
    );
  }, [entities, activeDossier]);

  const searchableEntities = useMemo(() => {
    const q = entitySearch.trim().toLowerCase();
    return entities
      .filter((e) => !e.isClaimed || e.claimedByUid === user?.uid)
      .filter((e) =>
        !q
          ? true
          : e.stageName.toLowerCase().includes(q) ||
            e.city.toLowerCase().includes(q) ||
            e.category.toLowerCase().includes(q)
      );
  }, [entities, entitySearch, user]);

  const handshakeCode = useMemo(() => {
    if (claimedEntity?.bioVerificationCode) return claimedEntity.bioVerificationCode;
    const suffix = (user?.uid || 'CRIPPO').slice(0, 4).toUpperCase();
    return `CRIPPO-${suffix}`;
  }, [claimedEntity, user]);

  const isViewingOwnClaimed = Boolean(
    user && activeDossier && activeDossier.isClaimed && activeDossier.claimedByUid === user.uid
  );
  const isOwnPending = Boolean(
    isViewingOwnClaimed && activeDossier?.kycStatus === 'pending'
  );
  const isOwnVerified = Boolean(
    isViewingOwnClaimed && activeDossier?.kycStatus === 'verified'
  );

  const canAgencyInviteTarget = Boolean(
    isVerifiedAgency &&
      claimedEntity &&
      activeDossier &&
      activeDossier.entityType === 'solo' &&
      activeDossier.isClaimed &&
      activeDossier.claimedByUid &&
      activeDossier.claimedByUid !== user?.uid &&
      !activeDossier.affiliatedAgencyId
  );

  const requireAuthRedirect = (targetPath: string) => {
    navigate(`/auth?skipSplash=1&mode=login&returnTo=${encodeURIComponent(targetPath)}`);
  };

  const handleFileUpload = async (file: File, field: 'cniFrontUrl' | 'cniBackUrl') => {
    if (!user) return;
    setUploadingField(field);
    try {
      const storageRef = ref(storage, `kyc/${user.uid}/${field}_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      if (field === 'cniFrontUrl') setCniFrontUrl(url);
      else setCniBackUrl(url);
      showToast('Document Uploaded', `${field === 'cniFrontUrl' ? 'CNI Front' : 'CNI Back'} stored securely.`);
    } catch (err: unknown) {
      showToast('Upload Failed', (err as Error).message || 'Could not upload file.', 'error');
    } finally {
      setUploadingField('');
    }
  };

  const handleSyncCreators = async () => {
    if (!user?.emailVerified) {
      showToast('Verified Account Required', 'Sign in with a verified email first.', 'error');
      return;
    }
    setSyncingCreators(true);
    try {
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
        body: JSON.stringify({ query: directorySearch.trim() || entitySearch.trim() || 'Cameroon Afropop creator' }),
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
      showToast('Creators Synced', `${saved} profiles indexed from live APIs.`);
    } catch (err: unknown) {
      const e = err as Error & { missingKeys?: string[] };
      if (isAdmin && e.missingKeys?.length) onOpenApiSetup();
      showToast('Sync Error', e.message || 'Could not sync creators.', 'error');
    } finally {
      setSyncingCreators(false);
    }
  };

  const handleSaveBioAndProjects = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDossier || !isViewingOwnClaimed) return;
    setSavingBio(true);
    try {
      const upcoming = projectsDraft
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);
      await updateDoc(doc(db, 'entities', activeDossier.id), {
        bio: bioDraft.trim().slice(0, 600),
        upcomingProjects: upcoming,
        updatedAt: serverTimestamp(),
      });
      setEditingBio(false);
      showToast('Profile Updated', 'Bio and upcoming projects saved.');
    } catch (err: unknown) {
      showToast('Update Error', (err as Error).message || 'Could not update profile.', 'error');
    } finally {
      setSavingBio(false);
    }
  };

  const handleSendAffiliationInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !claimedEntity || !activeDossier || !activeDossier.claimedByUid) return;
    setSendingAff(true);
    const reqId = `aff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const notifId = `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const labelDisplayName = claimedEntity.agencyName || claimedEntity.stageName;
    try {
      await setDoc(doc(db, 'affiliation_requests', reqId), {
        id: reqId,
        agencyUid: user.uid,
        agencyEntityId: claimedEntity.id,
        agencyName: labelDisplayName,
        creatorUid: activeDossier.claimedByUid,
        creatorEntityId: activeDossier.id,
        creatorStageName: activeDossier.stageName,
        ...(affMessage.trim() ? { message: affMessage.trim().slice(0, 400) } : {}),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        recipientUid: activeDossier.claimedByUid,
        type: 'affiliation_request',
        title: `Label Roster Invitation from ${labelDisplayName}`,
        message:
          affMessage.trim().slice(0, 400) ||
          `${labelDisplayName} invited ${activeDossier.stageName} to join their label roster on Crippo.`,
        requestId: reqId,
        entityId: claimedEntity.id,
        read: false,
        createdAt: serverTimestamp(),
      });

      setAffMessage('');
      showToast('Invitation Sent', `Label affiliation request sent to ${activeDossier.stageName}.`);
    } catch (err: unknown) {
      showToast('Invite Error', (err as Error).message || 'Could not send affiliation invite.', 'error');
    } finally {
      setSendingAff(false);
    }
  };

  const handleSubmitKycClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setAuthPromptAction('claim and verify a creator profile');
      return;
    }
    if (!profile || !user.emailVerified) {
      requireAuthRedirect('/creators?claim=1');
      return;
    }
    if (!claimTarget) {
      showToast('Select Creator Profile', 'Pick a profile below or request a Fast-Track Memo.', 'error');
      return;
    }
    if (!legalFullName.trim() || !cniNumber.trim() || !niuNumber.trim()) {
      showToast('Required Legal Fields', 'Legal Full Name, CNI Number, and Cameroon NIU are required.', 'error');
      return;
    }
    if (affiliation === 'agency' && (!agencyName.trim() || !rccmNumber.trim())) {
      showToast('Agency Compliance', 'Agency Name and OHADA RCCM Number are required.', 'error');
      return;
    }

    setSavingKyc(true);
    try {
      await updateDoc(doc(db, 'users', user.uid, 'private', 'info'), {
        fullNameLegal: legalFullName.trim().slice(0, 120),
        cniNumber: cniNumber.trim().slice(0, 40),
        niuNumber: niuNumber.trim().slice(0, 40),
        ...(cniFrontUrl ? { cniFrontUrl } : {}),
        ...(cniBackUrl ? { cniBackUrl } : {}),
        updatedAt: serverTimestamp(),
      });

      const nextKycStatus = 'pending';

      if (!claimTarget.isClaimed) {
        await updateDoc(doc(db, 'entities', claimTarget.id), {
          isClaimed: true,
          claimedByUid: user.uid,
          bioVerificationCode: handshakeCode,
          kycStatus: nextKycStatus,
          entityType: affiliation,
          ...(affiliation === 'agency' ? { agencyName: agencyName.trim(), rccmNumber: rccmNumber.trim() } : {}),
          niuNumber: niuNumber.trim(),
          legalFullName: legalFullName.trim(),
          updatedAt: serverTimestamp(),
        });
      } else if (claimTarget.claimedByUid === user.uid) {
        await updateDoc(doc(db, 'entities', claimTarget.id), {
          entityType: affiliation,
          ...(affiliation === 'agency' ? { agencyName: agencyName.trim(), rccmNumber: rccmNumber.trim() } : {}),
          niuNumber: niuNumber.trim(),
          kycStatus: nextKycStatus,
          legalFullName: legalFullName.trim(),
          updatedAt: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, 'users', user.uid), {
        creatorModeEnabled: true,
        claimedEntityId: claimTarget.id,
        kycStatus: nextKycStatus,
        affiliationType: affiliation,
        ...(affiliation === 'agency' ? { agencyName: agencyName.trim() } : {}),
        updatedAt: serverTimestamp(),
      });

      showToast(
        'Verification Submitted for Audit',
        `${claimTarget.stageName} claim is pending Admin KYC approval. Raise creation unlocks upon approval.`
      );
      setViewTab('dossier');
      setSelectedEntityId(claimTarget.id);
    } catch (err: unknown) {
      showToast('KYC Error', (err as Error).message || 'Could not save KYC claim.', 'error');
    } finally {
      setSavingKyc(false);
    }
  };

  const executePaidMemo = async (tier: 'fan_2000' | 'fast_track_5000', stageName: string, link: string) => {
    if (!user) {
      setAuthPromptAction('request a Creator Memo');
      return;
    }
    if (!user.emailVerified) {
      requireAuthRedirect(`/creators?memo=1`);
      return;
    }
    const cleanPhone = memoPhone.replace(/\D/g, '');
    if (!/^2376[0-9]{8}$/.test(cleanPhone)) {
      showToast('Invalid MoMo Line', 'Use Cameroon format 2376XXXXXXXX.', 'error');
      return;
    }
    if (
      !memoFullName.trim() ||
      !stageName.trim() ||
      link.trim().length < 5 ||
      !memoSocialAccounts.trim() ||
      !memoShortBio.trim() ||
      !memoMotivation.trim()
    ) {
      showToast(
        'Missing Application Details',
        'Complete Full Name, Stage Name, Social Accounts, Primary URL, Short Bio, and Motivation.',
        'error'
      );
      return;
    }

    setMemoBusy(true);
    const feeXAF = tier === 'fast_track_5000' ? 5000 : 2000;
    const memoId = `memo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const paymentId = `pay_memo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      const resp = await apiFetch<{ reference: string; ussd_code?: string }>(
        '/api/payments/campay/collect',
        {
          method: 'POST',
          body: JSON.stringify({
            amountXAF: feeXAF,
            phone: cleanPhone,
            description: `Crippo Creator Memo to 672638094 (${stageName.trim()})`,
            externalReference: paymentId,
          }),
        }
      );

      await setDoc(doc(db, 'payments', paymentId), {
        id: paymentId,
        uid: user.uid,
        type: 'MEMO_FEE',
        reference: resp.reference,
        amountXAF: feeXAF,
        provider: 'CAMPAY',
        status: 'PENDING',
        memoId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      showToast(
        'Confirm USSD to 672638094',
        `Authorize ${feeXAF.toLocaleString()} XAF (${resp.ussd_code || '*126#'}). Application submits after confirmation.`,
        'info'
      );

      let settled = false;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const check = await apiFetch<{ status: string }>(
          `/api/payments/campay/status/${encodeURIComponent(resp.reference)}`
        );
        if (check.status === 'SUCCESSFUL') {
          settled = true;
          break;
        }
        if (check.status === 'FAILED') throw new Error('CamPay payment declined. Memo application was not submitted.');
      }
      if (!settled) {
        throw new Error('CamPay USSD timed out. Complete payment to submit your Creator Memo.');
      }

      await updateDoc(doc(db, 'payments', paymentId), {
        status: 'SUCCESSFUL',
        updatedAt: serverTimestamp(),
      });

      const audit = await apiFetch<{ summary?: string; status?: string }>(
        '/api/agents/memo-audit',
        {
          method: 'POST',
          body: JSON.stringify({
            stageName: stageName.trim(),
            platformLink: link.trim(),
            tier,
          }),
        }
      );

      // Strictly create the memo ONLY AFTER CamPay confirms payment
      await setDoc(doc(db, 'memos', memoId), {
        id: memoId,
        requesterUid: user.uid,
        fullName: memoFullName.trim().slice(0, 120),
        stageName: stageName.trim().slice(0, 100),
        platformLink: link.trim().slice(0, 400),
        socialAccounts: memoSocialAccounts.trim().slice(0, 400),
        shortBio: memoShortBio.trim().slice(0, 600),
        motivation: memoMotivation.trim().slice(0, 800),
        recipientNumber: '672638094',
        paymentCompleted: true,
        tier,
        feeXAF,
        paymentReference: resp.reference,
        auditSummary: audit.summary || 'AI Memo under review by Admin Underwriting Desk.',
        status: 'auditing',
        createdAt: serverTimestamp(),
      });

      setMemoFullName('');
      setMemoStageName('');
      setMemoLink('');
      setMemoSocialAccounts('');
      setMemoShortBio('');
      setMemoMotivation('');
      showToast('Paid Memo Submitted', 'Payment to 672638094 confirmed & application sent to Admin Desk.');
    } catch (err: unknown) {
      const er = err as Error & { missingKeys?: string[] };
      if (isAdmin && er.missingKeys?.length) onOpenApiSetup();
      showToast('Memo Error', er.message || 'Paid Memo failed.', 'error');
    } finally {
      setMemoBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header & Sub-View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-outline-variant/25 pb-4">
        <div>
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-on-surface font-bold">
            {viewTab === 'dossier'
              ? 'Creators'
              : viewTab === 'memo'
              ? 'Request a Memo'
              : 'Claim Creator Profile'}
          </h1>
        </div>

        <div className="flex items-center gap-5 self-start overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setViewTab('dossier')}
            className={`pb-2 font-label-xs uppercase font-bold whitespace-nowrap border-b-2 transition-colors ${
              viewTab === 'dossier'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Creators Directory
          </button>
          <button
            type="button"
            onClick={() => setViewTab('memo')}
            className={`pb-2 font-label-xs uppercase font-bold whitespace-nowrap border-b-2 transition-colors ${
              viewTab === 'memo'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Request a Memo
          </button>
          <button
            type="button"
            onClick={() => {
              if (!user) {
                setAuthPromptAction('claim a creator profile');
                return;
              }
              setViewTab('kyc');
            }}
            className={`pb-2 font-label-xs uppercase font-bold whitespace-nowrap border-b-2 transition-colors ${
              viewTab === 'kyc'
                ? 'border-secondary text-secondary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Claim Profile ({claimedEntity?.kycStatus || 'start'})
          </button>
        </div>
      </div>

      {/* Pending Verification Banner */}
      {claimedEntity && claimedEntity.kycStatus === 'pending' && (
        <div className="py-3 border-l-2 border-secondary pl-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="font-label-md font-bold text-on-surface block">
              Verification Under Review — {claimedEntity.stageName}
            </span>
            <p className="font-body-sm text-on-surface-variant">
              Bio Code ({claimedEntity.bioVerificationCode}) &amp; CNI/RCCM documents are being audited. Raise creation unlocks upon approval.
            </p>
          </div>
          <span className="px-3 py-1 rounded bg-secondary text-white font-label-xs uppercase font-bold self-start sm:self-center shrink-0">
            PENDING AUDIT
          </span>
        </div>
      )}

      {viewTab === 'dossier' ? (
        <div className="flex flex-col gap-8">
          {/* Borderless Search Bar + Directory Grid */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 flex items-center gap-2.5 border-b border-outline-variant/40 py-2.5 focus-within:border-secondary transition-colors">
                <span className="material-symbols-outlined text-outline text-[19px]">search</span>
                <input
                  type="text"
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  placeholder="Search creators, genres, cities, or record labels..."
                  className="w-full bg-transparent text-body-md text-on-surface placeholder:text-outline outline-none"
                />
                {directorySearch && (
                  <button
                    type="button"
                    onClick={() => setDirectorySearch('')}
                    className="text-outline hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>

              {isAdmin && (
                <button
                  type="button"
                  disabled={syncingCreators}
                  onClick={handleSyncCreators}
                  className="px-4 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-xs uppercase font-bold shrink-0 hover:border-secondary"
                >
                  {syncingCreators ? 'Syncing...' : 'Sync YouTube/Apify Creators'}
                </button>
              )}
            </div>

            {filteredDirectory.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center gap-3">
                <p className="font-body-md text-on-surface-variant">
                  No creators match your search yet. Want to put an artist on Crippo?
                </p>
                <button
                  type="button"
                  onClick={() => setViewTab('memo')}
                  className="px-4 py-2 rounded-xl bg-secondary text-white font-label-md font-bold"
                >
                  Request a Memo (2,000 FCFA)
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 max-h-72 overflow-y-auto pr-1">
                {filteredDirectory.map((ent) => {
                  const selected = activeDossier?.id === ent.id;
                  return (
                    <button
                      key={ent.id}
                      type="button"
                      onClick={() => setSelectedEntityId(ent.id)}
                      className={`py-2.5 px-2 border-b text-left flex items-center gap-3 transition-colors ${
                        selected
                          ? 'border-secondary text-secondary'
                          : 'border-outline-variant/20 text-on-surface hover:border-secondary/60'
                      }`}
                    >
                      <img
                        src={getCoverImage(ent.category, ent.avatarUrl)}
                        alt={ent.stageName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-label-md font-bold truncate">{ent.stageName}</span>
                          <span className="text-[10px] font-label-xs uppercase text-secondary shrink-0">
                            {ent.kycStatus === 'verified' ? 'Verified' : 'Audited'}
                          </span>
                        </div>
                        <span className="text-[11px] block truncate text-on-surface-variant">
                          {ent.category} · {ent.city}
                          {ent.agencyName ? ` · ${ent.agencyName}` : ''}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Wikipedia-Style Creator Profile (Borderless Seamless Flow) */}
          {activeDossier && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start border-t border-outline-variant/25 pt-7">
              <div className="lg:col-span-8 flex flex-col gap-7">
                {/* Identity Header */}
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono-num text-[11px] font-bold uppercase text-on-surface-variant">
                      CRIPPO WIKI · CRIP-237-{activeDossier.id.slice(-4).toUpperCase()}
                    </span>

                    {!activeDossier.isClaimed ? (
                      <span className="px-3 py-1 rounded bg-secondary-fixed text-secondary font-label-xs uppercase font-bold">
                        Unclaimed Profile
                      </span>
                    ) : activeDossier.kycStatus === 'verified' ? (
                      <span className="px-3 py-1 rounded bg-on-tertiary-container/15 text-on-tertiary-container font-label-xs uppercase font-bold">
                        {activeDossier.entityType === 'agency' ? 'Verified Record Label / Agency' : 'Verified Creator'}
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded bg-secondary-fixed text-secondary font-label-xs uppercase font-bold">
                        Verification Pending
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <img
                      src={getCoverImage(activeDossier.category, activeDossier.avatarUrl)}
                      alt={activeDossier.stageName}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-xl object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-headline-lg-mobile text-on-surface font-bold truncate">
                        {activeDossier.stageName}
                      </h2>
                      <p className="font-body-sm text-on-surface-variant">
                        {activeDossier.category} · {activeDossier.city}, {activeDossier.country}
                        {activeDossier.agencyName ? ` · Label: ${activeDossier.agencyName}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Bio & Upcoming Projects */}
                  <div className="border-t border-outline-variant/25 pt-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-label-xs uppercase text-secondary font-bold">
                        Biography &amp; Upcoming Projects
                      </h3>
                      {isViewingOwnClaimed && !editingBio && (
                        <button
                          type="button"
                          onClick={() => setEditingBio(true)}
                          className="font-label-xs uppercase text-secondary font-bold hover:underline"
                        >
                          Edit Bio &amp; Projects
                        </button>
                      )}
                    </div>

                    {editingBio && isViewingOwnClaimed ? (
                      <form onSubmit={handleSaveBioAndProjects} className="flex flex-col gap-3">
                        <textarea
                          rows={3}
                          value={bioDraft}
                          onChange={(e) => setBioDraft(e.target.value)}
                          placeholder="Write your official biography, musical style, and career highlights..."
                          className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface font-body-sm"
                        />
                        <textarea
                          rows={3}
                          value={projectsDraft}
                          onChange={(e) => setProjectsDraft(e.target.value)}
                          placeholder="Upcoming projects (one per line, e.g. Genesis EP — Q4 2026)"
                          className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface font-body-sm"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={savingBio}
                            className="px-4 py-2 rounded-lg bg-secondary text-white font-label-xs uppercase font-bold"
                          >
                            {savingBio ? 'Saving...' : 'Save Wikipedia Bio'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingBio(false)}
                            className="px-4 py-2 rounded-lg border border-outline-variant/40 text-on-surface font-label-xs uppercase"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className="font-body-md text-on-surface leading-relaxed">
                          {activeDossier.bio ||
                            `${activeDossier.stageName} is a ${activeDossier.category.toLowerCase()} creator based in ${activeDossier.city}, ${activeDossier.country}, tracked on Crippo for verified streaming velocity and cultural impact.`}
                        </p>
                        {activeDossier.upcomingProjects && activeDossier.upcomingProjects.length > 0 && (
                          <div className="flex flex-col gap-1.5 pt-1">
                            <span className="font-label-xs uppercase text-on-surface-variant">
                              Upcoming Projects
                            </span>
                            <ul className="list-disc pl-5 text-[13px] text-on-surface space-y-1">
                              {activeDossier.upcomingProjects.map((proj, i) => (
                                <li key={i}>{proj}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Role-Based Action Row */}
                  {!activeDossier.isClaimed ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (!user) {
                            setAuthPromptAction(`claim ${activeDossier.stageName}'s profile`);
                            return;
                          }
                          setClaimTarget(activeDossier);
                          setViewTab('kyc');
                        }}
                        className="py-3 px-4 rounded-xl bg-primary text-on-primary font-label-md text-[12px] font-bold"
                      >
                        Are you {activeDossier.stageName}? Claim This Profile
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!user) {
                            setAuthPromptAction(`request a Memo for ${activeDossier.stageName}`);
                            return;
                          }
                          setMemoStageName(activeDossier.stageName);
                          setViewTab('memo');
                        }}
                        className="py-3 px-4 rounded-xl bg-secondary text-white font-label-md text-[12px] font-bold"
                      >
                        Request a Memo (2,000 FCFA)
                      </button>
                    </div>
                  ) : isOwnVerified ? (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <VerifiedCreatorOnly
                        targetEntityId={activeDossier.id}
                        requireCanLaunch
                        fallback={
                          <div className="w-full py-2 border-l-2 border-secondary pl-3 text-[12px] text-on-surface-variant">
                            Affiliated with <strong>{activeDossier.agencyName}</strong> — under label management, only your record label can initiate a Raise on your behalf.
                          </div>
                        }
                      >
                        <Link
                          to="/launch-race"
                          className="flex-1 py-3 px-5 rounded-xl bg-secondary text-white font-label-md text-[13px] font-bold uppercase tracking-wider text-center hover:opacity-95"
                        >
                          Launch a Project Raise
                        </Link>
                      </VerifiedCreatorOnly>
                      {(isVerifiedCreator || isAdmin) && (
                        <Link
                          to="/brands"
                          className="py-3 px-4 rounded-xl border border-outline-variant/50 text-on-surface font-label-md font-bold hover:border-secondary"
                        >
                          Brands Hub
                        </Link>
                      )}
                    </div>
                  ) : isOwnPending ? (
                    <div className="py-2 border-l-2 border-secondary pl-3 text-[12px] text-on-surface-variant">
                      Verification Under Review — Your Bio Code &amp; CNI/RCCM documents are being audited.
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (!user) {
                            setAuthPromptAction(`request an updated Memo for ${activeDossier.stageName}`);
                            return;
                          }
                          setMemoStageName(activeDossier.stageName);
                          setViewTab('memo');
                        }}
                        className="py-2.5 px-4 rounded-xl border border-outline-variant/50 text-on-surface font-label-md text-[12px] font-bold hover:border-secondary hover:text-secondary"
                      >
                        Request Updated Memo (2,000 FCFA)
                      </button>
                    </div>
                  )}

                  {/* Agency Invite Box (Only visible to Verified Agencies viewing unaffiliated claimed Solo Creators) */}
                  {canAgencyInviteTarget && (
                    <form
                      onSubmit={handleSendAffiliationInvite}
                      className="mt-2 pt-4 border-t border-outline-variant/25 flex flex-col gap-2.5"
                    >
                      <span className="font-label-xs uppercase text-secondary font-bold">
                        Record Label / Agency Roster Invite
                      </span>
                      <p className="font-body-sm text-on-surface-variant">
                        Invite {activeDossier.stageName} to join {claimedEntity?.agencyName || claimedEntity?.stageName} so your label can manage and initiate Raises for them.
                      </p>
                      <input
                        type="text"
                        value={affMessage}
                        onChange={(e) => setAffMessage(e.target.value)}
                        placeholder="Optional message / management terms note..."
                        className="px-3 py-2 rounded-lg border border-outline-variant/40 bg-transparent text-on-surface font-body-sm"
                      />
                      <button
                        type="submit"
                        disabled={sendingAff}
                        className="self-start px-4 py-2 rounded-lg bg-secondary text-white font-label-xs uppercase font-bold"
                      >
                        {sendingAff ? 'Sending...' : 'Send Label Affiliation Request'}
                      </button>
                    </form>
                  )}
                </div>

                {/* Velocity Metrics (Borderless) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-t border-outline-variant/25 pt-5 tabular-nums">
                  <div>
                    <span className="font-label-xs uppercase text-on-surface-variant">
                      Audience Reach
                    </span>
                    <div className="font-headline-lg-mobile font-mono-num text-on-surface mt-1">
                      {(activeDossier.subscribers || 0).toLocaleString()}
                    </div>
                    <span className="font-body-sm text-on-tertiary-container">
                      Verified Subscribers
                    </span>
                  </div>
                  <div>
                    <span className="font-label-xs uppercase text-on-surface-variant">
                      Monthly Stream Velocity
                    </span>
                    <div className="font-headline-lg-mobile font-mono-num text-on-surface mt-1">
                      {(activeDossier.monthlyViews || 0).toLocaleString()}
                    </div>
                    <span className="font-body-sm text-secondary">
                      30-Day Monitorable Plays
                    </span>
                  </div>
                  <div>
                    <span className="font-label-xs uppercase text-on-surface-variant">
                      Engagement Ratio
                    </span>
                    <div className="font-headline-lg-mobile font-mono-num text-on-surface mt-1">
                      {activeDossier.engagementRate ? `${activeDossier.engagementRate}%` : 'Audited'}
                    </div>
                    <span className="font-body-sm text-on-surface-variant">
                      {activeDossier.category} · {activeDossier.city}
                    </span>
                  </div>
                </div>

                {/* Agency Roster List (when viewing an Agency/Label profile) */}
                {activeDossier.entityType === 'agency' && (
                  <div className="border-t border-outline-variant/25 pt-5 flex flex-col gap-3">
                    <h3 className="font-headline-sm text-on-surface font-bold">
                      Affiliated Artist Roster ({rosterArtists.length})
                    </h3>
                    {rosterArtists.length === 0 ? (
                      <p className="font-body-sm text-on-surface-variant">
                        No affiliated solo creators linked yet. Verified labels can send affiliation invites from any solo creator&apos;s page.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {rosterArtists.map((art) => (
                          <button
                            key={art.id}
                            type="button"
                            onClick={() => setSelectedEntityId(art.id)}
                            className="py-2.5 border-b border-outline-variant/25 text-left hover:border-secondary"
                          >
                            <span className="font-label-md font-bold text-on-surface block">
                              {art.stageName}
                            </span>
                            <span className="font-body-sm text-on-surface-variant">
                              {art.category} · {art.city}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Audited Master Races & Liens */}
                <div className="border-t border-outline-variant/25 pt-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-headline-sm text-on-surface font-bold">
                      Project Raises &amp; Revenue Liens
                    </h2>
                    <VerifiedCreatorOnly targetEntityId={activeDossier.id} requireCanLaunch>
                      <Link
                        to="/launch-race"
                        className="px-3.5 py-1.5 rounded-lg bg-secondary text-white font-label-xs uppercase font-bold"
                      >
                        + Launch Raise
                      </Link>
                    </VerifiedCreatorOnly>
                  </div>

                  {entityRaces.length === 0 ? (
                    <p className="font-body-sm text-on-surface-variant py-2">
                      No active or historical capital Raises tied to {activeDossier.stageName} yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-outline-variant/25">
                      {entityRaces.map((r) => (
                        <Link
                          key={r.id}
                          to={`/race/${r.id}`}
                          className="py-3.5 hover:text-secondary transition-colors flex items-center justify-between gap-3"
                        >
                          <div>
                            <h4 className="font-label-md font-bold text-on-surface">{r.title}</h4>
                            <span className="font-body-sm text-on-surface-variant">
                              {r.category} · Rev Share {r.revSharePct}% ({r.roiDurationMonths}m) · ISRC:{' '}
                              {r.isrcCode || 'Pending'}
                            </span>
                          </div>
                          <div className="text-right tabular-nums">
                            <span className="font-ticker-val text-on-surface block">
                              {r.currentSharePriceXAF.toLocaleString()} XAF
                            </span>
                            <span className="font-label-xs uppercase text-secondary font-bold">
                              {r.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right 4 Cols: Wikipedia Infobox (Borderless Side Rail) */}
              <aside className="lg:col-span-4 lg:border-l lg:border-outline-variant/25 lg:pl-6 flex flex-col gap-4">
                <div>
                  <span className="font-label-xs uppercase text-secondary font-bold">
                    Creator Infobox
                  </span>
                  <h3 className="font-headline-sm text-on-surface font-bold mt-0.5">
                    {activeDossier.stageName}
                  </h3>
                </div>

                <div className="divide-y divide-outline-variant/25 font-body-sm">
                  <div className="py-2.5 flex justify-between gap-2">
                    <span className="text-on-surface-variant">Legal Name</span>
                    <span className="font-semibold text-on-surface text-right">
                      {activeDossier.legalFullName || 'Unclaimed / Private'}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between gap-2">
                    <span className="text-on-surface-variant">Origin</span>
                    <span className="font-semibold text-on-surface text-right">
                      {activeDossier.city}, {activeDossier.country}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between gap-2">
                    <span className="text-on-surface-variant">Classification</span>
                    <span className="font-semibold uppercase text-on-surface">
                      {activeDossier.entityType}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between gap-2">
                    <span className="text-on-surface-variant">Record Label / Agency</span>
                    <span className="font-semibold text-on-surface text-right">
                      {activeDossier.agencyName ? (
                        activeDossier.affiliatedAgencyId ? (
                          <button
                            type="button"
                            onClick={() => setSelectedEntityId(activeDossier.affiliatedAgencyId!)}
                            className="text-secondary hover:underline"
                          >
                            {activeDossier.agencyName}
                          </button>
                        ) : (
                          activeDossier.agencyName
                        )
                      ) : (
                        'Independent'
                      )}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between gap-2">
                    <span className="text-on-surface-variant">NIU / Tax ID</span>
                    <span className="font-mono-num text-on-surface">
                      {activeDossier.niuNumber || 'Unverified'}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between gap-2 tabular-nums">
                    <span className="text-on-surface-variant">Catalog Valuation</span>
                    <span className="font-mono-num font-bold text-on-surface">
                      {(activeDossier.catalogValuationXAF || 0).toLocaleString()} XAF
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between gap-2 tabular-nums">
                    <span className="text-on-surface-variant">Dividends Disbursed</span>
                    <span className="font-mono-num font-bold text-on-tertiary-container">
                      {(activeDossier.dividendsDisbursedXAF || 0).toLocaleString()} XAF
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between gap-2">
                    <span className="text-on-surface-variant">Market Grade</span>
                    <span className="font-bold text-secondary">
                      {activeDossier.wikiGrade || 'B-Index'}
                    </span>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
      ) : viewTab === 'memo' ? (
        /* ================= CREATOR VERIFICATION / REQUEST A MEMO (STRICT POST-PAYMENT) ================= */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void executePaidMemo(memoTier, memoStageName, memoLink);
            }}
            className="lg:col-span-7 flex flex-col gap-4"
          >
            <div>
              <span className="font-label-xs uppercase text-secondary font-bold">
                Creator Application &amp; Underwriting Memo
              </span>
              <h2 className="font-headline-sm text-on-surface font-bold mt-1">
                Request a Memo (Creator Verification)
              </h2>
              <p className="font-body-sm text-on-surface-variant mt-1">
                Submit your full details below and pay the underwriting fee to MTN MoMo{' '}
                <strong className="font-mono-num text-on-surface">672638094</strong>. Applications are forwarded to Admin review only after payment is confirmed.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 border-b border-outline-variant/25 pb-3">
              <button
                type="button"
                onClick={() => setMemoTier('fan_2000')}
                className={`py-2.5 px-3 rounded-xl font-label-xs uppercase font-bold border transition-colors ${
                  memoTier === 'fan_2000'
                    ? 'bg-secondary text-white border-secondary'
                    : 'border-outline-variant/40 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Standard Audit · 2,000 FCFA
              </button>
              <button
                type="button"
                onClick={() => setMemoTier('fast_track_5000')}
                className={`py-2.5 px-3 rounded-xl font-label-xs uppercase font-bold border transition-colors ${
                  memoTier === 'fast_track_5000'
                    ? 'bg-secondary text-white border-secondary'
                    : 'border-outline-variant/40 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Fast-Track Creator · 5,000 FCFA
              </button>
            </div>

            <div className="py-2.5 border-l-2 border-secondary pl-3.5 text-[12px] text-on-surface-variant">
              <strong className="text-on-surface block">
                Payment Verification Gate — Pay to 672638094
              </strong>
              Authorize{' '}
              <strong className="font-mono-num text-secondary">
                {memoTier === 'fast_track_5000' ? '5,000 FCFA' : '2,000 FCFA'}
              </strong>{' '}
              to <strong className="font-mono-num text-on-surface">672638094</strong> via CamPay USSD below. Unpaid drafts are never queued in the Admin Dashboard.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={memoFullName}
                onChange={(e) => setMemoFullName(e.target.value)}
                placeholder="Full Name (Legal Name)"
                className="px-3.5 py-3 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
              />
              <input
                type="text"
                required
                value={memoStageName}
                onChange={(e) => setMemoStageName(e.target.value)}
                placeholder="Stage Name (e.g. Mimie / Blanche Bailly)"
                className="px-3.5 py-3 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
              />
            </div>

            <input
              type="url"
              required
              value={memoLink}
              onChange={(e) => setMemoLink(e.target.value)}
              placeholder="Primary Channel URL (https://youtube.com/@artist or TikTok URL)"
              className="px-3.5 py-3 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            />

            <input
              type="text"
              required
              value={memoSocialAccounts}
              onChange={(e) => setMemoSocialAccounts(e.target.value)}
              placeholder="Social Media Accounts (e.g. TikTok @handle, IG @handle, YouTube)"
              className="px-3.5 py-3 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            />

            <textarea
              rows={2}
              required
              value={memoShortBio}
              onChange={(e) => setMemoShortBio(e.target.value)}
              placeholder="Short Bio (genre, city, milestones, audience overview)..."
              className="px-3.5 py-3 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            />

            <textarea
              rows={3}
              required
              value={memoMotivation}
              onChange={(e) => setMemoMotivation(e.target.value)}
              placeholder="Why do you think you deserve to be on the platform?"
              className="px-3.5 py-3 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            />

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">
                Your Cameroon MoMo Line to Authorize USSD (+237)
              </label>
              <input
                type="tel"
                required
                value={memoPhone}
                onChange={(e) => setMemoPhone(e.target.value)}
                placeholder="237677821940"
                className="px-3.5 py-3 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num text-on-surface"
              />
            </div>

            <button
              type="submit"
              disabled={memoBusy}
              className="w-full py-3.5 rounded-xl bg-secondary text-white font-label-md font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {memoBusy
                ? 'Waiting for CamPay Confirmation...'
                : `Pay ${memoTier === 'fast_track_5000' ? '5,000' : '2,000'} FCFA to 672638094 & Submit`}
            </button>
          </form>

          <div className="lg:col-span-5 lg:border-l lg:border-outline-variant/25 lg:pl-6 flex flex-col gap-3">
            <h3 className="font-headline-sm text-on-surface font-bold">
              Confirmed Applications ({paidMyMemos.length})
            </h3>
            {paidMyMemos.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant">
                No paid memo audits submitted yet. Only applications with confirmed payment to 672638094 appear here and in the Admin queue.
              </p>
            ) : (
              <div className="divide-y divide-outline-variant/25">
                {paidMyMemos.map((m) => (
                  <div key={m.id} className="py-3 text-[12px]">
                    <div className="flex justify-between font-bold">
                      <span>{m.stageName} ({m.feeXAF.toLocaleString()} XAF)</span>
                      <span className="uppercase text-secondary">{m.status}</span>
                    </div>
                    {m.fullName && (
                      <p className="text-on-surface-variant mt-0.5">
                        {m.fullName} · {m.socialAccounts}
                      </p>
                    )}
                    {m.auditSummary && (
                      <p className="text-on-surface-variant mt-1">{m.auditSummary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================= CREATOR CLAIM & KYC + FAST-TRACK MEMO (5,000 FCFA, BORDERLESS) ================= */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form
            onSubmit={handleSubmitKycClaim}
            className="lg:col-span-7 flex flex-col gap-5"
          >
            <div>
              <span className="font-label-xs uppercase text-secondary font-bold">
                Claim Profile &amp; OHADA KYC Verification
              </span>
              <h2 className="font-headline-sm text-on-surface font-bold mt-1">
                Verify Creator or Label Ownership
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2 border-b border-outline-variant/30 pb-2">
              <button
                type="button"
                onClick={() => setAffiliation('solo')}
                className={`py-2.5 rounded-lg font-label-md font-bold ${
                  affiliation === 'solo'
                    ? 'bg-secondary text-on-secondary'
                    : 'text-on-surface-variant'
                }`}
              >
                Solo Creator (CNI + NIU)
              </button>
              <button
                type="button"
                onClick={() => setAffiliation('agency')}
                className={`py-2.5 rounded-lg font-label-md font-bold ${
                  affiliation === 'agency'
                    ? 'bg-secondary text-on-secondary'
                    : 'text-on-surface-variant'
                }`}
              >
                Agency / Label (RCCM)
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-label-xs uppercase text-on-surface-variant">
                Select Your Profile to Claim
              </label>
              <input
                type="text"
                value={entitySearch}
                onChange={(e) => setEntitySearch(e.target.value)}
                placeholder="Search artist or label name..."
                className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
              />
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
                {searchableEntities.map((ent) => (
                  <button
                    key={ent.id}
                    type="button"
                    onClick={() => setClaimTarget(ent)}
                    className={`px-3 py-1.5 rounded-lg font-label-md transition-colors border ${
                      claimTarget?.id === ent.id
                        ? 'bg-primary-container text-white border-secondary'
                        : 'border-outline-variant/35 text-on-surface hover:border-secondary'
                    }`}
                  >
                    {ent.stageName} ({ent.city})
                  </button>
                ))}
              </div>
            </div>

            <div className="py-3 border-l-2 border-secondary pl-4 flex flex-col gap-1">
              <span className="font-label-xs uppercase text-secondary font-bold">
                Social Bio Handshake Code
              </span>
              <span className="font-headline-sm font-mono-num text-on-surface">{handshakeCode}</span>
              <p className="font-body-sm text-on-surface-variant">
                Paste this code temporarily into your YouTube/TikTok bio to prove channel ownership.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-label-xs uppercase text-on-surface-variant">
                  Legal Full Name (on CNI)
                </label>
                <input
                  type="text"
                  required
                  value={legalFullName}
                  onChange={(e) => setLegalFullName(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-label-xs uppercase text-on-surface-variant">
                  Cameroon NIU Number
                </label>
                <input
                  type="text"
                  required
                  value={niuNumber}
                  onChange={(e) => setNiuNumber(e.target.value)}
                  placeholder="P081234567890W"
                  className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num text-on-surface"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-label-xs uppercase text-on-surface-variant">
                  CNI / Passport Number
                </label>
                <input
                  type="text"
                  required
                  value={cniNumber}
                  onChange={(e) => setCniNumber(e.target.value)}
                  placeholder="112233445"
                  className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num text-on-surface"
                />
              </div>

              {affiliation === 'agency' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-xs uppercase text-on-surface-variant">
                      Label / Agency Name
                    </label>
                    <input
                      type="text"
                      required
                      value={agencyName}
                      onChange={(e) => setAgencyName(e.target.value)}
                      className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
                    />
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className="font-label-xs uppercase text-on-surface-variant">
                      OHADA RCCM Registration Number
                    </label>
                    <input
                      type="text"
                      required
                      value={rccmNumber}
                      onChange={(e) => setRccmNumber(e.target.value)}
                      placeholder="RC/DLA/2024/B/1234"
                      className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num text-on-surface"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="p-3.5 rounded-xl border border-dashed border-outline-variant cursor-pointer flex flex-col gap-1">
                <span className="font-label-xs uppercase text-secondary font-bold">
                  {uploadingField === 'cniFrontUrl'
                    ? 'Uploading...'
                    : cniFrontUrl
                    ? 'CNI Front Uploaded'
                    : 'Upload CNI Front (Image/PDF)'}
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f, 'cniFrontUrl');
                  }}
                />
              </label>

              <label className="p-3.5 rounded-xl border border-dashed border-outline-variant cursor-pointer flex flex-col gap-1">
                <span className="font-label-xs uppercase text-secondary font-bold">
                  {uploadingField === 'cniBackUrl'
                    ? 'Uploading...'
                    : cniBackUrl
                    ? 'CNI Back Uploaded'
                    : 'Upload CNI Back (Image/PDF)'}
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f, 'cniBackUrl');
                  }}
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={savingKyc}
              className="w-full py-3.5 rounded-xl bg-on-tertiary-container text-white font-headline-sm text-[14px] font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {savingKyc ? 'Submitting Claim...' : 'Submit Claim & CNI/RCCM for Review'}
            </button>
          </form>

          {/* Right 5 Cols: Fast-Track Onboarding Memo (5,000 FCFA) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void executePaidMemo('fast_track_5000', memoStageName, memoLink);
            }}
            className="lg:col-span-5 lg:border-l lg:border-outline-variant/25 lg:pl-6 flex flex-col gap-3"
          >
            <div>
              <span className="font-label-xs uppercase text-secondary font-bold">
                Fast-Track Creator Listing (5,000 FCFA to 672638094)
              </span>
              <h3 className="font-headline-sm text-on-surface font-bold mt-1">
                Unlisted Creator? Fast-Track Your Dossier
              </h3>
              <p className="font-body-sm text-on-surface-variant mt-0.5">
                Send 5,000 FCFA to <strong className="font-mono-num text-on-surface">672638094</strong> via CamPay. Your dossier enters Admin review only after payment settles.
              </p>
            </div>

            <input
              type="text"
              required
              value={memoFullName}
              onChange={(e) => setMemoFullName(e.target.value)}
              placeholder="Your Full Legal Name"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            />
            <input
              type="text"
              required
              value={memoStageName}
              onChange={(e) => setMemoStageName(e.target.value)}
              placeholder="Your Official Stage / Label Name"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            />
            <input
              type="url"
              required
              value={memoLink}
              onChange={(e) => setMemoLink(e.target.value)}
              placeholder="https://youtube.com/@yourchannel"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            />
            <input
              type="text"
              required
              value={memoSocialAccounts}
              onChange={(e) => setMemoSocialAccounts(e.target.value)}
              placeholder="Social Media Accounts (@tiktok, @instagram)"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            />
            <textarea
              rows={2}
              required
              value={memoShortBio}
              onChange={(e) => setMemoShortBio(e.target.value)}
              placeholder="Short Bio..."
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            />
            <textarea
              rows={2}
              required
              value={memoMotivation}
              onChange={(e) => setMemoMotivation(e.target.value)}
              placeholder="Why do you think you deserve to be on the platform?"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface"
            />
            <input
              type="tel"
              required
              value={memoPhone}
              onChange={(e) => setMemoPhone(e.target.value)}
              placeholder="237677821940"
              className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num text-on-surface"
            />

            <button
              type="submit"
              disabled={memoBusy}
              className="w-full py-3 rounded-xl bg-primary-container text-white font-label-md font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {memoBusy ? 'Waiting for CamPay...' : 'Pay 5,000 FCFA to 672638094 & Submit'}
            </button>
          </form>
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
