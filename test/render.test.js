import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import * as view from '../www/js/ui/render.js';

const idx = indexCatalog(CATALOG);
const NOTICE = '«توضیح تأییدشدهٔ این پرسش هنوز در دسترس نیست.»';

// Visible text only: tags (including attributes) removed.
const visibleText = (html) => html.replace(/<[^>]*>/g, ' ');

const sec = () => idx.sections.get('chapter-1-section-1');

const wrongItem = {
  questionId: 'q-w', prompt: 'سؤال نمونه', selectedIndex: 0,
  selectedText: 'گزینهٔ الف', correctIndex: 1, correctText: 'گزینهٔ ب',
};
const rightItem = {
  questionId: 'q-r', prompt: 'سؤال درست', selectedIndex: 1,
  selectedText: 'گزینهٔ ب', correctIndex: 1, correctText: 'گزینهٔ ب',
};

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
  const s = sec();
  const pieces = [
    view.renderSection({ section: s, total: 3, answered: 1, hasDemo: true }),
    view.renderResult({
      section: s,
      session: { correct: [rightItem], incorrect: [wrongItem], total: 2, percent: 50 },
      hasDemo: true,
    }),
    view.renderDashboard({ selectionLabel: 'x', subjects: [] }),
    view.renderPractice({
      section: s, question: s.questions[0], index: 0, total: 3,
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

test('result lists an incorrect answer with the question, the selected answer and the correct answer', () => {
  const html = view.renderResult({
    section: sec(),
    session: { correct: [], incorrect: [wrongItem], total: 1, percent: 0 },
    hasDemo: false,
  });
  assert.ok(html.includes('سؤال نمونه'));
  assert.ok(html.includes('پاسخ شما: گزینهٔ الف'));
  assert.ok(html.includes('پاسخ درست: گزینهٔ ب'));
});

test('correct list shows the selected answer but never a separate correct-answer line', () => {
  const html = view.renderResult({
    section: sec(),
    session: { correct: [rightItem], incorrect: [], total: 1, percent: 100 },
    hasDemo: false,
  });
  assert.ok(html.includes('سؤال درست'));
  assert.ok(html.includes('پاسخ شما: گزینهٔ ب'));
  assert.equal(html.includes('پاسخ درست: '), false);
});

test('empty states are independent: no wrong answers still shows the correct list', () => {
  const html = view.renderResult({
    section: sec(),
    session: { correct: [rightItem], incorrect: [], total: 1, percent: 100 },
    hasDemo: false,
  });
  assert.ok(html.includes('هیچ پاسخ نادرستی در این جلسه ثبت نشده است.'));
  assert.equal(html.includes('هیچ پاسخ درستی'), false);
});

test('empty states are independent: no right answers still shows the incorrect list', () => {
  const html = view.renderResult({
    section: sec(),
    session: { correct: [], incorrect: [wrongItem], total: 1, percent: 0 },
    hasDemo: false,
  });
  assert.ok(html.includes('هیچ پاسخ درستی در این جلسه ثبت نشده است.'));
  assert.equal(html.includes('هیچ پاسخ نادرستی'), false);
});

test('0 of 0 shows a dash, the no-answers message, and both empty states', () => {
  const html = view.renderResult({
    section: sec(),
    session: { correct: [], incorrect: [], total: 0, percent: null },
    hasDemo: false,
  });
  assert.ok(html.includes('— درست'));
  assert.ok(html.includes('در این جلسه هنوز پاسخی برای این بخش ثبت نشده است.'));
  assert.ok(html.includes('هیچ پاسخ درستی'));
  assert.ok(html.includes('هیچ پاسخ نادرستی'));
  assert.ok(html.includes('۰ از ۰'));
  assert.equal(html.includes('۰٪'), false);
});

test('1 of 8 shows Persian digits and 13 percent', () => {
  const html = view.renderResult({
    section: sec(),
    session: { correct: [rightItem], incorrect: [], total: 8, percent: 13 },
    hasDemo: false,
  });
  assert.ok(html.includes('۱ از ۸'));
  assert.ok(html.includes('۱۳٪ درست'));
  assert.equal(/[0-9]/.test(visibleText(html)), false);
});

test('result never shows a Latin digit in visible text, including list counts', () => {
  const html = view.renderResult({
    section: sec(),
    session: { correct: [rightItem], incorrect: [wrongItem], total: 2, percent: 50 },
    hasDemo: false,
  });
  assert.equal(/[0-9]/.test(visibleText(html)), false);
});
