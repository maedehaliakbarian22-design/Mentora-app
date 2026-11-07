import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import * as view from '../www/js/ui/render.js';

const idx = indexCatalog(CATALOG);

test('toFa converts digits and esc escapes markup', () => {
  assert.equal(view.toFa('12 of 3'), '۱۲ of ۳');
  assert.equal(view.esc('<b>"x"&\'</b>'), '&lt;b&gt;&quot;x&quot;&amp;&#39;&lt;/b&gt;');
});

test('practice view never reveals a correct answer before the learner answers', () => {
  const section = idx.sections.get('chapter-1-section-1');
  const html = view.renderPractice({
    section, question: section.questions[0], index: 0, total: 3, answer: null, isLast: false,
  });
  assert.equal(html.includes('is-correct'), false);
  assert.equal(html.includes('پاسخ درست'), false);
  assert.ok(html.includes('data-action="next" disabled'));
});

test('practice feedback reveals the correct answer only after answering', () => {
  const section = idx.sections.get('chapter-1-section-1');
  const html = view.renderPractice({
    section, question: section.questions[0], index: 0, total: 3,
    answer: { selectedIndex: 0, correct: false }, isLast: false,
  });
  assert.ok(html.includes('is-wrong'));
  assert.ok(html.includes('is-correct'));
  assert.ok(html.includes('پاسخ درست'));
});

test('demo questions are labelled as demo on every practice screen', () => {
  const section = idx.sections.get('chapter-1-section-1');
  const html = view.renderPractice({
    section, question: section.questions[0], index: 0, total: 3, answer: null, isLast: false,
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
