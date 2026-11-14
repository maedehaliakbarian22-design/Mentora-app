import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnerStats } from '../www/js/domain/learner-summary.js';
import { deriveAnswersFromAttempts } from '../www/js/progress/progress-store.js';
import { twoSectionIndex } from './support/fakes.js';

const index = twoSectionIndex();

function progress({ answers = { a1: 0, a2: 1 }, attempts = [], closedRunIds = [] } = {}) {
  return {
    selection: { gradeId: 'g', fieldId: 'f' },
    sections: {
      A: { answers, runId: 'run-A', closedRunIds },
      B: { answers: {}, runId: null, closedRunIds: [] },
    },
    attempts,
  };
}

const record = (questionId, sessionId = 'run-A', selectedIndex = 0) => ({
  questionId, itemId: questionId, sectionId: 'A', sessionId,
  status: 'attempted', selectedIndex, isCorrect: selectedIndex === 0,
});

test('learner stats split cached answers into logged and unlogged', () => {
  const stats = learnerStats(progress({ attempts: [record('a1')] }), index);
  assert.equal(stats.answered, 2);
  assert.equal(stats.loggedAnswered, 1);
  assert.equal(stats.unloggedAnswered, 1);
  assert.equal(stats.attempts, 1);
  assert.equal(stats.accuracyPercent, 100);
  assert.equal(stats.loggedAnswered + stats.unloggedAnswered, stats.answered);
});

test('all answered questions are logged when each has an active attempt record', () => {
  const stats = learnerStats(progress({ attempts: [record('a1'), record('a2', 'run-A', 1)] }), index);
  assert.equal(stats.answered, 2);
  assert.equal(stats.loggedAnswered, 2);
  assert.equal(stats.unloggedAnswered, 0);
});

test('records from closed runs do not count as currently logged answers', () => {
  const stats = learnerStats(progress({
    attempts: [record('a1', 'old-run')],
    closedRunIds: ['old-run'],
  }), index);
  assert.equal(stats.loggedAnswered, 0);
  assert.equal(stats.unloggedAnswered, 2);
  assert.equal(stats.attempts, 1);
});

test('unknown and cross-section cache keys are excluded from answer recording counts', () => {
  const stats = learnerStats(progress({
    answers: { a1: 0, a2: 1, unknown: 0, b1: 0 },
    attempts: [record('a1'), record('unknown'), record('b1')],
  }), index);
  assert.equal(stats.answered, 2);
  assert.equal(stats.loggedAnswered, 1);
  assert.equal(stats.unloggedAnswered, 1);
  assert.equal(stats.loggedAnswered + stats.unloggedAnswered, stats.answered);
});

test('answers rebuilt from the attempt history are counted as logged', () => {
  const attempts = [record('a1'), record('a2', 'run-A', 1)];
  const recoveredAnswers = deriveAnswersFromAttempts(attempts);
  const stats = learnerStats(progress({ answers: recoveredAnswers, attempts }), index);
  assert.equal(stats.answered, 2);
  assert.equal(stats.loggedAnswered, 2);
  assert.equal(stats.unloggedAnswered, 0);
});

test('only selected grade and field sections contribute to the counts', () => {
  const otherIndex = twoSectionIndex();
  const stats = learnerStats(progress({ answers: { a1: 0, a2: 1 }, attempts: [record('a1')] }), otherIndex);
  assert.equal(stats.answered, 2);
  assert.equal(stats.loggedAnswered, 1);
  assert.equal(stats.unloggedAnswered, 1);
});
