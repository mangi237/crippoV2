import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { doc, setDoc, updateDoc, arrayUnion, serverTimestamp, runTransaction } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { AnimatePresence, motion } from 'motion/react';
import { db, storage, handleFirestoreError, OperationType } from '../services/firebase';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import { useLanguage } from '../contexts/LanguageContext';
import { CamPayCheckoutModal } from '../components/CamPayCheckoutModal';
import { AuthPromptModal } from '../components/AuthPromptModal';
import { VerifiedCreatorOnly } from '../components/VerifiedCreatorOnly';
import { formatTimeRemaining, getCoverImage } from '../utils/media';
import type { Race, PredictionMarket, Catalyst, CatalystSegment, PollOption } from '../types/crippo';

const CATEGORIES = ['All', 'Single', 'EP / Album', 'TikTok Series', 'YouTube Show', 'Movie'];
const SEGMENTS: Array<'All' | CatalystSegment> = [
  'All',
  'Trending',
  'Entertainment',
  'Music',
  'Tech',
  'Local News',
];
const ARTICLE_SEGMENTS: CatalystSegment[] = ['Trending', 'Entertainment', 'Music', 'Tech', 'Local News'];

type PredictionExtras = PredictionMarket & { description?: string; coverArtUrl?: string };

interface HomeProps {
  onOpenApiSetup: () => void;
}

export function Home({ onOpenApiSetup }: HomeProps) {
  const { user } = useAuth();
  const { races, entities, catalysts, predictions, searchQuery, showToast, isAdmin } = useMarket();
  const { lang, t } = useLanguage();

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSegment, setSelectedSegment] = useState<'All' | CatalystSegment>('All');

  const [activePredIdx, setActivePredIdx] = useState(0);
  const [hoverPred, setHoverPred] = useState(false);

  const [checkoutRace, setCheckoutRace] = useState<Race | null>(null);
  const [authPromptAction, setAuthPromptAction] = useState<string | null>(null);

  const [syncingPulse, setSyncingPulse] = useState(false);
  const [liveScrapedCatalysts, setLiveScrapedCatalysts] = useState<Catalyst[]>([]);
  const [mintingPreds, setMintingPreds] = useState(false);
  const [votingBusy, setVotingBusy] = useState(false);

  // Admin poll creation state (yes/no OR multi-choice category awards)
  const [showNewPredModal, setShowNewPredModal] = useState(false);
  const [predPollType, setPredPollType] = useState<'yes_no' | 'multi_choice'>('yes_no');
  const [predTopicCategory, setPredTopicCategory] = useState<
    'Music Milestones' | 'Viral View Milestones' | 'Culture & Awards' | 'Creator Releases'
  >('Culture & Awards');
  const [predEntityName, setPredEntityName] = useState('');
  const [predQuestion, setPredQuestion] = useState('');
  const [predDescription, setPredDescription] = useState('');
  const [predImageUrl, setPredImageUrl] = useState('');
  const [predUploading, setPredUploading] = useState(false);
  const [predOptionsDraft, setPredOptionsDraft] = useState<string[]>(['', '', '']);
  const [predEndsAt, setPredEndsAt] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [predBusy, setPredBusy] = useState(false);

  // Admin manual article state
  const [showArticleModal, setShowArticleModal] = useState(false);
  const [artHeadline, setArtHeadline] = useState('');
  const [artSummary, setArtSummary] = useState('');
  const [artEntity, setArtEntity] = useState('');
  const [artSegment, setArtSegment] = useState<CatalystSegment>('Trending');
  const [artSourceName, setArtSourceName] = useState('');
  const [artSourceUrl, setArtSourceUrl] = useState('');
  const [artSentiment, setArtSentiment] = useState<'bullish' | 'neutral' | 'risk_alert'>('neutral');
  const [artImpact, setArtImpact] = useState(0);
  const [artBusy, setArtBusy] = useState(false);

  useEffect(() => {
    if (predictions.length <= 1 || hoverPred) return;
    const timer = setInterval(() => {
      setActivePredIdx((idx) => (idx + 1) % predictions.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [predictions.length, hoverPred]);

  useEffect(() => {
    if (activePredIdx >= predictions.length && predictions.length > 0) {
      setActivePredIdx(0);
    }
  }, [predictions.length, activePredIdx]);

  // Fetch fresh feed content from the backend scraping pipeline on load
  useEffect(() => {
    let active = true;
    fetch('/api/feed/pulse')
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: {
          catalysts?: Array<{
            entityName: string;
            segment: CatalystSegment;
            sourcePlatform: 'TikTok' | 'Facebook' | 'YouTube' | 'Web';
            sourceName: string;
            sourceUrl?: string;
            headline: string;
            summary: string;
            sentiment: 'bullish' | 'neutral' | 'risk_alert';
            priceImpactPct: number;
            engagementCount?: number;
            publishedAt?: string;
          }>;
        } | null) => {
          if (!active || !data?.catalysts?.length) return;
          const mapped: Catalyst[] = data.catalysts.map((item, idx) => ({
            id: `live_${idx}_${item.headline.slice(0, 12).replace(/[^a-zA-Z0-9]/g, '')}`,
            entityName: item.entityName || 'Cameroon Scene',
            segment: item.segment || 'Trending',
            sourcePlatform: item.sourcePlatform || 'Web',
            sourceName: item.sourceName || 'Crippo Pulse',
            sourceUrl: item.sourceUrl,
            headline: item.headline,
            summary: item.summary,
            sentiment: item.sentiment || 'neutral',
            priceImpactPct: Number(item.priceImpactPct || 0),
            engagementCount: item.engagementCount,
            publishedAt: item.publishedAt,
            isPublic: true,
          }));
          setLiveScrapedCatalysts(mapped);
        }
      )
      .catch(() => null);
    return () => {
      active = false;
    };
  }, []);

  const filteredRaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return races
      .filter((r) => r.isPublic)
      .filter((r) => {
        if (selectedCategory === 'All') return true;
        return r.category.toLowerCase().includes(selectedCategory.toLowerCase().split(' ')[0]);
      })
      .filter((r) => {
        if (!q) return true;
        return (
          r.title.toLowerCase().includes(q) ||
          r.creatorName.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)
        );
      });
  }, [races, selectedCategory, searchQuery]);

  const combinedCatalysts = useMemo(() => {
    const seen = new Set(catalysts.map((c) => c.headline.toLowerCase()));
    const extras = liveScrapedCatalysts.filter((c) => !seen.has(c.headline.toLowerCase()));
    return [...catalysts, ...extras];
  }, [catalysts, liveScrapedCatalysts]);

  const filteredCatalysts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return combinedCatalysts
      .filter((c) => (selectedSegment === 'All' ? true : c.segment === selectedSegment))
      .filter((c) => {
        if (!q) return true;
        return (
          c.entityName.toLowerCase().includes(q) ||
          c.headline.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q)
        );
      });
  }, [combinedCatalysts, selectedSegment, searchQuery]);

  const handleRefreshPulse = async () => {
    if (!user) {
      setAuthPromptAction('refresh live Trending News');
      return;
    }
    if (!user.emailVerified) {
      showToast(
        lang === 'fr' ? 'Vérification Requise' : 'Verified Email Required',
        lang === 'fr'
          ? 'Vérifiez votre e-mail pour actualiser les actualités.'
          : 'Verify your email address to refresh live Trending News.',
        'info'
      );
      return;
    }
    setSyncingPulse(true);
    try {
      const names = entities.slice(0, 6).map((e) => e.stageName);
      const resp = await apiFetch<{
        catalysts: Array<{
          entityName: string;
          segment: CatalystSegment;
          sourcePlatform: 'TikTok' | 'Facebook' | 'YouTube' | 'Web';
          sourceName: string;
          sourceUrl?: string;
          headline: string;
          summary: string;
          sentiment: 'bullish' | 'neutral' | 'risk_alert';
          priceImpactPct: number;
          engagementCount?: number;
        }>;
      }>('/api/agents/cultural-pulse', {
        method: 'POST',
        body: JSON.stringify({
          entityNames: names.length ? names : ['Cameroon Music', 'Douala Creators', 'Afropop'],
        }),
      });

      let count = 0;
      let repricedRaces = 0;
      const nowMs = Date.now();

      for (const item of resp.catalysts || []) {
        const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const seg: CatalystSegment = ARTICLE_SEGMENTS.includes(item.segment) ? item.segment : 'Trending';
        const plat: 'TikTok' | 'Facebook' | 'YouTube' | 'Web' = ['TikTok', 'Facebook', 'YouTube', 'Web'].includes(
          item.sourcePlatform
        )
          ? item.sourcePlatform
          : 'Web';
        const impact = Math.max(-50, Math.min(50, Number(item.priceImpactPct) || 0));
        const cleanEntityName = (item.entityName || 'Cameroon Scene').slice(0, 100);

        await setDoc(doc(db, 'catalysts', id), {
          id,
          entityName: cleanEntityName,
          segment: seg,
          sourcePlatform: plat,
          sourceName: (item.sourceName || plat).slice(0, 100),
          ...(item.sourceUrl ? { sourceUrl: item.sourceUrl.slice(0, 500) } : {}),
          headline: (item.headline || 'Market Signal').slice(0, 200),
          summary: (item.summary || 'Live market update captured.').slice(0, 600),
          sentiment: ['bullish', 'neutral', 'risk_alert'].includes(item.sentiment) ? item.sentiment : 'neutral',
          priceImpactPct: impact,
          ...(typeof item.engagementCount === 'number'
            ? { engagementCount: Math.max(0, item.engagementCount) }
            : {}),
          publishedAt: new Date().toISOString(),
          isPublic: true,
          createdAt: serverTimestamp(),
        });
        count++;

        // Adjust share price for open Raises matching this creator (only before raceCloseDate)
        if (impact !== 0) {
          const matchedOpenRaces = races.filter(
            (r) =>
              r.status === 'open' &&
              new Date(r.raceCloseDate).getTime() > nowMs &&
              !(r.appliedCatalystIds || []).includes(id) &&
              (r.creatorName.toLowerCase().includes(cleanEntityName.toLowerCase()) ||
                cleanEntityName.toLowerCase().includes(r.creatorName.toLowerCase()))
          );
          for (const race of matchedOpenRaces) {
            const boundedImpact = Math.max(-25, Math.min(25, impact));
            const nextPrice = Math.max(100, Math.round(race.currentSharePriceXAF * (1 + boundedImpact / 100)));
            if (nextPrice !== race.currentSharePriceXAF) {
              const nextHistory = [
                ...(race.priceHistory || []).slice(-39),
                {
                  timestamp: new Date().toISOString(),
                  priceXAF: nextPrice,
                  reason: `News: ${item.headline.slice(0, 48)}`,
                },
              ];
              await updateDoc(doc(db, 'races', race.id), {
                currentSharePriceXAF: nextPrice,
                priceHistory: nextHistory,
                appliedCatalystIds: [...(race.appliedCatalystIds || []).slice(-49), id],
                updatedAt: serverTimestamp(),
              });
              repricedRaces++;
            }
          }
        }
      }

      showToast(
        lang === 'fr' ? 'Actualités Mises à Jour' : 'Trending News Updated',
        repricedRaces > 0
          ? `${count} stories ingested · ${repricedRaces} active Raise prices adjusted.`
          : `${count} live stories ingested.`
      );
    } catch (err: unknown) {
      const e = err as Error & { missingKeys?: string[] };
      if (isAdmin && e.missingKeys?.length) onOpenApiSetup();
      showToast('News Update Error', e.message || 'Could not refresh news.', 'error');
    } finally {
      setSyncingPulse(false);
    }
  };

  const handleAutoMintPredictions = async () => {
    if (!user) {
      setAuthPromptAction('generate predictions');
      return;
    }
    if (!user.emailVerified) {
      showToast('Verified Email Required', 'Verify your email to generate predictions.', 'info');
      return;
    }
    setMintingPreds(true);
    try {
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

      let created = 0;
      for (const p of resp.predictions || []) {
        const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await setDoc(doc(db, 'predictions', id), {
          id,
          creatorUid: user.uid,
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
        created++;
      }
      showToast('Fan Polls Published', `${created} cultural fan voting polls live.`);
    } catch (err: unknown) {
      const e = err as Error & { missingKeys?: string[] };
      if (isAdmin && e.missingKeys?.length) onOpenApiSetup();
      showToast('Poll Error', e.message || 'Failed to synthesize polls.', 'error');
    } finally {
      setMintingPreds(false);
    }
  };

  const handlePollImageUpload = async (file: File) => {
    if (!user) return;
    setPredUploading(true);
    try {
      const storageRef = ref(storage, `predictions/${user.uid}/poll_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      setPredImageUrl(await getDownloadURL(storageRef));
      showToast('Image Uploaded', 'Poll image stored.');
    } catch (err: unknown) {
      showToast('Upload Failed', (err as Error).message || 'Could not upload image.', 'error');
    } finally {
      setPredUploading(false);
    }
  };

  const resetPollForm = () => {
    setPredEntityName('');
    setPredQuestion('');
    setPredDescription('');
    setPredImageUrl('');
    setPredOptionsDraft(['', '', '']);
  };

  const handleCreatePrediction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.emailVerified || !isAdmin) {
      showToast('Admin Only', 'Only the verified Crippo admin can publish a poll.', 'error');
      return;
    }
    if (predQuestion.trim().length < 5 || !predEntityName.trim()) {
      showToast('Validation', 'Enter a title and a question (5+ characters).', 'error');
      return;
    }

    let cleanOptions: PollOption[] = [];
    if (predPollType === 'multi_choice') {
      cleanOptions = predOptionsDraft
        .map((label, idx) => ({
          id: `opt_${idx + 1}_${Date.now().toString(36).slice(-4)}`,
          label: label.trim().slice(0, 80),
          votes: 0,
        }))
        .filter((o) => o.label.length > 0);

      if (cleanOptions.length < 2) {
        showToast('Options Required', 'Add at least 2 options for a multi-choice poll.', 'error');
        return;
      }
    }

    setPredBusy(true);
    const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      await setDoc(doc(db, 'predictions', id), {
        id,
        creatorUid: user.uid,
        entityName: predEntityName.trim().slice(0, 100),
        topicCategory: predTopicCategory,
        pollType: predPollType,
        question: predQuestion.trim().slice(0, 240),
        ...(predDescription.trim() ? { description: predDescription.trim().slice(0, 600) } : {}),
        ...(predImageUrl ? { coverArtUrl: predImageUrl } : {}),
        ...(predPollType === 'multi_choice' ? { options: cleanOptions } : {}),
        yesVotes: 0,
        noVotes: 0,
        votedUids: [],
        endsAt: new Date(predEndsAt).toISOString(),
        status: 'open',
        isPublic: true,
        createdAt: serverTimestamp(),
      });
      setShowNewPredModal(false);
      resetPollForm();
      showToast('Poll Published', 'Fan voting poll is now live.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `predictions/${id}`);
    } finally {
      setPredBusy(false);
    }
  };

  // Transaction-based vote: reads the latest counts so simultaneous votes are not lost
  const handleCastVote = async (pred: PredictionMarket, choice: 'YES' | 'NO' | string) => {
    if (!user) {
      setAuthPromptAction('cast your fan vote');
      return;
    }
    if (pred.votedUids?.includes(user.uid)) {
      showToast('Already Voted', 'You have already cast your vote on this poll.', 'info');
      return;
    }
    setVotingBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const pref = doc(db, 'predictions', pred.id);
        const snap = await tx.get(pref);
        if (!snap.exists()) throw new Error('This poll no longer exists.');
        const data = snap.data() as PredictionMarket;
        if ((data.votedUids || []).includes(user.uid)) throw new Error('ALREADY_VOTED');

        if (data.pollType === 'multi_choice' && data.options) {
          // The chosen option's count goes up by one; the option with the most votes leads
          const updatedOptions = data.options.map((opt) =>
            opt.id === choice ? { ...opt, votes: (opt.votes || 0) + 1 } : opt
          );
          tx.update(pref, { options: updatedOptions, votedUids: arrayUnion(user.uid) });
        } else {
          tx.update(pref, {
            ...(choice === 'YES'
              ? { yesVotes: (data.yesVotes || 0) + 1 }
              : { noVotes: (data.noVotes || 0) + 1 }),
            votedUids: arrayUnion(user.uid),
          });
        }
      });
      showToast(
        lang === 'fr' ? 'Vote Enregistré' : 'Vote Counted',
        lang === 'fr' ? 'Merci pour votre participation !' : 'Your fan vote has been recorded.'
      );
    } catch (err) {
      if ((err as Error).message === 'ALREADY_VOTED') {
        showToast('Already Voted', 'You have already cast your vote on this poll.', 'info');
      } else if ((err as Error).message?.includes('no longer exists')) {
        showToast('Poll Unavailable', (err as Error).message, 'error');
      } else {
        handleFirestoreError(err, OperationType.UPDATE, `predictions/${pred.id}`);
      }
    } finally {
      setVotingBusy(false);
    }
  };

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (artHeadline.trim().length < 5 || !artEntity.trim()) {
      showToast('Validation', 'Enter an entity and a headline (5+ characters).', 'error');
      return;
    }
    setArtBusy(true);
    const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      await setDoc(doc(db, 'catalysts', id), {
        id,
        entityName: artEntity.trim().slice(0, 100),
        segment: artSegment,
        sourcePlatform: 'Web',
        sourceName: (artSourceName.trim() || 'Crippo Editorial').slice(0, 100),
        ...(artSourceUrl.trim() ? { sourceUrl: artSourceUrl.trim().slice(0, 500) } : {}),
        headline: artHeadline.trim().slice(0, 200),
        summary: (artSummary.trim() || artHeadline.trim()).slice(0, 600),
        sentiment: artSentiment,
        priceImpactPct: Math.max(-50, Math.min(50, Number(artImpact) || 0)),
        publishedAt: new Date().toISOString(),
        isPublic: true,
        createdBy: 'admin_manual',
        createdAt: serverTimestamp(),
      });
      setShowArticleModal(false);
      setArtHeadline('');
      setArtSummary('');
      setArtEntity('');
      setArtSourceName('');
      setArtSourceUrl('');
      setArtImpact(0);
      showToast('Article Published', 'The article is now in Trending News.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `catalysts/${id}`);
    } finally {
      setArtBusy(false);
    }
  };

  const activePred = predictions[activePredIdx] as PredictionExtras | undefined;
  const isMultiChoice = activePred?.pollType === 'multi_choice' && (activePred.options?.length || 0) >= 2;
  const totalYesNoVotes = activePred ? activePred.yesVotes + activePred.noVotes : 0;
  const yesPct = totalYesNoVotes > 0 ? Math.round((activePred!.yesVotes / totalYesNoVotes) * 100) : 50;
  const noPct = totalYesNoVotes > 0 ? 100 - yesPct : 50;
  const multiTotalVotes = isMultiChoice
    ? (activePred?.options || []).reduce((acc, o) => acc + (o.votes || 0), 0)
    : 0;
  const leaderId =
    isMultiChoice && activePred?.options
      ? [...activePred.options].sort((a, b) => (b.votes || 0) - (a.votes || 0))[0]?.votes
        ? [...activePred.options].sort((a, b) => (b.votes || 0) - (a.votes || 0))[0].id
        : undefined
      : undefined;
  const userAlreadyVoted = Boolean(user && activePred?.votedUids?.includes(user.uid));

  return (
    <div className="flex flex-col gap-10">
      {/* 1. LIVE RAISES (feed only) */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="font-headline-lg-mobile md:font-headline-lg text-on-surface font-bold">Live Raises</h1>
            <span className="px-2 py-0.5 rounded bg-on-tertiary-container/15 text-on-tertiary-container font-label-xs uppercase font-bold tabular-nums">
              {filteredRaces.length} ACTIVE
            </span>
          </div>

          <div className="flex items-center gap-3">
            <VerifiedCreatorOnly requireCanLaunch>
              <Link
                to="/launch-race"
                className="px-3.5 py-2 rounded-xl bg-secondary text-on-secondary font-label-md font-bold hover:opacity-95"
              >
                + Launch a Raise
              </Link>
            </VerifiedCreatorOnly>
            <Link to="/races" className="font-label-xs uppercase text-secondary font-bold hover:underline">
              VIEW ALL ({filteredRaces.length})
            </Link>
          </div>
        </div>

        {/* Category Filter Strip */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full font-label-md whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-primary text-on-primary font-semibold'
                  : 'text-on-surface-variant hover:text-secondary border border-outline-variant/35'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {filteredRaces.length === 0 ? (
          <div className="py-10 border-t border-outline-variant/25 text-center flex flex-col items-center gap-3">
            <h3 className="font-headline-sm text-on-surface font-bold">{t('no_races_title')}</h3>
            <p className="font-body-md text-on-surface-variant max-w-md">{t('no_races_desc')}</p>
            <VerifiedCreatorOnly
              requireCanLaunch
              fallback={
                <Link
                  to="/creators"
                  className="mt-1 px-4 py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
                >
                  Explore Creators Directory
                </Link>
              }
            >
              <Link
                to="/launch-race"
                className="mt-1 px-4 py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
              >
                {t('launch_first_race')}
              </Link>
            </VerifiedCreatorOnly>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {filteredRaces.map((race) => {
              const fundedPct = Math.min(100, Math.round((race.sharesSold / Math.max(1, race.totalShares)) * 100));
              const raisedXAF = race.sharesSold * race.currentSharePriceXAF;
              const sharesLeft = Math.max(0, race.totalShares - race.sharesSold);
              const isOpenWindow =
                race.status === 'open' && Date.now() < new Date(race.raceCloseDate).getTime() && sharesLeft > 0;
              const sparkData =
                race.priceHistory && race.priceHistory.length >= 2
                  ? race.priceHistory.slice(-10).map((p, idx) => ({ idx, price: p.priceXAF }))
                  : [
                      { idx: 0, price: race.unitSharePriceXAF },
                      { idx: 1, price: race.currentSharePriceXAF },
                    ];

              return (
                <article key={race.id} className="pt-4 border-t border-outline-variant/25 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <img
                        src={getCoverImage(race.category, race.coverArtUrl)}
                        alt={race.title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/race/${race.id}`}
                            className="font-headline-sm text-[16px] text-on-surface font-bold hover:text-secondary truncate"
                          >
                            {race.creatorName}: {race.title}
                          </Link>
                          <span className="px-2 py-0.5 rounded bg-on-tertiary-container/15 text-on-tertiary-container font-label-xs font-bold shrink-0 tabular-nums">
                            {race.crippoScore}/100
                          </span>
                        </div>
                        <p className="font-body-sm text-on-surface-variant truncate mt-0.5">
                          {race.category} · {race.monitorableSources[0] || 'Digital Revenue Share'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <span className="font-ticker-val text-on-tertiary-container font-bold block">
                        +{race.revSharePct}% REV
                      </span>
                      <span className="font-body-sm text-[11px] text-on-surface-variant">{race.roiDurationMonths}m Term</span>
                    </div>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0 tabular-nums">
                      <span className="font-label-xs uppercase text-on-surface-variant block">FUNDED</span>
                      <span className="font-ticker-val text-on-surface font-bold">
                        {raisedXAF.toLocaleString()} FCFA{' '}
                        <span className="font-body-sm text-on-surface-variant font-normal">
                          / {(race.grossTargetXAF / 1_000_000).toFixed(1)}M
                        </span>
                      </span>
                    </div>

                    <div className="w-20 h-9 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sparkData}>
                          <Area
                            type="monotone"
                            dataKey="price"
                            stroke="#6f30dc"
                            strokeWidth={2}
                            fill="#6f30dc"
                            fillOpacity={0.14}
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <span className="font-label-xs uppercase text-on-surface-variant block">SHARE PRICE</span>
                      <span className="font-ticker-val text-secondary font-bold">
                        {race.currentSharePriceXAF.toLocaleString()} XAF
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                      <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${fundedPct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-on-surface-variant tabular-nums">
                      <span>{fundedPct}% Funded</span>
                      <span>
                        {sharesLeft} Shares Left · {formatTimeRemaining(race.raceCloseDate, lang)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      disabled={!isOpenWindow}
                      onClick={() => {
                        if (!user) {
                          setAuthPromptAction(`buy shares in "${race.title}"`);
                          return;
                        }
                        setCheckoutRace(race);
                      }}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-on-primary font-label-md text-[12px] font-bold uppercase tracking-wider hover:opacity-95 disabled:opacity-50"
                    >
                      {!isOpenWindow ? 'WINDOW CLOSED' : 'INVEST VIA MOMO'}
                    </button>
                    <Link
                      to={`/race/${race.id}`}
                      className="py-2.5 px-4 rounded-xl border border-outline-variant/50 text-on-surface font-label-md text-[12px] font-bold uppercase tracking-wider hover:border-secondary hover:text-secondary transition-colors"
                    >
                      DETAILS
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. CULTURAL PREDICTIONS & FAN VOTING */}
      <section
        id="predictions"
        className="border-t border-outline-variant/25 pt-8 flex flex-col gap-5"
        onMouseEnter={() => setHoverPred(true)}
        onMouseLeave={() => setHoverPred(false)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-headline-lg-mobile text-on-surface font-bold">
            {lang === 'fr' ? 'Votes & Prédictions des Fans' : 'Cultural Predictions & Fan Voting'}
          </h2>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={mintingPreds}
                onClick={handleAutoMintPredictions}
                className="px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface font-label-xs uppercase hover:border-secondary hover:text-secondary transition-colors disabled:opacity-60"
              >
                {mintingPreds ? '...' : 'Generate Polls'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewPredModal(true)}
                className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-xs uppercase font-bold"
              >
                + Create Poll
              </button>
            </div>
          )}
        </div>

        {activePred ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={activePred.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
              className="flex flex-col gap-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2.5 py-0.5 rounded bg-secondary-fixed text-secondary font-label-xs uppercase tracking-wider truncate">
                    {activePred.topicCategory || 'Culture & Awards'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-xs uppercase">
                    {isMultiChoice ? 'Multi-Choice Poll' : 'Yes / No Poll'}
                  </span>
                  <span className="font-body-sm text-on-surface-variant shrink-0 tabular-nums">
                    {activePredIdx + 1} / {predictions.length}
                  </span>
                </div>

                {predictions.length > 1 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActivePredIdx((i) => (i - 1 + predictions.length) % predictions.length)}
                      className="w-8 h-8 rounded-lg border border-outline-variant/40 flex items-center justify-center text-on-surface hover:border-secondary"
                    >
                      <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePredIdx((i) => (i + 1) % predictions.length)}
                      className="w-8 h-8 rounded-lg border border-outline-variant/40 flex items-center justify-center text-on-surface hover:border-secondary"
                    >
                      <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-4">
                <img
                  src={getCoverImage('Music', activePred.coverArtUrl)}
                  alt={activePred.entityName}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-xl object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <span className="font-label-xs uppercase text-secondary font-bold block">{activePred.entityName}</span>
                  <h3 className="font-headline-sm text-on-surface text-[18px] sm:text-[20px] leading-snug font-bold">
                    {activePred.question}
                  </h3>
                  {activePred.description && (
                    <p className="font-body-sm text-on-surface-variant mt-1">{activePred.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[12px] tabular-nums">
                    <span className="text-on-tertiary-container font-semibold">
                      {(isMultiChoice ? multiTotalVotes : totalYesNoVotes).toLocaleString()} Fan Votes
                    </span>
                    <span className="text-outline-variant">·</span>
                    <span className="text-on-surface-variant">Ends {formatTimeRemaining(activePred.endsAt, lang)}</span>
                    {userAlreadyVoted && (
                      <>
                        <span className="text-outline-variant">·</span>
                        <span className="text-secondary font-bold">You voted ✓</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {isMultiChoice && activePred.options ? (
                <div className="flex flex-col gap-2.5">
                  {activePred.options.map((opt) => {
                    const pct = multiTotalVotes > 0 ? Math.round(((opt.votes || 0) / multiTotalVotes) * 100) : 0;
                    const isLeader = opt.id === leaderId;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={votingBusy || userAlreadyVoted}
                        onClick={() => handleCastVote(activePred, opt.id)}
                        className={`relative w-full text-left px-4 py-3 rounded-xl border transition-colors overflow-hidden disabled:opacity-80 ${
                          isLeader ? 'border-secondary' : 'border-outline-variant/40 hover:border-secondary'
                        }`}
                      >
                        <div className="absolute inset-y-0 left-0 bg-secondary/12 transition-all duration-500" style={{ width: `${pct}%` }} />
                        <div className="relative flex items-center justify-between gap-3 tabular-nums">
                          <span className="font-label-md font-bold text-on-surface flex items-center gap-2">
                            {opt.label}
                            {isLeader && (
                              <span className="px-1.5 py-0.5 rounded bg-secondary text-on-secondary text-[10px] uppercase">
                                Leading
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono-num text-[12px] text-on-surface-variant">
                              {(opt.votes || 0).toLocaleString()} votes
                            </span>
                            <span className="font-ticker-val text-secondary font-bold w-11 text-right">{pct}%</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tabular-nums">
                      <span className="text-on-tertiary-container">
                        {yesPct}% YES ({activePred.yesVotes} votes)
                      </span>
                      <span className="text-error">
                        {noPct}% NO ({activePred.noVotes} votes)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-error overflow-hidden flex">
                      <div className="h-full bg-on-tertiary-container transition-all duration-500" style={{ width: `${yesPct}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={votingBusy || userAlreadyVoted}
                      onClick={() => handleCastVote(activePred, 'YES')}
                      className="py-3 px-4 rounded-xl bg-on-tertiary-container text-white flex items-center justify-between font-headline-sm text-[15px] font-bold hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-75"
                    >
                      <span>{userAlreadyVoted ? 'Voted' : 'Vote YES'}</span>
                      <span className="font-mono-num tabular-nums">{yesPct}%</span>
                    </button>
                    <button
                      type="button"
                      disabled={votingBusy || userAlreadyVoted}
                      onClick={() => handleCastVote(activePred, 'NO')}
                      className="py-3 px-4 rounded-xl bg-error text-white flex items-center justify-between font-headline-sm text-[15px] font-bold hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-75"
                    >
                      <span>{userAlreadyVoted ? 'Voted' : 'Vote NO'}</span>
                      <span className="font-mono-num tabular-nums">{noPct}%</span>
                    </button>
                  </div>
                </>
              )}

              {predictions.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  {predictions.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActivePredIdx(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === activePredIdx ? 'w-6 bg-secondary' : 'w-2 bg-outline-variant/50'
                      }`}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="flex flex-col items-start justify-center gap-3 py-2">
            <p className="font-body-md text-on-surface-variant">
              {lang === 'fr' ? 'Aucun sondage culturel publié pour le moment.' : 'No active fan voting polls yet.'}
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowNewPredModal(true)}
                className="px-4 py-2.5 rounded-xl bg-secondary text-white font-label-md font-bold"
              >
                + Create First Poll
              </button>
            )}
          </div>
        )}
      </section>

      {/* 3. TRENDING NEWS */}
      <section id="news" className="border-t border-outline-variant/25 pt-8 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-headline-lg-mobile text-on-surface font-bold">Trending News</h2>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowArticleModal(true)}
                className="px-3.5 py-2 rounded-xl bg-secondary text-on-secondary font-label-xs uppercase font-bold"
              >
                + Write Article
              </button>
            )}
            <button
              type="button"
              disabled={syncingPulse}
              onClick={handleRefreshPulse}
              className="px-3.5 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-xs uppercase font-bold hover:border-secondary hover:text-secondary transition-colors disabled:opacity-60"
            >
              {syncingPulse ? 'Refreshing...' : 'Refresh News'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {SEGMENTS.map((seg) => (
            <button
              key={seg}
              type="button"
              onClick={() => setSelectedSegment(seg)}
              className={`px-3.5 py-1.5 rounded-full font-label-xs uppercase whitespace-nowrap transition-colors ${
                selectedSegment === seg
                  ? 'bg-secondary text-on-secondary font-bold'
                  : 'text-on-surface-variant border border-outline-variant/35 hover:text-on-surface'
              }`}
            >
              {seg}
            </button>
          ))}
        </div>

        {filteredCatalysts.length === 0 ? (
          <div className="py-8 text-center">
            <p className="font-label-md text-on-surface">{t('no_catalysts_title')}</p>
            <p className="font-body-sm text-on-surface-variant mt-1">{t('no_catalysts_desc')}</p>
          </div>
        ) : (
          <motion.div
            key={selectedSegment}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6"
          >
            {filteredCatalysts.map((c) => {
              const badgeCls =
                c.sentiment === 'bullish'
                  ? 'bg-on-tertiary-container/15 text-on-tertiary-container'
                  : c.sentiment === 'risk_alert'
                  ? 'bg-error/15 text-error'
                  : 'bg-surface-container text-on-surface-variant';

              return (
                <article key={c.id} className="pt-4 border-t border-outline-variant/25 flex flex-col justify-between gap-2.5">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-label-xs font-bold text-secondary uppercase truncate">{c.entityName}</span>
                      <span className="font-label-xs text-on-surface-variant shrink-0">{c.segment}</span>
                    </div>
                    <h3 className="font-label-md text-on-surface font-bold leading-snug">{c.headline}</h3>
                    <p className="font-body-sm text-on-surface-variant leading-relaxed line-clamp-3">{c.summary}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <span className="text-[11px] text-on-surface-variant truncate">{c.sourceName}</span>
                    <span className={`px-2 py-0.5 rounded font-label-xs uppercase font-bold tabular-nums ${badgeCls}`}>
                      {c.priceImpactPct >= 0 ? `+${c.priceImpactPct}%` : `${c.priceImpactPct}%`}
                    </span>
                  </div>
                </article>
              );
            })}
          </motion.div>
        )}
      </section>

      {checkoutRace && (
        <CamPayCheckoutModal
          mode="race"
          race={checkoutRace}
          onClose={() => setCheckoutRace(null)}
          onSuccess={(msg) => showToast('Trade Settled', msg, 'success')}
          onOpenApiSetup={onOpenApiSetup}
        />
      )}

      {authPromptAction && (
        <AuthPromptModal actionLabel={authPromptAction} onClose={() => setAuthPromptAction(null)} />
      )}

      {/* Admin: create a fan voting poll */}
      {showNewPredModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !predBusy) setShowNewPredModal(false);
          }}
        >
          <form
            onSubmit={handleCreatePrediction}
            className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-headline-sm text-on-surface font-bold">Create Fan Poll</h3>
              <button
                type="button"
                onClick={() => setShowNewPredModal(false)}
                className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 border-b border-outline-variant/25 pb-2">
              <button
                type="button"
                onClick={() => setPredPollType('yes_no')}
                className={`py-2 rounded-xl font-label-xs uppercase font-bold ${
                  predPollType === 'yes_no' ? 'bg-secondary text-white' : 'bg-surface-container-low text-on-surface-variant'
                }`}
              >
                Yes / No Question
              </button>
              <button
                type="button"
                onClick={() => setPredPollType('multi_choice')}
                className={`py-2 rounded-xl font-label-xs uppercase font-bold ${
                  predPollType === 'multi_choice' ? 'bg-secondary text-white' : 'bg-surface-container-low text-on-surface-variant'
                }`}
              >
                Vote Between Options
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Topic Category</label>
              <select
                value={predTopicCategory}
                onChange={(e) => setPredTopicCategory(e.target.value as typeof predTopicCategory)}
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              >
                <option value="Culture & Awards">Culture &amp; Awards</option>
                <option value="Music Milestones">Music Milestones</option>
                <option value="Viral View Milestones">Viral View Milestones</option>
                <option value="Creator Releases">Creator Releases</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Poll Title</label>
              <input
                type="text"
                required
                value={predEntityName}
                onChange={(e) => setPredEntityName(e.target.value)}
                placeholder="e.g. Best Male Artist 2026 / Locko vs Blanche Bailly"
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Question</label>
              <textarea
                required
                rows={2}
                value={predQuestion}
                onChange={(e) => setPredQuestion(e.target.value)}
                placeholder="Who should win? / Will the video pass 500,000 views in 14 days?"
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Description (optional)</label>
              <textarea
                rows={3}
                value={predDescription}
                onChange={(e) => setPredDescription(e.target.value)}
                placeholder="Context for fans: what is being decided and how it resolves."
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <label className="p-3 rounded-xl border border-dashed border-outline-variant cursor-pointer flex items-center justify-between">
              <span className="font-label-md text-secondary font-semibold">
                {predUploading ? 'Uploading image...' : predImageUrl ? 'Poll image uploaded' : 'Upload poll image (optional)'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePollImageUpload(f);
                }}
              />
            </label>

            {predPollType === 'multi_choice' && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="font-label-xs uppercase text-on-surface-variant">Options (min 2)</label>
                  {predOptionsDraft.length < 8 && (
                    <button
                      type="button"
                      onClick={() => setPredOptionsDraft((prev) => [...prev, ''])}
                      className="font-label-xs text-secondary font-bold hover:underline"
                    >
                      + Add Option
                    </button>
                  )}
                </div>
                {predOptionsDraft.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => {
                        const next = [...predOptionsDraft];
                        next[idx] = e.target.value;
                        setPredOptionsDraft(next);
                      }}
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface text-sm"
                    />
                    {predOptionsDraft.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setPredOptionsDraft((prev) => prev.filter((_, i) => i !== idx))}
                        className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-error"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Voting Closes On</label>
              <input
                type="date"
                required
                value={predEndsAt}
                onChange={(e) => setPredEndsAt(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <button
              type="submit"
              disabled={predBusy || predUploading}
              className="w-full py-3 rounded-xl bg-secondary text-on-secondary font-headline-sm text-[14px] font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {predBusy ? 'Publishing...' : 'Publish Poll'}
            </button>
          </form>
        </div>
      )}

      {/* Admin: write a news article manually */}
      {showArticleModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !artBusy) setShowArticleModal(false);
          }}
        >
          <form
            onSubmit={handleCreateArticle}
            className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-headline-sm text-on-surface font-bold">Write Article</h3>
              <button
                type="button"
                onClick={() => setShowArticleModal(false)}
                className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Creator / Entity</label>
              <input
                type="text"
                required
                value={artEntity}
                onChange={(e) => setArtEntity(e.target.value)}
                placeholder="e.g. Locko"
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Headline</label>
              <input
                type="text"
                required
                value={artHeadline}
                onChange={(e) => setArtHeadline(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Summary</label>
              <textarea
                rows={4}
                value={artSummary}
                onChange={(e) => setArtSummary(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-label-xs uppercase text-on-surface-variant">Segment</label>
                <select
                  value={artSegment}
                  onChange={(e) => setArtSegment(e.target.value as CatalystSegment)}
                  className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
                >
                  {ARTICLE_SEGMENTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-label-xs uppercase text-on-surface-variant">Sentiment</label>
                <select
                  value={artSentiment}
                  onChange={(e) => setArtSentiment(e.target.value as typeof artSentiment)}
                  className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
                >
                  <option value="bullish">Bullish</option>
                  <option value="neutral">Neutral</option>
                  <option value="risk_alert">Risk alert</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Source Name</label>
              <input
                type="text"
                value={artSourceName}
                onChange={(e) => setArtSourceName(e.target.value)}
                placeholder="e.g. Crippo Editorial"
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Source Link (optional)</label>
              <input
                type="url"
                value={artSourceUrl}
                onChange={(e) => setArtSourceUrl(e.target.value)}
                placeholder="https://"
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">Price Impact % (-50 to 50)</label>
              <input
                type="number"
                min={-50}
                max={50}
                value={artImpact}
                onChange={(e) => setArtImpact(Number(e.target.value) || 0)}
                className="px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface font-mono-num"
              />
            </div>

            <button
              type="submit"
              disabled={artBusy}
              className="w-full py-3 rounded-xl bg-secondary text-on-secondary font-headline-sm text-[14px] font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {artBusy ? 'Publishing...' : 'Publish Article'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
