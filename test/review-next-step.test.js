// Spaced review order and next-question choice. These pin the honesty rules:
// missing content tags fall back to catalog order and say so, and answered
// questions are never offered again in the same run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewIntervalDays, reviewOrder, REVIEW } from '../www/js/domain/review-schedule.js';
import { chooseNextStep, NEXT_REASON } from '../www/js/domain/next-step.js';

test('interval follows state and diagnosis: weak soonest, solid longest', () => {
  assert.equal(reviewIntervalDays({ state: 'weak' }), REVIEW.INTERVAL_WEAK);
  assert.equal(reviewIntervalDays({ state: 'solid' }), REVIEW.INTERVAL_SOLID);
  assert.equal(reviewIntervalDays({ state: 'developing', diagnosisStatus: 'carelessness_suspected' }), REVIEW.INTERVAL_PATTERN);
  assert.equal(reviewIntervalDays({ state: 'solid', diagnosisStatus: 'conceptual_weakness' }), REVIEW.INTERVAL_WEAK);
});

test('only due topics are returned, most overdue first', () => {
  const order = reviewOrder([
    { topicId: 'solid-recent', state: 'solid', daysSinceLast: 2 },
    { topicId: 'weak-old', state: 'weak', daysSinceLast: 9 },
    { topicId: 'weak-fresh', state: 'weak', daysSinceLast: 0 },
    { topicId: 'solid-due', state: 'solid', daysSinceLast: 8 },
  ]);
  assert.deepEqual(order.map((x) => x.topicId), ['weak-old', 'solid-due']);
});

test('reviewOrder does not mutate its input', () => {
  const input = [{ topicId: 'a', state: 'weak', daysSinceLast: 5 }, { topicId: 'b', state: 'solid', daysSinceLast: 9 }];
  const snapshot = JSON.stringify(input);
  reviewOrder(input);
  assert.equal(JSON.stringify(input), snapshot);
});

const Q = [
  { id: 'q1', kind: 'concept', difficulty: 'easy' },
  { id: 'q2', kind: 'calc', difficulty: 'medium' },
  { id: 'q3', kind: 'concept', difficulty: 'hard' },
];

test('no open questions gives none_open', () => {
  const r = chooseNextStep({ mastery: { state: 'weak' }, questions: Q, answeredIds: ['q1', 'q2', 'q3'] });
  assert.equal(r.questionId, null);
  assert.equal(r.reasonCode, NEXT_REASON.NONE_OPEN);
});

test('answered questions are never offered again in the run', () => {
  const r = chooseNextStep({ mastery: { state: 'insufficient' }, questions: Q, answeredIds: ['q1'] });
  assert.equal(r.questionId, 'q2');
});

test('weak state prefers concept-tagged questions', () => {
  const r = chooseNextStep({ mastery: { state: 'weak' }, questions: Q, answeredIds: [] });
  assert.equal(r.questionId, 'q1');
  assert.equal(r.reasonCode, NEXT_REASON.CONCEPT_FOCUS);
  assert.equal(r.fallback, false);
});

test('a missing tag falls back to catalog order and says so', () => {
  const untagged = [{ id: 'x1' }, { id: 'x2' }];
  const r = chooseNextStep({ mastery: { state: 'weak' }, questions: untagged, answeredIds: [] });
  assert.equal(r.questionId, 'x1');
  assert.equal(r.fallback, true);
});

test('rushed errors focus on accuracy and carelessness on attention, not on difficulty', () => {
  const rushed = chooseNextStep({ mastery: { state: 'developing' }, diagnosisStatus: 'rushed_wrong_answers', questions: Q });
  assert.equal(rushed.reasonCode, NEXT_REASON.ACCURACY_FOCUS);
  const careless = chooseNextStep({ mastery: { state: 'developing' }, diagnosisStatus: 'carelessness_suspected', questions: Q });
  assert.equal(careless.reasonCode, NEXT_REASON.ATTENTION_FOCUS);
});

test('a solid topic gets a hard question when one exists, else a fallback marked as such', () => {
  const r = chooseNextStep({ mastery: { state: 'solid' }, questions: Q, answeredIds: ['q1'] });
  assert.equal(r.questionId, 'q3');
  assert.equal(r.reasonCode, NEXT_REASON.CHALLENGE);
  const none = chooseNextStep({ mastery: { state: 'solid' }, questions: [{ id: 'z1' }], answeredIds: [] });
  assert.equal(none.fallback, true);
});

test('insufficient evidence keeps catalog order', () => {
  const r = chooseNextStep({ mastery: { state: 'insufficient' }, questions: Q, answeredIds: [] });
  assert.equal(r.questionId, 'q1');
  assert.equal(r.reasonCode, NEXT_REASON.NOT_ENOUGH_EVIDENCE);
});
