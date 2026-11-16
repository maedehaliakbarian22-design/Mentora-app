import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStreak,
  dayKey,
  shiftKey,
  studyDaysFromAwards,
  GUARD_WINDOW_DAYS,
} from '../www/js/domain/streak.js';

const days = (...keys) => new Set(keys);
const TODAY = '2026-11-16';

test('no study days gives a streak of 0 and no guards', () => {
  assert.deepEqual(computeStreak(days(), TODAY), { current: 0, guardDays: [] });
});

test('only today studied gives 1', () => {
  assert.deepEqual(computeStreak(days(TODAY), TODAY), { current: 1, guardDays: [] });
});

test('today and yesterday give 2', () => {
  assert.equal(computeStreak(days('2026-11-15', TODAY), TODAY).current, 2);
});

test('today not studied yet: the streak still counts from yesterday', () => {
  const r = computeStreak(days('2026-11-14', '2026-11-15'), TODAY);
  assert.deepEqual(r, { current: 2, guardDays: [] });
});

test('a missed day with no study before it does not count as a streak', () => {
  // Yesterday missed, nothing studied today: nothing to protect.
  assert.equal(computeStreak(days('2026-11-13'), TODAY).current, 0);
});

test('one missed day inside a streak is bridged by a guard, guard adds no count', () => {
  const r = computeStreak(days('2026-11-14', TODAY), TODAY);
  assert.deepEqual(r, { current: 2, guardDays: ['2026-11-15'] });
});

test('two missed days in a row cannot be bridged', () => {
  const r = computeStreak(days('2026-11-13', TODAY), TODAY);
  assert.deepEqual(r, { current: 1, guardDays: [] });
});

test('a second gap within 7 days is not bridged', () => {
  // gaps on 11-15 and 11-12: 3 days apart, only one guard allowed
  const r = computeStreak(days('2026-11-10', '2026-11-11', '2026-11-13', '2026-11-14', TODAY), TODAY);
  // counted: 11-16, 11-14, 11-13 (3); 11-12 is missed and is a second gap
  assert.equal(r.current, 3);
  assert.deepEqual(r.guardDays, ['2026-11-15']);
});

test('two gaps a full window apart are both bridged', () => {
  // guard candidates: 11-15 and 11-08 (exactly 7 days apart)
  const r = computeStreak(
    days('2026-11-05', '2026-11-06', '2026-11-07', '2026-11-09', '2026-11-10', '2026-11-11',
      '2026-11-12', '2026-11-13', '2026-11-14', TODAY),
    TODAY,
  );
  assert.equal(GUARD_WINDOW_DAYS, 7);
  assert.deepEqual(r.guardDays, ['2026-11-08', '2026-11-15']);
  assert.equal(r.current, 10);
});

test('days before the first study day never count and are never guarded', () => {
  const r = computeStreak(days('2026-11-12', TODAY), TODAY);
  assert.deepEqual(r, { current: 1, guardDays: [] });
});

test('shiftKey crosses month and year boundaries', () => {
  assert.equal(shiftKey('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftKey('2026-03-01', -1), '2026-02-28');
});

test('day boundary is Asia/Tehran midnight (UTC+3:30)', () => {
  assert.equal(dayKey(new Date('2026-11-15T20:00:00Z')), '2026-11-15'); // 23:30 Tehran
  assert.equal(dayKey(new Date('2026-11-15T21:00:00Z')), '2026-11-16'); // 00:30 Tehran
});

test('studyDaysFromAwards reads only valid section_complete timestamps', () => {
  const awards = {
    a: { type: 'section_complete', sectionId: 's1', at: '2026-11-15T20:00:00Z' },
    b: { type: 'section_complete', sectionId: 's2', at: 'not-a-date' },
    c: { type: 'other', sectionId: 's3', at: '2026-11-14T10:00:00Z' },
    d: { type: 'section_complete', sectionId: 's4' },
    e: null,
  };
  assert.deepEqual([...studyDaysFromAwards(awards)], ['2026-11-15']);
  assert.deepEqual([...studyDaysFromAwards(undefined)], []);
});
