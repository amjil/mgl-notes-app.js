/**
 * Bookmark block plugin — round-trips url/title/desc through data_json.
 */
import { t } from '../i18n.js';
import { promptDialog } from '../ui/prompt.js';

const CSS = `
.mgl-editor-scope .mgl-bookmark {
  writing-mode: horizontal-tb;
  display: block;
  min-width: 160px;
  max-width: 280px;
  padding: 10px 12px;
  border: 1px solid var(--mn-line, #ddd);
  border-radius: 8px;
  background: color-mix(in srgb, var(--mn-surface, #fff) 90%, transparent);
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}
.mgl-editor-scope .mgl-bookmark .bm-domain {
  width: 28px; height: 28px; border-radius: 6px;
  display: grid; place-items: center;
  background: var(--mn-accent, #2f7d5f); color: #fff;
  font: 600 13px/1 var(--mn-font-ui, sans-serif);
  margin-bottom: 6px;
}
.mgl-editor-scope .mgl-bookmark .bm-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; word-break: break-word; }
.mgl-editor-scope .mgl-bookmark .bm-desc { font-size: 12px; color: var(--mn-muted, #666); margin-bottom: 6px; word-break: break-word; }
.mgl-editor-scope .mgl-bookmark .bm-url { font-size: 11px; color: #1565c0; word-break: break-all; }
`;

function domainInitial(url) {
  try {
    return (new URL(url).hostname || '#').charAt(0).toUpperCase();
  } catch {
    return '#';
  }
}

function part(className, text) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return el;
}

let pending = null;

export function setPendingBookmark(data) {
  pending = data;
}

export function createBookmarkPlugin() {
  return {
    type: 'bookmark',
    label: false,
    atomic: true,
    css: CSS,
    defaultData() {
      const data = pending || { url: '', title: '', desc: '' };
      pending = null;
      return { ...data };
    },
    build({ data }) {
      const url = data?.url || '';
      const title = data?.title || url || t('bookmark');
      const desc = data?.desc || '';
      const card = document.createElement('a');
      card.className = 'mgl-bookmark';
      card.href = url || '#';
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.dataset.url = url;
      card.dataset.title = title;
      if (desc) card.dataset.desc = desc;
      card.append(part('bm-domain', domainInitial(url)), part('bm-title', title));
      if (desc) card.append(part('bm-desc', desc));
      card.append(part('bm-url', url));
      card.addEventListener('click', (e) => {
        if (!url) e.preventDefault();
      });
      return card;
    },
    read(wrapper) {
      const card = wrapper.querySelector('.mgl-bookmark, [data-block-type="bookmark"] > .block-content');
      const url = card?.dataset.url || '';
      const title = card?.dataset.title || card?.querySelector('.bm-title')?.textContent || '';
      const desc = card?.dataset.desc || card?.querySelector('.bm-desc')?.textContent || '';
      return { html: '', text: title, data: { url, title, desc } };
    },
  };
}

export async function promptBookmark() {
  const res = await promptDialog({
    title: t('bookmark'),
    fields: [
      { name: 'url', label: t('bookmarkUrl'), value: 'https://', latin: true, required: true },
      { name: 'title', label: t('bookmarkTitle'), value: '', latin: false },
      { name: 'desc', label: t('bookmarkDesc'), value: '', latin: false },
    ],
  });
  if (!res || !/^https?:\/\//i.test(res.url)) return null;
  return {
    url: res.url,
    title: res.title || res.url,
    desc: res.desc || '',
  };
}
