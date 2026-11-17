// Topic mastery rules. These tests pin that mastery is a state that moves both
// ways, that accuracy alone cannot make a topic solid, and that forgetting lowers it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topicMastery, MASTERY } from '../www/js/domain/mastery.js';

const a = (questionId, isCorrect) => ({ questionId, isCorrect });

test('too few attempts or too few different questions gives insufficient', () => {
  assert.equal(topicMastery([a('q1', true), a('q2', true), a('q3', true)]).state, 'insufficient');
  assert.equal(topicMastery([a('q1', true), a('q1', true), a('q1', true), a('q1', true)]).state, 'insufficient');
});

test('perfect accuracy on two questions cannot make a topic solid', () => {
  const r = topicMastery([a('q1', true), a('q1', true), a('q1', true), a('q2', true), a('q2', true), a('q2', true)]);
  assert.equal(r.evidence.distinctCorrect, 2);
  assert.notEqual(r.state, 'solid');
});

test('solid needs a high score and several different correct questions', () => {
  const r = topicMastery([
    a('q1', true), a('q2', true), a('q3', true), a('q4', true), a('q5', true), a('q6', true),
  ]);
  assert.equal(r.state, 'solid');
  assert.ok(r.score >= MASTERY.SOLID_SCORE);
});

test('mastery goes down after recent mistakes and up after recovery', () => {
  const strong = [a('q1', true), a('q2', true), a('q3', true), a('q4', true), a('q5', true), a('q6', true)];
  assert.equal(topicMastery(strong).state, 'solid');

  const slipped = [...strong, a('q1', false), a('q2', false), a('q3', false)];
  const down = topicMastery(slipped);
  assert.notEqual(down.state, 'solid');

  const recovered = [...slipped, a('q4', true), a('q5', true), a('q6', true), a('q1', true), a('q2', true), a('q3', true)];
  assert.ok(topicMastery(recovered).score > down.score);
});

test('recent answers weigh more than old ones', () => {
  const oldWrongNewRight = [a('q1', false), a('q2', false), a('q3', true), a('q4', true), a('q5', true), a('q6', true)];
  const oldRightNewWrong = [a('q1', true), a('q2', true), a('q3', false), a('q4', false), a('q5', false), a('q6', false)];
  assert.ok(topicMastery(oldWrongNewRight).score > topicMastery(oldRightNewWrong).score);
});

test('long gaps since practice lower the score (forgetting)', () => {
  const list = [a('q1', true), a('q2', true), a('q3', true), a('q4', true), a('q5', true), a('q6', true)];
  const fresh = topicMastery(list, { daysSinceLast: 2 });
  const stale = topicMastery(list, { daysSinceLast: 30 });
  assert.equal(fresh.evidence.decay, 1);
  assert.ok(stale.evidence.decay < 1);
  assert.ok(stale.score < fresh.score);
});

test('decay never drops below its floor', () => {
  const list = [a('q1', true), a('q2', true), a('q3', true), a('q4', true)];
  const r = topicMastery(list, { daysSinceLast: 10000 });
  assert.equal(r.evidence.decay, MASTERY.FORGET_FLOOR);
});

test('unknown time since last practice applies no decay and says so', () => {
  const r = topicMastery([a('q1', true), a('q2', true), a('q3', true), a('q4', true)]);
  assert.equal(r.evidence.decay, 1);
});

test('same input gives the same output and the input is not mutated', () => {
  const input = [a('q1', true), a('q2', false), a('q3', true), a('q4', true), a('q1', false)];
  const snapshot = JSON.stringify(input);
  const first = topicMastery(input, { daysSinceLast: 9 });
  assert.deepEqual(topicMastery(input, { daysSinceLast: 9 }), first);
  assert.equal(JSON.stringify(input), snapshot);
});

test('mastery config is frozen', () => {
  assert.equal(Object.isFrozen(MASTERY), true);
});
