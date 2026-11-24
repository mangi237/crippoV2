import { Type } from '@google/genai';
import { getGeminiClient, CRIPPO_GEMINI_MODEL } from '../lib/gemini.ts';
import { initiateCamPayWithdraw, isCamPayConfigured } from '../payments/campay.ts';

export interface DividendHolderInput {
  uid: string;
  anonymousId: string;
  sharesHeld: number;
  momoPhone?: string;
}

export interface DividendClearingInput {
  raceId: string;
  raceTitle: string;
  periodLabel: string;
  grossRevenueAmount: number;
  currency: 'USD' | 'EUR' | 'XAF';
  revSharePct: number;
  totalShares: number;
  holders: DividendHolderInput[];
  dispatchCamPay?: boolean;
}

export interface ShareholderAllocation {
  uid: string;
  anonymousId: string;
  sharesHeld: number;
  ownershipPct: number;
  payoutAmountXAF: number;
  momoReference?: string;
  disbursementStatus: 'disbursed' | 'pending';
  error?: string;
}

export interface DividendClearingResult {
  grossXAF: number;
  fxRateToXAF: number;
  platformClearingFeeXAF: number;
  investorPoolXAF: number;
  creatorNetRetainedXAF: number;
  allocations: ShareholderAllocation[];
  clearingNote: string;
  campayDispatchedCount: number;
}

const FX_TO_XAF: Record<'USD' | 'EUR' | 'XAF', number> = {
  USD: 610,
  EUR: 655.957,
  XAF: 1,
};

export async function runDividendClearing(input: DividendClearingInput): Promise<DividendClearingResult> {
  const fxRateToXAF = FX_TO_XAF[input.currency] || 1;
  const grossXAF = Math.round(Math.max(0, input.grossRevenueAmount) * fxRateToXAF);
  const platformClearingFeeXAF = Math.round(grossXAF * 0.03);
  const distributableGrossXAF = Math.max(0, grossXAF - platformClearingFeeXAF);
  const investorPoolXAF = Math.floor(distributableGrossXAF * (input.revSharePct / 100));
  const creatorNetRetainedXAF = Math.max(0, distributableGrossXAF - investorPoolXAF);

  const shareDenominator = Math.max(
    1,
    input.totalShares,
    input.holders.reduce((sum, h) => sum + Math.max(0, h.sharesHeld), 0)
  );

  const ai = getGeminiClient();
  const prompt = `You are Crippo's Automated Dividend Clearing Agent auditing a royalty disbursement statement.
Produce a crisp 2-sentence institutional clearing note summarizing this FX conversion and waterfall:
- Race: ${input.raceTitle} (${input.periodLabel})
- Gross Reported Revenue: ${input.grossRevenueAmount} ${input.currency} @ ${fxRateToXAF} = ${grossXAF.toLocaleString()} XAF
- Platform Clearing Fee (3%): ${platformClearingFeeXAF.toLocaleString()} XAF
- Investor Royalty Pool (${input.revSharePct}%): ${investorPoolXAF.toLocaleString()} XAF across ${input.holders.length} shareholders
- Creator Retained Pool: ${creatorNetRetainedXAF.toLocaleString()} XAF`;

  const response = await ai.models.generateContent({
    model: CRIPPO_GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          clearingNote: { type: Type.STRING },
        },
        required: ['clearingNote'],
      },
    },
  });

  const parsed = JSON.parse((response.text || '{}').trim()) as { clearingNote?: string };

  const allocations: ShareholderAllocation[] = [];
  let campayDispatchedCount = 0;
  const canWithdraw = Boolean(input.dispatchCamPay && isCamPayConfigured());

  for (const holder of input.holders) {
    if (holder.sharesHeld <= 0) continue;
    const ratio = holder.sharesHeld / shareDenominator;
    const payoutAmountXAF = Math.floor(investorPoolXAF * ratio);
    const ownershipPct = Number((ratio * 100).toFixed(2));

    let momoReference: string | undefined;
    let disbursementStatus: 'disbursed' | 'pending' = 'pending';
    let error: string | undefined;

    if (canWithdraw && payoutAmountXAF >= 100 && holder.momoPhone && /^2376\d{8}$/.test(holder.momoPhone)) {
      try {
        const res = await initiateCamPayWithdraw({
          amountXAF: payoutAmountXAF,
          phone: holder.momoPhone,
          description: `Crippo Royalty: ${input.raceTitle} (${input.periodLabel})`,
          externalReference: `div_${input.raceId}_${holder.uid.slice(0, 8)}_${Date.now()}`,
        });
        momoReference = res.reference;
        disbursementStatus = 'disbursed';
        campayDispatchedCount++;
      } catch (err) {
        error = err instanceof Error ? err.message : 'CamPay withdraw failed';
      }
    }

    allocations.push({
      uid: holder.uid,
      anonymousId: holder.anonymousId,
      sharesHeld: holder.sharesHeld,
      ownershipPct,
      payoutAmountXAF,
      ...(momoReference ? { momoReference } : {}),
      disbursementStatus,
      ...(error ? { error } : {}),
    });
  }

  return {
    grossXAF,
    fxRateToXAF,
    platformClearingFeeXAF,
    investorPoolXAF,
    creatorNetRetainedXAF,
    allocations,
    clearingNote:
      String(
        parsed.clearingNote ||
          `Cleared ${investorPoolXAF.toLocaleString()} XAF (${input.revSharePct}%) to ${allocations.length} holders.`
      ).slice(0, 400),
    campayDispatchedCount,
  };
}
