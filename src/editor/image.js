/**
 * Image block plugin — supports file picking, drag-resizing (persisted to
 * data_json.width / height), and click-to-zoom lightbox.
 */
import { portal } from 'mgl-common-ui';
import { imageSrcFromData } from '../services/assets.js';
import { t } from '../i18n.js';

const CSS = `
.mgl-editor-scope .mgl-image {
  writing-mode: horizontal-tb;
  position: relative;
  display: inline-block;
  width: fit-content;
  max-height: 100%;
  padding: 6px;
  cursor: zoom-in;
  border-radius: 6px;
  transition: background-color 140ms ease;
}
.mgl-editor-scope .mgl-image:hover {
  background: rgba(47, 125, 95, 0.06);
}
.mgl-editor-scope .mgl-image img {
  display: block;
  max-height: 100%;
  border-radius: 4px;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}
.mgl-editor-scope .editor-content .mgl-image .resize-handle {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: var(--mn-accent, #2f7d5f);
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.25);
  cursor: nwse-resize;
  opacity: 0;
  z-index: 3;
  touch-action: none;
  display: block;
  transition: opacity 140ms ease;
}
.mgl-editor-scope .mgl-image:hover .resize-handle,
.mgl-editor-scope .mgl-image.is-resizing .resize-handle {
  opacity: 1;
}
.note-editor.is-readonly .mgl-image .resize-handle {
  display: none !important;
}
.mgl-editor-scope .mgl-image.is-empty {
  min-width: 120px;
  min-height: 120px;
  border: 1px dashed var(--mn-line-strong, #bbb);
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--mn-muted, #777);
  font: 12px/1.3 var(--mn-font-ui, sans-serif);
  background: rgba(0,0,0,0.02);
  cursor: pointer;
}
.app-lightbox {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(18, 22, 20, 0.82);
  backdrop-filter: blur(4px);
  cursor: zoom-out;
}
.app-lightbox img {
  max-width: min(92vw, 1200px);
  max-height: 88vh;
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.45);
  object-fit: contain;
}
`;

let pendingData = null;

export function setPendingImageData(data) {
  pendingData = data;
}

function openLightbox(src) {
  if (!src) return;
  const overlay = document.createElement('div');
  overlay.className = 'app-lightbox';
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  overlay.append(img);

  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    overlay.remove();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  overlay.addEventListener('click', close);
  window.addEventListener('keydown', onKey, true);
  portal(overlay);
}

function attachResizeHandle(card, img) {
  const handle = document.createElement('span');
  handle.className = 'resize-handle';
  handle.setAttribute('aria-hidden', 'true');
  handle.setAttribute('contenteditable', 'false');

  const swallowMouse = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  handle.addEventListener('mousedown', swallowMouse);
  handle.addEventListener('touchstart', swallowMouse, { passive: false });

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (card.closest('.note-editor.is-readonly')) return;
    const startX = e.clientX;
    const startW = img.offsetWidth || Number(card.dataset.width) || 150;
    const startH = img.offsetHeight || Number(card.dataset.height) || 150;
    const aspect = startW / Math.max(1, startH);
    let moved = false;
    card.classList.add('is-resizing');
    try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 2) moved = true;
      const nextW = Math.min(720, Math.max(64, Math.round(startW + dx)));
      const nextH = Math.max(48, Math.round(nextW / aspect));
      img.style.width = `${nextW}px`;
      img.style.height = `${nextH}px`;
      card.dataset.width = String(nextW);
      card.dataset.height = String(nextH);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      card.classList.remove('is-resizing');
      if (moved) {
        card.dataset.skipLightbox = '1';
        card.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  });

  card.append(handle);
}

export function createImagePlugin() {
  return {
    type: 'image',
    label: false,
    atomic: true,
    css: CSS,
    defaultData() {
      const data = pendingData || {};
      pendingData = null;
      return { ...data };
    },
    build({ data }) {
      const card = document.createElement('div');
      // Keep `.mgl-image` only — `.editor-image` is block-editor's native
      // resize/select surface and would hide our handle until .selected.
      card.className = 'mgl-image';
      const src = imageSrcFromData(data || {});
      const w = Number(data?.width) || 0;
      const h = Number(data?.height) || 0;
      if (data?.['asset-id']) card.dataset.assetId = data['asset-id'];
      if (data?.url) card.dataset.url = data.url;
      else if (src) card.dataset.url = src;
      if (w) card.dataset.width = String(w);
      if (h) card.dataset.height = String(h);

      if (!src) {
        card.classList.add('is-empty');
        card.textContent = t('imageEmpty');
        return card;
      }

      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      if (w) img.style.width = `${w}px`;
      if (h) img.style.height = `${h}px`;
      card.append(img);
      attachResizeHandle(card, img);

      card.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.closest?.('.resize-handle')) return;
        if (card.dataset.skipLightbox) {
          delete card.dataset.skipLightbox;
          return;
        }
        openLightbox(img.src);
      });
      return card;
    },
    read(wrapper) {
      const card = wrapper.querySelector('.mgl-image, .editor-image');
      const img = card?.querySelector('img');
      const width = Number(card?.dataset.width || (img && parseFloat(img.style.width)) || 0) || undefined;
      const height = Number(card?.dataset.height || (img && parseFloat(img.style.height)) || 0) || undefined;
      const assetId = card?.dataset.assetId || null;
      const url = card?.dataset.url || img?.src || null;
      const data = {};
      if (assetId) data['asset-id'] = assetId;
      if (url && (/^(https?:|data:image\/)/i.test(url) || !assetId)) data.url = url;
      if (width) data.width = Math.round(width);
      if (height) data.height = Math.round(height);
      return { html: '', text: '', data };
    },
  };
}

export function pickImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    const done = (file) => {
      input.remove();
      resolve(file || null);
    };
    input.addEventListener('change', () => done(input.files?.[0] || null));
    input.addEventListener('cancel', () => done(null));
    document.body.append(input);
    input.click();
  });
}
