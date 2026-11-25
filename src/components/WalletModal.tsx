import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { apiFetch } from '../services/api';
import { useAuth, detectMomoProvider } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

interface WalletModalProps {
  initialTab?: 'deposit' | 'withdraw';
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onOpenApiSetup?: () => void;
}

type DepositMethod = 'MTN' | 'ORANGE' | 'CARD';

export function WalletModal({
  initialTab = 'deposit',
  onClose,
  onSuccess,
  onOpenApiSetup,
}: WalletModalProps) {
  const { user, profile, privateInfo } = useAuth();
  const { lang } = useLanguage();

  const [tab, setTab] = useState<'deposit' | 'withdraw'>(initialTab);
  const [amountXAF, setAmountXAF] = useState<number>(5000);
  const [depositMethod, setDepositMethod] = useState<DepositMethod>(
    privateInfo?.momoProvider === 'ORANGE' ? 'ORANGE' : 'MTN'
  );
  const [withdrawCarrier, setWithdrawCarrier] = useState<'MTN' | 'ORANGE'>(
    privateInfo?.momoProvider === 'ORANGE' ? 'ORANGE' : 'MTN'
  );
  const [phone, setPhone] = useState<string>(privateInfo?.phone || '237670000000');

  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Hosted Fapshi Checkout Payment Link state
  const [checkoutSession, setCheckoutSession] = useState<{
    link: string;
    reference: string;
    paymentId: string;
    amount: number;
    methodLabel: string;
  } | null>(null);
  const [verifyingSession, setVerifyingSession] = useState(false);

  const currentBalance = Math.max(0, Number(profile?.walletBalanceXAF || 0));

  useEffect(() => {
    const detected = detectMomoProvider(phone);
    if (detected === 'MTN' || detected === 'ORANGE') {
      if (tab === 'withdraw') setWithdrawCarrier(detected);
      else if (depositMethod !== 'CARD') setDepositMethod(detected);
    }
  }, [phone, tab, depositMethod]);

  const completeDepositSuccess = async (paymentId: string, amount: number, methodLabel: string) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const cur = Number(userSnap.data()?.walletBalanceXAF || 0);
        await updateDoc(userRef, {
          walletBalanceXAF: cur + amount,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(userRef, {
          uid: user.uid,
          anonymousId: profile?.anonymousId || `Trader #${Math.floor(1000 + Math.random() * 9000)}`,
          displayName: profile?.displayName || user.displayName || 'Crippo Trader',
          city: profile?.city || 'Douala',
          interests: profile?.interests || ['Afrobeats'],
          onboardingComplete: true,
          creatorModeEnabled: false,
          kycStatus: 'none',
          walletBalanceXAF: amount,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, 'payments', paymentId), {
        status: 'SUCCESSFUL',
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to write deposit update:', e);
    }

    onSuccess(
      lang === 'fr'
        ? `Dépôt de ${amount.toLocaleString()} FCFA crédité avec succès.`
        : `${amount.toLocaleString()} XAF deposited into your Crippo Wallet via ${methodLabel}.`
    );
    onClose();
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) {
      setErrorMsg('Please sign in first.');
      return;
    }
    if (!Number.isFinite(amountXAF) || amountXAF < 100) {
      setErrorMsg(lang === 'fr' ? 'Montant minimum: 100 FCFA.' : 'Minimum deposit is 100 XAF.');
      return;
    }

    setBusy(true);
    setErrorMsg('');
    setStatusMsg('');

    const paymentId = `pay_dep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const methodLabel =
      depositMethod === 'CARD'
        ? 'Bank Card'
        : depositMethod === 'ORANGE'
        ? 'Orange Money'
        : 'MTN MoMo';

    try {
      setStatusMsg(
        lang === 'fr'
          ? 'Création de la session de paiement sécurisée Fapshi...'
          : `Creating secure Fapshi payment session for ${methodLabel}...`
      );

      const resp = await apiFetch<{ reference: string; link: string; transId?: string }>(
        '/api/payments/fapshi/collect',
        {
          method: 'POST',
          body: JSON.stringify({
            amountXAF,
            phone: phone.replace(/\D/g, ''),
            description: `Crippo Wallet Deposit (${amountXAF.toLocaleString()} XAF)`,
            externalReference: paymentId,
            redirectUrl: window.location.href,
            email: user.email || undefined,
          }),
        }
      );

      await setDoc(doc(db, 'payments', paymentId), {
        id: paymentId,
        uid: user.uid,
        type: 'WALLET_DEPOSIT',
        reference: resp.reference,
        amountXAF,
        provider: depositMethod,
        status: 'PENDING',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setCheckoutSession({
        link: resp.link,
        reference: resp.reference,
        paymentId,
        amount: amountXAF,
        methodLabel,
      });

      setStatusMsg(
        lang === 'fr'
          ? 'Ouvrez le lien Fapshi pour autoriser votre paiement, puis cliquez sur "Vérifier le Paiement".'
          : 'Complete your checkout using the secure Fapshi link below, then click "Verify Payment".'
      );

      if (resp.link) {
        window.open(resp.link, '_blank');
      }
    } catch (err: unknown) {
      const er = err as Error & { missingKeys?: string[] };
      if (er.missingKeys?.length && onOpenApiSetup) onOpenApiSetup();
      setErrorMsg(er.message || 'Deposit initiation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyPayment = async (forceSimulateSuccess = false) => {
    if (!checkoutSession || !user) return;
    setVerifyingSession(true);
    setErrorMsg('');
    try {
      if (forceSimulateSuccess) {
        await completeDepositSuccess(
          checkoutSession.paymentId,
          checkoutSession.amount,
          checkoutSession.methodLabel
        );
        return;
      }

      const check = await apiFetch<{ status: string; rawStatus?: string }>(
        `/api/payments/fapshi/status/${encodeURIComponent(checkoutSession.reference)}`
      );

      if (check.status === 'SUCCESSFUL') {
        await completeDepositSuccess(
          checkoutSession.paymentId,
          checkoutSession.amount,
          checkoutSession.methodLabel
        );
        return;
      }

      if (check.status === 'FAILED') {
        await updateDoc(doc(db, 'payments', checkoutSession.paymentId), {
          status: 'FAILED',
          updatedAt: serverTimestamp(),
        });
        setCheckoutSession(null);
        setErrorMsg('Payment transaction was cancelled or declined.');
        return;
      }

      setStatusMsg(
        lang === 'fr'
          ? 'Paiement en attente de validation sur Fapshi. Si vous venez de valider, réessayez ou cliquez sur "Créditer (Sandbox)".'
          : 'Payment is pending on Fapshi. If you completed the sandbox checkout, click Verify again or use the Instant Sandbox Credit button below.'
      );
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Could not verify payment status.');
    } finally {
      setVerifyingSession(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) {
      setErrorMsg('Please sign in first.');
      return;
    }
    if (!Number.isFinite(amountXAF) || amountXAF < 500) {
      setErrorMsg(lang === 'fr' ? 'Retrait minimum: 500 FCFA.' : 'Minimum withdrawal is 500 XAF.');
      return;
    }
    if (amountXAF > currentBalance) {
      setErrorMsg(
        lang === 'fr'
          ? `Solde insuffisant (${currentBalance.toLocaleString()} FCFA disponible).`
          : `Insufficient wallet balance (${currentBalance.toLocaleString()} XAF available).`
      );
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (!/^2376[0-9]{8}$/.test(cleanPhone)) {
      setErrorMsg('Enter a valid Cameroon Mobile Money number (2376XXXXXXXX).');
      return;
    }

    setBusy(true);
    setErrorMsg('');
    setStatusMsg(
      lang === 'fr'
        ? `Décaissement de ${amountXAF.toLocaleString()} FCFA vers ${withdrawCarrier}...`
        : `Sending ${amountXAF.toLocaleString()} XAF withdrawal via Fapshi to ${cleanPhone}...`
    );

    const paymentId = `pay_wd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      const resp = await apiFetch<{ reference: string; status: string }>(
        '/api/payments/fapshi/withdraw',
        {
          method: 'POST',
          body: JSON.stringify({
            amountXAF,
            phone: cleanPhone,
            description: `Crippo Wallet Withdrawal (${amountXAF.toLocaleString()} XAF)`,
            externalReference: paymentId,
          }),
        }
      );

      await setDoc(doc(db, 'payments', paymentId), {
        id: paymentId,
        uid: user.uid,
        type: 'WALLET_WITHDRAWAL',
        reference: resp.reference || paymentId,
        amountXAF,
        provider: withdrawCarrier,
        status: resp.status === 'SUCCESSFUL' ? 'SUCCESSFUL' : 'PENDING',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const cur = Number(userSnap.data()?.walletBalanceXAF || currentBalance);
      await updateDoc(userRef, {
        walletBalanceXAF: Math.max(0, cur - amountXAF),
        updatedAt: serverTimestamp(),
      });

      onSuccess(
        lang === 'fr'
          ? `Retrait de ${amountXAF.toLocaleString()} FCFA initié vers +${cleanPhone}.`
          : `Withdrawal of ${amountXAF.toLocaleString()} XAF dispatched to +${cleanPhone} (Ref: ${resp.reference}).`
      );
      onClose();
    } catch (err: unknown) {
      const er = err as Error & { missingKeys?: string[] };
      if (er.missingKeys?.length && onOpenApiSetup) onOpenApiSetup();
      setErrorMsg(er.message || 'Withdrawal failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-surface-container-lowest border border-outline-variant/40 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 flex flex-col gap-5 pb-safe max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-label-xs uppercase tracking-wider text-secondary font-bold">
              Fapshi XAF Wallet
            </span>
            <h3 className="font-headline-sm text-on-surface font-bold">
              {lang === 'fr' ? 'Dépôts & Retraits' : 'Deposit & Withdraw Funds'}
            </h3>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Balance Display */}
        <div className="py-3 border-t border-b border-outline-variant/25 flex items-center justify-between tabular-nums">
          <span className="font-label-xs uppercase text-on-surface-variant">
            {lang === 'fr' ? 'Solde Disponible' : 'Available Wallet Balance'}
          </span>
          <span className="font-headline-sm font-mono-num text-on-surface font-bold">
            {currentBalance.toLocaleString()} XAF
          </span>
        </div>

        {/* Deposit / Withdraw Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 border-b border-outline-variant/25 pb-2">
          <button
            type="button"
            onClick={() => {
              setTab('deposit');
              setErrorMsg('');
              setStatusMsg('');
              setCheckoutSession(null);
            }}
            className={`py-2.5 rounded-xl font-label-md font-bold transition-colors ${
              tab === 'deposit'
                ? 'bg-secondary text-white'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {lang === 'fr' ? 'Déposer' : 'Deposit Funds'}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('withdraw');
              setErrorMsg('');
              setStatusMsg('');
              setCheckoutSession(null);
            }}
            className={`py-2.5 rounded-xl font-label-md font-bold transition-colors ${
              tab === 'withdraw'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {lang === 'fr' ? 'Retirer' : 'Cash Out / Withdraw'}
          </button>
        </div>

        {tab === 'deposit' ? (
          <form onSubmit={handleDeposit} className="flex flex-col gap-4">
            {/* Amount Presets */}
            <div className="flex flex-col gap-2">
              <label className="font-label-xs uppercase text-on-surface-variant">
                {lang === 'fr' ? 'Montant (FCFA)' : 'Deposit Amount (FCFA / XAF)'}
              </label>
              <input
                type="number"
                min={100}
                step={100}
                required
                value={amountXAF}
                onChange={(e) => setAmountXAF(Math.max(100, Number(e.target.value) || 100))}
                className="px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface font-ticker-val text-lg outline-none focus:border-secondary"
              />
              <div className="grid grid-cols-4 gap-2">
                {[2000, 5000, 10000, 25000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmountXAF(preset)}
                    className={`py-1.5 rounded-lg font-label-xs tabular-nums ${
                      amountXAF === preset
                        ? 'bg-secondary text-white font-bold'
                        : 'bg-surface-container text-on-surface hover:bg-secondary-fixed'
                    }`}
                  >
                    {preset.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method: MTN MoMo, Orange Money, Bank Card */}
            <div className="flex flex-col gap-2">
              <span className="font-label-xs uppercase text-on-surface-variant">
                {lang === 'fr' ? 'Moyen de Paiement' : 'Payment Method'}
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDepositMethod('MTN');
                    setCheckoutSession(null);
                  }}
                  className={`p-3 rounded-xl flex flex-col gap-1 text-left border transition-colors ${
                    depositMethod === 'MTN'
                      ? 'border-secondary bg-secondary-fixed/40'
                      : 'border-outline-variant/30 bg-surface-container-low'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full bg-[#fcd116]" />
                  <span className="font-label-xs font-bold text-on-surface">MTN MoMo</span>
                  <span className="text-[10px] text-on-surface-variant">Sandbox Ready</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDepositMethod('ORANGE');
                    setCheckoutSession(null);
                  }}
                  className={`p-3 rounded-xl flex flex-col gap-1 text-left border transition-colors ${
                    depositMethod === 'ORANGE'
                      ? 'border-secondary bg-secondary-fixed/40'
                      : 'border-outline-variant/30 bg-surface-container-low'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full bg-[#ff7900]" />
                  <span className="font-label-xs font-bold text-on-surface">Orange Money</span>
                  <span className="text-[10px] text-on-surface-variant">Sandbox Ready</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDepositMethod('CARD');
                    setCheckoutSession(null);
                  }}
                  className={`p-3 rounded-xl flex flex-col gap-1 text-left border transition-colors ${
                    depositMethod === 'CARD'
                      ? 'border-secondary bg-secondary-fixed/40'
                      : 'border-outline-variant/30 bg-surface-container-low'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] text-secondary">credit_card</span>
                  <span className="font-label-xs font-bold text-on-surface">Bank Card</span>
                  <span className="text-[10px] text-on-surface-variant">Visa / MC</span>
                </button>
              </div>
            </div>

            {depositMethod !== 'CARD' && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="font-label-xs uppercase text-on-surface-variant">
                    Mobile Money Number (+237)
                  </label>
                  <span className="text-[10px] text-secondary font-mono">
                    Test: 670000000 (MTN) / 690000000 (Orange)
                  </span>
                </div>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="237670000000"
                  className="px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface font-mono-num"
                />
              </div>
            )}

            {checkoutSession && (
              <div className="p-4 rounded-xl bg-secondary-fixed/30 border border-secondary/40 flex flex-col gap-3">
                <p className="font-body-sm text-on-surface">
                  Secure Fapshi checkout session ready (Ref: <span className="font-mono-num">{checkoutSession.reference}</span>).
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <a
                    href={checkoutSession.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 px-4 rounded-xl bg-secondary text-white font-label-xs uppercase font-bold text-center"
                  >
                    Open Fapshi Checkout ↗
                  </a>
                  <button
                    type="button"
                    disabled={verifyingSession}
                    onClick={() => handleVerifyPayment(false)}
                    className="py-2.5 px-4 rounded-xl bg-on-tertiary-container text-white font-label-xs uppercase font-bold disabled:opacity-60"
                  >
                    {verifyingSession ? 'Checking...' : 'Verify Payment'}
                  </button>
                </div>
                {/* Instant Sandbox Update button for seamless testing */}
                <button
                  type="button"
                  disabled={verifyingSession}
                  onClick={() => handleVerifyPayment(true)}
                  className="w-full py-2 px-3 rounded-lg border border-secondary/50 text-secondary hover:bg-secondary-fixed/40 font-label-xs font-semibold text-center transition-colors"
                >
                  ⚡ Instant Sandbox Credit ({checkoutSession.amount.toLocaleString()} XAF)
                </button>
              </div>
            )}

            {statusMsg && (
              <div className="p-3 rounded-xl bg-surface-container text-on-surface font-body-sm">
                {statusMsg}
              </div>
            )}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-error-container text-on-error-container font-body-sm">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3.5 rounded-xl bg-on-tertiary-container text-white font-headline-sm text-[14px] font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {busy
                ? 'Processing...'
                : checkoutSession
                ? `Initiate New Deposit (${amountXAF.toLocaleString()} XAF)`
                : `Deposit ${amountXAF.toLocaleString()} XAF via ${depositMethod}`}
            </button>
          </form>
        ) : (
          <form onSubmit={handleWithdraw} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="font-label-xs uppercase text-on-surface-variant">
                  {lang === 'fr' ? 'Montant à Retirer (XAF)' : 'Withdrawal Amount (XAF)'}
                </label>
                <button
                  type="button"
                  onClick={() => setAmountXAF(Math.max(500, currentBalance))}
                  className="font-label-xs text-secondary font-bold hover:underline"
                >
                  Max ({currentBalance.toLocaleString()} XAF)
                </button>
              </div>
              <input
                type="number"
                min={500}
                max={Math.max(500, currentBalance)}
                step={100}
                required
                value={amountXAF}
                onChange={(e) => setAmountXAF(Math.max(500, Number(e.target.value) || 500))}
                className="px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface font-ticker-val text-lg outline-none focus:border-secondary"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWithdrawCarrier('MTN')}
                className={`p-3 rounded-xl flex items-center gap-2 text-left border ${
                  withdrawCarrier === 'MTN'
                    ? 'border-secondary bg-secondary-fixed/40'
                    : 'border-outline-variant/30 bg-surface-container-low'
                }`}
              >
                <span className="w-3 h-3 rounded-full bg-[#fcd116]" />
                <span className="font-label-md font-bold text-on-surface">MTN MoMo</span>
              </button>
              <button
                type="button"
                onClick={() => setWithdrawCarrier('ORANGE')}
                className={`p-3 rounded-xl flex items-center gap-2 text-left border ${
                  withdrawCarrier === 'ORANGE'
                    ? 'border-secondary bg-secondary-fixed/40'
                    : 'border-outline-variant/30 bg-surface-container-low'
                }`}
              >
                <span className="w-3 h-3 rounded-full bg-[#ff7900]" />
                <span className="font-label-md font-bold text-on-surface">Orange Money</span>
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-xs uppercase text-on-surface-variant">
                Recipient MoMo / Orange Number (+237)
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="237670000000"
                className="px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface font-mono-num"
              />
            </div>

            {statusMsg && (
              <div className="p-3 rounded-xl bg-surface-container text-on-surface font-body-sm">
                {statusMsg}
              </div>
            )}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-error-container text-on-error-container font-body-sm">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || currentBalance < 500}
              className="w-full py-3.5 rounded-xl bg-primary text-on-primary font-headline-sm text-[14px] font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {busy
                ? 'Sending Payout...'
                : currentBalance < 500
                ? 'Minimum 500 XAF Balance Required'
                : `Withdraw ${amountXAF.toLocaleString()} XAF`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
