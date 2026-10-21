/**
 * Block rows (server / Flutter Drift shape) ↔ block-editor tree; diff → row changes.
 * Port of notes-app.editor.bridge:
 *   - tree = parent_id + order_index, siblings sorted by order_index
 *   - DB "todo" ↔ editor "task"
 *   - data_json = {"data": …, "content-spans": [...]}
 *   - on save, order_index = 1000 * (1-based sibling position)
 * Types the web editor cannot edit yet become an atomic placeholder that
 * carries the original row so nothing is lost on save.
 */
import { htmlToRich, normalizeSpans, richToHtml } from './spans.js';
import { canonicalJson } from '../util.js';

export const PLACEHOLDER_TYPE = 'unsupported';

export const EDITABLE_TYPES = new Set([
  'paragraph', 'heading-1', 'heading-2', 'heading-3',
  'list-item', 'ordered-list-item', 'task', 'blockquote',
  'callout', 'toggle', 'divider', 'table', 'image', 'bookmark', 'flashcard', 'code',
]);

const ATOMIC_TEXTLESS = new Set(['divider', 'table', 'image']);

export function dbTypeToEditor(type) {
  return type === 'todo' ? 'task' : (type || 'paragraph');
}

export function editorTypeToDb(type) {
  return type === 'task' ? 'todo' : (type || 'paragraph');
}

export function decodeDataJson(s) {
  if (!s) return {};
  if (typeof s === 'object') return s;
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function stringifyCellKeys(data) {
  if (!data || typeof data.cells !== 'object' || !data.cells) return data;
  const cells = {};
  Object.keys(data.cells).forEach((k) => { cells[String(k)] = data.cells[k]; });
  return { ...data, cells };
}

function bySiblingOrder(a, b) {
  const d = Number(a.order_index) - Number(b.order_index);
  if (d) return d;
  return String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id));
}

/**
 * rows → { tree, snapshot }. Rows whose parent is missing are unreachable,
 * exactly like the Flutter editor; they stay out of the snapshot so a save never touches them.
 */
export function rowsToTree(rows) {
  const childrenOf = new Map();
  rows.forEach((r) => {
    const key = r.parent_id || null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(r);
  });
  childrenOf.forEach((list) => list.sort(bySiblingOrder));

  const snapshot = new Map();
  const seen = new Set();

  const build = (row) => {
    if (seen.has(row.id)) return null;
    seen.add(row.id);
    snapshot.set(row.id, row);
    const children = (childrenOf.get(row.id) || []).map(build).filter(Boolean);
    return { ...rowToNode(row), children };
  };

  const tree = (childrenOf.get(null) || []).map(build).filter(Boolean);
  return { tree, snapshot };
}

export function rowToNode(row) {
  const type = dbTypeToEditor(row.type);
  const extra = decodeDataJson(row.data_json);

  if (!EDITABLE_TYPES.has(type)) {
    return {
      id: row.id,
      type: PLACEHOLDER_TYPE,
      data: {
        orig: {
          type: row.type,
          text: row.text || '',
          checked: Boolean(row.checked),
          data_json: row.data_json ?? null,
        },
      },
    };
  }

  const node = { id: row.id, type };
  if (type === 'table') {
    node.data = stringifyCellKeys(extra.data || {});
    node.html = '';
  } else if (type === 'image') {
    node.data = { ...(extra.data || {}) };
    node.html = '';
    node.text = '';
  } else if (type === 'bookmark') {
    node.data = { ...(extra.data || {}) };
    node.html = '';
    node.text = row.text || node.data.title || '';
  } else if (type === 'flashcard') {
    const rawData = extra.data || {};
    node.data = {
      ...rawData,
      front: rawData.front ?? row.text ?? '',
      back: rawData.back ?? '',
    };
    node.html = '';
    node.text = row.text || node.data.front || '';
  } else if (type === 'code') {
    node.data = { ...(extra.data || {}) };
    node.html = '';
    node.text = row.text || '';
  } else if (type === 'divider') {
    node.html = '';
  } else {
    node.html = richToHtml(row.text || '', extra['content-spans']);
    node.text = row.text || '';
  }
  if (type === 'task') node.checked = Boolean(row.checked);
  return node;
}

function hasKeys(o) {
  return !!o && typeof o === 'object' && Object.keys(o).length > 0;
}

/** Compare data_json by meaning: key order, span splitting and `{}` vs missing do not matter. */
function extraKey(extra, text) {
  const data = extra && hasKeys(extra.data) ? extra.data : null;
  const spans = normalizeSpans(text, extra && extra['content-spans']);
  return canonicalJson({ data, spans });
}

function encodeExtra(data, spans, alwaysData) {
  const out = {};
  if (alwaysData || data != null) out.data = data || {};
  if (spans && spans.length) out['content-spans'] = spans;
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

/**
 * Editor tree → flat rows in DFS order (parent before children).
 * `snapshot` supplies the stored rows so untouched fields keep their exact bytes.
 */
export function treeToRows(tree, snapshot = new Map(), doc = globalThis.document) {
  const rows = [];

  const walk = (nodes, parentId) => {
    nodes.forEach((node, idx) => {
      if (!node || !node.id) return;
      const prev = snapshot.get(node.id) || null;
      const orderIndex = 1000.0 * (idx + 1);
      rows.push(nodeToRow(node, parentId, orderIndex, prev, doc));
      if (node.children && node.children.length) walk(node.children, node.id);
    });
  };

  walk(tree || [], null);
  return rows;
}

export function nodeToRow(node, parentId, orderIndex, prev, doc = globalThis.document) {
  if (node.type === PLACEHOLDER_TYPE) {
    const orig = (node.data && node.data.orig) || {};
    return {
      id: node.id,
      parent_id: parentId,
      type: orig.type || (prev && prev.type) || 'paragraph',
      text: orig.text ?? (prev ? prev.text : ''),
      checked: Boolean(orig.checked),
      data_json: orig.data_json ?? null,
      order_index: orderIndex,
    };
  }

  const type = node.type || 'paragraph';
  const prevExtra = prev ? decodeDataJson(prev.data_json) : {};
  const prevData = hasKeys(prevExtra.data) ? prevExtra.data : null;

  let text;
  let spans = [];
  if (ATOMIC_TEXTLESS.has(type)) {
    text = prev ? (prev.text || '') : '';
  } else if (type === 'bookmark') {
    text = (node.data && node.data.title) || node.text || '';
  } else if (type === 'flashcard') {
    text = (node.data && node.data.front) || node.text || '';
  } else if (type === 'code') {
    text = node.text || '';
  } else {
    const rich = htmlToRich(node.html || '', doc);
    text = rich.text;
    spans = rich.spans;
  }

  let data = prevData;
  let alwaysData = false;
  if (type === 'task') {
    const rest = { ...(prevData || {}) };
    delete rest.checked;
    data = rest;
    alwaysData = true;
  } else if (type === 'table' || type === 'image' || type === 'bookmark' || type === 'flashcard' || type === 'code') {
    data = { ...(prevData || {}), ...(node.data || {}) };
    alwaysData = type === 'image' || type === 'bookmark' || type === 'flashcard' || type === 'code';
  }

  let dataJson = encodeExtra(data, spans, alwaysData);
  if (prev && extraKey(prevExtra, prev.text || '') === extraKey(decodeDataJson(dataJson), text)) {
    dataJson = prev.data_json ?? null;
  }

  return {
    id: node.id,
    parent_id: parentId,
    type: editorTypeToDb(type),
    text,
    checked: type === 'task' ? Boolean(node.checked) : false,
    data_json: dataJson,
    order_index: orderIndex,
  };
}

const COMPARE = ['parent_id', 'type', 'text', 'checked', 'data_json', 'order_index'];

function rowChanged(prev, row) {
  return COMPARE.some((k) => {
    const a = prev[k] ?? null;
    const b = row[k] ?? null;
    if (k === 'checked') return Boolean(a) !== Boolean(b);
    if (k === 'order_index') return Number(a) !== Number(b);
    return a !== b;
  });
}

/** Diff rows against the last persisted snapshot. */
export function diffRows(rows, snapshot) {
  const created = [];
  const updated = [];
  const ids = new Set();
  rows.forEach((row) => {
    ids.add(row.id);
    const prev = snapshot.get(row.id);
    if (!prev) created.push(row);
    else if (rowChanged(prev, row)) updated.push({ row, prev });
  });
  const deleted = [];
  snapshot.forEach((_, id) => { if (!ids.has(id)) deleted.push(id); });
  return { created, updated, deleted };
}

export function nextSnapshot(rows, snapshot) {
  const next = new Map();
  rows.forEach((row) => next.set(row.id, { ...(snapshot.get(row.id) || {}), ...row }));
  return next;
}
