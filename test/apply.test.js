import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conflictCopyTitle, lwwOk } from '../src/sync/conflict.js';

test('lwwOk keeps remote when local is older or equal', () => {
  assert.equal(lwwOk('2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z'), true);
  assert.equal(lwwOk('2020-01-02T00:00:00.000Z', '2020-01-02T00:00:00.000Z'), true);
});

test('lwwOk skips remote when local is newer', () => {
  assert.equal(lwwOk('2020-01-03T00:00:00.000Z', '2020-01-02T00:00:00.000Z'), false);
});

test('lwwOk ignores absurd future local clocks', () => {
  const now = Date.parse('2020-01-01T00:00:00.000Z');
  assert.equal(
    lwwOk('2030-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z', now),
    true,
  );
});

test('conflictCopyTitle adds device suffix and uniqueness', () => {
  const a = conflictCopyTitle('Note', 'aaaaaaaa-bbbb-cccc-dddd-eeeeffffffff', []);
  assert.equal(a, 'Note (Conflicted copy - Device ffff)');
  const b = conflictCopyTitle('Note', 'aaaaaaaa-bbbb-cccc-dddd-eeeeffffffff', [a]);
  assert.equal(b, 'Note (Conflicted copy - Device ffff) (2)');
});
