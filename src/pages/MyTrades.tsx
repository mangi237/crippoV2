import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getCoverImage, getRaceTimelineStage } from '../utils/media';
import type { Race, Trade } from '../types/crippo';

interface PositionGroup {
  raceId: string;
  race?: Race;
  raceTitle: string;
  creatorName: string;
  netShares: number;
  investedXAF: number;
  currentValueXAF: number;
  trades: Trade[];
}

export function MyTrades() {
  const { user, profile } = useAuth();
  const { races, myTrades, myDividends, myPayments, showToast } = useMarket();
  const { lang, t } = useLanguage();

  const [tab, setTab] = useState<'all' | 'escrow' | 'clearing' | 'ledger'>('all');

  const positions = useMemo<PositionGroup[]>(() => {
    const map = new Map<string, PositionGroup>();
    for (const tr of myTrades) {
      const existing = map.get(tr.raceId) || {
        raceId: tr.raceId,
        race: races.find((r) => r.id === tr.raceId),
        raceTitle: tr.raceTitle,
        creatorName: tr.creatorName,
        netShares: 0,
        investedXAF: 0,
        currentValueXAF: 0,
        trades: [],
      };
      if (tr.side === 'BUY') {
        existing.netShares += tr.shares;
        existing.investedXAF += tr.totalAmountXAF;
      } else {
        existing.netShares -= tr.shares;
        existing.investedXAF = Math.max(0, existing.investedXAF - tr.totalAmountXAF);
      }
      existing.trades.push(tr);
      map.set(tr.raceId, existing);
    }

    return Array.from(map.values())
      .map((p) => {
        const livePrice = p.race?.currentSharePriceXAF || (p.trades[0]?.pricePerShareXAF ?? 0);
        return {
          ...p,
          currentValueXAF: Math.max(0, Math.round(p.netShares * livePrice)),
        };
      })
      .filter((p) => p.netShares > 0 || p.trades.length > 0);
  }, [myTrades, races]);

  const totals = useMemo(() => {
    const invested = positions.reduce((a, p) => a + p.investedXAF, 0);
    const value = positions.reduce((a, p) => a + p.currentValueXAF, 0);
    const dividends = myDividends.reduce((a, d) => a + d.payoutAmountXAF, 0);
    const pnl = value - invested;
    const pnlPct = invested > 0 ? Number(((pnl / invested) * 100).toFixed(1)) : 0;
    return {
      invested,
      value,
      dividends,
      pnl,
      pnlPct,
      activeCount: positions.filter((p) => p.netShares > 0).length,
    };
  }, [positions, myDividends]);

  const filteredPositions = useMemo(() => {
    if (tab === 'escrow') {
      return positions.filter(
        (p) => !p.race || p.race.status === 'open' || p.race.status === 'closed'
      );
    }
    if (tab === 'clearing') {
      return positions.filter((p) => p.race?.status === 'clearing' || p.race?.splitVerified);
    }
    return positions;
  }, [positions, tab]);

  const handleCopyIsrc = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showToast('ISRC Copied', `${code} copied to clipboard.`);
    } catch {
      showToast('ISRC Code', code);
    }
  };

  const handleDownloadDeed = () => {
    const lines = [
      'CRIPPO INSTITUTIONAL ESCROW & ROYALTY DEED',
      '==========================================',
      `Holder Alias: ${profile?.anonymousId || 'Trader'}`,
      `Legal Holder: ${profile?.displayName || user?.email || 'Verified Investor'}`,
      `Generated At: ${new Date().toISOString()}`,
      `Total Portfolio Value: ${totals.value.toLocaleString()} XAF`,
      `Total MoMo Dividends Cleared: ${totals.dividends.toLocaleString()} XAF`,
      '',
      'ACTIVE POSITIONS & TIMELINES:',
      ...positions.map((p) => {
        const tl = p.race ? getRaceTimelineStage(p.race, 'en') : null;
        return `- ${p.raceTitle} (${p.creatorName}): ${p.netShares} shares | Value: ${p.currentValueXAF.toLocaleString()} XAF | Stage: ${tl?.phaseLabel || 'Settled'} | ISRC: ${p.race?.isrcCode || 'Pending Phase 3'}`;
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crippo-escrow-deed-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Deed Downloaded', 'Your XAF escrow & tax certificate deed has been downloaded.');
  };

  if (!user) {
    return (
      <div className="py-12 text-center flex flex-col items-center gap-3 max-w-lg mx-auto">
        <span className="material-symbols-outlined text-[36px] text-secondary">lock</span>
        <h2 className="font-headline-sm text-on-surface font-bold">Sign In to Inspect Your Trades</h2>
        <p className="font-body-md text-on-surface-variant max-w-md">
          Track all live creator positions, production escrow timelines, and MoMo royalty payouts.
        </p>
        <div className="flex items-center gap-3 pt-1">
          <Link
            to="/auth?skipSplash=1&mode=login&returnTo=%2Ftrades"
            className="px-5 py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
          >
            Sign In
          </Link>
          <Link
            to="/auth?skipSplash=1&mode=signup&returnTo=%2Ftrades"
            className="px-5 py-2.5 rounded-xl border border-outline-variant/50 text-on-surface font-label-md font-bold hover:border-secondary"
          >
            Create Account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Node Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/25 pb-3">
        <span className="font-label-md text-on-surface uppercase tracking-wider">
          {profile?.anonymousId || 'Trader'} · Fapshi Settlement Active
        </span>
        <button
          type="button"
          onClick={handleDownloadDeed}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/50 text-on-surface font-label-xs uppercase font-bold hover:border-secondary hover:text-secondary"
        >
          <span className="material-symbols-outlined text-[15px]">download</span>
          <span>Download Escrow Deed</span>
        </button>
      </div>

      {/* Portfolio Valuation Summary (Borderless Metrics Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pb-6 border-b border-outline-variant/25 items-center tabular-nums">
        <div className="md:col-span-5 flex flex-col gap-1">
          <span className="font-label-xs uppercase tracking-widest text-secondary font-bold">
            {t('current_value')}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg-mobile sm:font-display-lg text-on-surface font-mono-num">
              {totals.value.toLocaleString()}
            </span>
            <span className="font-label-md text-on-surface-variant">FCFA</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`px-2 py-0.5 rounded font-label-xs font-bold ${
                totals.pnl >= 0
                  ? 'bg-on-tertiary-container/15 text-on-tertiary-container'
                  : 'bg-error/15 text-error'
              }`}
            >
              {totals.pnl >= 0 ? '+' : ''}
              {totals.pnlPct}% ({totals.pnl >= 0 ? '+' : ''}
              {totals.pnl.toLocaleString()} XAF)
            </span>
          </div>
        </div>

        <div className="md:col-span-7 grid grid-cols-3 gap-4">
          <div>
            <span className="font-label-xs uppercase text-on-surface-variant block">
              {t('total_invested')}
            </span>
            <span className="font-ticker-val text-on-surface font-mono-num mt-1 block">
              {totals.invested.toLocaleString()} XAF
            </span>
          </div>
          <div>
            <span className="font-label-xs uppercase text-on-surface-variant block">
              {t('dividends_cleared')}
            </span>
            <span className="font-ticker-val text-on-tertiary-container font-mono-num mt-1 block">
              {totals.dividends.toLocaleString()} XAF
            </span>
          </div>
          <div>
            <span className="font-label-xs uppercase text-on-surface-variant block">
              {t('active_positions')}
            </span>
            <span className="font-ticker-val text-on-surface font-mono-num mt-1 block">
              {totals.activeCount} Raises
            </span>
          </div>
        </div>
      </div>

      {/* Segmented View Tabs */}
      <div className="flex items-center gap-5 overflow-x-auto no-scrollbar border-b border-outline-variant/25">
        {[
          { key: 'all', label: `All Positions (${positions.length})` },
          { key: 'escrow', label: t('escrow_production') },
          { key: 'clearing', label: t('royalty_clearing') },
          { key: 'ledger', label: `${t('ledger_history')} (${myPayments.length + myDividends.length})` },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key as typeof tab)}
            className={`pb-2.5 font-label-md whitespace-nowrap border-b-2 transition-colors ${
              tab === item.key
                ? 'border-secondary text-secondary font-bold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'ledger' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Dividend Payouts */}
          <div className="flex flex-col gap-3">
            <h3 className="font-headline-sm text-on-surface font-bold">MoMo Royalty Dividend Ledger</h3>
            {myDividends.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant py-6">
                No MoMo dividends cleared yet. Distributions arrive once active positions enter Phase 3 Royalty Clearing.
              </p>
            ) : (
              <div className="divide-y divide-outline-variant/25 border-t border-outline-variant/25">
                {myDividends.map((div) => (
                  <div
                    key={div.id}
                    className="py-3.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <h4 className="font-label-md font-bold text-on-surface">{div.raceTitle}</h4>
                      <span className="font-body-sm text-on-surface-variant">
                        {div.periodLabel} · {div.sharesHeld} shares · Ref: {div.momoReference || 'Pending'}
                      </span>
                    </div>
                    <div className="text-right tabular-nums">
                      <span className="font-ticker-val text-on-tertiary-container font-bold block">
                        +{div.payoutAmountXAF.toLocaleString()} XAF
                      </span>
                      <span className="font-label-xs uppercase text-on-surface-variant">
                        {div.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fapshi Payments Ledger */}
          <div className="flex flex-col gap-3">
            <h3 className="font-headline-sm text-on-surface font-bold">Fapshi Settlement Ledger</h3>
            {myPayments.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant py-6">
                No Mobile Money settlement transactions recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-outline-variant/25 border-t border-outline-variant/25">
                {myPayments.map((pay) => (
                  <div
                    key={pay.id}
                    className="py-3.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-label-xs uppercase text-secondary font-bold">
                        {pay.type} · {pay.provider}
                      </span>
                      <div className="font-mono-num text-[12px] text-on-surface mt-0.5">
                        Ref: {pay.reference}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <span className="font-ticker-val text-on-surface font-bold block">
                        {pay.amountXAF.toLocaleString()} XAF
                      </span>
                      <span
                        className={`font-label-xs uppercase font-bold ${
                          pay.status === 'SUCCESSFUL'
                            ? 'text-on-tertiary-container'
                            : pay.status === 'FAILED'
                            ? 'text-error'
                            : 'text-secondary'
                        }`}
                      >
                        {pay.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : filteredPositions.length === 0 ? (
        <div className="py-12 text-center flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-[36px] text-secondary">candlestick_chart</span>
          <h3 className="font-headline-sm text-on-surface font-bold">{t('no_trades_title')}</h3>
          <p className="font-body-md text-on-surface-variant max-w-md">{t('no_trades_desc')}</p>
          <Link
            to="/races"
            className="mt-1 px-5 py-2.5 rounded-xl bg-on-tertiary-container text-white font-label-md font-bold"
          >
            {t('explore_races')}
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-outline-variant/25">
          {filteredPositions.map((pos) => {
            const race = pos.race;
            const timeline = race
              ? getRaceTimelineStage(race, lang)
              : {
                  phaseIndex: 1 as const,
                  phaseLabel: 'Settled Capital Position',
                  phaseLabelFr: 'Position Réglée',
                  progressPct: 100,
                  countdownLabel: 'Active',
                  nextMilestoneTitle: 'Escrow Verified',
                  trancheStatus: 'Settled',
                };
            const pnl = pos.currentValueXAF - pos.investedXAF;
            const pnlPct =
              pos.investedXAF > 0 ? Number(((pnl / pos.investedXAF) * 100).toFixed(1)) : 0;

            return (
              <div
                key={pos.raceId}
                className="py-6 flex flex-col gap-4"
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={getCoverImage(race?.category, race?.coverArtUrl)}
                      alt={pos.raceTitle}
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-xl object-cover shrink-0"
                    />
                    <div>
                      <Link
                        to={`/race/${pos.raceId}`}
                        className="font-headline-sm text-[18px] text-on-surface hover:text-secondary font-bold"
                      >
                        {pos.raceTitle}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[12px] text-on-surface-variant">
                        <span className="font-semibold text-on-surface">{pos.creatorName}</span>
                        <span>·</span>
                        <span className="font-mono-num font-bold text-secondary">
                          {pos.netShares} Shares Held
                        </span>
                        {race?.isrcCode && (
                          <button
                            type="button"
                            onClick={() => handleCopyIsrc(race.isrcCode!)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-outline-variant/35 text-on-surface font-mono-num text-[11px]"
                          >
                            <span>ISRC: {race.isrcCode}</span>
                            <span className="material-symbols-outlined text-[12px]">content_copy</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:text-right tabular-nums">
                    <div>
                      <span className="font-label-xs uppercase text-on-surface-variant block">
                        Live Valuation
                      </span>
                      <span className="font-headline-sm font-mono-num text-on-surface font-bold">
                        {pos.currentValueXAF.toLocaleString()} XAF
                      </span>
                      <span
                        className={`ml-2 text-[12px] font-bold ${
                          pnl >= 0 ? 'text-on-tertiary-container' : 'text-error'
                        }`}
                      >
                        {pnl >= 0 ? '+' : ''}
                        {pnlPct}%
                      </span>
                    </div>
                    <Link
                      to={`/race/${pos.raceId}`}
                      className="px-3.5 py-2 rounded-xl bg-secondary text-on-secondary font-label-xs uppercase font-bold"
                    >
                      Trade / P2P
                    </Link>
                  </div>
                </div>

                {/* Live Timeline & Countdown Progress Bar */}
                <div className="py-2 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary text-[18px]">
                        timeline
                      </span>
                      <span className="font-label-md font-bold text-on-surface">
                        {lang === 'fr' ? timeline.phaseLabelFr : timeline.phaseLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded bg-secondary-fixed text-secondary font-label-xs uppercase font-bold">
                        {timeline.trancheStatus}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-primary-container text-on-primary font-label-xs font-mono-num">
                        <span className="material-symbols-outlined text-[13px]">schedule</span>
                        {timeline.countdownLabel}
                      </span>
                    </div>
                  </div>

                  {/* 3-Phase Visual Progress Track */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { idx: 1, label: '1. Capital Race' },
                      { idx: 2, label: '2. 50/50 Escrow & Prod' },
                      { idx: 3, label: '3. MoMo ROI Clearing' },
                    ].map((ph) => {
                      const done = timeline.phaseIndex > ph.idx;
                      const active = timeline.phaseIndex === ph.idx;
                      return (
                        <div key={ph.idx} className="flex flex-col gap-1">
                          <span
                            className={`font-label-xs uppercase ${
                              active
                                ? 'text-secondary font-bold'
                                : done
                                ? 'text-on-tertiary-container font-bold'
                                : 'text-on-surface-variant'
                            }`}
                          >
                            {ph.label}
                          </span>
                          <div className="h-2 rounded-full bg-surface-container overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                done
                                  ? 'bg-on-tertiary-container w-full'
                                  : active
                                  ? 'bg-secondary'
                                  : 'w-0'
                              }`}
                              style={active ? { width: `${timeline.progressPct}%` } : undefined}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-on-surface-variant pt-1">
                    <span>
                      Next Gate: <strong className="text-on-surface">{timeline.nextMilestoneTitle}</strong>
                    </span>
                    {race && (
                      <span>
                        Raise Close: {new Date(race.raceCloseDate).toLocaleDateString()} · Production:{' '}
                        {new Date(race.productionDeadline).toLocaleDateString()} · ROI:{' '}
                        {race.roiDurationMonths}m
                      </span>
                    )}
                  </div>
                </div>

                {/* Individual Executions */}
                <div className="flex flex-wrap gap-2">
                  {pos.trades.slice(0, 4).map((tr) => (
                    <span
                      key={tr.id}
                      className="px-2.5 py-1 rounded-lg border border-outline-variant/30 text-[11px] font-mono-num text-on-surface-variant"
                    >
                      {tr.side} {tr.shares}sh @ {tr.pricePerShareXAF.toLocaleString()} XAF · Ref{' '}
                      {tr.paymentReference}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
