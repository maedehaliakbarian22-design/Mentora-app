import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import {
  AUTO_ADVANCE_MS, newPracticeUi, selectOption, canCheck, checkAnswer,
  autoAdvancePlan, requestAdvance, cancelAutoAdvance,
} from '../www/js/domain/practice-flow.js';

const idx = indexCatalog(CATALOG);
const question = idx.questions.get('demo-q1'); // options 4 / 5 / 6, correctIndex 1
const OPTIONS = question.options.length;

test('auto-advance delay is 1200 ms', () => {
  assert.equal(AUTO_ADVANCE_MS, 1200);
});

test('initial state has no selection, is unchecked, and cannot be checked', () => {
  const ui = newPracticeUi('chapter-1-section-1:0');
  assert.equal(ui.pending, null);
  assert.equal(ui.checked, false);
  assert.equal(canCheck(ui, false), false);
});

test('selecting an option only sets the pending choice and creates no outcome', () => {
  const ui = selectOption(newPracticeUi('k'), false, 0, OPTIONS);
  assert.equal(ui.pending, 0);
  assert.equal(ui.checked, false);
  assert.equal('outcome' in ui, false);
  assert.equal(canCheck(ui, false), true);
});

test('changing the selection before Check replaces the pending choice', () => {
  let ui = selectOption(newPracticeUi('k'), false, 0, OPTIONS);
  ui = selectOption(ui, false, 2, OPTIONS);
  assert.equal(ui.pending, 2);
});

test('an out-of-range selection is ignored', () => {
  const ui = selectOption(newPracticeUi('k'), false, 7, OPTIONS);
  assert.equal(ui.pending, null);
});

test('Check with no selection is a no-op and records nothing', () => {
  const { ui, outcome } = checkAnswer(newPracticeUi('k'), false, question);
  assert.equal(outcome, null);
  assert.equal(ui.checked, false);
});

test('Check evaluates the currently pending choice, not an earlier one', () => {
  let ui = selectOption(newPracticeUi('k'), false, 0, OPTIONS); // wrong
  ui = selectOption(ui, false, 1, OPTIONS); // correct
  const { outcome } = checkAnswer(ui, false, question);
  assert.deepEqual(outcome, { selectedIndex: 1, correct: true });
});

test('incorrect Check yields an incorrect outcome and no auto-advance', () => {
  const ui = selectOption(newPracticeUi('k'), false, 0, OPTIONS);
  const { outcome } = checkAnswer(ui, false, question);
  assert.deepEqual(outcome, { selectedIndex: 0, correct: false });
  assert.deepEqual(autoAdvancePlan(outcome), { scheduleMs: null });
});

test('correct Check schedules automatic advance after 1200 ms', () => {
  const ui = selectOption(newPracticeUi('k'), false, 1, OPTIONS);
  const { outcome } = checkAnswer(ui, false, question);
  assert.equal(outcome.correct, true);
  assert.deepEqual(autoAdvancePlan(outcome), { scheduleMs: 1200 });
});

test('a second Check on the same question does not evaluate or record again', () => {
  const first = checkAnswer(selectOption(newPracticeUi('k'), false, 1, OPTIONS), false, question);
  const second = checkAnswer(first.ui, false, question);
  assert.equal(first.outcome.correct, true);
  assert.equal(second.outcome, null);
});

test('Check is a no-op once the answer is locked in progress', () => {
  const ui = selectOption(newPracticeUi('k'), false, 1, OPTIONS);
  const { outcome } = checkAnswer(ui, true, question);
  assert.equal(outcome, null);
});

test('selecting after Check is ignored', () => {
  const { ui } = checkAnswer(selectOption(newPracticeUi('k'), false, 1, OPTIONS), false, question);
  const after = selectOption(ui, false, 2, OPTIONS);
  assert.equal(after.pending, 1);
  assert.equal(canCheck(after, false), false);
});

test('Continue advances a locked question exactly once', () => {
  const { ui } = checkAnswer(selectOption(newPracticeUi('k'), false, 0, OPTIONS), false, question);
  const first = requestAdvance(ui, true, 'continue');
  const second = requestAdvance(first.ui, true, 'continue');
  assert.equal(first.advance, true);
  assert.equal(second.advance, false);
});

test('Continue is refused before the answer is locked', () => {
  const r = requestAdvance(newPracticeUi('k'), false, 'continue');
  assert.equal(r.advance, false);
});

test('a timer firing after Continue has no effect', () => {
  const { ui } = checkAnswer(selectOption(newPracticeUi('k'), false, 1, OPTIONS), false, question);
  const continued = requestAdvance(ui, true, 'continue');
  const timer = requestAdvance(continued.ui, true, 'timer');
  assert.equal(timer.advance, false);
});

test('a timer cancelled by Back or background does not advance', () => {
  const { ui } = checkAnswer(selectOption(newPracticeUi('k'), false, 1, OPTIONS), false, question);
  const cancelled = cancelAutoAdvance(ui);
  assert.equal(requestAdvance(cancelled, true, 'timer').advance, false);
});

test('after a cancelled timer, Continue still advances the learner', () => {
  const { ui } = checkAnswer(selectOption(newPracticeUi('k'), false, 1, OPTIONS), false, question);
  const cancelled = cancelAutoAdvance(ui);
  assert.equal(requestAdvance(cancelled, true, 'continue').advance, true);
});

test('cancelAutoAdvance is idempotent and does not change the lock or pending choice', () => {
  const { ui } = checkAnswer(selectOption(newPracticeUi('k'), false, 1, OPTIONS), false, question);
  const once = cancelAutoAdvance(ui);
  const twice = cancelAutoAdvance(once);
  assert.equal(twice.autoAdvanceCancelled, true);
  assert.equal(twice.checked, true);
  assert.equal(twice.pending, 1);
});

test('a fresh question key starts with no carried-over state', () => {
  const a = newPracticeUi('chapter-1-section-1:0');
  const b = newPracticeUi('chapter-1-section-1:1');
  assert.notEqual(a.key, b.key);
  assert.equal(b.pending, null);
  assert.equal(b.checked, false);
  assert.equal(b.advanced, false);
});
