/**
 * App-wide event bus.
 *   documents-changed   { documentIds?: Set }   list / titles may differ; IDs when known
 *   blocks-changed      { documentIds: Set }    remote ops touched these documents
 *   local-change        { documentIds: Set }    new unsynced ops; empty Set = unknown scope
 *   sync-status         { status, message }     idle | syncing | ok | error | offline
 *   toast               { message, kind }
 */
const target = new EventTarget();

export function emit(type, detail = {}) {
  target.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on(type, fn) {
  const handler = (e) => fn(e.detail);
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}
