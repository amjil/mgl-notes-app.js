/**
 * Bridge between IndexedDB `blocks` rows (Flutter/server format) and the
 * `block-editor` DOM tree.
 */
import { canonicalJson } from '../util.js';
import { clampSpans, htmlToRich, richToHtml } from './spans.js';

export const UNSUPPORTED_TYPE = 'unsupported';

export const EDITABLE_TYPES = new Set([
  'paragraph', 'heading-1', 'heading-2', 'heading-3',
  'list-item', 'ordered-list-item', 'task', 'blockquote',
  'callout', 'toggle', 'divider', 'table', 'image', 'bookmark',
]);

// 仅 divider 与 image 完全无检索文本；table 与 bookmark 会将文本汇总写入 row.text 供全文搜索与双链索引使用
const ATOMIC_TEXTLESS = new Set(['divider', 'image']);

function toEditorType(dbType) {
  if (dbType === 'todo') return 'task';
  return dbType || 'paragraph';
}

function toDbType(editorType) {
  if (editorType === 'task') return 'todo';
  return editorType || 'paragraph';
}

export function decodeDataJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeTableData(data) {
  if (!data || typeof data.cells !== 'object' || !data.cells) return data;
  const cells = {};
  Object.keys(data.cells).forEach((k) => {
    cells[String(k)] = data.cells[k];
  });
  return { ...data, cells };
}

function bySiblingOrder(a, b) {
  const d = Number(a.order_index) - Number(b.order_index);
  if (d) return d;
  return String(a.created_at || '').localeCompare(String(b.created_at || ''))
    || String(a.id).localeCompare(String(b.id));
}

/**
 * Build the nested editor block tree from flat DB rows.
 * Orphans whose parent is missing/deleted are promoted to top-level (null)
 * so they remain visible and editable instead of becoming ghost rows.
 */
export function rowsToTree(rows) {
  const validIds = new Set(rows.map((r) => r.id));
  const childrenOf = new Map();

  rows.forEach((r) => {
    const key = (r.parent_id && r.parent_id !== r.id && validIds.has(r.parent_id))
      ? r.parent_id
      : null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(r);
  });
  childrenOf.forEach((list) => list.sort(bySiblingOrder));

  const snapshot = new Map();
  const visited = new Set();

  const build = (row) => {
    if (visited.has(row.id)) return null;
    visited.add(row.id);
    snapshot.set(row.id, row);
    const kids = (childrenOf.get(row.id) || []).map(build).filter(Boolean);
    return { ...rowToNode(row), children: kids };
  };

  const tree = (childrenOf.get(null) || []).map(build).filter(Boolean);

  // 兜底：若存在循环父子引用，破环并挂载回根级，防止块隐形丢失
  rows.forEach((r) => {
    if (!visited.has(r.id)) {
      const recovered = build(r);
      if (recovered) tree.push(recovered);
    }
  });

  return { tree, snapshot };
}

function rowToNode(row) {
  const type = toEditorType(row.type);
  const extra = decodeDataJson(row.data_json);

  if (!EDITABLE_TYPES.has(type)) {
    return {
      id: row.id,
      type: UNSUPPORTED_TYPE,
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
    node.data = normalizeTableData(extra.data || {});
    node.html = '';
  } else if (type === 'image') {
    node.data = { ...(extra.data || {}) };
    node.html = '';
    node.text = '';
  } else if (type === 'bookmark') {
    node.data = { ...(extra.data || {}) };
    node.html = '';
    node.text = row.text || node.data.title || '';
  } else if (type === 'divider') {
    node.html = '';
  } else {
    node.html = richToHtml(row.text || '', extra['content-spans']);
    node.text = row.text || '';
  }

  if (type === 'task') node.checked = Boolean(row.checked);
  if (extra.data && typeof extra.data.collapsed === 'boolean') {
    node.collapsed = extra.data.collapsed;
  }
  return node;
}

function hasKeys(obj) {
  return Boolean(obj && typeof obj === 'object' && Object.keys(obj).length > 0);
}

function semanticDataSig(decoded, text) {
  const data = decoded && hasKeys(decoded.data) ? decoded.data : null;
  const spans = clampSpans(text, decoded && decoded['content-spans']);
  return canonicalJson({ data, spans });
}

function buildDataJson(data, spans, alwaysIncludeData) {
  const out = {};
  if (alwaysIncludeData || data !== null) out.data = data || {};
  if (spans && spans.length) out['content-spans'] = spans;
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

/**
 * Assign monotonic order_index values for sibling blocks.
 * Reuses existing order_index values when strictly increasing so inserting or
 * deleting a block at the top does not trigger redundant `block_move` ops
 * on every following sibling.
 */
function assignSiblingOrders(nodes, snapshot) {
  const n = nodes.length;
  const orders = nodes.map((node) => {
    const prev = snapshot.get(node?.id);
    return (prev && Number.isFinite(Number(prev.order_index)))
      ? Number(prev.order_index)
      : null;
  });

  let maxSeen = -Infinity;
  for (let i = 0; i < n; i++) {
    if (orders[i] != null) {
      if (orders[i] > maxSeen) maxSeen = orders[i];
      else orders[i] = null;
    }
  }

  let i = 0;
  while (i < n) {
    if (orders[i] != null) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && orders[j] == null) j += 1;
    const leftOrder = i > 0 ? orders[i - 1] : 0;
    const rightOrder = j < n ? orders[j] : leftOrder + (j - i + 1) * 1000.0;
    const step = (rightOrder - leftOrder) / (j - i + 1);

    if (step < 1e-4) {
      return nodes.map((_, idx) => 1000.0 * (idx + 1));
    }
    for (let k = i; k < j; k++) {
      orders[k] = leftOrder + step * (k - i + 1);
    }
    i = j;
  }
  return orders;
}

/**
 * Flatten the editor's current block tree back into DB rows.
 */
export function treeToRows(tree, snapshot = new Map(), doc = globalThis.document) {
  const rows = [];
  const walk = (nodes, parentId) => {
    const valid = (nodes || []).filter((node) => node && node.id);
    const orders = assignSiblingOrders(valid, snapshot);
    valid.forEach((node, idx) => {
      const prev = snapshot.get(node.id) || null;
      rows.push(nodeToRow(node, parentId, orders[idx], prev, doc));
      if (node.children && node.children.length) walk(node.children, node.id);
    });
  };
  walk(tree || [], null);
  return rows;
}

function nodeToRow(node, parentId, orderIndex, prev, doc = globalThis.document) {
  if (node.type === UNSUPPORTED_TYPE) {
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
  const prevDecoded = prev ? decodeDataJson(prev.data_json) : {};
  const prevData = hasKeys(prevDecoded.data) ? prevDecoded.data : null;

  let text;
  let spans = [];
  if (ATOMIC_TEXTLESS.has(type)) {
    text = prev ? (prev.text || '') : '';
  } else if (type === 'table') {
    const cells = node.data?.cells || {};
    text = Object.keys(cells)
      .sort()
      .map((k) => String(cells[k] || '').trim())
      .filter(Boolean)
      .join(' ');
  } else if (type === 'bookmark') {
    const d = node.data || {};
    text = [d.title, d.desc, d.url].filter(Boolean).join(' ') || node.text || '';
  } else {
    const rich = htmlToRich(node.html || '', doc);
    text = rich.text;
    spans = rich.spans;
  }

  let data = prevData ? { ...prevData } : null;
  let alwaysData = false;
  if (type === 'task') {
    const rest = { ...(prevData || {}) };
    delete rest.checked;
    data = rest;
    alwaysData = true;
  } else if (type === 'table' || type === 'image' || type === 'bookmark') {
    data = { ...(prevData || {}), ...(node.data || {}) };
    alwaysData = type === 'image' || type === 'bookmark';
  }

  // 持久化块折叠状态 (toggle 块或大纲折叠)
  if (node.collapsed) {
    data = { ...(data || {}), collapsed: true };
  } else if (data && 'collapsed' in data) {
    const rest = { ...data };
    delete rest.collapsed;
    data = Object.keys(rest).length ? rest : (alwaysData ? {} : null);
  }

  let dataJson = buildDataJson(data, spans, alwaysData);
  if (prev && semanticDataSig(prevDecoded, prev.text || '') === semanticDataSig(decodeDataJson(dataJson), text)) {
    dataJson = prev.data_json ?? null;
  }

  return {
    id: node.id,
    parent_id: parentId,
    type: toDbType(type),
    text,
    checked: type === 'task' ? Boolean(node.checked) : false,
    data_json: dataJson,
    order_index: orderIndex,
  };
}

const COMPARE_KEYS = ['parent_id', 'type', 'text', 'checked', 'data_json', 'order_index'];

function rowChanged(prev, next) {
  return COMPARE_KEYS.some((k) => {
    const a = prev[k] ?? null;
    const b = next[k] ?? null;
    if (k === 'checked') return Boolean(a) !== Boolean(b);
    if (k === 'order_index') return Number(a) !== Number(b);
    return a !== b;
  });
}

export function diffRows(nextRows, snapshot = new Map()) {
  const created = [];
  const updated = [];
  const seen = new Set();

  nextRows.forEach((row) => {
    seen.add(row.id);
    const prev = snapshot.get(row.id);
    if (!prev) {
      created.push(row);
    } else if (rowChanged(prev, row)) {
      updated.push({ row, prev });
    }
  });

  const deleted = [];
  snapshot.forEach((_, id) => {
    if (!seen.has(id)) deleted.push(id);
  });

  return { created, updated, deleted };
}

export function nextSnapshot(nextRows, prevSnapshot = new Map()) {
  const m = new Map();
  nextRows.forEach((r) => {
    const prev = prevSnapshot.get(r.id) || {};
    m.set(r.id, { ...prev, ...r });
  });
  return m;
}
