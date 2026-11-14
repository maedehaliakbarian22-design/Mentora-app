import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnerStats } from '../www/js/domain/learner-summary.js';
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
