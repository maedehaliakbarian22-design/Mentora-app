import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHome, renderProfile } from '../www/js/ui/tab-views.js';

// Visible text only: tags (and their attributes, such as the bar width) removed.
const visibleText = (html) => html.replace(/<[^>]*>/g, ' ');

const NONE = { answered: 0, total: 0, percent: null };

test('Home with no questions shows a message, never 0 percent', () => {
  const html = renderHome({ selectionLabel: 'x', overall: NONE, target: null });
  assert.equal(html.includes('۰٪'), false);
  assert.ok(html.includes('هنوز تمرینی برای این انتخاب آماده نشده است.'));
});

test('Home shows Persian digits only, and 13 percent for 1 of 8', () => {
  const html = renderHome({
    selectionLabel: 'x', overall: { answered: 1, total: 8, percent: 13 }, target: null,
  });
  assert.ok(html.includes('۱ از ۸'));
  assert.ok(html.includes('۱۳٪'));
  assert.equal(/[0-9]/.test(visibleText(html)), false);
});

test('Profile with no questions and no attempts shows messages, never 0 percent', () => {
  const html = renderProfile({
    selectionLabel: 'x',
    stats: { ...NONE, attempts: 0, correct: 0, accuracyPercent: null, sessions: 0 },
  });
  assert.equal(html.includes('۰٪'), false);
  assert.ok(html.includes('هنوز پاسخی ثبت نشده است'));
  assert.ok(html.includes('هنوز تمرینی برای این انتخاب آماده نشده است.'));
});

test('Profile shows Persian digits only, and 13 percent progress for 1 of 8', () => {
  const html = renderProfile({
    selectionLabel: 'x',
    stats: {
      answered: 1, total: 8, percent: 13, attempts: 1, correct: 1, accuracyPercent: 100, sessions: 1,
    },
  });
  assert.ok(html.includes('۱۳٪'));
  assert.ok(html.includes('۱۰۰٪'));
  assert.equal(/[0-9]/.test(visibleText(html)), false);
});
