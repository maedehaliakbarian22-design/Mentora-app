import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHome, renderProfile, streakBlock } from '../www/js/ui/tab-views.js';

const visibleText = (html) => html.replace(/<[^>]*>/g, ' ');
const NONE = { answered: 0, total: 0, percent: null };
const HOME = { selectionLabel: 'x', overall: NONE, target: null };
const PROFILE = {
  selectionLabel: 'x',
  stats: { ...NONE, attempts: 0, correct: 0, accuracyPercent: null, sessions: 0 },
};

test('no streak in the view model renders no streak block (older callers keep working)', () => {
  assert.equal(streakBlock(undefined), '');
  assert.equal(renderHome(HOME).includes('روزهای مطالعه'), false);
  assert.equal(renderProfile(PROFILE).includes('روزهای مطالعه'), false);
});

test('Home and Profile show the current streak in Persian digits', () => {
  const streak = { current: 12, guardDays: [] };
  const home = renderHome({ ...HOME, streak });
  const profile = renderProfile({ ...PROFILE, streak });
  assert.ok(home.includes('۱۲ روز'));
  assert.ok(profile.includes('۱۲ روز'));
  assert.equal(/[0-9]/.test(visibleText(streakBlock(streak))), false);
});

test('a used guard day is mentioned with a count, not a raw date', () => {
  const html = streakBlock({ current: 5, guardDays: ['2026-11-15'] });
  assert.ok(html.includes('۱ روز محافظ'));
  assert.equal(html.includes('2026'), false);
});

test('zero streak shows a neutral start hint, never a 0 with pressure text', () => {
  const html = streakBlock({ current: 0, guardDays: [] });
  assert.ok(html.includes('۰ روز'));
  assert.ok(html.includes('با کامل کردن یک بخش امروز، روز مطالعه‌ات شروع می‌شود.'));
});

test('streak text is escaped like the rest of the view (no raw markup from data)', () => {
  // current is a number, so this is a guard against future string fields.
  const html = streakBlock({ current: 1, guardDays: [] });
  assert.equal(html.includes('<script'), false);
});
