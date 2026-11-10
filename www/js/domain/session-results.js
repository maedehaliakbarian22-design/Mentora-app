// Results for one practice run of one section, scoped to one app session.
// Pure: takes raw attempts and question content, returns view-ready facts.
//
// Only attempts whose sessionId matches the current launch count, so attempts
// from earlier launches never leak into this run. Within the session the latest
// attempt per question wins. Correctness is recomputed from the question content
// on every call, never read from the stored isCorrect flag.

import { evaluateAnswer } from './evaluate.js';
import { percentOf } from './percent.js';

// questions: the section's questions (catalog order). attempts: all raw attempts
// (oldest first). Returns { correct, incorrect, total, percent }; each item is
// { questionId, prompt, selectedIndex, selectedText, correctIndex, correctText }.
export function buildSessionResult({ questions, attempts, sessionId }) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const latest = new Map();
  for (const a of attempts) {
    if (a.sessionId !== sessionId) continue;
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
