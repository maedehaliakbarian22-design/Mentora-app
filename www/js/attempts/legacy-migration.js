// One-time move of legacy attempts from progress (embedded `attempts`, schema
// v3) into the Attempt Log (mentora.attempts.v1).
//
// Safety rules:
// - Nothing is deleted. The original progress text is copied to a verified
//   backup key before progress is rewritten with attempts: [].
// - Idempotent: a legacy record is imported under a deterministic attemptId, so
//   running the migration again, or after an interruption, adds no duplicates.
// - Order: (1) import into the log, verified by readback; (2) back up the
//   original progress text, verified; (3) rewrite progress without attempts,
//   verified. A failure at any step leaves the earlier steps intact and the
//   app keeps reading legacy attempts until a later run completes.
// - Never invents historical metadata. timestampLocal, mode and contentVersion
//   stay null because the old data never had them. The sessionId is the one
//   stored at the time. Under the old model it identified an app launch.
//
// Known limitation: the legacy selectedIndex is mapped to an option id using the
// catalog order at migration time. If the catalog was reordered after those
// attempts were recorded, the mapping can be wrong. The original text in the
// backup key allows exact recovery.

import { createAttemptRecord } from './attempt-record.js';
import { PROGRESS_KEY, PROGRESS_VERSION, freeBackupKey } from '../progress/progress-store.js';
import { createAttemptLog, validateAttemptRecord, ATTEMPT_LOG_KEY } from './attempt-log.js';

// Converts validated legacy attempts (see attempt-record.js) into log records.
// Skips attempts that cannot be represented: not attempted, no selection, or an
// unknown question. Returns { records, skipped }.
export function legacyAttemptsToRecords(attempts, index) {
  const records = [];
  let skipped = 0;
  const sequence = new Map();
  for (const a of attempts || []) {
    const q = index.questions.get(a.itemId);
    if (!q || a.status !== 'attempted' || a.selectedIndex === null || a.selectedIndex === undefined) {
      skipped += 1;
      continue;
    }
    const key = `${a.sessionId}\u0000${q.sectionId}`;
    const n = (sequence.get(key) || 0) + 1;
    sequence.set(key, n);
    const v = validateAttemptRecord({
      schemaVersion: 1,
      attemptId: `legacy:${a.sessionId}:${a.itemId}:${a.attemptNumber}`,
      sessionId: a.sessionId,
      sequenceInSession: n,
      sectionId: q.sectionId,
      questionId: a.itemId,
      selectedOptionId: q.optionIds[a.selectedIndex],
      isCorrect: a.selectedIndex === q.correctIndex,
      timestampLocal: null,
      mode: null,
      contentVersion: null,
    }, index);
    if (v.ok) records.push(v.record);
    else skipped += 1;
  }
  return { records, skipped };
}

// Reads legacy attempts that are still embedded in progress. Entries that fail
// the attempt-record rules are skipped here; they stay in the backup.
export function readEmbeddedLegacyAttempts(progressText) {
  if (progressText === null || progressText === undefined) return [];
  let raw;
  try {
    raw = JSON.parse(progressText);
  } catch {
    return [];
  }
  if (!raw || typeof raw !== 'object' || raw.version !== PROGRESS_VERSION || !Array.isArray(raw.attempts)) return [];
  const out = [];
  for (const entry of raw.attempts) {
    try {
      out.push(createAttemptRecord(entry));
    } catch {
      // Left in the backup; not representable as an attempt.
    }
  }
  return out;
}

// Runs the migration. Returns { status, ... }:
//   'none'         nothing to migrate
//   'migrated'     all steps verified
//   'failed'       stopped before progress changed; progress is untouched
//   'partial'      log written and backed up, progress rewrite not verified
//   'unavailable'  storage cannot be read
export function migrateLegacyAttempts(storage, index) {
  let text;
  try {
    text = storage.getItem(PROGRESS_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  const legacy = readEmbeddedLegacyAttempts(text);
  if (legacy.length === 0) return { status: 'none' };

  const { records, skipped } = legacyAttemptsToRecords(legacy, index);
  const log = createAttemptLog(storage, index);
  log.load();
  const imported = log.importRecords(records);
  if (!imported.ok) return { status: 'failed', step: 'log-write', reason: imported.reason };

  // Readback: every migrated record must be in the log now.
  const verify = createAttemptLog(storage, index);
  verify.load();
  const present = new Set(verify.records().map((r) => r.attemptId));
  if (!records.every((r) => present.has(r.attemptId))) {
    return { status: 'failed', step: 'log-readback' };
  }

  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: 'failed', step: 'progress-parse' };
  }
  try {
    const backupKey = freeBackupKey(storage);
    storage.setItem(backupKey, text);
    if (storage.getItem(backupKey) !== text) return { status: 'failed', step: 'backup' };
  } catch {
    return { status: 'failed', step: 'backup' };
  }

  const next = JSON.stringify({ ...raw, attempts: [] });
  try {
    storage.setItem(PROGRESS_KEY, next);
    if (storage.getItem(PROGRESS_KEY) !== next) return { status: 'partial', step: 'progress-readback' };
  } catch {
    return { status: 'partial', step: 'progress-write' };
  }
  return { status: 'migrated', imported: imported.added, skipped };
}

// Undoes the migration when the log holds only migrated legacy records (no new
// answers were logged since). Restores progress from the given backup key and
// removes the log. Refuses otherwise, so no new attempt is ever lost.
export function rollbackLegacyMigration(storage, backupKey, index) {
  let backupText;
  try {
    backupText = storage.getItem(backupKey);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (backupText === null) return { ok: false, reason: 'no-backup' };
  const log = createAttemptLog(storage, index);
  const loaded = log.load();
  if (loaded.status === 'corrupt' || loaded.invalid > 0) return { ok: false, reason: 'log-not-clean' };
  if (!loaded.records.every((r) => r.attemptId.startsWith('legacy:'))) {
    return { ok: false, reason: 'new-attempts-present' };
  }
  try {
    storage.setItem(PROGRESS_KEY, backupText);
    if (storage.getItem(PROGRESS_KEY) !== backupText) return { ok: false, reason: 'readback' };
    storage.removeItem(ATTEMPT_LOG_KEY);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'storage' };
  }
}
