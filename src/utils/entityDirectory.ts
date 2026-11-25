import { serverTimestamp } from 'firebase/firestore';
import type { Entity } from '../types/crippo';

export function isAgencyEntity(e: Pick<Entity, 'entityType' | 'quota_bucket' | 'record_type'>): boolean {
  return e.entityType === 'agency' || e.quota_bucket === 'label_agency' || e.record_type === 'label_agency';
}

export function isBrandEntity(
  e: Pick<Entity, 'entityType' | 'quota_bucket' | 'record_type' | 'wikiGrade'>
): boolean {
  return (
    e.entityType === 'brand' ||
    e.quota_bucket === 'brand' ||
    e.record_type === 'brand' ||
    e.wikiGrade === 'BRAND-SPONSOR'
  );
}

export function isRisingEntity(
  e: Pick<Entity, 'quota_bucket' | 'record_type' | 'wikiGrade'>
): boolean {
  return (
    e.quota_bucket === 'rising_hope' ||
    e.record_type === 'creator_rising' ||
    e.wikiGrade === 'RISING-237'
  );
}

export function isCreatorEntity(
  e: Pick<Entity, 'entityType' | 'quota_bucket' | 'record_type' | 'wikiGrade'>
): boolean {
  return !isAgencyEntity(e) && !isBrandEntity(e);
}

function cleanStr(val: unknown, maxLen: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  const s = val.trim();
  if (!s) return undefined;
  return s.slice(0, maxLen);
}

function cleanNum(val: unknown): number | undefined {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Produces a 100% Firestore-rules-compatible /entities/{id} document
 * matching the deployed strict hasOnly(...) field allowlist & length bounds.
 */
export function toFirestoreCompliantEntity(
  ent: Entity,
  overrides: Record<string, unknown> = {},
  isNewDoc = true
): Record<string, unknown> {
  const isAg = isAgencyEntity(ent);
  const isBr = isBrandEntity(ent);
  const isRis = isRisingEntity(ent);

  const safeGenres = Array.from(
    new Set(
      [
        ...(ent.genres || []),
        ...(ent.subGenres || []),
        ...(ent.roles || []),
        ...(ent.specialties || []),
        ...(ent.targetNiches || []),
      ]
        .map((g) => String(g || '').trim().slice(0, 40))
        .filter(Boolean)
    )
  ).slice(0, 15);

  const safeMilestones = Array.from(
    new Set(
      [...(ent.upcomingProjects || []), ...(ent.careerMilestones || [])]
        .map((s) => String(s || '').trim().slice(0, 140))
        .filter(Boolean)
    )
  ).slice(0, 10);

  const richBio =
    cleanStr(ent.bio || ent.shortBio || ent.corporateBio || ent.brandOverview, 3800) ||
    `${ent.stageName} profile indexed on Crippo.`;

  const wikiGrade =
    cleanStr(ent.wikiGrade, 40) ||
    (isBr ? 'BRAND-SPONSOR' : isAg ? 'AGENCY-237' : isRis ? 'RISING-237' : 'INDEX-237');

  const payload: Record<string, unknown> = {
    id: ent.id,
    stageName: (cleanStr(ent.stageName, 100) || ent.id).slice(0, 100),
    category: (cleanStr(ent.category || ent.agencyType || ent.industryVertical, 40) || 'Music').slice(0, 40),
    city: (cleanStr(ent.city || ent.baseCity || ent.headquartersCity, 40) || 'Douala').slice(0, 40),
    country: (cleanStr(ent.country, 40) || 'Cameroon').slice(0, 40),
    entityType: isAg ? 'agency' : 'solo',
    isClaimed: Boolean(ent.isClaimed),
    kycStatus: ent.kycStatus || 'unverified',
    isPublic: ent.isPublic !== false,
    wikiGrade,
    bio: richBio,
    updatedAt: serverTimestamp(),
  };

  if (isNewDoc) {
    payload.createdAt = serverTimestamp();
  }

  const legalFullName = cleanStr(ent.legalFullName, 120);
  if (legalFullName) payload.legalFullName = legalFullName;

  const description = cleanStr(ent.description, 500);
  if (description) payload.description = description;

  const labelName = cleanStr(ent.labelName || (isAg ? ent.agencyName : undefined), 120);
  if (labelName) payload.labelName = labelName;

  const agencyName = cleanStr(ent.agencyName, 100);
  if (agencyName) payload.agencyName = agencyName;

  if (safeGenres.length > 0) payload.genres = safeGenres;
  if (safeMilestones.length > 0) payload.upcomingProjects = safeMilestones;

  const youtube = cleanStr(ent.youtubeChannelId || ent.websiteAndSocials?.youtube, 120);
  if (youtube) payload.youtubeChannelId = youtube;

  const tiktok = cleanStr((ent.tiktokHandle || ent.websiteAndSocials?.tiktok || '').replace(/^@/, ''), 80);
  if (tiktok) payload.tiktokHandle = tiktok;

  const instagram = cleanStr((ent.instagramHandle || ent.websiteAndSocials?.instagram || '').replace(/^@/, ''), 80);
  if (instagram) payload.instagramHandle = instagram;

  const facebook = cleanStr(ent.facebookPage || ent.websiteAndSocials?.facebook, 120);
  if (facebook) payload.facebookPage = facebook;

  const spotifyId = cleanStr(ent.spotifyArtistId, 120);
  if (spotifyId) payload.spotifyArtistId = spotifyId;

  const avatar = cleanStr(ent.avatarUrl, 500);
  if (avatar && avatar.startsWith('http')) payload.avatarUrl = avatar;

  const subs = cleanNum(ent.subscribers ?? ent.combinedFollowers ?? ent.collectiveReach);
  if (subs !== undefined) payload.subscribers = subs;

  const views = cleanNum(ent.monthlyViews ?? ent.spotifyStreams);
  if (views !== undefined) payload.monthlyViews = views;

  const eng = cleanNum(ent.engagementRate);
  if (eng !== undefined) payload.engagementRate = eng;

  const valXaf = cleanNum(ent.catalogValuationXAF);
  if (valXaf !== undefined) payload.catalogValuationXAF = valXaf;

  if (ent.claimedByUid) payload.claimedByUid = ent.claimedByUid;
  if (ent.bioVerificationCode) payload.bioVerificationCode = cleanStr(ent.bioVerificationCode, 32);
  if (ent.affiliatedAgencyId) payload.affiliatedAgencyId = cleanStr(ent.affiliatedAgencyId, 128);
  if (ent.affiliatedAgencyUid) payload.affiliatedAgencyUid = cleanStr(ent.affiliatedAgencyUid, 128);
  if (ent.rccmNumber) payload.rccmNumber = cleanStr(ent.rccmNumber, 50);
  if (ent.niuNumber) payload.niuNumber = cleanStr(ent.niuNumber, 50);

  return { ...payload, ...overrides };
}

/**
 * Merges the verified 300-entity catalog with live Firestore /entities documents.
 * Live claim/KYC/bio/roster fields overlay the researched dossier cleanly while preserving
 * all rich Schema A/B/C attributes (affiliations, discography, filmography, brand/agency metadata).
 */
export function mergeDirectoryWithFirestore(catalog: Entity[], liveDocs: Entity[]): Entity[] {
  const liveById = new Map<string, Entity>();
  const liveByNormName = new Map<string, Entity>();
  for (const docItem of liveDocs) {
    liveById.set(docItem.id, docItem);
    liveByNormName.set(docItem.stageName.trim().toLowerCase(), docItem);
  }

  const usedLiveIds = new Set<string>();
  const mergedCatalog = catalog.map((cat) => {
    const live = liveById.get(cat.id) || liveByNormName.get(cat.stageName.trim().toLowerCase());
    if (!live) return cat;
    usedLiveIds.add(live.id);

    // Keep rich researched entityType ('creator' | 'agency' | 'brand') unless live explicitly upgraded to 'agency'
    const resolvedEntityType: Entity['entityType'] =
      live.entityType === 'agency'
        ? 'agency'
        : isBrandEntity(cat)
        ? 'brand'
        : cat.entityType;

    return {
      ...cat,
      ...live,
      id: live.id || cat.id,
      entityType: resolvedEntityType,
      record_type: cat.record_type,
      quota_bucket: cat.quota_bucket,
      gender: cat.gender,
      avatarUrl: live.avatarUrl || cat.avatarUrl,
      bio: live.bio && live.bio.length > (cat.bio?.length || 0) ? live.bio : cat.bio || live.bio,
      subscribers: live.subscribers && live.subscribers > 0 ? live.subscribers : cat.subscribers,
      affiliations: live.affiliations || cat.affiliations,
      roles: live.roles || cat.roles,
      primaryRole: live.primaryRole || cat.primaryRole,
      subGenres: live.subGenres || cat.subGenres,
      revenueWeightSplit: live.revenueWeightSplit || cat.revenueWeightSplit,
      discography: live.discography || cat.discography,
      filmography: live.filmography || cat.filmography,
      awards: live.awards || cat.awards,
      languages: live.languages || cat.languages,
      hometown: live.hometown || cat.hometown,
      baseCity: live.baseCity || cat.baseCity,
      activeSince: live.activeSince || cat.activeSince,
      careerMilestones: live.careerMilestones || cat.careerMilestones,
      agencyType: live.agencyType || cat.agencyType,
      rosterCreatorIds: live.rosterCreatorIds || cat.rosterCreatorIds,
      rosterSize: live.rosterSize ?? cat.rosterSize,
      collectiveReach: live.collectiveReach ?? cat.collectiveReach,
      industryVertical: live.industryVertical || cat.industryVertical,
      typicalCampaignTier: live.typicalCampaignTier || cat.typicalCampaignTier,
      targetNiches: live.targetNiches || cat.targetNiches,
      pastCreatorCollaborations: live.pastCreatorCollaborations || cat.pastCreatorCollaborations,
    };
  });

  const extraLive = liveDocs.filter((d) => !usedLiveIds.has(d.id));
  return [...extraLive, ...mergedCatalog];
}
