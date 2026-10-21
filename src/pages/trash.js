import {
  destroyDocuments,
  listDeletedDocuments,
  restoreDocument,
  restoreDocuments,
} from '../services/notes.js';
import { on } from '../events.js';
import { t } from '../i18n.js';
import { confirmDialog } from '../ui/confirm.js';
import { h } from '../util.js';

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Soft-deleted documents: restore or permanently destroy. */
export function mountTrash(container) {
  const list = h('div', { class: 'doc-list' });
  const selected = new Set();
  let selecting = false;
  let docsCache = [];

  const selectBtn = h('button', {
    type: 'button',
    class: 'btn btn--ghost',
    onclick: () => {
      selecting = !selecting;
      if (!selecting) selected.clear();
      selectBtn.classList.toggle('is-active', selecting);
      selectBtn.textContent = selecting ? t('clearSelection') : t('select');
      render();
    },
  }, t('select'));

  const batchBar = h('div', { class: 'batch-bar', hidden: true });

  const head = h('header', { class: 'note-view__head', dataset: { mnScrollY: '' } },
    h('h1', { class: 'page-head__title' }, t('trash')),
    selectBtn);

  const body = h('section', { class: 'page mn-surface note-view__body' },
    h('div', { class: 'page-inner mn-columns' }, list));
  container.replaceChildren(h('div', { class: 'note-view' }, head, body), batchBar);

  function syncBatchBar() {
    const n = selected.size;
    batchBar.hidden = !selecting || n === 0;
    if (batchBar.hidden) {
      batchBar.replaceChildren();
      return;
    }
    batchBar.replaceChildren(
      h('span', { class: 'batch-bar__count' }, `${n}`),
      h('button', {
        type: 'button',
        class: 'btn btn--ghost batch-bar__btn',
        onclick: async () => {
          await restoreDocuments([...selected]);
          selected.clear();
          selecting = false;
          selectBtn.classList.remove('is-active');
          selectBtn.textContent = t('select');
          render();
        },
      }, t('batchRestore')),
      h('button', {
        type: 'button',
        class: 'btn btn--danger batch-bar__btn',
        onclick: async () => {
          const ok = await confirmDialog({
            title: t('confirmDestroyTitle'),
            body: t('confirmDestroyBody'),
            confirmLabel: t('batchDestroy'),
            danger: true,
          });
          if (!ok) return;
          await destroyDocuments([...selected]);
          selected.clear();
          selecting = false;
          selectBtn.classList.remove('is-active');
          selectBtn.textContent = t('select');
          render();
        },
      }, t('batchDestroy')),
    );
  }

  async function onRestore(id) {
    await restoreDocument(id);
  }

  async function onDestroy(id) {
    const ok = await confirmDialog({
      title: t('confirmDestroyTitle'),
      body: t('confirmDestroyBody'),
      confirmLabel: t('destroyForever'),
      danger: true,
    });
    if (ok) await destroyDocument(id);
  }

  async function render() {
    docsCache = await listDeletedDocuments();
    syncBatchBar();
    if (!docsCache.length) {
      list.replaceChildren(h('p', { class: 'doc-list__empty' }, t('trashEmpty')));
      return;
    }
    list.replaceChildren(...docsCache.map((doc) => {
      const title = doc.title || t('untitled');
      const isSelected = selected.has(doc.id);
      const body = selecting
        ? h('button', {
          type: 'button',
          class: 'doc-card__open',
          onclick: () => {
            if (selected.has(doc.id)) selected.delete(doc.id);
            else selected.add(doc.id);
            render();
          },
        },
          h('span', { class: `doc-card__check${isSelected ? ' is-on' : ''}`, 'aria-hidden': 'true' }, isSelected ? '✓' : ''),
          h('span', { class: `doc-card__title${doc.title ? '' : ' is-untitled'}` }, title),
          h('span', { class: 'doc-card__meta mn-upright' }, shortDate(doc.deleted_at)))
        : h('div', { class: 'doc-card__open' },
          h('span', { class: `doc-card__title${doc.title ? '' : ' is-untitled'}` }, title),
          h('span', { class: 'doc-card__meta mn-upright' }, shortDate(doc.deleted_at)));

      return h('article', {
        class: `doc-card doc-card--trash${isSelected ? ' is-selected' : ''}`,
      },
        body,
        selecting ? null : h('div', { class: 'doc-card__actions' },
          h('button', {
            type: 'button',
            class: 'doc-card__action doc-card__action--restore',
            title: t('restore'),
            'aria-label': t('restore'),
            onclick: () => onRestore(doc.id),
          }, '↺'),
          h('button', {
            type: 'button',
            class: 'doc-card__action doc-card__action--destroy',
            title: t('destroyForever'),
            'aria-label': t('destroyForever'),
            onclick: () => onDestroy(doc.id),
          }, '✕')));
    }));
  }

  const off = on('documents-changed', render);
  render();

  return {
    destroy() {
      off();
    },
  };
}
