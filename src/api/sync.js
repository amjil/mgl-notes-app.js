import { request } from './client.js';

/** POST /api/sync/push → { ok, accepted, skipped, title_renames } */
export function pushOperations(operations) {
  return request('/api/sync/push', { method: 'POST', body: { operations } });
}

/** GET /api/sync/pull → Operation[] ordered by (received_at, id) */
export async function pullOperations({ since = '0', sinceId = '', limit = 200 } = {}) {
  const res = await request('/api/sync/pull', {
    query: { since, since_id: sinceId, limit },
  });
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.operations)) return res.operations;
  return [];
}
