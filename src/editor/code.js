/**
 * Code block plugin — horizontal-tb monospace code editor inside the vertical-lr note flow.
 * Round-trips code text in `row.text` and `{ lang }` in `data_json.data`.
 */
const CSS = `
.mgl-editor-scope .mgl-code-block {
  writing-mode: horizontal-tb;
  -webkit-writing-mode: horizontal-tb;
  display: inline-flex;
  flex-direction: column;
  min-width: 240px;
  max-width: min(520px, 78vw);
  max-height: 100%;
  margin: 0 10px 0 0;
  border: 1px solid var(--app-line-strong, #ccc);
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-bg-3, #e7dfcf) 55%, var(--app-bg-2, #fff));
  font-family: ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
  overflow: hidden;
}
.mgl-editor-scope .mgl-code-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--app-line, #ddd);
  background: color-mix(in srgb, var(--app-bg-3, #e7dfcf) 85%, transparent);
  font: 600 11px/1.2 var(--app-font-ui, sans-serif);
  color: var(--app-muted, #666);
}
.mgl-editor-scope .mgl-code-block__lang {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;
  width: 90px;
}
.mgl-editor-scope .mgl-code-block__pre {
  margin: 0;
  padding: 10px 12px;
  font: 13px/1.55 ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
  color: var(--app-text, #1c221e);
  white-space: pre;
  overflow: auto;
  flex: 1 1 auto;
  outline: none;
  tab-size: 2;
}
.note-editor .mgl-editor-scope .editor-content code {
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 0.88em;
  padding: 0.15em 0.1em;
  border-radius: 4px;
  background: color-mix(in srgb, var(--app-accent-2, #8a6a2c) 16%, transparent);
  color: var(--app-accent-2, #8a6a2c);
}
`;

export function createCodeBlockPlugin() {
  return {
    type: 'code',
    label: '</>',
    title: 'Code block',
    atomic: true,
    css: CSS,
    defaultData() {
      return { lang: '' };
    },
    build({ data, text, notify }) {
      const wrap = document.createElement('div');
      wrap.className = 'mgl-code-block';

      const head = document.createElement('div');
      head.className = 'mgl-code-block__head';
      head.contentEditable = 'false';

      const langInput = document.createElement('input');
      langInput.type = 'text';
      langInput.className = 'mgl-code-block__lang';
      langInput.placeholder = 'plain / js / clj…';
      langInput.spellcheck = false;
      langInput.value = data?.lang || '';
      langInput.addEventListener('input', () => {
        if (typeof notify === 'function') notify();
      });

      head.append(langInput);

      const pre = document.createElement('pre');
      pre.className = 'mgl-code-block__pre';
      pre.contentEditable = 'true';
      pre.spellcheck = false;
      pre.setAttribute('inputmode', 'text');
      pre.textContent = text || data?.code || '';

      pre.addEventListener('input', () => {
        if (typeof notify === 'function') notify();
      });

      pre.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          document.execCommand('insertText', false, '  ');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          document.execCommand('insertLineBreak');
        }
      });

      wrap.append(head, pre);
      return wrap;
    },
    read(wrapper) {
      const box = wrapper.querySelector('.mgl-code-block');
      const lang = (box?.querySelector('.mgl-code-block__lang')?.value || '').trim();
      const code = (box?.querySelector('.mgl-code-block__pre')?.textContent || '').replace(/\u200b/g, '');
      return {
        html: '',
        text: code,
        data: lang ? { lang } : {},
      };
    },
  };
}
