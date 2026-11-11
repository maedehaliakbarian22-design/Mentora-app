// Practice service: the one place that coordinates the Attempt Log, the progress
// cache, session identity and results. Pure with respect to the DOM. It takes a
// Storage-compatible object, so it can be tested with a fake.
//
// Write order for one Check: (1) append the record to the Attempt Log, verified;
// (2) save the progress cache. If (1) fails, nothing is recorded and the caller
// shows an error. If (2) fails after (1) succeeded, the next load restores the
// answer from the log. So a logged answer is never lost, and an unlogged answer
// is never shown as recorded.

import {
  createProgressStore, defaultProgress, sectionState, clearSection, PROGRESS_KEY,
  repairAwardsFromLog, migrateCompletedSections, getXp,
} from '../progress/progress-store.js';
import { createAttemptLog, validateAttemptRecord, toView, toLocalIso } from '../attempts/attempt-log.js';
import { migrateLegacyAttempts, legacyAttemptsToRecords, readEmbeddedLegacyAttempts } from '../attempts/legacy-migration.js';
import { reconcileSection } from './practice-session.js';
import { buildSessionResult } from './session-results.js';

function defaultNewId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Legacy records first (older), then log records. Each attemptId keeps its last
// occurrence, so a log copy of a migrated record wins over the legacy copy.
function mergeRecords(legacy, logged) {
  const all = [...legacy, ...logged];
  const last = new Map();
  all.forEach((r, i) => last.set(r.attemptId, i));
  return all.filter((r, i) => last.get(r.attemptId) === i);
}

export function createPracticeService({
  storage, index, catalogVersion, now = () => new Date(), newId = defaultNewId,
}) {
  const store = createProgressStore(storage, index);
  const log = createAttemptLog(storage, index);
  let progress = defaultProgress();
  let records = [];
  let notices = [];
  let migration = { status: 'none' };

  function boot() {
    migration = migrateLegacyAttempts(storage, index);
    const loaded = store.load();
    progress = loaded.progress;
    if (!loaded.storageOk) notices.push('storage-unavailable');
    if (loaded.recovered) notices.push('progress-recovered');
    const logged = log.load();
    if (logged.status === 'corrupt') notices.push('log-corrupt');
    if (logged.status === 'unavailable') notices.push('log-unavailable');
    if (logged.invalid > 0) notices.push('log-invalid');
    if (migration.status === 'failed' || migration.status === 'partial') notices.push('migration-incomplete');

    // Still-embedded legacy attempts (migration not completed) remain visible.
    let embedded = [];
    try {
      embedded = readEmbeddedLegacyAttempts(storage.getItem(PROGRESS_KEY));
    } catch {
      embedded = [];
    }
    const legacy = legacyAttemptsToRecords(embedded, index).records;
    records = mergeRecords(legacy, logged.records);

    let changed = false;
    const sections = { ...progress.sections };
    const ids = new Set([...Object.keys(progress.sections), ...records.map((r) => r.sectionId)]);
    for (const sectionId of ids) {
      if (!index.sections.has(sectionId)) continue;
      const res = reconcileSection(sectionState(progress, sectionId),
        records.filter((r) => r.sectionId === sectionId), index);
      if (res.changed) {
        sections[sectionId] = res.state;
        changed = true;
      }
      if (res.notices.unlogged.length > 0 && !notices.includes('unlogged-answers')) {
        notices.push('unlogged-answers');
      }
    }
    if (changed) {
      progress = { ...progress, sections };
    }

    // Migrate interim completedSections → awards / unproven (never drop claims).
    const migrated = migrateCompletedSections(progress, records, index, catalogVersion);
    progress = migrated.progress;
    if (migrated.changed) changed = true;

    // Prove completions from Attempt Log and award once (policy A).
    const repaired = repairAwardsFromLog(progress, records, index, catalogVersion, { now });
    progress = repaired.progress;
    if (repaired.changed) changed = true;

    if (changed) {
      if (!store.save(progress)) notices.push('save-failed');
    }
  }

  function sectionOf(sectionId) {
    return index.sections.get(sectionId) || null;
  }

  function commitSection(sectionId, state) {
    progress = {
      ...progress,
      sections: { ...progress.sections, [sectionId]: state },
    };
    return store.save(progress);
  }

  // Records one answer. Returns { ok, saved, reason }.
  function check(sectionId, questionId, selectedIndex) {
    const section = sectionOf(sectionId);
    const q = index.questions.get(questionId);
    if (!section || !q || q.sectionId !== sectionId) return { ok: false, reason: 'unknown' };
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= q.optionIds.length) {
      return { ok: false, reason: 'range' };
    }
    const state = sectionState(progress, sectionId);
    if (state.answers[questionId] !== undefined) return { ok: false, reason: 'answered' };

    const runId = state.runId ?? newId();
    const sequenceInSession = records.filter((r) => r.sessionId === runId && r.sectionId === sectionId).length + 1;
    const candidate = {
      schemaVersion: 1,
      attemptId: newId(),
      sessionId: runId,
      sequenceInSession,
      sectionId,
      questionId,
      selectedOptionId: q.optionIds[selectedIndex],
      isCorrect: selectedIndex === q.correctIndex,
      timestampLocal: toLocalIso(now()),
      mode: 'practice',
      contentVersion: String(catalogVersion),
    };
    const v = validateAttemptRecord(candidate, index);
    if (!v.ok) return { ok: false, reason: 'invalid' };

    const written = log.append(v.record);
    if (!written.ok) return { ok: false, reason: 'log-write', detail: written.reason };
    records = [...records, v.record];

    const nextState = {
      answers: { ...state.answers, [questionId]: selectedIndex },
      runId,
      closedRunIds: state.closedRunIds,
    };
    progress = {
      ...progress,
      sections: { ...progress.sections, [sectionId]: nextState },
    };
    // Award from Attempt Log (includes the record just appended). Policy A.
    const beforeXp = getXp(progress);
    const repaired = repairAwardsFromLog(progress, records, index, catalogVersion, { now });
    progress = repaired.progress;
    const xpGained = getXp(progress) - beforeXp;
    const saved = store.save(progress);
    // If save failed, in-memory awards remain; boot() will repair from Log later.
    return {
      ok: true,
      saved,
      record: v.record,
      xpAwarded: repaired.newlyAwarded.includes(sectionId),
      xpGained,
      totalXp: getXp(progress),
    };
  }

  // Restart: closes the section's run and clears its answers. Log records stay.
  function restartSection(sectionId) {
    if (!sectionOf(sectionId)) return { ok: false, reason: 'unknown' };
    progress = clearSection(progress, sectionId);
    return { ok: true, saved: store.save(progress) };
  }

  function result(sectionId) {
    const section = sectionOf(sectionId);
    if (!section) return null;
    const state = sectionState(progress, sectionId);
    const views = records
      .filter((r) => r.sectionId === sectionId)
      .map((r) => toView(r, index));
    return buildSessionResult({ questions: section.questions, attempts: views, sessionId: state.runId });
  }

  // Progress shaped for learner statistics: attempts come from the log view.
  function statsInput() {
    return { ...progress, attempts: records.map((r) => toView(r, index)) };
  }

  return {
    boot,
    progress: () => progress,
    setProgress(next) {
      progress = next;
      return store.save(progress);
    },
    check,
    restartSection,
    result,
    statsInput,
    notices: () => [...notices],
    migration: () => migration,
    logStatus: () => log.status(),
    runIdFor: (sectionId) => sectionState(progress, sectionId).runId,
  };
}

// Boots a service over storage. Returns the service, already reconciled.
export function openPracticeService(options) {
  const service = createPracticeService(options);
  service.boot();
  return service;
}
