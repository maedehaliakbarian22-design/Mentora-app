import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import {
  PROGRESS_KEY, PROGRESS_VERSION, defaultProgress, sanitizeProgress,
  recordAnswer, clearSection, setSelection, sectionAnswers, createProgressStore,
} from '../www/js/progress/progress-store.js';

const idx = indexCatalog(CATALOG);

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

test('no stored data gives the default without a recovery notice', () => {
  const r = sanitizeProgress(null, idx);
  assert.deepEqual(r.progress, defaultProgress());
  assert.equal(r.recovered, false);
});

test('wrong version or non-object data is reset and reported', () => {
  assert.equal(sanitizeProgress({ version: 1 }, idx).recovered, true);
  assert.equal(sanitizeProgress('x', idx).recovered, true);
  assert.equal(sanitizeProgress([], idx).recovered, true);
});

test('recordAnswer stores only the selected index and is immutable', () => {
  const p0 = defaultProgress();
  const p1 = recordAnswer(p0, 'demo-q1', 1, idx);
  assert.deepEqual(sectionAnswers(p1, 'chapter-1-section-1'), { 'demo-q1': 1 });
  assert.deepEqual(sectionAnswers(p0, 'chapter-1-section-1'), {});
});

test('recordAnswer rejects unknown questions and out-of-range choices', () => {
  assert.throws(() => recordAnswer(defaultProgress(), 'nope', 0, idx), RangeError);
  assert.throws(() => recordAnswer(defaultProgress(), 'demo-q1', 7, idx), RangeError);
});

test('clearSection removes only that section', () => {
  let p = recordAnswer(defaultProgress(), 'demo-q1', 0, idx);
  p = clearSection(p, 'chapter-1-section-1');
  assert.deepEqual(p.sections, {});
});

test('selection is kept only when it names an available field', () => {
  const ok = sanitizeProgress({ ...defaultProgress(), selection: { gradeId: 'grade-10', fieldId: 'experimental' } }, idx);
  assert.deepEqual(ok.progress.selection, { gradeId: 'grade-10', fieldId: 'experimental' });
  const unavailable = sanitizeProgress({ ...defaultProgress(), selection: { gradeId: 'grade-10', fieldId: 'math' } }, idx);
  assert.equal(unavailable.progress.selection, null);
});

test('setSelection is pure', () => {
  const p = setSelection(defaultProgress(), { gradeId: 'grade-10', fieldId: 'experimental' });
  assert.equal(p.selection.fieldId, 'experimental');
  assert.equal(defaultProgress().selection, null);
});

test('stored answers for unknown or out-of-range entries are dropped and reported', () => {
  const raw = {
    version: PROGRESS_VERSION,
    selection: null,
    sections: {
      'removed-section': { answers: { x: 1 } },
      'chapter-1-section-1': { answers: { 'demo-q1': 99, 'demo-q2': 2, 'ghost': 0 } },
    },
  };
  const r = sanitizeProgress(raw, idx);
  assert.deepEqual(sectionAnswers(r.progress, 'chapter-1-section-1'), { 'demo-q2': 2 });
  assert.equal(r.progress.sections['removed-section'], undefined);
  assert.equal(r.recovered, true);
});

test('store round-trips and survives unparsable or unavailable storage', () => {
  const storage = fakeStorage();
  const store = createProgressStore(storage, idx);
  const p = recordAnswer(defaultProgress(), 'demo-q3', 1, idx);
  assert.equal(store.save(p), true);
  const loaded = store.load();
  assert.equal(loaded.storageOk, true);
  assert.deepEqual(sectionAnswers(loaded.progress, 'chapter-1-section-1'), { 'demo-q3': 1 });

  const broken = createProgressStore(fakeStorage({ [PROGRESS_KEY]: '{not json' }), idx).load();
  assert.equal(broken.recovered, true);
  assert.equal(broken.storageOk, true);

  const failing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  const f = createProgressStore(failing, idx);
  assert.equal(f.load().storageOk, false);
  assert.equal(f.save(p), false);
});
