/**
 * Pure helpers for last-writer-wins and title conflict copies.
 */

const CLOCK_SKEW_MS = 5 * 60 * 1000;

function parseTime(v) {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function lwwOk(localUpdatedAt, remoteCreatedAt, now = Date.now()) {
  const local = parseTime(localUpdatedAt);
  const remote = parseTime(remoteCreatedAt);
  if (local == null || remote == null) return true;
  // A badly advanced device clock must not freeze remote updates forever.
  if (local > now + CLOCK_SKEW_MS) return true;
  return !(local > remote);
}

function deviceLabel(id) {
  const compact = String(id || '').replace(/-/g, '');
  return compact.length > 4 ? `Device ${compact.slice(-4)}` : 'Device';
}

/** `{title} (Conflicted copy - Device xxxx)`, unique among `titles`. */
export function conflictCopyTitle(title, device, titles) {
  const base = `${title} (Conflicted copy - ${deviceLabel(device)})`;
  const taken = new Set(titles);
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base} (${n})`;
  return candidate;
}
