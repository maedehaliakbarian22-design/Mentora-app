// App-level tests for the practice service over fake storage. Each "reload" is a
// new service over the same storage, which is what a restart does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import { PROGRESS_KEY, sectionAnswers } from '../www/js/progress/progress-store.js';
import { ATTEMPT_LOG_KEY, createAttemptLog } from '../www/js/attempts/attempt-log.js';
import { openPracticeService } from '../www/js/domain/practice-service.js';
import { fakeStorage, realIndex, twoSectionIndex, sequence, ticking } from './support/fakes.js';

const SEC = 'chapter-1-section-1';
const idx = realIndex();

// One id generator for the whole file, as a real app would have: ids never repeat
// across restarts.
const nextId = sequence('x');
function open(storage, index = idx, catalogVersion = CATALOG.version) {
  return openPracticeService({ storage, index, catalogVersion, now: ticking(), newId: nextId });
}

// Correct answers in the demo section: Q1 → index 1, Q2 → index 0, Q3 → index 1.
test('answer Q1 and Q2, reload, answer Q3: all three are in the same session', () => {
  const storage = fakeStorage();
  const s1 = open(storage);
  assert.equal(s1.check(SEC, 'demo-q1', 1).ok, true);
  assert.equal(s1.check(SEC, 'demo-q2', 0).ok, true);
  const runBefore = s1.runIdFor(SEC);

  const s2 = open(storage);
  assert.equal(s2.runIdFor(SEC), runBefore, 'the run survives the reload');
  assert.equal(s2.check(SEC, 'demo-q3', 1).ok, true);

  const records = createAttemptLog(storage, idx).load().records;
  assert.equal(new Set(records.map((r) => r.sessionId)).size, 1, 'one session in the log');
  assert.deepEqual(records.map((r) => r.sequenceInSession), [1, 2, 3]);

  const result = s2.result(SEC);
  assert.equal(result.total, 3);
  assert.equal(result.correct.length, 3);
  assert.equal(result.percent, 100);
});

test('background and resume with no reload keep the same run', () => {
  const storage = fakeStorage();
  const s = open(storage);
  s.check(SEC, 'demo-q1', 1);
  const run = s.runIdFor(SEC);
  assert.equal(s.check(SEC, 'demo-q2', 0).ok, true);
  assert.equal(s.runIdFor(SEC), run);
});

test('a second answer to the same question is refused', () => {
  const s = open(fakeStorage());
  s.check(SEC, 'demo-q1', 1);
  assert.equal(s.check(SEC, 'demo-q1', 0).reason, 'answered');
});

test('restarting a section closes its run: the next attempt starts a new session', () => {
  const storage = fakeStorage();
  const s1 = open(storage);
  s1.check(SEC, 'demo-q1', 1);
  s1.check(SEC, 'demo-q2', 0);
  const firstRun = s1.runIdFor(SEC);

  const s2 = open(storage);
  assert.equal(s2.restartSection(SEC).ok, true);
  const s3 = open(storage);
  assert.equal(s3.runIdFor(SEC), null, 'no active run after restart');
  assert.equal(s3.check(SEC, 'demo-q1', 1).ok, true);
  assert.notEqual(s3.runIdFor(SEC), firstRun);

  const result = s3.result(SEC);
  assert.equal(result.total, 1, 'the result shows only the new run');
});

test('a closed run never comes back after a later reload', () => {
  const storage = fakeStorage();
  const s1 = open(storage);
  s1.check(SEC, 'demo-q1', 1);
  open(storage).restartSection(SEC);
  const s3 = open(storage);
  assert.deepEqual(sectionAnswers(s3.progress(), SEC), {});
  assert.equal(s3.result(SEC).total, 0);
  assert.equal(createAttemptLog(storage, idx).load().records.length, 1, 'the old attempt stays in the log');
});

test('switching sections gives each section its own independent session', () => {
  const index = twoSectionIndex();
  const storage = fakeStorage();
  const s1 = open(storage, index);
  s1.check('A', 'a1', 0);
  s1.check('B', 'b1', 1);
  assert.notEqual(s1.runIdFor('A'), s1.runIdFor('B'));

  const s2 = open(storage, index);
  assert.equal(s2.runIdFor('A'), s1.runIdFor('A'));
  assert.equal(s2.runIdFor('B'), s1.runIdFor('B'));
  assert.equal(s2.result('A').total, 1);
  assert.equal(s2.result('B').total, 1);
});

test('stable selectedOptionId: after the catalog reorders options, the same answer is still scored and shown correctly', () => {
  const storage = fakeStorage();
  const s1 = open(storage);
  s1.check(SEC, 'demo-q1', 1); // selects '5', id 'o-5', correct

  const reordered = indexCatalog({
    ...CATALOG,
    chapters: [{
      ...CATALOG.chapters[0],
      sections: [{
        ...CATALOG.chapters[0].sections[0],
        questions: [{
          ...CATALOG.chapters[0].sections[0].questions[0],
          options: ['4', '6', '5'],
          optionIds: ['o-4', 'o-6', 'o-5'],
          correctIndex: 2,
        }, ...CATALOG.chapters[0].sections[0].questions.slice(1)],
      }, ...CATALOG.chapters[0].sections.slice(1)],
    }],
  });
  const s2 = open(storage, reordered);
  const result = s2.result(SEC);
  assert.equal(result.correct.length, 1);
  assert.equal(result.correct[0].selectedText, '5');
});

test('answers with no log record are kept and reported, not silently dropped', () => {
  const corrupt = JSON.stringify({ version: 3, selection: null, sections: { [SEC]: { answers: { 'demo-q1': 1 } } }, attempts: [] });
  const storage = fakeStorage({ [PROGRESS_KEY]: corrupt });
  const s = open(storage);
  assert.equal(sectionAnswers(s.progress(), SEC)['demo-q1'], 1, 'the answer is still there');
  assert.ok(s.notices().includes('unlogged-answers'));
  assert.equal(s.result(SEC).total, 0, 'it is not shown as a recorded result');
});

test('a logged answer whose progress save failed is restored from the log on reload', () => {
  let failProgress = true;
  const storage = fakeStorage({}, { failSet: (k) => failProgress && k === PROGRESS_KEY });
  const s1 = open(storage);
  const res = s1.check(SEC, 'demo-q1', 1);
  assert.equal(res.ok, true);
  assert.equal(res.saved, false, 'the cache write failed');

  failProgress = false;
  const s2 = open(storage);
  assert.equal(sectionAnswers(s2.progress(), SEC)['demo-q1'], 1);
  assert.equal(s2.runIdFor(SEC), res.record.sessionId);
  assert.equal(s2.result(SEC).total, 1);
});

test('a failed log write records nothing and shows no answer', () => {
  const storage = fakeStorage({}, { dropSet: (k) => k === ATTEMPT_LOG_KEY });
  const s = open(storage);
  const res = s.check(SEC, 'demo-q1', 1);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'log-write');
  assert.deepEqual(sectionAnswers(s.progress(), SEC), {});
});

test('corrupt attempt log: the log is backed up, answers are kept, and new answers are written', () => {
  const storage = fakeStorage({ [ATTEMPT_LOG_KEY]: '{broken' });
  const s = open(storage);
  assert.ok(s.notices().includes('log-corrupt'));
  assert.equal(s.check(SEC, 'demo-q1', 1).ok, true);
  assert.equal(createAttemptLog(storage, idx).load().records.length, 1);
});

test('legacy attempts still embedded (migration failed) remain visible in the result', () => {
  const legacy = JSON.stringify({
    version: 3,
    selection: null,
    sections: { [SEC]: { answers: { 'demo-q1': 1 } } },
    attempts: [{ itemId: 'demo-q1', attemptNumber: 1, status: 'attempted', sessionId: 'L1', selectedIndex: 1, isCorrect: true }],
  });
  const storage = fakeStorage({ [PROGRESS_KEY]: legacy }, { dropSet: (k) => k === ATTEMPT_LOG_KEY });
  const s = open(storage);
  assert.ok(s.notices().includes('migration-incomplete'));
  assert.equal(s.result(SEC).total, 1);
});

// --- XP repair (F1/F2) ---
import { getXp, isSectionCompleted, SECTION_COMPLETE_XP } from '../www/js/progress/progress-store.js';

test('completing all questions in a section awards XP once via the service', () => {
  const storage = fakeStorage();
  const service = open(storage);
  const section = idx.sections.get(SEC);
  // demo answers: q1→1, q2→0, q3→1
  const picks = { 'demo-q1': 1, 'demo-q2': 0, 'demo-q3': 1 };
  let last = null;
  for (const q of section.questions) {
    last = service.check(SEC, q.id, picks[q.id] ?? 0);
    assert.equal(last.ok, true, q.id);
  }
  assert.equal(last.xpAwarded, true);
  assert.equal(last.totalXp, SECTION_COMPLETE_XP);
  assert.equal(getXp(service.progress()), SECTION_COMPLETE_XP);
  assert.equal(isSectionCompleted(service.progress(), SEC), true);

  const again = service.check(SEC, section.questions[0].id, picks[section.questions[0].id] ?? 0);
  assert.equal(again.ok, false);
  assert.equal(getXp(service.progress()), SECTION_COMPLETE_XP);
});

test('boot restores XP from Attempt Log when progress awards were missing', () => {
  const storage = fakeStorage();
  const s1 = open(storage);
  const section = idx.sections.get(SEC);
  const picks = { 'demo-q1': 1, 'demo-q2': 0, 'demo-q3': 1 };
  for (const q of section.questions) {
    assert.equal(s1.check(SEC, q.id, picks[q.id] ?? 0).ok, true);
  }
  const raw = JSON.parse(storage.getItem(PROGRESS_KEY));
  raw.awards = {};
  raw.xp = 0;
  storage.setItem(PROGRESS_KEY, JSON.stringify(raw));

  const s2 = open(storage);
  assert.equal(getXp(s2.progress()), SECTION_COMPLETE_XP);
  assert.equal(isSectionCompleted(s2.progress(), SEC), true);
});
