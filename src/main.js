import 'mgl-common-ui/style.css';
import './styles/app.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/editor.css';

import { initVisualViewport, install } from 'mgl-common-ui';
import { logout } from './api/auth.js';
import { closeDatabase, getMeta, openDatabase, setMeta } from './db/idb.js';
import { reindexAllLinks } from './services/links.js';
import { on } from './events.js';
import { t } from './i18n.js';
import { dismissOwnedIme, trackImeKeyboard } from './ime/index.js';
import { navigate, onRoute, parseRoute } from './router.js';
import { currentUser, loggedIn, onSessionChange } from './session.js';
import { push, startSync, stopSync } from './sync/sync.js';
import { createShell } from './ui/shell.js';
import { toast } from './ui/toast.js';
import { installCommandShortcuts } from './ui/commands.js';
import { mountLogin } from './pages/login.js';
import { closeSearch, openSearch } from './search/index.js';
import { mountDocuments } from './pages/documents.js';
import { mountSearch } from './pages/search.js';
import { mountTags } from './pages/tags.js';
import { mountGraph } from './pages/graph.js';
import { mountTasks } from './pages/tasks.js';
import { mountToday } from './pages/today.js';
import { mountEditor } from './pages/editor.js';
import { mountTrash } from './pages/trash.js';
import { mountSettings } from './pages/settings.js';
import { mountReview } from './pages/review.js';
import { applyPrefs } from './prefs.js';
import { initPwa } from './pwa.js';

const app = document.getElementById('app');

initVisualViewport();
trackImeKeyboard();
applyPrefs();
initPwa();
installCommandShortcuts();
install({ selector: '.mn-surface', keyboard: false, drag: false });

const PAGES = {
  today: mountToday,
  documents: mountDocuments,
  tasks: mountTasks,
  review: mountReview,
  tags: mountTags,
  graph: mountGraph,
  search: mountSearch,
  trash: mountTrash,
  settings: mountSettings,
  doc: mountEditor,
};

let shell = null;
let current = null;
let routeToken = 0;

async function unmountCurrent() {
  const page = current;
  current = null;
  if (page && page.destroy) {
    try {
      await page.destroy();
    } catch (e) {
      console.error('[app] page destroy failed', e);
    }
  }
  dismissOwnedIme();
}

async function enterApp() {
  const user = currentUser();
  await openDatabase(user.id);
  // One-shot full rebuild after schema upgrades / first open (Flutter reindex-all-links!).
  if (!(await getMeta('links_indexed'))) {
    try {
      await reindexAllLinks();
      await setMeta('links_indexed', true);
    } catch (e) {
      console.warn('[app] link reindex failed', e);
    }
  }
  try {
    await openSearch(user.id);
  } catch (e) {
    console.warn('[app] search index failed', e);
  }
  if (!shell) {
    shell = createShell({ onLogout: doLogout });
  }
  app.replaceChildren(shell.root);
  startSync();
}

function leaveApp() {
  stopSync();
  closeSearch();
  closeDatabase();
  shell?.destroy?.();
  shell = null;
}

async function doLogout() {
  await unmountCurrent();
  await push();
  await logout();
}

async function render(route) {
  const token = ++routeToken;
  await unmountCurrent();
  if (token !== routeToken) return;

  const authRoute = route.name === 'login' || route.name === 'register';
  if (!loggedIn()) {
    if (shell) leaveApp();
    if (!authRoute) {
      navigate('/login', { replace: true });
      return;
    }
    const host = document.createElement('div');
    host.className = 'auth-host';
    app.replaceChildren(host);
    current = mountLogin(host, { mode: route.name });
    return;
  }

  if (authRoute) {
    navigate('/today', { replace: true });
    return;
  }

  if (!shell || !app.contains(shell.root)) await enterApp();
  if (token !== routeToken) return;

  const mount = PAGES[route.name];
  if (!mount) {
    navigate('/today', { replace: true });
    return;
  }
  shell.setActive(route.name === 'doc' ? 'documents' : route.name);
  const host = document.createElement('div');
  host.className = 'app-page';
  shell.main.replaceChildren(host);
  const page = await mount(host, route);
  if (token !== routeToken) {
    await page?.destroy?.();
    return;
  }
  current = page;
  shell.placeMenu();
}

onRoute(render);

onSessionChange(({ loggedIn: isIn, reason }) => {
  if (isIn) return;
  if (reason === 'expired') toast(t('sessionExpired'), { kind: 'error' });
  navigate('/login', { replace: true });
});

on('toast', ({ message, kind }) => toast(message, { kind }));

on('locale-changed', async () => {
  await unmountCurrent();
  if (shell) {
    shell.destroy?.();
    shell = null;
  }
  await render(parseRoute());
});

render(parseRoute());
