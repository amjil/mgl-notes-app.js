import {
  createDocument,
  deleteDocument,
  getDocument,
  listChildDocuments,
  listDocuments,
  moveDocument,
  updateDocumentTitle,
} from '../services/notes.js';
import { exportDocument, pickAndImportDocument, shareDocument } from '../services/export.js';
import { attachFieldIme, commitPending } from '../ime/index.js';
import { on } from '../events.js';
import { navigate } from '../router.js';
import { isConflictTitle, t } from '../i18n.js';
import { confirmDialog } from '../ui/confirm.js';
import { createBacklinksPanel } from '../ui/backlinks.js';
import { toast } from '../ui/toast.js';
import { debounce, h } from '../util.js';
import { mountNoteView } from './note-view.js';

const TITLE_DEBOUNCE_MS = 600;

export async function mountEditor(container, { params = [], query = {} } = {}) {
  const id = params[0];
  const doc = id ? await getDocument(id) : null;
  if (!doc || doc.deleted_at) {
    container.replaceChildren(h('section', { class: 'page mn-surface' },
      h('div', { class: 'page-inner mn-columns' },
        h('p', { class: 'doc-list__empty' }, t('empty')),
        h('a', { class: 'btn', href: '#/documents' }, t('back')))));
    return { destroy() {} };
  }
  if (doc.type === 'daily') {
    navigate(`/today/${encodeURIComponent(doc.title)}`, { replace: true });
    return { destroy() {} };
  }

  async function pickAndMoveParent() {
    const all = (await listDocuments({ type: 'normal' })).filter((d) => d.id !== id);
    // 排除自己的后代节点，防止成环
    const byParent = new Map();
    all.forEach((d) => {
      const pid = d.parent_id || null;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(d);
    });
    const descendants = new Set();
    const walk = (pid) => {
      (byParent.get(pid) || []).forEach((c) => {
        descendants.add(c.id);
        walk(c.id);
      });
    };
    walk(id);
    const candidates = all.filter((d) => !descendants.has(d.id));

    // 构建竖排选择弹窗
    return new Promise((resolve) => {
      const close = (val) => { root.remove(); resolve(val); };
      const listEl = h('div', { class: 'cmd-palette__list', role: 'listbox' },
        h('button', {
          type: 'button',
          class: `cmd-palette__item${!doc.parent_id ? ' is-active' : ''}`,
          onclick: () => close(null),
        }, h('span', { class: 'cmd-palette__label' }, t('moveRoot'))),
        ...candidates.map((cand) => h('button', {
          type: 'button',
          class: `cmd-palette__item${cand.id === doc.parent_id ? ' is-active' : ''}`,
          onclick: () => close(cand.id),
        }, h('span', { class: 'cmd-palette__label' }, cand.title || t('untitled')))));

      const panel = h('div', { class: 'cmd-palette', role: 'dialog', 'aria-label': t('moveDocument') },
        h('div', { class: 'cmd-palette__input', style: 'display:flex;align-items:center;font-weight:600' }, t('moveDocument')),
        listEl);
      const root = h('div', {
        class: 'cmd-palette-backdrop',
        onclick: (e) => { if (e.target === root) close(undefined); },
      }, panel);
      document.body.append(root);
    });
  }

  const input = h('input', {
    class: 'mn-input note-title',
    type: 'text',
    value: doc.title || '',
    placeholder: t('titlePlaceholder'),
    'aria-label': t('titlePlaceholder'),
    spellcheck: 'false',
    lang: 'mn-Mong',
  });

  const backlinks = createBacklinksPanel(doc.title || '', { excludeDocumentId: id });
  const childrenEl = h('div', { class: 'note-children', hidden: true });
  const subdocIndexEl = h('div', { class: 'note-subdoc-index', hidden: true });

  /** 判断当前编辑器是否完全没有实质内容 */
  function isEditorContentEmpty() {
    try {
      const tree = view?.session?.editor?.getBlocks?.() || [];
      if (tree.length === 0) return true;
      if (tree.length > 1) return false;
      const first = tree[0];
      const hasChildren = Array.isArray(first.children) && first.children.length > 0;
      const isPlainPara = !first.type || first.type === 'paragraph';
      const text = String(first.text || first.html || '').replace(/<[^>]*>/g, '').replace(/\u200b/g, '').trim();
      return isPlainPara && !hasChildren && text.length === 0;
    } catch {
      return false;
    }
  }

  function shortDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  let cachedKids = [];

  function syncSubdocIndexVisibility() {
    const showIndex = cachedKids.length > 0 && isEditorContentEmpty();
    subdocIndexEl.hidden = !showIndex;
  }

  const saveTitle = async () => {
    await updateDocumentTitle(id, input.value.trim());
    backlinks.setTitle(input.value.trim());
  };
  const saveSoon = debounce(saveTitle, TITLE_DEBOUNCE_MS);
  input.addEventListener('input', saveSoon);
  input.addEventListener('blur', () => { saveSoon.cancel(); void saveTitle(); });

  let view = null;
  const readBtn = h('button', {
    type: 'button',
    class: 'btn btn--ghost note-read-btn',
    title: t('readingMode'),
    onclick: () => {
      if (!view) return;
      const next = !view.isReading();
      view.setReading(next);
      readBtn.textContent = next ? t('exitReading') : t('readingMode');
      readBtn.title = readBtn.textContent;
    },
  }, t('readingMode'));

  const more = h('details', { class: 'note-more' },
    h('summary', { class: 'btn btn--ghost', title: t('more') }, '⋯'),
    h('div', { class: 'note-more__menu', dataset: { mnScrollX: '' } },
      h('button', {
        type: 'button',
        class: 'note-more__item',
        onclick: async () => {
          more.open = false;
          const child = await createDocument({ title: '', type: 'normal', parentId: id });
          navigate(`/doc/${child.id}`);
        },
      }, t('newSubDocument')),
      h('button', {
        type: 'button',
        class: 'note-more__item',
        onclick: async () => {
          more.open = false;
          const nextParentId = await pickAndMoveParent();
          if (nextParentId === undefined) return;
          const moved = await moveDocument(id, nextParentId);
          if (moved) {
            // 重新挂载刷新面包屑父链接
            navigate(`/doc/${id}`, { replace: true });
          }
        },
      }, t('moveDocument')),
      h('button', {
        type: 'button',
        class: 'note-more__item',
        onclick: async () => {
          await exportDocument(id, 'text');
          toast(t('exportDone'));
        },
      }, t('exportText')),
      h('button', {
        type: 'button',
        class: 'note-more__item',
        onclick: async () => {
          await exportDocument(id, 'html');
          toast(t('exportDone'));
        },
      }, t('exportHtml')),
      h('button', {
        type: 'button',
        class: 'note-more__item',
        onclick: async () => {
          more.open = false;
          try {
            const doc = await pickAndImportDocument({ parentId: id });
            if (!doc) return;
            toast(t('importDone'));
            navigate(`/doc/${doc.id}`);
          } catch {
            toast(t('importFailed'), { kind: 'error' });
          }
        },
      }, t('import')),
      h('button', {
        type: 'button',
        class: 'note-more__item',
        onclick: async () => {
          try {
            const shared = await shareDocument(id);
            if (!shared) toast(t('exportDone'));
          } catch (e) {
            if (e?.name !== 'AbortError') toast(t('shareFailed'), { kind: 'error' });
          }
        },
      }, t('share')),
      h('button', {
        type: 'button',
        class: 'note-more__item note-more__item--danger',
        onclick: async () => {
          const ok = await confirmDialog({
            title: t('confirmDeleteTitle'),
            body: t('confirmDeleteBody'),
            confirmLabel: t('delete'),
            danger: true,
          });
          if (!ok) return;
          await deleteDocument(id);
          navigate('/documents', { replace: true });
        },
      }, t('delete'))));

  const conflictBanner = isConflictTitle(doc.title)
    ? h('div', { class: 'conflict-banner', title: t('conflictNotice') }, t('conflictBadge'))
    : null;

  let parentLink = null;
  if (doc.parent_id) {
    const parent = await getDocument(doc.parent_id);
    if (parent && !parent.deleted_at) {
      parentLink = h('a', {
        class: 'note-parent-link',
        href: `#/doc/${parent.id}`,
        title: t('parentDocument'),
      }, parent.title || t('untitled'));
    }
  }

  async function refreshChildren() {
    cachedKids = await listChildDocuments(id);
    if (!cachedKids.length) {
      childrenEl.hidden = true;
      childrenEl.replaceChildren();
      subdocIndexEl.hidden = true;
      subdocIndexEl.replaceChildren();
      return;
    }

    childrenEl.hidden = false;
    childrenEl.replaceChildren(
      h('span', { class: 'note-children__label' }, t('childDocuments')),
      ...cachedKids.map((child) => h('a', {
        class: 'note-children__item',
        href: `#/doc/${child.id}`,
        title: child.title || t('untitled'),
      }, child.title || t('untitled'))),
      h('button', {
        type: 'button',
        class: 'note-children__add btn btn--ghost',
        title: t('newSubDocument'),
        onclick: async () => {
          const child = await createDocument({ title: '', type: 'normal', parentId: id });
          navigate(`/doc/${child.id}`);
        },
      }, '＋'));

    subdocIndexEl.replaceChildren(
      h('div', { class: 'note-subdoc-index__head' },
        h('h2', { class: 'note-subdoc-index__title' }, `${t('childDocuments')} (${cachedKids.length})`),
        h('button', {
          type: 'button',
          class: 'btn btn--ghost',
          onclick: async () => {
            const child = await createDocument({ title: '', type: 'normal', parentId: id });
            navigate(`/doc/${child.id}`);
          },
        }, `＋ ${t('newSubDocument')}`)),
      h('div', { class: 'doc-list note-subdoc-index__list' },
        ...cachedKids.map((child) => h('article', { class: 'doc-card' },
          h('a', { class: 'doc-card__open', href: `#/doc/${child.id}` },
            h('span', { class: `doc-card__title${child.title ? '' : ' is-untitled'}` },
              child.title || t('untitled')),
            h('span', { class: 'doc-card__meta mn-upright' },
              shortDate(child.edited_at || child.updated_at)))))));

    syncSubdocIndexVisibility();
  }

  const head = [
    h('a', { class: 'btn btn--ghost note-back-btn', href: '#/documents', title: t('back') }, h('span', { class: 'btn__icon' }, '←')),
    parentLink,
    input,
    conflictBanner,
    childrenEl,
    h('div', { class: 'note-view__spacer' }),
    h('div', { class: 'note-view__actions' }, readBtn, more),
  ].filter(Boolean);

  view = mountNoteView(container, { head, documentId: id, focusBlockId: query.block || null });
  const editorHost = container.querySelector('.note-view__editor');
  editorHost?.append(subdocIndexEl);
  container.querySelector('.note-view')?.append(backlinks.root);
  const onEditorInput = () => syncSubdocIndexVisibility();
  editorHost?.addEventListener('input', onEditorInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      view.session.focus();
    }
  });
  const titleIme = attachFieldIme(input);

  const off = on('documents-changed', async () => {
    const latest = await getDocument(id);
    if (!latest || latest.deleted_at) {
      navigate('/documents', { replace: true });
      return;
    }
    if (document.activeElement !== input && latest.title !== input.value) {
      input.value = latest.title || '';
      backlinks.setTitle(latest.title || '');
    }
    void refreshChildren();
  });
  const offLinks = on('blocks-changed', () => { void backlinks.refresh(); });

  view.session.ready.then(async () => {
    await refreshChildren();
    if (!doc.title && !cachedKids.length) input.focus();
  });

  return {
    async destroy() {
      editorHost?.removeEventListener('input', onEditorInput);
      off();
      offLinks();
      backlinks.destroy?.();
      await commitPending(titleIme.ime);
      saveSoon.cancel();
      await saveTitle();
      titleIme.destroy();
      await view.destroy();
    },
  };
}
