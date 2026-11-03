import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  sanitizeState,
  defaultState,
  STORAGE_KEY,
  SCHEMA_VERSION,
} from '../www/js/data/attempt-store.js';
import { CONTENT } from '../www/js/data/demo-content.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const validState = () => ({
  version: SCHEMA_VERSION,
  chapterId: CONTENT.chapter.id,
  lessonId: 'lesson-1',
  phase: 'question',
  questionIndex: 1,
  answers: { q1: { selectedIndex: 1, correct: true } },
});

test('empty storage yields the default state without a recovery notice', () => {
  const store = createStore(fakeStorage(), CONTENT);
  const r = store.load();
  assert.equal(r.recovered, false);
  assert.equal(r.storageOk, true);
  assert.deepEqual(r.state, defaultState(CONTENT));
  assert.equal(r.state.phase, 'chapter');
});

test('a saved state round-trips through storage', () => {
  const storage = fakeStorage();
  const store = createStore(storage, CONTENT);
  assert.equal(store.save(validState()), true);
  const r = createStore(storage, CONTENT).load();
  assert.equal(r.recovered, false);
  assert.deepEqual(r.state, validState());
});

test('unparsable JSON is recovered to the default with a notice', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: '{not json' });
  const r = createStore(storage, CONTENT).load();
  assert.equal(r.recovered, true);
  assert.equal(r.reason, 'parse');
  assert.deepEqual(r.state, defaultState(CONTENT));
});

test('storage whose read throws is reported as unavailable, not recovered', () => {
  const storage = {
    getItem() { throw new Error('SecurityError'); },
    setItem() {},
    removeItem() {},
  };
  const r = createStore(storage, CONTENT).load();
  assert.equal(r.storageOk, false);
  assert.equal(r.recovered, false);
  assert.deepEqual(r.state, defaultState(CONTENT));
});

test('a failing save returns false instead of throwing', () => {
  const storage = {
    getItem: () => null,
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() {},
  };
  assert.equal(createStore(storage, CONTENT).save(validState()), false);
});

test('reset removes the stored state', () => {
  const storage = fakeStorage();
  const store = createStore(storage, CONTENT);
  store.save(validState());
  assert.equal(store.reset(), true);
  assert.equal(storage.map.has(STORAGE_KEY), false);
});

test('reset reports failure instead of throwing when storage is broken', () => {
  const storage = {
    getItem: () => null,
    setItem() {},
    removeItem() { throw new Error('denied'); },
  };
  assert.equal(createStore(storage, CONTENT).reset(), false);
});

test('sanitizeState accepts a valid state unchanged', () => {
  const r = sanitizeState(validState(), CONTENT);
  assert.equal(r.recovered, false);
  assert.deepEqual(r.state, validState());
});

test('sanitizeState rejects each structural defect and falls back to default', () => {
  const cases = {
    'not-object': 'hello',
    'array': [],
    'version': { ...validState(), version: 99 },
    'chapter': { ...validState(), chapterId: 'other' },
    'lesson': { ...validState(), lessonId: 'nope' },
    'phase': { ...validState(), phase: 'hacked' },
    'questionIndex-negative': { ...validState(), questionIndex: -1 },
    'questionIndex-too-big': { ...validState(), questionIndex: 99 },
    'questionIndex-float': { ...validState(), questionIndex: 1.5 },
    'answers-array': { ...validState(), answers: [] },
    'answers-null': { ...validState(), answers: null },
    'answer-entry-not-object': { ...validState(), answers: { q1: 'yes' } },
    'answer-entry-no-index': { ...validState(), answers: { q1: { correct: true } } },
    'answer-range': { ...validState(), answers: { q1: { selectedIndex: 7, correct: true } } },
    'unknown-answer': { ...validState(), answers: { zz: { selectedIndex: 0 } } },
  };
  for (const [name, raw] of Object.entries(cases)) {
    const r = sanitizeState(raw, CONTENT);
    assert.equal(r.recovered, true, name);
    assert.deepEqual(r.state, defaultState(CONTENT), name);
  }
});

test('sanitizeState recomputes correct from content, ignoring a forged flag', () => {
  const forged = {
    ...validState(),
    answers: { q1: { selectedIndex: 0, correct: true } },
  };
  const r = sanitizeState(forged, CONTENT);
  assert.equal(r.recovered, false);
  assert.deepEqual(r.state.answers.q1, { selectedIndex: 0, correct: false });
});

test('prototype-pollution keys in answers do not leak into the state', () => {
  const raw = JSON.parse('{"version":1,"chapterId":"chapter-1","lessonId":"lesson-1","phase":"lesson","questionIndex":0,"answers":{"__proto__":{"selectedIndex":0}}}');
  const r = sanitizeState(raw, CONTENT);
  assert.equal(r.recovered, true);
  assert.equal(({}).selectedIndex, undefined);
});
