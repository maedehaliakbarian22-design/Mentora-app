import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionResult } from '../www/js/domain/session-results.js';

const questions = [
  { id: 'q1', prompt: 'P1', options: ['a', 'b', 'c'], correctIndex: 1 },
  { id: 'q2', prompt: 'P2', options: ['x', 'y'], correctIndex: 0 },
  { id: 'q3', prompt: 'P3', options: ['m', 'n'], correctIndex: 1 },
];

const attempt = (itemId, selectedIndex, sessionId, extra = {}) => ({
  itemId, attemptNumber: 1, status: 'attempted', sessionId, selectedIndex, isCorrect: null, elapsedTimeMs: 1, ...extra,
});

test('0 of 0: no attempts in this session gives empty lists and null percent', () => {
  const r = buildSessionResult({ questions, attempts: [], sessionId: 'now' });
  assert.deepEqual(r.correct, []);
  assert.deepEqual(r.incorrect, []);
  assert.equal(r.total, 0);
  assert.equal(r.percent, null);
});

test('attempts from an earlier session never count, even for the same question', () => {
  const attempts = [attempt('q1', 1, 'old'), attempt('q2', 0, 'old')];
  const r = buildSessionResult({ questions, attempts, sessionId: 'now' });
  assert.equal(r.total, 0);
  assert.equal(r.percent, null);
});

test('only this session counts when earlier and current attempts are mixed', () => {
  const attempts = [attempt('q1', 0, 'old'), attempt('q1', 1, 'now')];
  const r = buildSessionResult({ questions, attempts, sessionId: 'now' });
  assert.equal(r.total, 1);
  assert.equal(r.correct.length, 1);
  assert.equal(r.incorrect.length, 0);
});

test('the latest attempt for a question within the session wins', () => {
  const attempts = [attempt('q1', 0, 'now'), attempt('q1', 1, 'now')];
  const r = buildSessionResult({ questions, attempts, sessionId: 'now' });
  assert.equal(r.total, 1);
  assert.equal(r.correct[0].questionId, 'q1');
});

test('correct and incorrect items carry prompt, selected text, and correct text', () => {
  const attempts = [attempt('q1', 1, 'now'), attempt('q2', 1, 'now')];
  const r = buildSessionResult({ questions, attempts, sessionId: 'now' });
  assert.deepEqual(r.correct, [{
    questionId: 'q1', prompt: 'P1', selectedIndex: 1, selectedText: 'b', correctIndex: 1, correctText: 'b',
  }]);
  assert.deepEqual(r.incorrect, [{
    questionId: 'q2', prompt: 'P2', selectedIndex: 1, selectedText: 'y', correctIndex: 0, correctText: 'x',
  }]);
});

test('lists follow catalog order, not attempt order', () => {
  const attempts = [attempt('q3', 0, 'now'), attempt('q1', 0, 'now')];
  const r = buildSessionResult({ questions, attempts, sessionId: 'now' });
  assert.deepEqual(r.incorrect.map((i) => i.questionId), ['q1', 'q3']);
});

test('correctness is recomputed from content, not trusted from the stored flag', () => {
  const attempts = [attempt('q1', 0, 'now', { isCorrect: true })];
  const r = buildSessionResult({ questions, attempts, sessionId: 'now' });
  assert.equal(r.correct.length, 0);
  assert.equal(r.incorrect.length, 1);
});

test('skipped attempts and attempts for unknown questions are ignored', () => {
  const attempts = [
    attempt('q1', null, 'now', { status: 'skipped' }),
    attempt('unknown', 0, 'now'),
  ];
  const r = buildSessionResult({ questions, attempts, sessionId: 'now' });
  assert.equal(r.total, 0);
});

test('1 of 8 correct gives 13 percent', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({
    id: `m${i}`, prompt: `P${i}`, options: ['a', 'b'], correctIndex: 1,
  }));
  const attempts = many.map((q, i) => attempt(q.id, i === 0 ? 1 : 0, 'now'));
  const r = buildSessionResult({ questions: many, attempts, sessionId: 'now' });
  assert.equal(r.correct.length, 1);
  assert.equal(r.total, 8);
  assert.equal(r.percent, 13);
});

test('all correct gives 100 percent with an empty incorrect list', () => {
  const attempts = [attempt('q1', 1, 'now'), attempt('q2', 0, 'now'), attempt('q3', 1, 'now')];
  const r = buildSessionResult({ questions, attempts, sessionId: 'now' });
  assert.equal(r.percent, 100);
  assert.deepEqual(r.incorrect, []);
});
