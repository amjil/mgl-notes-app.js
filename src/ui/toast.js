import { portal } from 'mgl-common-ui';
import { h } from '../util.js';

let host = null;

export function toast(message, { kind = 'info', ms = 3200 } = {}) {
  if (!host) {
    host = h('div', { class: 'app-toasts', role: 'status', 'aria-live': 'polite' });
    portal(host);
  }
  const el = h('div', { class: `app-toast app-toast--${kind}` }, message);
  host.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 250);
  }, ms);
}
