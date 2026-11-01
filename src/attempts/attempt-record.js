'use strict';

/**
 * Raw attempt record: observable facts about one item attempt.
 *
 * Records facts only. It does NOT decide whether an attempt counts as learning
 * evidence, whether a retry or hinted answer qualifies, or what Learning State
 * follows from it. Unknown values stay unknown (null); nothing is inferred.
 *
 * Provisional schema (proposed; reversible):
 *   itemId          non-empty string                         required
 *   attemptNumber   integer >= 1                             required
 *   status          'attempted' | 'skipped' | 'timed_out'    required
 *   selectedAnswer  non-empty string, or null if unavailable  optional, default null
 *   isCorrect       true | false | null (null = not known)     optional, default null
 *   hintLevel       highest hint shown: integer 0..HINT_LEVEL_MAX; null = not recorded
 *                                                             optional, default null
 *   elapsedTimeMs   non-negative integer, or null             optional, default null
 *
 * Rules:
 * - skipped and timed_out attempts must not carry selectedAnswer or isCorrect.
 *   Those fields must be absent or null, never invented.
 * - hintLevel 0 means "no hint shown". null means "not recorded". The two are
 *   kept distinct on purpose.
 * - HINT_LEVEL_MAX = 4 is a provisional ladder size.
 * - Unknown fields are rejected rather than silently dropped.
 */

const ATTEMPT_STATUS = Object.freeze({
  ATTEMPTED: 'attempted',
  SKIPPED: 'skipped',
  TIMED_OUT: 'timed_out',
});

const HINT_LEVEL_MAX = 4;

const ALLOWED_FIELDS = new Set([
  'itemId',
  'attemptNumber',
  'status',
  'selectedAnswer',
  'isCorrect',
  'hintLevel',
  'elapsedTimeMs',
]);

const REQUIRED_FIELDS = ['itemId', 'attemptNumber', 'status'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value >= 1;
}

/**
 * @param {object} input
 * @returns {Readonly<{
 *   itemId: string,
 *   attemptNumber: number,
 *   status: 'attempted'|'skipped'|'timed_out',
 *   selectedAnswer: string|null,
 *   isCorrect: boolean|null,
 *   hintLevel: number|null,
 *   elapsedTimeMs: number|null,
 * }>}
 * @throws {TypeError} for wrong types, unknown fields, or missing required fields.
 * @throws {RangeError} for out-of-range values.
 */
function createAttemptRecord(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Attempt input must be a plain object');
  }

  for (const key of Object.keys(input)) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw new TypeError(`Unknown attempt field: ${key}`);
    }
  }
  for (const key of REQUIRED_FIELDS) {
    if (input[key] === undefined) {
      throw new TypeError(`Missing required attempt field: ${key}`);
    }
  }

  const { itemId, attemptNumber, status } = input;
  const selectedAnswer = input.selectedAnswer === undefined ? null : input.selectedAnswer;
  const isCorrect = input.isCorrect === undefined ? null : input.isCorrect;
  const hintLevel = input.hintLevel === undefined ? null : input.hintLevel;
  const elapsedTimeMs = input.elapsedTimeMs === undefined ? null : input.elapsedTimeMs;

  if (!isNonEmptyString(itemId)) {
    throw new TypeError('itemId must be a non-empty string');
  }
  if (!isPositiveInteger(attemptNumber)) {
    throw new RangeError('attemptNumber must be an integer >= 1');
  }
  if (!Object.values(ATTEMPT_STATUS).includes(status)) {
    throw new TypeError(`Invalid status: ${String(status)}`);
  }
  if (hintLevel !== null && (!Number.isInteger(hintLevel) || hintLevel < 0 || hintLevel > HINT_LEVEL_MAX)) {
    throw new RangeError(`hintLevel must be an integer 0..${HINT_LEVEL_MAX}, or omitted`);
  }
  if (isCorrect !== null && typeof isCorrect !== 'boolean') {
    throw new TypeError('isCorrect must be true, false, or omitted');
  }
  if (elapsedTimeMs !== null && !(Number.isInteger(elapsedTimeMs) && elapsedTimeMs >= 0)) {
    throw new RangeError('elapsedTimeMs must be a non-negative integer, or omitted');
  }
  if (selectedAnswer !== null && !isNonEmptyString(selectedAnswer)) {
    throw new TypeError('selectedAnswer must be a non-empty string, or omitted when unavailable');
  }

  if (status !== ATTEMPT_STATUS.ATTEMPTED) {
    if (selectedAnswer !== null) {
      throw new TypeError(`A ${status} attempt must not have a selectedAnswer`);
    }
    if (isCorrect !== null) {
      throw new TypeError(`A ${status} attempt must not have isCorrect`);
    }
  }

  return Object.freeze({
    itemId,
    attemptNumber,
    status,
    selectedAnswer,
    isCorrect,
    hintLevel,
    elapsedTimeMs,
  });
}

module.exports = { createAttemptRecord, ATTEMPT_STATUS, HINT_LEVEL_MAX };
