'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAttemptRecord,
  ATTEMPT_STATUS,
  HINT_LEVEL_MAX,
} = require('../../src/attempts/attempt-record');

const attempted = (overrides = {}) => ({
  itemId: 'chem10-q001',
  attemptNumber: 1,
  status: ATTEMPT_STATUS.ATTEMPTED,
  ...overrides,
});

// Valid records ---------------------------------------------------------------

test('valid attempted record with all fields is stored with its observed facts', () => {
  const record = createAttemptRecord(attempted({
    selectedAnswer: 'B',
    isCorrect: true,
    hintLevel: 0,
    elapsedTimeMs: 4200,
  }));
  assert.deepEqual(record, {
    itemId: 'chem10-q001',
    attemptNumber: 1,
    status: 'attempted',
    selectedAnswer: 'B',
    isCorrect: true,
    hintLevel: 0,
    elapsedTimeMs: 4200,
  });
});

test('attempted record with isCorrect false is accepted', () => {
  assert.equal(createAttemptRecord(attempted({ isCorrect: false })).isCorrect, false);
});

test('highest hint level is kept, including the ladder maximum', () => {
  assert.equal(createAttemptRecord(attempted({ hintLevel: HINT_LEVEL_MAX })).hintLevel, HINT_LEVEL_MAX);
});

test('record is frozen', () => {
  const record = createAttemptRecord(attempted());
  assert.ok(Object.isFrozen(record));
  assert.throws(() => {
    record.isCorrect = true;
  }, TypeError);
});

test('skipped attempt: no answer, no correctness, hint level and time kept', () => {
  const record = createAttemptRecord({
    itemId: 'chem10-q002',
    attemptNumber: 1,
    status: ATTEMPT_STATUS.SKIPPED,
    hintLevel: 2,
    elapsedTimeMs: 1500,
  });
  assert.equal(record.status, 'skipped');
  assert.equal(record.selectedAnswer, null);
  assert.equal(record.isCorrect, null);
  assert.equal(record.hintLevel, 2);
  assert.equal(record.elapsedTimeMs, 1500);
});

test('timed-out attempt with elapsed time is accepted and invents no answer', () => {
  const record = createAttemptRecord({
    itemId: 'chem10-q003',
    attemptNumber: 2,
    status: ATTEMPT_STATUS.TIMED_OUT,
    elapsedTimeMs: 60000,
  });
  assert.equal(record.status, 'timed_out');
  assert.equal(record.selectedAnswer, null);
  assert.equal(record.isCorrect, null);
  assert.equal(record.elapsedTimeMs, 60000);
});

// Missing optional data -------------------------------------------------------

test('omitted optional fields become null, not guesses', () => {
  const record = createAttemptRecord(attempted());
  assert.equal(record.selectedAnswer, null);
  assert.equal(record.isCorrect, null);
  assert.equal(record.hintLevel, null);
  assert.equal(record.elapsedTimeMs, null);
});

test('explicit null for optional fields is accepted', () => {
  const record = createAttemptRecord(attempted({
    selectedAnswer: null, isCorrect: null, hintLevel: null, elapsedTimeMs: null,
  }));
  assert.equal(record.selectedAnswer, null);
  assert.equal(record.isCorrect, null);
  assert.equal(record.hintLevel, null);
  assert.equal(record.elapsedTimeMs, null);
});

test('hintLevel 0 (no hint shown) is distinct from null (not recorded)', () => {
  assert.equal(createAttemptRecord(attempted({ hintLevel: 0 })).hintLevel, 0);
  assert.equal(createAttemptRecord(attempted()).hintLevel, null);
});

test('attempted record without a recorded answer is valid (answer unavailable)', () => {
  assert.equal(createAttemptRecord(attempted({ isCorrect: null })).selectedAnswer, null);
});

test('elapsedTimeMs of zero is valid', () => {
  assert.equal(createAttemptRecord(attempted({ elapsedTimeMs: 0 })).elapsedTimeMs, 0);
});

// Invalid inputs --------------------------------------------------------------

test('rejects non-object input', () => {
  for (const bad of [null, undefined, 'x', 3, []]) {
    assert.throws(() => createAttemptRecord(bad), TypeError);
  }
});

test('rejects unknown fields instead of dropping them', () => {
  assert.throws(() => createAttemptRecord(attempted({ retryQualifies: true })), TypeError);
  assert.throws(() => createAttemptRecord(attempted({ elapsedMs: 100 })), TypeError);
});

test('rejects missing required fields: itemId, attemptNumber, status', () => {
  for (const key of ['itemId', 'attemptNumber', 'status']) {
    const input = attempted();
    delete input[key];
    assert.throws(() => createAttemptRecord(input), TypeError, `missing ${key}`);
  }
});

test('rejects empty, blank, or non-string itemId', () => {
  assert.throws(() => createAttemptRecord(attempted({ itemId: '' })), TypeError);
  assert.throws(() => createAttemptRecord(attempted({ itemId: '   ' })), TypeError);
  assert.throws(() => createAttemptRecord(attempted({ itemId: 42 })), TypeError);
});

test('rejects attemptNumber below 1 or non-integer', () => {
  for (const bad of [0, -1, 1.5, '1', NaN]) {
    assert.throws(() => createAttemptRecord(attempted({ attemptNumber: bad })), RangeError, String(bad));
  }
});

test('rejects unknown status values, including the old "answered" name', () => {
  for (const bad of ['correct', 'Attempted', 'answered', 'timeout']) {
    assert.throws(() => createAttemptRecord(attempted({ status: bad })), TypeError, bad);
  }
});

test('rejects hintLevel outside 0..HINT_LEVEL_MAX or non-integer', () => {
  for (const bad of [-1, HINT_LEVEL_MAX + 1, 1.5, '0']) {
    assert.throws(() => createAttemptRecord(attempted({ hintLevel: bad })), RangeError, String(bad));
  }
});

test('rejects a blank selectedAnswer; omit it or use null when unavailable', () => {
  assert.throws(() => createAttemptRecord(attempted({ selectedAnswer: '' })), TypeError);
  assert.throws(() => createAttemptRecord(attempted({ selectedAnswer: '  ' })), TypeError);
  assert.throws(() => createAttemptRecord(attempted({ selectedAnswer: 7 })), TypeError);
});

test('rejects non-boolean isCorrect', () => {
  assert.throws(() => createAttemptRecord(attempted({ isCorrect: 'yes' })), TypeError);
  assert.throws(() => createAttemptRecord(attempted({ isCorrect: 1 })), TypeError);
});

test('rejects invalid elapsedTimeMs', () => {
  assert.throws(() => createAttemptRecord(attempted({ elapsedTimeMs: -1 })), RangeError);
  assert.throws(() => createAttemptRecord(attempted({ elapsedTimeMs: 1.5 })), RangeError);
  assert.throws(() => createAttemptRecord(attempted({ elapsedTimeMs: '100' })), RangeError);
});

// Skipped and timed-out rules -------------------------------------------------

test('skipped attempt rejects a selectedAnswer', () => {
  assert.throws(
    () => createAttemptRecord({
      itemId: 'chem10-q002', attemptNumber: 1, status: 'skipped', selectedAnswer: 'A',
    }),
    TypeError,
  );
});

test('timed-out attempt rejects a selectedAnswer', () => {
  assert.throws(
    () => createAttemptRecord({
      itemId: 'chem10-q003', attemptNumber: 1, status: 'timed_out', selectedAnswer: 'C',
    }),
    TypeError,
  );
});

test('skipped and timed-out attempts reject isCorrect, even when false', () => {
  for (const status of ['skipped', 'timed_out']) {
    assert.throws(
      () => createAttemptRecord({
        itemId: 'chem10-q004', attemptNumber: 1, status, isCorrect: false,
      }),
      TypeError,
      status,
    );
  }
});

test('skipped and timed-out attempts accept explicit null answer and correctness', () => {
  for (const status of ['skipped', 'timed_out']) {
    const record = createAttemptRecord({
      itemId: 'chem10-q005', attemptNumber: 1, status, selectedAnswer: null, isCorrect: null,
    });
    assert.equal(record.selectedAnswer, null);
    assert.equal(record.isCorrect, null);
  }
});

// Scope -----------------------------------------------------------------------

test('does not interpret retries or hints as evidence: no derived field is produced', () => {
  const record = createAttemptRecord(attempted({ attemptNumber: 2, hintLevel: 3, isCorrect: true }));
  for (const key of ['qualifies', 'evidence', 'counts', 'learningState', 'direction', 'primaryState']) {
    assert.ok(!(key in record), `unexpected derived field ${key}`);
  }
});
