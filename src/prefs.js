/**
 * Lightweight UI preferences (localStorage). Applied as CSS vars / IME defaults.
 */
import { applyLocale } from './i18n.js';
import { setImeMode, imeMode } from './ime/index.js';

const FONT_KEY = 'mgl.fontScale';
const IME_KEY = 'mgl.imeDefault';
const DAILY_TEMPLATE_KEY = 'mgl.dailyTemplate';

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

export function applyPrefs() {
  applyLocale();
  applyFontScale();
  setImeMode(imeDefault());
}
