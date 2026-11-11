import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTEMPT_LOG_KEY, ATTEMPT_LOG_BACKUP_PREFIX, createAttemptLog, validateAttemptRecord, toLocalIso, toView,
} from '../www/js/attempts/attempt-log.js';
import { realIndex, fakeStorage, backupKeys } from './support/fakes.js';

const idx = realIndex();

const good = (over = {}) => ({
  schemaVersion: 1,
  attemptId: 'a-1',
  sessionId: 'run-1',
  sequenceInSession: 1,
  sectionId: 'chapter-1-section-1',
  questionId: 'demo-q1',
  selectedOptionId: 'o-5',
  isCorrect: true,
  timestampLocal: '2026-11-11T15:00:00+03:30',
  mode: 'practice',
  contentVersion: '1',
  ...over,
});

test('a valid record passes and is frozen', () => {
  const v = validateAttemptRecord(good(), idx);
  assert.equal(v.ok, true);
  assert.ok(Object.isFrozen(v.record));
});

test('correctness is recomputed: a wrong isCorrect is rejected', () => {
  assert.equal(validateAttemptRecord(good({ isCorrect: false }), idx).ok, false);
});

test('unknown, missing and mistyped fields are rejected', () => {
  assert.equal(validateAttemptRecord({ ...good(), extra: 1 }, idx).ok, false);
  const { mode, ...missing } = good();
  assert.equal(validateAttemptRecord(missing, idx).ok, false);
  assert.equal(validateAttemptRecord(good({ timestampLocal: 5 }), idx).ok, false);
});

test('option ids must belong to the question; section must match the question', () => {
  assert.equal(validateAttemptRecord(good({ selectedOptionId: 'o-99' }), idx).ok, false);
  assert.equal(validateAttemptRecord(good({ sectionId: 'other' }), idx).ok, false);
  assert.equal(validateAttemptRecord(good({ questionId: 'nope' }), idx).ok, false);
});

test('null timestamp, mode and contentVersion are allowed for migrated records', () => {
  const v = validateAttemptRecord(good({ timestampLocal: null, mode: null, contentVersion: null }), idx);
  assert.equal(v.ok, true);
});

test('append writes once, reads back, and a reload sees the record', () => {
  const storage = fakeStorage();
  const log = createAttemptLog(storage, idx);
  log.load();
  assert.equal(log.append(good()).ok, true);
  const again = createAttemptLog(storage, idx).load();
  assert.equal(again.records.length, 1);
  assert.equal(again.records[0].attemptId, 'a-1');
});

test('a write that does not read back is reported and the cache is unchanged', () => {
  const storage = fakeStorage({}, { dropSet: (k) => k === ATTEMPT_LOG_KEY });
  const log = createAttemptLog(storage, idx);
  log.load();
  const r = log.append(good());
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'readback');
  assert.equal(log.records().length, 0);
});

test('a duplicate attemptId is refused by append and skipped by import', () => {
  const storage = fakeStorage();
  const log = createAttemptLog(storage, idx);
  log.load();
  log.append(good());
  assert.equal(log.append(good()).reason, 'duplicate');
  const imported = log.importRecords([validateAttemptRecord(good(), idx).record, validateAttemptRecord(good({ attemptId: 'a-2', sequenceInSession: 2 }), idx).record]);
  assert.equal(imported.ok, true);
  assert.equal(imported.added, 1);
  assert.equal(log.records().length, 2);
});

test('corrupt log text is copied to a verified backup before a fresh log replaces it', () => {
  const corrupt = '{not json';
  const storage = fakeStorage({ [ATTEMPT_LOG_KEY]: corrupt });
  const log = createAttemptLog(storage, idx);
  assert.equal(log.load().status, 'corrupt');
  assert.equal(log.append(good()).ok, true);
  const backups = backupKeys(storage, ATTEMPT_LOG_BACKUP_PREFIX);
  assert.equal(backups.length, 1);
  assert.equal(storage._map.get(backups[0]), corrupt);
  assert.equal(createAttemptLog(storage, idx).load().records.length, 1);
});

test('invalid entries in a valid log file are kept on rewrite, not dropped', () => {
  const bad = { ...good(), attemptId: 'bad', isCorrect: true, selectedOptionId: 'o-4' };
  const text = JSON.stringify({ schemaVersion: 1, records: [bad] });
  const storage = fakeStorage({ [ATTEMPT_LOG_KEY]: text });
  const log = createAttemptLog(storage, idx);
  const loaded = log.load();
  assert.equal(loaded.invalid, 1);
  assert.equal(loaded.records.length, 0);
  log.append(good());
  const raw = JSON.parse(storage.getItem(ATTEMPT_LOG_KEY)).records;
  assert.equal(raw.length, 2, 'the invalid entry stays in the file');
});

test('unavailable storage reports unavailable and never throws', () => {
  const storage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const log = createAttemptLog(storage, idx);
  assert.equal(log.load().status, 'unavailable');
  assert.equal(log.append(good()).ok, false);
});

test('local timestamps carry the device offset', () => {
  const s = toLocalIso(new Date(2026, 10, 11, 15, 4, 5));
  assert.match(s, /^2026-11-11T15:04:05[+-]\d\d:\d\d$/);
});

test('toView maps the stored option id back to the current index', () => {
  const rec = validateAttemptRecord(good({ selectedOptionId: 'o-6', isCorrect: false }), idx).record;
  const v = toView(rec, idx);
  assert.equal(v.selectedIndex, 2);
  assert.equal(v.status, 'attempted');
});
