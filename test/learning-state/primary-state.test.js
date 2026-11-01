'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mapPrimaryState, DIRECTION, PRIMARY_STATE } = require('../../src/learning-state/primary-state');

const { POSITIVE, NEGATIVE, NOT_FORMED } = DIRECTION;
const { STABLE, UNSTABLE, NOT_LEARNED, UNDECIDED } = PRIMARY_STATE;

// All nine Recall × Retention combinations, with the expected Primary State and
// the source that supports it. Each row is an explicit expectation, not a
// copy of the implementation's table.
const CASES = [
  // [recall,     retention,  expected,    basis]
  [POSITIVE,   POSITIVE,   STABLE,      'LOCK PD-5F-19'],
  [POSITIVE,   NOT_FORMED, NOT_LEARNED, 'LOCK PD-5F-20 (Kimia framing; a second mechanical version conflicts with PD-5F-22)'],
  [POSITIVE,   NEGATIVE,   NOT_LEARNED, 'LOCK PD-5F-21'],
  [NOT_FORMED, POSITIVE,   STABLE,      'LOCK PD-5F-13'],
  [NOT_FORMED, NOT_FORMED, UNDECIDED,   'no LOCK; PD-5F-22 forbids inferring not_formed from absent channels'],
  [NOT_FORMED, NEGATIVE,   UNDECIDED,   'no LOCK; negative Retention has no formation bridge (PD-5F-21 §4)'],
  [NEGATIVE,   POSITIVE,   UNSTABLE,    'derived: PD-5F-12 (formation established) + PD-5F-11'],
  [NEGATIVE,   NOT_FORMED, UNDECIDED,   'no LOCK; PD-5F-5 does not establish not_learned, PD-5F-22 forbids the inference'],
  [NEGATIVE,   NEGATIVE,   UNDECIDED,   'no LOCK; negative Retention has no formation bridge (PD-5F-21 §4)'],
];

const DETERMINED = CASES.filter(([, , expected]) => expected !== UNDECIDED);
const UNDECIDED_CELLS = CASES.filter(([, , expected]) => expected === UNDECIDED);

test('maps all nine Recall × Retention combinations as specified', async (t) => {
  for (const [recall, retention, expected, basis] of CASES) {
    await t.test(`recall=${recall}, retention=${retention} -> ${expected} [${basis}]`, () => {
      assert.equal(mapPrimaryState(recall, retention), expected);
    });
  }
});

test('the case list covers every Direction pair exactly once', () => {
  const values = Object.values(DIRECTION);
  const keys = CASES.map(([r, ret]) => `${r}|${ret}`);
  assert.equal(CASES.length, values.length * values.length);
  assert.equal(new Set(keys).size, keys.length, 'duplicate case');
  for (const r of values) {
    for (const ret of values) {
      assert.ok(keys.includes(`${r}|${ret}`), `missing case ${r}|${ret}`);
    }
  }
});

test('exactly five cells are determined and four are UNDECIDED', () => {
  assert.equal(DETERMINED.length, 5);
  assert.equal(UNDECIDED_CELLS.length, 4);
});

test('the four open cells return UNDECIDED, never a guessed state', () => {
  for (const [recall, retention] of UNDECIDED_CELLS) {
    assert.equal(mapPrimaryState(recall, retention), UNDECIDED, `${recall}|${retention}`);
  }
});

test('every output is a known Primary State value', () => {
  const allowed = new Set(Object.values(PRIMARY_STATE));
  for (const r of Object.values(DIRECTION)) {
    for (const ret of Object.values(DIRECTION)) {
      assert.ok(allowed.has(mapPrimaryState(r, ret)), `unexpected output for ${r}|${ret}`);
    }
  }
});

test('the mapping is deterministic across repeated calls', () => {
  for (const [recall, retention, expected] of CASES) {
    assert.equal(mapPrimaryState(recall, retention), expected);
    assert.equal(mapPrimaryState(recall, retention), expected);
  }
});

test('rejects unknown, mis-cased, or missing Recall and Retention values', () => {
  assert.throws(() => mapPrimaryState('stable', POSITIVE), TypeError);
  assert.throws(() => mapPrimaryState('POSITIVE', POSITIVE), TypeError);
  assert.throws(() => mapPrimaryState(POSITIVE, 'Not_Formed'), TypeError);
  assert.throws(() => mapPrimaryState(POSITIVE, undefined), TypeError);
  assert.throws(() => mapPrimaryState(null, null), TypeError);
});

test('rejects qualifier names such as weak_transfer as Direction input', () => {
  assert.throws(() => mapPrimaryState(POSITIVE, 'weak_transfer'), TypeError);
});
