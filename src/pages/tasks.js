import { checkBlock, listOpenTasks } from '../services/notes.js';
import { on } from '../events.js';
import { t } from '../i18n.js';
import { h } from '../util.js';

const DATE_TITLE = /^\d{4}-\d{2}-\d{2}$/;

function openHref(task) {
  const q = `?block=${encodeURIComponent(task.id)}`;
  if (task.documentType === 'daily' || DATE_TITLE.test(task.documentTitle)) {
    return `#/today/${encodeURIComponent(task.documentTitle)}${q}`;
  }
  return `#/doc/${task.documentId}${q}`;
}

function taskCard(task) {
  const text = task.text || t('empty');
  const src = task.documentTitle || t('untitled');
  const box = h('input', {
    class: 'task-card__box',
    type: 'checkbox',
    'aria-label': t('tasks'),
    onclick: (e) => e.stopPropagation(),
    onchange: async (e) => {
      e.target.disabled = true;
      try {
        const ok = await checkBlock(task.id, true);
        if (!ok) {
          e.target.checked = false;
          e.target.disabled = false;
        }
      } catch (err) {
        console.error('[tasks] check failed', err);
        e.target.checked = false;
        e.target.disabled = false;
      }
    },
  });
  return h('article', { class: 'doc-card search-card task-card' },
    h('label', { class: 'task-card__check', onclick: (e) => e.stopPropagation() }, box),
    h('a', { class: 'doc-card__open search-card__open task-card__open', href: openHref(task) },
      h('span', { class: `task-card__text${task.text ? '' : ' is-untitled'}` }, text),
      h('span', { class: 'task-card__src' }, src)));
}

/** All open (unchecked) todo blocks across notes — Flutter Tasks page. */
export function mountTasks(container) {
  const list = h('div', { class: 'doc-list task-list' });
  const head = h('header', { class: 'note-view__head' },
    h('h1', { class: 'page-head__title' }, t('tasks')));
  const body = h('section', { class: 'page mn-surface note-view__body' },
    h('div', { class: 'page-inner mn-columns' }, list));
  container.replaceChildren(h('div', { class: 'note-view' }, head, body));

  let alive = true;
  let seq = 0;

  async function render() {
    const token = ++seq;
    const tasks = await listOpenTasks();
    if (!alive || token !== seq) return;
    if (!tasks.length) {
      list.replaceChildren(h('p', { class: 'doc-list__empty' }, t('noOpenTasks')));
      return;
    }
    list.replaceChildren(...tasks.map(taskCard));
  }

  const offLocal = on('local-change', () => { void render(); });
  const offBlocks = on('blocks-changed', () => { void render(); });
  const offDocs = on('documents-changed', () => { void render(); });
  void render();

  return {
    destroy() {
      alive = false;
      offLocal();
      offBlocks();
      offDocs();
    },
  };
}
