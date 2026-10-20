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

/** Snapshot of non-deleted documents and their live blocks. */
export function buildAllBackupPayload(documents, blocks, exportedAt = nowIso()) {
  const activeDocs = (documents || []).filter((d) => d && d.id && !d.deleted_at);
  const activeDocIds = new Set(activeDocs.map((d) => d.id));
  const activeBlocks = (blocks || []).filter(
    (b) => b && b.id && !b.deleted_at && activeDocIds.has(b.document_id),
  );
  return {
    version: 1,
    exported_at: exportedAt,
    documents: activeDocs,
    blocks: activeBlocks,
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
  return buildAllBackupPayload(data.documents, data.blocks, data.exported_at || nowIso());
}

function snapshotDocument(doc, now) {
  return {
    id: doc.id,
    title: doc.title || '',
    type: doc.type || 'normal',
    parent_id: doc.parent_id || null,
    icon: doc.icon || null,
    cover: doc.cover || null,
    created_at: doc.created_at || now,
    updated_at: now,
    edited_at: doc.edited_at || now,
    deleted_at: null,
  };
}

function snapshotBlock(block, now) {
  return {
    id: block.id,
    document_id: block.document_id,
    parent_id: block.parent_id || null,
    type: block.type || 'paragraph',
    text: block.text || '',
    checked: Boolean(block.checked),
    data_json: block.data_json ?? null,
    order_index: Number(block.order_index ?? 1000),
    created_at: block.created_at || now,
    updated_at: now,
    deleted_at: null,
  };
}

/** Export every active document and block as a JSON backup download. */
export async function exportAllBackup() {
  const [documents, blocks] = await Promise.all([
    getAll('documents'),
    getAll('blocks'),
  ]);
  const payload = buildAllBackupPayload(documents, blocks, nowIso());
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  downloadBlob(`mgl-notes-backup-${dateTitle()}.json`, blob);
  return { documents: payload.documents.length, blocks: payload.blocks.length };
}

/**
 * Restore a JSON snapshot into the current library, keeping original ids so
 * parent trees, content-spans, [[wiki]] titles and ((block-ref)) links survive.
 * Existing rows with the same id are overwritten; missing rows are created
 * (and queued as unsynced operations).
 */
export async function importAllBackup(source) {
  let raw = source;
  if (source && typeof source.text === 'function') raw = await source.text();
  const payload = parseAllBackup(raw);
  const now = nowIso();
  const linkRows = [];
  const documentIds = [];

  await transaction(['documents', 'blocks', 'operations'], 'readwrite', async (s) => {
    for (const incoming of payload.documents) {
      const existing = await req(s.documents.get(incoming.id));
      const row = snapshotDocument(incoming, now);
      s.documents.put(row);
      documentIds.push(row.id);

      if (!existing) {
        s.operations.put(makeOperation('document', row.id, 'document_create', {
          id: row.id,
          title: row.title,
          type: row.type,
          parent_id: row.parent_id,
          icon: row.icon,
          cover: row.cover,
        }, now));
        continue;
      }
      if (existing.deleted_at) {
        s.operations.put(makeOperation('document', row.id, 'document_restore', {}, now));
      }
      const titleChanged = (existing.title || '') !== row.title;
      const iconChanged = (existing.icon || null) !== row.icon;
      const coverChanged = (existing.cover || null) !== row.cover;
      if (titleChanged || iconChanged || coverChanged) {
        const update = {};
        if (titleChanged) update.title = row.title;
        if (iconChanged) update.icon = row.icon;
        if (coverChanged) update.cover = row.cover;
        s.operations.put(makeOperation('document', row.id, 'document_update', update, now));
      }
      if ((existing.parent_id || null) !== row.parent_id) {
        s.operations.put(makeOperation('document', row.id, 'document_move', {
          parent_id: row.parent_id,
        }, now));
      }
    }

    for (const incoming of payload.blocks) {
      const existing = await req(s.blocks.get(incoming.id));
      const row = snapshotBlock(incoming, now);
      s.blocks.put(row);
      linkRows.push({ id: row.id, text: row.text });

      if (!existing || existing.deleted_at) {
        s.operations.put(makeOperation('block', row.id, 'block_create', {
          id: row.id,
          document_id: row.document_id,
          parent_id: row.parent_id,
          type: row.type,
          text: row.text,
          checked: row.checked,
          data_json: row.data_json,
          order_index: row.order_index,
        }, now));
        continue;
      }

      const textChanged = existing.text !== row.text;
      const typeChanged = existing.type !== row.type;
      const dataChanged = (existing.data_json ?? null) !== (row.data_json ?? null);
      const checkedChanged = Boolean(existing.checked) !== row.checked;
      const parentChanged = (existing.parent_id || null) !== row.parent_id;
      const orderChanged = Number(existing.order_index) !== Number(row.order_index);
      if (textChanged || typeChanged || dataChanged) {
        const update = {};
        if (textChanged) update.text = row.text;
        if (typeChanged) update.type = row.type;
        if (dataChanged) update.data_json = row.data_json;
        s.operations.put(makeOperation('block', row.id, 'block_update', update, now));
      }
      if (checkedChanged) {
        s.operations.put(makeOperation('block', row.id, 'block_check', { checked: row.checked }, now));
      }
      if (parentChanged || orderChanged) {
        s.operations.put(makeOperation('block', row.id, 'block_move', {
          parent_id: row.parent_id,
          order_index: row.order_index,
        }, now));
      }
    }
  });

  const { rebuildLinksForRows } = await import('./links.js');
  await rebuildLinksForRows(linkRows);
  const ids = new Set(documentIds);
  emit('documents-changed', { documentIds: ids });
  emit('local-change', { documentIds: ids });
  return { documents: payload.documents.length, blocks: payload.blocks.length };
}

/** Open a file picker and restore a `.json` library backup. */
export function pickAndImportBackup() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
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
        finish(await importAllBackup(file));
      } catch (err) {
        finish(undefined, err);
      }
    });
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
