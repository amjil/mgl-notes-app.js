/**
 * Wiki-style inline markup — same grammar as block-editor.utils.inline:
 *   [[Title]]  #tag  ((uuid))
 * Stored as literal text (Flutter keeps brackets); visually decorated in the DOM.
 */
import { get } from '../db/idb.js';

/** 1=wikilink, 2=tag (exclude CJK/MN/EN punctuation), 3=block-ref UUID */
export const LINK_RE = /\[\[([^\]]+)\]\]|(?<=^|[\s\n\t])#([^\s\n\t#\[\],.?!:;"'()᠀-᠊，。？！：；“”‘’（）]+)|\(\(([a-f0-9-]{36})\)\)/gi;

const blockTextCache = new Map();

/** Full-span check for unwrapStale (no lookbehind — span text is the whole match). */
const SPAN_RE = /^(?:\[\[([^\]]+)\]\]|#([^\s\n\t#\[\],.?!:;"'()᠀-᠊，。？！：；“”‘’（）]+)|\(\(([a-f0-9-]{36})\)\))$/i;

export const WIKI_SEL = '.wiki-link, .wiki-tag, .wiki-block-ref';

export function parseTextSpans(text) {
  const raw = String(text || '');
  const re = new RegExp(LINK_RE.source, 'gi');
  const tokens = [];
  let last = 0;
  let m;
  while ((m = re.exec(raw))) {
    if (m.index > last) tokens.push({ type: 'text', content: raw.slice(last, m.index) });
    if (m[1] != null) tokens.push({ type: 'link', content: m[1] });
    else if (m[2] != null) tokens.push({ type: 'tag', content: m[2] });
    else if (m[3] != null) tokens.push({ type: 'block-ref', content: m[3] });
    last = m.index + m[0].length;
  }
  if (last < raw.length) tokens.push({ type: 'text', content: raw.slice(last) });
  if (!tokens.length) tokens.push({ type: 'text', content: raw });
  return tokens;
}

export function wikiTargetsFromText(text) {
  return [...new Set(
    parseTextSpans(text)
      .filter((t) => t.type === 'link')
      .map((t) => t.content.trim())
      .filter(Boolean),
  )];
}

export function tagTargetsFromText(text) {
  return [...new Set(
    parseTextSpans(text)
      .filter((t) => t.type === 'tag')
      .map((t) => t.content.trim())
      .filter(Boolean),
  )];
}

export function queryAtCaret(text, offset) {
  const raw = String(text || '');
  const off = Math.max(0, Math.min(offset | 0, raw.length));
  const before = raw.slice(0, off);

  const wiki = before.match(/\[\[([^\]]*)$/);
  if (wiki) {
    return {
      kind: 'wiki',
      query: wiki[1],
      start: off - wiki[0].length,
      end: off,
    };
  }

  const blockRef = before.match(/\(\(([^)\n]*)$/);
  if (blockRef) {
    return {
      kind: 'block',
      query: blockRef[1],
      start: off - blockRef[0].length,
      end: off,
    };
  }

  const tag = before.match(/(?:^|[\s\n])(#[^\s#\[\]]*)$/);
  if (tag) {
    return {
      kind: 'tag',
      query: tag[1].slice(1),
      start: off - tag[1].length,
      end: off,
    };
  }
  return null;
}

/** Fill .wiki-block-ref with a short text preview; keeps dataset.block as UUID. */
export async function hydrateBlockRefTitles(host) {
  const refs = host.querySelectorAll('.wiki-block-ref');
  if (!refs.length) return;
  for (const el of refs) {
    const id = el.dataset.block;
    if (!id) continue;
    let preview = blockTextCache.get(id);
    if (preview === undefined) {
      try {
        const blk = await get('blocks', id);
        preview = blk && !blk.deleted_at ? (blk.text || '').trim().slice(0, 24) : '';
        blockTextCache.set(id, preview);
      } catch {
        preview = '';
      }
    }
    if (preview) {
      el.dataset.preview = `((${preview}))`;
      el.title = preview;
    }
  }
}

export function editablePlainText(el) {
  if (!el) return '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.list-marker, .callout-icon, .toggle-arrow, input, .resize-handle').forEach((n) => n.remove());
  return clone.textContent.replace(/\u200b/g, '');
}

export function caretOffset(root) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !root.contains(sel.anchorNode)) return null;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return range.toString().replace(/\u200b/g, '').length;
}

function focusOffset(root) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !root.contains(sel.focusNode)) return null;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(sel.focusNode, sel.focusOffset);
  return range.toString().replace(/\u200b/g, '').length;
}

export function placeCaret(root, offset) {
  placeRange(root, offset, offset);
}

function pointAt(root, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let left = Math.max(0, offset);
  let node = walker.nextNode();
  while (node) {
    const rawLen = node.data.length;
    let strippedLen = 0;
    for (let i = 0; i < rawLen; i++) if (node.data[i] !== '\u200b') strippedLen += 1;
    if (left <= strippedLen) {
      let rawOff = 0;
      let stripped = 0;
      while (rawOff < rawLen && stripped < left) {
        if (node.data[rawOff] !== '\u200b') stripped += 1;
        rawOff += 1;
      }
      return { node, offset: rawOff };
    }
    left -= strippedLen;
    node = walker.nextNode();
  }
  return { node: root, offset: root.childNodes.length };
}

function placeRange(root, start, end) {
  const a = pointAt(root, Math.min(start, end));
  const b = pointAt(root, Math.max(start, end));
  const range = document.createRange();
  try {
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
  } catch {
    return;
  }
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function matchMeta(hit) {
  if (hit[1] != null) return { className: 'wiki-link', dataset: { wiki: hit[1].trim() } };
  if (hit[2] != null) return { className: 'wiki-tag', dataset: { tag: hit[2].trim() } };
  if (hit[3] != null) return { className: 'wiki-block-ref', dataset: { block: hit[3] } };
  return null;
}

function wrapMatch(textNode, start, end, className, dataset) {
  const text = textNode.data;
  const parent = textNode.parentNode;
  if (!parent) return;
  const before = text.slice(0, start);
  const mid = text.slice(start, end);
  const after = text.slice(end);
  const span = document.createElement('span');
  span.className = className;
  Object.entries(dataset).forEach(([k, v]) => { span.dataset[k] = v; });
  span.title = dataset.wiki || dataset.tag || dataset.block || '';
  span.appendChild(document.createTextNode(mid));
  if (before) parent.insertBefore(document.createTextNode(before), textNode);
  parent.insertBefore(span, textNode);
  if (after) parent.insertBefore(document.createTextNode(after), textNode);
  parent.removeChild(textNode);
}

function unwrapSpan(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
  parent.normalize();
}

/** Wiki spans whose text no longer matches the markup grammar (user edited inside). */
function unwrapStale(root) {
  let changed = false;
  root.querySelectorAll(WIKI_SEL).forEach((span) => {
    if (!SPAN_RE.test(span.textContent || '')) {
      unwrapSpan(span);
      changed = true;
    }
  });
  return changed;
}

function nextUndecoratedHit(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.parentElement?.closest?.(WIKI_SEL)) continue;
    if (n.parentElement?.closest?.('.list-marker, .callout-icon, .toggle-arrow')) continue;
    const re = new RegExp(LINK_RE.source, 'gi');
    const hit = re.exec(n.data);
    if (hit) return { n, hit };
  }
  return null;
}

/**
 * Incremental decorate: only wrap new matches / unwrap stale spans.
 * Avoids full unwrap→rewrap loops that fire MutationObserver and kill drag-selection.
 */
export function decorateEditable(el) {
  if (!el || el.getAttribute('contenteditable') !== 'true') return false;
  if (el.closest('.mgl-cell')) return false;

  const hadFocus = el.contains(document.activeElement) || el === document.activeElement;
  const sel = window.getSelection();
  // Never mutate while a range selection lives in this editable (drag or shift-select).
  if (sel && !sel.isCollapsed && (el.contains(sel.anchorNode) || el.contains(sel.focusNode))) {
    return false;
  }

  const start = hadFocus ? caretOffset(el) : null;
  const end = hadFocus ? focusOffset(el) : null;

  let changed = unwrapStale(el);

  for (let i = 0; i < 64; i++) {
    const found = nextUndecoratedHit(el);
    if (!found) break;
    const meta = matchMeta(found.hit);
    if (!meta) break;
    wrapMatch(found.n, found.hit.index, found.hit.index + found.hit[0].length, meta.className, meta.dataset);
    changed = true;
  }

  if (changed && hadFocus && start != null && end != null) placeRange(el, start, end);
  return changed;
}

export function decorateHost(host) {
  const sel = window.getSelection();
  // Any live range inside the editor: skip the whole pass (other blocks' wraps
  // can still disturb the selection via MutationObserver / layout).
  if (sel && !sel.isCollapsed) {
    const a = sel.anchorNode;
    const f = sel.focusNode;
    if ((a && host.contains(a)) || (f && host.contains(f))) return false;
  }
  let changed = false;
  host.querySelectorAll('.block-content[contenteditable="true"], .toggle-title').forEach((el) => {
    if (decorateEditable(el)) changed = true;
  });
  return changed;
}
