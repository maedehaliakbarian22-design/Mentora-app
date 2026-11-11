// Local, device-only progress persistence. Stores raw facts only:
//   - `sections`: per section, a CACHE of the learner's answers (chosen option
//     index per question), the active practice run id, and the run ids that a
//     restart has closed. The cache is rebuilt from the Attempt Log on load.
//   - `selection`: the learner's grade/field choice.
//   - `attempts`: LEGACY ONLY. Read for migration, written as [] after the
//     migration to the Attempt Log (mentora.attempts.v1). Never a source of truth.
// Correctness is always recomputed from catalog content. No Learning State is
// stored or derived here.
//
// Storage schema version 3. The storage key is unchanged, so existing data is
// read in place.

import { createAttemptRecord } from '../attempts/attempt-record.js';

export const PROGRESS_KEY = 'mentora.progress.v2';
export const PROGRESS_VERSION = 3;
const LEGACY_VERSION = 2;
// Backup keys hold the original text of data that a save is about to replace.
export const BACKUP_PREFIX = `${PROGRESS_KEY}.backup.`;

export function defaultProgress() {
  return { version: PROGRESS_VERSION, selection: null, sections: {}, attempts: [] };
}

export function emptySectionState() {
  return { answers: {}, runId: null, closedRunIds: [] };
}

// Section state with defaults. Never undefined.
export function sectionState(progress, sectionId) {
  const s = progress.sections[sectionId];
  if (!s) return emptySectionState();
  return {
    answers: s.answers || {},
    runId: typeof s.runId === 'string' && s.runId ? s.runId : null,
    closedRunIds: Array.isArray(s.closedRunIds) ? s.closedRunIds : [],
  };
}

// Returns { progress, recovered }. `recovered` is true when stored data existed
// but was structurally invalid; the invalid part is dropped and reported.
// Unknown ids (content removed in a later release) are dropped silently.
export function sanitizeProgress(raw, index) {
  if (raw === null || raw === undefined) return { progress: defaultProgress(), recovered: false };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { progress: defaultProgress(), recovered: true };
  }
  if (raw.version !== PROGRESS_VERSION && raw.version !== LEGACY_VERSION) {
    return { progress: defaultProgress(), recovered: true };
  }

  let recovered = false;
  const progress = defaultProgress();

  const sel = raw.selection;
  if (sel !== null && sel !== undefined) {
    if (typeof sel === 'object' && typeof sel.gradeId === 'string' && typeof sel.fieldId === 'string') {
      const field = index.fields.get(`${sel.gradeId}/${sel.fieldId}`);
      if (field && field.available) progress.selection = { gradeId: sel.gradeId, fieldId: sel.fieldId };
    } else {
      recovered = true;
    }
  }

  if (raw.sections === null || typeof raw.sections !== 'object' || Array.isArray(raw.sections)) {
    return { progress: defaultProgress(), recovered: true };
  }

  for (const [sectionId, entry] of Object.entries(raw.sections)) {
    if (!index.sections.has(sectionId)) continue;
    if (!entry || typeof entry !== 'object' || entry.answers === null || typeof entry.answers !== 'object' || Array.isArray(entry.answers)) {
      recovered = true;
      continue;
    }
    const answers = {};
    for (const [qid, selectedIndex] of Object.entries(entry.answers)) {
      const q = index.questions.get(qid);
      if (!q || q.sectionId !== sectionId) continue;
      if (Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < q.options.length) {
        answers[qid] = selectedIndex;
      } else {
        recovered = true;
      }
    }
    const state = sectionState({ sections: { [sectionId]: { ...entry, answers } } }, sectionId);
    progress.sections[sectionId] = state;
  }

  if (raw.version === PROGRESS_VERSION) {
    if (!Array.isArray(raw.attempts)) {
      recovered = true;
    } else {
      for (const entry of raw.attempts) {
        const result = sanitizeAttempt(entry, index);
        if (result.record) progress.attempts.push(result.record);
        if (result.invalid) recovered = true;
      }
    }
  }

  return { progress, recovered };
}

// Validates one legacy stored attempt against the catalog. Correctness is
// recomputed, never trusted. Returns { record } on success, { unknownItem: true }
// for content removed from the catalog (dropped silently), or { invalid: true }.
function sanitizeAttempt(entry, index) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return { invalid: true };
  let record;
  try {
    record = createAttemptRecord(entry);
  } catch {
    return { invalid: true };
  }
  const q = index.questions.get(record.itemId);
  if (!q) return { unknownItem: true };
  if (record.selectedIndex !== null && record.selectedIndex >= q.options.length) return { invalid: true };

  const expected = record.status === 'attempted' && record.selectedIndex !== null
    ? record.selectedIndex === q.correctIndex
    : null;
  if (record.isCorrect !== expected) {
    return { record: createAttemptRecord({ ...entry, isCorrect: expected }), invalid: true };
  }
  return { record };
}

// Pure updates: each returns a new progress object. They keep the rest of the
// section state (run id, closed runs).
export function recordAnswer(progress, questionId, selectedIndex, index) {
  const q = index.questions.get(questionId);
  if (!q) throw new RangeError(`unknown question: ${questionId}`);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= q.options.length) {
    throw new RangeError(`selectedIndex out of range: ${String(selectedIndex)}`);
  }
  const prev = sectionState(progress, q.sectionId);
  return {
    ...progress,
    sections: {
      ...progress.sections,
      [q.sectionId]: { ...prev, answers: { ...prev.answers, [questionId]: selectedIndex } },
    },
  };
}

// Restart: clears the section's answers and closes its active run. The closed
// run's attempts stay in the Attempt Log; they are never shown as current again.
export function clearSection(progress, sectionId) {
  const prev = sectionState(progress, sectionId);
  const closed = prev.runId && !prev.closedRunIds.includes(prev.runId)
    ? [...prev.closedRunIds, prev.runId]
    : prev.closedRunIds;
  return {
    ...progress,
    sections: { ...progress.sections, [sectionId]: { answers: {}, runId: null, closedRunIds: closed } },
  };
}

// Kept for compatibility with earlier callers. Pure: returns a new progress with
// the attempt appended. New code writes through the Attempt Log instead.
export function appendAttempt(progress, record, index) {
  const q = index.questions.get(record.itemId);
  if (!q) throw new RangeError(`unknown question: ${record.itemId}`);
  if (record.selectedIndex !== null && (record.selectedIndex < 0 || record.selectedIndex >= q.options.length)) {
    throw new RangeError(`selectedIndex out of range: ${String(record.selectedIndex)}`);
  }
  return { ...progress, attempts: [...progress.attempts, record] };
}

// Rebuilds the latest chosen option per question from legacy attempts.
export function deriveAnswersFromAttempts(attempts) {
  const answers = {};
  for (const rec of attempts) {
    if (rec.status === 'attempted' && rec.selectedIndex !== null) answers[rec.itemId] = rec.selectedIndex;
  }
  return answers;
}

export function setSelection(progress, selection) {
  return { ...progress, selection };
}

export function sectionAnswers(progress, sectionId) {
  return sectionState(progress, sectionId).answers;
}

// Creates a store over any Storage-compatible object. Never throws.
//
// Data safety: when the stored text was unparsable, recovered, or an older schema
// version, its original text is copied to a backup key and read back before the
// first write replaces it. If the backup cannot be verified, nothing is written.
// This module never overwrites or deletes an existing backup key.
export function createProgressStore(storage, index) {
  let originalText = null;
  let needsBackup = false;
  let backupKey = null;
  return {
    load() {
      let text = null;
      try {
        text = storage.getItem(PROGRESS_KEY);
      } catch {
        return { progress: defaultProgress(), recovered: false, storageOk: false };
      }
      originalText = text;
      if (text === null) {
        needsBackup = false;
        return { progress: defaultProgress(), recovered: false, storageOk: true };
      }
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        needsBackup = true;
        return { progress: defaultProgress(), recovered: true, storageOk: true };
      }
      const current = raw !== null && typeof raw === 'object' && raw.version === PROGRESS_VERSION;
      const result = sanitizeProgress(raw, index);
      needsBackup = result.recovered || !current;
      return { ...result, storageOk: true };
    },
    save(progress) {
      const json = JSON.stringify(progress);
      try {
        if (needsBackup && originalText !== null) {
          if (backupKey === null) backupKey = freeBackupKey(storage);
          storage.setItem(backupKey, originalText);
          if (storage.getItem(backupKey) !== originalText) return false;
        }
        storage.setItem(PROGRESS_KEY, json);
        if (storage.getItem(PROGRESS_KEY) !== json) return false;
        needsBackup = false;
        originalText = json;
        backupKey = null;
        return true;
      } catch {
        return false;
      }
    },
  };
}

// First unused progress backup key. Existing backups are never replaced.
export function freeBackupKey(storage) {
  const base = `${BACKUP_PREFIX}${Date.now()}`;
  let key = base;
  for (let n = 1; storage.getItem(key) !== null; n += 1) key = `${base}.${n}`;
  return key;
}
