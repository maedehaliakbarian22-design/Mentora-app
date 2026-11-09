import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import { defaultProgress, recordAnswer } from '../www/js/progress/progress-store.js';
import { TABS, TAB_ROOT_ROUTE, isTab, shouldShowTabBar, resolveBack } from '../www/js/core/tabs.js';
import { createNavigator, ROUTES } from '../www/js/core/navigation.js';
import { overallProgress, continueTarget, learnerStats, scopeSections } from '../www/js/domain/learner-summary.js';
import { renderBottomNav, renderHome, renderProfile } from '../www/js/ui/tab-views.js';

const idx = indexCatalog(CATALOG);
const SELECTION = { gradeId: 'grade-10', fieldId: 'experimental' };
const Q1 = idx.questions.get('demo-q1');
const SECTION = 'chapter-1-section-1';

function withSelection(selection = SELECTION) {
  return { ...defaultProgress(), selection };
}

// ---- core/tabs.js --------------------------------------------------------

test('there are exactly three tabs: home, learn, profile', () => {
  assert.deepEqual([...TABS], ['home', 'learn', 'profile']);
  assert.equal(isTab('home'), true);
  assert.equal(isTab('leaderboard'), false);
});

test('each tab root maps to an existing route', () => {
  const routes = Object.values(ROUTES);
  for (const tab of TABS) assert.ok(routes.includes(TAB_ROOT_ROUTE[tab]), tab);
});

test('the bar is hidden on selection and practice, visible elsewhere', () => {
  assert.equal(shouldShowTabBar(ROUTES.SELECTION), false);
  assert.equal(shouldShowTabBar(ROUTES.PRACTICE), false);
  for (const r of [ROUTES.HOME, ROUTES.DASHBOARD, ROUTES.PROFILE, ROUTES.CHAPTER, ROUTES.SECTION, ROUTES.RESULT]) {
    assert.equal(shouldShowTabBar(r), true, r);
  }
});

test('back pops the active stack first', () => {
  assert.equal(resolveBack({ activeTab: 'learn', canPop: true, hasSelection: true }), 'pop');
  assert.equal(resolveBack({ activeTab: 'home', canPop: true, hasSelection: true }), 'pop');
});

test('back from a non-home tab root goes to Home', () => {
  assert.equal(resolveBack({ activeTab: 'learn', canPop: false, hasSelection: true }), 'home');
  assert.equal(resolveBack({ activeTab: 'profile', canPop: false, hasSelection: true }), 'home');
});

test('back at Home root, or with no selection, exits the app', () => {
  assert.equal(resolveBack({ activeTab: 'home', canPop: false, hasSelection: true }), 'exit');
  assert.equal(resolveBack({ activeTab: 'learn', canPop: false, hasSelection: false }), 'exit');
});

// ---- tab switching keeps each tab's stack ----------------------------------

test('switching tabs keeps each tab stack and its screen', () => {
  const navs = {
    home: createNavigator({ name: ROUTES.HOME }),
    learn: createNavigator({ name: ROUTES.DASHBOARD }),
    profile: createNavigator({ name: ROUTES.PROFILE }),
  };
  navs.learn.push({ name: ROUTES.CHAPTER });
  navs.learn.push({ name: ROUTES.SECTION });
  // Switching away and back must not touch the Learn stack.
  navs.profile.push({ name: ROUTES.DASHBOARD });
  assert.equal(navs.learn.depth(), 3);
  assert.equal(navs.learn.current().name, ROUTES.SECTION);
  assert.equal(navs.home.depth(), 1);
  assert.equal(navs.profile.depth(), 2);
});

// ---- learner-summary.js ----------------------------------------------------

test('scopeSections returns only the selected grade and field', () => {
  assert.ok(scopeSections(idx, SELECTION).length > 0);
  assert.deepEqual(scopeSections(idx, null), []);
  assert.deepEqual(scopeSections(idx, { gradeId: 'grade-10', fieldId: 'no-such-field' }), []);
});

test('overallProgress counts answered questions in scope', () => {
  const progress = withSelection();
  const before = overallProgress(progress, idx);
  assert.equal(before.answered, 0);
  assert.ok(before.total > 0);
  assert.equal(before.percent, 0);

  const after = overallProgress(recordAnswer(progress, Q1.id, Q1.correctIndex, idx), idx);
  assert.equal(after.answered, 1);
  assert.equal(after.total, before.total);
});

test('continueTarget points at the first section with unanswered questions', () => {
  const progress = withSelection();
  const target = continueTarget(progress, idx);
  assert.equal(target.sectionId, SECTION);
  assert.equal(target.answered, 0);
  assert.equal(target.hasDemo, true);
});

test('continueTarget is null when nothing is selected', () => {
  assert.equal(continueTarget(defaultProgress(), idx), null);
});

test('learnerStats: accuracy is null before any attempt, then computed', () => {
  const progress = withSelection();
  assert.equal(learnerStats(progress, idx).accuracyPercent, null);
  assert.equal(learnerStats(progress, idx).attempts, 0);
});

// ---- ui/tab-views.js -------------------------------------------------------

test('renderBottomNav returns empty markup when hidden', () => {
  assert.equal(renderBottomNav({ active: 'home', visible: false }), '');
});

test('renderBottomNav marks exactly one active tab with Persian labels', () => {
  const html = renderBottomNav({ active: 'learn', visible: true });
  assert.equal((html.match(/is-active/g) || []).length, 1);
  assert.match(html, /data-tab="learn"[^>]*is-active|is-active[^>]*data-tab="learn"/);
  assert.match(html, /خانه/);
  assert.match(html, /یادگیری/);
  assert.match(html, /پروفایل/);
  assert.equal((html.match(/data-action="switch-tab"/g) || []).length, 3);
  assert.match(html, /aria-current="page"/);
});

test('renderBottomNav has no leaderboard', () => {
  const html = renderBottomNav({ active: 'home', visible: true });
  assert.doesNotMatch(html, /leaderboard|رده‌بندی|جدول/);
});

test('renderHome shows the continue target and a switch-to-learn button', () => {
  const progress = withSelection();
  const html = renderHome({
    selectionLabel: 'x',
    overall: overallProgress(progress, idx),
    target: continueTarget(progress, idx),
  });
  assert.match(html, /data-action="start-practice"/);
  assert.match(html, /data-tab="learn"/);
  assert.match(html, /نمونه آزمایشی/);
});

test('renderProfile shows the accuracy placeholder before any attempt', () => {
  const progress = withSelection();
  const html = renderProfile({ selectionLabel: 'x', stats: learnerStats(progress, idx) });
  assert.match(html, /هنوز پاسخی ثبت نشده است/);
  assert.match(html, /data-action="change-selection"/);
});

test('tab views escape interpolated text', () => {
  const html = renderHome({
    selectionLabel: '<img src=x onerror=alert(1)>',
    overall: { answered: 0, total: 0, percent: 0 },
    target: null,
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

test('tab views never show Learning State terms', () => {
  const progress = withSelection();
  const html = renderHome({ selectionLabel: 'x', overall: overallProgress(progress, idx), target: continueTarget(progress, idx) })
    + renderProfile({ selectionLabel: 'x', stats: learnerStats(progress, idx) })
    + renderBottomNav({ active: 'home', visible: true });
  assert.doesNotMatch(html, /mastery|retention|recall|learning state/i);
});
