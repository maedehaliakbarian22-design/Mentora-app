// Response time (elapsedTimeMs) and topic (topicId) on attempt records. Both are
// optional: records written before they existed stay valid, and a recorded value
// is checked against the catalog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import { validateCatalog } from '../www/js/content/validate.js';
import { validateAttemptRecord, createAttemptLog } from '../www/js/attempts/attempt-log.js';
import { openPracticeService } from '../www/js/domain/practice-service.js';
import { fakeStorage, realIndex, sequence } from './support/fakes.js';

const SEC = 'chapter-1-section-1';
const TOPIC = 'chapter-1-section-1-topic-1';
const idx = realIndex();

function base(extra = {}) {
  return {
    schemaVersion: 1,
    attemptId: 'a-1',
    sessionId: 's-1',
    sequenceInSession: 1,
    sectionId: SEC,
    questionId: 'demo-q1',
    selectedOptionId: 'o-5', // demo-q1: correctIndex 1 → o-5 is correct
    isCorrect: true,
    timestampLocal: null,
    mode: null,
    contentVersion: null,
    ...extra,
  };
}

test('a record without the optional fields is still valid (legacy records)', () => {
  const v = validateAttemptRecord(base(), idx);
  assert.equal(v.ok, true);
  assert.equal('elapsedTimeMs' in v.record, false);
});

test('elapsedTimeMs accepts null or a non-negative integer only', () => {
  assert.equal(validateAttemptRecord(base({ elapsedTimeMs: null }), idx).ok, true);
  assert.equal(validateAttemptRecord(base({ elapsedTimeMs: 0 }), idx).ok, true);
  assert.equal(validateAttemptRecord(base({ elapsedTimeMs: 4200 }), idx).ok, true);
  assert.equal(validateAttemptRecord(base({ elapsedTimeMs: -1 }), idx).reason, 'elapsed');
  assert.equal(validateAttemptRecord(base({ elapsedTimeMs: 1.5 }), idx).reason, 'elapsed');
  assert.equal(validateAttemptRecord(base({ elapsedTimeMs: '900' }), idx).reason, 'elapsed');
});

test('topicId must match the question topic when it is recorded', () => {
  assert.equal(validateAttemptRecord(base({ topicId: TOPIC }), idx).ok, true);
  assert.equal(validateAttemptRecord(base({ topicId: null }), idx).ok, true);
  assert.equal(validateAttemptRecord(base({ topicId: 'some-other-topic' }), idx).reason, 'topic');
  assert.equal(validateAttemptRecord(base({ topicId: 7 }), idx).reason, 'topic-type');
});

test('a question without a topic refuses a recorded topicId', () => {
  // Use a catalog where demo-q1 has no topic.
  const c = JSON.parse(JSON.stringify(CATALOG));
  delete c.chapters[0].sections[0].questions[0].topicId;
  const noTopic = indexCatalog(c);
  assert.equal(validateAttemptRecord(base({ topicId: TOPIC }), noTopic).reason, 'topic');
});

test('practice answers record response time and topic from the moment the question was shown', () => {
  const storage = fakeStorage();
  const fixedNow = () => new Date(2026, 10, 11, 15, 0, 5);
  const shownAt = new Date(2026, 10, 11, 15, 0, 0).getTime();
  const service = openPracticeService({
    storage, index: idx, catalogVersion: CATALOG.version, now: fixedNow, newId: sequence('t'),
  });
  const res = service.check(SEC, 'demo-q1', 1, shownAt);
  assert.equal(res.ok, true);

  const log = createAttemptLog(storage, idx);
  log.load();
  const [rec] = log.records();
  assert.equal(rec.elapsedTimeMs, 5000);
  assert.equal(rec.topicId, TOPIC);
});

test('without a shown time, the record stores null response time, not a guess', () => {
  const storage = fakeStorage();
  const service = openPracticeService({
    storage, index: idx, catalogVersion: CATALOG.version,
    now: () => new Date(2026, 10, 11, 15, 0, 5), newId: sequence('u'),
  });
  assert.equal(service.check(SEC, 'demo-q2', 0).ok, true);
  const log = createAttemptLog(storage, idx);
  log.load();
  const [rec] = log.records();
  assert.equal(rec.elapsedTimeMs, null);
  assert.equal(rec.topicId, TOPIC); // demo-q2 belongs to the same demo topic
});

test('the shipped catalog is valid and exposes its topics', () => {
  assert.deepEqual(validateCatalog(CATALOG), []);
  assert.equal(idx.topics.get(TOPIC).sectionId, SEC);
});

test('catalog validation rejects a question whose topic is not in its section', () => {
  const c = JSON.parse(JSON.stringify(CATALOG));
  c.chapters[0].sections[0].questions[0].topicId = 'missing-topic';
  const errors = validateCatalog(c);
  assert.ok(errors.some((e) => e.includes('is not a topic of this section')), errors.join('\n'));
});

test('catalog validation rejects a topic id that clashes with another id', () => {
  const c = JSON.parse(JSON.stringify(CATALOG));
  c.chapters[0].sections[0].topics.push({ id: 'demo-q1', title: 'clash' });
  const errors = validateCatalog(c);
  assert.ok(errors.some((e) => e.includes('duplicate id')), errors.join('\n'));
});
