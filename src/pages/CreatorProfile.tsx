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
import {
  isAgencyEntity,
  isBrandEntity,
  isCreatorEntity,
  isRisingEntity,
  toFirestoreCompliantEntity,
} from '../utils/entityDirectory';
import type { Entity } from '../types/crippo';

interface CreatorProfileProps {
  onOpenApiSetup: () => void;
}

export function CreatorProfile({ onOpenApiSetup }: CreatorProfileProps) {
  const { user, profile, privateInfo } = useAuth();
  const {
    entities,
    firestoreEntityIds,
    races,
    catalysts,
    myMemos,
    isAdmin,
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
  const [scopeFilter, setScopeFilter] = useState<'all' | 'creators' | 'rising' | 'agencies' | 'brands'>('all');
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'M' | 'F'>('ALL');
  const [visibleCount, setVisibleCount] = useState(36);
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

  // Paid Memo States (Submitted to Admin ONLY after Fapshi settlement)
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

  const scopeCounts = useMemo(
    () => ({
      all: entities.length,
      creators: entities.filter((e) => isCreatorEntity(e) && !isRisingEntity(e)).length,
      rising: entities.filter((e) => isRisingEntity(e)).length,
      agencies: entities.filter((e) => isAgencyEntity(e)).length,
      brands: entities.filter((e) => isBrandEntity(e)).length,
    }),
    [entities]
  );

  const filteredDirectory = useMemo(() => {
    const q = directorySearch.trim().toLowerCase();
    return entities.filter((e) => {
      if (scopeFilter === 'creators' && (!isCreatorEntity(e) || isRisingEntity(e))) return false;
      if (scopeFilter === 'rising' && !isRisingEntity(e)) return false;
      if (scopeFilter === 'agencies' && !isAgencyEntity(e)) return false;
      if (scopeFilter === 'brands' && !isBrandEntity(e)) return false;
      if (genderFilter !== 'ALL' && e.gender !== genderFilter) return false;
      if (!q) return true;
      return (
        e.stageName.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q) ||
        e.country.toLowerCase().includes(q) ||
        (e.agencyName || '').toLowerCase().includes(q) ||
        (e.labelName || '').toLowerCase().includes(q) ||
        (e.primaryRole || '').toLowerCase().includes(q) ||
        (e.genres || []).some((g) => g.toLowerCase().includes(q)) ||
        (e.subGenres || []).some((g) => g.toLowerCase().includes(q))
      );
    });
  }, [entities, directorySearch, scopeFilter, genderFilter]);

  useEffect(() => {
    setVisibleCount(36);
  }, [directorySearch, scopeFilter, genderFilter]);

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
    () =>
      activeDossier
        ? races.filter(
            (r) =>
              r.entityId === activeDossier.id ||
              r.creatorName.toLowerCase() === activeDossier.stageName.toLowerCase()
          )
        : [],
    [races, activeDossier]
  );

  const entityCatalysts = useMemo(
    () =>
      activeDossier
        ? catalysts.filter(
            (c) =>
              c.entityId === activeDossier.id ||
              c.entityName.toLowerCase().includes(activeDossier.stageName.toLowerCase()) ||
              activeDossier.stageName.toLowerCase().includes(c.entityName.toLowerCase())
          )
        : [],
    [catalysts, activeDossier]
  );

  const rosterArtists = useMemo(() => {
    if (!activeDossier || !isAgencyEntity(activeDossier)) return [];
    const rosterSet = new Set(activeDossier.rosterCreatorIds || []);
    return entities.filter(
      (e) =>
        rosterSet.has(e.id) ||
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
      isCreatorEntity(activeDossier) &&
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
      if (firestoreEntityIds.has(activeDossier.id)) {
        await updateDoc(doc(db, 'entities', activeDossier.id), {
          bio: bioDraft.trim().slice(0, 600),
          upcomingProjects: upcoming,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(
          doc(db, 'entities', activeDossier.id),
          toFirestoreCompliantEntity(activeDossier, {
            bio: bioDraft.trim().slice(0, 600),
            upcomingProjects: upcoming,
          }),
          { merge: true }
        );
      }
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
      const targetAlreadyInFirestore = firestoreEntityIds.has(claimTarget.id);
      const effectiveEntityType: 'solo' | 'agency' =
        affiliation === 'agency' || isAgencyEntity(claimTarget) ? 'agency' : 'solo';

      if (!claimTarget.isClaimed) {
        const claimOverrides = {
          isClaimed: true,
          claimedByUid: user.uid,
          bioVerificationCode: handshakeCode,
          kycStatus: nextKycStatus,
          entityType: effectiveEntityType,
          ...(effectiveEntityType === 'agency'
            ? {
                agencyName: (agencyName.trim() || claimTarget.stageName).slice(0, 100),
                rccmNumber: rccmNumber.trim().slice(0, 50),
              }
            : {}),
          niuNumber: niuNumber.trim().slice(0, 50),
          legalFullName: legalFullName.trim().slice(0, 120),
          updatedAt: serverTimestamp(),
        };

        if (targetAlreadyInFirestore) {
          await updateDoc(doc(db, 'entities', claimTarget.id), claimOverrides);
        } else {
          await setDoc(
            doc(db, 'entities', claimTarget.id),
            toFirestoreCompliantEntity(claimTarget, claimOverrides, true),
            { merge: true }
          );
        }
      } else if (claimTarget.claimedByUid === user.uid) {
        const updateOverrides = {
          entityType: effectiveEntityType,
          ...(effectiveEntityType === 'agency'
            ? {
                agencyName: (agencyName.trim() || claimTarget.stageName).slice(0, 100),
                rccmNumber: rccmNumber.trim().slice(0, 50),
              }
            : {}),
          niuNumber: niuNumber.trim().slice(0, 50),
          kycStatus: nextKycStatus,
          legalFullName: legalFullName.trim().slice(0, 120),
          updatedAt: serverTimestamp(),
        };
        if (targetAlreadyInFirestore) {
          await updateDoc(doc(db, 'entities', claimTarget.id), updateOverrides);
        } else {
          await setDoc(
            doc(db, 'entities', claimTarget.id),
            toFirestoreCompliantEntity(claimTarget, updateOverrides, true),
            { merge: true }
          );
        }
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
      const resp = await apiFetch<{ reference: string; ussd_code?: string; link?: string }>(
        '/api/payments/fapshi/collect',
        {
          method: 'POST',
          body: JSON.stringify({
            amountXAF: feeXAF,
            phone: cleanPhone,
            description: `Crippo Creator Memo (${stageName.trim()})`,
            externalReference: paymentId,
            redirectUrl: window.location.href,
          }),
        }
      );

      await setDoc(doc(db, 'payments', paymentId), {
        id: paymentId,
        uid: user.uid,
        type: 'MEMO_FEE',
        reference: resp.reference,
        amountXAF: feeXAF,
        provider: 'FAPSHI',
        status: 'PENDING',
        memoId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (resp.link) {
        window.open(resp.link, '_blank');
      }

      showToast(
        'Authorize Payment',
        `Complete Fapshi checkout (${feeXAF.toLocaleString()} XAF). Application submits after confirmation.`,
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
        if (check.status === 'FAILED') throw new Error('Payment declined. Memo application was not submitted.');
      }
      if (!settled) {
        throw new Error('Payment timed out. Complete payment to submit your Creator Memo.');
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

      // Strictly create the memo ONLY AFTER Fapshi confirms payment
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
        routeEntityId && activeDossier ? (
          /* ================= LINKEDIN-STYLE FULL CREATOR PROFILE (/creator/:id) ================= */
          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between gap-3">
              <Link
                to="/creators"
                className="inline-flex items-center gap-1.5 font-label-xs uppercase font-bold text-on-surface-variant hover:text-secondary transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                Back to Creators Directory
              </Link>
              <span className="font-mono-num text-[11px] font-bold uppercase text-on-surface-variant">
                CRIPPO DOSSIER · CRIP-237-{activeDossier.id.slice(-4).toUpperCase()}
              </span>
            </div>

            {/* LinkedIn-Style Hero Banner & Identity Cardless Header */}
            <div className="flex flex-col">
              <div className="h-32 sm:h-40 rounded-2xl bg-gradient-to-r from-[#160c26] via-[#24123c] to-[#0f172a] relative overflow-hidden">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_#8b5cf6_0%,_transparent_55%)]" />
                <div className="absolute top-3 right-4">
                  {!activeDossier.isClaimed ? (
                    <span className="px-2.5 py-1 rounded bg-white/15 text-white font-label-xs uppercase font-bold backdrop-blur-xs">
                      {isBrandEntity(activeDossier)
                        ? 'Unclaimed Brand Sponsor'
                        : isAgencyEntity(activeDossier)
                        ? 'Unclaimed Label / Agency'
                        : isRisingEntity(activeDossier)
                        ? 'Rising Hope · Unclaimed'
                        : 'Unclaimed Profile'}
                    </span>
                  ) : activeDossier.kycStatus === 'verified' ? (
                    <span className="px-2.5 py-1 rounded bg-on-tertiary-container text-white font-label-xs uppercase font-bold">
                      {isBrandEntity(activeDossier)
                        ? 'Verified Brand Sponsor'
                        : isAgencyEntity(activeDossier)
                        ? 'Verified Label / Agency'
                        : 'Verified Creator'}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-secondary text-white font-label-xs uppercase font-bold">
                      Verification Pending
                    </span>
                  )}
                </div>
              </div>

              <div className="px-2 sm:px-4 -mt-12 sm:-mt-14 flex flex-col sm:flex-row sm:items-end justify-between gap-4 relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-end gap-4 min-w-0">
                  <img
                    src={getCoverImage(activeDossier.category, activeDossier.avatarUrl)}
                    alt={activeDossier.stageName}
                    referrerPolicy="no-referrer"
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-4 border-surface bg-surface shrink-0 shadow-md"
                  />
                  <div className="min-w-0 pb-1">
                    <h2 className="font-headline-lg-mobile md:font-headline-lg text-on-surface font-bold truncate">
                      {activeDossier.stageName}
                    </h2>
                    {activeDossier.description && (
                      <p className="font-body-md text-on-surface mt-0.5">{activeDossier.description}</p>
                    )}
                    <p className="font-body-sm text-on-surface-variant mt-1">
                      {activeDossier.genres && activeDossier.genres.length > 0
                        ? activeDossier.genres.join(', ')
                        : activeDossier.category}{' '}
                      · {activeDossier.city}, {activeDossier.country}
                      {activeDossier.labelName || activeDossier.agencyName
                        ? ` · ${activeDossier.labelName || activeDossier.agencyName}`
                        : ''}
                      {activeDossier.age ? ` · Age ${activeDossier.age}` : ''}
                    </p>
                    <p className="text-[11px] font-mono-num text-on-surface-variant mt-0.5 tabular-nums">
                      {(activeDossier.subscribers || 0).toLocaleString()} subscribers / followers
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0 pb-1">
                  {!activeDossier.isClaimed ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!user) {
                          setAuthPromptAction('claim this creator profile');
                          return;
                        }
                        setClaimTarget(activeDossier);
                        setViewTab('kyc');
                      }}
                      className="py-2.5 px-5 rounded-xl bg-primary text-on-primary font-label-md text-[12px] font-bold uppercase tracking-wider hover:opacity-95"
                    >
                      Claim Profile
                    </button>
                  ) : isOwnVerified ? (
                    <>
                      <VerifiedCreatorOnly
                        targetEntityId={activeDossier.id}
                        requireCanLaunch
                        fallback={
                          <span className="text-[12px] text-on-surface-variant">
                            Managed by {activeDossier.agencyName}
                          </span>
                        }
                      >
                        <Link
                          to="/launch-race"
                          className="py-2.5 px-5 rounded-xl bg-secondary text-white font-label-md text-[12px] font-bold uppercase tracking-wider hover:opacity-95"
                        >
                          Launch a Project Raise
                        </Link>
                      </VerifiedCreatorOnly>
                      <Link
                        to="/brands"
                        className="py-2.5 px-4 rounded-xl border border-outline-variant/50 text-on-surface font-label-md text-[12px] font-bold hover:border-secondary"
                      >
                        Brands Hub
                      </Link>
                    </>
                  ) : isOwnPending ? (
                    <span className="px-3 py-1.5 rounded-lg bg-secondary/15 text-secondary font-label-xs uppercase font-bold">
                      KYC Under Review
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Social & Source Links Row */}
              {(activeDossier.youtubeChannelId ||
                activeDossier.tiktokHandle ||
                activeDossier.instagramHandle ||
                activeDossier.spotifyArtistId ||
                activeDossier.spotifyUrl ||
                activeDossier.facebookPage ||
                activeDossier.website ||
                activeDossier.sourceUrl) && (
                <div className="flex flex-wrap items-center gap-4 px-2 sm:px-4 pt-4 text-[12px] font-label-md">
                  {activeDossier.youtubeChannelId && (
                    <a
                      href={
                        activeDossier.youtubeChannelId.startsWith('http')
                          ? activeDossier.youtubeChannelId
                          : `https://youtube.com/channel/${activeDossier.youtubeChannelId}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-secondary hover:underline"
                    >
                      YouTube ↗
                    </a>
                  )}
                  {activeDossier.tiktokHandle && (
                    <a
                      href={
                        activeDossier.tiktokHandle.startsWith('http')
                          ? activeDossier.tiktokHandle
                          : `https://tiktok.com/@${activeDossier.tiktokHandle.replace(/^@/, '')}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-secondary hover:underline"
                    >
                      TikTok @{activeDossier.tiktokHandle.replace(/^@/, '')} ↗
                    </a>
                  )}
                  {activeDossier.instagramHandle && (
                    <a
                      href={
                        activeDossier.instagramHandle.startsWith('http')
                          ? activeDossier.instagramHandle
                          : `https://instagram.com/${activeDossier.instagramHandle.replace(/^@/, '')}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-secondary hover:underline"
                    >
                      Instagram @{activeDossier.instagramHandle.replace(/^@/, '')} ↗
                    </a>
                  )}
                  {(activeDossier.spotifyUrl || activeDossier.spotifyArtistId) && (
                    <a
                      href={
                        activeDossier.spotifyUrl ||
                        `https://open.spotify.com/artist/${activeDossier.spotifyArtistId}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-secondary hover:underline"
                    >
                      Spotify{activeDossier.spotifyMonthlyListeners ? ` (${activeDossier.spotifyMonthlyListeners.toLocaleString()}/mo)` : ''} ↗
                    </a>
                  )}
                  {activeDossier.facebookPage && (
                    <a
                      href={
                        activeDossier.facebookPage.startsWith('http')
                          ? activeDossier.facebookPage
                          : `https://facebook.com/${activeDossier.facebookPage}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-secondary hover:underline"
                    >
                      Facebook ↗
                    </a>
                  )}
                  {activeDossier.website && (
                    <a
                      href={activeDossier.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-secondary hover:underline"
                    >
                      Official Website ↗
                    </a>
                  )}
                  {activeDossier.sourceUrl && activeDossier.sourceUrl !== activeDossier.website && (
                    <a
                      href={activeDossier.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-on-surface-variant hover:text-secondary hover:underline"
                    >
                      Verified Reference ↗
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* LinkedIn-Style 2-Column Dossier Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start border-t border-outline-variant/25 pt-7">
              {/* Left 8 Cols: Bio, Career Stats, Active Raises, Historical Performance & News */}
              <div className="lg:col-span-8 flex flex-col gap-8">
                {/* About / Biography */}
                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-headline-sm text-on-surface font-bold">About &amp; Career Biography</h3>
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
                        rows={4}
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
                          {savingBio ? 'Saving...' : 'Save Biography'}
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
                      <p className="font-body-md text-on-surface leading-relaxed whitespace-pre-line">
                        {activeDossier.bio ||
                          `${activeDossier.stageName} is a ${activeDossier.category.toLowerCase()} creator based in ${activeDossier.city}, ${activeDossier.country}, onboarded to Crippo for fan-backed capital raises and cultural prediction tracking.`}
                      </p>
                      {activeDossier.upcomingProjects && activeDossier.upcomingProjects.length > 0 && (
                        <div className="flex flex-col gap-1.5 pt-2">
                          <span className="font-label-xs uppercase text-secondary font-bold">
                            Upcoming Releases &amp; Milestones
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
                </section>

                {/* Career Stats & Valuation Metrics */}
                <section className="border-t border-outline-variant/25 pt-6 flex flex-col gap-4">
                  <h3 className="font-headline-sm text-on-surface font-bold">Career Stats &amp; Market Valuation</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 tabular-nums">
                    <div>
                      <span className="font-label-xs uppercase text-on-surface-variant">Followers / Subs</span>
                      <div className="font-headline-sm font-mono-num text-on-surface font-bold mt-1">
                        {(activeDossier.subscribers || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <span className="font-label-xs uppercase text-on-surface-variant">Monthly Plays</span>
                      <div className="font-headline-sm font-mono-num text-on-surface font-bold mt-1">
                        {(activeDossier.monthlyViews || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <span className="font-label-xs uppercase text-on-surface-variant">Catalog Value</span>
                      <div className="font-headline-sm font-mono-num text-secondary font-bold mt-1">
                        {(activeDossier.catalogValuationXAF || 0).toLocaleString()} XAF
                      </div>
                    </div>
                    <div>
                      <span className="font-label-xs uppercase text-on-surface-variant">Dividends Paid</span>
                      <div className="font-headline-sm font-mono-num text-on-tertiary-container font-bold mt-1">
                        {(activeDossier.dividendsDisbursedXAF || 0).toLocaleString()} XAF
                      </div>
                    </div>
                  </div>
                </section>

                {/* Multi-Role Matrix, Revenue Split & Role-Specific Affiliations (Schema A) */}
                {isCreatorEntity(activeDossier) &&
                  ((activeDossier.roles && activeDossier.roles.length > 0) ||
                    (activeDossier.affiliations && activeDossier.affiliations.length > 0)) && (
                    <section className="border-t border-outline-variant/25 pt-6 flex flex-col gap-4">
                      <h3 className="font-headline-sm text-on-surface font-bold">
                        Roles, Revenue Split &amp; Contract Affiliations
                      </h3>
                      {activeDossier.revenueWeightSplit && (
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(activeDossier.revenueWeightSplit).map(([roleKey, pct]) => (
                            <span
                              key={roleKey}
                              className="px-3 py-1 rounded-lg bg-surface-container text-[12px] font-mono-num text-on-surface"
                            >
                              {roleKey}: <strong>{pct}%</strong>
                            </span>
                          ))}
                        </div>
                      )}
                      {activeDossier.affiliations && activeDossier.affiliations.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {activeDossier.affiliations.map((aff, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-xl border border-outline-variant/25 flex flex-col gap-1"
                            >
                              <span className="font-label-xs uppercase text-secondary font-bold">
                                {aff.role} · {aff.type}
                              </span>
                              {aff.agencyName ? (
                                aff.agencyId ? (
                                  <Link
                                    to={`/creator/${aff.agencyId}`}
                                    className="font-label-md font-bold text-on-surface hover:text-secondary hover:underline"
                                  >
                                    {aff.agencyName} →
                                  </Link>
                                ) : (
                                  <span className="font-label-md font-bold text-on-surface">
                                    {aff.agencyName}
                                  </span>
                                )
                              ) : (
                                <span className="font-body-sm text-on-surface-variant">
                                  Self-Represented / Independent
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                {/* Discography, Filmography & Awards (Schema A) */}
                {((activeDossier.discography && activeDossier.discography.length > 0) ||
                  (activeDossier.filmography && activeDossier.filmography.length > 0) ||
                  (activeDossier.awards && activeDossier.awards.length > 0)) && (
                  <section className="border-t border-outline-variant/25 pt-6 flex flex-col gap-4">
                    <h3 className="font-headline-sm text-on-surface font-bold">
                      Catalog Highlights &amp; Recognitions
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {activeDossier.discography && activeDossier.discography.length > 0 && (
                        <div>
                          <span className="font-label-xs uppercase text-secondary font-bold block mb-2">
                            Selected Discography
                          </span>
                          <ul className="divide-y divide-outline-variant/20 text-[13px]">
                            {activeDossier.discography.map((d, idx) => (
                              <li key={idx} className="py-1.5 flex justify-between gap-2">
                                <span className="font-semibold text-on-surface">{d.title}</span>
                                <span className="text-on-surface-variant font-mono-num">
                                  {d.type} · {d.year}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {activeDossier.filmography && activeDossier.filmography.length > 0 && (
                        <div>
                          <span className="font-label-xs uppercase text-secondary font-bold block mb-2">
                            Selected Filmography
                          </span>
                          <ul className="divide-y divide-outline-variant/20 text-[13px]">
                            {activeDossier.filmography.map((f, idx) => (
                              <li key={idx} className="py-1.5 flex justify-between gap-2">
                                <span className="font-semibold text-on-surface">{f.title}</span>
                                <span className="text-on-surface-variant font-mono-num">
                                  {f.role} · {f.year}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    {activeDossier.awards && activeDossier.awards.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {activeDossier.awards.map((aw, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded bg-on-tertiary-container/10 text-on-tertiary-container text-[11px] font-semibold"
                          >
                            ★ {aw}
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* Agency Roster List (Schema B) */}
                {isAgencyEntity(activeDossier) && (
                  <section className="border-t border-outline-variant/25 pt-6 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-headline-sm text-on-surface font-bold">
                        Affiliated Talent Roster ({rosterArtists.length})
                      </h3>
                      <span className="font-mono-num text-[12px] text-secondary font-bold">
                        Crippo Agency Score: {activeDossier.agencyCrippoScore || 80}/100
                      </span>
                    </div>
                    {rosterArtists.length === 0 ? (
                      <p className="font-body-sm text-on-surface-variant">
                        No affiliated solo creators linked yet.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {rosterArtists.map((art) => (
                          <Link
                            key={art.id}
                            to={`/creator/${art.id}`}
                            className="py-2.5 border-b border-outline-variant/25 text-left hover:border-secondary"
                          >
                            <span className="font-label-md font-bold text-on-surface block">
                              {art.stageName}
                            </span>
                            <span className="font-body-sm text-on-surface-variant">
                              {art.primaryRole || art.category} · {art.city}
                            </span>
                            <span className="text-[11px] text-on-surface-variant block mt-0.5 tabular-nums">
                              {(art.subscribers || 0).toLocaleString()} followers
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* Brand Sponsor Dossier (Schema C) */}
                {isBrandEntity(activeDossier) && (
                  <section className="border-t border-outline-variant/25 pt-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-headline-sm text-on-surface font-bold">
                        Sponsor Campaign Profile &amp; Creator Collaborations
                      </h3>
                      <span className="px-2.5 py-1 rounded bg-on-tertiary-container/15 text-on-tertiary-container font-label-xs uppercase font-bold">
                        {activeDossier.paymentReliabilityBadge || 'CamPay Escrow Eligible'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
                      <div className="p-3 rounded-xl border border-outline-variant/25">
                        <span className="font-label-xs uppercase text-on-surface-variant block">
                          Typical Campaign Tier
                        </span>
                        <span className="font-bold text-on-surface mt-1 block">
                          {activeDossier.typicalCampaignTier || 'Mid-Market (250K–1M XAF)'}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl border border-outline-variant/25">
                        <span className="font-label-xs uppercase text-on-surface-variant block">
                          Target Creator Niches
                        </span>
                        <span className="font-bold text-on-surface mt-1 block">
                          {(activeDossier.targetNiches || []).join(', ') || 'Music, Comedy, Lifestyle'}
                        </span>
                      </div>
                    </div>
                    {activeDossier.pastCreatorCollaborations &&
                      activeDossier.pastCreatorCollaborations.length > 0 && (
                        <div>
                          <span className="font-label-xs uppercase text-secondary font-bold block mb-1.5">
                            Notable Creator Ambassadors &amp; Campaigns
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {activeDossier.pastCreatorCollaborations.map((col, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1 rounded-lg bg-surface-container text-[12px] font-medium text-on-surface"
                              >
                                {col}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                  </section>
                )}

                {/* Active Raises & Historical Performance */}
                <section className="border-t border-outline-variant/25 pt-6 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-headline-sm text-on-surface font-bold">
                      Active Raises &amp; Historical Performance ({entityRaces.length})
                    </h3>
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
                      No active or historical capital raises linked to {activeDossier.stageName} yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-outline-variant/25 border-t border-outline-variant/20">
                      {entityRaces.map((r) => {
                        const fundedPct = Math.min(
                          100,
                          Math.round((r.sharesSold / Math.max(1, r.totalShares)) * 100)
                        );
                        const deltaPct =
                          r.unitSharePriceXAF > 0
                            ? Number(
                                (
                                  ((r.currentSharePriceXAF - r.unitSharePriceXAF) /
                                    r.unitSharePriceXAF) *
                                  100
                                ).toFixed(1)
                              )
                            : 0;
                        return (
                          <Link
                            key={r.id}
                            to={`/race/${r.id}`}
                            className="py-4 hover:text-secondary transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-label-md font-bold text-on-surface truncate">
                                  {r.title}
                                </h4>
                                <span className="px-2 py-0.5 rounded bg-secondary/15 text-secondary font-label-xs uppercase font-bold">
                                  {r.status.replace(/_/g, ' ')}
                                </span>
                              </div>
                              <span className="font-body-sm text-on-surface-variant block mt-0.5 tabular-nums">
                                {r.category} · {fundedPct}% Funded ({r.sharesSold}/{r.totalShares} shares) · Rev Share{' '}
                                {r.revSharePct}% ({r.roiDurationMonths}m) · ISRC: {r.isrcCode || 'Pending'}
                              </span>
                            </div>
                            <div className="text-left sm:text-right shrink-0 tabular-nums">
                              <span className="font-ticker-val text-on-surface block">
                                {r.currentSharePriceXAF.toLocaleString()} XAF / share
                              </span>
                              <span
                                className={`font-label-xs font-bold ${
                                  deltaPct >= 0 ? 'text-on-tertiary-container' : 'text-error'
                                }`}
                              >
                                {deltaPct >= 0 ? '+' : ''}
                                {deltaPct}% since open
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* News & AI Market Impact History */}
                <section className="border-t border-outline-variant/25 pt-6 flex flex-col gap-4">
                  <h3 className="font-headline-sm text-on-surface font-bold">
                    News Coverage &amp; Market Impact ({entityCatalysts.length})
                  </h3>
                  {entityCatalysts.length === 0 ? (
                    <p className="font-body-sm text-on-surface-variant">
                      No news articles tagged to {activeDossier.stageName} yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-outline-variant/25 border-t border-outline-variant/20">
                      {entityCatalysts.map((c) => (
                        <article key={c.id} className="py-4 flex flex-col gap-2 dark:text-white">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-label-xs uppercase font-bold text-secondary dark:text-white">
                              {c.segment} · {c.sourceName}
                            </span>
                            <span className="font-mono-num text-[11px] font-bold px-2 py-0.5 rounded bg-surface-container text-on-surface dark:bg-zinc-800 dark:text-white tabular-nums">
                              {c.priceImpactPct >= 0 ? `+${c.priceImpactPct}%` : `${c.priceImpactPct}%`}
                            </span>
                          </div>
                          <h4 className="font-label-md font-bold text-on-surface dark:text-white">
                            {c.headline}
                          </h4>
                          <p className="font-body-sm text-on-surface-variant dark:text-white leading-relaxed">
                            {c.summary}
                          </p>
                          {c.aiMarketAssessment && (
                            <p className="font-body-sm text-on-surface dark:text-white pt-1">
                              <strong className="uppercase text-[10px] tracking-wider mr-1.5">
                                AI Market Impact:
                              </strong>
                              {c.aiMarketAssessment}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                {/* Agency Invite Box (Only visible to Verified Agencies viewing unaffiliated claimed Solo Creators) */}
                {canAgencyInviteTarget && (
                  <form
                    onSubmit={handleSendAffiliationInvite}
                    className="pt-6 border-t border-outline-variant/25 flex flex-col gap-2.5"
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

              {/* Right 4 Cols: LinkedIn-Style Dossier Sidebar */}
              <aside className="lg:col-span-4 lg:border-l lg:border-outline-variant/25 lg:pl-6 flex flex-col gap-6">
                <div>
                  <span className="font-label-xs uppercase text-secondary font-bold">
                    Creator Profile Summary
                  </span>
                  <h3 className="font-headline-sm text-on-surface font-bold mt-0.5">
                    {activeDossier.stageName}
                  </h3>

                  <div className="divide-y divide-outline-variant/25 font-body-sm mt-3">
                    <div className="py-2.5 flex justify-between gap-2">
                      <span className="text-on-surface-variant">Legal Name</span>
                      <span className="font-semibold text-on-surface text-right">
                        {activeDossier.legalFullName || 'Private / Pending'}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between gap-2">
                      <span className="text-on-surface-variant">Origin &amp; Base</span>
                      <span className="font-semibold text-on-surface text-right">
                        {activeDossier.hometown && activeDossier.hometown !== activeDossier.city
                          ? `${activeDossier.hometown} → `
                          : ''}
                        {activeDossier.city}, {activeDossier.country}
                      </span>
                    </div>
                    {activeDossier.activeSince && (
                      <div className="py-2.5 flex justify-between gap-2">
                        <span className="text-on-surface-variant">Active Since</span>
                        <span className="font-semibold text-on-surface">{activeDossier.activeSince}</span>
                      </div>
                    )}
                    {activeDossier.foundedYear && (
                      <div className="py-2.5 flex justify-between gap-2">
                        <span className="text-on-surface-variant">Founded</span>
                        <span className="font-semibold text-on-surface">{activeDossier.foundedYear}</span>
                      </div>
                    )}
                    {activeDossier.languages && activeDossier.languages.length > 0 && (
                      <div className="py-2.5 flex justify-between gap-2">
                        <span className="text-on-surface-variant">Languages</span>
                        <span className="font-semibold text-on-surface text-right">
                          {activeDossier.languages.join(', ')}
                        </span>
                      </div>
                    )}
                    <div className="py-2.5 flex justify-between gap-2">
                      <span className="text-on-surface-variant">Genres / Focus</span>
                      <span className="font-semibold text-on-surface text-right">
                        {activeDossier.genres?.length
                          ? activeDossier.genres.join(', ')
                          : activeDossier.category}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between gap-2">
                      <span className="text-on-surface-variant">Record Label / Agency</span>
                      <span className="font-semibold text-on-surface text-right">
                        {activeDossier.labelName || activeDossier.agencyName ? (
                          activeDossier.affiliatedAgencyId ? (
                            <Link
                              to={`/creator/${activeDossier.affiliatedAgencyId}`}
                              className="text-secondary hover:underline"
                            >
                              {activeDossier.labelName || activeDossier.agencyName}
                            </Link>
                          ) : (
                            activeDossier.labelName || activeDossier.agencyName
                          )
                        ) : (
                          'Independent'
                        )}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between gap-2">
                      <span className="text-on-surface-variant">Engagement</span>
                      <span className="font-mono-num text-on-surface">
                        {activeDossier.engagementRate ? `${activeDossier.engagementRate}%` : 'Manually Indexed'}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between gap-2">
                      <span className="text-on-surface-variant">NIU / Tax ID</span>
                      <span className="font-mono-num text-on-surface">
                        {activeDossier.niuNumber || 'Unverified'}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between gap-2">
                      <span className="text-on-surface-variant">Market Grade</span>
                      <span className="font-bold text-secondary">
                        {activeDossier.wikiGrade || 'INDEX-237'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Other Creators Quick Jump */}
                <div className="border-t border-outline-variant/25 pt-5 flex flex-col gap-3">
                  <span className="font-label-xs uppercase text-on-surface-variant font-bold">
                    More Creators on Crippo
                  </span>
                  <div className="divide-y divide-outline-variant/20">
                    {entities
                      .filter((e) => e.id !== activeDossier.id)
                      .slice(0, 5)
                      .map((other) => (
                        <Link
                          key={other.id}
                          to={`/creator/${other.id}`}
                          className="py-2.5 flex items-center gap-3 hover:text-secondary transition-colors"
                        >
                          <img
                            src={getCoverImage(other.category, other.avatarUrl)}
                            alt={other.stageName}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-lg object-cover shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-label-md font-bold text-on-surface block truncate">
                              {other.stageName}
                            </span>
                            <span className="text-[11px] text-on-surface-variant block truncate">
                              {other.genres?.length ? other.genres.join(', ') : other.category} · {other.city}
                            </span>
                            <span className="text-[10px] font-mono-num text-on-surface-variant block tabular-nums">
                              {(other.subscribers || 0).toLocaleString()} followers
                            </span>
                          </div>
                        </Link>
                      ))}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        ) : (
          /* ================= CREATORS DIRECTORY CARDS (/creators) ================= */
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 flex items-center gap-2.5 border-b border-outline-variant/40 py-2.5 focus-within:border-secondary transition-colors">
                <span className="material-symbols-outlined text-outline text-[19px]">search</span>
                <input
                  type="text"
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  placeholder="Search 300 creators, labels, brands, genres, or cities..."
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

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <a
                  href="/data/crippo_directory_300.csv"
                  download
                  className="px-3 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-xs uppercase font-bold hover:border-secondary"
                >
                  CSV (300)
                </a>
                <a
                  href="/data/crippo_directory_300.json"
                  download
                  className="px-3 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-xs uppercase font-bold hover:border-secondary"
                >
                  JSON (300)
                </a>
                {isAdmin && (
                  <button
                    type="button"
                    disabled={syncingCreators}
                    onClick={handleSyncCreators}
                    className="px-4 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-xs uppercase font-bold hover:border-secondary"
                  >
                    {syncingCreators ? 'Syncing...' : 'Sync YouTube/Apify'}
                  </button>
                )}
              </div>
            </div>

            {/* Scope & Gender Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'all', label: `All (${scopeCounts.all})` },
                  { id: 'creators', label: `Creators (${scopeCounts.creators})` },
                  { id: 'rising', label: `Rising Hopes (${scopeCounts.rising})` },
                  { id: 'agencies', label: `Labels & Agencies (${scopeCounts.agencies})` },
                  { id: 'brands', label: `Brands (${scopeCounts.brands})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setScopeFilter(tab.id as typeof scopeFilter)}
                    className={`px-3 py-1.5 rounded-lg font-label-xs uppercase font-bold transition-colors border ${
                      scopeFilter === tab.id
                        ? 'border-secondary bg-secondary text-white'
                        : 'border-outline-variant/35 text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {(scopeFilter === 'all' || scopeFilter === 'creators' || scopeFilter === 'rising') && (
                <div className="flex items-center gap-1.5">
                  {(['ALL', 'M', 'F'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGenderFilter(g)}
                      className={`px-2.5 py-1 rounded-md font-label-xs uppercase font-bold border ${
                        genderFilter === g
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-outline-variant/35 text-on-surface-variant'
                      }`}
                    >
                      {g === 'ALL' ? 'All Genders' : g === 'M' ? 'Male (100)' : 'Female (150)'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {filteredDirectory.length === 0 ? (
              <div className="py-10 text-center flex flex-col items-center gap-3">
                <p className="font-body-md text-on-surface-variant">
                  No profiles match your search yet.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                  {filteredDirectory.slice(0, visibleCount).map((ent) => {
                    const genreAndLocation = `${
                      ent.genres && ent.genres.length > 0 ? ent.genres.slice(0, 3).join(', ') : ent.category
                    } · ${ent.city}, ${ent.country}`;
                    const badgeLabel = ent.kycStatus === 'verified'
                      ? 'Verified'
                      : isBrandEntity(ent)
                      ? 'Brand'
                      : isAgencyEntity(ent)
                      ? 'Label/Agency'
                      : isRisingEntity(ent)
                      ? 'Rising'
                      : 'Indexed';

                    return (
                      <article
                        key={ent.id}
                        className="pt-4 border-t border-outline-variant/25 flex flex-col justify-between gap-3.5"
                      >
                        <Link
                          to={`/creator/${ent.id}`}
                          className="group flex items-start gap-3.5 min-w-0"
                        >
                          <img
                            src={getCoverImage(ent.category, ent.avatarUrl)}
                            alt={ent.stageName}
                            referrerPolicy="no-referrer"
                            className="w-14 h-14 rounded-xl object-cover shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <h2 className="font-headline-sm text-[17px] font-bold text-on-surface group-hover:text-secondary transition-colors truncate">
                                {ent.stageName}
                              </h2>
                              <span
                                className={`text-[10px] font-label-xs uppercase shrink-0 font-bold ${
                                  ent.kycStatus === 'verified'
                                    ? 'text-on-tertiary-container'
                                    : isRisingEntity(ent)
                                    ? 'text-secondary'
                                    : 'text-on-surface-variant'
                                }`}
                              >
                                {badgeLabel}
                              </span>
                            </div>

                            <p className="text-[12px] text-on-surface-variant truncate mt-0.5">
                              {genreAndLocation}
                              {ent.labelName || ent.agencyName
                                ? ` · ${ent.labelName || ent.agencyName}`
                                : ''}
                            </p>

                            <p className="text-[11px] font-mono-num text-on-surface-variant mt-0.5 tabular-nums">
                              {(ent.subscribers || 0).toLocaleString()} followers
                              {ent.gender ? ` · ${ent.gender}` : ''}
                            </p>

                            {ent.description && (
                              <p className="font-body-sm text-on-surface-variant line-clamp-2 mt-1.5">
                                {ent.description}
                              </p>
                            )}
                          </div>
                        </Link>

                        <div className="flex items-center justify-between gap-3 pt-1">
                          <Link
                            to={`/creator/${ent.id}`}
                            className="font-label-xs uppercase font-bold text-secondary hover:underline"
                          >
                            View Full Profile →
                          </Link>

                          {!ent.isClaimed && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!user) {
                                  setAuthPromptAction('claim a creator profile');
                                  return;
                                }
                                setClaimTarget(ent);
                                if (isAgencyEntity(ent)) setAffiliation('agency');
                                else setAffiliation('solo');
                                setViewTab('kyc');
                              }}
                              className="px-3.5 py-1.5 rounded-lg bg-primary text-on-primary font-label-xs uppercase font-bold hover:opacity-95"
                            >
                              Claim Profile
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {filteredDirectory.length > visibleCount && (
                  <div className="flex flex-col items-center gap-2 pt-4">
                    <span className="font-body-sm text-on-surface-variant tabular-nums">
                      Showing {Math.min(visibleCount, filteredDirectory.length)} of {filteredDirectory.length} matching profiles
                    </span>
                    <button
                      type="button"
                      onClick={() => setVisibleCount((v) => v + 36)}
                      className="px-6 py-2.5 rounded-xl border border-outline-variant/40 text-on-surface font-label-xs uppercase font-bold hover:border-secondary"
                    >
                      Load More Profiles (+36)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )
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
              Send 2,000 FCFA securely via Fapshi below. Unpaid drafts are never queued in the Admin Dashboard.
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
                ? 'Waiting for Fapshi Confirmation...'
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
                Send 5,000 FCFA securely via Fapshi. Your dossier enters Admin review only after payment settles.
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
              {memoBusy ? 'Waiting for Fapshi...' : 'Pay 5,000 FCFA & Submit'}
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
