// Study streak: consecutive local study days.
//
// A study day is a calendar day (Asia/Tehran) with at least one proven
// section completion (awards of type section_complete). Attempts alone do not
// count. Product decisions (Nov 2026):
// - day boundary: midnight in Asia/Tehran;
// - a guard day can bridge ONE missed day inside a streak, and at most one
//   guard may be used in any 7-day window;
// - a guard keeps the streak alive but does not add to its count;
// - a guard only bridges a gap between two study days, never at the start or
//   at the end of the streak.
// Pure functions: the caller supplies today as a day key.

export const STUDY_TIME_ZONE = 'Asia/Tehran';
export const GUARD_WINDOW_DAYS = 7;

const DAY_MS = 86400000;
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: STUDY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// 'YYYY-MM-DD' for an instant, in the study time zone.
export function dayKey(date) {
  return dayFormat.format(date);
}

function keyToUtc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function shiftKey(key, days) {
  const d = new Date(keyToUtc(key) + days * DAY_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

// Study days from stored awards. Invalid or non-section entries are ignored.
export function studyDaysFromAwards(awards) {
  const days = new Set();
  if (!awards || typeof awards !== 'object') return days;
  for (const a of Object.values(awards)) {
    if (!a || a.type !== 'section_complete' || typeof a.at !== 'string') continue;
    const when = new Date(a.at);
    if (Number.isNaN(when.getTime())) continue;
    days.add(dayKey(when));
  }
  return days;
}

// activeDays: Set of 'YYYY-MM-DD' study days. today: 'YYYY-MM-DD'.
// Returns { current, guardDays } where guardDays lists the bridged days.
export function computeStreak(activeDays, today) {
  if (!activeDays || activeDays.size === 0) return { current: 0, guardDays: [] };

  const earliest = [...activeDays].sort()[0];
  // Today is not over yet: if it has no study day, the streak is still
  // counted from yesterday.
  let cursor = activeDays.has(today) ? today : shiftKey(today, -1);

  let current = 0;
  let lastGuardWalk = null; // most recent guard seen while walking backwards
  const guardDays = [];

  while (cursor >= earliest) {
    if (activeDays.has(cursor)) {
      current += 1;
    } else {
      // A guard bridges exactly one missed day: there must already be a study
      // day after it in this walk (current > 0), a study day right before it,
      // and guards must be a full window apart.
      const bridgesOneDay = activeDays.has(shiftKey(cursor, -1));
      const farEnough = lastGuardWalk === null
        || keyToUtc(lastGuardWalk) - keyToUtc(cursor) >= GUARD_WINDOW_DAYS * DAY_MS;
      if (current === 0 || !bridgesOneDay || !farEnough) break;
      lastGuardWalk = cursor;
      guardDays.push(cursor);
    }
    cursor = shiftKey(cursor, -1);
  }

  return { current, guardDays: guardDays.reverse() };
}
