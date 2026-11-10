import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentOf } from '../www/js/domain/percent.js';

test('1 of 8 is 13 percent (12.5 rounds up)', () => {
  assert.equal(percentOf(1, 8), 13);
});

test('halves round up in both directions', () => {
  assert.equal(percentOf(5, 8), 63); // 62.5 -> 63
  assert.equal(percentOf(7, 8), 88); // 87.5 -> 88
  assert.equal(percentOf(1, 2), 50);
});

test('thirds round to the nearest whole percent', () => {
  assert.equal(percentOf(1, 3), 33);
  assert.equal(percentOf(2, 3), 67);
});

test('exact fractions and boundaries', () => {
  assert.equal(percentOf(0, 5), 0);
  assert.equal(percentOf(4, 4), 100);
  assert.equal(percentOf(4, 4), 100);
});

test('0 of 0 has no percentage (null, not 0)', () => {
  assert.equal(percentOf(0, 0), null);
});

test('impossible inputs are rejected', () => {
  assert.throws(() => percentOf(3, 2), RangeError);
  assert.throws(() => percentOf(-1, 2), RangeError);
  assert.throws(() => percentOf(1.5, 2), RangeError);
  assert.throws(() => percentOf(1, -2), RangeError);
});
