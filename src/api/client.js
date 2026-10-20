import { apiBase } from '../config.js';
import { clearSession, token } from '../session.js';

export class ApiError extends Error {
  constructor(message, { status = 0, body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  get network() {
    return this.status === 0;
  }
}

function errorMessage(body, status) {
  if (body && typeof body === 'object') {
    if (typeof body.error === 'string') return body.error;
    if (body.error && typeof body.error.message === 'string') return body.error.message;
    if (typeof body.message === 'string') return body.message;
    if (body.errors) return JSON.stringify(body.errors);
  }
  return `HTTP ${status}`;
}

export async function request(path, { method = 'GET', body, auth = true, query } = {}) {
  const url = new URL(apiBase() + path);
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, String(v));
  });

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && token()) headers.Authorization = `Bearer ${token()}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError('Cannot reach sync server', { status: 0, body: String(e) });
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (res.status === 401 && auth) clearSession('expired');
  if (!res.ok) throw new ApiError(errorMessage(data, res.status), { status: res.status, body: data });
  return data;
}
