import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import * as view from '../www/js/ui/render.js';

const idx = indexCatalog(CATALOG);
const NOTICE = '«توضیح تأییدشدهٔ این پرسش هنوز در دسترس نیست.»';

test('toFa converts digits and esc escapes markup', () => {
  assert.equal(view.toFa('12 of 3'), '۱۲ of ۳');
  assert.equal(view.esc('<b>"x"&\'</b>'), '&lt;b&gt;&quot;x&quot;&amp;&#39;&lt;/b&gt;');
});

test('practice view never reveals a correct answer before the learner checks', () => {
  const section = idx.sections.get('chapter-1-section-1');
  const html = view.renderPractice({
    section, question: section.questions[0], index: 0, total: 3, answer: null, pending: null, isLast: false,
  });
  assert.equal(html.includes('is-correct'), false);
  assert.equal(html.includes('پاسخ درست'), false);
  assert.equal(html.includes('is-selected'), false);
});

test('Check is disabled and Continue is absent when nothing is selected', () => {
  const section = idx.sections.get('chapter-1-section-1');
  const html = view.renderPractice({
    section, question: section.questions[0], index: 0, total: 3, answer: null, pending: null, isLast: false,
  });
  assert.ok(html.includes('data-action="check" disabled'));
  assert.equal(html.includes('data-action="continue"'), false);
});

test('selecting an option enables Check without showing correctness', () => {
  const section = idx.sections.get('chapter-1-section-1');
  const html = view.renderPractice({
    section, question: section.questions[0], index: 0, total: 3, answer: null, pending: 0, isLast: false,
  });
  assert.equal(html.includes('data-action="check" disabled'), false);
  assert.ok(html.includes('data-action="check"'));
  assert.ok(html.includes('is-selected'));
  assert.equal(html.includes('is-correct'), false);
  assert.equal(html.includes('is-wrong'), false);
  assert.equal(html.includes('mv-feedback-panel'), false);
});

test('choices are select actions and stay enabled before Check', () => {
  const section = idx.sections.get('chapter-1-section-1');
  const html = view.renderPractice({
    section, question: section.questions[0], index: 0, total: 3, answer: null, pending: 1, isLast: false,
  });
  assert.equal((html.match(/data-action="select"/g) || []).length, 3);
  assert.equal(html.includes('data-action="choose"'), false);
  assert.equal(html.includes(' disabled>'), false);
});

test('correct checked answer shows the positive panel and Continue, and locks choices', () => {
  const section = idx.sections.get('chapter-1-section-1');
  const html = view.renderPractice({
    section, question: section.questions[0], index: 0, total: 3,
    answer: { selectedIndex: 1, correct: true }, pending: null, isLast: false,
  });
  assert.ok(html.includes('mv-feedback-panel is-correct'));
  assert.ok(html.includes('✓ درست است.'));
  assert.ok(html.includes('data-action="continue"'));
  assert.equal(html.includes('data-action="check"'), false);
  assert.equal(html.includes('is-wrong'), false);
  assert.equal((html.match(/data-action="select"[^>]*disabled/g) || []).length, 3);
});

test('incorrect checked answer marks both choices and shows the correct answer', () => {
  const section = idx.sections.get('chapter-1-section-1');
  const html = view.renderPractice({
    section, question: section.questions[0], index: 0, total: 3,
    answer: { selectedIndex: 0, correct: false }, pending: null, isLast: false,
  });
  assert.ok(html.includes('mv-feedback-panel is-incorrect'));
  assert.ok(html.includes('✗ نادرست است. پاسخ درست: ۵'));
  assert.ok(html.includes('is-wrong'));
  assert.ok(html.includes('is-correct'));
  assert.ok(html.includes('data-action="continue"'));
});

test('correct and incorrect feedback both show the unavailable-explanation notice, with no explanation text', () => {
  const section = idx.sections.get('chapter-1-section-1');
  const correct = view.renderPractice({
    section, question: section.questions[0], index: 0, total: 3,
    answer: { selectedIndex: 1, correct: true }, pending: null, isLast: false,
  });
  const incorrect = view.renderPractice({
    section, question: section.questions[0], index: 0, total: 3,
    answer: { selectedIndex: 0, correct: false }, pending: null, isLast: false,
  });
  assert.ok(correct.includes(NOTICE));
  assert.ok(incorrect.includes(NOTICE));
});

test('the last question uses the result label on Continue', () => {
  const section = idx.sections.get('chapter-1-section-1');
  const html = view.renderPractice({
    section, question: section.questions[2], index: 2, total: 3,
    answer: { selectedIndex: 1, correct: true }, pending: null, isLast: true,
  });
  assert.ok(html.includes('مشاهدهٔ نتیجه'));
});

test('demo questions are labelled as demo on every practice screen', () => {
  const section = idx.sections.get('chapter-1-section-1');
  const html = view.renderPractice({
    section, question: section.questions[0], index: 0, total: 3, answer: null, pending: null, isLast: false,
  });
  assert.ok(html.includes('نمونه آزمایشی'));
});

test('section with no questions shows the not-yet-available note, not a practice button', () => {
  const section = idx.sections.get('chapter-1-section-2');
  const html = view.renderSection({ section, total: 0, answered: 0, hasDemo: false });
  assert.equal(html.includes('start-practice'), false);
  assert.ok(html.includes('پس از ورود محتوای تأییدشده'));
});

test('user-visible output never names Learning State or its internal values', () => {
  const sec = idx.sections.get('chapter-1-section-1');
  const pieces = [
    view.renderSection({ section: sec, total: 3, answered: 1, hasDemo: true }),
    view.renderResult({ section: sec, result: { correct: 1, total: 3, percent: 33 }, hasDemo: true }),
    view.renderDashboard({ selectionLabel: 'x', subjects: [] }),
    view.renderPractice({
      section: sec, question: sec.questions[0], index: 0, total: 3,
      answer: { selectedIndex: 0, correct: false }, pending: null, isLast: false,
    }),
  ].join('\n');
  for (const forbidden of ['not_learned', 'unstable', 'Learning State', 'weak_transfer', 'stable']) {
    assert.equal(pieces.includes(forbidden), false, forbidden);
  }
});

test('every interpolated title is escaped in the chapter list', () => {
  const html = view.renderChapter({
    chapter: { id: 'c', title: '<img src=x>' },
    sections: [{ id: 's', title: '"<script>"', placeholder: true, answered: 0, total: 0, hasDemo: false }],
  });
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('<script>'), false);
});
