/**
 * Modal confirm dialog. Resolves true / false.
 * Matches the vertical Mongolian dialog style used elsewhere in the shell.
 */
import { h } from '../util.js';
import { t } from '../i18n.js';

export function confirmDialog({
  title,
  body = '',
  confirmLabel = t('confirm'),
  cancelLabel = t('cancel'),
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      resolve(ok);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    };

    const cancelBtn = h('button', {
      type: 'button',
      class: 'btn btn--ghost',
      onclick: () => finish(false),
    }, cancelLabel);

    const okBtn = h('button', {
      type: 'button',
      class: `btn${danger ? ' btn--danger-solid' : ' btn--primary'}`,
      onclick: () => finish(true),
    }, confirmLabel);

    const panel = h('div', {
      class: 'app-confirm',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
    },
      h('h2', { class: 'app-confirm__title' }, title),
      body ? h('p', { class: 'app-confirm__body' }, body) : null,
      h('div', { class: 'app-confirm__actions' }, cancelBtn, okBtn));

    const root = h('div', {
      class: 'app-confirm-root',
      onclick: (e) => { if (e.target === root) finish(false); },
    }, panel);

    document.body.append(root);
    document.addEventListener('keydown', onKey, true);
    okBtn.focus();
  });
}
