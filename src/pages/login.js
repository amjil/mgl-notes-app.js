import { login, register } from '../api/auth.js';
import { apiBase, setApiBase } from '../config.js';
import { navigate } from '../router.js';
import { t } from '../i18n.js';
import { h } from '../util.js';

/**
 * Login / register. Layout matches xamt vertical auth forms:
 * columns flow left → right; Latin credential fields use vertical-lr
 * so the input itself appears rotated.
 */
export function mountLogin(container, { mode = 'login' } = {}) {
  const isRegister = mode === 'register';
  const error = h('p', { class: 'auth__error', role: 'alert' });

  const field = (label, attrs, latin = true) => h('label', { class: 'auth__field' },
    h('span', { class: 'auth__label' }, label),
    h('input', {
      class: latin ? 'mn-input mn-input-latin auth__input' : 'mn-input auth__input',
      ...attrs,
    }));

  const emailField = field(t('email'), {
    type: 'email',
    name: 'email',
    autocomplete: 'email',
    required: true,
    spellcheck: 'false',
  });
  const passwordField = field(t('password'), {
    type: 'password',
    name: 'password',
    autocomplete: isRegister ? 'new-password' : 'current-password',
    required: true,
    minlength: isRegister ? '8' : null,
    spellcheck: 'false',
  });
  const nameField = isRegister
    ? field(t('displayName'), { type: 'text', name: 'display_name', autocomplete: 'nickname', spellcheck: 'false' }, false)
    : null;
  const serverField = field(t('server'), {
    type: 'url',
    name: 'server',
    value: apiBase(),
    autocomplete: 'off',
    spellcheck: 'false',
  });

  const submit = h('button', { type: 'submit', class: 'auth__submit' },
    h('span', { class: 'mn-text' }, isRegister ? t('register') : t('login')));
  const swap = h('a', { class: 'auth__swap' }, isRegister ? t('haveAccount') : t('noAccount'));
  swap.href = isRegister ? '#/login' : '#/register';

  const form = h('form', { class: 'auth__form', novalidate: false },
    emailField, passwordField, nameField, serverField, error, submit, swap);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const data = new FormData(form);
    setApiBase(String(data.get('server') || ''));
    submit.disabled = true;
    try {
      const email = String(data.get('email') || '').trim();
      const password = String(data.get('password') || '');
      if (isRegister) await register(email, password, String(data.get('display_name') || '').trim() || email.split('@')[0]);
      else await login(email, password);
      navigate('/today', { replace: true });
    } catch (err) {
      error.textContent = err.message || String(err);
    } finally {
      submit.disabled = false;
    }
  });

  const page = h('div', { class: 'auth' },
    h('div', { class: 'auth__card' },
      h('div', { class: 'auth__brand mn-text' },
        h('span', { class: 'auth__title' }, t('appName')),
        h('span', { class: 'auth__subtitle' }, isRegister ? t('register') : t('login'))),
      form));
  container.replaceChildren(page);
  emailField.querySelector('input').focus();

  return { destroy() {} };
}
