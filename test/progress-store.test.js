import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import {
  PROGRESS_KEY, PROGRESS_VERSION, BACKUP_PREFIX, defaultProgress, sanitizeProgress,
  recordAnswer, clearSection, setSelection, sectionAnswers, createProgressStore,
  SECTION_COMPLETE_XP, repairAwardsFromLog, migrateCompletedSections,
  isSectionCompleteInLog, isSectionCompleted, getXp, sectionAwardKey,
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


// --- XP awards (policy A, schema v4) ---

test('default progress includes empty awards and xp 0', () => {
  const d = defaultProgress();
  assert.equal(d.xp, 0);
  assert.deepEqual(d.awards, {});
  assert.deepEqual(d.unprovenLegacyCompletions, {});
  assert.equal(d.version, 4);
});

test('sanitizeProgress migrates v3 selection without dropping data', () => {
  const raw = {
    version: 3,
    selection: { gradeId: 'grade-10', fieldId: 'experimental' },
    sections: {},
    attempts: [],
  };
  const r = sanitizeProgress(raw, idx);
  assert.equal(r.progress.version, 4);
  assert.equal(r.progress.xp, 0);
  assert.deepEqual(r.progress.selection, { gradeId: 'grade-10', fieldId: 'experimental' });
});

test('isSectionCompleteInLog requires every question to have a log record', () => {
  const sectionId = 'chapter-1-section-1';
  const section = idx.sections.get(sectionId);
  assert.ok(section.questions.length >= 1);
  assert.equal(isSectionCompleteInLog(sectionId, [], idx), false);
  const partial = [{ sectionId, questionId: section.questions[0].id }];
  if (section.questions.length > 1) {
    assert.equal(isSectionCompleteInLog(sectionId, partial, idx), false);
  }
  const full = section.questions.map((q) => ({ sectionId, questionId: q.id }));
  assert.equal(isSectionCompleteInLog(sectionId, full, idx), true);
});

test('repairAwardsFromLog awards once per sectionId (policy A)', () => {
  const sectionId = 'chapter-1-section-1';
  const section = idx.sections.get(sectionId);
  const records = section.questions.map((q) => ({ sectionId, questionId: q.id }));
  let p = defaultProgress();
  const r1 = repairAwardsFromLog(p, records, idx, '1', { now: () => new Date('2026-01-01T00:00:00Z') });
  assert.equal(r1.changed, true);
  assert.ok(r1.newlyAwarded.includes(sectionId));
  assert.equal(getXp(r1.progress), SECTION_COMPLETE_XP);
  assert.equal(isSectionCompleted(r1.progress, sectionId), true);

  const r2 = repairAwardsFromLog(r1.progress, records, idx, '1');
  assert.equal(r2.changed, false);
  assert.equal(getXp(r2.progress), SECTION_COMPLETE_XP);

  // New catalog version does not pay again (policy A)
  const r3 = repairAwardsFromLog(r1.progress, records, idx, '2');
  assert.equal(r3.changed, false);
  assert.equal(getXp(r3.progress), SECTION_COMPLETE_XP);
});

test('tampered xp is recomputed from awards on sanitize', () => {
  const sectionId = 'chapter-1-section-1';
  const key = sectionAwardKey(sectionId, '1');
  const raw = {
    version: 4,
    selection: null,
    sections: {},
    attempts: [],
    xp: 9999,
    awards: {
      [key]: {
        type: 'section_complete',
        sectionId,
        catalogVersion: '1',
        questionIds: ['demo-q1'],
        xp: SECTION_COMPLETE_XP,
        at: '2026-01-01T00:00:00.000Z',
        source: 'log',
      },
    },
  };
  const r = sanitizeProgress(raw, idx);
  assert.equal(r.progress.xp, SECTION_COMPLETE_XP);
});

test('unproven legacy completedSections do not add XP but are retained', () => {
  const p0 = {
    ...defaultProgress(),
    completedSections: {
      'chapter-1-section-1': { xp: 10, at: '2026-01-01T00:00:00.000Z' },
    },
  };
  // No log records → unproven
  const m = migrateCompletedSections(p0, [], idx, '1');
  assert.ok(m.progress.unprovenLegacyCompletions['chapter-1-section-1']);
  assert.equal(getXp(m.progress), 0);
  assert.equal(Object.keys(m.progress.awards).length, 0);
});

test('legacy completedSections become awards when Log proves completion', () => {
  const sectionId = 'chapter-1-section-1';
  const section = idx.sections.get(sectionId);
  const records = section.questions.map((q) => ({ sectionId, questionId: q.id }));
  const p0 = {
    ...defaultProgress(),
    completedSections: { [sectionId]: { xp: 10, at: '2026-01-01T00:00:00.000Z' } },
  };
  const m = migrateCompletedSections(p0, records, idx, '1');
  assert.equal(getXp(m.progress), SECTION_COMPLETE_XP);
  assert.equal(isSectionCompleted(m.progress, sectionId), true);
  assert.equal(m.progress.unprovenLegacyCompletions[sectionId], undefined);
});

test('createProgressStore persists awards and restores xp', () => {
  const storage = fakeStorage();
  const store = createProgressStore(storage, idx);
  const sectionId = 'chapter-1-section-1';
  const section = idx.sections.get(sectionId);
  const records = section.questions.map((q) => ({ sectionId, questionId: q.id }));
  const awarded = repairAwardsFromLog(defaultProgress(), records, idx, '1', {
    now: () => new Date('2026-06-01T12:00:00Z'),
  });
  assert.equal(store.save(awarded.progress), true);
  const loaded = store.load();
  assert.equal(getXp(loaded.progress), SECTION_COMPLETE_XP);
  assert.equal(isSectionCompleted(loaded.progress, sectionId), true);
});

test('clearSection does not remove awards or xp', () => {
  const sectionId = 'chapter-1-section-1';
  const section = idx.sections.get(sectionId);
  const records = section.questions.map((q) => ({ sectionId, questionId: q.id }));
  let p = repairAwardsFromLog(defaultProgress(), records, idx, '1').progress;
  for (const q of section.questions) p = recordAnswer(p, q.id, 0, idx);
  p = clearSection(p, sectionId);
  assert.equal(getXp(p), SECTION_COMPLETE_XP);
  assert.equal(isSectionCompleted(p, sectionId), true);
  assert.deepEqual(sectionAnswers(p, sectionId), {});
});
