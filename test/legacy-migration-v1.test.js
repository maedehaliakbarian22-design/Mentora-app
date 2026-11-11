import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRESS_KEY, BACKUP_PREFIX } from '../www/js/progress/progress-store.js';
import { ATTEMPT_LOG_KEY, createAttemptLog } from '../www/js/attempts/attempt-log.js';
import { migrateLegacyAttempts, rollbackLegacyMigration, legacyAttemptsToRecords } from '../www/js/attempts/legacy-migration.js';
import { realIndex, fakeStorage, backupKeys } from './support/fakes.js';

const idx = realIndex();

function legacyProgress() {
  return JSON.stringify({
    version: 3,
    selection: { gradeId: 'grade-10', fieldId: 'experimental' },
    sections: { 'chapter-1-section-1': { answers: { 'demo-q1': 1, 'demo-q2': 2 } } },
    attempts: [
      { itemId: 'demo-q1', attemptNumber: 1, status: 'attempted', sessionId: 'L1', selectedIndex: 1, isCorrect: true },
      { itemId: 'demo-q2', attemptNumber: 1, status: 'attempted', sessionId: 'L1', selectedIndex: 2, isCorrect: false },
    ],
  });
}

test('legacy attempts map to §13.9 records with stable option ids and null historical metadata', () => {
  const attempts = [
    { itemId: 'demo-q1', attemptNumber: 1, status: 'attempted', sessionId: 'L1', selectedIndex: 1, isCorrect: true },
    { itemId: 'demo-q3', attemptNumber: 1, status: 'skipped', sessionId: 'L1', selectedIndex: null, isCorrect: null },
  ];
  const { records, skipped } = legacyAttemptsToRecords(attempts, idx);
  assert.equal(records.length, 1);
  assert.equal(skipped, 1);
  const r = records[0];
  assert.equal(r.selectedOptionId, 'o-5');
  assert.equal(r.sequenceInSession, 1);
  assert.equal(r.timestampLocal, null);
  assert.equal(r.mode, null);
  assert.equal(r.contentVersion, null);
  assert.equal(r.attemptId, 'legacy:L1:demo-q1:1');
});

test('migration moves every attempt into the log, backs up progress, and empties its attempts', () => {
  const original = legacyProgress();
  const storage = fakeStorage({ [PROGRESS_KEY]: original });
  const result = migrateLegacyAttempts(storage, idx);
  assert.equal(result.status, 'migrated');
  assert.equal(result.imported, 2);

  const logged = createAttemptLog(storage, idx).load().records;
  assert.deepEqual(logged.map((r) => r.selectedOptionId), ['o-5', 'o-4']);

  const backups = backupKeys(storage, BACKUP_PREFIX);
  assert.equal(backups.length, 1);
  assert.equal(storage._map.get(backups[0]), original, 'backup holds the original text verbatim');
  assert.deepEqual(JSON.parse(storage.getItem(PROGRESS_KEY)).attempts, []);
  assert.deepEqual(JSON.parse(storage.getItem(PROGRESS_KEY)).sections, JSON.parse(original).sections, 'answers are kept');
});

test('migration is idempotent: a second run finds nothing to do', () => {
  const storage = fakeStorage({ [PROGRESS_KEY]: legacyProgress() });
  migrateLegacyAttempts(storage, idx);
  assert.equal(migrateLegacyAttempts(storage, idx).status, 'none');
  assert.equal(createAttemptLog(storage, idx).load().records.length, 2);
});

test('an interrupted migration (progress rewrite fails) completes on rerun with no duplicates', () => {
  let failProgress = true;
  const storage = fakeStorage({ [PROGRESS_KEY]: legacyProgress() }, {
    failSet: (k) => failProgress && k === PROGRESS_KEY,
  });
  const first = migrateLegacyAttempts(storage, idx);
  assert.equal(first.status, 'partial');
  assert.equal(createAttemptLog(storage, idx).load().records.length, 2, 'the log already holds the records');

  failProgress = false;
  const second = migrateLegacyAttempts(storage, idx);
  assert.equal(second.status, 'migrated');
  assert.equal(second.imported, 0, 'nothing new to import');
  assert.equal(createAttemptLog(storage, idx).load().records.length, 2, 'no duplicates');
});

test('a failed log readback stops the migration before progress is touched', () => {
  const original = legacyProgress();
  const storage = fakeStorage({ [PROGRESS_KEY]: original }, { dropSet: (k) => k === ATTEMPT_LOG_KEY });
  const result = migrateLegacyAttempts(storage, idx);
  assert.equal(result.status, 'failed');
  assert.equal(storage.getItem(PROGRESS_KEY), original, 'progress is unchanged');
  assert.equal(backupKeys(storage, BACKUP_PREFIX).length, 0);
});

test('a failed backup readback stops the migration before progress is rewritten', () => {
  const original = legacyProgress();
  const storage = fakeStorage({ [PROGRESS_KEY]: original }, { dropSet: (k) => k.startsWith(BACKUP_PREFIX) });
  const result = migrateLegacyAttempts(storage, idx);
  assert.equal(result.status, 'failed');
  assert.equal(result.step, 'backup');
  assert.equal(storage.getItem(PROGRESS_KEY), original);
});

test('rollback restores the original progress and removes a log that holds only migrated records', () => {
  const original = legacyProgress();
  const storage = fakeStorage({ [PROGRESS_KEY]: original });
  migrateLegacyAttempts(storage, idx);
  const backupKey = backupKeys(storage, BACKUP_PREFIX)[0];
  assert.equal(rollbackLegacyMigration(storage, backupKey, idx).ok, true);
  assert.equal(storage.getItem(PROGRESS_KEY), original);
  assert.equal(storage.getItem(ATTEMPT_LOG_KEY), null);
});

test('rollback refuses when a new attempt has been logged since the migration', () => {
  const storage = fakeStorage({ [PROGRESS_KEY]: legacyProgress() });
  migrateLegacyAttempts(storage, idx);
  const backupKey = backupKeys(storage, BACKUP_PREFIX)[0];
  const log = createAttemptLog(storage, idx);
  log.load();
  log.append({
    schemaVersion: 1, attemptId: 'new-1', sessionId: 'R', sequenceInSession: 1, sectionId: 'chapter-1-section-1',
    questionId: 'demo-q3', selectedOptionId: 'o-12', isCorrect: true, timestampLocal: null, mode: 'practice', contentVersion: '1',
  });
  assert.equal(rollbackLegacyMigration(storage, backupKey, idx).reason, 'new-attempts-present');
});
