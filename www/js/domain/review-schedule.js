// Spaced review: when a topic should come back, and in what order to review.
// Pure: the caller supplies daysSinceLast. No clock, no storage.
//
// Rules (all PROVISIONAL, frozen in one place):
// - weak or conceptually weak topics come back soonest;
// - rushed or careless errors come back soon, with focus on accuracy;
// - solid topics wait longest;
// - a topic is due once daysSinceLast reaches its interval.

export const REVIEW = Object.freeze({
  INTERVAL_WEAK: 1,         // PROVISIONAL days
  INTERVAL_PATTERN: 2,      // PROVISIONAL: rushed or careless errors
  INTERVAL_DEVELOPING: 3,   // PROVISIONAL
  INTERVAL_SOLID: 7,        // PROVISIONAL
  INTERVAL_DEFAULT: 3,      // PROVISIONAL: unknown state
});

// state: mastery state ('insufficient' | 'weak' | 'developing' | 'solid').
// diagnosisStatus: diagnosis status (may be null).
export function reviewIntervalDays({ state, diagnosisStatus = null }) {
  if (diagnosisStatus === 'conceptual_weakness') return REVIEW.INTERVAL_WEAK;
  if (state === 'insufficient' || state === 'weak') return REVIEW.INTERVAL_WEAK;
  if (diagnosisStatus === 'rushed_wrong_answers' || diagnosisStatus === 'carelessness_suspected') {
    return REVIEW.INTERVAL_PATTERN;
  }
  if (state === 'developing') return REVIEW.INTERVAL_DEVELOPING;
  if (state === 'solid') return REVIEW.INTERVAL_SOLID;
  return REVIEW.INTERVAL_DEFAULT;
}

// topics: [{ topicId, state, score, diagnosisStatus, daysSinceLast }]
// Returns only due topics, most urgent first. Input is not mutated.
// Urgency: how overdue (desc), then shorter interval, then lower score, then id.
export function reviewOrder(topics) {
  const rows = (Array.isArray(topics) ? topics : [])
    .map((t) => {
      const interval = reviewIntervalDays(t);
      const since = typeof t.daysSinceLast === 'number' ? t.daysSinceLast : null;
      return {
        topicId: t.topicId,
        interval,
        overdue: since === null ? 0 : since - interval,
        score: typeof t.score === 'number' ? t.score : 0,
        due: since === null ? true : since >= interval,
      };
    })
    .filter((r) => r.due);
  rows.sort((a, b) => (b.overdue - a.overdue)
    || (a.interval - b.interval)
    || (a.score - b.score)
    || String(a.topicId).localeCompare(String(b.topicId)));
  return rows.map(({ topicId, interval, overdue }) => ({ topicId, interval, overdue }));
}
