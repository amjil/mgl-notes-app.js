/**
 * Export / import / share a document as plain text or simple HTML,
 * plus a full-library JSON snapshot (documents + blocks).
 */
import { getAll, req, transaction } from '../db/idb.js';
import { decodeDataJson } from '../editor/bridge.js';
import { emit } from '../events.js';
import { t } from '../i18n.js';
import { orderedBlocks } from '../search/text.js';
import { makeOperation } from '../sync/ops.js';
import { dateTitle, nowIso } from '../util.js';
import { createDocument, getBlocks, getDocument } from './notes.js';

function blockPlain(row) {
  const type = row.type || 'paragraph';
  const text = String(row.text || '').trim();
  if (type === 'image') return `[${t('image')}]`;
  if (type === 'bookmark') {
    const data = decodeDataJson(row.data_json).data || {};
    return data.url ? `[${data.title || t('bookmark')}](${data.url})` : `[${t('bookmark')}]`;
  }
  if (type === 'divider') return '---';
  if (type === 'heading-1') return `# ${text}`;
  if (type === 'heading-2') return `## ${text}`;
  if (type === 'heading-3') return `### ${text}`;
  if (type === 'todo') return `${row.checked ? '[x]' : '[ ]'} ${text}`;
  if (type === 'list-item') return `• ${text}`;
  if (type === 'ordered-list-item') return `1. ${text}`;
  return text;
}

export async function documentToText(documentId) {
  const doc = await getDocument(documentId);
  const rows = orderedBlocks(await getBlocks(documentId));
  const title = doc?.title || t('untitled');
  const body = rows.map(blockPlain).filter(Boolean).join('\n');
  return { title, text: body ? `${title}\n\n${body}` : title };
}

export async function documentToHtml(documentId) {
  const { title, text } = await documentToText(documentId);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]
  ));
  const paragraphs = text.split('\n').map((line) => `<p>${esc(line) || '&nbsp;'}</p>`).join('\n');
  return {
    title,
    html: `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head>`
      + `<body style="writing-mode:vertical-lr;font-family:serif">${paragraphs}</body></html>`,
  };
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportDocument(documentId, format = 'text') {
  if (format === 'html') {
    const { title, html } = await documentToHtml(documentId);
    const name = `${(title || 'note').replace(/[\\/:*?"<>|]+/g, '_')}.html`;
    downloadBlob(name, new Blob([html], { type: 'text/html;charset=utf-8' }));
    return { title, format: 'html' };
  }
  const { title, text } = await documentToText(documentId);
  const name = `${(title || 'note').replace(/[\\/:*?"<>|]+/g, '_')}.txt`;
  downloadBlob(name, new Blob([text], { type: 'text/plain;charset=utf-8' }));
  return { title, format: 'text' };
}

export async function shareDocument(documentId) {
  const { title, text } = await documentToText(documentId);
  if (navigator.share) {
    await navigator.share({ title, text });
    return true;
  }
  await exportDocument(documentId, 'text');
  return false;
}

// ---------------------------------------------------------------------------
// Import (round-trips the text/HTML shapes produced above)
// ---------------------------------------------------------------------------

/** Parse one exported body line into a seed block. */
export function parseExportLine(line) {
  const raw = String(line ?? '');
  if (raw === '---') return { type: 'divider', text: '', checked: false, data_json: null };
  if (raw.startsWith('### ')) {
    return { type: 'heading-3', text: raw.slice(4), checked: false, data_json: null };
  }
  if (raw.startsWith('## ')) {
    return { type: 'heading-2', text: raw.slice(3), checked: false, data_json: null };
  }
  if (raw.startsWith('# ')) {
    return { type: 'heading-1', text: raw.slice(2), checked: false, data_json: null };
  }
  const todoDone = raw.match(/^\[x\]\s(.*)$/i);
  if (todoDone) {
    return { type: 'todo', text: todoDone[1], checked: true, data_json: null };
  }
  const todoOpen = raw.match(/^\[\s?\]\s(.*)$/);
  if (todoOpen) {
    return { type: 'todo', text: todoOpen[1], checked: false, data_json: null };
  }
  if (raw.startsWith('• ')) {
    return { type: 'list-item', text: raw.slice(2), checked: false, data_json: null };
  }
  const ordered = raw.match(/^\d+\.\s(.*)$/);
  if (ordered) {
    return { type: 'ordered-list-item', text: ordered[1], checked: false, data_json: null };
  }
  const bookmark = raw.match(/^\[([^\]]*)\]\((https?:[^)\s]+)\)$/i);
  if (bookmark) {
    return {
      type: 'bookmark',
      text: '',
      checked: false,
      data_json: JSON.stringify({ data: { title: bookmark[1], url: bookmark[2], desc: '' } }),
    };
  }
  return { type: 'paragraph', text: raw, checked: false, data_json: null };
}

function titleFromFilename(name) {
  const base = String(name || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  return base.trim();
}

/** Split exported plain text into title + seed blocks. */
export function parseExportText(text, { filename = '' } = {}) {
  const normalized = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  let title = '';
  let bodyStart = 0;

  if (lines.length) {
    title = lines[0].trim();
    bodyStart = 1;
    if (lines[1] === '') bodyStart = 2;
  }
  if (!title) title = titleFromFilename(filename);

  const bodyLines = lines.slice(bodyStart);
  const blocks = bodyLines.length
    ? bodyLines.map(parseExportLine)
    : [{ type: 'paragraph', text: '', checked: false, data_json: null }];

  return { title, blocks };
}

function decodeHtmlEntities(s) {
  return String(s ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');
}

function stripHtmlToLine(fragment) {
  return decodeHtmlEntities(
    String(fragment ?? '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  ).replace(/\r\n/g, '\n').trimEnd();
}

/** Turn exported (or arbitrary) HTML into plain text for parseExportText. */
export function htmlToImportText(html) {
  const raw = String(html ?? '');
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripHtmlToLine(titleMatch[1]).trim() : '';

  let body = raw;
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) body = bodyMatch[1];

  const pMatches = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  let lines;
  if (pMatches.length) {
    lines = pMatches.map((m) => stripHtmlToLine(m[1]));
  } else {
    lines = stripHtmlToLine(
      body
        .replace(/<\/\s*(?:div|h[1-6]|li)\s*>/gi, '\n')
        .replace(/<\s*br\s*\/?>/gi, '\n'),
    ).split('\n').map((l) => l.trimEnd());
  }

  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

  // Our exporter puts title as the first <p>; prefer <title> when present.
  if (title && lines[0]?.trim() === title) {
    return `${title}\n\n${lines.slice(1).join('\n')}`;
  }
  if (title) return `${title}\n\n${lines.join('\n')}`;
  return lines.join('\n');
}

function isHtmlFile(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  return name.endsWith('.html') || name.endsWith('.htm') || type.includes('html');
}

/**
 * Create a normal document from an exported .txt / .html file.
 * @returns {Promise<{ id: string, title: string }>}
 */
export async function importDocumentFile(file, { parentId = null } = {}) {
  if (!file) throw new Error('No file');
  const raw = await file.text();
  const text = isHtmlFile(file) ? htmlToImportText(raw) : raw;
  const { title, blocks } = parseExportText(text, { filename: file.name });
  return createDocument({
    title: title || '',
    type: 'normal',
    parentId,
    blocks,
  });
}

/** Open a file picker and import the chosen .txt / .html note. */
export function pickAndImportDocument({ parentId = null } = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.html,.htm,text/plain,text/html';
    input.style.display = 'none';
    let settled = false;
    const finish = (value, err) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      input.remove();
      if (err) reject(err);
      else resolve(value);
    };
    input.addEventListener('change', async () => {
      const file = input.files?.[0] || null;
      if (!file) {
        finish(null);
        return;
      }
      try {
        finish(await importDocumentFile(file, { parentId }));
      } catch (err) {
        finish(undefined, err);
      }
    });
    // Browsers often omit change on cancel; treat return-to-window with no file as cancel.
    const onFocus = () => {
      setTimeout(() => {
        if (!settled && !input.files?.length) finish(null);
      }, 500);
    };
    window.addEventListener('focus', onFocus);
    document.body.append(input);
    input.click();
  });
}

// ---------------------------------------------------------------------------
// Full-library JSON snapshot (tree, spans, wiki/block-ref ids)
// ---------------------------------------------------------------------------

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const raw = String(dataUrl || '');
  const comma = raw.indexOf(',');
  if (comma === -1) return null;
  const header = raw.slice(0, comma);
  const b64 = raw.slice(comma + 1);
  const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function backupRowIsNewer(incoming, existing) {
  if (!existing) return true;
  if (existing.deleted_at && !incoming.deleted_at) return true;
  const a = String(incoming.updated_at || incoming.edited_at || '');
  const b = String(existing.updated_at || existing.edited_at || '');
  if (a && b && a > b) return true;
  return false;
}

/** Snapshot of non-deleted documents and their live blocks. */
export function buildAllBackupPayload(documents, blocks, exportedAt = nowIso(), assets = []) {
  const activeDocs = (documents || []).filter((d) => d && d.id && !d.deleted_at);
  const activeDocIds = new Set(activeDocs.map((d) => d.id));
  const activeBlocks = (blocks || []).filter(
    (b) => b && b.id && !b.deleted_at && activeDocIds.has(b.document_id),
  );
  const activeAssets = (assets || []).filter((a) => a && a.id && !a.deleted_at);
  return {
    version: 1,
    exported_at: exportedAt,
    documents: activeDocs,
    blocks: activeBlocks,
    assets: activeAssets,
  };
}

async function serializeAssetForBackup(row) {
  let data_url = null;
  if (row.blob) {
    try {
      data_url = await blobToDataUrl(row.blob);
    } catch {
      data_url = null;
    }
  }
  return {
    id: row.id,
    mime: row.mime,
    name: row.name,
    filename: row.filename,
    size: row.size,
    sha256: row.sha256,
    upload_status: row.upload_status,
    created_at: row.created_at,
    deleted_at: null,
    data_url,
  };
}

/** Parse and validate a v1 backup object or JSON string. */
export function parseAllBackup(input) {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      throw new Error('Invalid backup');
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid backup');
  }
  if (data.version !== 1) throw new Error('Unsupported backup version');
  if (!Array.isArray(data.documents) || !Array.isArray(data.blocks)) {
    throw new Error('Invalid backup');
  }
  const assets = Array.isArray(data.assets) ? data.assets : [];
  return buildAllBackupPayload(data.documents, data.blocks, data.exported_at || nowIso(), assets);
}

/** Export every active document and block as a JSON backup download. */
export async function exportAllBackup() {
  const [documents, blocks, assetRows] = await Promise.all([
    getAll('documents'),
    getAll('blocks'),
    getAll('assets'),
  ]);
  const exportedAt = nowIso();
  const payload = buildAllBackupPayload(documents, blocks, exportedAt);
  payload.assets = await Promise.all(
    (assetRows || []).filter((a) => a && a.id && !a.deleted_at).map(serializeAssetForBackup),
  );
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  downloadBlob(`mgl-notes-backup-${dateTitle()}.json`, blob);
  return {
    documents: payload.documents.length,
    blocks: payload.blocks.length,
    assets: payload.assets.length,
  };
}

/**
 * Restore documents and blocks from a full-library backup JSON file.
 * Idempotent: skips rows whose id already exists; queues document_create /
 * block_create ops for newly written rows, then rebuilds wiki/tag links.
 */
export async function importBackupFile(file) {
  if (!file) throw new Error('No file');
  const raw = await file.text();
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.documents) || !Array.isArray(data.blocks)) {
    throw new Error('Invalid backup format');
  }

  const now = nowIso();
  const importedDocIds = new Set();

  const assetList = Array.isArray(data.assets) ? data.assets : [];

  await transaction(['documents', 'blocks', 'assets', 'operations'], 'readwrite', async (s) => {
    for (const doc of data.documents) {
      if (!doc?.id) continue;
      const existing = await req(s.documents.get(doc.id));
      if (existing && !backupRowIsNewer(doc, existing)) continue;
      s.documents.put({ ...existing, ...doc, deleted_at: doc.deleted_at ?? null });
      importedDocIds.add(doc.id);
      if (!existing) {
        s.operations.put(makeOperation('document', doc.id, 'document_create', {
          id: doc.id,
          title: doc.title || '',
          type: doc.type || 'normal',
          parent_id: doc.parent_id || null,
          icon: doc.icon || null,
          cover: doc.cover || null,
        }, doc.created_at || now));
      }
    }

    for (const blk of data.blocks) {
      if (!blk?.id || !blk?.document_id) continue;
      const existing = await req(s.blocks.get(blk.id));
      if (existing && !backupRowIsNewer(blk, existing)) continue;
      s.blocks.put({ ...existing, ...blk, deleted_at: blk.deleted_at ?? null });
      importedDocIds.add(blk.document_id);
      if (!existing) {
        s.operations.put(makeOperation('block', blk.id, 'block_create', {
          id: blk.id,
          document_id: blk.document_id,
          parent_id: blk.parent_id || null,
          type: blk.type || 'paragraph',
          text: blk.text || '',
          checked: Boolean(blk.checked),
          data_json: blk.data_json ?? null,
          order_index: Number(blk.order_index ?? 1000),
        }, blk.created_at || now));
      }
    }

    for (const asset of assetList) {
      if (!asset?.id) continue;
      const existing = await req(s.assets.get(asset.id));
      if (existing && !backupRowIsNewer(asset, existing)) continue;
      const blob = asset.data_url ? dataUrlToBlob(asset.data_url) : (existing?.blob ?? null);
      s.assets.put({
        id: asset.id,
        blob,
        mime: asset.mime || existing?.mime || 'application/octet-stream',
        name: asset.name || asset.filename || existing?.name || 'file',
        filename: asset.filename || asset.name || existing?.filename || 'file',
        size: Number(asset.size) || blob?.size || existing?.size || 0,
        sha256: asset.sha256 || existing?.sha256 || '',
        upload_status: blob ? (asset.upload_status || 'pending') : (asset.upload_status || existing?.upload_status || 'pending_download'),
        created_at: asset.created_at || existing?.created_at || now,
        deleted_at: null,
      });
      if (!existing) {
        s.operations.put(makeOperation('asset', asset.id, 'asset_create', {
          id: asset.id,
          filename: asset.filename || asset.name || 'file',
          mime_type: asset.mime || 'application/octet-stream',
          size_bytes: Number(asset.size) || blob?.size || 0,
          sha256: asset.sha256 || '',
        }, asset.created_at || now));
      }
    }
  });

  if (importedDocIds.size) {
    const { reindexAllLinks } = await import('./links.js');
    await reindexAllLinks();
    emit('documents-changed', { documentIds: importedDocIds });
    emit('local-change', { documentIds: importedDocIds });
  }
  return { count: importedDocIds.size };
}

/** Alias for importBackupFile. */
export async function importAllBackup(file) {
  return importBackupFile(file);
}

/** Open a file picker and restore a `.json` library backup. */
export function pickAndRestoreBackup() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    const done = async (file) => {
      input.remove();
      if (!file) { resolve(null); return; }
      try {
        resolve(await importBackupFile(file));
      } catch (err) {
        reject(err);
      }
    };
    input.addEventListener('change', () => void done(input.files?.[0] || null));
    input.addEventListener('cancel', () => void done(null));
    document.body.append(input);
    input.click();
  });
}

/** Alias for pickAndRestoreBackup. */
export function pickAndImportBackup() {
  return pickAndRestoreBackup();
}
