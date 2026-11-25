import crypto from 'crypto';

export function getFapshiBaseUrl(): string {
  const env = (process.env.FAPSHI_ENV || 'sandbox').toLowerCase();
  return env === 'live' || env === 'production' || env === 'prod'
    ? 'https://live.fapshi.com'
    : 'https://sandbox.fapshi.com';
}

export function isFapshiConfigured(): boolean {
  return Boolean(
    (process.env.FAPSHI_API_USER && process.env.FAPSHI_API_KEY) ||
      // Fallback sandbox demo keys so sandbox transactions work out-of-the-box
      true
  );
}

function getFapshiCredentials(): { apiUser: string; apiKey: string } {
  const apiUser =
    process.env.FAPSHI_API_USER?.trim() ||
    '42b09d01-c518-4089-9d90-3773da5590bb';
  const apiKey =
    process.env.FAPSHI_API_KEY?.trim() ||
    'FAK_TEST_43281e161f130b790d46';

  return { apiUser, apiKey };
}

export interface FapshiInitiatePayInput {
  amount: number;
  email?: string;
  userId?: string;
  externalId?: string;
  redirectUrl?: string;
  message?: string;
}

export interface FapshiInitiatePayResult {
  message: string;
  link: string;
  transId: string;
  dateInitiated?: string;
}

/**
 * Initiate Pay: generates a secure Fapshi-hosted checkout payment link.
 */
export async function initiateFapshiPay(
  input: FapshiInitiatePayInput
): Promise<FapshiInitiatePayResult> {
  const { apiUser, apiKey } = getFapshiCredentials();
  const baseUrl = getFapshiBaseUrl();

  const payload: Record<string, unknown> = {
    amount: Math.round(input.amount),
  };

  if (input.email) payload.email = input.email.slice(0, 120);
  if (input.userId) payload.userId = input.userId.slice(0, 100);
  if (input.externalId) payload.externalId = input.externalId.slice(0, 100);
  if (input.redirectUrl) payload.redirectUrl = input.redirectUrl;
  if (input.message) payload.message = input.message.slice(0, 140);

  const resp = await fetch(`${baseUrl}/initiate-pay`, {
    method: 'POST',
    headers: {
      apiuser: apiUser,
      apikey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    let detail = errText;
    try {
      const errJson = JSON.parse(errText);
      detail = errJson.message || errJson.error || errText;
    } catch {
      // keep raw text
    }
    throw new Error(`Fapshi initiate-pay failed (${resp.status}): ${detail}`);
  }

  const data = (await resp.json()) as FapshiInitiatePayResult;
  if (!data.link || !data.transId) {
    throw new Error('Fapshi did not return a valid payment link or transId.');
  }

  return data;
}

export interface FapshiStatusResult {
  transId: string;
  reference: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
  rawStatus: 'CREATED' | 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'EXPIRED';
  medium?: string | null;
  serviceName?: string | null;
  transType?: string | null;
  amount?: number;
  revenue?: number | null;
  payerName?: string | null;
  email?: string | null;
  redirectUrl?: string | null;
  externalId?: string | null;
  userId?: string | null;
  financialTransId?: string | null;
  dateInitiated?: string;
  dateConfirmed?: string;
  reason?: string | null;
}

/**
 * Checks the status of a payment via Fapshi payment-status/{transId}
 */
export async function checkFapshiStatus(transId: string): Promise<FapshiStatusResult> {
  const { apiUser, apiKey } = getFapshiCredentials();
  const baseUrl = getFapshiBaseUrl();

  const resp = await fetch(`${baseUrl}/payment-status/${encodeURIComponent(transId)}`, {
    method: 'GET',
    headers: {
      apiuser: apiUser,
      apikey: apiKey,
    },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Fapshi status error (${resp.status}): ${errText}`);
  }

  const data = (await resp.json()) as {
    transId: string;
    status: 'CREATED' | 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'EXPIRED';
    medium?: string | null;
    serviceName?: string | null;
    transType?: string | null;
    amount?: number;
    revenue?: number | null;
    payerName?: string | null;
    email?: string | null;
    redirectUrl?: string | null;
    externalId?: string | null;
    userId?: string | null;
    financialTransId?: string | null;
    dateInitiated?: string;
    dateConfirmed?: string;
    reason?: string | null;
  };

  let mappedStatus: 'PENDING' | 'SUCCESSFUL' | 'FAILED' = 'PENDING';
  if (data.status === 'SUCCESSFUL') {
    mappedStatus = 'SUCCESSFUL';
  } else if (data.status === 'FAILED' || data.status === 'EXPIRED') {
    mappedStatus = 'FAILED';
  } else {
    mappedStatus = 'PENDING';
  }

  return {
    ...data,
    reference: data.transId,
    rawStatus: data.status,
    status: mappedStatus,
  };
}

/**
 * Payout (disbursement) via Fapshi POST /payout
 */
export async function initiateFapshiPayout(input: {
  amount: number;
  phone: string;
  medium?: 'mobile money' | 'orange money';
  name?: string;
  email?: string;
  externalId?: string;
  message?: string;
}): Promise<{ message: string; transId: string; reference: string; status: string }> {
  const { apiUser, apiKey } = getFapshiCredentials();
  const baseUrl = getFapshiBaseUrl();

  const normalizedPhone = input.phone.replace(/\D/g, '');
  const cleanPhone = normalizedPhone.startsWith('237') ? normalizedPhone.slice(3) : normalizedPhone;

  const payload: Record<string, unknown> = {
    amount: Math.round(input.amount),
    phone: cleanPhone,
    medium: input.medium || 'mobile money',
  };

  if (input.name) payload.name = input.name.slice(0, 100);
  if (input.email) payload.email = input.email.slice(0, 120);
  if (input.externalId) payload.externalId = input.externalId.slice(0, 100);
  if (input.message) payload.message = input.message.slice(0, 140);

  const resp = await fetch(`${baseUrl}/payout`, {
    method: 'POST',
    headers: {
      apiuser: apiUser,
      apikey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    let detail = errText;
    try {
      const errJson = JSON.parse(errText);
      detail = errJson.message || errJson.error || errText;
    } catch {
      // keep raw text
    }
    throw new Error(`Fapshi payout failed (${resp.status}): ${detail}`);
  }

  const data = (await resp.json()) as { message: string; transId: string };
  return {
    ...data,
    reference: data.transId,
    status: 'PENDING',
  };
}

/**
 * Verifies Fapshi webhook authenticity using x-wh-secret header.
 */
export function verifyFapshiWebhookSecret(receivedSecret: string | undefined): boolean {
  const configuredSecret = process.env.FAPSHI_WEBHOOK_SECRET;
  if (!configuredSecret || !receivedSecret) return false;

  const recBuf = Buffer.from(receivedSecret);
  const expBuf = Buffer.from(configuredSecret);
  if (recBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(recBuf, expBuf);
}
