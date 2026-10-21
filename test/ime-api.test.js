import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNextWordsField } from '../src/api/ime.js';

test('parseNextWordsField splits comma and newline', () => {
  assert.deepEqual(parseNextWordsField('a, b\nc'), ['a', 'b', 'c']);
});

test('parseNextWordsField trims Mongolian entries', () => {
  assert.deepEqual(parseNextWordsField('ᠰᠡᠪᠡ, ᠬᠡ'), ['ᠰᠡᠪᠡ', 'ᠬᠡ']);
});
