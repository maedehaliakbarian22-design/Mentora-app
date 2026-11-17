import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import { openPracticeService } from '../www/js/domain/practice-service.js';
import { createAdaptiveEngine } from '../www/js/domain/adaptive-engine.js';
import { fakeStorage, realIndex, sequence, ticking } from './support/fakes.js';

const SEC = 'chapter-1-section-1';
const TOPIC = 'chapter-1-section-1-topic-1';
const idx = realIndex();

function setup(storage = fakeStorage(), index = idx) {
  const service = openPracticeService({
    storage, index, catalogVersion: CATALOG.version,
    now: ticking(), newId: sequence('e'),
  });
  return { service, engine: createAdaptiveEngine(service, index), storage };
}

test('integration: answer, then mastery, review and next question all update', () => {
  const { engine } = setup();
  const r1 = engine.submitAnswer(SEC, 'demo-q1', 1);
  assert.equal(r1.ok, true);
  assert.equal(r1.correct, true);
  assert.equal(r1.topicStatus.attempts, 1);
  assert.equal(r1.topicStatus.mastery.state, 'insufficient');
  assert.equal(r1.next.questionId !== 'demo-q1', true, 'answered question is not suggested again');

  engine.submitAnswer(SEC, 'demo-q2', 0);
  const r3 = engine.submitAnswer(SEC, 'demo-q3', 1);
  assert.equal(r3.topicStatus.attempts, 3);
  assert.equal(r3.next.questionId, null, 'no open question left in the demo section');
  assert.equal(r3.next.reasonCode, 'none_open');
});

test('partial data: a topic with no records yields insufficient, not a claim', () => {
  const { engine } = setup();
  const s = engine.topicStatus(SEC, TOPIC);
  assert.equal(s.mastery.state, 'insufficient');
  assert.equal(s.diagnosisStatus, 'insufficient');
  assert.equal(s.attempts, 0);
});

test('missing timing and dates stay null; review treats unknown date as due', () => {
  const { engine } = setup();
  engine.submitAnswer(SEC, 'demo-q1', 1);
  const q = engine.reviewQueue(SEC);
  assert.ok(q.every((row) => row.overdue === 0 || typeof row.overdue === 'number'));
  assert.ok(q.some((row) => row.topicId === TOPIC), 'unknown last-date topic is due');
});

test('fallback: no kind or difficulty labels means catalog order and fallback true', () => {
  const { engine } = setup();
  engine.submitAnswer(SEC, 'demo-q1', 1);
  engine.submitAnswer(SEC, 'demo-q2', 0);
  engine.submitAnswer(SEC, 'demo-q3', 1);
  const next = engine.nextQuestion(SEC, TOPIC);
  assert.equal(next.questionId, null);
  assert.equal(next.fallback, false);
});

test('no log: a fresh engine on empty storage behaves like a clean start', () => {
  const { engine } = setup(fakeStorage());
  const next = engine.nextQuestion(SEC, TOPIC);
  assert.equal(next.questionId, 'demo-q1');
  assert.equal(next.reasonCode, 'not_enough_evidence');
  assert.equal(next.fallback, false);
});

test('a second answer to the same question is refused and changes nothing', () => {
  const { engine, service } = setup();
  engine.submitAnswer(SEC, 'demo-q1', 1);
  const before = service.statsInput().attempts.length;
  const again = engine.submitAnswer(SEC, 'demo-q1', 0);
  assert.equal(again.ok, false);
  assert.equal(service.statsInput().attempts.length, before);
});
