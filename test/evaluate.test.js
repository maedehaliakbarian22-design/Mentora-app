import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAnswer, computeResult } from '../www/js/domain/evaluate.js';
import { CONTENT } from '../www/js/data/demo-content.js';

const Q = { id: 'x', options: ['a', 'b', 'c'], correctIndex: 1 };

test('evaluateAnswer marks the correct option as correct', () => {
  assert.deepEqual(evaluateAnswer(Q, 1), { correct: true, correctIndex: 1 });
});

test('evaluateAnswer marks any other option as incorrect and reports the correct index', () => {
  assert.deepEqual(evaluateAnswer(Q, 0), { correct: false, correctIndex: 1 });
  assert.deepEqual(evaluateAnswer(Q, 2), { correct: false, correctIndex: 1 });
});

test('evaluateAnswer rejects out-of-range, non-integer and missing indexes', () => {
  for (const bad of [-1, 3, 1.5, '1', null, undefined, NaN]) {
    assert.throws(() => evaluateAnswer(Q, bad), RangeError, String(bad));
  }
});

test('evaluateAnswer rejects a missing question', () => {
  assert.throws(() => evaluateAnswer(null, 0), TypeError);
  assert.throws(() => evaluateAnswer({ id: 'y' }, 0), TypeError);
});

test('computeResult on empty answers reports zero answered and incomplete', () => {
  const r = computeResult(CONTENT.questions, {});
  assert.deepEqual(r, { total: 3, answered: 0, correct: 0, percent: 0, complete: false });
});

test('computeResult counts correct answers and rounds the percentage', () => {
  const answers = {
    q1: { selectedIndex: 1, correct: true },
    q2: { selectedIndex: 2, correct: false },
    q3: { selectedIndex: 1, correct: true },
  };
  const r = computeResult(CONTENT.questions, answers);
  assert.equal(r.total, 3);
  assert.equal(r.answered, 3);
  assert.equal(r.correct, 2);
  assert.equal(r.percent, 67);
  assert.equal(r.complete, true);
});

test('computeResult recomputes correctness from content, ignoring a stored correct flag', () => {
  const answers = { q1: { selectedIndex: 0, correct: true } };
  const r = computeResult(CONTENT.questions, answers);
  assert.equal(r.correct, 0);
  assert.equal(r.answered, 1);
});

test('computeResult on zero questions returns zero percent', () => {
  assert.equal(computeResult([], {}).percent, 0);
});
