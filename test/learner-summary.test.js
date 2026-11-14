import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnerStats } from '../www/js/domain/learner-summary.js';
import { deriveAnswersFromAttempts } from '../www/js/progress/progress-store.js';
import { twoSectionIndex } from './support/fakes.js';
import { indexCatalog } from '../www/js/content/catalog.js';

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

function scopedIndex() {
  const q = (id) => ({
    id, status: 'demo', prompt: id, options: ['x', 'y'],
    optionIds: [id + 'x', id + 'y'], correctIndex: 0,
  });
  return indexCatalog({
    grades: [
      { id: 'g', label: 'g', fields: [
        { id: 'f', label: 'f', available: true },
        { id: 'f2', label: 'f2', available: true },
      ] },
      { id: 'g2', label: 'g2', fields: [
        { id: 'f', label: 'f', available: true },
      ] },
    ],
    subjects: [
      { id: 's', label: 's', gradeId: 'g', fieldId: 'f', chapters: ['c'] },
      { id: 's-other-field', label: 's2', gradeId: 'g', fieldId: 'f2', chapters: ['c-other-field'] },
      { id: 's-other-grade', label: 's3', gradeId: 'g2', fieldId: 'f', chapters: ['c-other-grade'] },
    ],
    chapters: [
      { id: 'c', subjectId: 's', title: 'c', titleVerified: false, sections: [
        { id: 'A', title: 'A', placeholder: false, body: [], questions: [q('a1'), q('a2')] },
        { id: 'B', title: 'B', placeholder: false, body: [], questions: [q('b1')] },
      ] },
      { id: 'c-other-field', subjectId: 's-other-field', title: 'c2', titleVerified: false, sections: [
        { id: 'D', title: 'D', placeholder: false, body: [], questions: [q('d1')] },
      ] },
      { id: 'c-other-grade', subjectId: 's-other-grade', title: 'c3', titleVerified: false, sections: [
        { id: 'E', title: 'E', placeholder: false, body: [], questions: [q('e1')] },
      ] },
    ],
  });
}

const scopedRecord = (questionId, sectionId) => ({
  questionId, itemId: questionId, sectionId, sessionId: 'run',
  status: 'attempted', selectedIndex: 0, isCorrect: true,
});
const scopedState = (answers) => ({ answers, runId: 'run', closedRunIds: [] });

test('out-of-selection sections never affect total, answered, logged or unlogged counts', () => {
  const scopedProgress = {
    selection: { gradeId: 'g', fieldId: 'f' },
    attempts: [scopedRecord('a1', 'A'), scopedRecord('d1', 'D'), scopedRecord('e1', 'E')],
    sections: {
      A: scopedState({ a1: 0 }),
      B: scopedState({}),
      D: scopedState({ d1: 0 }),
      E: scopedState({ e1: 0 }),
    },
  };
  const stats = learnerStats(scopedProgress, scopedIndex());
  assert.equal(stats.total, 3);
  assert.equal(stats.answered, 1);
  assert.equal(stats.loggedAnswered, 1);
  assert.equal(stats.unloggedAnswered, 0);
});

test('unlogged answers in out-of-selection sections are not counted', () => {
  const scopedProgress = {
    selection: { gradeId: 'g', fieldId: 'f' },
    attempts: [],
    sections: {
      A: scopedState({}),
      B: scopedState({}),
      D: scopedState({ d1: 0 }),
      E: scopedState({ e1: 0 }),
    },
  };
  const stats = learnerStats(scopedProgress, scopedIndex());
  assert.equal(stats.total, 3);
  assert.equal(stats.answered, 0);
  assert.equal(stats.loggedAnswered, 0);
  assert.equal(stats.unloggedAnswered, 0);
});
