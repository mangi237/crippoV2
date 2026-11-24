import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import { useLanguage } from '../contexts/LanguageContext';
import { CamPayCheckoutModal } from '../components/CamPayCheckoutModal';
import { AuthPromptModal } from '../components/AuthPromptModal';
import { formatTimeRemaining, getCoverImage, getRaceTimelineStage } from '../utils/media';
import type { Race } from '../types/crippo';

interface RaceDetailProps {
  onOpenApiSetup: () => void;
}

export function RaceDetail({ onOpenApiSetup }: RaceDetailProps) {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const {
    races,
    publicOrders,
    myTrades,
    catalysts,
    acceptRaiseOffer,
    showToast,
  } = useMarket();
  const { lang } = useLanguage();

  const [directRace, setDirectRace] = useState<Race | null>(null);
  const [loadingDirect, setLoadingDirect] = useState(false);

  const race = useMemo(
    () => races.find((r) => r.id === id) || directRace,
    [races, id, directRace]
  );

  useEffect(() => {
    if (!id || races.some((r) => r.id === id)) return;
    setLoadingDirect(true);
    getDoc(doc(db, 'races', id))
      .then((snap) => {
        if (snap.exists()) setDirectRace(snap.data() as Race);
      })
      .catch(() => null)
      .finally(() => setLoadingDirect(false));
  }, [id, races]);

  const [deskSide, setDeskSide] = useState<'BUY' | 'SELL'>('BUY');
  const [buyShares, setBuyShares] = useState(2);
  const [sellShares, setSellShares] = useState(1);
  const [sellAskPrice, setSellAskPrice] = useState(0);
  const [postingAsk, setPostingAsk] = useState(false);
  const [acceptingOffer, setAcceptingOffer] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [authPromptAction, setAuthPromptAction] = useState<string | null>(null);

  useEffect(() => {
    if (race && sellAskPrice === 0) {
      setSellAskPrice(race.currentSharePriceXAF);
    }
  }, [race, sellAskPrice]);

  const myHeldShares = useMemo(() => {
    if (!race) return 0;
    return myTrades
      .filter((t) => t.raceId === race.id && t.status === 'settled')
      .reduce((sum, t) => sum + (t.side === 'BUY' ? t.shares : -t.shares), 0);
  }, [myTrades, race]);

  const raceOrders = useMemo(
    () => (race ? publicOrders.filter((o) => o.raceId === race.id) : []),
    [publicOrders, race]
  );

  const relatedCatalysts = useMemo(() => {
    if (!race) return [];
    return catalysts.filter(
      (c) =>
        c.raceId === race.id ||
        c.entityId === race.entityId ||
        c.entityName.toLowerCase() === race.creatorName.toLowerCase()
    );
  }, [catalysts, race]);

  if (loadingDirect && !race) {
    return (
      <div className="p-10 text-center font-body-md text-on-surface-variant">
        Loading Raise details...
      </div>
    );
  }

  if (!race) {
    return (
      <div className="py-12 text-center flex flex-col items-center gap-3">
        <h2 className="font-headline-sm text-on-surface font-bold">Raise Not Found</h2>
        <p className="font-body-md text-on-surface-variant">
          This project Raise may still be under private audit or was removed.
        </p>
        <Link
          to="/races"
          className="px-4 py-2 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
        >
          Back to Live Raises
        </Link>
      </div>
    );
  }

  const isCreatorOwner = Boolean(user && race.creatorUid === user.uid);
  const isRaiseWindowOpen =
    race.status === 'open' && Date.now() < new Date(race.raceCloseDate).getTime();

  const fundedPct = Math.min(
    100,
    Math.round((race.sharesSold / Math.max(1, race.totalShares)) * 100)
  );
  const sharesLeft = Math.max(0, race.totalShares - race.sharesSold);
  const deltaPct =
    race.unitSharePriceXAF > 0
      ? Number(
          (
            ((race.currentSharePriceXAF - race.unitSharePriceXAF) /
              race.unitSharePriceXAF) *
            100
          ).toFixed(1)
        )
      : 0;
  const isUp = deltaPct >= 0;
  const pctPerShare =
    race.pctPerShare ?? Number((race.revSharePct / Math.max(1, race.totalShares)).toFixed(4));

  const chartData =
    race.priceHistory && race.priceHistory.length >= 2
      ? race.priceHistory.map((p) => ({
          label: new Date(p.timestamp).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          }),
          price: p.priceXAF,
        }))
      : [
          { label: 'Initial', price: race.unitSharePriceXAF },
          { label: 'Live', price: race.currentSharePriceXAF },
        ];

  const timeline = getRaceTimelineStage(race, lang);
  const flightMilestones =
    race.milestones && race.milestones.length > 0
      ? race.milestones
      : [
          {
            phase: 'Phase 01',
            title: 'Capital Raise & CamPay Escrow Lock',
            targetDate: race.raceCloseDate,
            status: race.tranche1Released ? 'completed' : 'active',
            escrowReleasePct: 0,
          },
          {
            phase: 'Phase 02',
            title: 'Tranche 1 Release (50% Studio & Cast Mobilization)',
            targetDate: race.raceCloseDate,
            status: race.tranche1Released ? 'completed' : 'upcoming',
            escrowReleasePct: 50,
          },
          {
            phase: 'Phase 03',
            title: 'Master Cut Proof & ISRC Assignment (Tranche 2)',
            targetDate: race.productionDeadline,
            status: race.tranche2Released ? 'completed' : race.tranche1Released ? 'active' : 'upcoming',
            escrowReleasePct: 50,
          },
          {
            phase: 'Phase 04',
            title: `${race.roiDurationMonths}-Month Streaming & MoMo Royalty Clearing`,
            targetDate: `${race.roiDurationMonths}m Window`,
            status: race.splitVerified ? 'active' : 'upcoming',
            escrowReleasePct: 100,
          },
        ];

  const sellGrossXAF = Math.round(sellShares * Math.max(100, sellAskPrice));
  const clearingFeeXAF = Math.round(sellGrossXAF * 0.03);
  const netPayoutXAF = Math.max(0, sellGrossXAF - clearingFeeXAF);

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Share Link Copied', 'Public Raise page URL copied to clipboard.');
    } catch {
      showToast('Share URL', window.location.href, 'info');
    }
  };

  const handlePostSellOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRaiseWindowOpen) {
      showToast('Trading Locked', 'Raise window has closed. Shares are in dividend tracking mode.', 'error');
      return;
    }
    if (!user) {
      setAuthPromptAction('post a secondary resale order');
      return;
    }
    if (!profile || !user.emailVerified) {
      showToast('Verified Account Required', 'Sign in with a verified email to trade.', 'error');
      return;
    }
    if (myHeldShares <= 0 || sellShares > myHeldShares || sellShares < 1) {
      showToast('Insufficient Balance', `You hold ${myHeldShares} shares in this asset.`, 'error');
      return;
    }

    setPostingAsk(true);
    const tradeId = `trd_ask_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      await setDoc(doc(db, 'trades', tradeId), {
        id: tradeId,
        raceId: race.id,
        raceTitle: race.title,
        creatorName: race.creatorName,
        buyerUid: user.uid,
        anonymousId: profile.anonymousId,
        side: 'SELL',
        shares: sellShares,
        pricePerShareXAF: Math.max(100, sellAskPrice),
        totalAmountXAF: netPayoutXAF,
        paymentReference: `P2P-ASK-${Date.now()}`,
        status: 'settled',
        isPublicOrderBook: true,
        createdAt: serverTimestamp(),
      });
      showToast(
        'P2P Ask Posted',
        `Listed ${sellShares} shares at ${sellAskPrice.toLocaleString()} XAF/share (3% fee deducted).`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `trades/${tradeId}`);
    } finally {
      setPostingAsk(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Action Bar with Shareable Public Link */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/races"
          className="inline-flex items-center gap-1.5 font-label-md text-on-surface-variant hover:text-secondary"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>{lang === 'fr' ? 'Tous les Projets' : 'All Project Raises'}</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="px-3.5 py-1.5 rounded-lg bg-surface-container border border-outline-variant/40 text-on-surface font-label-xs uppercase font-bold hover:bg-secondary-fixed"
          >
            Copy Share Link
          </button>
          <span className="px-3 py-1.5 rounded-full bg-secondary-fixed text-secondary font-label-xs uppercase font-bold">
            {timeline.trancheStatus}
          </span>
        </div>
      </div>

      {/* Creator Share-Split Confirmation Banner */}
      {isCreatorOwner && race.status === 'awaiting_creator_acceptance' && (
        <div className="p-5 rounded-2xl bg-primary-container text-white border border-secondary flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="font-label-xs uppercase text-secondary-fixed font-bold">
              Admin Valuation &amp; Share-Split Offer Ready
            </span>
            <h2 className="font-headline-sm text-white font-bold">
              Confirm Share Split to Publish Your Raise Live
            </h2>
            <p className="font-body-sm text-white/80 tabular-nums">
              {race.totalShares.toLocaleString()} shares @ {race.unitSharePriceXAF.toLocaleString()} XAF ·{' '}
              {race.revSharePct}% Revenue Pool ({pctPerShare}% per share) · Target {race.grossTargetXAF.toLocaleString()} XAF
            </p>
          </div>
          <button
            type="button"
            disabled={acceptingOffer}
            onClick={async () => {
              setAcceptingOffer(true);
              try {
                await acceptRaiseOffer(race.id);
              } finally {
                setAcceptingOffer(false);
              }
            }}
            className="px-5 py-3 rounded-xl bg-on-tertiary-container text-white font-label-md font-bold uppercase shrink-0"
          >
            {acceptingOffer ? 'Publishing...' : 'Accept Share Split & Go Live'}
          </button>
        </div>
      )}

      {/* Main 12-Col Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 8 Cols */}
        <div className="lg:col-span-8 flex flex-col gap-7">
          {/* Asset Hero (Seamless) */}
          <div className="flex flex-col gap-5">
            <div className="relative h-52 sm:h-60 rounded-xl overflow-hidden bg-primary-container">
              <img
                src={getCoverImage(race.category, race.coverArtUrl)}
                alt={race.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-[#11081F]/65 p-5 flex flex-col justify-between">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md bg-on-tertiary-container text-white font-label-xs uppercase font-bold">
                      VERIFIED ISSUER
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-secondary text-white font-label-xs uppercase font-bold tabular-nums">
                      Score {race.crippoScore}/100
                    </span>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-black/70 text-white font-label-xs uppercase tabular-nums">
                    Launch Runway: {formatTimeRemaining(race.productionDeadline, lang)}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div>
                    <span className="font-label-xs uppercase text-primary-fixed-dim">
                      {race.category} · {race.creatorName}
                    </span>
                    <h1 className="font-headline-lg-mobile sm:font-headline-lg text-white mt-0.5 font-bold">
                      {race.title}
                    </h1>
                  </div>
                  <div className="bg-black/80 px-4 py-2.5 rounded-xl text-left sm:text-right shrink-0 tabular-nums">
                    <span className="font-label-xs uppercase text-primary-fixed-dim block">
                      Live Share Price
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="font-headline-sm font-mono-num text-white font-bold">
                        {race.currentSharePriceXAF.toLocaleString()} XAF
                      </span>
                      <span
                        className={`font-label-xs font-bold ${
                          isUp ? 'text-[#34D399]' : 'text-error'
                        }`}
                      >
                        {isUp ? '+' : ''}
                        {deltaPct}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress & Key Metrics Strip */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 tabular-nums">
                <div className="flex justify-between font-body-sm">
                  <span className="text-on-surface-variant">
                    <strong className="text-on-surface">{fundedPct}% Funded</strong> ·{' '}
                    {race.sharesSold.toLocaleString()} / {race.totalShares.toLocaleString()} shares
                  </span>
                  <span className="font-label-md text-secondary font-bold">
                    {isRaiseWindowOpen
                      ? `${formatTimeRemaining(race.raceCloseDate, lang)} left in Raise`
                      : 'Raise Window Closed'}
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-surface-container overflow-hidden">
                  <div
                    className="h-full rounded-full bg-secondary transition-all duration-300"
                    style={{ width: `${fundedPct}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-t border-b border-outline-variant/25 tabular-nums">
                <div>
                  <span className="font-label-xs uppercase text-on-surface-variant block">
                    Net Budget
                  </span>
                  <span className="font-ticker-val text-on-surface font-bold">
                    {race.netBudgetXAF.toLocaleString()} XAF
                  </span>
                </div>
                <div>
                  <span className="font-label-xs uppercase text-on-surface-variant block">
                    Gross Target
                  </span>
                  <span className="font-ticker-val text-on-surface font-bold">
                    {race.grossTargetXAF.toLocaleString()} XAF
                  </span>
                </div>
                <div>
                  <span className="font-label-xs uppercase text-on-surface-variant block">
                    Rev Share / Share
                  </span>
                  <span className="font-ticker-val text-secondary font-bold">
                    {race.revSharePct}% ({pctPerShare}%/sh)
                  </span>
                </div>
                <div>
                  <span className="font-label-xs uppercase text-on-surface-variant block">
                    Est. Return / Share
                  </span>
                  <span className="font-ticker-val text-on-tertiary-container font-bold">
                    {race.projectedRevenueXAF
                      ? `${Math.round(
                          (race.projectedRevenueXAF * (race.revSharePct / 100)) /
                            Math.max(1, race.totalShares)
                        ).toLocaleString()} XAF`
                      : 'Audited'}
                  </span>
                </div>
              </div>

              {race.regionalValuationNote && (
                <div className="py-1 border-l-2 border-secondary pl-3 text-[12px] text-on-surface-variant">
                  <strong className="text-on-surface uppercase font-label-xs mr-1.5">
                    Regional Benchmark:
                  </strong>
                  {race.regionalValuationNote}
                </div>
              )}
            </div>
          </div>

          {/* Share Price Trajectory */}
          <div className="border-t border-outline-variant/25 pt-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-on-surface font-bold">
                Share Price Trajectory (XAF)
              </h2>
              <span className="font-label-xs uppercase text-secondary tabular-nums">
                Initial: {race.unitSharePriceXAF.toLocaleString()} XAF
              </span>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={58} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#6f30dc"
                    strokeWidth={2.5}
                    fill="#6f30dc"
                    fillOpacity={0.16}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4-Phase Production Flight Plan */}
          <div className="border-t border-outline-variant/25 pt-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-on-surface font-bold">
                Escrow &amp; Delivery Runway
              </h2>
              <span className="font-label-xs uppercase text-secondary tabular-nums">
                Delivery: {new Date(race.productionDeadline).toLocaleDateString()}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {flightMilestones.map((m, idx) => (
                <div
                  key={idx}
                  className={`py-2.5 border-l-2 pl-3.5 ${
                    m.status === 'completed'
                      ? 'border-on-tertiary-container'
                      : m.status === 'active'
                      ? 'border-secondary'
                      : 'border-outline-variant/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-label-xs uppercase font-bold text-secondary">
                      {m.phase}
                    </span>
                    <span className="font-label-xs uppercase text-on-surface-variant">
                      {m.status}
                    </span>
                  </div>
                  <h4 className="font-label-md font-bold text-on-surface mt-1">{m.title}</h4>
                  <div className="flex items-center justify-between mt-1.5 text-[11px] text-on-surface-variant">
                    <span>Target: {m.targetDate}</span>
                    {m.escrowReleasePct ? <span>Release: {m.escrowReleasePct}%</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Order Book */}
          <div className="border-t border-outline-variant/25 pt-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-on-surface font-bold">Order Book Activity</h2>
              <span className="font-label-xs uppercase text-on-surface-variant tabular-nums">
                {raceOrders.length} Orders Settled
              </span>
            </div>

            {raceOrders.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant py-4 text-center">
                No executed orders recorded yet for this Raise.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse font-body-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-outline-variant/30 font-label-xs uppercase text-on-surface-variant">
                      <th className="py-2.5 pr-3">Trader</th>
                      <th className="py-2.5 px-3">Side</th>
                      <th className="py-2.5 px-3">Shares</th>
                      <th className="py-2.5 px-3">Price</th>
                      <th className="py-2.5 pl-3 text-right">Volume (XAF)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {raceOrders.slice(0, 20).map((ord) => {
                      const isMine = user && ord.buyerUid === user.uid;
                      return (
                        <tr key={ord.id}>
                          <td className="py-2.5 pr-3 font-mono-num">
                            {ord.anonymousId}
                            {isMine && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-secondary text-on-secondary text-[10px] font-bold">
                                YOU
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded font-label-xs font-bold ${
                                ord.side === 'BUY'
                                  ? 'bg-on-tertiary-container/15 text-on-tertiary-container'
                                  : 'bg-error/15 text-error'
                              }`}
                            >
                              {ord.side}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono-num">{ord.shares}</td>
                          <td className="py-2.5 px-3 font-mono-num">
                            {ord.pricePerShareXAF.toLocaleString()} XAF
                          </td>
                          <td className="py-2.5 pl-3 text-right font-ticker-val">
                            {ord.totalAmountXAF.toLocaleString()} XAF
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Streaming & ISRC Tracking + Catalysts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-outline-variant/25 pt-6">
            <div className="flex flex-col gap-2">
              <h3 className="font-headline-sm text-[16px] text-on-surface font-bold">
                Streaming &amp; Royalty Clearing
              </h3>
              <div className="flex flex-col gap-1.5 font-body-sm text-on-surface-variant">
                <div className="flex justify-between">
                  <span>Clearing Payee:</span>
                  <span className="font-mono-num text-on-surface">
                    {race.clearingEmail || 'clearing@crippo.cm'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>ISRC Master Code:</span>
                  <span className="font-mono-num text-on-surface">
                    {race.isrcCode || 'Assigned upon master delivery'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Tracked Platforms:</span>
                  <span className="text-on-surface font-semibold text-right">
                    {race.monitorableSources.join(', ')}
                  </span>
                </div>
                {race.capTableHash && (
                  <div className="pt-1 border-t border-outline-variant/25 text-[11px] font-mono-num break-all">
                    Cap Table Hash: {race.capTableHash}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-headline-sm text-[16px] text-on-surface font-bold">
                Related Trending News
              </h3>
              {relatedCatalysts.length === 0 ? (
                <p className="font-body-sm text-on-surface-variant">
                  No creator-specific news logged yet.
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/20">
                  {relatedCatalysts.slice(0, 3).map((cat) => (
                    <div key={cat.id} className="py-2.5">
                      <div className="flex justify-between font-label-xs tabular-nums">
                        <span className="text-secondary uppercase">{cat.sourcePlatform}</span>
                        <span
                          className={
                            cat.priceImpactPct >= 0 ? 'text-on-tertiary-container' : 'text-error'
                          }
                        >
                          {cat.priceImpactPct >= 0 ? '+' : ''}
                          {cat.priceImpactPct}%
                        </span>
                      </div>
                      <p className="font-body-sm font-semibold text-on-surface mt-0.5">
                        {cat.headline}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right 4 Cols: Sticky BUY / SELL Desk (Borderless Side Rail) */}
        <aside className="lg:col-span-4 lg:sticky lg:top-28 lg:border-l lg:border-outline-variant/25 lg:pl-6 flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-label-xs uppercase tracking-wider text-secondary font-bold">
                Share Desk
              </span>
              <span className="font-label-xs font-mono-num text-on-surface-variant tabular-nums">
                Held: <strong className="text-on-surface">{myHeldShares}</strong> sh
              </span>
            </div>

            {!isRaiseWindowOpen && (
              <div className="py-2 border-l-2 border-secondary pl-3 text-[12px] text-on-surface">
                <strong className="block uppercase font-label-xs text-secondary mb-1">
                  Raise Window Closed — Trading Locked
                </strong>
                Secondary trading and new share purchases are locked once the Raise deadline passes. Active shareholders now track streaming payouts and monthly MoMo dividends.
              </div>
            )}

            {/* BUY vs SELL Tabs */}
            <div className="grid grid-cols-2 border-b border-outline-variant/30 pb-2 gap-2">
              <button
                type="button"
                onClick={() => setDeskSide('BUY')}
                className={`py-2 rounded-lg font-label-md font-bold transition-colors ${
                  deskSide === 'BUY'
                    ? 'bg-on-tertiary-container text-white'
                    : 'text-on-surface-variant'
                }`}
              >
                BUY SHARES
              </button>
              <button
                type="button"
                onClick={() => setDeskSide('SELL')}
                className={`py-2 rounded-lg font-label-md font-bold transition-colors ${
                  deskSide === 'SELL'
                    ? 'bg-error text-white'
                    : 'text-on-surface-variant'
                }`}
              >
                SELL P2P RESALE
              </button>
            </div>

            {deskSide === 'BUY' ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between font-label-xs uppercase text-on-surface-variant tabular-nums">
                    <span>Shares Quantity</span>
                    <span>Avail: {sharesLeft.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between border border-outline-variant/40 p-1.5 rounded-xl">
                    <button
                      type="button"
                      disabled={!isRaiseWindowOpen}
                      onClick={() => setBuyShares((s) => Math.max(1, s - 1))}
                      className="w-10 h-10 rounded-lg border border-outline-variant/30 font-bold text-lg disabled:opacity-40"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, sharesLeft)}
                      disabled={!isRaiseWindowOpen}
                      value={buyShares}
                      onChange={(e) =>
                        setBuyShares(Math.max(1, Math.min(sharesLeft, Number(e.target.value) || 1)))
                      }
                      className="w-20 text-center bg-transparent font-headline-sm font-mono-num outline-none"
                    />
                    <button
                      type="button"
                      disabled={!isRaiseWindowOpen}
                      onClick={() => setBuyShares((s) => Math.min(sharesLeft, s + 1))}
                      className="w-10 h-10 rounded-lg border border-outline-variant/30 font-bold text-lg disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="py-2 border-t border-b border-outline-variant/25 flex flex-col gap-1.5 font-body-sm tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Unit Price</span>
                    <span className="font-mono-num font-bold">
                      {race.currentSharePriceXAF.toLocaleString()} XAF
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Royalty Stake</span>
                    <span className="font-mono-num text-secondary font-bold">
                      {(buyShares * pctPerShare).toFixed(4)}%
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-outline-variant/20">
                    <span className="font-bold text-on-surface">Total via CamPay</span>
                    <span className="font-ticker-val text-[16px] text-on-surface font-bold">
                      {(buyShares * race.currentSharePriceXAF).toLocaleString()} XAF
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!isRaiseWindowOpen || sharesLeft <= 0}
                  onClick={() => {
                    if (!user) {
                      setAuthPromptAction(`buy ${buyShares} share(s) in "${race.title}"`);
                      return;
                    }
                    setShowCheckout(true);
                  }}
                  className="w-full py-3.5 rounded-xl bg-on-tertiary-container text-white font-headline-sm text-[14px] font-bold uppercase tracking-wider hover:opacity-95 disabled:opacity-50"
                >
                  {!isRaiseWindowOpen
                    ? 'Raise Window Closed'
                    : sharesLeft <= 0
                    ? 'Sold Out'
                    : 'Buy via MTN MoMo / OM'}
                </button>
              </div>
            ) : (
              <form onSubmit={handlePostSellOrder} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between font-label-xs uppercase text-on-surface-variant tabular-nums">
                    <span>Shares to List</span>
                    <span>Held: {myHeldShares} sh</span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, myHeldShares)}
                    disabled={!isRaiseWindowOpen}
                    value={sellShares}
                    onChange={(e) => setSellShares(Math.max(1, Number(e.target.value) || 1))}
                    className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num text-on-surface disabled:opacity-50"
                  />
                  <div className="grid grid-cols-4 gap-1.5">
                    {[0.25, 0.5, 0.75, 1].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        disabled={!isRaiseWindowOpen || myHeldShares <= 0}
                        onClick={() => setSellShares(Math.max(1, Math.floor(myHeldShares * pct)))}
                        className="py-1 rounded-lg border border-outline-variant/35 font-label-xs text-on-surface hover:border-secondary disabled:opacity-40"
                      >
                        {pct === 1 ? 'MAX' : `${pct * 100}%`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-xs uppercase text-on-surface-variant">
                    Ask Price per Share (XAF)
                  </label>
                  <input
                    type="number"
                    min={100}
                    disabled={!isRaiseWindowOpen}
                    value={sellAskPrice}
                    onChange={(e) => setSellAskPrice(Math.max(100, Number(e.target.value) || 100))}
                    className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent font-mono-num text-on-surface disabled:opacity-50"
                  />
                </div>

                <div className="py-2 border-t border-b border-outline-variant/25 flex flex-col gap-1.5 font-body-sm tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Gross Resale</span>
                    <span className="font-mono-num">{sellGrossXAF.toLocaleString()} XAF</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Protocol Clearing Fee (3%)</span>
                    <span className="font-mono-num text-error">
                      -{clearingFeeXAF.toLocaleString()} XAF
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-outline-variant/20">
                    <span className="font-bold text-on-surface">Net MoMo Settlement</span>
                    <span className="font-ticker-val text-on-tertiary-container font-bold">
                      {netPayoutXAF.toLocaleString()} XAF
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!isRaiseWindowOpen || postingAsk || myHeldShares <= 0}
                  className="w-full py-3.5 rounded-xl bg-error text-white font-headline-sm text-[14px] font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  {!isRaiseWindowOpen
                    ? 'Trading Locked (Raise Closed)'
                    : myHeldShares <= 0
                    ? 'No Shares Held to Sell'
                    : postingAsk
                    ? 'Posting...'
                    : 'Post Secondary Ask Order'}
                </button>
              </form>
            )}
          </div>
        </aside>
      </div>

      {showCheckout && (
        <CamPayCheckoutModal
          mode="race"
          race={race}
          initialShares={buyShares}
          onClose={() => setShowCheckout(false)}
          onSuccess={(msg) => showToast('Order Settled', msg, 'success')}
          onOpenApiSetup={onOpenApiSetup}
        />
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
