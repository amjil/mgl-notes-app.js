/**
 * Bidirectional wiki-links / #tags — local derived index (never synced).
 * Mirrors notes-app.services.link.
 */
import { get, getAll, getAllByIndex, req, transaction } from '../db/idb.js';
import { navigate } from '../router.js';
import { tagTargetsFromText, wikiTargetsFromText } from '../editor/wiki.js';
import { fold } from '../search/text.js';
import { createDocument, findDailyByTitle } from './notes.js';

const DATE_TITLE = /^\d{4}-\d{2}-\d{2}$/;

export async function findDocumentByTitle(title) {
  const exactRows = await getAllByIndex('documents', 'title', title);
  const exact = exactRows.find((d) => !d.deleted_at);
  if (exact) return exact;

  const targetFolded = fold(title);
  if (!targetFolded) return null;
  const allDocs = await getAll('documents');
  return allDocs.find((d) => !d.deleted_at && d.title && fold(d.title) === targetFolded) || null;
}

export async function openOrCreateByTitle(title) {
  const clean = String(title || '').trim().replace(/^#/, '');
  if (!clean) return null;

  if (DATE_TITLE.test(clean)) {
    const daily = await findDailyByTitle(clean);
    if (daily) {
      navigate(`/today/${encodeURIComponent(clean)}`);
      return daily.id;
    }
  }

  const found = await findDocumentByTitle(clean);
  if (found) {
    if (found.type === 'daily') navigate(`/today/${encodeURIComponent(found.title)}`);
    else navigate(`/doc/${found.id}`);
    return found.id;
  }

  const doc = await createDocument({ title: clean, type: 'normal' });
  navigate(`/doc/${doc.id}`);
  return doc.id;
}

export async function openBlockRef(blockId) {
  const blk = await get('blocks', blockId);
  if (!blk || blk.deleted_at) return null;
  const doc = await get('documents', blk.document_id);
  if (!doc || doc.deleted_at) return null;
  const q = `?block=${encodeURIComponent(blockId)}`;
  if (doc.type === 'daily' && doc.title) {
    navigate(`/today/${encodeURIComponent(doc.title)}${q}`);
  } else {
    navigate(`/doc/${doc.id}${q}`);
  }
  return doc.id;
}

export async function handleLinkTap(target) {
  if (target && typeof target === 'object' && target.type === 'block' && target.id) {
    return openBlockRef(target.id);
  }
  if (typeof target === 'string') return openOrCreateByTitle(target);
  return null;
}

function rankMatch(items, query, key = (x) => x) {
  const q = String(query || '').trim().toLowerCase();
  const list = items || [];
  if (!q) return list.slice(0, 20);
  const scored = [];
  list.forEach((item) => {
    const low = String(key(item)).toLowerCase();
    let score = 0;
    if (low === q) score = 1;
    else if (low.startsWith(q)) score = 2;
    else if (low.includes(q)) score = 3;
    if (score) scored.push({ item, score });
  });
  return scored.sort((a, b) => a.score - b.score || key(a.item).localeCompare(key(b.item)))
    .slice(0, 20)
    .map((s) => s.item);
}

export async function documentTitles() {
  const docs = await getAll('documents');
  return docs
    .filter((d) => !d.deleted_at && d.title)
    .map((d) => d.title)
    .sort((a, b) => a.localeCompare(b));
}

export async function cachedTags() {
  const rows = await getAll('block_links');
  const tags = new Set();
  rows.forEach((r) => {
    if (r.link_type === 'tag' && r.target_id) tags.add(r.target_id);
  });
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/** All #tags with how many active documents mention each. */
export async function listTagsWithCounts() {
  const links = await getAll('block_links');
  const tagLinks = links.filter((r) => r.link_type === 'tag' && r.target_id);
  if (!tagLinks.length) return [];

  const docs = await getAll('documents');
  const activeDocIds = new Set(docs.filter((d) => !d.deleted_at).map((d) => d.id));

  // 仅查询包含标签的 block，避免全表读取所有 blocks
  const uniqueBlockIds = [...new Set(tagLinks.map((r) => r.source_id))];
  const blockDocMap = new Map();
  await Promise.all(uniqueBlockIds.map(async (bid) => {
    const blk = await get('blocks', bid);
    if (blk && !blk.deleted_at && activeDocIds.has(blk.document_id)) {
      blockDocMap.set(bid, blk.document_id);
    }
  }));

  const byTag = new Map();
  tagLinks.forEach((r) => {
    const docId = blockDocMap.get(r.source_id);
    if (!docId) return;
    let set = byTag.get(r.target_id);
    if (!set) {
      set = new Set();
      byTag.set(r.target_id, set);
    }
    set.add(docId);
  });

  return [...byTag.entries()]
    .map(([tag, ids]) => ({ tag, count: ids.size }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * Documents that mention `#tag` (tag links only), grouped with mention snippets.
 */
export async function notesForTag(tag) {
  const clean = String(tag || '').trim().replace(/^#/, '');
  if (!clean) return [];
  const rows = (await backlinksForTitle(clean)).filter((r) => r.linkType === 'tag');
  const map = new Map();
  rows.forEach((r) => {
    let g = map.get(r.documentId);
    if (!g) {
      g = {
        documentId: r.documentId,
        title: r.title || '',
        type: r.type || 'normal',
        mentions: [],
      };
      map.set(r.documentId, g);
    }
    g.mentions.push(r);
  });
  return [...map.values()].sort((a, b) => {
    const ta = a.title || '';
    const tb = b.title || '';
    return ta.localeCompare(tb) || a.documentId.localeCompare(b.documentId);
  });
}

export async function linkSuggestions(query) {
  return rankMatch(await documentTitles(), query);
}

export async function tagSuggestions(query) {
  return rankMatch(await cachedTags(), query);
}

/** Non-empty blocks for `((` autocomplete — returns [{ id, label }]. */
export async function blockSuggestions(query) {
  const blocks = await getAll('blocks');
  const q = String(query || '').trim().toLowerCase();
  const candidates = blocks
    .filter((b) => !b.deleted_at && b.text && b.text.trim().length > 0)
    .map((b) => ({
      id: b.id,
      label: b.text.replace(/\s+/g, ' ').trim().slice(0, 32),
      full: b.text.toLowerCase(),
    }));

  const matched = q
    ? candidates.filter((c) => c.full.includes(q) || c.id.startsWith(q))
    : candidates;

  return matched.slice(0, 15);
}

export async function clearLinksForBlock(blockId) {
  await transaction('block_links', 'readwrite', async (s) => {
    const rows = await req(s.block_links.index('source_id').getAll(blockId));
    rows.forEach((r) => s.block_links.delete([r.source_id, r.target_id, r.link_type]));
  });
}

export async function rebuildLinksForBlock(blockId, text) {
  const wiki = wikiTargetsFromText(text);
  const tags = tagTargetsFromText(text);

  await transaction('block_links', 'readwrite', async (s) => {
    const existing = await req(s.block_links.index('source_id').getAll(blockId));
    existing.forEach((r) => s.block_links.delete([r.source_id, r.target_id, r.link_type]));
    wiki.forEach((target) => {
      s.block_links.put({ source_id: blockId, target_id: target, link_type: 'wiki' });
    });
    tags.forEach((target) => {
      s.block_links.put({ source_id: blockId, target_id: target, link_type: 'tag' });
    });
  });
}

export async function rebuildLinksForRows(rows) {
  for (const row of rows || []) {
    if (!row?.id) continue;
    await rebuildLinksForBlock(row.id, row.text || '');
  }
}

export async function clearLinksForIds(ids) {
  for (const id of ids || []) await clearLinksForBlock(id);
}

export async function reindexAllLinks() {
  const blocks = await getAll('blocks');
  const active = blocks.filter((b) => !b.deleted_at);
  await transaction('block_links', 'readwrite', async (s) => {
    s.block_links.clear();
  });
  await rebuildLinksForRows(active.map((b) => ({ id: b.id, text: b.text || '' })));
}

/**
 * Mentions that link to `title` (backlinks).
 * One row per source block; pass `excludeDocumentId` to skip the open note.
 */
export async function backlinksForTitle(title, { excludeDocumentId = null } = {}) {
  let rows = await getAllByIndex('block_links', 'target_id', title);
  if (!rows.length) {
    const targetFolded = fold(title);
    if (targetFolded) {
      const all = await getAll('block_links');
      rows = all.filter((r) => fold(r.target_id) === targetFolded);
    }
  }
  const out = [];
  for (const row of rows) {
    const id = row.source_id;
    const blk = await get('blocks', id);
    if (!blk || blk.deleted_at) continue;
    if (excludeDocumentId && blk.document_id === excludeDocumentId) continue;
    const doc = await get('documents', blk.document_id);
    if (!doc || doc.deleted_at) continue;
    out.push({
      blockId: id,
      documentId: doc.id,
      title: doc.title || '',
      type: doc.type || 'normal',
      text: blk.text || '',
      linkType: row.link_type || 'wiki',
    });
  }
  return out;
}

/**
 * Build nodes and edges for the interactive Graph View.
 * Nodes: { id, label, kind: 'doc'|'daily'|'ghost'|'tag', docId?, degree }
 * Edges: { source, target, kind: 'wiki'|'tag'|'child' }
 */
export async function buildKnowledgeGraph({ includeTags = true, includeOrphans = true } = {}) {
  const [docs, blocks, links] = await Promise.all([
    getAll('documents'),
    getAll('blocks'),
    getAll('block_links'),
  ]);

  const activeDocs = docs.filter((d) => !d.deleted_at);
  const docById = new Map(activeDocs.map((d) => [d.id, d]));
  const docByTitle = new Map();
  activeDocs.forEach((d) => {
    const t = (d.title || '').trim();
    if (t && !docByTitle.has(t)) docByTitle.set(t, d);
  });

  const blockToDoc = new Map();
  blocks.forEach((b) => {
    if (!b.deleted_at && docById.has(b.document_id)) {
      blockToDoc.set(b.id, b.document_id);
    }
  });

  const nodesMap = new Map();
  const edgesMap = new Map();

  const ensureNode = (key, props) => {
    if (!nodesMap.has(key)) {
      nodesMap.set(key, { id: key, degree: 0, ...props });
    }
    return nodesMap.get(key);
  };

  // 1. 注册所有有效文档节点及父子层级边
  activeDocs.forEach((d) => {
    ensureNode(`doc:${d.id}`, {
      label: d.title || '',
      kind: d.type === 'daily' ? 'daily' : 'doc',
      docId: d.id,
      docType: d.type || 'normal',
    });
  });

  activeDocs.forEach((d) => {
    if (d.parent_id && docById.has(d.parent_id)) {
      const src = `doc:${d.parent_id}`;
      const dst = `doc:${d.id}`;
      const eKey = `${src}->${dst}:child`;
      edgesMap.set(eKey, { source: src, target: dst, kind: 'child' });
    }
  });

  // 2. 遍历 block_links 构建双链与标签边
  links.forEach((row) => {
    const srcDocId = blockToDoc.get(row.source_id);
    if (!srcDocId) return;
    const targetTitle = String(row.target_id || '').trim();
    if (!targetTitle) return;

    const srcKey = `doc:${srcDocId}`;
    if (row.link_type === 'tag') {
      if (!includeTags) return;
      const tagKey = `tag:${targetTitle}`;
      ensureNode(tagKey, {
        label: `#${targetTitle}`,
        rawTag: targetTitle,
        kind: 'tag',
      });
      const eKey = `${srcKey}->${tagKey}:tag`;
      edgesMap.set(eKey, { source: srcKey, target: tagKey, kind: 'tag' });
    } else {
      const targetDoc = docByTitle.get(targetTitle);
      let dstKey;
      if (targetDoc) {
        if (targetDoc.id === srcDocId) return; // 忽略自环
        dstKey = `doc:${targetDoc.id}`;
      } else {
        dstKey = `ghost:${targetTitle}`;
        ensureNode(dstKey, {
          label: targetTitle,
          kind: 'ghost',
        });
      }
      const eKey = `${srcKey}->${dstKey}:wiki`;
      edgesMap.set(eKey, { source: srcKey, target: dstKey, kind: 'wiki' });
    }
  });

  // 3. 统计节点度数并按需过滤孤立点
  const edges = [...edgesMap.values()];
  edges.forEach((e) => {
    const s = nodesMap.get(e.source);
    const t = nodesMap.get(e.target);
    if (s) s.degree += 1;
    if (t) t.degree += 1;
  });

  let nodes = [...nodesMap.values()];
  if (!includeOrphans) {
    nodes = nodes.filter((n) => n.degree > 0);
  }

  return { nodes, edges };
}
