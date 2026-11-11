// Attempt Log: the single authoritative history of practice attempts
// (Specification v3 §13.9). It has its own storage key, and nothing else may
// store a competing copy of attempts. Progress keeps only a cache.
//
// Storage shape: one key holding { schemaVersion, records: [...] }. One
// setItem writes the whole log, so a write is all-or-nothing from the reader's
// point of view. Every write is read back and must match exactly.
//
// Rules:
// - Records are appended, never rewritten or deleted by this module.
// - Stored records that fail validation are kept in the file untouched (so no
//   data is lost on rewrite) and are excluded from the in-memory view.
// - Unparsable or wrong-shape text is copied to a backup key, verified, before
//   a fresh log replaces it.
// - Correctness is recomputed from catalog content on every validation.

export const ATTEMPT_LOG_KEY = 'mentora.attempts.v1';
export const ATTEMPT_LOG_SCHEMA = 1;
export const ATTEMPT_LOG_BACKUP_PREFIX = `${ATTEMPT_LOG_KEY}.backup.`;
export const ATTEMPT_LOG_FIELDS = Object.freeze([
  'schemaVersion',
  'attemptId',
  'sessionId',
  'sequenceInSession',
  'sectionId',
  'questionId',
  'selectedOptionId',
  'isCorrect',
  'timestampLocal',
  'mode',
  'contentVersion',
]);

const fail = (reason) => ({ ok: false, reason });
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

// Pure. Returns { ok: true, record } or { ok: false, reason }.
// timestampLocal, mode and contentVersion may be null: migrated legacy records
// do not have them, and they are never invented.
export function validateAttemptRecord(input, index) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return fail('not-object');
  for (const key of Object.keys(input)) {
    if (!ATTEMPT_LOG_FIELDS.includes(key)) return fail(`unknown-field:${key}`);
  }
  for (const key of ATTEMPT_LOG_FIELDS) {
    if (!(key in input)) return fail(`missing-field:${key}`);
  }
  if (input.schemaVersion !== ATTEMPT_LOG_SCHEMA) return fail('schema');
  if (!nonEmpty(input.attemptId) || !nonEmpty(input.sessionId)) return fail('id');
  if (!Number.isInteger(input.sequenceInSession) || input.sequenceInSession < 1) return fail('sequence');
  const q = index.questions.get(input.questionId);
  if (!q || q.sectionId !== input.sectionId) return fail('question');
  if (!q.optionIds.includes(input.selectedOptionId)) return fail('option');
  const correct = input.selectedOptionId === q.optionIds[q.correctIndex];
  if (typeof input.isCorrect !== 'boolean' || input.isCorrect !== correct) return fail('correctness');
  for (const key of ['timestampLocal', 'mode', 'contentVersion']) {
    if (input[key] !== null && typeof input[key] !== 'string') return fail(`type:${key}`);
  }
  return { ok: true, record: Object.freeze({ ...input }) };
}

// Normalized view used by results and statistics. Converts the stored option id
// back to the current index. Never used for storage.
export function toView(record, index) {
  const q = index.questions.get(record.questionId);
  return {
    itemId: record.questionId,
    questionId: record.questionId,
    sectionId: record.sectionId,
    sessionId: record.sessionId,
    attemptId: record.attemptId,
    status: 'attempted',
    selectedIndex: q.optionIds.indexOf(record.selectedOptionId),
    isCorrect: record.isCorrect,
  };
}

// Local time with the device's UTC offset, e.g. 2026-11-11T15:04:05+03:30.
export function toLocalIso(date) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// Parses stored log text. Returns the status, the raw entries (kept verbatim),
// the valid records in file order, and the count of invalid entries.
export function parseLogText(text, index) {
  if (text === null) return { status: 'empty', rawRecords: [], records: [], invalid: 0 };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { status: 'corrupt', rawRecords: [], records: [], invalid: 0 };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || data.schemaVersion !== ATTEMPT_LOG_SCHEMA || !Array.isArray(data.records)) {
    return { status: 'corrupt', rawRecords: [], records: [], invalid: 0 };
  }
  const records = [];
  const seen = new Set();
  let invalid = 0;
  for (const entry of data.records) {
    const v = validateAttemptRecord(entry, index);
    if (v.ok && !seen.has(v.record.attemptId)) {
      seen.add(v.record.attemptId);
      records.push(v.record);
    } else {
      invalid += 1;
    }
  }
  return { status: 'ok', rawRecords: data.records, records, invalid };
}

function freeKey(storage, prefix) {
  const base = `${prefix}${Date.now()}`;
  let key = base;
  for (let n = 1; storage.getItem(key) !== null; n += 1) key = `${base}.${n}`;
  return key;
}

export function createAttemptLog(storage, index) {
  let state = { status: 'empty', rawRecords: [], records: [], invalid: 0, originalText: null };

  function snapshot() {
    return { status: state.status, records: state.records, invalid: state.invalid };
  }

  // Adds validated records in one verified write. `skipDuplicates` is used for
  // migration, which may run more than once. Without it, a duplicate id fails.
  function commit(incoming, skipDuplicates) {
    const corrupt = state.status === 'corrupt';
    const existing = new Set(corrupt ? [] : state.records.map((r) => r.attemptId));
    const fresh = [];
    for (const r of incoming) {
      if (existing.has(r.attemptId)) {
        if (skipDuplicates) continue;
        return fail('duplicate');
      }
      existing.add(r.attemptId);
      fresh.push(r);
    }
    if (fresh.length === 0) return { ok: true, added: 0 };

    try {
      if (corrupt) {
        const key = freeKey(storage, ATTEMPT_LOG_BACKUP_PREFIX);
        storage.setItem(key, state.originalText);
        if (storage.getItem(key) !== state.originalText) return fail('backup');
      }
      const rawRecords = [...(corrupt ? [] : state.rawRecords), ...fresh];
      const text = JSON.stringify({ schemaVersion: ATTEMPT_LOG_SCHEMA, records: rawRecords });
      storage.setItem(ATTEMPT_LOG_KEY, text);
      if (storage.getItem(ATTEMPT_LOG_KEY) !== text) return fail('readback');
      state = {
        status: 'ok',
        rawRecords,
        records: [...(corrupt ? [] : state.records), ...fresh],
        invalid: corrupt ? 0 : state.invalid,
        originalText: text,
      };
      return { ok: true, added: fresh.length };
    } catch {
      return fail('storage');
    }
  }

  return {
    load() {
      let text;
      try {
        text = storage.getItem(ATTEMPT_LOG_KEY);
      } catch {
        state = { status: 'unavailable', rawRecords: [], records: [], invalid: 0, originalText: null };
        return snapshot();
      }
      state = { ...parseLogText(text, index), originalText: text };
      return snapshot();
    },
    status: () => state.status,
    records: () => state.records,
    // Appends one validated record. Returns { ok, reason }.
    append(record) {
      const v = validateAttemptRecord(record, index);
      if (!v.ok) return fail(`invalid:${v.reason}`);
      return commit([v.record], false);
    },
    // Adds several records in one write. Records already present are skipped.
    importRecords(records) {
      const valid = [];
      for (const r of records) {
        const v = validateAttemptRecord(r, index);
        if (!v.ok) return fail(`invalid:${v.reason}`);
        valid.push(v.record);
      }
      return commit(valid, true);
    },
  };
}
