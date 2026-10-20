/**
 * Vertical Mongolian multi-field prompt dialog with mgl-web-ime support.
 * Resolves with an object of { [field.name]: value } or null if cancelled.
 */
import { attachFieldIme, commitPending } from '../ime/index.js';
import { t } from '../i18n.js';
import { h } from '../util.js';

export function promptDialog({
  title,
  fields = [], // [{ name, label, value, placeholder, latin, required }]
  confirmLabel = t('confirm'),
  cancelLabel = t('cancel'),
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const imes = [];
    const inputs = new Map();

    const finish = async (ok) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      for (const handle of imes) {
        await commitPending(handle.ime);
        handle.destroy();
      }
      root.remove();
      if (!ok) {
        resolve(null);
        return;
      }
      const out = {};
      fields.forEach((f) => {
        out[f.name] = (inputs.get(f.name)?.value ?? '').trim();
      });
      resolve(out);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void finish(false);
      }
    };

    const fieldEls = fields.map((f) => {
      const isLatin = Boolean(f.latin);
      const input = h('input', {
        type: isLatin ? 'url' : 'text',
        class: `mn-input app-prompt__input${isLatin ? ' mn-input-latin' : ''}`,
        value: f.value ?? '',
        placeholder: f.placeholder ?? '',
        required: Boolean(f.required),
        spellcheck: 'false',
        autocomplete: 'off',
        lang: isLatin ? 'en' : 'mn-Mong',
      });
      inputs.set(f.name, input);
      if (!isLatin) {
        imes.push(attachFieldIme(input, { keepSelector: '.app-confirm' }));
      }
      return h('label', { class: 'app-prompt__field' },
        h('span', { class: 'app-prompt__label' }, f.label || f.name),
        input);
    });

    const cancelBtn = h('button', {
      type: 'button',
      class: 'btn btn--ghost',
      onclick: () => void finish(false),
    }, cancelLabel);

    const okBtn = h('button', {
      type: 'submit',
      class: 'btn btn--primary',
    }, confirmLabel);

    const form = h('form', {
      class: 'app-confirm app-prompt',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
      onsubmit: (e) => {
        e.preventDefault();
        void finish(true);
      },
    },
      h('h2', { class: 'app-confirm__title' }, title),
      ...fieldEls,
      h('div', { class: 'app-confirm__actions' }, cancelBtn, okBtn));

    const root = h('div', {
      class: 'app-confirm-root',
      onclick: (e) => { if (e.target === root) void finish(false); },
    }, form);

    document.body.append(root);
    document.addEventListener('keydown', onKey, true);
    const firstInput = inputs.values().next().value;
    if (firstInput) {
      firstInput.focus();
      firstInput.select?.();
    } else {
      okBtn.focus();
    }
  });
}
