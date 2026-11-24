import crypto from 'crypto';

function getCamPayBaseUrl(): string {
  const env = (process.env.CAMPAY_ENV || 'demo').toLowerCase();
  return env === 'production' || env === 'prod'
    ? 'https://www.campay.net/api'
    : 'https://demo.campay.net/api';
}

export function isCamPayConfigured(): boolean {
  return Boolean(process.env.CAMPAY_APP_USERNAME && process.env.CAMPAY_APP_PASSWORD);
}

async function getCamPayAccessToken(): Promise<string> {
  const username = process.env.CAMPAY_APP_USERNAME;
  const password = process.env.CAMPAY_APP_PASSWORD;

  if (!username || !password) {
    throw new Error('CAMPAY_NOT_CONFIGURED: Set CAMPAY_APP_USERNAME and CAMPAY_APP_PASSWORD in your environment secrets.');
  }

  const baseUrl = getCamPayBaseUrl();
  const resp = await fetch(`${baseUrl}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`CamPay token error (${resp.status}): ${errText}`);
  }

  const data = (await resp.json()) as { token?: string };
  if (!data.token) {
    throw new Error('CamPay did not return an access token.');
  }
  return data.token;
}

export interface CamPayCollectInput {
  amountXAF: number;
  phone: string;
  description: string;
  externalReference: string;
}

export interface CamPayCollectResult {
  reference: string;
  ussd_code?: string;
  operator?: string;
  status: string;
}

export async function initiateCamPayCollect(input: CamPayCollectInput): Promise<CamPayCollectResult> {
  const token = await getCamPayAccessToken();
  const baseUrl = getCamPayBaseUrl();

  const normalizedPhone = input.phone.replace(/\D/g, '');
  const resp = await fetch(`${baseUrl}/collect/`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: String(Math.round(input.amountXAF)),
      currency: 'XAF',
      from: normalizedPhone,
      description: input.description.slice(0, 140),
      external_reference: input.externalReference,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`CamPay collect error (${resp.status}): ${errText}`);
  }

  const data = (await resp.json()) as CamPayCollectResult;
  return {
    reference: data.reference,
    ussd_code: data.ussd_code,
    operator: data.operator,
    status: data.status || 'PENDING',
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
  const token = await getCamPayAccessToken();
  const baseUrl = getCamPayBaseUrl();

  const resp = await fetch(`${baseUrl}/transaction/${encodeURIComponent(reference)}/`, {
    method: 'GET',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`CamPay status error (${resp.status}): ${errText}`);
  }

  const data = (await resp.json()) as CamPayStatusResult;
  return data;
}

export async function initiateCamPayWithdraw(input: {
  amountXAF: number;
  phone: string;
  description: string;
  externalReference: string;
}): Promise<{ reference: string; status: string }> {
  const token = await getCamPayAccessToken();
  const baseUrl = getCamPayBaseUrl();

  const normalizedPhone = input.phone.replace(/\D/g, '');
  const resp = await fetch(`${baseUrl}/withdraw/`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: String(Math.round(input.amountXAF)),
      to: normalizedPhone,
      description: input.description.slice(0, 140),
      external_reference: input.externalReference,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`CamPay withdraw error (${resp.status}): ${errText}`);
  }

  return (await resp.json()) as { reference: string; status: string };
}

export function verifyCamPayWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  const webhookKey = process.env.CAMPAY_WEBHOOK_KEY;
  if (!webhookKey || !signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', webhookKey)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(signatureHeader);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}
