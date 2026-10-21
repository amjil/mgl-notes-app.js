const KEY = 'mgl.apiBase';
const IME_KEY = 'mgl.imeBase';

function clean(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function isBlockedMixedContent(url) {
  try {
    if (globalThis.location?.protocol !== 'https:') return false;
    const u = new URL(url);
    return u.protocol === 'http:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1';
  } catch {
    return false;
  }
}

const DEFAULT_API_BASE = 'http://100.64.0.6:4001';

export function defaultApiBase() {
  const env = clean(import.meta.env?.VITE_API_BASE);
  return env || DEFAULT_API_BASE;
}

export function apiBase() {
  return clean(localStorage.getItem(KEY)) || defaultApiBase();
}

export function setApiBase(url) {
  const v = clean(url);
  if (v) localStorage.setItem(KEY, v);
  else localStorage.removeItem(KEY);
}

const DEFAULT_IME_BASE_URL = 'http://100.64.0.6:3003';

export function imeBaseUrl() {
  const stored = clean(localStorage.getItem(IME_KEY));
  const raw = stored || clean(import.meta.env?.VITE_IME_BASE_URL) || DEFAULT_IME_BASE_URL;
  if (raw === 'off') return null;
  const full = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  if (isBlockedMixedContent(full)) return null;
  return full;
}

export function setImeBaseUrl(url) {
  const v = clean(url);
  if (v) localStorage.setItem(IME_KEY, v);
  else localStorage.removeItem(IME_KEY);
}
