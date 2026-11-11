// Regression tests for XP awards (policy A) derived from the Attempt Log.
// App-level: real service over fake storage. Each "reload" is a new service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../www/js/content/catalog.js';
import { PROGRESS_KEY, SECTION_COMPLETE_XP } from '../www/js/progress/progress-store.js';
import { openPracticeService } from '../www/js/domain/practice-service.js';
import { fakeStorage, realIndex, sequence, ticking } from './support/fakes.js';

const SEC = 'chapter-1-section-1';
const idx = realIndex();
const open = (st) => openPracticeService({ storage: st, index: idx, catalogVersion: CATALOG.version, now: ticking(), newId: sequence('xa') });
const disk = (st) => JSON.parse(st._map.get(PROGRESS_KEY));
const answerAll = (s) => {
  s.check(SEC, 'demo-q1', 1);
  s.check(SEC, 'demo-q2', 0);
  return s.check(SEC, 'demo-q3', 1);
};

test('the section award is paid once when the section is completed', () => {
  const st = fakeStorage();
  const r = answerAll(open(st));
  assert.equal(r.xpAwarded, true);
  assert.equal(disk(st).xp, SECTION_COMPLETE_XP);
});

test('a failed progress save on the final answer is repaired from the log on next boot', () => {
  const st = fakeStorage();
  const s = open(st);
  s.check(SEC, 'demo-q1', 1);
  s.check(SEC, 'demo-q2', 0);
  const orig = st.setItem.bind(st);
  st.setItem = (k, v) => { if (k === PROGRESS_KEY) throw new Error('quota'); return orig(k, v); };
  s.check(SEC, 'demo-q3', 1);
  st.setItem = orig;
  assert.equal(disk(st).xp, 0, 'the progress cache did not reach storage');
  const reloaded = open(st);
  assert.equal(reloaded.progress().xp, SECTION_COMPLETE_XP, 'XP is restored from the log');
  assert.equal(disk(st).xp, SECTION_COMPLETE_XP, 'and persisted');
});

test('policy A: restart and redo never pays the section again', () => {
  const st = fakeStorage();
  answerAll(open(st));
  open(st).restartSection(SEC);
  answerAll(open(st));
  assert.equal(disk(st).xp, SECTION_COMPLETE_XP);
});

test('a stored award cannot inflate XP: the amount is fixed by policy', () => {
  const st = fakeStorage({ [PROGRESS_KEY]: JSON.stringify({
    version: 4, selection: null, sections: {}, attempts: [], xp: 0,
    awards: { forged: { type: 'section_complete', sectionId: SEC, catalogVersion: '1', questionIds: [], xp: 9999, at: '2026-01-01T00:00:00.000Z', source: 'log' } },
    unprovenLegacyCompletions: {},
  }) });
  const s = open(st);
  assert.equal(s.progress().xp, SECTION_COMPLETE_XP);
  assert.ok(s.notices().includes('progress-recovered'), 'the altered amount is reported');
});

test('an unproven legacy completion adds no XP but is kept', () => {
  const st = fakeStorage({ [PROGRESS_KEY]: JSON.stringify({
    version: 3, selection: null, sections: {}, attempts: [],
    completedSections: { [SEC]: { xp: 10, at: '2026-01-01T00:00:00.000Z' } },
  }) });
  const s = open(st);
  s.check(SEC, 'demo-q1', 1);
  assert.equal(disk(st).xp, 0);
  assert.ok(disk(st).unprovenLegacyCompletions[SEC], 'the claim is retained for review');
});
