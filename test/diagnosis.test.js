// Rule-based diagnosis. These tests pin the rules and the honesty guarantees:
// short data gives 'insufficient', missing timing is never invented, and causes
// that need missing data are listed as not assessed, never claimed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseTopic, THRESHOLDS, NOT_ASSESSED } from '../www/js/domain/diagnosis.js';

const a = (questionId, isCorrect, elapsedTimeMs = null) => ({ questionId, isCorrect, elapsedTimeMs });

test('too few attempts gives insufficient data, not a claim', () => {
  const r = diagnoseTopic([a('q1', false), a('q2', false), a('q3', false)]);
  assert.equal(r.status, 'insufficient');
  assert.equal(r.confidence, 'low');
});

test('wrong answers on one question only are not a pattern', () => {
  const r = diagnoseTopic([a('q1', false), a('q1', false), a('q1', false), a('q1', false)]);
  assert.equal(r.status, 'insufficient');
});

test('low accuracy across several questions suggests conceptual weakness', () => {
  const r = diagnoseTopic([
    a('q1', false), a('q2', false), a('q3', true), a('q4', false), a('q5', false), a('q6', false),
  ]);
  assert.equal(r.status, 'conceptual_weakness');
  assert.equal(r.confidence, 'medium');
  assert.equal(r.evidence.wrong, 5);
});

test('most wrong answers much faster than the median suggests rushing', () => {
  const r = diagnoseTopic([
    a('q1', true, 10000), a('q2', true, 12000), a('q3', true, 11000), a('q4', true, 9000),
    a('q5', false, 2000), a('q6', false, 1800), a('q7', true, 10500),
  ]);
  assert.equal(r.status, 'rushed_wrong_answers');
  assert.equal(r.evidence.rushedWrong, 2);
});

test('mostly right with a couple of unhurried wrong answers suggests carelessness', () => {
  const r = diagnoseTopic([
    a('q1', true, 8000), a('q2', true, 8000), a('q3', true, 8000), a('q4', true, 8000),
    a('q5', true, 8000), a('q6', false, 8000), a('q7', false, 8000),
  ]);
  assert.equal(r.status, 'carelessness_suspected');
});

test('a single slip is not called carelessness', () => {
  const r = diagnoseTopic([
    a('q1', true), a('q2', true), a('q3', true), a('q4', true), a('q5', false),
  ]);
  assert.equal(r.status, 'no_clear_pattern');
});

test('missing timing is never invented: unrecorded times do not trigger rushing', () => {
  const r = diagnoseTopic([
    a('q1', true, null), a('q2', true, null), a('q3', false, null), a('q4', false, null),
    a('q5', false, null), a('q6', true, null),
  ]);
  assert.equal(r.evidence.medianMs, null);
  assert.equal(r.evidence.rushedWrong, 0);
  assert.notEqual(r.status, 'rushed_wrong_answers');
});

test('too few timed attempts give no timing claim at all', () => {
  const r = diagnoseTopic([
    a('q1', false, 500), a('q2', false, 500), a('q3', true, 9000), a('q4', true, null), a('q5', true, null),
  ]);
  assert.equal(r.evidence.medianMs, null);
  assert.notEqual(r.status, 'rushed_wrong_answers');
});

test('causes that need missing data are always listed as not assessed', () => {
  const r = diagnoseTopic([a('q1', true), a('q2', true), a('q3', true), a('q4', true)]);
  assert.deepEqual(r.notAssessed.map((x) => x.cause), NOT_ASSESSED.map((x) => x.cause));
  const causes = r.notAssessed.map((x) => x.cause);
  assert.ok(causes.includes('computational_error'));
  assert.ok(causes.includes('concept_confusion'));
  assert.ok(causes.includes('hesitation'));
});

test('same input gives the same output and the input is not mutated', () => {
  const input = [
    a('q1', false, 3000), a('q2', false, 9000), a('q3', true, 9000), a('q4', false, 9000), a('q5', false, 9000),
  ];
  const snapshot = JSON.stringify(input);
  const first = diagnoseTopic(input);
  assert.deepEqual(diagnoseTopic(input), first);
  assert.equal(JSON.stringify(input), snapshot);
});

test('thresholds are frozen so no caller can silently change them', () => {
  assert.equal(Object.isFrozen(THRESHOLDS), true);
  assert.equal(Object.isFrozen(NOT_ASSESSED), true);
});
