/**
 * Full-text index over local documents. Note rows stay in mgl-notes-${userId};
 * FlexSearch keeps its own IndexedDB (mgl-notes-search-${userId}) and is
 * aligned from the note database. Logout closes the connection and does not
 * destroy the index.
 */
import { Document, IndexedDB } from 'flexsearch';
import { getAll, getMeta, setMeta } from '../db/idb.js';
import { on } from '../events.js';
import { getBlocks, getDocument } from '../services/notes.js';
import { debounce } from '../util.js';
import { SEARCH_REV, documentText, encoder, snippetFor } from './text.js';

const LIMIT = 30;
const SYNC_MS = 400;
const SIG_KEY = 'search_sigs';
const REV_KEY = 'search_rev';

let generation = 0;
let index = null;
let chain = Promise.resolve();
let stopListen = () => {};

function dbName(userId) {
  return `mgl-notes-search-${userId}`;
}

function signature(title, text) {
  let hash = 0x811c9dc5;
  const s = `${title}\n${text}`;
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${title.length}:${text.length}:${hash >>> 0}`;
}

function asSigs(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function closeHandles(doc) {
  if (!doc) return;
  doc.index?.forEach?.((field) => {
    try { field.db?.close?.(); } catch { /* already closed */ }
  });
}

export function closeSearch() {
  generation += 1;
  stopListen();
  stopListen = () => {};
  const current = index;
  index = null;
  if (!current) return;
  chain = chain.then(async () => {
    try { await current.commit(); } catch { /* connection already gone */ }
    closeHandles(current);
  }).catch(() => {});
}

export function openSearch(userId) {
  closeSearch();
  const gen = ++generation;
  const task = chain.then(() => start(userId, gen));
  chain = task.catch((err) => {
    console.warn('[search] open failed', err);
  });
  return task;
}

async function start(userId, gen) {
  const db = new IndexedDB(dbName(userId));
  const doc = new Document({
    tokenize: 'forward',
    encoder,
    document: {
      id: 'id',
      index: ['title', 'text'],
    },
    db,
  });
  await doc.db;
  if (gen !== generation) {
    closeHandles(doc);
    return;
  }

  index = doc;
  const rev = await getMeta(REV_KEY);
  let sigs = rev === SEARCH_REV ? asSigs(await getMeta(SIG_KEY, {})) : {};
  if (rev !== SEARCH_REV) {
    await doc.clear();
    sigs = {};
  }
  if (gen !== generation) return;
  stopListen = listen(gen);
  await align(doc, sigs, gen);
}

function listen(gen) {
  const dirtyIds = new Set();
  let needFull = false;

  const schedule = debounce(() => {
    if (gen !== generation || !index) return;
    const current = index;
    const idsToSync = new Set(dirtyIds);
    const full = needFull;
    dirtyIds.clear();
    needFull = false;

    chain = chain.then(async () => {
      if (gen !== generation || index !== current) return;
      const sigs = asSigs(await getMeta(SIG_KEY, {}));
      if (full || !idsToSync.size) {
        await align(current, sigs, gen);
      } else {
        await alignIncremental(current, sigs, idsToSync, gen);
      }
    }).catch((err) => {
      console.warn('[search] sync failed', err);
    });
  }, SYNC_MS);

  const queue = (detail) => {
    const ids = detail?.documentIds;
    if (ids && ids.size) {
      ids.forEach((id) => dirtyIds.add(id));
    } else {
      needFull = true;
    }
    schedule();
  };

  const offs = [
    on('documents-changed', queue),
    on('blocks-changed', queue),
    on('local-change', queue),
  ];
  return () => {
    schedule.cancel();
    offs.forEach((off) => off());
  };
}

async function align(doc, sigs, gen) {
  const documents = await getAll('documents');
  const blocks = await getAll('blocks');
  if (gen !== generation) return;

  const byDoc = new Map();
  blocks.forEach((block) => {
    if (!block || block.deleted_at) return;
    if (!byDoc.has(block.document_id)) byDoc.set(block.document_id, []);
    byDoc.get(block.document_id).push(block);
  });

  const next = {};
  let dirty = false;
  documents.forEach((document) => {
    if (!document || document.deleted_at) return;
    const title = document.title || '';
    const text = documentText(byDoc.get(document.id) || []);
    const sig = signature(title, text);
    next[document.id] = sig;
    if (sigs[document.id] === sig) return;
    dirty = true;
    doc.update({ id: document.id, title, text });
  });

  Object.keys(sigs).forEach((id) => {
    if (next[id]) return;
    dirty = true;
    doc.remove(id);
  });

  if (!dirty) {
    if (await getMeta(REV_KEY) !== SEARCH_REV) await setMeta(REV_KEY, SEARCH_REV);
    return;
  }
  await doc.commit();
  if (gen !== generation) return;
  await setMeta(SIG_KEY, next);
  await setMeta(REV_KEY, SEARCH_REV);
}

/** 仅针对变更的 documentIds 增量更新 FlexSearch 索引 */
async function alignIncremental(doc, sigs, docIds, gen) {
  const next = { ...sigs };
  let dirty = false;

  for (const id of docIds) {
    if (gen !== generation) return;
    const document = await getDocument(id);
    if (!document || document.deleted_at) {
      if (next[id]) {
        delete next[id];
        doc.remove(id);
        dirty = true;
      }
      continue;
    }
    const rows = await getBlocks(id);
    const title = document.title || '';
    const text = documentText(rows);
    const sig = signature(title, text);
    if (next[id] === sig) continue;
    next[id] = sig;
    doc.update({ id: document.id, title, text });
    dirty = true;
  }

  if (!dirty) return;
  await doc.commit();
  if (gen !== generation) return;
  await setMeta(SIG_KEY, next);
}

export async function searchNotes(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  await chain;
  const doc = index;
  if (!doc) return [];

  const groups = await doc.search(q, { limit: LIMIT });
  const titleHits = [];
  const textHits = [];
  (groups || []).forEach((group) => {
    const ids = group.result || [];
    if (group.field === 'title') titleHits.push(...ids);
    else textHits.push(...ids);
  });

  const ordered = [];
  const seen = new Set();
  [...titleHits, ...textHits].forEach((id) => {
    if (seen.has(id) || ordered.length >= LIMIT) return;
    seen.add(id);
    ordered.push(id);
  });

  const hits = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const id = ordered[i];
    const document = await getDocument(id);
    if (!document || document.deleted_at) continue;
    const rows = await getBlocks(id);
    hits.push({
      id: document.id,
      title: document.title || '',
      type: document.type || 'normal',
      edited_at: document.edited_at,
      updated_at: document.updated_at,
      snippet: snippetFor(rows, q),
    });
  }
  return hits;
}
