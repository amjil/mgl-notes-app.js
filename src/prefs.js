/**
 * Lightweight UI preferences (localStorage). Applied as CSS vars / IME defaults.
 */
import { applyLocale } from './i18n.js';
import { setImeMode, imeMode } from './ime/index.js';

const FONT_KEY = 'mgl.fontScale';
const IME_KEY = 'mgl.imeDefault';
const DAILY_TEMPLATE_KEY = 'mgl.dailyTemplate';
const THEME_KEY = 'mgl.theme'; // 'auto' | 'light' | 'dark'
const THEME_COLOR_LIGHT = '#f4efe4';
const THEME_COLOR_DARK = '#141816';
const darkMq = globalThis.matchMedia?.('(prefers-color-scheme: dark)');

export function fontScale() {
  const n = Number(localStorage.getItem(FONT_KEY));
  return Number.isFinite(n) && n >= 0.85 && n <= 1.4 ? n : 1;
}

export function setFontScale(scale) {
  const n = Number(scale);
  const value = Number.isFinite(n) ? Math.min(1.4, Math.max(0.85, n)) : 1;
  localStorage.setItem(FONT_KEY, String(value));
  applyFontScale(value);
  return value;
}

export function applyFontScale(scale = fontScale()) {
  document.documentElement.style.setProperty('--app-font-scale', String(scale));
}

export function imeDefault() {
  const v = localStorage.getItem(IME_KEY);
  return v === 'latin' || v === 'mongol' ? v : 'mongol';
}

export function setImeDefault(mode) {
  const next = mode === 'latin' ? 'latin' : 'mongol';
  localStorage.setItem(IME_KEY, next);
  if (imeMode() !== next) setImeMode(next);
  return next;
}

export function dailyTemplate() {
  try {
    return localStorage.getItem(DAILY_TEMPLATE_KEY) || '';
  } catch {
    return '';
  }
}

export function setDailyTemplate(text) {
  const value = String(text ?? '');
  try {
    if (value) localStorage.setItem(DAILY_TEMPLATE_KEY, value);
    else localStorage.removeItem(DAILY_TEMPLATE_KEY);
  } catch { /* ignore */ }
  return value;
}

/** Paragraph texts for a new daily note (at least one entry). */
export function dailyTemplateLines() {
  const raw = dailyTemplate().replace(/\r\n/g, '\n');
  if (!raw.trim()) return [''];
  return raw.split('\n');
}

export function theme() {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto';
}

export function setTheme(mode) {
  const next = mode === 'light' || mode === 'dark' ? mode : 'auto';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  return next;
}

export function applyTheme(mode = theme()) {
  const isDark = mode === 'dark' || (mode === 'auto' && Boolean(darkMq?.matches));
  const root = globalThis.document?.documentElement;
  if (root) {
    root.dataset.theme = isDark ? 'dark' : 'light';
  }

  const metaTheme = globalThis.document?.querySelector?.('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', isDark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  }

  const metaStatusBar = globalThis.document?.querySelector?.('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (metaStatusBar) {
    metaStatusBar.setAttribute('content', isDark ? 'black-translucent' : 'default');
  }
}

darkMq?.addEventListener?.('change', () => {
  if (theme() === 'auto') applyTheme('auto');
});

export function applyPrefs() {
  applyLocale();
  applyFontScale();
  applyTheme();
  setImeMode(imeDefault());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === FONT_KEY || e.key === THEME_KEY || e.key === IME_KEY) {
      applyPrefs();
    }
  });
}
