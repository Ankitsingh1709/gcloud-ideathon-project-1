import { auth } from './firebase';

/**
 * Single place where an authenticated call to our Express proxy is built.
 * Every /api/* request goes through here so the Firebase ID token and the
 * optional user-supplied Gemini key are attached identically everywhere.
 */

const BYOK_STORAGE_KEY = 'reflect.byokGeminiKey';

/** Shape check only — the server re-validates before trusting anything. */
export const GEMINI_KEY_SHAPE = /^AIza[A-Za-z0-9_-]{35}$/;

/**
 * The user's own Gemini key lives in localStorage and nowhere else. It is
 * never written to Firestore and never leaves the browser except as a header
 * on their own request. localStorage can throw in private-mode browsers, so
 * every access is guarded.
 */
export function getStoredByokKey(): string | null {
  try {
    return localStorage.getItem(BYOK_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredByokKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(BYOK_STORAGE_KEY, key);
    else localStorage.removeItem(BYOK_STORAGE_KEY);
  } catch {
    /* storage unavailable — the server key is used instead */
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Authentication expired. Please sign in again.');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`,
  };

  const byokKey = getStoredByokKey();
  if (byokKey) headers['x-gemini-key'] = byokKey;

  return headers;
}

async function errorFrom(response: Response, fallback: string): Promise<Error> {
  const data = await response.json().catch(() => ({} as any));
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    return new Error(data.error || `Too many requests. Try again in ${retryAfter || 'a few'} seconds.`);
  }
  return new Error(data.error || fallback);
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await errorFrom(response, `Request to ${path} failed (${response.status}).`);
  return response.json();
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: await authHeaders() });
  if (!response.ok) throw await errorFrom(response, `Request to ${path} failed (${response.status}).`);
  return response.json();
}

/**
 * Reads a Server-Sent Events response. EventSource cannot POST or send an
 * Authorization header, so the stream is read off fetch's body directly.
 *
 * Resolves with the number of chunks delivered, so a caller can tell the
 * difference between "failed before producing anything" (safe to retry
 * non-streaming) and "failed midway" (retrying would duplicate visible text).
 */
export async function postStream(
  path: string,
  body: unknown,
  onText: (text: string) => void
): Promise<number> {
  const response = await fetch(path, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) throw await errorFrom(response, `Stream request failed (${response.status}).`);
  if (!response.body) throw new Error('Streaming is not supported by this browser.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let chunksDelivered = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; keep any partial tail.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';

    for (const frame of frames) {
      const dataLine = frame.split('\n').find(line => line.startsWith('data: '));
      if (!dataLine) continue;

      let payload: any;
      try {
        payload = JSON.parse(dataLine.slice(6));
      } catch {
        continue; // ignore an unparseable frame rather than killing the stream
      }

      if (payload.error) throw new Error(payload.error);
      if (payload.text) {
        onText(payload.text);
        chunksDelivered++;
      }
    }
  }

  return chunksDelivered;
}
