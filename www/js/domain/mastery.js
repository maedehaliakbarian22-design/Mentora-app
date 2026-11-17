// Topic mastery: a state the learner can move up and down, not a percent.
// Pure: no storage, no DOM, no clock. The caller passes daysSinceLast.
//
// Mastery is NOT accuracy. Four things count:
// - recent answers count more than old ones (decaying weight);
// - the learner must have answered several different questions correctly;
// - long gaps since the last practice lower the score (forgetting);
// - a single lucky or repeated question cannot make a topic solid.
//
// Every number here is PROVISIONAL (not product-approved) and lives in MASTERY.

export const MASTERY = Object.freeze({
  MIN_ATTEMPTS: 4,            // PROVISIONAL: below this, state is 'insufficient'
  MIN_DISTINCT: 3,            // PROVISIONAL: distinct questions attempted
  RECENCY_FACTOR: 0.8,        // PROVISIONAL: weight multiplier per step back in time
  SOLID_SCORE: 0.8,           // PROVISIONAL
  SOLID_DISTINCT_CORRECT: 3,  // PROVISIONAL: solid needs this many different correct questions
  DEVELOPING_SCORE: 0.5,      // PROVISIONAL
  FORGET_AFTER_DAYS: 7,       // PROVISIONAL: decay starts after this many days
  FORGET_PER_DAY: 0.01,       // PROVISIONAL: score lost per day past the threshold
  FORGET_FLOOR: 0.6,          // PROVISIONAL: decay never goes below this multiplier
});

const round2 = (x) => Math.round(x * 100) / 100;

// attempts: chronological { questionId, isCorrect }.
// daysSinceLast: number of days since the last attempt on this topic, or null
// when unknown (no decay is applied for unknown time, and this is reported).
export function topicMastery(attempts, { daysSinceLast = null } = {}) {
  const list = Array.isArray(attempts) ? attempts : [];
  const n = list.length;
  const distinct = new Set(list.map((a) => a.questionId)).size;
  const distinctCorrect = new Set(list.filter((a) => a.isCorrect === true).map((a) => a.questionId)).size;
  const base = { attempts: n, distinctQuestions: distinct, distinctCorrect };

  if (n < MASTERY.MIN_ATTEMPTS || distinct < MASTERY.MIN_DISTINCT) {
    return { state: 'insufficient', score: null, evidence: { ...base, decay: null } };
  }

  // Newest attempt has weight 1; each older step multiplies by RECENCY_FACTOR.
  let num = 0;
  let den = 0;
  list.forEach((a, i) => {
    const w = MASTERY.RECENCY_FACTOR ** (n - 1 - i);
    num += w * (a.isCorrect === true ? 1 : 0);
    den += w;
  });
  const weighted = num / den;

  let decay = 1;
  if (typeof daysSinceLast === 'number' && daysSinceLast > MASTERY.FORGET_AFTER_DAYS) {
    const lost = (daysSinceLast - MASTERY.FORGET_AFTER_DAYS) * MASTERY.FORGET_PER_DAY;
    decay = Math.max(MASTERY.FORGET_FLOOR, 1 - lost);
  }

  const score = weighted * decay;
  let state = 'weak';
  if (score >= MASTERY.SOLID_SCORE && distinctCorrect >= MASTERY.SOLID_DISTINCT_CORRECT) {
    state = 'solid';
  } else if (score >= MASTERY.DEVELOPING_SCORE) {
    state = 'developing';
  }
  return {
    state,
    score: round2(score),
    evidence: { ...base, decay: round2(decay) },
  };
}
