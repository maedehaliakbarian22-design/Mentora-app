// Raw attempt record: observable facts about one question attempt.
//
// Adapted from feature/raw-attempt-record (src/attempts/attempt-record.js) into
// this branch's ES module layout. Field rules are kept; two deliberate changes:
//   - selectedIndex (option index) replaces selectedAnswer (string), because the
//     app stores option indices, not answer text.
//   - sessionId is required, so attempts can be grouped by app session.
//
// Records facts only. It does not decide whether an attempt counts as learning
// evidence and does not compute Learning State. Unknown values stay null.
//
// Fields:
//   itemId         non-empty string                         required
//   attemptNumber  integer >= 1                             required
//   status         'attempted' | 'skipped' | 'timed_out'    required
//   sessionId      non-empty string                         required
//   selectedIndex  integer >= 0, or null if unavailable     default null
//   isCorrect      boolean, or null if not known            default null
//   hintLevel      integer 0..HINT_LEVEL_MAX, or null       default null
//   elapsedTimeMs  non-negative integer, or null            default null
//
// Rules:
// - skipped and timed_out attempts must not carry selectedIndex or isCorrect.
// - hintLevel 0 means "no hint shown"; null means "not recorded". Kept distinct.
// - HINT_LEVEL_MAX = 4 is a provisional ladder size (no hints in the MVP yet).
// - Unknown fields are rejected rather than silently dropped.
// - Records are frozen. The store appends them and never rewrites them.

export const ATTEMPT_STATUS = Object.freeze({
  ATTEMPTED: 'attempted',
  SKIPPED: 'skipped',
  TIMED_OUT: 'timed_out',
});

export const HINT_LEVEL_MAX = 4;

const ALLOWED_FIELDS = new Set([
  'itemId',
  'attemptNumber',
  'status',
  'sessionId',
  'selectedIndex',
  'isCorrect',
  'hintLevel',
  'elapsedTimeMs',
]);

const REQUIRED_FIELDS = ['itemId', 'attemptNumber', 'status', 'sessionId'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Returns a frozen record or throws TypeError / RangeError.
export function createAttemptRecord(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Attempt input must be a plain object');
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED_FIELDS.has(key)) throw new TypeError(`Unknown attempt field: ${key}`);
  }
  for (const key of REQUIRED_FIELDS) {
    if (input[key] === undefined) throw new TypeError(`Missing required attempt field: ${key}`);
  }

  const { itemId, attemptNumber, status, sessionId } = input;
  const selectedIndex = input.selectedIndex === undefined ? null : input.selectedIndex;
  const isCorrect = input.isCorrect === undefined ? null : input.isCorrect;
  const hintLevel = input.hintLevel === undefined ? null : input.hintLevel;
  const elapsedTimeMs = input.elapsedTimeMs === undefined ? null : input.elapsedTimeMs;

  if (!isNonEmptyString(itemId)) throw new TypeError('itemId must be a non-empty string');
  if (!isNonEmptyString(sessionId)) throw new TypeError('sessionId must be a non-empty string');
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new RangeError('attemptNumber must be an integer >= 1');
  }
  if (!Object.values(ATTEMPT_STATUS).includes(status)) {
    throw new TypeError(`Invalid status: ${String(status)}`);
  }
  if (selectedIndex !== null && (!Number.isInteger(selectedIndex) || selectedIndex < 0)) {
    throw new RangeError('selectedIndex must be a non-negative integer, or omitted');
  }
  if (isCorrect !== null && typeof isCorrect !== 'boolean') {
    throw new TypeError('isCorrect must be true, false, or omitted');
  }
  if (hintLevel !== null && (!Number.isInteger(hintLevel) || hintLevel < 0 || hintLevel > HINT_LEVEL_MAX)) {
    throw new RangeError(`hintLevel must be an integer 0..${HINT_LEVEL_MAX}, or omitted`);
  }
  if (elapsedTimeMs !== null && !(Number.isInteger(elapsedTimeMs) && elapsedTimeMs >= 0)) {
    throw new RangeError('elapsedTimeMs must be a non-negative integer, or omitted');
  }
  if (status !== ATTEMPT_STATUS.ATTEMPTED) {
    if (selectedIndex !== null) throw new TypeError(`A ${status} attempt must not have a selectedIndex`);
    if (isCorrect !== null) throw new TypeError(`A ${status} attempt must not have isCorrect`);
  }

  return Object.freeze({
    itemId,
    attemptNumber,
    status,
    sessionId,
    selectedIndex,
    isCorrect,
    hintLevel,
    elapsedTimeMs,
  });
}

// Session identity for one app launch. Uses crypto.randomUUID when available.
export function newSessionId(cryptoApi = globalThis.crypto) {
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
