import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT, DEMO_LABEL } from '../www/js/data/demo-content.js';
import { validateContent } from '../www/js/domain/content-validate.js';

const clone = () => JSON.parse(JSON.stringify(CONTENT));

test('shipped demo content passes structural validation', () => {
  assert.deepEqual(validateContent(CONTENT), []);
});

test('the whole content set is marked demo', () => {
  assert.equal(CONTENT.demo, true);
  for (const q of CONTENT.questions) assert.equal(q.demo, true, q.id);
  for (const l of CONTENT.lessons) assert.equal(l.demo, true, l.id);
});

test('lesson body is explicitly not verified textbook content', () => {
  for (const l of CONTENT.lessons) assert.equal(l.bodyVerified, false, l.id);
});

test('the only verified item is the chapter title «کیهان، زادگاه عناصر»', () => {
  assert.equal(CONTENT.chapter.title, 'کیهان، زادگاه عناصر');
  assert.equal(CONTENT.chapter.titleVerified, true);
});

test('demo label constant is the Persian demo marker', () => {
  assert.equal(DEMO_LABEL, 'نمونه آزمایشی');
});

test('every question prompt is labelled as a sample', () => {
  for (const q of CONTENT.questions) {
    assert.ok(q.prompt.startsWith('نمونه:'), q.id);
  }
});

test('validation catches a missing demo flag', () => {
  const c = clone();
  c.questions[0].demo = false;
  assert.ok(validateContent(c).some((e) => e.includes('must be demo')));
});

test('validation catches an out-of-range correctIndex', () => {
  const c = clone();
  c.questions[0].correctIndex = 9;
  assert.ok(validateContent(c).some((e) => e.includes('invalid correctIndex')));
});

test('validation catches duplicate options and duplicate ids', () => {
  const c = clone();
  c.questions[0].options = ['4', '4', '6'];
  c.questions[1].id = c.questions[0].id;
  const errors = validateContent(c);
  assert.ok(errors.some((e) => e.includes('duplicate options')));
  assert.ok(errors.some((e) => e.includes('duplicate question id')));
});

test('validation catches a question pointing at an unknown lesson', () => {
  const c = clone();
  c.questions[0].lessonId = 'missing';
  assert.ok(validateContent(c).some((e) => e.includes('unknown lesson')));
});

test('validation rejects non-object content', () => {
  assert.deepEqual(validateContent(null), ['content must be an object']);
});
