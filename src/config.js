const API_BASE_KEY = 'mgl.apiBase';

function trimSlash(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/** HTTPS pages must not call plain-HTTP intranet hosts (browser Mixed Content block). */
function isMixedContentBlocked(targetUrl) {
  try {
    if (globalThis.location?.protocol !== 'https:') return false;
    const u = new URL(targetUrl);
    return u.protocol === 'http:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1';
  } catch {
    return false;
  }
}

const DEFAULT_API_BASE = 'http://100.64.0.6:4001';

function defaultApiBase() {
  const fromEnv = trimSlash(import.meta.env?.VITE_API_BASE);
  if (fromEnv) return fromEnv;
  return DEFAULT_API_BASE;
}

export function apiBase() {
  return trimSlash(localStorage.getItem(API_BASE_KEY)) || defaultApiBase();
}

export function setApiBase(url) {
  const value = trimSlash(url);
  if (value) localStorage.setItem(API_BASE_KEY, value);
  else localStorage.removeItem(API_BASE_KEY);
}

const DEFAULT_IME_BASE = 'http://100.64.0.6:3003';

/** Set VITE_IME_BASE_URL=off to keep mgl-web-ime on its bundled dictionary. */
export function imeBaseUrl() {
  const raw = trimSlash(import.meta.env?.VITE_IME_BASE_URL) || DEFAULT_IME_BASE;
  if (raw === 'off') return null;
  const full = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  // HTTPS page + intranet HTTP → fall back to bundled dictionary (avoid Mixed Content errors).
  if (isMixedContentBlocked(full)) return null;
  return full;
}
