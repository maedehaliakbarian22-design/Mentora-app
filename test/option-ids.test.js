import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import { evaluateAnswer } from '../www/js/domain/evaluate.js';

test('every question has unique optionIds of the same length as options', () => {
  for (const c of CATALOG.chapters) for (const s of c.sections) for (const q of s.questions) {
    assert.equal(q.optionIds.length, q.options.length, q.id);
    assert.equal(new Set(q.optionIds).size, q.optionIds.length, q.id);
    assert.ok(q.correctIndex >= 0 && q.correctIndex < q.options.length, q.id);
  }
});

test('option ids are stable when options are reordered together with their ids', () => {
  const original = {
    id: 'q', status: 'demo', prompt: 'p', options: ['4', '5', '6'], optionIds: ['o-4', 'o-5', 'o-6'], correctIndex: 1,
  };
  // Same question, options moved. Each id still goes with its text, and the
  // correct option is still '5', which is now at index 2.
  const reordered = {
    ...original, options: ['4', '6', '5'], optionIds: ['o-4', 'o-6', 'o-5'], correctIndex: 2,
  };
  const a = original.optionIds.indexOf('o-5');
  const b = reordered.optionIds.indexOf('o-5');
  assert.notEqual(a, b, 'the index changes after reordering');
  assert.equal(original.options[a], reordered.options[b], 'but the same option text is selected');
  assert.equal(evaluateAnswer(original, a).correct, evaluateAnswer(reordered, b).correct);
});

test('indexCatalog keeps optionIds on indexed questions', () => {
  const idx = indexCatalog(CATALOG);
  assert.deepEqual(idx.questions.get('demo-q1').optionIds, ['o-4', 'o-5', 'o-6']);
});
