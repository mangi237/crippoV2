import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../services/firebase';
import { apiFetch } from '../services/api';
import { useAuth, detectMomoProvider } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { WalletModal } from '../components/WalletModal';
import { formatTimeRemaining } from '../utils/media';
import { isAgencyEntity, isBrandEntity } from '../utils/entityDirectory';

export function UserProfile() {
  const { user, profile, privateInfo, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useLanguage();
  const {
    races,
    myTrades,
    myPayments,
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
  const [walletModalTab, setWalletModalTab] = useState<'deposit' | 'withdraw' | null>(null);
  const [verifyingPaymentId, setVerifyingPaymentId] = useState<string | null>(null);

  // Auto-detect return from Fapshi checkout or verify pending deposit
  useEffect(() => {
    if (!user || !profile) return;

    const checkPendingDeposits = async () => {
      // 1. Check URL parameters if redirected back with a payment reference/status
      const searchParams = new URLSearchParams(window.location.search);
      const urlTransId = searchParams.get('transId') || searchParams.get('reference');

      // 2. Check localStorage for an open pending deposit
      let storedDeposit: {
        paymentId: string;
        reference: string;
        amount: number;
        methodLabel?: string;
        uid: string;
      } | null = null;
      try {
        const raw = localStorage.getItem('crippo_pending_deposit');
        if (raw) storedDeposit = JSON.parse(raw);
      } catch {
        // ignore
      }

      const candidateRef = urlTransId || storedDeposit?.reference;
      const candidatePaymentId = storedDeposit?.paymentId;

      if (!candidateRef) return;

      try {
        const res = await apiFetch<{ status: string; amount?: number }>(
          `/api/payments/fapshi/status/${encodeURIComponent(candidateRef)}`
        );

        if (res.status === 'SUCCESSFUL') {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          const creditAmount = res.amount || storedDeposit?.amount || 0;

          if (userSnap.exists() && creditAmount > 0) {
            const cur = Number(userSnap.data()?.walletBalanceXAF || 0);
            await updateDoc(userRef, {
              walletBalanceXAF: cur + creditAmount,
              updatedAt: serverTimestamp(),
            });
          }

          if (candidatePaymentId) {
            try {
              await updateDoc(doc(db, 'payments', candidatePaymentId), {
                status: 'SUCCESSFUL',
                updatedAt: serverTimestamp(),
              });
            } catch {
              // payment doc update optional
            }
          }

          localStorage.removeItem('crippo_pending_deposit');
          showToast(
            'Deposit Credited!',
            `${creditAmount.toLocaleString()} XAF has been added to your Crippo Wallet balance.`,
            'success'
          );

          // Clean query params from URL without page reload
          if (urlTransId) {
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);
          }
        }
      } catch (err) {
        console.warn('Auto-verify deposit check:', err);
      }
    };

    void checkPendingDeposits();
  }, [user, profile, showToast]);

  // Settings & Preferences State
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [avatarUrlDraft, setAvatarUrlDraft] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayNameDraft(profile.displayName || '');
      setAvatarUrlDraft(profile.avatarUrl || '');
    }
  }, [profile]);

  useEffect(() => {
    if (privateInfo?.phone) {
      setPhoneDraft(privateInfo.phone);
    }
  }, [privateInfo?.phone]);

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

  if (!user) {
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

  if (!profile) {
    return (
      <div className="max-w-xl mx-auto py-10 flex flex-col gap-5 border-b border-outline-variant/25">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-black text-white flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[24px]">person</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-headline-sm text-on-surface font-bold truncate">
              {user.displayName || user.email || 'Crippo Account'}
            </h1>
            <p className="font-body-sm text-on-surface-variant truncate">{user.email}</p>
          </div>
        </div>
        <p className="font-body-md text-on-surface-variant">
          You are signed in. Link your Cameroon Mobile Money number (+237) to buy project shares or receive royalty payouts.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/auth?mode=signup&returnTo=/profile')}
            className="px-5 py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
          >
            Complete Mobile Money Setup
          </button>
          {isAdmin && (
            <Link
              to="/admin"
              className="px-5 py-2.5 rounded-xl bg-primary-container text-white font-label-md font-bold"
            >
              Open Admin Desk
            </Link>
          )}
          <button
            type="button"
            onClick={() => signOut()}
            className="px-5 py-2.5 rounded-xl border border-error/40 text-error font-label-md font-bold"
          >
            Sign Out
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

  const handleAvatarFileUpload = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith('image/')) {
      showToast('Invalid Image', 'Please select a PNG, JPG, or WebP image file.', 'error');
      return;
    }
    setUploadingAvatar(true);
    try {
      const storageRef = ref(storage, `avatars/${user.uid}/avatar_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setAvatarUrlDraft(url);
      await updateDoc(doc(db, 'users', user.uid), {
        avatarUrl: url,
        updatedAt: serverTimestamp(),
      });
      showToast('Avatar Updated', 'Your profile photo has been uploaded.');
    } catch (err: unknown) {
      showToast('Upload Failed', (err as Error).message || 'Could not upload avatar.', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfileSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    const cleanName = displayNameDraft.trim().slice(0, 80);
    if (!cleanName) {
      showToast('Display Name Required', 'Please enter a valid display name.', 'error');
      return;
    }

    const cleanAvatar = avatarUrlDraft.trim().slice(0, 500);
    if (cleanAvatar && !/^https?:\/\//i.test(cleanAvatar)) {
      showToast('Invalid Avatar URL', 'Avatar URL must start with http:// or https://.', 'error');
      return;
    }

    const cleanPhone = phoneDraft.replace(/\D/g, '');
    if (phoneDraft.trim() && !/^2376[0-9]{8}$/.test(cleanPhone)) {
      showToast('Invalid MoMo Number', 'Use Cameroon format 2376XXXXXXXX.', 'error');
      return;
    }

    setSavingSettings(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: cleanName,
        avatarUrl: cleanAvatar,
        updatedAt: serverTimestamp(),
      });

      if (cleanPhone) {
        const provider = detectMomoProvider(cleanPhone);
        if (privateInfo) {
          await updateDoc(doc(db, 'users', user.uid, 'private', 'info'), {
            phone: cleanPhone,
            momoProvider: provider,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(doc(db, 'users', user.uid, 'private', 'info'), {
            uid: user.uid,
            email: user.email || '',
            phone: cleanPhone,
            momoProvider: provider,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      showToast('Settings Saved', 'Your profile details and Mobile Money settings were updated.');
    } catch (err: unknown) {
      showToast('Save Error', (err as Error).message || 'Could not save settings.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Account Summary Header */}
      <section className="pb-6 border-b border-outline-variant/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              className="w-14 h-14 rounded-lg object-cover border border-outline-variant/30 shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-black text-white flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[26px]">person</span>
            </div>
          )}
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
          <button
            type="button"
            onClick={() => setWalletModalTab('deposit')}
            className="px-4 py-2 rounded-xl bg-secondary text-on-secondary font-label-md font-bold"
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => setWalletModalTab('withdraw')}
            className="px-4 py-2 rounded-xl border border-outline-variant/50 text-on-surface font-label-md font-semibold hover:border-secondary"
          >
            Withdraw
          </button>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pb-6 border-b border-outline-variant/25 tabular-nums">
        <div>
          <span className="font-label-xs uppercase text-on-surface-variant">Wallet Balance</span>
          <div className="font-headline-lg-mobile text-secondary font-bold mt-1">
            {(profile.walletBalanceXAF || 0).toLocaleString()} XAF
          </div>
          <div className="flex items-center gap-3 mt-1">
            <button
              type="button"
              onClick={() => setWalletModalTab('deposit')}
              className="font-label-xs uppercase text-secondary font-bold hover:underline"
            >
              + Deposit (MoMo / Card)
            </button>
            <button
              type="button"
              onClick={() => setWalletModalTab('withdraw')}
              className="font-label-xs uppercase text-on-surface-variant font-bold hover:text-on-surface"
            >
              Cash Out →
            </button>
          </div>
        </div>
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

          {/* Recent Payments & Fapshi Deposits Activity */}
          <section className="border-t border-outline-variant/25 pt-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-on-surface font-bold">
                Recent Transactions ({myPayments.length})
              </h2>
              <Link to="/trades" className="font-label-xs uppercase text-secondary font-bold hover:underline">
                View Ledger →
              </Link>
            </div>

            {myPayments.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant">
                No recent payment transactions recorded.
              </p>
            ) : (
              <div className="divide-y divide-outline-variant/25">
                {myPayments.slice(0, 5).map((pay) => (
                  <div key={pay.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-label-md font-bold text-on-surface truncate">
                          {pay.type === 'WALLET_DEPOSIT'
                            ? 'Wallet Deposit'
                            : pay.type === 'SHARE_PURCHASE'
                            ? 'Share Purchase'
                            : pay.type.replace(/_/g, ' ')}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            pay.status === 'SUCCESSFUL'
                              ? 'bg-secondary-fixed text-secondary'
                              : pay.status === 'FAILED'
                              ? 'bg-error/20 text-error'
                              : 'bg-surface-container text-on-surface-variant'
                          }`}
                        >
                          {pay.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant font-mono mt-0.5 truncate">
                        Ref: {pay.reference} · {pay.provider}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono-num font-bold text-on-surface block">
                        +{pay.amountXAF.toLocaleString()} XAF
                      </span>
                      {pay.status === 'PENDING' && (
                        <button
                          type="button"
                          disabled={verifyingPaymentId === pay.id}
                          onClick={async () => {
                            setVerifyingPaymentId(pay.id);
                            try {
                              const check = await apiFetch<{ status: string; amount?: number }>(
                                `/api/payments/fapshi/status/${encodeURIComponent(pay.reference)}`
                              );
                              if (check.status === 'SUCCESSFUL') {
                                const userRef = doc(db, 'users', user.uid);
                                const userSnap = await getDoc(userRef);
                                const cur = Number(userSnap.data()?.walletBalanceXAF || 0);
                                await updateDoc(userRef, {
                                  walletBalanceXAF: cur + pay.amountXAF,
                                  updatedAt: serverTimestamp(),
                                });
                                await updateDoc(doc(db, 'payments', pay.id), {
                                  status: 'SUCCESSFUL',
                                  updatedAt: serverTimestamp(),
                                });
                                showToast(
                                  'Deposit Verified!',
                                  `${pay.amountXAF.toLocaleString()} XAF credited to your balance.`,
                                  'success'
                                );
                              } else if (check.status === 'FAILED') {
                                await updateDoc(doc(db, 'payments', pay.id), {
                                  status: 'FAILED',
                                  updatedAt: serverTimestamp(),
                                });
                                showToast('Payment Failed', 'Transaction was cancelled or declined.', 'error');
                              } else {
                                showToast('Payment Pending', 'Fapshi reports payment is still pending.', 'info');
                              }
                            } catch (err: unknown) {
                              showToast('Check Failed', (err as Error).message, 'error');
                            } finally {
                              setVerifyingPaymentId(null);
                            }
                          }}
                          className="text-[11px] text-secondary font-bold hover:underline"
                        >
                          {verifyingPaymentId === pay.id ? 'Checking...' : 'Check Status'}
                        </button>
                      )}
                    </div>
                  </div>
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
                    Verified{' '}
                    {isBrandEntity(claimedEntity)
                      ? 'Brand Sponsor'
                      : isAgencyEntity(claimedEntity)
                      ? 'Agency / Label'
                      : 'Creator'}
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

          {/* Profile Settings & Preferences */}
          <section className="border-t border-outline-variant/25 pt-6 flex flex-col gap-4">
            <div>
              <span className="font-label-xs uppercase text-secondary font-bold">
                Account Preferences
              </span>
              <h2 className="font-headline-sm text-on-surface font-bold">
                Profile Settings &amp; Display
              </h2>
            </div>

            <form onSubmit={handleSaveProfileSettings} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-label-xs uppercase text-on-surface-variant">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayNameDraft}
                  onChange={(e) => setDisplayNameDraft(e.target.value)}
                  placeholder="Your display name"
                  className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface font-body-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-xs uppercase text-on-surface-variant">
                  Cameroon MoMo / Orange Number (+237)
                </label>
                <input
                  type="tel"
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  placeholder="237677821940"
                  className="px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface font-mono-num"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-xs uppercase text-on-surface-variant">
                  Profile Avatar
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="px-3.5 py-2 rounded-xl border border-outline-variant/45 text-on-surface font-label-xs uppercase font-bold cursor-pointer hover:border-secondary">
                    {uploadingAvatar ? 'Uploading...' : 'Upload Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingAvatar}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleAvatarFileUpload(file);
                      }}
                    />
                  </label>
                  {avatarUrlDraft && (
                    <button
                      type="button"
                      onClick={() => setAvatarUrlDraft('')}
                      className="px-3 py-2 rounded-xl border border-outline-variant/40 text-on-surface-variant font-label-xs uppercase font-bold hover:text-error"
                    >
                      Remove Photo
                    </button>
                  )}
                </div>
                <input
                  type="url"
                  value={avatarUrlDraft}
                  onChange={(e) => setAvatarUrlDraft(e.target.value)}
                  placeholder="Or paste https:// avatar image URL"
                  className="px-3.5 py-2 rounded-xl border border-outline-variant/40 bg-transparent text-on-surface font-body-sm"
                />
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full py-2.5 rounded-xl bg-primary-container text-white font-label-md font-bold disabled:opacity-60"
              >
                {savingSettings ? 'Saving Settings...' : 'Save Profile Settings'}
              </button>
            </form>

            <div className="pt-3 border-t border-outline-variant/25 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="font-label-xs uppercase text-on-surface-variant">Language</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLang('en')}
                    className={`py-2 rounded-lg font-label-xs uppercase font-bold border transition-colors ${
                      lang === 'en'
                        ? 'bg-secondary text-white border-secondary'
                        : 'border-outline-variant/40 text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang('fr')}
                    className={`py-2 rounded-lg font-label-xs uppercase font-bold border transition-colors ${
                      lang === 'fr'
                        ? 'bg-secondary text-white border-secondary'
                        : 'border-outline-variant/40 text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Français
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="font-label-xs uppercase text-on-surface-variant">Appearance</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`py-2 rounded-lg font-label-xs uppercase font-bold border transition-colors ${
                      theme === 'light'
                        ? 'bg-secondary text-white border-secondary'
                        : 'border-outline-variant/40 text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Light Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`py-2 rounded-lg font-label-xs uppercase font-bold border transition-colors ${
                      theme === 'dark'
                        ? 'bg-secondary text-white border-secondary'
                        : 'border-outline-variant/40 text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Dark Mode
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Rising Creator Memo Section (Borderless) */}
          <section className="border-t border-outline-variant/25 pt-6 flex flex-col gap-3">
            <h3 className="font-headline-sm text-on-surface font-bold leading-snug">
              Are you a rising creator and feel like you deserve to be on the market? Request a Memo now.
            </h3>
            <p className="font-body-sm text-on-surface-variant">
              Submit your profile, social accounts, bio, and channel pitch for Admin catalog review.
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

      {walletModalTab && (
        <WalletModal
          initialTab={walletModalTab}
          onClose={() => setWalletModalTab(null)}
          onSuccess={(msg) => showToast('Wallet Updated', msg)}
        />
      )}
    </div>
  );
}
