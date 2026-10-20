/**
 * Spaced repetition (SM-2) service over `flashcard` blocks.
 * Grades: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy
 */
import { getAll, req, transaction } from '../db/idb.js';
import { decodeDataJson } from '../editor/bridge.js';
import { makeOperation } from '../sync/ops.js';
import { emit } from '../events.js';
import { addDays, dateTitle, nowIso } from '../util.js';

/**
 * Compute next SM-2 scheduling state for a card.
 * @param {{ reps?: number, interval?: number, ease?: number }} state
 * @param {0|1|2|3} grade
 * @param {Date} [now]
 */
export function scheduleSm2(state = {}, grade = 2, now = new Date()) {
  let reps = Number(state.reps) || 0;
  let interval = Number(state.interval) || 0;
  let ease = Number(state.ease) || 2.5;

  if (grade === 0) {
    reps = 0;
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    if (reps === 0) {
      interval = grade === 3 ? 4 : 1;
    } else if (reps === 1) {
      interval = grade === 1 ? 2 : (grade === 3 ? 6 : 4);
    } else {
      const mult = grade === 1 ? 1.2 : (grade === 3 ? ease * 1.3 : ease);
      interval = Math.max(interval + 1, Math.round(interval * mult));
    }
    reps += 1;
    if (grade === 1) ease = Math.max(1.3, ease - 0.15);
    else if (grade === 3) ease += 0.15;
  }

  const due = dateTitle(addDays(now, interval));
  return {
    reps,
    interval,
    ease: Math.round(ease * 100) / 100,
    due,
    last_reviewed_at: now.toISOString(),
  };
}

/** List all active flashcard blocks across active documents. */
export async function listFlashcards({ dueOnly = false, today = dateTitle() } = {}) {
  const [docs, blocks] = await Promise.all([
    getAll('documents'),
    getAll('blocks'),
  ]);
  const docById = new Map(docs.filter((d) => !d.deleted_at).map((d) => [d.id, d]));
  const cards = [];

  blocks.forEach((b) => {
    if (!b || b.deleted_at || b.type !== 'flashcard') return;
    const doc = docById.get(b.document_id);
    if (!doc) return;
    const extra = decodeDataJson(b.data_json);
    const data = extra.data || {};
    const front = (data.front ?? b.text ?? '').trim();
    const back = (data.back ?? '').trim();
    if (!front && !back) return;

    const due = data.due || today;
    if (dueOnly && due > today) return;

    cards.push({
      blockId: b.id,
      documentId: doc.id,
      docTitle: doc.title || '',
      front,
      back,
      due,
      interval: Number(data.interval) || 0,
      ease: Number(data.ease) || 2.5,
      reps: Number(data.reps) || 0,
    });
  });

  return cards.sort((a, b) => a.due.localeCompare(b.due) || a.blockId.localeCompare(b.blockId));
}

/** Save SM-2 review result to IndexedDB and queue a `block_update` sync op. */
export async function recordFlashcardReview(blockId, grade) {
  const now = nowIso();
  let docId = null;

  await transaction(['blocks', 'operations'], 'readwrite', async (s) => {
    const blk = await req(s.blocks.get(blockId));
    if (!blk || blk.deleted_at) return;
    docId = blk.document_id;
    const extra = decodeDataJson(blk.data_json);
    const prevData = extra.data || {};
    const nextSched = scheduleSm2(prevData, grade, new Date());
    const nextData = {
      ...prevData,
      front: prevData.front ?? blk.text ?? '',
      back: prevData.back ?? '',
      ...nextSched,
    };
    const nextExtra = { ...extra, data: nextData };
    const dataJson = JSON.stringify(nextExtra);

    s.blocks.put({
      ...blk,
      data_json: dataJson,
      updated_at: now,
    });
    s.operations.put(makeOperation('block', blockId, 'block_update', {
      data_json: dataJson,
    }, now));
  });

  if (docId) {
    emit('local-change', { documentIds: new Set([docId]) });
  }
}
