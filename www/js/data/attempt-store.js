// Local persistence for demo progress. Uses a Storage-compatible object so it
// can be tested with a fake. All reads are defensive: missing, unparsable, or
// structurally invalid data is reset to a clean default and reported.

import { evaluateAnswer } from '../domain/evaluate.js';

export const STORAGE_KEY = 'mentora.demo.progress.v1';
export const SCHEMA_VERSION = 1;
export const PHASES = Object.freeze(['chapter', 'lesson', 'question', 'result']);

export function defaultState(content) {
  return {
    version: SCHEMA_VERSION,
    chapterId: content.chapter.id,
    lessonId: content.lessons[0].id,
    phase: 'chapter',
    questionIndex: 0,
    answers: {},
  };
}

// Returns { state, recovered, reason }. `recovered` is true when stored data
// existed but was invalid and has been replaced by the default state.
export function sanitizeState(raw, content) {
  const fallback = (reason) => ({ state: defaultState(content), recovered: true, reason });
  if (raw === null) return { state: defaultState(content), recovered: false, reason: 'empty' };
  if (typeof raw !== 'object' || Array.isArray(raw)) return fallback('not-object');
  if (raw.version !== SCHEMA_VERSION) return fallback('version');
  if (raw.chapterId !== content.chapter.id) return fallback('chapter');
  const lesson = content.lessons.find((l) => l.id === raw.lessonId);
  if (!lesson) return fallback('lesson');
  if (!PHASES.includes(raw.phase)) return fallback('phase');

  const lessonQuestions = content.questions.filter((q) => q.lessonId === lesson.id);
  if (!Number.isInteger(raw.questionIndex) || raw.questionIndex < 0 || raw.questionIndex >= lessonQuestions.length) {
    return fallback('questionIndex');
  }
  if (raw.answers === null || typeof raw.answers !== 'object' || Array.isArray(raw.answers)) {
    return fallback('answers');
  }

  const answers = {};
  for (const q of lessonQuestions) {
    if (!Object.prototype.hasOwnProperty.call(raw.answers, q.id)) continue;
    const entry = raw.answers[q.id];
    if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.selectedIndex)) {
      return fallback('answer-entry');
    }
    try {
      const { correct } = evaluateAnswer(q, entry.selectedIndex);
      answers[q.id] = { selectedIndex: entry.selectedIndex, correct };
    } catch {
      return fallback('answer-range');
    }
  }
  for (const id of Object.keys(raw.answers)) {
    if (!lessonQuestions.some((q) => q.id === id)) return fallback('unknown-answer');
  }

  return {
    state: {
      version: SCHEMA_VERSION,
      chapterId: content.chapter.id,
      lessonId: lesson.id,
      phase: raw.phase,
      questionIndex: raw.questionIndex,
      answers,
    },
    recovered: false,
    reason: null,
  };
}

export function createStore(storage, content) {
  return {
    // Returns { state, recovered, reason, storageOk }.
    load() {
      let raw = null;
      try {
        const text = storage.getItem(STORAGE_KEY);
        if (text !== null) {
          try {
            raw = JSON.parse(text);
          } catch {
            return { ...fallbackResult(content, 'parse'), storageOk: true };
          }
        }
      } catch {
        return { ...fallbackResult(content, 'unavailable'), storageOk: false };
      }
      return { ...sanitizeState(raw, content), storageOk: true };
    },
    // Returns true on success, false if storage is unavailable or full.
    save(state) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch {
        return false;
      }
    },
    reset() {
      try {
        storage.removeItem(STORAGE_KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function fallbackResult(content, reason) {
  return { state: defaultState(content), recovered: reason !== 'unavailable', reason };
}
