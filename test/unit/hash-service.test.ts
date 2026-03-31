import test from 'node:test';
import assert from 'node:assert/strict';

import { createHash } from '../../src/services/hash-service';

test('creates deterministic hashes for the same value', () => {
  const first = createHash('feriados-peru');
  const second = createHash('feriados-peru');

  assert.equal(first, second);
  assert.equal(first.length, 64);
});

test('changes the hash when the payload changes', () => {
  const first = createHash(JSON.stringify({ holidays: ['2026-07-28'] }));
  const second = createHash(JSON.stringify({ holidays: ['2026-07-29'] }));

  assert.notEqual(first, second);
});
