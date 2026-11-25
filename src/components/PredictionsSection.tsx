import React, { useState, useEffect } from 'react';
import { doc, setDoc, arrayUnion, serverTimestamp, runTransaction } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { AnimatePresence, motion } from 'motion/react';
import { db, storage, handleFirestoreError, OperationType } from '../services/firebase';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatTimeRemaining, getCoverImage } from '../utils/media';
import type { PredictionMarket, PollOption } from '../types/crippo';

interface PredictionsSectionProps {
  onOpenApiSetup: () => void;
  onRequireAuth: (actionLabel: string) => void;
}

export function PredictionsSection({ onOpenApiSetup, onRequireAuth }: PredictionsSectionProps) {
  const { user } = useAuth();
  const { entities, catalysts, predictions, showToast, isAdmin } = useMarket();
  const { lang } = useLanguage();

  const [activePredIdx, setActivePredIdx] = useState(0);
  const [hoverPred, setHoverPred] = useState(false);
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

  const handleAutoMintPredictions = async () => {
    if (!user) {
      onRequireAuth('generate predictions');
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

  const handleCastVote = async (pred: PredictionMarket, choice: 'YES' | 'NO' | string) => {
    if (!user) {
      onRequireAuth('cast your fan vote');
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

  const activePred = predictions[activePredIdx];
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
    <section
      id="predictions"
      className="flex flex-col gap-5"
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
              <div className="flex items-center gap-2 min-w-0 text-[11px] font-label-xs uppercase text-on-surface-variant">
                <span className="text-secondary font-bold truncate">
                  {activePred.topicCategory || 'Culture & Awards'}
                </span>
                <span>·</span>
                <span>{isMultiChoice ? 'Multi-Choice Poll' : 'Yes / No Poll'}</span>
                <span>·</span>
                <span className="tabular-nums">
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

            {isMultiChoice && activePred.options ? (
              <>
                <div className="flex items-start gap-4">
                  <img
                    src={getCoverImage('Music', activePred.coverArtUrl)}
                    alt={activePred.entityName}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-xl object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-label-xs uppercase text-secondary font-bold block">
                      {activePred.entityName}
                    </span>
                    <h3 className="font-headline-sm text-on-surface text-[18px] sm:text-[20px] leading-snug font-bold">
                      {activePred.question}
                    </h3>
                    {activePred.description && (
                      <p className="font-body-sm text-on-surface-variant mt-1">{activePred.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[12px] tabular-nums">
                      <span className="text-on-tertiary-container font-semibold">
                        {multiTotalVotes.toLocaleString()} Fan Votes
                      </span>
                      <span className="text-outline-variant">·</span>
                      <span className="text-on-surface-variant">
                        Ends {formatTimeRemaining(activePred.endsAt, lang)}
                      </span>
                      {userAlreadyVoted && (
                        <>
                          <span className="text-outline-variant">·</span>
                          <span className="text-secondary font-bold">You voted ✓</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

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
                        <div
                          className="absolute inset-y-0 left-0 bg-secondary/12 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
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
              </>
            ) : (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <img
                    src={getCoverImage('Music', activePred.coverArtUrl)}
                    alt={activePred.entityName}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-xl object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-label-xs uppercase text-secondary font-bold block">
                      {activePred.entityName}
                    </span>
                    <h3 className="font-headline-sm text-on-surface text-[18px] sm:text-[20px] leading-snug font-bold">
                      {activePred.question}
                    </h3>
                    {activePred.description && (
                      <p className="font-body-sm text-on-surface-variant mt-1">{activePred.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[12px] tabular-nums">
                      <span className="text-on-tertiary-container font-semibold">
                        {totalYesNoVotes.toLocaleString()} Fan Votes
                      </span>
                      <span className="text-outline-variant">·</span>
                      <span className="text-on-surface-variant">
                        Ends {formatTimeRemaining(activePred.endsAt, lang)}
                      </span>
                      {userAlreadyVoted && (
                        <>
                          <span className="text-outline-variant">·</span>
                          <span className="text-secondary font-bold">You voted ✓</span>
                        </>
                      )}
                    </div>
                    <div className="mt-2.5 max-w-md flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tabular-nums">
                        <span className="text-on-tertiary-container">
                          {yesPct}% YES ({activePred.yesVotes})
                        </span>
                        <span className="text-error">
                          {noPct}% NO ({activePred.noVotes})
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-error overflow-hidden flex">
                        <div
                          className="h-full bg-on-tertiary-container transition-all duration-500"
                          style={{ width: `${yesPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inline Row Yes / No Voting Buttons */}
                <div className="shrink-0 flex flex-row items-center gap-2.5 md:self-center">
                  <button
                    type="button"
                    disabled={votingBusy || userAlreadyVoted}
                    onClick={() => handleCastVote(activePred, 'YES')}
                    className="py-2.5 px-4 min-w-[116px] rounded-xl bg-on-tertiary-container text-white flex items-center justify-between gap-2.5 font-headline-sm text-[14px] font-bold hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-75"
                  >
                    <span>{userAlreadyVoted ? 'Voted' : 'YES'}</span>
                    <span className="font-mono-num tabular-nums">{yesPct}%</span>
                  </button>
                  <button
                    type="button"
                    disabled={votingBusy || userAlreadyVoted}
                    onClick={() => handleCastVote(activePred, 'NO')}
                    className="py-2.5 px-4 min-w-[116px] rounded-xl bg-error text-white flex items-center justify-between gap-2.5 font-headline-sm text-[14px] font-bold hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-75"
                  >
                    <span>{userAlreadyVoted ? 'Voted' : 'NO'}</span>
                    <span className="font-mono-num tabular-nums">{noPct}%</span>
                  </button>
                </div>
              </div>
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
    </section>
  );
}
