import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import { formatTimeRemaining } from '../utils/media';

export function UserProfile() {
  const { user, profile, privateInfo, signOut } = useAuth();
  const {
    races,
    myTrades,
    myDividends,
    notifications,
    affiliationRequests,
    claimedEntity,
    isClaimedCreator,
    isVerifiedCreator,
    isLabelAffiliatedCreator,
    canLaunchRace,
    isAdmin,
    showToast,
    markNotificationRead,
    acceptRaiseOffer,
    acceptAffiliationRequest,
    declineAffiliationRequest,
  } = useMarket();
  const navigate = useNavigate();

  const [togglingCreator, setTogglingCreator] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeHoldings = useMemo(() => {
    const map = new Map<
      string,
      {
        raceId: string;
        raceTitle: string;
        creatorName: string;
        sharesHeld: number;
        totalInvestedXAF: number;
      }
    >();

    for (const t of myTrades) {
      const existing = map.get(t.raceId) || {
        raceId: t.raceId,
        raceTitle: t.raceTitle,
        creatorName: t.creatorName,
        sharesHeld: 0,
        totalInvestedXAF: 0,
      };
      if (t.side === 'BUY') {
        existing.sharesHeld += t.shares;
        existing.totalInvestedXAF += t.totalAmountXAF;
      } else {
        existing.sharesHeld -= t.shares;
      }
      map.set(t.raceId, existing);
    }

    return Array.from(map.values())
      .filter((h) => h.sharesHeld > 0)
      .map((h) => {
        const liveRace = races.find((r) => r.id === h.raceId);
        const unitPrice = liveRace ? liveRace.currentSharePriceXAF : 0;
        const liveValueXAF = h.sharesHeld * unitPrice;
        return {
          ...h,
          race: liveRace,
          liveValueXAF,
        };
      });
  }, [myTrades, races]);

  const pendingAffiliations = useMemo(
    () =>
      affiliationRequests.filter(
        (r) => r.creatorUid === user?.uid && r.status === 'pending'
      ),
    [affiliationRequests, user?.uid]
  );

  const creatorVerificationCode = useMemo(() => {
    if (claimedEntity?.bioVerificationCode) return claimedEntity.bioVerificationCode;
    const suffix = (user?.uid || 'CRIP').slice(0, 4).toUpperCase();
    return `CRIPPO-${suffix}`;
  }, [claimedEntity, user?.uid]);

  if (!user || !profile) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-black text-white flex items-center justify-center">
          <span className="material-symbols-outlined text-[24px]">person</span>
        </div>
        <h1 className="font-headline-sm text-on-surface font-bold">Sign In to Your Crippo Account</h1>
        <p className="font-body-md text-on-surface-variant">
          View your active project Raises, payout history, creator verification status, and Mobile Money settings.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => navigate('/auth?skipSplash=1&mode=login&returnTo=/profile')}
            className="px-6 py-3 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => navigate('/auth?skipSplash=1&mode=signup&returnTo=/profile')}
            className="px-6 py-3 rounded-xl border border-outline-variant/50 text-on-surface font-label-md font-bold hover:border-secondary"
          >
            Create Account
          </button>
        </div>
      </div>
    );
  }

  const totalPortfolioXAF = activeHoldings.reduce((acc, h) => acc + h.liveValueXAF, 0);
  const totalDividendsXAF = myDividends.reduce((acc, d) => acc + d.payoutAmountXAF, 0);

  const handleToggleCreatorMode = async () => {
    setTogglingCreator(true);
    const nextVal = !profile.creatorModeEnabled;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        creatorModeEnabled: nextVal,
        updatedAt: serverTimestamp(),
      });
      showToast(
        nextVal ? 'Creator Mode Enabled' : 'Creator Mode Paused',
        nextVal
          ? 'Find and claim your profile in the Creators Directory to submit KYC.'
          : 'You are viewing Crippo as a standard supporter.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setTogglingCreator(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Account Summary Header */}
      <section className="pb-6 border-b border-outline-variant/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-lg bg-black text-white flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[26px]">person</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-headline-lg-mobile text-on-surface font-bold truncate">
                {profile.displayName}
              </h1>
              <span className="px-2.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-xs uppercase tabular-nums">
                {profile.anonymousId}
              </span>
              {isAdmin && (
                <Link
                  to="/admin"
                  className="px-2.5 py-0.5 rounded bg-secondary text-white font-label-xs uppercase font-bold"
                >
                  Admin Desk
                </Link>
              )}
            </div>
            <p className="font-body-sm text-on-surface-variant mt-0.5 truncate">
              {profile.city} · {privateInfo?.momoProvider || 'MTN'} MoMo ({privateInfo?.phone || 'Not linked'})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            to="/trades"
            className="px-4 py-2 rounded-xl border border-outline-variant/50 text-on-surface font-label-md font-semibold hover:border-secondary"
          >
            All Trades
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="px-4 py-2 rounded-xl bg-error-container text-on-error-container font-label-md font-semibold"
          >
            Sign Out
          </button>
        </div>
      </section>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pb-6 border-b border-outline-variant/25 tabular-nums">
        <div>
          <span className="font-label-xs uppercase text-on-surface-variant">Active Raises Held</span>
          <div className="font-headline-lg-mobile text-on-surface font-bold mt-1">
            {activeHoldings.length}
          </div>
          <span className="font-body-sm text-on-surface-variant">Current project positions</span>
        </div>
        <div>
          <span className="font-label-xs uppercase text-on-surface-variant">Live Position Value</span>
          <div className="font-headline-lg-mobile text-on-surface font-bold mt-1">
            {totalPortfolioXAF.toLocaleString()} XAF
          </div>
          <span className="font-body-sm text-secondary">Mark-to-market share valuation</span>
        </div>
        <div>
          <span className="font-label-xs uppercase text-on-surface-variant">Dividends Received</span>
          <div className="font-headline-lg-mobile text-on-tertiary-container font-bold mt-1">
            {totalDividendsXAF.toLocaleString()} XAF
          </div>
          <span className="font-body-sm text-on-surface-variant">Direct MoMo disbursements</span>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 7 Cols: Active Raises Participating In + Pending Offers & Affiliations */}
        <div className="lg:col-span-7 flex flex-col gap-8">
          {/* Active Raises Participating In */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-headline-sm text-on-surface font-bold">
                Active Raises You Are In
              </h2>
              <Link to="/races" className="font-label-xs uppercase text-secondary font-bold hover:underline">
                Browse Raises →
              </Link>
            </div>

            {activeHoldings.length === 0 ? (
              <div className="py-6 border-t border-outline-variant/25 text-center flex flex-col items-center gap-3">
                <p className="font-body-md text-on-surface-variant">
                  You have not joined any live project Raises yet.
                </p>
                <Link
                  to="/races"
                  className="px-4 py-2 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
                >
                  Explore Live Raises
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/25 border-t border-outline-variant/25">
                {activeHoldings.map((h) => (
                  <Link
                    key={h.raceId}
                    to={`/race/${h.raceId}`}
                    className="py-4 hover:text-secondary transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-label-md text-on-surface font-bold truncate">
                          {h.raceTitle}
                        </h3>
                        {h.race && (
                          <span className="px-2 py-0.5 rounded bg-secondary-fixed text-secondary font-label-xs uppercase font-bold">
                            {h.race.status.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <p className="font-body-sm text-on-surface-variant mt-0.5 tabular-nums">
                        {h.creatorName} · {h.sharesHeld} Shares Held
                        {h.race ? ` · Closes ${formatTimeRemaining(h.race.raceCloseDate, 'en')}` : ''}
                      </p>
                    </div>

                    <div className="text-left sm:text-right shrink-0 tabular-nums">
                      <span className="font-ticker-val text-on-surface font-bold block">
                        {h.liveValueXAF.toLocaleString()} XAF
                      </span>
                      <span className="font-label-xs text-on-tertiary-container uppercase">
                        {h.race?.pctPerShare
                          ? `${(h.race.pctPerShare * h.sharesHeld).toFixed(4)}% Rev Stake`
                          : 'View Position →'}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Pending Label Affiliation Requests Inbox */}
          {pendingAffiliations.length > 0 && (
            <section className="border-t border-outline-variant/25 pt-6 flex flex-col gap-3">
              <h2 className="font-headline-sm text-on-surface font-bold">
                Label / Agency Affiliation Requests
              </h2>
              <div className="divide-y divide-outline-variant/25">
                {pendingAffiliations.map((req) => (
                  <div
                    key={req.id}
                    className="py-4 flex flex-col gap-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-label-md font-bold text-on-surface">
                        {req.agencyName} wants to roster {req.creatorStageName}
                      </span>
                      <span className="font-label-xs uppercase text-secondary font-bold">Pending</span>
                    </div>
                    {req.message && (
                      <p className="font-body-sm text-on-surface-variant">{req.message}</p>
                    )}
                    <p className="text-[11px] text-on-surface-variant">
                      Note: While affiliated with a record label/agency, only your label can initiate new Raises on your behalf.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={async () => {
                          setBusyId(req.id);
                          try {
                            await acceptAffiliationRequest(req);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-on-tertiary-container text-white font-label-xs uppercase font-bold"
                      >
                        Accept Affiliation
                      </button>
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={async () => {
                          setBusyId(req.id);
                          try {
                            await declineAffiliationRequest(req);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-error text-white font-label-xs uppercase font-bold"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Real-Time Notifications & Raise Share-Split Offers */}
          <section className="border-t border-outline-variant/25 pt-6 flex flex-col gap-3">
            <h2 className="font-headline-sm text-on-surface font-bold">
              Alerts &amp; Raise Offers ({notifications.length})
            </h2>
            {notifications.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant">
                No notifications yet. Admin Raise share-split offers, KYC updates, and payouts appear here in real time.
              </p>
            ) : (
              <div className="divide-y divide-outline-variant/25">
                {notifications.map((n) => {
                  const linkedRace = n.raceId ? races.find((r) => r.id === n.raceId) : undefined;
                  const canAccept =
                    n.type === 'raise_offer' &&
                    linkedRace &&
                    linkedRace.status === 'awaiting_creator_acceptance';
                  return (
                    <div
                      key={n.id}
                      className={`py-4 flex flex-col gap-2 ${
                        !n.read ? 'border-l-2 border-secondary pl-3' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-label-xs uppercase text-secondary font-bold">
                          {n.title}
                        </span>
                        {!n.read && (
                          <button
                            type="button"
                            onClick={() => markNotificationRead(n.id)}
                            className="font-label-xs uppercase text-on-surface-variant hover:text-on-surface"
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                      <p className="font-body-sm text-on-surface">{n.message}</p>
                      {n.offerSummary && (
                        <div className="py-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] tabular-nums">
                          <div>
                            <span className="text-on-surface-variant block">Share Price</span>
                            <strong>{n.offerSummary.unitSharePriceXAF.toLocaleString()} XAF</strong>
                          </div>
                          <div>
                            <span className="text-on-surface-variant block">Total Shares</span>
                            <strong>{n.offerSummary.totalShares.toLocaleString()}</strong>
                          </div>
                          <div>
                            <span className="text-on-surface-variant block">Pool Rev Share</span>
                            <strong className="text-secondary">{n.offerSummary.revSharePct}%</strong>
                          </div>
                          <div>
                            <span className="text-on-surface-variant block">Per Share</span>
                            <strong className="text-on-tertiary-container">
                              {n.offerSummary.pctPerShare}%
                            </strong>
                          </div>
                        </div>
                      )}
                      {canAccept && linkedRace && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={busyId === n.id}
                            onClick={async () => {
                              setBusyId(n.id);
                              try {
                                await acceptRaiseOffer(linkedRace.id, n.id);
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            className="px-4 py-2 rounded-lg bg-on-tertiary-container text-white font-label-xs uppercase font-bold"
                          >
                            {busyId === n.id ? 'Publishing...' : 'Accept Share Split & Go Live'}
                          </button>
                          <Link
                            to={`/race/${linkedRace.id}`}
                            className="px-3 py-2 rounded-lg border border-outline-variant/40 text-on-surface font-label-xs uppercase font-bold"
                          >
                            View Raise
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right 5 Cols: Creator Mode Onboarding Toggle & Rising Creator Memo Prompt */}
        <div className="lg:col-span-5 lg:border-l lg:border-outline-variant/25 lg:pl-6 flex flex-col gap-7">
          {/* Creator Mode Switch & Claim Guide */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="font-label-xs uppercase text-secondary font-bold">
                  Creator Mode
                </span>
                <h2 className="font-headline-sm text-on-surface font-bold">
                  {isVerifiedCreator
                    ? claimedEntity?.stageName || 'Verified Creator'
                    : isClaimedCreator
                    ? 'Verification In Progress'
                    : 'Switch to Creator Mode'}
                </h2>
              </div>

              <button
                type="button"
                disabled={togglingCreator}
                onClick={handleToggleCreatorMode}
                aria-pressed={profile.creatorModeEnabled}
                className={`px-3.5 py-2 rounded-xl font-label-xs uppercase font-bold transition-colors ${
                  profile.creatorModeEnabled
                    ? 'bg-secondary text-white'
                    : 'border border-outline-variant/40 text-on-surface hover:border-secondary'
                }`}
              >
                {togglingCreator
                  ? '...'
                  : profile.creatorModeEnabled
                  ? 'Creator Mode: ON'
                  : 'Enable Creator Mode'}
              </button>
            </div>

            {isVerifiedCreator && claimedEntity ? (
              <div className="py-3 border-t border-outline-variant/25 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-label-xs uppercase text-on-tertiary-container font-bold">
                    Verified {claimedEntity.entityType === 'agency' ? 'Agency / Label' : 'Creator'}
                  </span>
                  <Link
                    to={`/creator/${claimedEntity.id}`}
                    className="font-label-xs uppercase text-secondary font-bold hover:underline"
                  >
                    Open Public Profile →
                  </Link>
                </div>

                {isLabelAffiliatedCreator ? (
                  <p className="font-body-sm text-on-surface-variant">
                    Affiliated with <strong>{claimedEntity.agencyName}</strong>. Under label terms, your agency initiates and manages project Raises on your behalf.
                  </p>
                ) : (
                  canLaunchRace && (
                    <Link
                      to="/launch-race"
                      className="w-full py-3 rounded-xl bg-secondary text-white font-label-md font-bold text-center"
                    >
                      Launch a New Project Raise
                    </Link>
                  )
                )}
              </div>
            ) : isClaimedCreator && claimedEntity ? (
              <div className="py-3 border-l-2 border-secondary pl-3 flex flex-col gap-2">
                <span className="font-label-xs uppercase text-secondary font-bold">
                  KYC Audit Status: {claimedEntity.kycStatus.toUpperCase()}
                </span>
                <p className="font-body-sm text-on-surface-variant">
                  Bio code <strong className="font-mono-num">{creatorVerificationCode}</strong> and CNI/NIU documents for <strong>{claimedEntity.stageName}</strong> are queued for Admin review.
                </p>
                <Link
                  to={`/creator/${claimedEntity.id}`}
                  className="font-label-xs uppercase text-secondary font-bold hover:underline"
                >
                  View Your Profile →
                </Link>
              </div>
            ) : profile.creatorModeEnabled ? (
              <div className="py-3 border-t border-outline-variant/25 flex flex-col gap-3">
                <p className="font-body-sm text-on-surface">
                  To verify your identity as a creator or record label:
                </p>
                <ol className="text-[12px] text-on-surface-variant list-decimal pl-4 space-y-1">
                  <li>Open the Creators Directory and search for your artist/label name.</li>
                  <li>
                    Place bio code <strong className="font-mono-num text-on-surface">{creatorVerificationCode}</strong> in your YouTube/TikTok bio.
                  </li>
                  <li>Submit CNI + Cameroon NIU (or RCCM for labels) to unlock Raise creation.</li>
                </ol>
                <Link
                  to="/creators?claim=1"
                  className="w-full py-3 rounded-xl bg-primary-container text-white font-label-md font-bold text-center"
                >
                  Find &amp; Claim Your Profile →
                </Link>
              </div>
            ) : (
              <p className="font-body-sm text-on-surface-variant">
                Are you an artist, filmmaker, creator, or record label? Turn on Creator Mode to claim your public Crippo profile and verify your identity.
              </p>
            )}
          </section>

          {/* Rising Creator Memo Section (Borderless) */}
          <section className="border-t border-outline-variant/25 pt-6 flex flex-col gap-3">
            <h3 className="font-headline-sm text-on-surface font-bold leading-snug">
              Are you a rising creator and feel like you deserve to be on the market? Request a Memo now.
            </h3>
            <p className="font-body-sm text-on-surface-variant">
              Submit your YouTube, Spotify, or TikTok channel for an Admin catalog valuation review.
            </p>
            <Link
              to="/creators?memo=1"
              className="w-full py-3 rounded-xl bg-secondary text-white font-label-md font-bold text-center hover:opacity-95 transition-opacity"
            >
              Request a Memo
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
