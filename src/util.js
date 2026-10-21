export function newId() {
  try {
    if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* non-secure origin */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowIso() {
  return new Date().toISOString();
}

/** Local calendar date as YYYY-MM-DD (daily document title). */
export function dateTitle(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateTitle(title) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(title || ''));
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addDays(date, n) {
  const next = new Date(date);
  next.setDate(next.getDate() + n);
  return next;
}

export function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

/** Key-sorted JSON so semantically equal values compare equal. */
export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).sort().forEach((k) => {
      if (value[k] !== undefined) out[k] = sortKeys(value[k]);
    });
    return out;
  }
  return value;
}

export function debounce(fn, ms) {
  let timer = 0;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'text') el.textContent = value;
    else el.setAttribute(key, value === true ? '' : value);
  });
  children.flat().forEach((child) => {
    if (child == null || child === false) return;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return el;
}

/**
 * 规范化传统蒙古文文本：
 * 1. 合并连续重复的自由变体选择符 FVS1..FVS3 (\u180B-\u180D) 与 MVS (\u180E)
 * 2. 将蒙古文词尾格助词前误用的普通空格 + MVS 修正为标准结构
 */
export function normalizeMongolianText(text) {
  if (!text) return '';
  return String(text)
    .replace(/([\u180B-\u180E])\1+/g, '$1')
    .replace(/(^|[\s\n\u202F])[\u180B-\u180E]+/g, '$1');
}

/**
 * 为模态弹窗绑定 Tab / Shift+Tab 焦点陷阱（Focus Trap），返回解绑函数。
 */
export function trapFocus(container) {
  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const onKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const nodes = Array.from(container.querySelectorAll(FOCUSABLE)).filter(
      (el) => !el.hidden && el.offsetParent !== null,
    );
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  container.addEventListener('keydown', onKeyDown);
  return () => container.removeEventListener('keydown', onKeyDown);
}
