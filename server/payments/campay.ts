import crypto from 'crypto';
import {
  initiateFapshiPay,
  checkFapshiStatus,
  initiateFapshiPayout,
  isFapshiConfigured,
} from './fapshi';

function getCamPayBaseUrl(): string {
  const env = (process.env.CAMPAY_ENV || 'demo').toLowerCase();
  return env === 'production' || env === 'prod'
    ? 'https://www.campay.net/api'
    : 'https://demo.campay.net/api';
}

export function isCamPayConfigured(): boolean {
  return isFapshiConfigured() || Boolean(
    process.env.CAMPAY_PERMANENT_TOKEN ||
      (process.env.CAMPAY_APP_USERNAME && process.env.CAMPAY_APP_PASSWORD)
  );
}

export interface CamPayCollectInput {
  amountXAF: number;
  phone: string;
  description: string;
  externalReference: string;
  email?: string;
  userId?: string;
  redirectUrl?: string;
}

export interface CamPayCollectResult {
  reference: string;
  ussd_code?: string;
  operator?: string;
  status: string;
  link?: string;
}

/**
 * Initiates payment using Fapshi's Initiate Pay (hosted checkout link).
 * Direct pay is not used.
 */
export async function initiateCamPayCollect(input: CamPayCollectInput): Promise<CamPayCollectResult> {
  const res = await initiateFapshiPay({
    amount: input.amountXAF,
    email: input.email,
    userId: input.userId,
    externalId: input.externalReference,
    redirectUrl: input.redirectUrl,
    message: input.description,
  });

  return {
    reference: res.transId,
    status: 'CREATED',
    link: res.link,
  };
}

export interface CamPayStatusResult {
  reference: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
  amount?: string;
  currency?: string;
  operator?: string;
  external_reference?: string;
}

export async function checkCamPayStatus(reference: string): Promise<CamPayStatusResult> {
  const fapshiRes = await checkFapshiStatus(reference);

  let mappedStatus: 'PENDING' | 'SUCCESSFUL' | 'FAILED' = 'PENDING';
  if (fapshiRes.status === 'SUCCESSFUL') {
    mappedStatus = 'SUCCESSFUL';
  } else if (fapshiRes.status === 'FAILED' || fapshiRes.status === 'EXPIRED') {
    mappedStatus = 'FAILED';
  } else {
    mappedStatus = 'PENDING';
  }

  return {
    reference: fapshiRes.transId,
    status: mappedStatus,
    amount: fapshiRes.amount != null ? String(fapshiRes.amount) : undefined,
    currency: 'XAF',
    operator: fapshiRes.medium || undefined,
    external_reference: fapshiRes.externalId || undefined,
  };
}

export async function initiateCamPayWithdraw(input: {
  amountXAF: number;
  phone: string;
  description: string;
  externalReference: string;
}): Promise<{ reference: string; status: string }> {
  const res = await initiateFapshiPayout({
    amount: input.amountXAF,
    phone: input.phone,
    externalId: input.externalReference,
    message: input.description,
  });

  return {
    reference: res.transId,
    status: 'PENDING',
  };
}

export async function initiateCamPayPaymentLink(input: {
  amountXAF: number;
  phone?: string;
  description: string;
  externalReference: string;
  redirectUrl: string;
  failureRedirectUrl?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  paymentOptions?: 'MOMO' | 'CARD' | 'MOMO,CARD';
}): Promise<{ link: string; reference: string }> {
  const res = await initiateFapshiPay({
    amount: input.amountXAF,
    email: input.email,
    externalId: input.externalReference,
    redirectUrl: input.redirectUrl,
    message: input.description,
  });

  return { link: res.link, reference: res.transId };
}

export function verifyCamPayWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  const webhookKey = process.env.FAPSHI_WEBHOOK_SECRET || process.env.CAMPAY_WEBHOOK_KEY;
  if (!webhookKey || !signatureHeader) return false;

  // Supports both Fapshi x-wh-secret direct token comparison and HMAC
  if (signatureHeader === webhookKey) {
    return true;
  }

  const expected = crypto
    .createHmac('sha256', webhookKey)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(signatureHeader);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}
