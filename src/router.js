/**
 * Hash router.
 *   #/login  #/register
 *   #/today  #/today/YYYY-MM-DD
 *   #/documents  (default type=normal)  #/documents?type=all|daily|normal
 *   #/tasks
 *   #/review
 *   #/tags  #/tags/:tag
 *   #/search  (alias → documents, opens search panel)
 *   #/trash
 *   #/settings
 *   #/ime-dev  (dev build only — IME user overlay tester)
 *   #/doc/:id
 */
const listeners = new Set();

export function parseRoute(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/today';
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  const name = parts[0] || 'today';
  return { name, params: parts.slice(1).map(decodeURIComponent), query, path: raw };
}

export function navigate(path, { replace = false } = {}) {
  const hash = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (location.hash === hash) {
    listeners.forEach((fn) => fn(parseRoute(hash)));
    return;
  }
  if (replace) {
    history.replaceState(null, '', hash);
    listeners.forEach((fn) => fn(parseRoute(hash)));
  } else {
    location.hash = hash;
  }
}

export function onRoute(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

window.addEventListener('hashchange', () => {
  const route = parseRoute();
  listeners.forEach((fn) => fn(route));
});
