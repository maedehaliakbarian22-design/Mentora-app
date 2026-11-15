import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAttemptLog, ATTEMPT_LOG_SCHEMA } from '../www/js/attempts/attempt-log.js';

function makeIndex() {
  return {
    questions: new Map([
      ['q1', { sectionId: 's1', optionIds: ['a', 'b', 'c'], correctIndex: 0 }],
    ]),
  };
}

function makeRecord(overrides = {}) {
  return {
    schemaVersion: ATTEMPT_LOG_SCHEMA,
    attemptId: 'att-1',
    sessionId: 'sess-1',
    sequenceInSession: 1,
    sectionId: 's1',
    questionId: 'q1',
    selectedOptionId: 'a',
    isCorrect: true,
    timestampLocal: null,
    mode: null,
    contentVersion: null,
    ...overrides,
  };
}

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}

describe('attempt-log load guard', () => {
  it('rejects append before load', () => {
    const log = createAttemptLog(memoryStorage(), makeIndex());
    const result = log.append(makeRecord());
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not-loaded');
  });

  it('rejects importRecords before load', () => {
    const log = createAttemptLog(memoryStorage(), makeIndex());
    const result = log.importRecords([makeRecord()]);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not-loaded');
  });

  it('allows append after successful load', () => {
    const log = createAttemptLog(memoryStorage(), makeIndex());
    log.load();
    const result = log.append(makeRecord());
    assert.equal(result.ok, true);
    assert.equal(result.added, 1);
    assert.equal(log.records().length, 1);
  });

  it('preserves previous records on later append', () => {
    const storage = memoryStorage();
    const log1 = createAttemptLog(storage, makeIndex());
    log1.load();
    log1.append(makeRecord({ attemptId: 'att-1' }));

    const log2 = createAttemptLog(storage, makeIndex());
    log2.load();
    log2.append(makeRecord({ attemptId: 'att-2', sequenceInSession: 2 }));

    assert.equal(log2.records().length, 2);
    assert.deepEqual(
      log2.records().map((r) => r.attemptId),
      ['att-1', 'att-2']
    );
  });

  it('marks not-loaded again if load throws on getItem', () => {
    const storage = {
      getItem() {
        throw new Error('storage failure');
      },
      setItem() {},
    };
    const log = createAttemptLog(storage, makeIndex());
    log.load(); // becomes unavailable + not loaded
    const result = log.append(makeRecord());
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not-loaded');
  });

  it('does not lose data when append is attempted before load', () => {
    const existing = JSON.stringify({
      schemaVersion: ATTEMPT_LOG_SCHEMA,
      records: [makeRecord({ attemptId: 'old-1' })],
    });
    const storage = memoryStorage({ 'mentora.attempts.v1': existing });

    const log = createAttemptLog(storage, makeIndex());
    // no load yet
    const blocked = log.append(makeRecord({ attemptId: 'new-1' }));
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'not-loaded');

    // after proper load, old data is still there
    log.load();
    assert.equal(log.records().length, 1);
    assert.equal(log.records()[0].attemptId, 'old-1');
  });
});
