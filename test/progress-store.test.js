import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import {
  PROGRESS_KEY, PROGRESS_VERSION, BACKUP_PREFIX, defaultProgress, sanitizeProgress,
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

test('clearSection empties the section and closes its active run', () => {
  let p = recordAnswer(defaultProgress(), 'demo-q1', 0, idx);
  p = { ...p, sections: { ...p.sections, 'chapter-1-section-1': { ...p.sections['chapter-1-section-1'], runId: 'R1' } } };
  p = clearSection(p, 'chapter-1-section-1');
  assert.deepEqual(p.sections['chapter-1-section-1'], { answers: {}, runId: null, closedRunIds: ['R1'] });
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

test('run identity fields survive a round trip', () => {
  const raw = {
    version: PROGRESS_VERSION, selection: null,
    sections: { 'chapter-1-section-1': { answers: { 'demo-q1': 1 }, runId: 'R9', closedRunIds: ['R1'] } },
  };
  const r = sanitizeProgress(raw, idx);
  assert.equal(r.progress.sections['chapter-1-section-1'].runId, 'R9');
  assert.deepEqual(r.progress.sections['chapter-1-section-1'].closedRunIds, ['R1']);
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

test('legacy v2 data is backed up verbatim before the first save overwrites it', () => {
  const legacy = JSON.stringify({ version: 2, selection: null, sections: {} });
  const storage = fakeStorage({ [PROGRESS_KEY]: legacy });
  const store = createProgressStore(storage, idx);
  const loaded = store.load();
  assert.equal(loaded.recovered, false);
  assert.equal(store.save(loaded.progress), true);
  const backups = [...storage._map.keys()].filter((k) => k.startsWith(BACKUP_PREFIX));
  assert.equal(backups.length, 1);
  assert.equal(storage._map.get(backups[0]), legacy);
  assert.equal(JSON.parse(storage.getItem(PROGRESS_KEY)).version, PROGRESS_VERSION);
});

test('unparsable stored data is preserved in a backup before the recovered state is saved', () => {
  const corrupt = '{not json';
  const storage = fakeStorage({ [PROGRESS_KEY]: corrupt });
  const store = createProgressStore(storage, idx);
  const loaded = store.load();
  assert.equal(loaded.recovered, true);
  assert.equal(store.save(loaded.progress), true);
  assert.ok([...storage._map.values()].includes(corrupt));
});

test('clean current-version data is saved without creating a backup', () => {
  const storage = fakeStorage();
  const first = createProgressStore(storage, idx);
  assert.equal(first.save(recordAnswer(defaultProgress(), 'demo-q3', 1, idx)), true);
  const again = createProgressStore(storage, idx);
  const loaded = again.load();
  assert.equal(again.save(loaded.progress), true);
  assert.equal([...storage._map.keys()].some((k) => k.startsWith(BACKUP_PREFIX)), false);
});

test('if the backup cannot be verified, the original data is left untouched', () => {
  const legacy = JSON.stringify({ version: 2, selection: null, sections: {} });
  const map = new Map([[PROGRESS_KEY, legacy]]);
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (!k.startsWith(BACKUP_PREFIX)) map.set(k, String(v)); },
    removeItem: (k) => map.delete(k),
  };
  const store = createProgressStore(storage, idx);
  const loaded = store.load();
  assert.equal(store.save(loaded.progress), false);
  assert.equal(map.get(PROGRESS_KEY), legacy);
});

test('a save whose main write does not read back is reported as failed', () => {
  const storage = fakeStorage();
  storage.setItem = (k, v) => { if (k !== PROGRESS_KEY) storage._map.set(k, String(v)); };
  const store = createProgressStore(storage, idx);
  assert.equal(store.save(defaultProgress()), false);
});
