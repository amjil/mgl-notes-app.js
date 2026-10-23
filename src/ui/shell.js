/**
 * App frame after xamt's layout: a horizontal shell with a narrow rail
 * (vertical labels) and a main area. On mobile chrome the rail becomes a
 * drawer (hidden until the menu button or an edge swipe). Mobile chrome
 * matches IME detection: phone UA, or touch + ≤960px — not width alone.
 */
import { h } from '../util.js';
import { t } from '../i18n.js';
import { on } from '../events.js';
import { imeMode, onImeModeChange, preferVirtualIme, toggleImeMode } from '../ime/index.js';
import { syncNow } from '../sync/sync.js';
import { openCommandPalette } from './commands.js';
import { canInstall, onInstallAvailable, promptInstall } from '../pwa.js';

const EDGE = 28;
const SWIPE_DISTANCE = 60;
const SWIPE_DRIFT = 50;

const NAV = [
  { id: 'today', href: '#/today', label: () => t('today'), icon: '☀' },
  { id: 'documents', href: '#/documents', label: () => t('documents'), icon: '▤' },
  { id: 'tasks', href: '#/tasks', label: () => t('tasks'), icon: '☑' },
  { id: 'review', href: '#/review', label: () => t('review'), icon: '🗂' },
  { id: 'tags', href: '#/tags', label: () => t('tags'), icon: '#' },
  { id: 'graph', href: '#/graph', label: () => t('graph'), icon: '◎' },
  { id: 'trash', href: '#/trash', label: () => t('trash'), icon: '⌫' },
  { id: 'settings', href: '#/settings', label: () => t('settings'), icon: '⚙' },
];

export function createShell({ onLogout }) {
  const offs = []; // collect unsubscribe / removeListener fns

  const links = NAV.map((item) => h('a', {
    class: 'app-rail__link',
    href: item.href,
    dataset: { nav: item.id },
  }, h('span', { class: 'app-rail__icon', 'aria-hidden': 'true' }, item.icon), h('span', { class: 'app-rail__label' }, item.label())));

  const imeBtn = h('button', {
    type: 'button',
    class: 'app-rail__btn app-rail__ime',
    title: t('imeToggle'),
    onmousedown: (e) => e.preventDefault(),
    onclick: () => toggleImeMode(),
  });
  const renderIme = (mode) => {
    imeBtn.textContent = mode === 'mongol' ? 'ᠮ' : mode === 'latin' ? 'A' : '⌨';
    imeBtn.classList.toggle('is-latin', mode !== 'mongol');
    imeBtn.title = mode === 'system' ? t('imeSystem') : t('imeToggle');
  };
  renderIme(imeMode());
  offs.push(onImeModeChange(renderIme));

  const syncBtn = h('button', {
    type: 'button',
    class: 'app-rail__btn app-sync',
    title: t('sync'),
    dataset: { status: 'idle' },
    onclick: () => syncNow(),
  }, h('span', { class: 'app-sync__dot' }));

  offs.push(on('sync-status', ({ status, message }) => {
    syncBtn.dataset.status = status;
    const label = {
      ok: t('syncOk'), syncing: t('syncing'), error: t('syncError'), offline: t('syncOffline'),
    }[status] || t('sync');
    syncBtn.title = message && status === 'error' ? `${label}: ${message}` : label;
  }));

  const cmdBtn = h('button', {
    type: 'button',
    class: 'app-rail__btn',
    title: t('commands'),
    onclick: () => openCommandPalette(),
  }, '⌘');

  const installBtn = h('button', {
    type: 'button',
    class: 'app-rail__btn app-rail__install',
    title: t('installApp'),
    hidden: !canInstall(),
    onclick: () => { void promptInstall(); },
  }, '↓');
  offs.push(onInstallAvailable((available) => {
    installBtn.hidden = !available;
  }));

  const logoutBtn = h('button', {
    type: 'button',
    class: 'app-rail__btn app-rail__logout',
    title: t('logout'),
    onclick: () => onLogout(),
  }, h('span', { class: 'app-rail__label' }, t('logout')));

  const rail = h('aside', { class: 'app-rail mn-rail' },
    h('div', { class: 'app-rail__brand', 'aria-hidden': 'true' }, 'ᠲ'),
    h('div', { class: 'app-rail__rule' }),
    h('nav', { class: 'app-rail__links' }, links),
    h('div', { class: 'app-rail__foot' }, cmdBtn, imeBtn, syncBtn, installBtn, logoutBtn),
  );

  const backdrop = h('div', { class: 'app-drawer-backdrop', onclick: () => setDrawer(false) });
  const menuBtn = h('button', {
    type: 'button',
    class: 'app-menu-btn',
    title: t('menu'),
    'aria-label': t('menu'),
    onclick: () => {
      if (document.body.classList.contains('mgl-ime-mobile-open')) return;
      setDrawer(true);
    },
  }, '☰');
  const main = h('main', { class: 'app-main' });
  const root = h('div', { class: 'app-shell mn-shell' }, rail, backdrop, main);

  function setDrawer(open) {
    root.classList.toggle('is-drawer-open', open);
  }

  const narrowMq = window.matchMedia('(max-width: 960px)');

  function isDrawerChrome() {
    // Match IME mobile profile, and keep width-only responsive drawer.
    return preferVirtualIme() || narrowMq.matches;
  }

  function syncChrome() {
    const drawer = isDrawerChrome();
    root.classList.toggle('is-drawer-chrome', drawer);
    if (!drawer) setDrawer(false);
  }
  syncChrome();
  window.addEventListener('resize', syncChrome);
  narrowMq.addEventListener?.('change', syncChrome);
  // Virtual keyboard up while editing: keep the nav rail closed.
  const onImeShow = () => setDrawer(false);
  document.addEventListener('mgl-ime-keyboard-show', onImeShow);

  offs.push(() => {
    window.removeEventListener('resize', syncChrome);
    narrowMq.removeEventListener?.('change', syncChrome);
    document.removeEventListener('mgl-ime-keyboard-show', onImeShow);
  });

  let start = null;
  root.addEventListener('touchstart', (e) => {
    if (!isDrawerChrome() || e.touches.length !== 1) {
      start = null;
      return;
    }
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, target: e.target };
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    const s = start;
    start = null;
    if (!s || !isDrawerChrome()) return;
    // Don't pull the nav over the editor while the virtual keyboard is up.
    if (document.body.classList.contains('mgl-ime-mobile-open')) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - s.x;
    if (Math.abs(touch.clientY - s.y) >= SWIPE_DRIFT) return;
    const open = root.classList.contains('is-drawer-open');
    if (open && dx < -SWIPE_DISTANCE) setDrawer(false);
    else if (!open && s.x < EDGE && dx > SWIPE_DISTANCE) setDrawer(true);
  }, { passive: true });

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && root.classList.contains('is-drawer-open')) setDrawer(false);
  };
  document.addEventListener('keydown', onKeyDown);
  offs.push(() => document.removeEventListener('keydown', onKeyDown));

  return {
    root,
    main,
    /** Sit the mobile menu control at the top of the page head column. */
    placeMenu() {
      const head = main.querySelector('.note-view__head');
      if (!head) return;
      if (head.firstElementChild !== menuBtn) head.prepend(menuBtn);
    },
    setActive(id) {
      links.forEach((a) => a.classList.toggle('is-active', a.dataset.nav === id));
      setDrawer(false);
      syncChrome();
    },
    destroy() {
      offs.splice(0).forEach((fn) => fn());
      root.remove();
    },
  };
}
