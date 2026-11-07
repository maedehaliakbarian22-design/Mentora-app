import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNavigator, ROUTES } from '../www/js/core/navigation.js';

test('starts at the dashboard by default and cannot go back from the root', () => {
  const nav = createNavigator();
  assert.equal(nav.current().name, ROUTES.DASHBOARD);
  assert.equal(nav.canGoBack(), false);
  assert.equal(nav.back(), false);
  assert.equal(nav.current().name, ROUTES.DASHBOARD);
});

test('push then back returns to the previous route in order', () => {
  const nav = createNavigator();
  nav.push({ name: ROUTES.SUBJECT, subjectId: 'chemistry' });
  nav.push({ name: ROUTES.CHAPTER, chapterId: 'chapter-1' });
  assert.equal(nav.depth(), 3);
  assert.equal(nav.back(), true);
  assert.equal(nav.current().name, ROUTES.SUBJECT);
  assert.equal(nav.back(), true);
  assert.equal(nav.current().name, ROUTES.DASHBOARD);
  assert.equal(nav.back(), false);
});

test('replace swaps the top route without changing depth', () => {
  const nav = createNavigator();
  nav.push({ name: ROUTES.PRACTICE, sectionId: 's', index: 0 });
  nav.replace({ name: ROUTES.PRACTICE, sectionId: 's', index: 1 });
  assert.equal(nav.depth(), 2);
  assert.equal(nav.current().index, 1);
});

test('reset collapses the stack to one route', () => {
  const nav = createNavigator();
  nav.push({ name: ROUTES.SUBJECT, subjectId: 'chemistry' });
  nav.reset({ name: ROUTES.DASHBOARD });
  assert.equal(nav.depth(), 1);
  assert.equal(nav.canGoBack(), false);
});

test('rejects unknown routes and returned routes are immutable', () => {
  const nav = createNavigator();
  assert.throws(() => nav.push({ name: 'nope' }), TypeError);
  assert.throws(() => nav.push(null), TypeError);
  const route = nav.push({ name: ROUTES.SUBJECT, subjectId: 'chemistry' });
  assert.throws(() => { route.name = 'dashboard'; }, TypeError);
});
