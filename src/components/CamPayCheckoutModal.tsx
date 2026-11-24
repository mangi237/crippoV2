import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { apiFetch } from '../services/api';
import { useAuth, detectMomoProvider } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import type { Race } from '../types/crippo';

interface CamPayCheckoutModalProps {
  mode?: 'race';
  race: Race;
  initialShares?: number;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onOpenApiSetup: () => void;
}

type PaymentMethod = 'MTN' | 'ORANGE' | 'CARD' | 'WALLET';

export function CamPayCheckoutModal({
  race,
  initialShares = 2,
  onClose,
  onSuccess,
  onOpenApiSetup,
}: CamPayCheckoutModalProps) {
  const { user, profile, privateInfo } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const unitPrice = race.currentSharePriceXAF;
  const maxAvailable = Math.max(1, race.totalShares - race.sharesSold);
  const walletBalance = Math.max(0, Number(profile?.walletBalanceXAF || 0));

  const [shares, setShares] = useState<number>(Math.max(1, Math.min(maxAvailable, initialShares)));
  const [phone, setPhone] = useState<string>(privateInfo?.phone || '2376');
  const [method, setMethod] = useState<PaymentMethod>(
    privateInfo?.momoProvider === 'ORANGE' ? 'ORANGE' : 'MTN'
  );
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [cardLinkData, setCardLinkData] = useState<{
    link: string;
    reference: string;
    paymentId: string;
  } | null>(null);

  useEffect(() => {
    const detected = detectMomoProvider(phone);
    if ((detected === 'MTN' || detected === 'ORANGE') && (method === 'MTN' || method === 'ORANGE')) {
      setMethod(detected);
    }
  }, [phone, method]);

  const totalAmountXAF = Math.round(shares * unitPrice);

  const isRaceWindowClosed = Boolean(
    race.status !== 'open' || Date.now() >= new Date(race.raceCloseDate).getTime()
  );

  const finalizeShareAllocation = async (reference: string) => {
    if (!user || !profile) return;
    const tradeId = `trd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await setDoc(doc(db, 'trades', tradeId), {
        id: tradeId,
        raceId: race.id,
        raceTitle: race.title,
        creatorName: race.creatorName,
        buyerUid: user.uid,
        anonymousId: profile.anonymousId,
        side: 'BUY',
        shares,
        pricePerShareXAF: unitPrice,
        totalAmountXAF,
        paymentReference: reference,
        status: 'settled',
        isPublicOrderBook: true,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `trades/${tradeId}`);
    }

    const demandBump = Math.max(1, Math.round((shares / Math.max(1, race.totalShares)) * 100) / 100);
    const nextPrice = Math.round(race.currentSharePriceXAF * (1 + demandBump * 0.25));
    const nextHistory = [
      ...(race.priceHistory || []).slice(-39),
      { timestamp: new Date().toISOString(), priceXAF: nextPrice, reason: `${shares} shares bought` },
    ];

    await updateDoc(doc(db, 'races', race.id), {
      sharesSold: increment(shares),
      currentSharePriceXAF: nextPrice,
      priceHistory: nextHistory,
      updatedAt: serverTimestamp(),
    });

    onSuccess(
      lang === 'fr'
        ? `${shares} parts achetées pour ${totalAmountXAF.toLocaleString()} FCFA !`
        : `Order executed! ${shares} shares allocated (${totalAmountXAF.toLocaleString()} FCFA)`
    );
    onClose();
  };

  const handleConfirm = async () => {
    if (!user || !profile) {
      onClose();
      navigate(`/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }

    if (isRaceWindowClosed) {
      setErrorMsg(
        lang === 'fr'
          ? 'La fenêtre de souscription est fermée. Le trading est verrouillé.'
          : 'This Raise window is closed. Share purchases and trading are locked.'
      );
      return;
    }

    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (method === 'WALLET') {
      if (walletBalance < totalAmountXAF) {
        setErrorMsg(
          `Insufficient wallet balance (${walletBalance.toLocaleString()} XAF). Deposit funds or select MoMo / Card.`
        );
        return;
      }
      setSubmitting(true);
      setErrorMsg('');
      setStatusMsg('Debiting Crippo Wallet balance...');
      try {
        const walletRef = `WLT-${Date.now()}`;
        await setDoc(doc(db, 'payments', paymentId), {
          id: paymentId,
          uid: user.uid,
          type: 'SHARE_PURCHASE',
          reference: walletRef,
          amountXAF: totalAmountXAF,
          provider: 'WALLET',
          status: 'SUCCESSFUL',
          raceId: race.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'users', user.uid), {
          walletBalanceXAF: increment(-totalAmountXAF),
          updatedAt: serverTimestamp(),
        });
        await finalizeShareAllocation(walletRef);
      } catch (err: unknown) {
        setErrorMsg((err as Error).message || 'Wallet transaction failed.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (totalAmountXAF < 100) {
      setErrorMsg(
        lang === 'fr'
          ? 'Montant minimum CamPay: 100 FCFA.'
          : 'Minimum CamPay transaction amount is 100 FCFA.'
      );
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      if (method === 'CARD') {
        setStatusMsg('Generating secure CamPay Bank Card checkout...');
        const resp = await apiFetch<{ link: string; reference: string }>(
          '/api/payments/campay/payment-link',
          {
            method: 'POST',
            body: JSON.stringify({
              amountXAF: totalAmountXAF,
              description: `Crippo: ${race.title} (${shares} shares)`,
              externalReference: paymentId,
              redirectUrl: window.location.href,
              paymentOptions: 'CARD,MOMO',
              firstName: profile.displayName,
              email: user.email || undefined,
            }),
          }
        );

        await setDoc(doc(db, 'payments', paymentId), {
          id: paymentId,
          uid: user.uid,
          type: 'SHARE_PURCHASE',
          reference: resp.reference,
          amountXAF: totalAmountXAF,
          provider: 'CARD',
          status: 'PENDING',
          raceId: race.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setCardLinkData({ link: resp.link, reference: resp.reference, paymentId });
        setStatusMsg('Open the secure CamPay Card checkout link below, then click Verify Card Settlement.');
        setSubmitting(false);
        return;
      }

      const cleanPhone = phone.replace(/\D/g, '');
      if (!/^2376[0-9]{8}$/.test(cleanPhone)) {
        setErrorMsg(
          lang === 'fr'
            ? 'Numéro Cameroun requis au format 2376XXXXXXXX.'
            : 'Valid Cameroon number required (2376XXXXXXXX).'
        );
        setSubmitting(false);
        return;
      }

      setStatusMsg(
        lang === 'fr'
          ? 'Envoi du prompt USSD CamPay en cours...'
          : 'Initiating CamPay USSD push...'
      );

      const resp = await apiFetch<{ reference: string; ussd_code?: string; operator?: string }>(
        '/api/payments/campay/collect',
        {
          method: 'POST',
          body: JSON.stringify({
            amountXAF: totalAmountXAF,
            phone: cleanPhone,
            description: `Crippo: ${race.title} (${shares} shares)`,
            externalReference: paymentId,
          }),
        }
      );

      await setDoc(doc(db, 'payments', paymentId), {
        id: paymentId,
        uid: user.uid,
        type: 'SHARE_PURCHASE',
        reference: resp.reference,
        amountXAF: totalAmountXAF,
        provider: method,
        status: 'PENDING',
        raceId: race.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setStatusMsg(
        lang === 'fr'
          ? `Validez le code USSD ${resp.ussd_code || '*126#'} sur votre téléphone (${resp.reference}). Attente confirmation...`
          : `Confirm the USSD prompt ${resp.ussd_code || '*126#'} on your phone (${resp.reference}). Checking settlement...`
      );

      let settled = false;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const check = await apiFetch<{ status: string }>(
          `/api/payments/campay/status/${encodeURIComponent(resp.reference)}`
        );
        if (check.status === 'SUCCESSFUL') {
          settled = true;
          break;
        }
        if (check.status === 'FAILED') {
          await updateDoc(doc(db, 'payments', paymentId), {
            status: 'FAILED',
            updatedAt: serverTimestamp(),
          });
          throw new Error('Mobile Money payment was declined or cancelled.');
        }
      }

      if (!settled) {
        throw new Error(
          'CamPay prompt timed out waiting for PIN confirmation. Check your MoMo notifications and try again.'
        );
      }

      await updateDoc(doc(db, 'payments', paymentId), {
        status: 'SUCCESSFUL',
        updatedAt: serverTimestamp(),
      });

      await finalizeShareAllocation(resp.reference);
    } catch (err: unknown) {
      const e = err as Error & { missingKeys?: string[] };
      if (e.missingKeys?.length) onOpenApiSetup();
      setErrorMsg(e.message || 'Transaction failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCardSettlement = async () => {
    if (!cardLinkData) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const check = await apiFetch<{ status: string }>(
        `/api/payments/campay/status/${encodeURIComponent(cardLinkData.reference)}`
      );
      if (check.status === 'SUCCESSFUL') {
        await updateDoc(doc(db, 'payments', cardLinkData.paymentId), {
          status: 'SUCCESSFUL',
          updatedAt: serverTimestamp(),
        });
        await finalizeShareAllocation(cardLinkData.reference);
        return;
      }
      if (check.status === 'FAILED') {
        await updateDoc(doc(db, 'payments', cardLinkData.paymentId), {
          status: 'FAILED',
          updatedAt: serverTimestamp(),
        });
        setCardLinkData(null);
        setErrorMsg('Card transaction failed or was cancelled.');
        return;
      }
      setStatusMsg('Still awaiting Card confirmation on CamPay...');
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-surface-container-lowest dark:border dark:border-outline-variant rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 flex flex-col gap-4 pb-safe max-h-[92vh] overflow-y-auto">
        <div className="w-12 h-1.5 rounded-full bg-outline-variant mx-auto sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center">
              <span className="material-symbols-outlined text-secondary text-[20px]">phonelink_ring</span>
            </div>
            <div>
              <span className="font-label-xs uppercase tracking-wider text-secondary block">
                {lang === 'fr' ? 'Allocation Instantanée' : 'Instant Raise Allocation'}
              </span>
              <h3 className="font-headline-sm text-on-surface">{race.title}</h3>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Asset Summary Ribbon */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low">
          <div className="flex items-center gap-1.5 text-on-tertiary-container font-label-xs">
            <span className="material-symbols-outlined text-[15px]">verified</span>
            <span>Score: {race.crippoScore}/100 Underwritten</span>
          </div>
          <span className="font-ticker-val text-secondary">
            {unitPrice.toLocaleString()} XAF / share
          </span>
        </div>

        {/* Unit Stepper */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="font-body-md text-on-surface font-medium">Quantity of Shares</label>
            <span className="font-label-xs text-on-surface-variant">
              Max: {maxAvailable.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between bg-surface-container-low p-2 rounded-xl">
            <button
              type="button"
              onClick={() => setShares((s) => Math.max(1, s - 1))}
              className="w-11 h-11 rounded-lg bg-surface-container-lowest shadow-sm flex items-center justify-center text-on-surface text-lg font-bold"
            >
              -
            </button>
            <div className="flex items-baseline gap-1.5">
              <input
                type="number"
                min={1}
                max={maxAvailable}
                value={shares}
                onChange={(e) =>
                  setShares(Math.max(1, Math.min(maxAvailable, Number(e.target.value) || 1)))
                }
                className="w-20 text-center bg-transparent font-display-lg-mobile text-on-surface focus:outline-none"
              />
              <span className="font-label-xs text-on-surface-variant uppercase">Shares</span>
            </div>
            <button
              type="button"
              onClick={() => setShares((s) => Math.min(maxAvailable, s + 1))}
              className="w-11 h-11 rounded-lg bg-surface-container-lowest shadow-sm flex items-center justify-center text-on-surface text-lg font-bold"
            >
              +
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[1, 5, 10, 25].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setShares(Math.min(maxAvailable, preset))}
                className={`py-1.5 rounded-lg font-label-xs transition-colors ${
                  shares === preset
                    ? 'bg-secondary text-on-secondary'
                    : 'bg-surface-container text-on-surface hover:bg-secondary-fixed'
                }`}
              >
                {preset} SHS
              </button>
            ))}
          </div>
        </div>

        {/* Settlement Method Select */}
        <div className="flex flex-col gap-2">
          <span className="font-label-xs uppercase text-on-surface-variant">
            Select Settlement Method
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => {
                setMethod('MTN');
                setCardLinkData(null);
              }}
              className={`p-2.5 rounded-xl flex flex-col gap-1 text-left transition-colors ${
                method === 'MTN' ? 'bg-secondary-fixed ring-1 ring-secondary' : 'bg-surface-container-low'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-[#fcd116]" />
              <span className="font-label-xs text-on-surface font-bold">MTN MoMo</span>
              <span className="text-[10px] text-on-surface-variant">*126# Push</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMethod('ORANGE');
                setCardLinkData(null);
              }}
              className={`p-2.5 rounded-xl flex flex-col gap-1 text-left transition-colors ${
                method === 'ORANGE' ? 'bg-secondary-fixed ring-1 ring-secondary' : 'bg-surface-container-low'
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-[#ff7900]" />
              <span className="font-label-xs text-on-surface font-bold">Orange Money</span>
              <span className="text-[10px] text-on-surface-variant">#150# USSD</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMethod('CARD');
                setCardLinkData(null);
              }}
              className={`p-2.5 rounded-xl flex flex-col gap-1 text-left transition-colors ${
                method === 'CARD' ? 'bg-secondary-fixed ring-1 ring-secondary' : 'bg-surface-container-low'
              }`}
            >
              <span className="material-symbols-outlined text-[15px] text-secondary">credit_card</span>
              <span className="font-label-xs text-on-surface font-bold">Bank Card</span>
              <span className="text-[10px] text-on-surface-variant">Visa / MC</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMethod('WALLET');
                setCardLinkData(null);
              }}
              className={`p-2.5 rounded-xl flex flex-col gap-1 text-left transition-colors ${
                method === 'WALLET' ? 'bg-secondary-fixed ring-1 ring-secondary' : 'bg-surface-container-low'
              }`}
            >
              <span className="material-symbols-outlined text-[15px] text-on-tertiary-container">
                account_balance_wallet
              </span>
              <span className="font-label-xs text-on-surface font-bold">Wallet</span>
              <span className="text-[10px] text-on-surface-variant tabular-nums">
                {walletBalance.toLocaleString()} XAF
              </span>
            </button>
          </div>
        </div>

        {/* Phone Number Input (for MoMo / Orange) */}
        {(method === 'MTN' || method === 'ORANGE') && (
          <div className="flex flex-col gap-1">
            <label className="font-label-xs uppercase text-on-surface-variant">
              Account Mobile Number (+237)
            </label>
            <div className="flex items-center bg-surface-container-low rounded-xl px-3 py-2.5 border border-outline-variant/40">
              <span className="font-label-md text-on-surface-variant mr-2">+</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="237677821940"
                className="w-full bg-transparent text-on-surface font-ticker-val outline-none tracking-wider"
              />
              <span className="font-label-xs px-2 py-0.5 rounded bg-surface-container text-secondary shrink-0">
                {method}
              </span>
            </div>
          </div>
        )}

        {cardLinkData && (
          <div className="p-3.5 rounded-xl bg-secondary-fixed/30 border border-secondary/40 flex flex-col gap-2.5">
            <a
              href={cardLinkData.link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 rounded-xl bg-secondary text-white font-label-xs uppercase font-bold text-center"
            >
              Open Secure CamPay Card Checkout ↗
            </a>
            <button
              type="button"
              disabled={submitting}
              onClick={handleVerifyCardSettlement}
              className="w-full py-2.5 px-4 rounded-xl bg-on-tertiary-container text-white font-label-xs uppercase font-bold disabled:opacity-60"
            >
              Verify Card Settlement &amp; Allocate Shares
            </button>
          </div>
        )}

        {statusMsg && (
          <div className="p-3 rounded-xl bg-secondary-fixed/50 text-on-surface font-body-sm">
            {statusMsg}
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-error-container text-on-error-container font-body-sm">
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Total & Execution Button */}
        <div className="pt-1 flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="font-label-xs uppercase text-on-surface-variant">Total Payable</span>
            <span className="font-headline-lg-mobile text-on-surface font-bold tabular-nums">
              {totalAmountXAF.toLocaleString()}{' '}
              <span className="font-label-xs text-on-surface-variant">FCFA</span>
            </span>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className="w-full py-3.5 rounded-xl bg-on-tertiary-container text-on-primary font-headline-sm text-[14px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[20px]">
              {submitting ? 'hourglass_top' : 'touch_app'}
            </span>
            <span>
              {submitting
                ? 'Processing...'
                : method === 'WALLET'
                ? 'Pay Instantly from Wallet'
                : method === 'CARD'
                ? 'Proceed to Card Checkout'
                : lang === 'fr'
                ? 'Confirmer Paiement USSD'
                : 'Authorize Instant Settlement'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
