'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mapPrimaryState, DIRECTION, PRIMARY_STATE } = require('../../src/learning-state/primary-state');

const { POSITIVE, NEGATIVE, NOT_FORMED } = DIRECTION;
const { STABLE, UNSTABLE, NOT_LEARNED, UNDECIDED } = PRIMARY_STATE;

// All nine Recall × Retention combinations.
const CASES = [
  // [recall,     retention,  expected,    source]
  [POSITIVE,   POSITIVE,   STABLE,      'PD-5F-19'],
  [POSITIVE,   NOT_FORMED, NOT_LEARNED, 'PD-5F-20'],
  [POSITIVE,   NEGATIVE,   NOT_LEARNED, 'PD-5F-21'],
  [NOT_FORMED, POSITIVE,   STABLE,      'PD-5F-13'],
  [NOT_FORMED, NOT_FORMED, NOT_LEARNED, 'derived: PD-5F-11'],
  [NOT_FORMED, NEGATIVE,   UNDECIDED,   'open'],
  [NEGATIVE,   POSITIVE,   UNSTABLE,    'derived: PD-5F-12 + PD-5F-11'],
  [NEGATIVE,   NOT_FORMED, NOT_LEARNED, 'derived: PD-5F-5 + PD-5F-11'],
  [NEGATIVE,   NEGATIVE,   UNDECIDED,   'open'],
];

test('maps all nine Recall × Retention combinations', async (t) => {
  for (const [recall, retention, expected, source] of CASES) {
    await t.test(`recall=${recall}, retention=${retention} -> ${expected} (${source})`, () => {
      assert.equal(mapPrimaryState(recall, retention), expected);
    });
  }
});

test('covers every Direction pair exactly once', () => {
  const seen = new Set(CASES.map(([r, ret]) => `${r}|${ret}`));
  const values = Object.values(DIRECTION);
  assert.equal(CASES.length, values.length * values.length);
  assert.equal(seen.size, CASES.length);
  for (const r of values) {
    for (const ret of values) {
      assert.ok(seen.has(`${r}|${ret}`), `missing case ${r}|${ret}`);
    }
  }
});

test('returns UNDECIDED for the two open cells, never a guessed state', () => {
  assert.equal(mapPrimaryState(NOT_FORMED, NEGATIVE), UNDECIDED);
  assert.equal(mapPrimaryState(NEGATIVE, NEGATIVE), UNDECIDED);
});

test('rejects unknown Recall or Retention values', () => {
  assert.throws(() => mapPrimaryState('stable', POSITIVE), TypeError);
  assert.throws(() => mapPrimaryState(POSITIVE, undefined), TypeError);
  assert.throws(() => mapPrimaryState(null, null), TypeError);
});
