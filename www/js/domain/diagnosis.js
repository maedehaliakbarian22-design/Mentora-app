// Rule-based diagnosis of a learner's recent attempts on one topic (or section).
// Pure: no storage, no DOM, no randomness. Same input, same output.
//
// Honesty rules:
// - A pattern is claimed only when there is enough evidence (THRESHOLDS).
// - Otherwise the status is 'insufficient'. Nothing is guessed.
// - Causes that need data this app does not record are listed in notAssessed
//   and are never claimed.
// - Every threshold is PROVISIONAL (not product-approved) and lives in one place.
//
// Input: attempts in order, each { questionId, isCorrect, elapsedTimeMs }.
// elapsedTimeMs may be null (not recorded); such attempts are skipped for timing.

export const THRESHOLDS = Object.freeze({
  MIN_ATTEMPTS: 4,            // PROVISIONAL: below this, no pattern is claimed
  MIN_DISTINCT_QUESTIONS: 3,  // PROVISIONAL: a pattern across one question is not a pattern
  WEAK_ACCURACY: 0.5,         // PROVISIONAL: at or below this, conceptual weakness is suspected
  CONFIDENT_ACCURACY: 0.7,    // PROVISIONAL: at or above this, careless errors are suspected
  MIN_TIMED: 4,               // PROVISIONAL: timing claims need this many timed attempts
  RUSH_RATIO: 0.5,            // PROVISIONAL: faster than this share of the median is "rushed"
  RUSH_SHARE: 0.6,            // PROVISIONAL: share of wrong answers that must be rushed
  MIN_RUSHED_WRONG: 2,        // PROVISIONAL
  MIN_CARELESS_WRONG: 2,      // PROVISIONAL: a single slip is not a pattern
  HIGH_CONFIDENCE_ATTEMPTS: 6 // PROVISIONAL: attempts needed for medium (not low) confidence
});

// Causes this module cannot judge from current data. Listed, never claimed.
export const NOT_ASSESSED = Object.freeze([
  { cause: 'computational_error', reason: 'needs question-level step or error tags (not in catalog)' },
  { cause: 'concept_confusion', reason: 'needs option-level error tags (not in catalog)' },
  { cause: 'hesitation', reason: 'needs a confidence signal (not recorded)' },
]);

const isMs = (v) => Number.isInteger(v) && v >= 0;

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round2 = (x) => Math.round(x * 100) / 100;

function result(status, confidence, evidence) {
  return { status, confidence, evidence, notAssessed: NOT_ASSESSED };
}

export function diagnoseTopic(attempts) {
  const list = Array.isArray(attempts) ? attempts : [];
  const n = list.length;
  const distinct = new Set(list.map((a) => a.questionId)).size;
  const T = THRESHOLDS;

  if (n < T.MIN_ATTEMPTS || distinct < T.MIN_DISTINCT_QUESTIONS) {
    return result('insufficient', 'low', { attempts: n, distinctQuestions: distinct });
  }

  const wrong = list.filter((a) => a.isCorrect === false);
  const accuracy = (n - wrong.length) / n;
  const timed = list.map((a) => a.elapsedTimeMs).filter(isMs);
  const medianMs = timed.length >= T.MIN_TIMED ? median(timed) : null;
  const rushedWrong = medianMs === null ? 0 : wrong.filter(
    (a) => isMs(a.elapsedTimeMs) && a.elapsedTimeMs < T.RUSH_RATIO * medianMs,
  ).length;
  const wrongDistinct = new Set(wrong.map((a) => a.questionId)).size;
  const evidence = {
    attempts: n,
    distinctQuestions: distinct,
    accuracy: round2(accuracy),
    wrong: wrong.length,
    rushedWrong,
    medianMs,
  };

  // Low accuracy across several different questions: the concept itself is the
  // most likely problem. Checked first, because rushed answers can add to it.
  if (accuracy <= T.WEAK_ACCURACY && wrongDistinct >= T.MIN_DISTINCT_QUESTIONS) {
    const conf = n >= T.HIGH_CONFIDENCE_ATTEMPTS ? 'medium' : 'low';
    return result('conceptual_weakness', conf, evidence);
  }

  // Most wrong answers were much faster than usual: rushing is the likely cause.
  if (rushedWrong >= T.MIN_RUSHED_WRONG && rushedWrong / wrong.length >= T.RUSH_SHARE) {
    return result('rushed_wrong_answers', 'low', evidence);
  }

  // Mostly right, with a few wrong answers that were not rushed: a slip is suspected.
  if (accuracy >= T.CONFIDENT_ACCURACY && wrong.length >= T.MIN_CARELESS_WRONG) {
    return result('carelessness_suspected', 'low', evidence);
  }

  return result('no_clear_pattern', 'low', evidence);
}
