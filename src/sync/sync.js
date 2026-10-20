/**
 * Push / pull loop. Mirrors notes-app.services.sync:
 *   - pull pages by (since, since_id) cursor until a short page
 *   - push unsynced ops; apply title_renames
 *   - 2 s push debounce with a 30 s max wait, pull every 5 min
 *   - one run at a time; overlapping triggers queue one follow-up
 */
import { pullOperations, pushOperations } from '../api/sync.js';
import { getAllByIndex, getMeta, req, setMeta, transaction } from '../db/idb.js';
import { emit, on } from '../events.js';
import { t } from '../i18n.js';
import {
  downloadMissingAssets,
  isOpPushable,
  uploadPendingAssets,
} from '../services/assets.js';
import { loggedIn } from '../session.js';
import { applyRemoteOperations, applyTitleRenames } from './apply.js';
import { toWire } from './ops.js';

const PAGE_SIZE = 200;
const PUSH_BATCH = 500;
const PUSH_DEBOUNCE_MS = 2000;
const PUSH_MAX_WAIT_MS = 30000;
const PULL_INTERVAL_MS = 5 * 60 * 1000;

let busy = false;
let pending = null;
let pushTimer = 0;
let forceTimer = 0;
let pullTimer = 0;
let started = false;
let firstSyncPromise = Promise.resolve();
const teardown = [];

/** Resolves once the sync started by startSync() has finished (success or not). */
export function firstSync() {
  return firstSyncPromise;
}

/** Hooks so open editors persist before pull and reload after remote changes. */
const hooks = { beforePull: [], afterRemote: [] };

export function onBeforePull(fn) {
  hooks.beforePull.push(fn);
  return () => { hooks.beforePull = hooks.beforePull.filter((f) => f !== fn); };
}

export function onAfterRemoteApply(fn) {
  hooks.afterRemote.push(fn);
  return () => { hooks.afterRemote = hooks.afterRemote.filter((f) => f !== fn); };
}

async function runHooks(list, arg) {
  for (const fn of list) {
    try {
      await fn(arg);
    } catch (e) {
      console.error('[sync] hook failed', e);
    }
  }
}

function status(state, message = '') {
  emit('sync-status', { status: state, message });
}

function describe(e) {
  if (e && e.network) return 'offline';
  return e && e.message ? e.message : String(e);
}

function merge(prev, kind) {
  if (!prev) return kind;
  return prev === kind ? prev : 'sync';
}

function withLock(kind, fn) {
  if (busy) {
    pending = merge(pending, kind);
    return Promise.resolve('queued');
  }
  busy = true;
  return fn()
    .catch((e) => {
      status(e && e.network ? 'offline' : 'error', describe(e));
      return 'error';
    })
    .finally(() => {
      busy = false;
      const next = pending;
      pending = null;
      if (next === 'push') push();
      else if (next === 'pull') pull();
      else if (next === 'sync') syncNow();
    });
}

async function pullNow() {
  if (!loggedIn()) return 'unauthorized';
  await runHooks(hooks.beforePull);
  status('syncing', 'pull');

  let since = await getMeta('since', '0');
  let sinceId = await getMeta('since_id', '');
  const total = {
    applied: 0,
    documentsChanged: false,
    documentIds: new Set(),
    renames: [],
    skipped: [],
  };

  for (;;) {
    const items = await pullOperations({ since, sinceId, limit: PAGE_SIZE });
    const res = await applyRemoteOperations(items);
    total.applied += res.applied;
    total.documentsChanged ||= res.documentsChanged;
    res.documentIds.forEach((id) => total.documentIds.add(id));
    total.renames.push(...res.renames);
    total.skipped.push(...(res.skipped || []));

    if (items.length) {
      const last = items[items.length - 1];
      since = last.received_at || last.created_at || since;
      sinceId = last.id || '';
      await setMeta('since', since);
      await setMeta('since_id', sinceId);
    }
    if (items.length < PAGE_SIZE) break;
  }

  // Download binaries before notifying editors so image blocks can resolve locally.
  try {
    await downloadMissingAssets();
  } catch (e) {
    console.warn('[sync] asset download failed', e);
    if (e && e.network) throw e;
  }

  if (total.applied || total.renames.length || total.skipped.length) {
    if (total.documentsChanged || total.renames.length) emit('documents-changed');
    if (total.documentIds.size) emit('blocks-changed', { documentIds: total.documentIds });
    await runHooks(hooks.afterRemote, total);
  }

  toastConflicts(total.renames, total.skipped);
  status('ok', 'pull');
  return 'ok';
}

async function pushNow() {
  if (!loggedIn()) return 'unauthorized';
  status('syncing', 'push');

  try {
    await uploadPendingAssets();
  } catch (e) {
    console.warn('[sync] asset upload failed', e);
    throw e;
  }

  const unsynced = (await getAllByIndex('operations', 'synced', 0))
    .sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const pushable = [];
  for (const op of unsynced) {
    if (await isOpPushable(op)) pushable.push(op);
  }
  if (!pushable.length) {
    status('ok', unsynced.length ? 'waiting-assets' : 'push');
    return unsynced.length ? 'waiting-assets' : 'empty';
  }

  for (let i = 0; i < pushable.length; i += PUSH_BATCH) {
    const batch = pushable.slice(i, i + PUSH_BATCH);
    const res = await pushOperations(batch.map(toWire));
    await transaction('operations', 'readwrite', async (s) => {
      for (const op of batch) {
        const row = await req(s.operations.get(op.id));
        if (row) s.operations.put({ ...row, synced: 1 });
      }
    });
    const renames = (res && res.title_renames) || [];
    if (renames.length) {
      await runHooks(hooks.beforePull);
      const notices = await applyTitleRenames(renames);
      if (notices.length) {
        emit('documents-changed');
        await runHooks(hooks.afterRemote, { documentIds: new Set(renames.map((r) => r.entity_id)), renames: notices });
        toastRenames(notices);
      }
    }
  }
  status('ok', 'push');
  return 'ok';
}

function toastConflicts(renames, skipped) {
  if (renames?.length) {
    const detail = renames.length === 1
      ? `"${renames[0].original}" → "${renames[0].renamed}"`
      : `${renames.length}`;
    emit('toast', { message: `${t('conflictRename')}: ${detail}`, kind: 'warn' });
  }
  if (skipped?.length) {
    emit('toast', {
      message: `${t('conflictKeptLocal')} (${skipped.length})`,
      kind: 'warn',
    });
  }
}

function toastRenames(renames) {
  toastConflicts(renames, []);
}

export function push() {
  return withLock('push', pushNow);
}

export function pull() {
  return withLock('pull', pullNow);
}

export function syncNow() {
  return withLock('sync', async () => {
    const a = await pullNow();
    const b = await pushNow();
    const pushOk = b === 'ok' || b === 'empty' || b === 'waiting-assets';
    return a === 'ok' && pushOk ? 'ok' : b;
  });
}

export function schedulePush() {
  if (!loggedIn()) return;
  clearTimeout(pushTimer);
  if (!forceTimer) {
    forceTimer = setTimeout(() => {
      clearTimeout(pushTimer);
      forceTimer = 0;
      push();
    }, PUSH_MAX_WAIT_MS);
  }
  pushTimer = setTimeout(() => {
    clearTimeout(forceTimer);
    forceTimer = 0;
    push();
  }, PUSH_DEBOUNCE_MS);
}

export function startSync() {
  if (started) return;
  started = true;

  teardown.push(on('local-change', schedulePush));

  const onVisibility = () => {
    if (document.visibilityState === 'visible') pull();
    else push();
  };
  const onOnline = () => syncNow();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  teardown.push(() => document.removeEventListener('visibilitychange', onVisibility));
  teardown.push(() => window.removeEventListener('online', onOnline));

  pullTimer = setInterval(() => { if (loggedIn()) pull(); }, PULL_INTERVAL_MS);
  firstSyncPromise = syncNow().catch(() => 'error');
}

export function stopSync() {
  started = false;
  clearTimeout(pushTimer);
  clearTimeout(forceTimer);
  clearInterval(pullTimer);
  pushTimer = forceTimer = pullTimer = 0;
  teardown.splice(0).forEach((fn) => fn());
}
