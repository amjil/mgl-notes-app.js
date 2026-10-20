import { request } from './client.js';
import { clearSession, setSession } from '../session.js';

export async function login(email, password) {
  const res = await request('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: { email, password },
  });
  setSession(res.token, res.user);
  return res.user;
}

export async function register(email, password, displayName) {
  const res = await request('/api/auth/register', {
    method: 'POST',
    auth: false,
    body: { email, password, display_name: displayName },
  });
  setSession(res.token, res.user);
  return res.user;
}

export async function logout() {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } catch {
    /* the local session is dropped either way */
  }
  clearSession('logout');
}

export async function me() {
  const res = await request('/api/auth/me');
  return res.user;
}
