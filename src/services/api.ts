import { auth } from './firebase';

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (user) {
    const token = await user.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  }

  const resp = await fetch(url, {
    ...options,
    headers,
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error || `Request failed (${resp.status})`) as Error & {
      missingKeys?: string[];
      status?: number;
    };
    err.missingKeys = data.missingKeys;
    err.status = resp.status;
    throw err;
  }
  return data as T;
}
