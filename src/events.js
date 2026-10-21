/**
 * App-wide event bus with Multi-Tab BroadcastChannel synchronization.
 *   documents-changed   { documentIds?: Set }   list / titles may differ; IDs when known
 *   blocks-changed      { documentIds: Set }    remote ops touched these documents
 *   local-change        { documentIds: Set }    new unsynced ops; empty Set = unknown scope
 *   sync-status         { status, message }     idle | syncing | ok | error | offline
 *   toast               { message, kind }
 */
const target = new EventTarget();
const tabId = Math.random().toString(36).slice(2);
const channel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('mgl-notes-bus')
  : null;

const CROSS_TAB_EVENTS = new Set(['documents-changed', 'blocks-changed', 'local-change']);

function serializeDetail(detail = {}) {
  const out = { ...detail };
  if (out.documentIds instanceof Set) {
    out.documentIds = [...out.documentIds];
  }
  return out;
}

function deserializeDetail(detail = {}) {
  const out = { ...detail };
  if (Array.isArray(out.documentIds)) {
    out.documentIds = new Set(out.documentIds);
  }
  return out;
}

if (channel) {
  channel.addEventListener('message', (e) => {
    const { sender, type, detail } = e.data || {};
    if (!type || sender === tabId) return;
    const hydrated = deserializeDetail(detail);

    if (type === 'local-change') {
      target.dispatchEvent(new CustomEvent('documents-changed', { detail: hydrated }));
      if (hydrated.documentIds?.size) {
        target.dispatchEvent(new CustomEvent('blocks-changed', { detail: hydrated }));
      }
      return;
    }
    target.dispatchEvent(new CustomEvent(type, { detail: hydrated }));
  });
}

export function emit(type, detail = {}) {
  target.dispatchEvent(new CustomEvent(type, { detail }));
  if (channel && CROSS_TAB_EVENTS.has(type)) {
    try {
      channel.postMessage({
        sender: tabId,
        type,
        detail: serializeDetail(detail),
      });
    } catch {
      /* ignore clone errors */
    }
  }
}

export function on(type, fn) {
  const handler = (e) => fn(e.detail);
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}
