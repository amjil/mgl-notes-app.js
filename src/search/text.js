/**
 * Mongolian-aware folding for FlexSearch.
 * Free variation selectors, the vowel separator, and zero-width chars (ZWSP
 * from the IME/editor) are ignored so the same word matches with or without
 * them. Words split on
 * whitespace — including U+202F, the usual traditional-Mongolian word gap —
 * and on punctuation. Latin is lowercased; phonetic Latin encoders are not
 * used, because they would discard Mongolian letters.
 */
import { Encoder } from 'flexsearch';

/** Bump when the encoder or indexed fields change; forces a full rebuild. */
export const SEARCH_REV = 2;

/** Same invisible chars stripped in the editor (wiki.js, spans.js) and IME fields. */
const SKIP_CHAR = /[\u180B-\u180E\u200B-\u200D\uFEFF]/u;
const SPLIT = /[^\p{L}\p{N}]+/u;

export function fold(str) {
  return foldMap(str).norm;
}

export function terms(str) {
  return fold(str).split(SPLIT).filter(Boolean);
}

export const encoder = new Encoder({
  normalize: (str) => fold(str),
  split: SPLIT,
  dedupe: false,
});

function foldMap(text) {
  const raw = String(text ?? '');
  let norm = '';
  const map = [];
  let i = 0;
  for (const ch of raw) {
    if (!SKIP_CHAR.test(ch)) {
      const lower = ch.toLowerCase();
      for (const out of lower) {
        norm += out;
        map.push(i);
      }
    }
    i += ch.length;
  }
  return { norm, map };
}

function bySiblingOrder(a, b) {
  const d = Number(a.order_index) - Number(b.order_index);
  if (d) return d;
  return String(a.id).localeCompare(String(b.id));
}

/** Active blocks in reading order (parent, then sibling order). */
export function orderedBlocks(blocks) {
  const children = new Map();
  (blocks || []).forEach((block) => {
    if (!block || block.deleted_at) return;
    const key = block.parent_id || '';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(block);
  });
  children.forEach((list) => list.sort(bySiblingOrder));

  const out = [];
  const seen = new Set();
  const walk = (parentId) => {
    (children.get(parentId) || []).forEach((block) => {
      if (seen.has(block.id)) return;
      seen.add(block.id);
      out.push(block);
      walk(block.id);
    });
  };
  walk('');
  return out;
}

export function documentText(blocks) {
  return orderedBlocks(blocks).map((block) => block.text || '').filter(Boolean).join('\n');
}

/**
 * Short original-text window around the first query term in `text`.
 * Returns '' when nothing matches.
 */
export function snippetAround(text, query, radius = 18) {
  const raw = String(text ?? '');
  const needles = terms(query);
  if (!raw || !needles.length) return '';

  const { norm, map } = foldMap(raw);
  let at = -1;
  let len = 0;
  needles.forEach((term) => {
    const i = norm.indexOf(term);
    if (i !== -1 && (at === -1 || i < at)) {
      at = i;
      len = term.length;
    }
  });
  if (at < 0) return '';

  const from = Math.max(0, at - radius);
  const to = Math.min(norm.length, at + len + radius);
  const start = map[from];
  const end = to >= norm.length ? raw.length : map[to];
  let out = raw.slice(start, end);
  if (from > 0) out = `…${out}`;
  if (to < norm.length) out = `${out}…`;
  return out;
}

export function snippetFor(blocks, query) {
  const rows = orderedBlocks(blocks);
  for (let i = 0; i < rows.length; i += 1) {
    const snippet = snippetAround(rows[i].text, query);
    if (snippet) return snippet;
  }
  return '';
}

/**
 * Find non-overlapping match ranges in original `text` for folded query terms.
 * Returns sorted [{ start, end }, ...] in original string offsets.
 */
export function matchRanges(text, query) {
  const raw = String(text ?? '');
  const needles = terms(query).slice().sort((a, b) => b.length - a.length);
  if (!raw || !needles.length) return [];

  const { norm, map } = foldMap(raw);
  const hits = [];
  const used = new Array(norm.length).fill(false);

  needles.forEach((term) => {
    if (!term) return;
    let from = 0;
    while (from < norm.length) {
      const i = norm.indexOf(term, from);
      if (i === -1) break;
      let overlaps = false;
      for (let k = i; k < i + term.length; k += 1) {
        if (used[k]) { overlaps = true; break; }
      }
      if (!overlaps) {
        for (let k = i; k < i + term.length; k += 1) used[k] = true;
        const start = map[i];
        const endNorm = i + term.length;
        const end = endNorm >= norm.length ? raw.length : map[endNorm];
        hits.push({ start, end });
      }
      from = i + 1;
    }
  });

  return hits.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Append text into `el` with <mark> around query matches. */
export function appendHighlighted(el, text, query, doc = globalThis.document) {
  const raw = String(text ?? '');
  const ranges = matchRanges(raw, query);
  if (!ranges.length) {
    el.append(doc.createTextNode(raw));
    return;
  }
  let cursor = 0;
  ranges.forEach(({ start, end }) => {
    if (start > cursor) el.append(doc.createTextNode(raw.slice(cursor, start)));
    const mark = doc.createElement('mark');
    mark.className = 'search-mark';
    mark.textContent = raw.slice(start, end);
    el.append(mark);
    cursor = end;
  });
  if (cursor < raw.length) el.append(doc.createTextNode(raw.slice(cursor)));
}
