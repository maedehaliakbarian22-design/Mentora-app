// Local, device-only progress persistence. Stores raw facts only: which
// option a learner picked per question, and the learner's grade/field choice.
// Correctness is always recomputed from catalog content. No Learning State
// is stored or derived here.

export const PROGRESS_KEY = 'mentora.progress.v2';
export const PROGRESS_VERSION = 2;

export function defaultProgress() {
  return { version: PROGRESS_VERSION, selection: null, sections: {} };
}

// Returns { progress, recovered }. `recovered` is true when stored data existed
// but was structurally invalid; the invalid part is dropped and reported.
// Unknown ids (content removed in a later release) are dropped silently.
export function sanitizeProgress(raw, index) {
  if (raw === null || raw === undefined) return { progress: defaultProgress(), recovered: false };
  if (typeof raw !== 'object' || Array.isArray(raw) || raw.version !== PROGRESS_VERSION) {
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
    progress.sections[sectionId] = { answers };
  }

  return { progress, recovered };
}

// Pure updates: each returns a new progress object.
export function recordAnswer(progress, questionId, selectedIndex, index) {
  const q = index.questions.get(questionId);
  if (!q) throw new RangeError(`unknown question: ${questionId}`);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= q.options.length) {
    throw new RangeError(`selectedIndex out of range: ${String(selectedIndex)}`);
  }
  const prev = progress.sections[q.sectionId] || { answers: {} };
  return {
    ...progress,
    sections: {
      ...progress.sections,
      [q.sectionId]: { answers: { ...prev.answers, [questionId]: selectedIndex } },
    },
  };
}

export function clearSection(progress, sectionId) {
  const sections = { ...progress.sections };
  delete sections[sectionId];
  return { ...progress, sections };
}

export function setSelection(progress, selection) {
  return { ...progress, selection };
}

export function sectionAnswers(progress, sectionId) {
  return (progress.sections[sectionId] && progress.sections[sectionId].answers) || {};
}

// Creates a store over any Storage-compatible object. Never throws.
export function createProgressStore(storage, index) {
  return {
    load() {
      let raw = null;
      try {
        const text = storage.getItem(PROGRESS_KEY);
        if (text !== null) {
          try {
            raw = JSON.parse(text);
          } catch {
            return { progress: defaultProgress(), recovered: true, storageOk: true };
          }
        }
      } catch {
        return { progress: defaultProgress(), recovered: false, storageOk: false };
      }
      return { ...sanitizeProgress(raw, index), storageOk: true };
    },
    save(progress) {
      try {
        storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
        return true;
      } catch {
        return false;
      }
    },
  };
}
