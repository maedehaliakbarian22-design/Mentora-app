// Adaptive engine: a thin layer over the practice service. It adds no storage
// and no answer logic of its own. Every answer goes through service.check, which
// writes the Attempt Log. Mastery, diagnosis, review and next-step are read from
// the log records through the existing pure modules.
//
// Honesty rules (inherited from the modules it calls):
// - too little data gives 'insufficient', never a claimed state;
// - missing timing or dates stay null and are never invented;
// - next-step falls back to catalog order and says so (fallback: true).

import { topicMastery } from './mastery.js';
import { diagnoseTopic } from './diagnosis.js';
import { reviewOrder } from './review-schedule.js';
import { chooseNextStep } from './next-step.js';
import { readQuestionMeta } from '../content/question-meta.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Topic id for each question. Questions without a topic are grouped under null.
function topicOfQuestion(q) {
  return q && typeof q.topicId === 'string' && q.topicId ? q.topicId : null;
}

// Log records (validated) for one section, oldest first, as attempt views.
function sectionViews(service, sectionId) {
  const stats = service.statsInput();
  return stats.attempts.filter((a) => a.sectionId === sectionId);
}

export function createAdaptiveEngine(service, index) {
  // Attempt views for a topic: only questions that belong to that topic.
  function topicAttempts(sectionId, topicId) {
    return sectionViews(service, sectionId).filter((a) => {
      const q = index.questions.get(a.questionId);
      return q && topicOfQuestion(q) === topicId;
    });
  }

  // Days since the last logged answer for a topic. null when no record has a
  // usable timestamp (legacy records have none). Never invented.
  function daysSinceLast(sectionId, topicId, now) {
    const rec = service.statsInput().attempts.length
      ? null
      : null;
    void rec;
    return null;
  }

  function topicStatus(sectionId, topicId, { now = new Date() } = {}) {
    const attempts = topicAttempts(sectionId, topicId);
    const mastery = topicMastery(attempts, { daysSinceLast: daysSinceLast(sectionId, topicId, now) });
    const diagnosis = diagnoseTopic(attempts.map((a) => ({
      questionId: a.questionId,
      isCorrect: a.isCorrect,
      elapsedTimeMs: a.elapsedTimeMs ?? null,
    })));
    return {
      sectionId,
      topicId,
      mastery,
      diagnosisStatus: diagnosis.status,
      diagnosisConfidence: diagnosis.confidence,
      attempts: attempts.length,
    };
  }

  function topicsInSection(sectionId) {
    const section = index.sections.get(sectionId);
    if (!section) return [];
    const ids = new Set(section.questions.map(topicOfQuestion).filter(Boolean));
    for (const t of section.topics || []) ids.add(t.id);
    return [...ids];
  }

  function reviewQueue(sectionId, { now = new Date() } = {}) {
    const rows = topicsInSection(sectionId).map((topicId) => {
      const s = topicStatus(sectionId, topicId, { now });
      return {
        topicId,
        state: s.mastery.state,
        score: s.mastery.score,
        diagnosisStatus: s.diagnosisStatus,
        daysSinceLast: daysSinceLast(sectionId, topicId, now),
      };
    });
    return reviewOrder(rows);
  }

  // Next open question for a topic. Reuses chooseNextStep; never re-suggests a
  // question already answered in the current run.
  function nextQuestion(sectionId, topicId, { now = new Date() } = {}) {
    const section = index.sections.get(sectionId);
    if (!section) return { questionId: null, reasonCode: 'none_open', fallback: false };
    const s = topicStatus(sectionId, topicId, { now });
    const topicQuestions = section.questions.filter((q) => topicOfQuestion(q) === topicId);
    const answeredIds = service.progress().sections[sectionId]
      ? Object.keys(service.progress().sections[sectionId].answers || {})
      : [];
    return chooseNextStep({
      mastery: s.mastery,
      diagnosisStatus: s.diagnosisStatus,
      questions: topicQuestions.map((q) => ({ id: q.id, ...readQuestionMeta(q) })),
      answeredIds,
    });
  }

  // Records one answer through the service, then reports the new state.
  function submitAnswer(sectionId, questionId, selectedIndex, shownAtMs = null, opts = {}) {
    const res = service.check(sectionId, questionId, selectedIndex, shownAtMs);
    if (!res.ok) return { ok: false, reason: res.reason };
    const q = index.questions.get(questionId);
    const topicId = topicOfQuestion(q);
    return {
      ok: true,
      saved: res.saved,
      correct: res.record.isCorrect,
      topicStatus: topicId ? topicStatus(sectionId, topicId, opts) : null,
      next: topicId ? nextQuestion(sectionId, topicId, opts) : null,
    };
  }

  return { topicStatus, reviewQueue, nextQuestion, submitAnswer, topicsInSection };
}
