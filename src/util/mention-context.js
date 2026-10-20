/**
 * Extract a short context window around a wiki/tag mention in block text.
 */

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function snippet(text, max = 40) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/** Find [[title]] / #title in text and return { before, match, after }. */
export function mentionContext(text, target, linkType = 'wiki', radius = 20) {
  const raw = String(text || '');
  const clean = String(target || '').trim();
  if (!raw || !clean) {
    return { before: '', match: '', after: snippet(raw, radius * 2) };
  }

  const patterns = linkType === 'tag'
    ? [
      new RegExp(`(?:^|[\\s\\n])(#${escapeRe(clean)})(?=[\\s\\n#,.?!:;"'\\]\\[]|$)`),
      new RegExp(`(#${escapeRe(clean)})`, 'i'),
    ]
    : [
      new RegExp(`(\\[\\[${escapeRe(clean)}\\]\\])`, 'i'),
      new RegExp(`(${escapeRe(clean)})`, 'i'),
    ];

  let matchStart = -1;
  let matchEnd = -1;
  let matchText = clean;
  for (const re of patterns) {
    const m = re.exec(raw);
    if (!m) continue;
    // Prefer the capture (full [[…]] / #tag); fall back to whole match.
    const token = m[1] || m[0];
    matchStart = m.index + m[0].indexOf(token);
    matchEnd = matchStart + token.length;
    matchText = raw.slice(matchStart, matchEnd);
    break;
  }

  if (matchStart < 0) {
    return { before: '', match: '', after: snippet(raw, radius * 2) };
  }

  const from = Math.max(0, matchStart - radius);
  const to = Math.min(raw.length, matchEnd + radius);
  return {
    before: `${from > 0 ? '…' : ''}${raw.slice(from, matchStart)}`,
    match: matchText,
    after: `${raw.slice(matchEnd, to)}${to < raw.length ? '…' : ''}`,
  };
}
