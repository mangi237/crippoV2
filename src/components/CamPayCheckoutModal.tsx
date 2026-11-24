import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { apiFetch } from '../services/api';
import { useAuth, detectMomoProvider } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import type { Race, PredictionMarket } from '../types/crippo';

interface CamPayCheckoutModalProps {
  mode: 'race' | 'prediction';
  race?: Race;
  prediction?: PredictionMarket;
  predictionSide?: 'YES' | 'NO';
  initialShares?: number;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onOpenApiSetup: () => void;
}

export function CamPayCheckoutModal({
  mode,
  race,
  prediction,
  predictionSide = 'YES',
  initialShares = 2,
  onClose,
  onSuccess,
  onOpenApiSetup,
}: CamPayCheckoutModalProps) {
  const { user, profile, privateInfo } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const unitPrice =
    mode === 'race' && race
      ? race.currentSharePriceXAF
      : mode === 'prediction' && prediction
      ? predictionSide === 'YES'
        ? prediction.yesPriceXAF
        : prediction.noPriceXAF
      : 5000;

  const minShares = mode === 'prediction' ? 10 : 1;
  const [shares, setShares] = useState<number>(Math.max(minShares, initialShares));
  const [phone, setPhone] = useState<string>(privateInfo?.phone || '2376');
  const [carrier, setCarrier] = useState<'MTN' | 'ORANGE'>(
    privateInfo?.momoProvider === 'ORANGE' ? 'ORANGE' : 'MTN'
  );
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    const detected = detectMomoProvider(phone);
    if (detected === 'MTN' || detected === 'ORANGE') {
      setCarrier(detected);
    }
  }, [phone]);

  const totalAmountXAF = Math.round(shares * unitPrice);
  const maxAvailable =
    mode === 'race' && race
      ? Math.max(1, race.totalShares - race.sharesSold)
      : 500;

  const targetTitle =
    mode === 'race' && race
      ? race.title
      : mode === 'prediction' && prediction
      ? `${prediction.entityName} (${predictionSide})`
      : 'Crippo Allocation';

  const isRaceWindowClosed = Boolean(
    mode === 'race' &&
      race &&
      (race.status !== 'open' || Date.now() >= new Date(race.raceCloseDate).getTime())
  );

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

    const cleanPhone = phone.replace(/\D/g, '');
    if (!/^2376[0-9]{8}$/.test(cleanPhone)) {
      setErrorMsg(
        lang === 'fr'
          ? 'Numéro Cameroun requis au format 2376XXXXXXXX.'
          : 'Valid Cameroon number required (2376XXXXXXXX).'
      );
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
    setStatusMsg(
      lang === 'fr'
        ? 'Envoi du prompt USSD CamPay en cours...'
        : 'Initiating CamPay USSD push...'
    );

    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      const resp = await apiFetch<{ reference: string; ussd_code?: string; operator?: string }>(
        '/api/payments/campay/collect',
        {
          method: 'POST',
          body: JSON.stringify({
            amountXAF: totalAmountXAF,
            phone: cleanPhone,
            description: `Crippo: ${targetTitle} (${shares} units)`,
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
        provider: carrier,
        status: 'PENDING',
        ...(race ? { raceId: race.id } : {}),
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

      if (mode === 'race' && race) {
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
            paymentReference: resp.reference,
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
      } else if (mode === 'prediction' && prediction) {
        const nextYes = prediction.yesVotes + (predictionSide === 'YES' ? shares : 0);
        const nextNo = prediction.noVotes + (predictionSide === 'NO' ? shares : 0);
        const totalV = Math.max(1, nextYes + nextNo);
        const nextYesPrice = Math.max(5, Math.min(95, Math.round((nextYes / totalV) * 100)));
        const nextNoPrice = 100 - nextYesPrice;

        await updateDoc(doc(db, 'predictions', prediction.id), {
          yesVotes: nextYes,
          noVotes: nextNo,
          yesPriceXAF: nextYesPrice,
          noPriceXAF: nextNoPrice,
          totalVolumeXAF: increment(totalAmountXAF),
        });

        onSuccess(
          lang === 'fr'
            ? `Vote ${predictionSide} validé (${totalAmountXAF.toLocaleString()} FCFA)`
            : `${predictionSide} position locked (${totalAmountXAF.toLocaleString()} FCFA)`
        );
      }

      onClose();
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMsg(e.message || 'Transaction failed.');
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
      <div className="w-full max-w-lg bg-surface-container-lowest dark:border dark:border-outline-variant rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 flex flex-col gap-4 pb-safe">
        <div className="w-12 h-1.5 rounded-full bg-outline-variant mx-auto sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center">
              <span className="material-symbols-outlined text-secondary text-[20px]">phonelink_ring</span>
            </div>
            <div>
              <span className="font-label-xs uppercase tracking-wider text-secondary block">
                {mode === 'prediction'
                  ? `Predict: ${predictionSide} Position`
                  : lang === 'fr'
                  ? 'Allocation Instantanée'
                  : 'Instant Race Allocation'}
              </span>
              <h3 className="font-headline-sm text-on-surface">{targetTitle}</h3>
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
            <span>
              {race
                ? `Score: ${race.crippoScore}/100 Underwritten`
                : 'CamPay Escrow Guaranteed'}
            </span>
          </div>
          <span className="font-ticker-val text-secondary">
            {unitPrice.toLocaleString()} XAF / {mode === 'prediction' ? 'contract' : 'share'}
          </span>
        </div>

        {/* Unit Stepper */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="font-body-md text-on-surface font-medium">
              {mode === 'prediction' ? 'Contracts (min 10)' : 'Quantity of Shares'}
            </label>
            <span className="font-label-xs text-on-surface-variant">
              Max: {maxAvailable.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between bg-surface-container-low p-2 rounded-xl">
            <button
              type="button"
              onClick={() => setShares((s) => Math.max(minShares, s - (mode === 'prediction' ? 5 : 1)))}
              className="w-11 h-11 rounded-lg bg-surface-container-lowest shadow-sm flex items-center justify-center text-on-surface text-lg font-bold"
            >
              -
            </button>
            <div className="flex items-baseline gap-1.5">
              <input
                type="number"
                min={minShares}
                max={maxAvailable}
                value={shares}
                onChange={(e) =>
                  setShares(Math.max(minShares, Math.min(maxAvailable, Number(e.target.value) || minShares)))
                }
                className="w-20 text-center bg-transparent font-display-lg-mobile text-on-surface focus:outline-none"
              />
              <span className="font-label-xs text-on-surface-variant uppercase">
                {mode === 'prediction' ? 'Units' : 'Shares'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShares((s) => Math.min(maxAvailable, s + (mode === 'prediction' ? 5 : 1)))}
              className="w-11 h-11 rounded-lg bg-surface-container-lowest shadow-sm flex items-center justify-center text-on-surface text-lg font-bold"
            >
              +
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(mode === 'prediction' ? [10, 25, 50, 100] : [1, 5, 10, 25]).map((preset) => (
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
                {preset} {mode === 'prediction' ? 'CTS' : 'SHS'}
              </button>
            ))}
          </div>
        </div>

        {/* Carrier Select */}
        <div className="flex flex-col gap-2">
          <span className="font-label-xs uppercase text-on-surface-variant">
            Select Direct Settlement Wallet
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCarrier('MTN')}
              className={`p-3 rounded-xl flex items-center gap-2.5 text-left transition-colors ${
                carrier === 'MTN'
                  ? 'bg-secondary-fixed ring-1 ring-secondary'
                  : 'bg-surface-container-low'
              }`}
            >
              <span className="w-3.5 h-3.5 rounded-full bg-[#fcd116] shrink-0" />
              <div className="flex flex-col">
                <span className="font-label-md text-on-surface font-bold">MTN MoMo</span>
                <span className="text-[10px] text-on-surface-variant">*126# Instant Push</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setCarrier('ORANGE')}
              className={`p-3 rounded-xl flex items-center gap-2.5 text-left transition-colors ${
                carrier === 'ORANGE'
                  ? 'bg-secondary-fixed ring-1 ring-secondary'
                  : 'bg-surface-container-low'
              }`}
            >
              <span className="w-3.5 h-3.5 rounded-full bg-[#ff7900] shrink-0" />
              <div className="flex flex-col">
                <span className="font-label-md text-on-surface font-bold">Orange Money</span>
                <span className="text-[10px] text-on-surface-variant">#150# USSD Auth</span>
              </div>
            </button>
          </div>
        </div>

        {/* Phone Number Input */}
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
              {carrier}
            </span>
          </div>
        </div>

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
            <span className="font-headline-lg-mobile text-on-surface font-bold">
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
                ? lang === 'fr'
                  ? 'Envoi CamPay...'
                  : 'Initiating CamPay Push...'
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
