// Summary numbers for the Home and Profile tabs. Pure: derived only from raw
// progress facts and catalog content. Nothing here is Learning State. These are
// counts and percentages of answers the learner has actually given.

import { sectionAnswers } from '../progress/progress-store.js';
import { percentOf } from './percent.js';

// Chapter/section pairs inside the learner's selected grade and field, in
// catalog order. Empty when nothing is selected.
export function scopeSections(index, selection) {
  if (!selection) return [];
  const out = [];
  for (const subject of index.subjects.values()) {
    if (subject.gradeId !== selection.gradeId || subject.fieldId !== selection.fieldId) continue;
    for (const chapterId of subject.chapters) {
      const chapter = index.chapters.get(chapterId);
      if (!chapter) continue;
      for (const ref of chapter.sections) {
        const section = index.sections.get(ref.id);
        if (section) out.push({ chapter, section });
      }
    }
  }
  return out;
}

// percent is null when there are no questions in scope (0 of 0).
export function overallProgress(progress, index) {
  let answered = 0;
  let total = 0;
  for (const { section } of scopeSections(index, progress.selection)) {
    const answers = sectionAnswers(progress, section.id);
    total += section.questions.length;
    answered += section.questions.filter((q) => answers[q.id] !== undefined).length;
  }
  return { answered, total, percent: percentOf(answered, total) };
}

// The first section, in catalog order, that still has an unanswered question.
// Returns null when there is none (no questions, or everything answered).
export function continueTarget(progress, index) {
  for (const { chapter, section } of scopeSections(index, progress.selection)) {
    if (section.questions.length === 0) continue;
    const answers = sectionAnswers(progress, section.id);
    if (section.questions.some((q) => answers[q.id] === undefined)) {
      return {
        sectionId: section.id,
        sectionTitle: section.title,
        chapterTitle: chapter.title,
        answered: section.questions.filter((q) => answers[q.id] !== undefined).length,
        total: section.questions.length,
        hasDemo: section.questions.some((q) => q.status === 'demo'),
      };
    }
  }
  return null;
}

// Count cached answers separately from answers represented in the valid,
// non-closed attempt history. The cache remains the source for total answered;
// the attempt history remains the source for attempts and accuracy.
function answerRecordingCounts(progress, index) {
  const attempts = Array.isArray(progress.attempts) ? progress.attempts : [];
  const loggedBySection = new Map();

  for (const attempt of attempts) {
    if (!attempt || attempt.status !== 'attempted' || !attempt.sectionId || !attempt.questionId) continue;
    const state = progress.sections && progress.sections[attempt.sectionId];
    const closed = state && Array.isArray(state.closedRunIds) ? state.closedRunIds : [];
    if (closed.includes(attempt.sessionId)) continue;
    if (!loggedBySection.has(attempt.sectionId)) loggedBySection.set(attempt.sectionId, new Set());
    loggedBySection.get(attempt.sectionId).add(attempt.questionId);
  }

  let loggedAnswered = 0;
  let unloggedAnswered = 0;
  for (const { section } of scopeSections(index, progress.selection)) {
    const answers = sectionAnswers(progress, section.id);
    const logged = loggedBySection.get(section.id) || new Set();
    for (const questionId of Object.keys(answers)) {
      if (logged.has(questionId)) loggedAnswered += 1;
      else unloggedAnswered += 1;
    }
  }
  return { loggedAnswered, unloggedAnswered };
}

// accuracyPercent is null when no attempt has been recorded yet.
export function learnerStats(progress, index) {
  const attempted = progress.attempts.filter((a) => a.status === 'attempted');
  const correct = attempted.filter((a) => a.isCorrect === true).length;
  const recording = answerRecordingCounts(progress, index);
  return {
    attempts: progress.attempts.length,
    correct,
    accuracyPercent: attempted.length === 0 ? null : percentOf(correct, attempted.length),
    sessions: new Set(progress.attempts.map((a) => a.sessionId)).size,
    ...overallProgress(progress, index),
    ...recording,
  };
}
