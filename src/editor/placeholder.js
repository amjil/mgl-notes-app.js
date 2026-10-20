import { PLACEHOLDER_TYPE } from './bridge.js';
import { t } from '../i18n.js';

const CSS = `
.mgl-editor-scope .mgl-unsupported {
  writing-mode: vertical-lr;
  display: inline-flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 10px 0 0;
  padding: 10px 6px;
  border: 1px dashed var(--mn-line-strong, #bbb);
  border-radius: 8px;
  color: var(--mn-muted, #777);
  background: rgba(0, 0, 0, 0.02);
  user-select: none;
  max-block-size: 100%;
}
.mgl-editor-scope .mgl-unsupported__kind {
  writing-mode: horizontal-tb;
  font: 11px/1.2 var(--mn-font-ui, sans-serif);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.mgl-editor-scope .mgl-unsupported__text { opacity: 0.8; }
`;

/**
 * Read-only stand-in for block types the web editor does not edit yet
 * (image, attachment, bookmark, flashcard, embed …). The original row rides
 * along in data.orig so a save writes it back unchanged.
 */
export function createPlaceholderPlugin() {
  return {
    type: PLACEHOLDER_TYPE,
    label: false,
    atomic: true,
    css: CSS,
    defaultData() {
      return { orig: { type: 'paragraph', text: '', checked: false, data_json: null } };
    },
    build({ data }) {
      const orig = (data && data.orig) || {};
      const el = document.createElement('div');
      el.className = 'mgl-unsupported';
      el.dataset.orig = JSON.stringify(orig);
      el.title = t('unsupportedBlock');
      const kind = document.createElement('span');
      kind.className = 'mgl-unsupported__kind';
      kind.textContent = orig.type || '?';
      el.append(kind);
      if (orig.text) {
        const text = document.createElement('span');
        text.className = 'mgl-unsupported__text';
        text.textContent = orig.text;
        el.append(text);
      }
      return el;
    },
    read(wrapper) {
      const el = wrapper.querySelector(':scope > .block-content.mgl-unsupported, :scope > .block-content .mgl-unsupported')
        || wrapper.querySelector('.mgl-unsupported');
      let orig = {};
      try {
        orig = JSON.parse((el && el.dataset.orig) || '{}');
      } catch {
        orig = {};
      }
      return { html: '', text: orig.text || '', data: { orig } };
    },
  };
}
