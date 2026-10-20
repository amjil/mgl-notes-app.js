/**
 * Local document / block writes. Every write lands in IndexedDB together with
 * the Operation rows the server expects (same payloads as the Flutter app).
 */
import { getAll, getAllByIndex, get, req, transaction } from '../db/idb.js';
import { decodeDataJson } from '../editor/bridge.js';
import { makeOperation } from '../sync/ops.js';
import { emit } from '../events.js';
import { newId, nowIso } from '../util.js';
import { deleteAsset } from './assets.js';

function emitLocal(docId = null) {
  const documentIds = new Set();
  if (Array.isArray(docId)) docId.forEach((id) => id && documentIds.add(id));
  else if (docId) documentIds.add(docId);
  emit('local-change', { documentIds });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function activeDocuments(docs) {
  return docs.filter((d) => !d.deleted_at);
}

export async function listDocuments({ type = null } = {}) {
  const docs = activeDocuments(await getAll('documents'));
  const filtered = type ? docs.filter((d) => (d.type || 'normal') === type) : docs;
  return filtered.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

function sortKey(doc) {
  const a = doc.edited_at || '';
  const b = doc.updated_at || '';
  return a > b ? a : b;
}

/**
 * Build a forest from a flat document list using `parent_id`.
 * Orphans (missing / filtered-out parent) become roots.
 * @returns {{ doc: object, depth: number, children: object[] }[]}
 */
export function buildDocumentForest(docs) {
  const list = Array.isArray(docs) ? docs : [];
  const byId = new Map(list.map((d) => [d.id, d]));
  /** @type {Map<string|null, object[]>} */
  const kids = new Map();
  for (const d of list) {
    const raw = d.parent_id || null;
    const pid = raw && byId.has(raw) ? raw : null;
    if (!kids.has(pid)) kids.set(pid, []);
    kids.get(pid).push(d);
  }
  const byTime = (a, b) => sortKey(b).localeCompare(sortKey(a));
  for (const group of kids.values()) group.sort(byTime);

  function node(doc, depth) {
    const children = (kids.get(doc.id) || []).map((c) => node(c, depth + 1));
    return { doc, depth, children };
  }

  return (kids.get(null) || []).map((d) => node(d, 0));
}

/** Direct children of `parentId` (active docs only). */
export async function listChildDocuments(parentId) {
  if (!parentId) return [];
  const docs = await listDocuments();
  return docs.filter((d) => d.parent_id === parentId);
}

/** Re-parent a document (`document_move`). Prevents cycles. */
export async function moveDocument(id, parentId = null) {
  if (!id || id === parentId) return false;
  const now = nowIso();
  const changed = await transaction(['documents', 'operations'], 'readwrite', async (s) => {
    const doc = await req(s.documents.get(id));
    if (!doc || doc.deleted_at) return false;
    const nextParent = parentId || null;
    if ((doc.parent_id || null) === nextParent) return false;
    if (nextParent) {
      let cursor = nextParent;
      const guard = new Set([id]);
      while (cursor) {
        if (guard.has(cursor)) return false;
        guard.add(cursor);
        const p = await req(s.documents.get(cursor));
        if (!p || p.deleted_at) break;
        cursor = p.parent_id || null;
      }
    }
    s.documents.put({ ...doc, parent_id: nextParent, updated_at: now });
    s.operations.put(makeOperation('document', id, 'document_move', {
      parent_id: nextParent,
    }, now));
    return true;
  });
  if (changed) {
    emit('documents-changed', { documentIds: new Set([id]) });
    emitLocal(id);
  }
  return changed;
}

export function getDocument(id) {
  return get('documents', id);
}

export async function findDailyByTitle(title) {
  const rows = await getAllByIndex('documents', 'title', title);
  return rows.find((d) => !d.deleted_at && d.type === 'daily') || null;
}

/**
 * Create a document plus initial blocks.
 * `paragraphs` — optional string[]; defaults to one empty paragraph.
 * `blocks` — optional [{ type, text, checked?, data_json? }]; overrides paragraphs.
 */
export async function createDocument({
  title = '',
  type = 'normal',
  parentId = null,
  paragraphs = null,
  blocks: seedBlocks = null,
} = {}) {
  const now = nowIso();
  const specs = Array.isArray(seedBlocks) && seedBlocks.length
    ? seedBlocks
    : (Array.isArray(paragraphs) && paragraphs.length ? paragraphs : ['']).map((text) => ({
      type: 'paragraph',
      text: String(text ?? ''),
      checked: false,
      data_json: null,
    }));
  const doc = {
    id: newId(),
    title,
    type,
    parent_id: parentId,
    icon: null,
    cover: null,
    created_at: now,
    updated_at: now,
    edited_at: now,
    deleted_at: null,
  };
  const blocks = specs.map((spec, i) => ({
    id: newId(),
    document_id: doc.id,
    parent_id: null,
    type: spec.type || 'paragraph',
    text: String(spec.text ?? ''),
    checked: Boolean(spec.checked),
    data_json: spec.data_json ?? null,
    order_index: 1000.0 * (i + 1),
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }));
  await transaction(['documents', 'blocks', 'operations'], 'readwrite', (s) => {
    s.documents.put(doc);
    s.operations.put(makeOperation('document', doc.id, 'document_create', {
      id: doc.id,
      title,
      type,
      parent_id: parentId,
      icon: null,
      cover: null,
    }, now));
    blocks.forEach((block) => {
      s.blocks.put(block);
      s.operations.put(makeOperation('block', block.id, 'block_create', {
        id: block.id,
        document_id: doc.id,
        parent_id: null,
        type: block.type,
        text: block.text,
        checked: block.checked,
        data_json: block.data_json,
        order_index: block.order_index,
      }, now));
    });
  });
  emit('documents-changed', { documentIds: new Set([doc.id]) });
  emitLocal(doc.id);
  return doc;
}

export async function updateDocumentTitle(id, title) {
  const now = nowIso();
  const changed = await transaction(['documents', 'operations'], 'readwrite', async (s) => {
    const doc = await req(s.documents.get(id));
    if (!doc || doc.title === title) return false;
    s.documents.put({ ...doc, title, updated_at: now });
    s.operations.put(makeOperation('document', id, 'document_update', { title }, now));
    return true;
  });
  if (changed) {
    emit('documents-changed', { documentIds: new Set([id]) });
    emitLocal(id);
  }
  return changed;
}

export async function deleteDocument(id) {
  const now = nowIso();
  await transaction(['documents', 'operations'], 'readwrite', async (s) => {
    const doc = await req(s.documents.get(id));
    if (!doc || doc.deleted_at) return;
    s.documents.put({ ...doc, deleted_at: now, updated_at: now });
    s.operations.put(makeOperation('document', id, 'document_delete', { deleted_at: now }, now));
  });
  emit('documents-changed', { documentIds: new Set([id]) });
  emitLocal(id);
}

export async function listDeletedDocuments() {
  const docs = (await getAll('documents')).filter((d) => d.deleted_at);
  return docs.sort((a, b) => String(b.deleted_at || '').localeCompare(String(a.deleted_at || '')));
}

/** Undo soft-delete (`document_restore`). */
export async function restoreDocument(id) {
  const now = nowIso();
  await transaction(['documents', 'operations'], 'readwrite', async (s) => {
    const doc = await req(s.documents.get(id));
    if (!doc || !doc.deleted_at) return;
    s.documents.put({ ...doc, deleted_at: null, updated_at: now });
    s.operations.put(makeOperation('document', id, 'document_restore', {}, now));
  });
  emit('documents-changed', { documentIds: new Set([id]) });
  emitLocal(id);
}

/**
 * Permanently remove a document (`document_destroy`).
 * IndexedDB has no FK cascade, so blocks (+ derived links) are removed here too.
 */
export async function destroyDocument(id) {
  const now = nowIso();
  const assetIds = [];
  await transaction(['documents', 'blocks', 'operations', 'block_links'], 'readwrite', async (s) => {
    const doc = await req(s.documents.get(id));
    if (!doc) return;
    const blocks = await req(s.blocks.index('document_id').getAll(id));
    for (const b of blocks) {
      if (b.type === 'image' && b.data_json) {
        const aid = decodeDataJson(b.data_json)?.data?.['asset-id'];
        if (aid) assetIds.push(aid);
      }
      const links = await req(s.block_links.index('source_id').getAll(b.id));
      links.forEach((r) => s.block_links.delete([r.source_id, r.target_id, r.link_type]));
      s.blocks.delete(b.id);
    }
    s.documents.delete(id);
    s.operations.put(makeOperation('document', id, 'document_destroy', {}, now));
  });
  for (const aid of assetIds) {
    try { await deleteAsset(aid); } catch { /* ignore */ }
  }
  emit('documents-changed', { documentIds: new Set([id]) });
  emitLocal(id);
}

let dailyChain = Promise.resolve();

/** Return the single daily document for `title` (YYYY-MM-DD), creating it once. */
export function ensureDaily(title, { paragraphs } = {}) {
  const run = async () => {
    const existing = await findDailyByTitle(title);
    if (existing) return existing;
    return createDocument({ title, type: 'daily', paragraphs });
  };
  const next = dailyChain.catch(() => null).then(run);
  dailyChain = next;
  return next;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export async function getBlocks(documentId) {
  const rows = await getAllByIndex('blocks', 'document_id', documentId);
  return rows.filter((b) => !b.deleted_at);
}

/**
 * Unchecked todo blocks in non-deleted documents, newest `updated_at` first.
 * Mirrors Drift `watchUncompletedTasks`.
 */
export function collectOpenTasks(blocks, documents) {
  const docs = new Map();
  (documents || []).forEach((d) => {
    if (d && d.id && !d.deleted_at) docs.set(d.id, d);
  });
  return (blocks || [])
    .filter((b) => b
      && b.type === 'todo'
      && !b.checked
      && !b.deleted_at
      && docs.has(b.document_id))
    .sort((a, b) => {
      const byTime = String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
      return byTime || String(a.id || '').localeCompare(String(b.id || ''));
    })
    .map((b) => {
      const doc = docs.get(b.document_id);
      return {
        id: b.id,
        text: b.text || '',
        documentId: doc.id,
        documentTitle: doc.title || '',
        documentType: doc.type || 'normal',
      };
    });
}

export async function listOpenTasks() {
  const [blocks, documents] = await Promise.all([getAll('blocks'), getAll('documents')]);
  return collectOpenTasks(blocks, documents);
}

/** Toggle a todo checkbox (`block_check`), same payload as Flutter `block/check!`. */
export async function checkBlock(blockId, checked) {
  const now = nowIso();
  const result = await transaction(['blocks', 'operations'], 'readwrite', async (s) => {
    const blk = await req(s.blocks.get(blockId));
    if (!blk || blk.deleted_at) return null;
    const next = Boolean(checked);
    if (Boolean(blk.checked) === next) return { documentId: blk.document_id, changed: false };
    s.blocks.put({ ...blk, checked: next, updated_at: now });
    s.operations.put(makeOperation('block', blockId, 'block_check', { checked: next }, now));
    return { documentId: blk.document_id, changed: true };
  });
  if (result?.changed) emitLocal(result.documentId);
  return Boolean(result?.changed);
}

const ROW_FIELDS = ['parent_id', 'type', 'text', 'checked', 'data_json', 'order_index'];
const ROW_DEFAULTS = { text: '', checked: false, type: 'paragraph', order_index: 1000.0 };

/**
 * Apply an editor diff in one transaction.
 *   created: full rows, updated: { row, prev }, deleted: ids
 * Ops mirror notes-app.services.block/emit-change-ops!.
 */
export async function applyBlockChanges(documentId, { created = [], updated = [], deleted = [] }) {
  if (!created.length && !updated.length && !deleted.length) return false;
  const now = nowIso();
  const updates = [...updated];

  await transaction(['documents', 'blocks', 'operations'], 'readwrite', async (s) => {
    for (const id of deleted) {
      const existing = await req(s.blocks.get(id));
      if (!existing || existing.deleted_at) continue;
      s.blocks.put({ ...existing, deleted_at: now, updated_at: now });
      s.operations.put(makeOperation('block', id, 'block_delete', { deleted_at: now }, now));
    }

    for (const row of created) {
      const existing = await req(s.blocks.get(row.id));
      if (existing && !existing.deleted_at) {
        updates.push({ row, prev: existing });
        continue;
      }
      s.blocks.put({
        ...pickRow(row),
        id: row.id,
        document_id: documentId,
        created_at: existing ? existing.created_at : now,
        updated_at: now,
        deleted_at: null,
      });
      s.operations.put(makeOperation('block', row.id, 'block_create', {
        id: row.id,
        document_id: documentId,
        parent_id: row.parent_id,
        type: row.type,
        text: row.text,
        checked: row.checked,
        data_json: row.data_json,
        order_index: row.order_index,
      }, now));
    }

    for (const update of updates) {
      const { row } = update;
      // Editor snapshots carry only row fields; the stored record is the merge base.
      const stored = await req(s.blocks.get(row.id));
      const prev = stored && !stored.deleted_at ? stored : update.prev;
      const textChanged = prev.text !== row.text;
      const typeChanged = prev.type !== row.type;
      const dataChanged = (prev.data_json ?? null) !== (row.data_json ?? null);
      const checkedChanged = Boolean(prev.checked) !== Boolean(row.checked);
      const parentChanged = (prev.parent_id ?? null) !== (row.parent_id ?? null);
      const orderChanged = Number(prev.order_index) !== Number(row.order_index);
      if (!(textChanged || typeChanged || dataChanged || checkedChanged || parentChanged || orderChanged)) continue;

      s.blocks.put({
        ...(stored || {}),
        ...pickRow(row),
        id: row.id,
        document_id: documentId,
        created_at: stored?.created_at ?? now,
        updated_at: now,
        deleted_at: null,
      });

      if (textChanged || typeChanged || dataChanged) {
        const payload = {};
        if (textChanged) payload.text = row.text;
        if (typeChanged) payload.type = row.type;
        if (dataChanged) payload.data_json = row.data_json;
        s.operations.put(makeOperation('block', row.id, 'block_update', payload, now));
      }
      if (checkedChanged) {
        s.operations.put(makeOperation('block', row.id, 'block_check', { checked: Boolean(row.checked) }, now));
      }
      if (parentChanged || orderChanged) {
        s.operations.put(makeOperation('block', row.id, 'block_move', {
          parent_id: row.parent_id,
          order_index: row.order_index,
        }, now));
      }
    }

    const doc = await req(s.documents.get(documentId));
    if (doc) s.documents.put({ ...doc, edited_at: now });
  });

  emitLocal(documentId);
  return true;
}

function pickRow(row) {
  const out = {};
  ROW_FIELDS.forEach((k) => { out[k] = row[k] ?? ROW_DEFAULTS[k] ?? null; });
  return out;
}

/**
 * List all `todo` blocks across active documents, sorted by document edit time & block order.
 */
export async function listAllTasks() {
  const [docs, blocks] = await Promise.all([
    getAll('documents'),
    getAll('blocks'),
  ]);
  const docById = new Map(docs.filter((d) => !d.deleted_at).map((d) => [d.id, d]));
  const tasks = [];

  blocks.forEach((b) => {
    if (!b || b.deleted_at || b.type !== 'todo') return;
    const doc = docById.get(b.document_id);
    if (!doc) return;
    tasks.push({
      id: b.id,
      documentId: doc.id,
      docTitle: doc.title || '',
      docType: doc.type || 'normal',
      text: b.text || '',
      checked: Boolean(b.checked),
      orderIndex: Number(b.order_index) || 0,
      updatedAt: b.updated_at || doc.edited_at || doc.updated_at || '',
    });
  });

  return tasks.sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    const tCmp = String(b.updatedAt).localeCompare(String(a.updatedAt));
    if (tCmp) return tCmp;
    return a.orderIndex - b.orderIndex;
  });
}

/** Toggle a single todo block's `checked` status and emit a `block_check` sync op. */
export async function toggleTaskChecked(blockId, nextChecked) {
  const now = nowIso();
  let docId = null;
  const checked = Boolean(nextChecked);

  await transaction(['documents', 'blocks', 'operations'], 'readwrite', async (s) => {
    const blk = await req(s.blocks.get(blockId));
    if (!blk || blk.deleted_at) return;
    if (Boolean(blk.checked) === checked) return;
    docId = blk.document_id;
    s.blocks.put({ ...blk, checked, updated_at: now });
    s.operations.put(makeOperation('block', blockId, 'block_check', { checked }, now));

    const doc = await req(s.documents.get(docId));
    if (doc) s.documents.put({ ...doc, edited_at: now });
  });

  if (docId) {
    emit('blocks-changed', { documentIds: new Set([docId]) });
    emitLocal(docId);
  }
}
