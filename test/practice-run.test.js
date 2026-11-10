import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentRunId, buildSessionResult } from '../www/js/domain/session-results.js';

const questions = [
  { id: 'q1', prompt: 'P1', options: ['a', 'b', 'c'], correctIndex: 1 },
  { id: 'q2', prompt: 'P2', options: ['x', 'y'], correctIndex: 0 },
  { id: 'q3', prompt: 'P3', options: ['m', 'n'], correctIndex: 1 },
];

const att = (itemId, selectedIndex, sessionId) => ({
  itemId, attemptNumber: 1, status: 'attempted', sessionId, selectedIndex, isCorrect: null, elapsedTimeMs: 1,
});

test('no recorded answers means no current run', () => {
  assert.equal(currentRunId({ questions, attempts: [], answers: {} }), null);
});

test('while answers exist, the run is the latest attempt in this section', () => {
  const attempts = [att('q1', 1, 'R1'), att('q2', 0, 'R1')];
  const answers = { q1: { selectedIndex: 1 }, q2: { selectedIndex: 0 } };
  assert.equal(currentRunId({ questions, attempts, answers }), 'R1');
});

test('attempts from other sections are ignored when finding the run', () => {
  const attempts = [att('q1', 1, 'R1'), att('other-section-question', 0, 'R9')];
  const answers = { q1: { selectedIndex: 1 } };
  assert.equal(currentRunId({ questions, attempts, answers }), 'R1');
});

test('after restart-section clears the answers there is no current run, even with old attempts', () => {
  const attempts = [att('q1', 1, 'R1'), att('q2', 0, 'R1')];
  assert.equal(currentRunId({ questions, attempts, answers: {} }), null);
});

test('a run survives an app restart: answers from before the restart still count', () => {
  // Launch 1 answers Q1 and Q2 in run R1. Launch 2 resumes and answers Q3.
  // The run id is recovered from the stored attempts, not from the launch.
  const attempts = [att('q1', 1, 'R1'), att('q2', 0, 'R1'), att('q3', 1, 'R1')];
  const answers = { q1: { selectedIndex: 1 }, q2: { selectedIndex: 0 }, q3: { selectedIndex: 1 } };
  const runId = currentRunId({ questions, attempts, answers });
  const r = buildSessionResult({ questions, attempts, sessionId: runId });
  assert.equal(r.total, 3);
  assert.equal(r.percent, 100);
});

test('a new run after restart-section does not mix with the earlier run', () => {
  const attempts = [att('q1', 0, 'R1'), att('q2', 0, 'R1'), att('q1', 1, 'R2')];
  const answers = { q1: { selectedIndex: 1 } };
  const runId = currentRunId({ questions, attempts, answers });
  assert.equal(runId, 'R2');
  const r = buildSessionResult({ questions, attempts, sessionId: runId });
  assert.equal(r.total, 1);
  assert.equal(r.correct.length, 1);
});

test('a null run id gives an empty, 0 of 0 result', () => {
  const attempts = [att('q1', 1, 'R1')];
  const r = buildSessionResult({ questions, attempts, sessionId: null });
  assert.equal(r.total, 0);
  assert.equal(r.percent, null);
});
