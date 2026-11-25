import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import bundledFirebaseConfig from '../../firebase-applet-config.json';

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
}

function getFirebaseApiKey(): string | null {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (raw?.apiKey) return raw.apiKey;
    }
  } catch {
    // Fall back to bundled config below
  }
  return (bundledFirebaseConfig as { apiKey?: string })?.apiKey || process.env.FIREBASE_API_KEY || null;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  const apiKey = getFirebaseApiKey();
  if (!apiKey || !idToken) return null;

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!response.ok) return null;
  const data = (await response.json()) as {
    users?: Array<{
      localId: string;
      email?: string;
      emailVerified?: boolean;
      displayName?: string;
    }>;
  };
  const user = data.users?.[0];
  if (!user?.localId) return null;

  return {
    uid: user.localId,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    displayName: user.displayName,
  };
}

export interface AuthenticatedRequest<
  P = Record<string, any>,
  ResBody = any,
  ReqBody = any,
  ReqQuery = Record<string, any>
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  firebaseUser?: VerifiedFirebaseUser;
  body: ReqBody;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Empty Bearer token.' });
    return;
  }

  try {
    const verified = await verifyFirebaseIdToken(token);
    if (!verified) {
      res.status(401).json({ error: 'Invalid or expired Firebase authentication token.' });
      return;
    }
    req.firebaseUser = verified;
    next();
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Auth verification error' });
  }
}
