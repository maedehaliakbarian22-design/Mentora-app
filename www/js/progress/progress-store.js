// Local, device-only progress persistence. Stores raw facts only:
//   - `sections`: per section, a CACHE of the learner's answers (chosen option
//     index per question), the active practice run id, and the run ids that a
//     restart has closed. The cache is rebuilt from the Attempt Log on load.
//   - `selection`: the learner's grade/field choice.
//   - `awards`: proven section-completion rewards (policy A: one XP per sectionId).
//   - `unprovenLegacyCompletions`: legacy completion claims not proven by the Log.
//   - `xp`: display total derived from proven awards (recomputed on sanitize/repair).
//   - `attempts`: LEGACY ONLY. Never a source of truth after migration to
//     mentora.attempts.v1.
// Correctness of answers is always recomputed from catalog + Attempt Log.
//
// Storage schema version 4. Key unchanged (mentora.progress.v2).
// Versions 2–3 are read in place; completedSections (Grok interim) migrates into
// awards / unprovenLegacyCompletions without deleting user data.

import { createAttemptRecord } from '../attempts/attempt-record.js';

export const PROGRESS_KEY = 'mentora.progress.v2';
export const PROGRESS_VERSION = 4;
const LEGACY_VERSIONS = new Set([2, 3]);
export const BACKUP_PREFIX = `${PROGRESS_KEY}.backup.`;

/** Experimental XP for the first proven completion of a section (policy A). */
export const SECTION_COMPLETE_XP = 10;

export function defaultProgress() {
  return {
    version: PROGRESS_VERSION,
    selection: null,
    sections: {},
    attempts: [],
    xp: 0,
    awards: {},
    unprovenLegacyCompletions: {},
  };
}

export function emptySectionState() {
  return { answers: {}, runId: null, closedRunIds: [] };
}

export function sectionState(progress, sectionId) {
  const s = progress.sections[sectionId];
  if (!s) return emptySectionState();
  return {
    answers: s.answers || {},
    runId: typeof s.runId === 'string' && s.runId ? s.runId : null,
    closedRunIds: Array.isArray(s.closedRunIds) ? s.closedRunIds : [],
  };
}

export function sectionAnswers(progress, sectionId) {
  return sectionState(progress, sectionId).answers;
}

/** awardKey for policy A history; XP is still one-per-sectionId. */
export function sectionAwardKey(sectionId, catalogVersion) {
  return `section_complete:${sectionId}:cv:${catalogVersion}`;
}

export function getXp(progress) {
  if (!progress || typeof progress !== 'object') return 0;
  const awards = progress.awards && typeof progress.awards === 'object' ? progress.awards : {};
  // Policy A: XP = one fixed amount per distinct sectionId with a section_complete
  // award. The stored `xp` amount of an award is NOT trusted; it is only history.
  const sections = new Set();
  for (const a of Object.values(awards)) {
    if (!a || typeof a !== 'object' || a.type !== 'section_complete') continue;
    if (typeof a.sectionId !== 'string' || !a.sectionId) continue;
    sections.add(a.sectionId);
  }
  return sections.size * SECTION_COMPLETE_XP;
}

/**
 * Section is complete in the Log when every question currently in the catalog
 * for that section has at least one valid attempt record.
 */
export function isSectionCompleteInLog(sectionId, records, index) {
  const section = index.sections.get(sectionId);
  if (!section || !Array.isArray(section.questions) || section.questions.length === 0) return false;
  const answered = new Set();
  for (const r of records || []) {
    if (!r || r.sectionId !== sectionId) continue;
    if (typeof r.questionId === 'string') answered.add(r.questionId);
  }
  return section.questions.every((q) => answered.has(q.id));
}

function questionIdsForSection(sectionId, index) {
  const section = index.sections.get(sectionId);
  if (!section || !Array.isArray(section.questions)) return [];
  return section.questions.map((q) => q.id);
}

/**
 * Pure. Adds proven awards from the Attempt Log without double-paying (policy A).
 * Does not remove unproven legacy entries.
 * @returns {{ progress, changed: boolean, newlyAwarded: string[] }}
 */
export function repairAwardsFromLog(progress, records, index, catalogVersion, {
  xpAmount = SECTION_COMPLETE_XP,
  now = () => new Date(),
} = {}) {
  const base = progress && typeof progress === 'object' ? { ...progress } : defaultProgress();
  const awards = { ...(base.awards && typeof base.awards === 'object' ? base.awards : {}) };
  const awardedSections = new Set(
    Object.values(awards)
      .filter((a) => a && a.type === 'section_complete' && typeof a.sectionId === 'string')
      .map((a) => a.sectionId),
  );

  const newlyAwarded = [];
  const cv = String(catalogVersion ?? 'unknown');
  const amount = Number.isFinite(xpAmount) && xpAmount >= 0 ? Math.floor(xpAmount) : SECTION_COMPLETE_XP;
  const at = now().toISOString();

  for (const sectionId of index.sections.keys()) {
    if (awardedSections.has(sectionId)) continue;
    if (!isSectionCompleteInLog(sectionId, records, index)) continue;
    const key = sectionAwardKey(sectionId, cv);
    awards[key] = {
      type: 'section_complete',
      sectionId,
      catalogVersion: cv,
      questionIds: questionIdsForSection(sectionId, index),
      xp: amount,
      at,
      source: 'log',
    };
    awardedSections.add(sectionId);
    newlyAwarded.push(sectionId);
  }

  const next = {
    ...base,
    version: PROGRESS_VERSION,
    awards,
    unprovenLegacyCompletions:
      base.unprovenLegacyCompletions && typeof base.unprovenLegacyCompletions === 'object'
        ? base.unprovenLegacyCompletions
        : {},
  };
  next.xp = getXp(next);
  return { progress: next, changed: newlyAwarded.length > 0, newlyAwarded };
}

/**
 * Migrate interim `completedSections` map into awards (if log-proven) or
 * unprovenLegacyCompletions (if not). Never deletes the claim silently.
 */
export function migrateCompletedSections(progress, records, index, catalogVersion) {
  const base = progress && typeof progress === 'object' ? { ...progress } : defaultProgress();
  const legacy = base.completedSections;
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) {
    const { completedSections, ...rest } = base;
    return { progress: { ...rest, version: PROGRESS_VERSION }, changed: false };
  }

  const awards = { ...(base.awards && typeof base.awards === 'object' ? base.awards : {}) };
  const unproven = {
    ...(base.unprovenLegacyCompletions && typeof base.unprovenLegacyCompletions === 'object'
      ? base.unprovenLegacyCompletions
      : {}),
  };
  const awardedSections = new Set(
    Object.values(awards)
      .filter((a) => a && a.type === 'section_complete' && a.sectionId)
      .map((a) => a.sectionId),
  );

  let changed = false;
  const cv = String(catalogVersion ?? 'unknown');

  for (const [sectionId, entry] of Object.entries(legacy)) {
    if (!sectionId) continue;
    const xp = entry && typeof entry === 'object' && Number.isFinite(entry.xp) && entry.xp >= 0
      ? Math.floor(entry.xp)
      : entry === true
        ? SECTION_COMPLETE_XP
        : SECTION_COMPLETE_XP;
    const at = entry && typeof entry === 'object' && typeof entry.at === 'string' ? entry.at : null;

    if (awardedSections.has(sectionId)) {
      changed = true;
      continue;
    }

    if (index.sections.has(sectionId) && isSectionCompleteInLog(sectionId, records, index)) {
      const key = sectionAwardKey(sectionId, cv);
      if (!awards[key]) {
        awards[key] = {
          type: 'section_complete',
          sectionId,
          catalogVersion: cv,
          questionIds: questionIdsForSection(sectionId, index),
          xp,
          at: at || new Date().toISOString(),
          source: 'legacy_map',
        };
        awardedSections.add(sectionId);
        changed = true;
      }
    } else {
      if (!unproven[sectionId]) {
        unproven[sectionId] = { xp, at, reason: 'no_log_proof' };
        changed = true;
      }
    }
  }

  const { completedSections, ...rest } = base;
  const next = {
    ...rest,
    version: PROGRESS_VERSION,
    awards,
    unprovenLegacyCompletions: unproven,
  };
  next.xp = getXp(next);
  return { progress: next, changed: true };
}

function sanitizeAwards(raw, index) {
  const out = {};
  let recovered = false;
  if (raw === null || raw === undefined) return { map: out, recovered: false };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { map: out, recovered: true };

  for (const [key, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      recovered = true;
      continue;
    }
    if (entry.type !== 'section_complete') {
      recovered = true;
      continue;
    }
    if (typeof entry.sectionId !== 'string' || !entry.sectionId) {
      recovered = true;
      continue;
    }
    // Keep awards even if section left the catalog (do not drop user history).
    // The amount is fixed by policy; a different stored amount is reported and normalized.
    if (entry.xp !== SECTION_COMPLETE_XP) recovered = true;
    const xp = SECTION_COMPLETE_XP;
    const catalogVersion = typeof entry.catalogVersion === 'string' ? entry.catalogVersion : 'unknown';
    const questionIds = Array.isArray(entry.questionIds)
      ? entry.questionIds.filter((id) => typeof id === 'string')
      : [];
    const at = typeof entry.at === 'string' ? entry.at : null;
    const source = ['log', 'legacy_map', 'migration'].includes(entry.source) ? entry.source : 'log';
    out[key] = {
      type: 'section_complete',
      sectionId: entry.sectionId,
      catalogVersion,
      questionIds,
      xp,
      at,
      source,
    };
  }
  return { map: out, recovered };
}

function sanitizeUnproven(raw) {
  const out = {};
  let recovered = false;
  if (raw === null || raw === undefined) return { map: out, recovered: false };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { map: out, recovered: true };
  for (const [sectionId, entry] of Object.entries(raw)) {
    if (!sectionId) continue;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      recovered = true;
      continue;
    }
    const xp = Number.isFinite(entry.xp) && entry.xp >= 0 ? Math.floor(entry.xp) : SECTION_COMPLETE_XP;
    const at = typeof entry.at === 'string' ? entry.at : null;
    const reason = typeof entry.reason === 'string' ? entry.reason : 'no_log_proof';
    out[sectionId] = { xp, at, reason };
  }
  return { map: out, recovered };
}

export function sanitizeProgress(raw, index) {
  if (raw === null || raw === undefined) return { progress: defaultProgress(), recovered: false };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { progress: defaultProgress(), recovered: true };
  }
  if (raw.version !== PROGRESS_VERSION && !LEGACY_VERSIONS.has(raw.version)) {
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

  if (Array.isArray(raw.attempts)) {
    for (const entry of raw.attempts) {
      const result = sanitizeAttempt(entry, index);
      if (result.record) progress.attempts.push(result.record);
      if (result.invalid) recovered = true;
    }
  } else if (raw.attempts !== undefined && raw.attempts !== null) {
    recovered = true;
  }

  const aw = sanitizeAwards(raw.awards, index);
  progress.awards = aw.map;
  if (aw.recovered) recovered = true;

  const up = sanitizeUnproven(raw.unprovenLegacyCompletions);
  progress.unprovenLegacyCompletions = up.map;
  if (up.recovered) recovered = true;

  // Carry completedSections through sanitize so migrateCompletedSections can run
  // with log records available (practice-service boot). Not a source of truth.
  if (raw.completedSections && typeof raw.completedSections === 'object' && !Array.isArray(raw.completedSections)) {
    progress.completedSections = raw.completedSections;
  }

  progress.xp = getXp(progress);
  return { progress, recovered };
}

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

export function appendAttempt(progress, record, index) {
  const q = index.questions.get(record.itemId);
  if (!q) throw new RangeError(`unknown question: ${record.itemId}`);
  if (record.selectedIndex !== null && (record.selectedIndex < 0 || record.selectedIndex >= q.options.length)) {
    throw new RangeError(`selectedIndex out of range: ${String(record.selectedIndex)}`);
  }
  return { ...progress, attempts: [...progress.attempts, record] };
}

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

export function isSectionCompleted(progress, sectionId) {
  const awards = progress && progress.awards;
  if (!awards || typeof awards !== 'object') return false;
  return Object.values(awards).some(
    (a) => a && a.type === 'section_complete' && a.sectionId === sectionId,
  );
}

/** @deprecated Prefer repairAwardsFromLog; kept for callers that used the interim API. */
export function awardSectionCompletion(progress, sectionId, index, opts = {}) {
  const records = opts.records || [];
  // Build synthetic records from section answers if no log records provided
  // so pure unit tests without a log still work.
  let recs = records;
  if (!recs.length && progress && progress.sections) {
    const answers = sectionAnswers(progress, sectionId);
    recs = Object.keys(answers).map((questionId) => ({ sectionId, questionId }));
  }
  const r = repairAwardsFromLog(progress, recs, index, opts.catalogVersion || 'test', {
    xpAmount: opts.xpAmount,
    now: opts.now,
  });
  const awarded = r.newlyAwarded.includes(sectionId);
  return {
    progress: r.progress,
    awarded,
    xpGained: awarded ? (opts.xpAmount ?? SECTION_COMPLETE_XP) : 0,
  };
}

export function isSectionFullyAnswered(progress, sectionId, index) {
  const section = index.sections.get(sectionId);
  if (!section || !section.questions || section.questions.length === 0) return false;
  const answers = sectionAnswers(progress, sectionId);
  return section.questions.every((q) => answers[q.id] !== undefined);
}

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
      const awards = progress.awards && typeof progress.awards === 'object' ? progress.awards : {};
      const unproven =
        progress.unprovenLegacyCompletions && typeof progress.unprovenLegacyCompletions === 'object'
          ? progress.unprovenLegacyCompletions
          : {};
      const toSave = {
        version: PROGRESS_VERSION,
        selection: progress.selection ?? null,
        sections: progress.sections || {},
        attempts: Array.isArray(progress.attempts) ? progress.attempts : [],
        awards,
        unprovenLegacyCompletions: unproven,
        xp: getXp({ awards }),
      };
      // Do not persist interim completedSections once migrated.
      const json = JSON.stringify(toSave);
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

export function freeBackupKey(storage) {
  const base = `${BACKUP_PREFIX}${Date.now()}`;
  let key = base;
  for (let n = 1; storage.getItem(key) !== null; n += 1) key = `${base}.${n}`;
  return key;
}
