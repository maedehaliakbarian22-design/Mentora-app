import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import { createAttemptRecord, newSessionId } from '../www/js/attempts/attempt-record.js';
import {
  PROGRESS_KEY, PROGRESS_VERSION, defaultProgress, sanitizeProgress, recordAnswer,
  appendAttempt, deriveAnswersFromAttempts, sectionAnswers, createProgressStore,
} from '../www/js/progress/progress-store.js';

const idx = indexCatalog(CATALOG);
const SECTION = 'chapter-1-section-1';
const Q1 = idx.questions.get('demo-q1');
const Q2 = idx.questions.get('demo-q2');
const SESSION = 'session-a';

function attempt(question, selectedIndex, extra = {}) {
  return createAttemptRecord({
    itemId: question.id,
    attemptNumber: 1,
    status: 'attempted',
    sessionId: SESSION,
    selectedIndex,
    isCorrect: selectedIndex === question.correctIndex,
    elapsedTimeMs: 1500,
    ...extra,
  });
}

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

// ----- raw attempt record ---------------------------------------------------

test('a valid attempt record is frozen and gets default optional fields', () => {
  const r = createAttemptRecord({ itemId: 'x', attemptNumber: 1, status: 'attempted', sessionId: 's' });
  assert.equal(Object.isFrozen(r), true);
  assert.equal(r.selectedIndex, null);
  assert.equal(r.isCorrect, null);
  assert.equal(r.hintLevel, null);
  assert.equal(r.elapsedTimeMs, null);
});

test('attempt record rejects unknown fields, missing identity and bad values', () => {
  const base = { itemId: 'x', attemptNumber: 1, status: 'attempted', sessionId: 's' };
  assert.throws(() => createAttemptRecord({ ...base, learningState: 'stable' }), TypeError);
  assert.throws(() => createAttemptRecord({ ...base, sessionId: undefined }), TypeError);
  assert.throws(() => createAttemptRecord({ ...base, sessionId: '   ' }), TypeError);
  assert.throws(() => createAttemptRecord({ ...base, itemId: '' }), TypeError);
  assert.throws(() => createAttemptRecord({ ...base, status: 'guessed' }), TypeError);
  assert.throws(() => createAttemptRecord({ ...base, attemptNumber: 0 }), RangeError);
  assert.throws(() => createAttemptRecord({ ...base, selectedIndex: -1 }), RangeError);
  assert.throws(() => createAttemptRecord({ ...base, isCorrect: 'yes' }), TypeError);
  assert.throws(() => createAttemptRecord({ ...base, hintLevel: 5 }), RangeError);
  assert.throws(() => createAttemptRecord({ ...base, elapsedTimeMs: -3 }), RangeError);
});

test('skipped and timed-out attempts cannot carry an answer or correctness', () => {
  for (const status of ['skipped', 'timed_out']) {
    const base = { itemId: 'x', attemptNumber: 1, status, sessionId: 's' };
    assert.throws(() => createAttemptRecord({ ...base, selectedIndex: 0 }), TypeError);
    assert.throws(() => createAttemptRecord({ ...base, isCorrect: true }), TypeError);
    assert.equal(createAttemptRecord(base).selectedIndex, null);
  }
});

test('newSessionId gives a non-empty id, distinct per call, and works without randomUUID', () => {
  const a = newSessionId();
  const b = newSessionId();
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
  const fallback = newSessionId({});
  assert.ok(fallback.startsWith('s-'));
});

// ----- append-only log ------------------------------------------------------

test('appendAttempt appends without changing earlier records or the input progress', () => {
  const p0 = defaultProgress();
  const r1 = attempt(Q1, 0);
  const p1 = appendAttempt(p0, r1, idx);
  const r2 = attempt(Q2, 1, { attemptNumber: 1 });
  const p2 = appendAttempt(p1, r2, idx);

  assert.deepEqual(p0.attempts, []);
  assert.equal(p1.attempts.length, 1);
  assert.equal(p2.attempts.length, 2);
  assert.equal(p2.attempts[0], r1);
  assert.equal(p2.attempts[1], r2);
});

test('appendAttempt rejects a record for an unknown question or an out-of-range choice', () => {
  const unknown = createAttemptRecord({ itemId: 'nope', attemptNumber: 1, status: 'attempted', sessionId: SESSION });
  assert.throws(() => appendAttempt(defaultProgress(), unknown, idx), RangeError);
  const outOfRange = attempt(Q1, 99);
  assert.throws(() => appendAttempt(defaultProgress(), outOfRange, idx), RangeError);
});

test('repeated attempts on one question are all kept, and the latest answer wins', () => {
  let p = defaultProgress();
  p = appendAttempt(p, attempt(Q1, 0, { attemptNumber: 1 }), idx);
  p = appendAttempt(p, attempt(Q1, 2, { attemptNumber: 2 }), idx);
  assert.equal(p.attempts.length, 2);
  assert.deepEqual(deriveAnswersFromAttempts(p.attempts), { 'demo-q1': 2 });
});

test('deriveAnswersFromAttempts ignores skipped and timed-out records', () => {
  const skipped = createAttemptRecord({ itemId: 'demo-q2', attemptNumber: 1, status: 'skipped', sessionId: SESSION });
  assert.deepEqual(deriveAnswersFromAttempts([skipped]), {});
});

test('rebuilt answers match the latest-answer map after Check', () => {
  // Mirrors the Check handler: recordAnswer and appendAttempt in one commit.
  let p = defaultProgress();
  const steps = [[Q1, 1], [Q2, 2], [Q1, 0]];
  steps.forEach(([q, choice], i) => {
    const rec = attempt(q, choice, { attemptNumber: steps.slice(0, i + 1).filter(([x]) => x.id === q.id).length });
    p = appendAttempt(recordAnswer(p, q.id, choice, idx), rec, idx);
  });
  assert.deepEqual(deriveAnswersFromAttempts(p.attempts), sectionAnswers(p, SECTION));
});

// ----- storage schema -------------------------------------------------------

test('storage schema is version 4 and the defaults carry an empty attempt log', () => {
  assert.equal(PROGRESS_VERSION, 4);
  assert.deepEqual(defaultProgress().attempts, []);
  assert.equal(defaultProgress().xp, 0);
});

test('a version 2 record migrates in place with empty attempts and no recovery notice', () => {
  const v2 = { version: 2, selection: null, sections: { [SECTION]: { answers: { 'demo-q1': 1 } } } };
  const r = sanitizeProgress(v2, idx);
  assert.equal(r.recovered, false);
  assert.equal(r.progress.version, 4);
  assert.deepEqual(r.progress.attempts, []);
  assert.equal(r.progress.xp, 0);
  assert.deepEqual(sectionAnswers(r.progress, SECTION), { 'demo-q1': 1 });
});

test('valid stored attempts survive a load and are re-validated', () => {
  const p = appendAttempt(defaultProgress(), attempt(Q1, 1), idx);
  const r = sanitizeProgress(JSON.parse(JSON.stringify(p)), idx);
  assert.equal(r.recovered, false);
  assert.equal(r.progress.attempts.length, 1);
  assert.equal(r.progress.attempts[0].selectedIndex, 1);
});

test('stored attempts for removed content are dropped silently', () => {
  const raw = { ...defaultProgress(), attempts: [{ itemId: 'removed-q', attemptNumber: 1, status: 'attempted', sessionId: SESSION, selectedIndex: 0 }] };
  const r = sanitizeProgress(raw, idx);
  assert.equal(r.progress.attempts.length, 0);
  assert.equal(r.recovered, false);
});

test('a malformed stored attempt is dropped and reported', () => {
  const raw = { ...defaultProgress(), attempts: [{ itemId: 'demo-q1', attemptNumber: 1, status: 'attempted', sessionId: '' }] };
  const r = sanitizeProgress(raw, idx);
  assert.equal(r.progress.attempts.length, 0);
  assert.equal(r.recovered, true);
});

test('a forged isCorrect is replaced with the value recomputed from content and reported', () => {
  const forged = {
    ...defaultProgress(),
    attempts: [{ itemId: 'demo-q1', attemptNumber: 1, status: 'attempted', sessionId: SESSION, selectedIndex: 0, isCorrect: true }],
  };
  const expected = 0 === Q1.correctIndex;
  const r = sanitizeProgress(forged, idx);
  assert.equal(r.progress.attempts[0].isCorrect, expected);
  assert.equal(r.recovered, true);
});

test('attempts that are not a list mark the record recovered and reset the log', () => {
  const r = sanitizeProgress({ ...defaultProgress(), attempts: 'x' }, idx);
  assert.deepEqual(r.progress.attempts, []);
  assert.equal(r.recovered, true);
});

test('the store round-trips the attempt log', () => {
  const storage = fakeStorage();
  const store = createProgressStore(storage, idx);
  const p = appendAttempt(recordAnswer(defaultProgress(), 'demo-q3', 1, idx), attempt(idx.questions.get('demo-q3'), 1), idx);
  assert.equal(store.save(p), true);
  assert.equal(JSON.parse(storage._map.get(PROGRESS_KEY)).attempts.length, 1);
  const loaded = store.load();
  assert.equal(loaded.recovered, false);
  assert.equal(loaded.progress.attempts.length, 1);
  assert.deepEqual(sectionAnswers(loaded.progress, SECTION), { 'demo-q3': 1 });
});
