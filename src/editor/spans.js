/**
 * Inline formatting ↔ Flutter `content-spans`.
 *
 * Flutter (rich-editor.model.delta) keeps plain `content` plus
 *   [{ start, end, attrs: { bold, italic, underline, strikethrough, link } }]
 * with UTF-16 offsets — the same units as JS string indices.
 * The web editor keeps HTML in each contenteditable block.
 */
import { escapeHtml } from '../util.js';

const ZWSP = /\u200b/g;

const TAG_ATTRS = {
  B: { bold: true },
  STRONG: { bold: true },
  I: { italic: true },
  EM: { italic: true },
  U: { underline: true },
  INS: { underline: true },
  S: { strikethrough: true },
  STRIKE: { strikethrough: true },
  DEL: { strikethrough: true },
};

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE']);
const SKIP_SELECTOR = '.list-marker, .callout-icon, .toggle-arrow, input, .resize-handle';

function styleAttrs(el) {
  const out = {};
  const st = el.style;
  if (!st) return out;
  const weight = st.fontWeight;
  if (weight === 'bold' || Number(weight) >= 600) out.bold = true;
  if (st.fontStyle === 'italic') out.italic = true;
  const deco = `${st.textDecoration || ''} ${st.textDecorationLine || ''}`;
  if (/underline/.test(deco)) out.underline = true;
  if (/line-through/.test(deco)) out.strikethrough = true;
  return out;
}

function sameAttrs(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

/** Merge per-run attrs into non-overlapping spans, adjacent equal runs joined. */
function runsToSpans(runs) {
  const spans = [];
  let pos = 0;
  runs.forEach(({ text, attrs }) => {
    const len = text.length;
    if (!len) return;
    if (Object.keys(attrs).length) {
      const last = spans[spans.length - 1];
      if (last && last.end === pos && sameAttrs(last.attrs, attrs)) last.end += len;
      else spans.push({ start: pos, end: pos + len, attrs: { ...attrs } });
    }
    pos += len;
  });
  return spans;
}

/** HTML of one block's editable content → { text, spans }. */
export function htmlToRich(html, doc = globalThis.document) {
  const tpl = doc.createElement('template');
  tpl.innerHTML = String(html || '');
  const runs = [];
  let started = false;

  const walk = (node, attrs) => {
    if (node.nodeType === 3) {
      const text = node.data.replace(ZWSP, '');
      if (text) {
        runs.push({ text, attrs });
        started = true;
      }
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node;
    if (el.matches && el.matches(SKIP_SELECTOR)) return;
    if (el.tagName === 'BR') {
      runs.push({ text: '\n', attrs: {} });
      started = true;
      return;
    }
    if (BLOCK_TAGS.has(el.tagName) && started) {
      const prev = runs[runs.length - 1];
      if (prev && !prev.text.endsWith('\n')) runs.push({ text: '\n', attrs: {} });
    }
    let next = attrs;
    const tagAttrs = TAG_ATTRS[el.tagName];
    const css = styleAttrs(el);
    if (tagAttrs || Object.keys(css).length) next = { ...next, ...tagAttrs, ...css };
    if (el.tagName === 'A' && el.getAttribute('href')) next = { ...next, link: el.getAttribute('href') };
    el.childNodes.forEach((child) => walk(child, next));
  };

  tpl.content.childNodes.forEach((child) => walk(child, {}));

  // A trailing <br> is the contenteditable placeholder, not content.
  while (runs.length && runs[runs.length - 1].text === '\n' && !Object.keys(runs[runs.length - 1].attrs).length) {
    runs.pop();
  }
  const text = runs.map((r) => r.text).join('');
  return { text, spans: runsToSpans(runs) };
}

/** Normalise any spans (overlapping, unsorted, split) into the canonical form. */
export function normalizeSpans(text, spans) {
  const len = String(text || '').length;
  if (!Array.isArray(spans) || !spans.length || !len) return [];
  const perChar = Array.from({ length: len }, () => ({}));
  spans.forEach((s) => {
    const start = Math.max(0, Number(s.start) || 0);
    const end = Math.min(len, Number(s.end) || 0);
    const attrs = s.attrs || {};
    for (let i = start; i < end; i++) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'href') perChar[i].link = v;
        else if (v != null && v !== false) perChar[i][k] = v;
      });
    }
  });
  const runs = perChar.map((attrs, i) => ({ text: text[i], attrs }));
  return runsToSpans(runs);
}

function wrap(html, attrs) {
  let out = html;
  if (attrs.strikethrough) out = `<s>${out}</s>`;
  if (attrs.underline) out = `<u>${out}</u>`;
  if (attrs.italic) out = `<i>${out}</i>`;
  if (attrs.bold) out = `<b>${out}</b>`;
  if (attrs.link) out = `<a href="${escapeHtml(attrs.link)}">${out}</a>`;
  return out;
}

function textHtml(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

/** { text, spans } → HTML for a block's content element. */
export function richToHtml(text, spans) {
  const content = String(text || '');
  const norm = normalizeSpans(content, spans);
  if (!norm.length) return textHtml(content);
  let html = '';
  let pos = 0;
  norm.forEach((s) => {
    if (s.start > pos) html += textHtml(content.slice(pos, s.start));
    html += wrap(textHtml(content.slice(s.start, s.end)), s.attrs);
    pos = s.end;
  });
  if (pos < content.length) html += textHtml(content.slice(pos));
  return html;
}
