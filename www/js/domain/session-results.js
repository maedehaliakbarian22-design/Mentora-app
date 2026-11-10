// Results for one practice run of one section. Pure: takes raw attempts and
// question content, returns view-ready facts.
//
// A practice run is one start-to-result pass through a section (SPEC v3 §13.9:
// sessionId). Every attempt in a run carries that run's id as sessionId. Only
// attempts with the given run id count, so earlier runs never leak in. Within a
// run the latest attempt per question wins. Correctness is recomputed from the
// question content on every call, never read from the stored isCorrect flag.

import { evaluateAnswer } from './evaluate.js';
import { percentOf } from './percent.js';

// The run that owns the section's current answers, or null when there are none.
// While answers are recorded the run continues, so the latest attempt's id is
// returned. This keeps a run whole across an app restart. restart-section clears
// the answers, so the next run starts from null and gets a new id.
export function currentRunId({ questions, attempts, answers }) {
  const answered = questions.some((q) => answers[q.id] !== undefined);
  if (!answered) return null;
  const ids = new Set(questions.map((q) => q.id));
  for (let i = attempts.length - 1; i >= 0; i -= 1) {
    if (ids.has(attempts[i].itemId)) return attempts[i].sessionId;
  }
  return null;
}

// questions: the section's questions (catalog order). attempts: all raw attempts
// (oldest first). sessionId: the run id, or null for no run. Returns
// { correct, incorrect, total, percent }; each item is
// { questionId, prompt, selectedIndex, selectedText, correctIndex, correctText }.
export function buildSessionResult({ questions, attempts, sessionId }) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const latest = new Map();
  for (const a of attempts) {
    if (sessionId === null || a.sessionId !== sessionId) continue;
    if (a.status !== 'attempted' || a.selectedIndex === null) continue;
    if (!byId.has(a.itemId)) continue;
    latest.set(a.itemId, a);
  }

  const correct = [];
  const incorrect = [];
  for (const q of questions) {
    const a = latest.get(q.id);
    if (!a) continue;
    const item = {
      questionId: q.id,
      prompt: q.prompt,
      selectedIndex: a.selectedIndex,
      selectedText: q.options[a.selectedIndex],
      correctIndex: q.correctIndex,
      correctText: q.options[q.correctIndex],
    };
    if (evaluateAnswer(q, a.selectedIndex).correct) correct.push(item);
    else incorrect.push(item);
  }

  const total = correct.length + incorrect.length;
  return { correct, incorrect, total, percent: percentOf(correct.length, total) };
}
