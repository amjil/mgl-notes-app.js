import { imeBaseUrl } from '../config.js';

export class ImeApiError extends Error {
  constructor(message, { status = 0, body = null } = {}) {
    super(message);
    this.name = 'ImeApiError';
    this.status = status;
    this.body = body;
  }
}

/** Split optional next-word list (comma, newline, Mongolian separators). */
export function parseNextWordsField(raw) {
  return String(raw ?? '')
    .split(/[,，\n\u180e\u202f\s]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * POST /api/user_words on the IME candidate server (VITE_IME_BASE_URL).
 * Dev overlay for user_full.json / user_next.json on the backend.
 */
export async function addUserWord({ word, nextWords }) {
  const base = imeBaseUrl();
  if (!base) {
    throw new ImeApiError('IME server disabled (VITE_IME_BASE_URL=off or mixed content)');
  }

  const trimmed = String(word ?? '').trim();
  if (!trimmed) throw new ImeApiError('word is required');

  const payload = { word: trimmed };
  const list = Array.isArray(nextWords)
    ? nextWords.map((s) => String(s).trim()).filter(Boolean)
    : [];
  if (list.length) payload.nextWords = list;

  let res;
  try {
    res = await fetch(`${base}/api/user_words`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new ImeApiError(`Cannot reach IME server (${base})`, { status: 0, body: String(e) });
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (data && typeof data === 'object') {
      if (typeof data.error === 'string') msg = data.error;
      else if (typeof data.message === 'string') msg = data.message;
    }
    throw new ImeApiError(msg, { status: res.status, body: data });
  }
  return data;
}
