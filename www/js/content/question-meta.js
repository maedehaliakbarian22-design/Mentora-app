// Optional question metadata: kind and difficulty.
//
// Both fields are optional. Old questions without them stay valid.
// A value outside the lists below is treated as absent (null).
// Nothing is ever guessed from prompt text, id or catalog position.
// The lists are PROVISIONAL (not product-approved).

export const QUESTION_KIND = Object.freeze(['concept', 'practice']);
export const QUESTION_DIFFICULTY = Object.freeze(['easy', 'medium', 'hard']);

// Pure. Accepts any value (including null/undefined) and never throws.
export function readQuestionMeta(question) {
  const q = question && typeof question === 'object' ? question : {};
  const kind = QUESTION_KIND.includes(q.kind) ? q.kind : null;
  const difficulty = QUESTION_DIFFICULTY.includes(q.difficulty) ? q.difficulty : null;
  return { kind, difficulty };
}
