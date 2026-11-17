// Chooses the next question for a topic from the learner's state.
// Pure: the caller passes the catalog questions (in catalog order) and what the
// learner has already answered in this run.
//
// Honesty rules:
// - Difficulty and kind are optional content metadata. Without them the choice
//   falls back to catalog order and says so (fallback: true). Nothing is invented.
// - Reason codes explain the choice; they are not shown as diagnoses.

export const NEXT_REASON = Object.freeze({
  NONE_OPEN: 'none_open',
  NOT_ENOUGH_EVIDENCE: 'not_enough_evidence',
  CONCEPT_FOCUS: 'concept_focus',
  ACCURACY_FOCUS: 'accuracy_focus',
  ATTENTION_FOCUS: 'attention_focus',
  CHALLENGE: 'challenge',
  CONTINUE: 'continue',
});

// questions: [{ id, kind?, difficulty? }] in catalog order.
// mastery: { state }. diagnosisStatus: string or null. answeredIds: string[].
export function chooseNextStep({ mastery, diagnosisStatus = null, questions, answeredIds = [] }) {
  const answered = new Set(answeredIds);
  const open = (Array.isArray(questions) ? questions : []).filter((q) => !answered.has(q.id));
  if (open.length === 0) return { questionId: null, reasonCode: NEXT_REASON.NONE_OPEN, fallback: false };

  const state = mastery ? mastery.state : 'insufficient';
  // predicate: which open questions fit the intent (or null for any).
  // If none is tagged for it, the first open question is used and marked fallback.
  const pick = (predicate, reasonCode) => {
    if (predicate === null) return { questionId: open[0].id, reasonCode, fallback: false };
    const tagged = open.filter(predicate);
    if (tagged.length > 0) return { questionId: tagged[0].id, reasonCode, fallback: false };
    return { questionId: open[0].id, reasonCode, fallback: true };
  };

  if (state === 'insufficient') return pick(null, NEXT_REASON.NOT_ENOUGH_EVIDENCE);
  if (diagnosisStatus === 'conceptual_weakness' || state === 'weak') {
    return pick((q) => q.kind === 'concept', NEXT_REASON.CONCEPT_FOCUS);
  }
  if (diagnosisStatus === 'rushed_wrong_answers') return pick(null, NEXT_REASON.ACCURACY_FOCUS);
  if (diagnosisStatus === 'carelessness_suspected') return pick(null, NEXT_REASON.ATTENTION_FOCUS);
  if (state === 'solid') return pick((q) => q.difficulty === 'hard', NEXT_REASON.CHALLENGE);
  return pick(null, NEXT_REASON.CONTINUE);
}
