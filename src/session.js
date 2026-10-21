import { newId } from './util.js';

const TOKEN_KEY = 'mgl.token';
const USER_KEY = 'mgl.user';
const DEVICE_KEY = 'mgl.deviceId';

const listeners = new Set();

export function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = newId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function token() {
  return localStorage.getItem(TOKEN_KEY) || null;
}

export function currentUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function loggedIn() {
  return !!token() && !!currentUser();
}

export function setSession(nextToken, user) {
  localStorage.setItem(TOKEN_KEY, nextToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  listeners.forEach((fn) => fn({ loggedIn: true, user }));
}

export function clearSession(reason = 'logout') {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  listeners.forEach((fn) => fn({ loggedIn: false, reason }));
}

export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === TOKEN_KEY || e.key === USER_KEY) {
      const isNowIn = loggedIn();
      listeners.forEach((fn) => fn({
        loggedIn: isNowIn,
        user: isNowIn ? currentUser() : null,
        reason: isNowIn ? 'login' : 'logout',
      }));
    }
  });
}
