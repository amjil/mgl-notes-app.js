import 'mgl-common-ui/style.css';
import './styles/app.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/editor.css';

import { initVisualViewport, install } from 'mgl-common-ui';
import { logout } from './api/auth.js';
import {
  closeDatabase,
  estimateStorageUsage,
  getMeta,
  isQuotaError,
  openDatabase,
  setMeta,
} from './db/idb.js';
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
import { mountTags } from './pages/tags.js';
import { mountGraph } from './pages/graph.js';
import { mountTasks } from './pages/tasks.js';
import { mountToday } from './pages/today.js';
import { mountEditor } from './pages/editor.js';
import { mountTrash } from './pages/trash.js';
import { mountSettings } from './pages/settings.js';
import { mountReview } from './pages/review.js';
import { mountImeDev } from './pages/ime-dev.js';
import { applyPrefs } from './prefs.js';
import { initPwa } from './pwa.js';
import { clearAssetUrlCache } from './services/assets.js';

const app = document.getElementById('app');

let lastGlobalErrAt = 0;

window.addEventListener('unhandledrejection', (event) => {
  const err = event.reason;
  if (!err) return;

  const now = Date.now();
  if (isQuotaError(err)) {
    event.preventDefault();
    if (now - lastGlobalErrAt > 5000) {
      lastGlobalErrAt = now;
      toast(t('storageFull'), { kind: 'error', ms: 6000 });
    }
    return;
  }

  // 若数据库因后台回收或版本升级被意外关闭，且用户仍处于登录态，自动重连数据库
  if (err?.message === 'Database is not open' && loggedIn()) {
    event.preventDefault();
    const user = currentUser();
    if (user?.id) void openDatabase(user.id);
  }
});

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
  search: mountDocuments,
  trash: mountTrash,
  settings: mountSettings,
  doc: mountEditor,
  ...(import.meta.env.DEV ? { 'ime-dev': mountImeDev } : {}),
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
  estimateStorageUsage().then((stat) => {
    if (stat?.nearLimit) {
      toast(t('storageFull'), { kind: 'warn', ms: 5000 });
    }
  });
}

function leaveApp() {
  stopSync();
  closeSearch();
  clearAssetUrlCache();
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
  const navId = route.name === 'doc' || route.name === 'search'
    ? 'documents'
    : (PAGES[route.name] ? route.name : '');
  shell.setActive(navId);
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
