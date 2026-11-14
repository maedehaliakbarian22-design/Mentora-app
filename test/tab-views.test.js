import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHome, renderProfile } from '../www/js/ui/tab-views.js';

// Visible text only: tags (and their attributes, such as the bar width) removed.
const visibleText = (html) => html.replace(/<[^>]*>/g, ' ');
const visibleCount = (html, label) => {
  const row = html.split(label)[1];
  const match = row && row.match(/<dd class="mv-big">([^<]+)<\/dd>/);
  return match ? match[1] : null;
};

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

test('Profile shows exact logged and unlogged counts', () => {
  const base = {
    answered: 12, total: 18, percent: 67, attempts: 4, correct: 3,
    accuracyPercent: 75, sessions: 2, loggedAnswered: 9, unloggedAnswered: 3,
  };
  const html = renderProfile({ selectionLabel: 'x', stats: base });
  assert.equal(visibleCount(html, 'پاسخ‌های دارای سابقه'), '۹');
  assert.equal(visibleCount(html, 'پاسخ‌های ثبت‌نشده'), '۳');
});

test('Profile hides both recording rows for legacy stats without recording counts', () => {
  const html = renderProfile({
    selectionLabel: 'x',
    stats: {
      answered: 2, total: 8, percent: 25, attempts: 1, correct: 1,
      accuracyPercent: 100, sessions: 1,
    },
  });
  assert.equal(html.includes('پاسخ‌های دارای سابقه'), false);
  assert.equal(html.includes('پاسخ‌های ثبت‌نشده'), false);
});

test('Profile hides the unlogged row when its count is zero', () => {
  const html = renderProfile({
    selectionLabel: 'x',
    stats: {
      answered: 2, total: 8, percent: 25, attempts: 2, correct: 2,
      accuracyPercent: 100, sessions: 1, loggedAnswered: 2, unloggedAnswered: 0,
    },
  });
  assert.equal(html.includes('پاسخ‌های دارای سابقه'), true);
  assert.equal(html.includes('پاسخ‌های ثبت‌نشده'), false);
});

test('Profile with zero of zero hides the unlogged row', () => {
  const html = renderProfile({
    selectionLabel: 'x',
    stats: {
      ...NONE, attempts: 0, correct: 0, accuracyPercent: null, sessions: 0,
      loggedAnswered: 0, unloggedAnswered: 0,
    },
  });
  assert.equal(html.includes('پاسخ‌های ثبت‌نشده'), false);
});
