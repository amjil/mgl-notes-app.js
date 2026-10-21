/**
 * Apply pulled Operations to IndexedDB. Port of notes-app.services.operation-apply:
 * idempotent by op id, skips this device's own ops, last-writer-wins on
 * remote created_at vs local updated_at.
 */
import { get, req, transaction } from '../db/idb.js';
import { decodeDataJson } from '../editor/bridge.js';
import { deviceId } from '../session.js';
import {
  deleteAsset,
  insertRemoteAssetMetadata,
  markAssetDeletedLocal,
} from '../services/assets.js';
import { clearLinksForIds, rebuildLinksForBlock } from '../services/links.js';
import { conflictCopyTitle, lwwOk } from './conflict.js';

export { conflictCopyTitle, lwwOk };

function payloadOf(op) {
  const p = op.payload;
  if (!p) return {};
  if (typeof p === 'string') {
    try {
      return JSON.parse(p) || {};
    } catch {
      return {};
    }
  }
  return p;
}

function has(p, key) {
  return Object.prototype.hasOwnProperty.call(p, key);
}

/**
 * Apply a page of remote ops in one transaction.
 * Returns { applied, documentsChanged, documentIds, renames }.
 */
export async function applyRemoteOperations(items) {
  const me = deviceId();
  const result = {
    applied: 0,
    documentsChanged: false,
    documentIds: new Set(),
    renames: [],
    skipped: [],
    linkRebuildIds: new Set(),
    linkClearIds: new Set(),
    assetIds: new Set(),
    assetCreates: [],
    assetDeletes: [],
  };
  if (!items.length) return result;

  await transaction(['documents', 'blocks', 'operations'], 'readwrite', async (s) => {
    for (const item of items) {
      if (!item || !item.id || !item.action) continue;
      const seen = await req(s.operations.get(item.id));
      if (seen) continue;

      const record = {
        id: item.id,
        device_id: item.device_id || '',
        entity_type: item.entity_type || '',
        entity_id: item.entity_id || '',
        action: item.action,
        payload: payloadOf(item),
        created_at: item.created_at || null,
        synced: 1,
        seq: 0,
      };

      if (item.device_id !== me) {
        const p = record.payload;
        const eid = item.entity_id || p.id || p.entity_id;
        if (eid) {
          await dispatch(s, item.action, eid, p, item.created_at, result);
          result.applied += 1;
        }
      }
      s.operations.put(record);
    }
  });

  // Asset metadata is applied outside the main tx (assets store is local-only).
  for (const meta of result.assetCreates || []) {
    try {
      await insertRemoteAssetMetadata(meta);
    } catch { /* ignore */ }
  }
  for (const del of result.assetDeletes || []) {
    try {
      await markAssetDeletedLocal(del.id, del.deletedAt);
    } catch { /* ignore */ }
  }

  for (const id of result.linkClearIds) await clearLinksForIds([id]);
  for (const id of result.linkRebuildIds) {
    const blk = await get('blocks', id);
    if (blk && !blk.deleted_at) await rebuildLinksForBlock(id, blk.text || '');
    else await clearLinksForIds([id]);
  }
  for (const aid of result.assetIds) {
    try { await deleteAsset(aid); } catch { /* ignore */ }
  }

  return result;
}

async function dispatch(s, action, eid, p, createdAt, result) {
  const at = createdAt || new Date().toISOString();

  if (action === 'asset_create') {
    result.assetCreates.push({
      id: eid,
      filename: p.filename,
      mimeType: p.mime_type || p.mimeType,
      sizeBytes: p.size_bytes ?? p.sizeBytes,
      sha256: p.sha256,
      createdAt: at,
    });
    return;
  }
  if (action === 'asset_delete') {
    result.assetDeletes.push({ id: eid, deletedAt: p.deleted_at || at });
    return;
  }

  if (action.startsWith('document_')) {
    const doc = await req(s.documents.get(eid));
    result.documentsChanged = true;
    result.documentIds.add(eid);

    switch (action) {
      case 'document_create': {
        if (doc) return;
        const title = p.title || '';
        if (title) await renameLocalTitleConflict(s, title, eid, result);
        s.documents.put({
          id: eid,
          title,
          type: p.type || 'normal',
          parent_id: p.parent_id || null,
          icon: p.icon || null,
          cover: p.cover || null,
          created_at: at,
          updated_at: at,
          deleted_at: null,
        });
        return;
      }
      case 'document_update': {
        if (!doc) return;
        if (!lwwOk(doc.updated_at, createdAt)) {
          result.skipped.push({ kind: 'document', id: eid, action });
          return;
        }
        const next = { ...doc, updated_at: at };
        if (has(p, 'title')) next.title = p.title || '';
        if (has(p, 'icon')) next.icon = p.icon || null;
        if (has(p, 'cover')) next.cover = p.cover || null;
        s.documents.put(next);
        return;
      }
      case 'document_delete':
        if (!doc) return;
        if (!lwwOk(doc.updated_at, createdAt)) {
          result.skipped.push({ kind: 'document', id: eid, action });
          return;
        }
        s.documents.put({ ...doc, deleted_at: at, updated_at: at });
        return;
      case 'document_restore':
        if (!doc) return;
        if (!lwwOk(doc.updated_at, createdAt)) {
          result.skipped.push({ kind: 'document', id: eid, action });
          return;
        }
        s.documents.put({ ...doc, deleted_at: null, updated_at: at });
        return;
      case 'document_destroy': {
        if (!doc) return;
        if (!lwwOk(doc.updated_at, createdAt)) {
          result.skipped.push({ kind: 'document', id: eid, action });
          return;
        }
        s.documents.delete(eid);
        const blocks = await req(s.blocks.index('document_id').getAll(eid));
        blocks.forEach((b) => {
          if (b.type === 'image' && b.data_json) {
            const aid = decodeDataJson(b.data_json)?.data?.['asset-id'];
            if (aid) result.assetIds.add(aid);
          }
          result.linkClearIds.add(b.id);
          s.blocks.delete(b.id);
        });
        return;
      }
      case 'document_move':
        if (!doc) return;
        if (!lwwOk(doc.updated_at, createdAt)) {
          result.skipped.push({ kind: 'document', id: eid, action });
          return;
        }
        s.documents.put({ ...doc, parent_id: p.parent_id || null, updated_at: at });
        return;
      default:
        return;
    }
  }

  if (action.startsWith('block_')) {
    const blk = await req(s.blocks.get(eid));
    const documentId = (blk && blk.document_id) || p.document_id;
    if (documentId) result.documentIds.add(documentId);

    switch (action) {
      case 'block_create':
        if (blk) return;
        s.blocks.put({
          id: eid,
          document_id: p.document_id || '',
          parent_id: p.parent_id || null,
          type: p.type || 'paragraph',
          text: p.text || '',
          checked: Boolean(p.checked),
          data_json: p.data_json || null,
          order_index: Number(p.order_index ?? 1000.0),
          created_at: at,
          updated_at: at,
          deleted_at: null,
        });
        result.linkRebuildIds.add(eid);
        await touchDocument(s, p.document_id, at);
        return;
      case 'block_update': {
        if (!blk) {
          if (!p.document_id) return;
          s.blocks.put({
            id: eid,
            document_id: p.document_id,
            parent_id: p.parent_id || null,
            type: p.type || 'paragraph',
            text: p.text || '',
            checked: Boolean(p.checked),
            data_json: p.data_json || null,
            order_index: Number(p.order_index ?? 1000.0),
            created_at: at,
            updated_at: at,
            deleted_at: null,
          });
          result.linkRebuildIds.add(eid);
          await touchDocument(s, p.document_id, at);
          return;
        }
        if (!lwwOk(blk.updated_at, createdAt)) {
          result.skipped.push({ kind: 'block', id: eid, action, documentId });
          return;
        }
        const next = { ...blk, updated_at: at };
        if (has(p, 'text')) next.text = p.text || '';
        if (has(p, 'type')) next.type = p.type || 'paragraph';
        if (has(p, 'data_json')) next.data_json = p.data_json || null;
        s.blocks.put(next);
        if (has(p, 'text')) result.linkRebuildIds.add(eid);
        await touchDocument(s, blk.document_id, at);
        return;
      }
      case 'block_check':
        if (!blk) return;
        if (!lwwOk(blk.updated_at, createdAt)) {
          result.skipped.push({ kind: 'block', id: eid, action, documentId });
          return;
        }
        s.blocks.put({ ...blk, checked: Boolean(p.checked), updated_at: at });
        return;
      case 'block_move':
        if (!blk) return;
        if (!lwwOk(blk.updated_at, createdAt)) {
          result.skipped.push({ kind: 'block', id: eid, action, documentId });
          return;
        }
        s.blocks.put({
          ...blk,
          parent_id: p.parent_id || null,
          order_index: Number(p.order_index ?? 0),
          updated_at: at,
        });
        return;
      case 'block_delete':
        if (!blk) return;
        if (!lwwOk(blk.updated_at, createdAt)) {
          result.skipped.push({ kind: 'block', id: eid, action, documentId });
          return;
        }
        s.blocks.put({ ...blk, deleted_at: at, updated_at: at });
        result.linkClearIds.add(eid);
        return;
      default:
        return;
    }
  }
}

async function touchDocument(s, documentId, at) {
  if (!documentId) return;
  const doc = await req(s.documents.get(documentId));
  if (doc && (!doc.edited_at || doc.edited_at < at)) s.documents.put({ ...doc, edited_at: at });
}

/** Remote doc keeps the canonical title; rename an unrelated local doc with the same title. */
async function renameLocalTitleConflict(s, title, remoteId, result) {
  const rows = await req(s.documents.index('title').getAll(title));
  const local = rows.find((d) => !d.deleted_at && d.id !== remoteId);
  if (!local) return;
  const all = await req(s.documents.getAll());
  const titles = all.filter((d) => !d.deleted_at).map((d) => d.title || '');
  const newTitle = conflictCopyTitle(title, deviceId(), titles);
  s.documents.put({ ...local, title: newTitle, updated_at: new Date().toISOString() });
  result.renames.push({ original: title, renamed: newTitle });
}

/** Server-side renames returned by push (title_renames); no new operation. */
export async function applyTitleRenames(renames) {
  const notices = [];
  if (!renames || !renames.length) return notices;
  await transaction(['documents'], 'readwrite', async (s) => {
    for (const r of renames) {
      const id = r.entity_id || r['entity-id'];
      const title = r.new_title || r['new-title'];
      if (!id || !title) continue;
      const doc = await req(s.documents.get(id));
      if (!doc || doc.title === title) continue;
      s.documents.put({ ...doc, title, updated_at: new Date().toISOString() });
      notices.push({ original: doc.title, renamed: title });
    }
  });
  return notices;
}
