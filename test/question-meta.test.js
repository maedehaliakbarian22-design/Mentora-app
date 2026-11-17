import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readQuestionMeta, QUESTION_KIND, QUESTION_DIFFICULTY } from '../www/js/content/question-meta.js';
import { chooseNextStep, NEXT_REASON } from '../www/js/domain/next-step.js';
import { CATALOG } from '../www/js/content/catalog.js';

test('old questions without kind or difficulty read as null', () => {
  assert.deepEqual(readQuestionMeta({ id: 'old-1' }), { kind: null, difficulty: null });
});

test('null, undefined and non-object input never throw', () => {
  assert.deepEqual(readQuestionMeta(null), { kind: null, difficulty: null });
  assert.deepEqual(readQuestionMeta(undefined), { kind: null, difficulty: null });
  assert.deepEqual(readQuestionMeta('x'), { kind: null, difficulty: null });
});

test('partial and invalid labels are ignored, valid ones are kept', () => {
  assert.deepEqual(readQuestionMeta({ kind: 'concept' }), { kind: 'concept', difficulty: null });
  assert.deepEqual(readQuestionMeta({ kind: 'Concept', difficulty: 'extreme' }), { kind: null, difficulty: null });
  assert.ok(QUESTION_KIND.includes('concept'));
  assert.ok(QUESTION_DIFFICULTY.includes('hard'));
});

test('catalog demo questions carry no invented metadata', () => {
  for (const chapter of CATALOG.chapters) {
    for (const section of chapter.sections) {
      for (const q of section.questions) {
        assert.deepEqual(readQuestionMeta(q), { kind: null, difficulty: null });
      }
    }
  }
});

test('weak state with no tagged questions uses catalog order and fallback true', () => {
  const r = chooseNextStep({
    mastery: { state: 'weak' },
    questions: [{ id: 'a' }, { id: 'b' }],
    answeredIds: [],
  });
  assert.equal(r.questionId, 'a');
  assert.equal(r.reasonCode, NEXT_REASON.CONCEPT_FOCUS);
  assert.equal(r.fallback, true);
});

test('tagged concept and hard questions are chosen when present', () => {
  const weak = chooseNextStep({
    mastery: { state: 'weak' },
    questions: [{ id: 'a' }, { id: 'b', kind: 'concept' }],
    answeredIds: [],
  });
  assert.equal(weak.questionId, 'b');
  assert.equal(weak.fallback, false);

  const solid = chooseNextStep({
    mastery: { state: 'solid' },
    questions: [{ id: 'a' }, { id: 'b', difficulty: 'hard' }],
    answeredIds: [],
  });
  assert.equal(solid.questionId, 'b');
  assert.equal(solid.reasonCode, NEXT_REASON.CHALLENGE);
  assert.equal(solid.fallback, false);
});
