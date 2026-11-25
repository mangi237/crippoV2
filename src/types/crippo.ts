export type MomoProvider = 'MTN' | 'ORANGE' | 'OTHER';
export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type EntityKycStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type RaceStatus =
  | 'auditing'
  | 'awaiting_creator_acceptance'
  | 'open'
  | 'closed'
  | 'clearing'
  | 'rejected';
export type CatalystSegment = 'Trending' | 'Entertainment' | 'Music' | 'Tech' | 'Local News';
export type CatalystSentiment = 'bullish' | 'neutral' | 'risk_alert';
export type ListenerRegion = 'cameroon_africa' | 'diaspora_mixed' | 'global_eu_us';

export interface UserPublic {
  uid: string;
  anonymousId: string;
  displayName: string;
  avatarUrl?: string;
  walletBalanceXAF?: number;
  city: string;
  interests: string[];
  onboardingComplete: boolean;
  creatorModeEnabled: boolean;
  claimedEntityId?: string;
  kycStatus: KycStatus;
  affiliationType?: 'solo' | 'agency';
  agencyName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivate {
  uid: string;
  email?: string;
  phone: string;
  momoProvider: MomoProvider;
  fullNameLegal?: string;
  cniNumber?: string;
  niuNumber?: string;
  cniFrontUrl?: string;
  cniBackUrl?: string;
  selfieUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EntityAffiliation {
  role: string;
  type: string;
  agencyId: string;
  agencyName: string;
  verified: boolean;
}

export interface EntityDiscographyItem {
  title: string;
  year: number | string;
  type: string;
}

export interface EntityFilmographyItem {
  title: string;
  year: number | string;
  role: string;
}

export interface Entity {
  id: string;
  record_type?: 'creator' | 'creator_rising' | 'label_agency' | 'brand';
  quota_bucket?: 'male_creator' | 'female_creator' | 'label_agency' | 'brand' | 'rising_hope';
  stageName: string;
  legalFullName?: string;
  gender?: 'M' | 'F';
  description?: string;
  bio?: string;
  shortBio?: string;
  hometown?: string;
  baseCity?: string;
  primaryMarket?: string;
  activeSince?: string;
  education?: string;
  languages?: string[];
  careerMilestones?: string[];
  labelName?: string;
  age?: number;
  genres?: string[];
  primaryRole?: string;
  roles?: string[];
  subGenres?: string[];
  revenueWeightSplit?: Record<string, number>;
  affiliations?: EntityAffiliation[];
  discography?: EntityDiscographyItem[];
  filmography?: EntityFilmographyItem[];
  awards?: string[];
  pastRacesCount?: number;
  onTimeDeliveryPct?: number;
  combinedFollowers?: number;
  audienceGeo?: string;
  eligibleRaceCategories?: string[];
  upcomingProjects?: string[];
  category: string;
  city: string;
  country: string;
  entityType: 'solo' | 'creator' | 'agency' | 'brand';
  youtubeChannelId?: string;
  tiktokHandle?: string;
  instagramHandle?: string;
  facebookPage?: string;
  spotifyArtistId?: string;
  spotifyUrl?: string;
  spotifyMonthlyListeners?: number;
  spotifyStreams?: number;
  website?: string;
  avatarUrl?: string;
  subscribers?: number;
  monthlyViews?: number;
  engagementRate?: number;
  catalogValuationXAF?: number;
  marketCapXAF?: number;
  dividendsDisbursedXAF?: number;
  isrcCount?: number;
  wikiGrade?: string;
  payoutMomoNetwork?: string;
  isClaimed: boolean;
  claimedByUid?: string;
  claimStatus?: string;
  photoStatus?: string;
  verificationStatus?: string;
  sourceUrl?: string;
  notes?: string;
  bioVerificationCode?: string;
  kycStatus: EntityKycStatus;
  agencyName?: string;
  agencyType?: string;
  headquartersCity?: string;
  foundedYear?: number;
  founders?: string[];
  corporateBio?: string;
  websiteAndSocials?: {
    website?: string;
    instagram?: string;
    youtube?: string;
    facebook?: string;
    tiktok?: string;
  };
  corporateDocs?: {
    rccmNumber?: string;
    niuNumber?: string;
    verified?: boolean;
  };
  rosterCreatorIds?: string[];
  rosterSize?: number;
  collectiveReach?: number;
  specialties?: string[];
  activeMandatesCount?: number;
  completedBrandCampaigns?: number;
  agencyCrippoScore?: number;
  brandName?: string;
  industryVertical?: string;
  operatingCountries?: string[];
  brandOverview?: string;
  businessDocs?: {
    rccmNumber?: string;
    niuNumber?: string;
    verified?: boolean;
  };
  paymentReliabilityBadge?: string;
  targetNiches?: string[];
  targetLanguages?: string[];
  typicalCampaignTier?: string;
  pastCreatorCollaborations?: string[];
  affiliatedAgencyId?: string;
  affiliatedAgencyUid?: string;
  rccmNumber?: string;
  niuNumber?: string;
  isPublic: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PricePoint {
  timestamp: string;
  priceXAF: number;
  reason?: string;
}

export interface RaceMilestone {
  phase: string;
  title: string;
  targetDate: string;
  status: 'active' | 'completed' | 'upcoming';
  escrowReleasePct?: number;
}

export interface LegalQuestionnaire {
  issuerType: 'solo' | 'agency';
  legalFullName?: string;
  cniNumber?: string;
  niuNumber: string;
  nextOfKinName?: string;
  nextOfKinPhone?: string;
  companyName?: string;
  rccmNumber?: string;
  mandateUrl?: string;
  masterRightsOwned: boolean;
  noObjectionUrl?: string;
  distributor: string;
  signatureText: string;
  signedAt: string;
}

export interface ValuationBreakdown {
  listenerRegion: ListenerRegion;
  spotifyRateXAF: number;
  audiomackRateXAF: number;
  youtubeRpmXAF: number;
  fairSharePriceXAF: number;
  recommendedTotalShares: number;
  pctPerShare: number;
}

export interface Race {
  id: string;
  entityId: string;
  creatorUid: string;
  creatorName: string;
  title: string;
  coverArtUrl?: string;
  category: string;
  monitorableSources: string[];
  netBudgetXAF: number;
  grossTargetXAF: number;
  revSharePct: number;
  pctPerShare?: number;
  roiDurationMonths: number;
  productionDeadline: string;
  raceCloseDate: string;
  unitSharePriceXAF: number;
  currentSharePriceXAF: number;
  totalShares: number;
  sharesSold: number;
  crippoScore: number;
  scoreBreakdown?: {
    growth: number;
    engagement: number;
    monitorability: number;
    roiSpeed: number;
    consistency: number;
  };
  projectedRevenueXAF?: number;
  regionalValuationNote?: string;
  valuationBreakdown?: ValuationBreakdown;
  appliedCatalystIds?: string[];
  capTableHash?: string;
  clearingEmail?: string;
  isrcCode?: string;
  tranche1Released?: boolean;
  tranche2Released?: boolean;
  splitVerified?: boolean;
  milestones?: RaceMilestone[];
  status: RaceStatus;
  legalDetails?: LegalQuestionnaire;
  priceHistory?: PricePoint[];
  rejectionReason?: string;
  isPublic: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Trade {
  id: string;
  raceId: string;
  raceTitle: string;
  creatorName: string;
  buyerUid: string;
  anonymousId: string;
  side: 'BUY' | 'SELL';
  shares: number;
  pricePerShareXAF: number;
  totalAmountXAF: number;
  paymentReference: string;
  status: 'settled' | 'closed';
  isPublicOrderBook: boolean;
  createdAt?: unknown;
}

export interface Payment {
  id: string;
  uid: string;
  type:
    | 'SHARE_PURCHASE'
    | 'MEMO_FEE'
    | 'BRAND_ESCROW'
    | 'ROYALTY_DISBURSEMENT'
    | 'WALLET_DEPOSIT'
    | 'WALLET_WITHDRAWAL';
  reference: string;
  amountXAF: number;
  provider: MomoProvider | 'CARD' | 'WALLET' | 'FAPSHI' | 'CAMPAY';
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
  raceId?: string;
  memoId?: string;
  campaignId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Catalyst {
  id: string;
  entityId?: string;
  entityName: string;
  raceId?: string;
  segment: CatalystSegment;
  sourcePlatform: 'TikTok' | 'Facebook' | 'YouTube' | 'Web';
  sourceName: string;
  sourceUrl?: string;
  headline: string;
  summary: string;
  sentiment: CatalystSentiment;
  priceImpactPct: number;
  engagementCount?: number;
  publishedAt?: string;
  createdBy?: string;
  aiMarketAssessment?: string;
  aiPredictionImpact?: string;
  aiConfidence?: number;
  aiGeneratedAt?: string;
  isPublic: boolean;
  createdAt?: unknown;
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

export interface PredictionMarket {
  id: string;
  creatorUid: string;
  entityName: string;
  topicCategory?: 'Music Milestones' | 'Viral View Milestones' | 'Culture & Awards' | 'Creator Releases';
  pollType?: 'yes_no' | 'multi_choice';
  question: string;
  description?: string;
  coverArtUrl?: string;
  resolutionSource?: string;
  aiProbability?: number;
  reasoning?: string;
  options?: PollOption[];
  votedUids?: string[];
  yesPriceXAF?: number;
  noPriceXAF?: number;
  yesVotes: number;
  noVotes: number;
  totalVolumeXAF?: number;
  endsAt: string;
  status: 'open' | 'closed' | 'resolved_yes' | 'resolved_no';
  isPublic: boolean;
  createdAt?: unknown;
}

export interface Memo {
  id: string;
  requesterUid: string;
  fullName?: string;
  stageName: string;
  platformLink: string;
  socialAccounts?: string;
  shortBio?: string;
  motivation?: string;
  recipientNumber?: string;
  paymentCompleted?: boolean;
  tier: 'fan_2000' | 'fast_track_5000';
  feeXAF: number;
  paymentReference?: string;
  auditSummary?: string;
  status: 'pending_payment' | 'auditing' | 'approved' | 'rejected';
  createdAt?: unknown;
}

export interface Campaign {
  id: string;
  brandUid: string;
  brandName: string;
  title: string;
  niche: string;
  city: string;
  budgetXAF: number;
  commissionPct?: number;
  brief: string;
  applicantEntityIds?: string[];
  selectedEntityId?: string;
  escrowPaymentRef?: string;
  status: 'open' | 'funded_escrow' | 'completed';
  isPublic: boolean;
  createdAt?: unknown;
}

export interface DividendPayout {
  id: string;
  raceId: string;
  raceTitle: string;
  recipientUid: string;
  recipientAnonymousId?: string;
  sharesHeld: number;
  clearedPoolXAF?: number;
  payoutAmountXAF: number;
  momoReference?: string;
  periodLabel: string;
  status: 'disbursed' | 'pending';
  createdAt?: unknown;
}

export interface NotificationItem {
  id: string;
  recipientUid: string;
  type:
    | 'kyc_approved'
    | 'kyc_rejected'
    | 'raise_offer'
    | 'raise_rejected'
    | 'affiliation_request'
    | 'memo_status'
    | 'dividend';
  title: string;
  message: string;
  raceId?: string;
  requestId?: string;
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
  read: boolean;
  createdAt?: unknown;
}

export interface AffiliationRequest {
  id: string;
  agencyUid: string;
  agencyEntityId: string;
  agencyName: string;
  creatorUid: string;
  creatorEntityId: string;
  creatorStageName: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface IntegrationStatus {
  firebaseConfigured: boolean;
  geminiConfigured: boolean;
  fapshiConfigured?: boolean;
  fapshiEnv?: string;
  campayConfigured?: boolean;
  campayEnv?: string;
  youtubeConfigured: boolean;
  apifyConfigured: boolean;
  spotifyConfigured: boolean;
}
