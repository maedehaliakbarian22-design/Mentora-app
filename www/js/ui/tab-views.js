// Pure HTML renderers for the bottom navigation, Home and Profile. Like
// render.js: no DOM access, every interpolated value goes through esc(), and
// numbers go through toFa(). A null percent (0 of 0) is shown as a message,
// never as 0%.

import { esc, toFa } from './render.js';

const TAB_DEFS = Object.freeze([
  {
    id: 'home',
    label: 'خانه',
    icon: '<path d="M4 11.5 12 4.5l8 7V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z"/>',
  },
  {
    id: 'learn',
    label: 'یادگیری',
    icon: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v16H6.5A1.5 1.5 0 0 0 5 20.5z"/><path d="M5 20.5A1.5 1.5 0 0 0 6.5 22H19v-3"/>',
  },
  {
    id: 'profile',
    label: 'پروفایل',
    icon: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  },
]);

// vm: { active: 'home'|'learn'|'profile', visible: boolean }
// Returns '' when hidden so the bar is removed from the page entirely.
export function renderBottomNav(vm) {
  if (!vm.visible) return '';
  const items = TAB_DEFS.map((t) => {
    const on = t.id === vm.active;
    return `<button type="button" class="mv-tab${on ? ' is-active' : ''}" data-action="switch-tab" data-tab="${t.id}"${on ? ' aria-current="page"' : ''}>
      <span class="mv-tab__icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${t.icon}</svg></span>
      <span class="mv-tab__label">${esc(t.label)}</span>
    </button>`;
  }).join('');
  return `<nav class="mv-tabbar" aria-label="ناوبری اصلی"><div class="mv-tabbar__inner">${items}</div></nav>`;
}

const demoBadge = () => '<span class="mv-badge">نمونه آزمایشی</span>';

// Percent text for a possibly-null percent. Null means nothing is in scope yet.
function percentSentence(percent, scopeWord) {
  if (percent === null) return 'هنوز تمرینی برای این انتخاب آماده نشده است.';
  return `${esc(toFa(percent))}٪ از ${scopeWord} این انتخاب پاسخ داده شده`;
}

// vm: { selectionLabel, overall: {answered,total,percent}, target: {...}|null }
export function renderHome(vm) {
  let continueBlock;
  if (vm.target) {
    continueBlock = `<section class="mv-section"><h2>ادامه یادگیری</h2>
      <article class="mv-card">
        <span class="mv-card__title">${esc(vm.target.sectionTitle)}</span>
        <span class="mv-meta">${esc(vm.target.chapterTitle)}</span>
        <span class="mv-meta">${esc(toFa(vm.target.answered))} از ${esc(toFa(vm.target.total))} تمرین پاسخ داده شده</span>
        ${vm.target.hasDemo ? demoBadge() : ''}
        <button type="button" class="mv-primary" data-action="start-practice" data-section="${esc(vm.target.sectionId)}">ادامهٔ تمرین</button>
      </article></section>`;
  } else if (vm.overall.total === 0) {
    continueBlock = '<section class="mv-section"><h2>ادامه یادگیری</h2><p class="mv-note">تمرین این انتخاب هنوز آماده نشده است.</p></section>';
  } else {
    continueBlock = '<section class="mv-section"><h2>ادامه یادگیری</h2><p class="mv-note">همهٔ تمرین‌های این انتخاب را انجام داده‌اید.</p></section>';
  }

  const pct = vm.overall.percent;
  return `<header class="mv-hero">
      <p class="mv-kicker">${esc(vm.selectionLabel)}</p>
      <h1 id="title" tabindex="-1" class="mv-title">خانه</h1>
    </header>
    ${continueBlock}
    <section class="mv-section"><h2>خلاصهٔ پیشرفت</h2>
      <div class="mv-card">
        <p class="mv-big">${esc(toFa(vm.overall.answered))} از ${esc(toFa(vm.overall.total))}</p>
        <p class="mv-meta">${percentSentence(pct, 'تمرین‌های')}</p>
        <div class="mv-progress" aria-hidden="true"><span style="width:${pct ?? 0}%"></span></div>
      </div></section>
    <section class="mv-section">
      <button type="button" class="mv-secondary" data-action="switch-tab" data-tab="learn">رفتن به دروس</button>
    </section>`;
}

// vm: { selectionLabel, stats: {answered,total,percent,loggedAnswered,unloggedAnswered,attempts,correct,accuracyPercent,sessions} }
export function renderProfile(vm) {
  const s = vm.stats;
  const accuracy = s.accuracyPercent === null
    ? '<span class="mv-meta">هنوز پاسخی ثبت نشده است</span>'
    : `<span class="mv-big">${esc(toFa(s.accuracyPercent))}٪</span>`;
  const unloggedRow = s.unloggedAnswered > 0
    ? `<div class="mv-card"><dt class="mv-meta">پاسخ‌های ثبت‌نشده</dt>
          <dd class="mv-big">${esc(toFa(s.unloggedAnswered))}</dd></div>`
    : '';
  return `<header class="mv-hero">
      <p class="mv-kicker">${esc(vm.selectionLabel)}</p>
      <h1 id="title" tabindex="-1" class="mv-title">پروفایل</h1>
    </header>
    <section class="mv-section"><h2>آمار یادگیری</h2>
      <dl class="mv-stats">
        <div class="mv-card"><dt class="mv-meta">کل پاسخ‌های انجام‌شده</dt>
          <dd class="mv-big">${esc(toFa(s.answered))} از ${esc(toFa(s.total))}</dd></div>
        <div class="mv-card"><dt class="mv-meta">پاسخ‌های ثبت‌شده</dt>
          <dd class="mv-big">${esc(toFa(s.loggedAnswered))}</dd></div>
        ${unloggedRow}
        <div class="mv-card"><dt class="mv-meta">تعداد تلاش‌های ثبت‌شده</dt>
          <dd class="mv-big">${esc(toFa(s.attempts))}</dd></div>
        <div class="mv-card"><dt class="mv-meta">دقت پاسخ‌ها</dt>
          <dd>${accuracy}</dd></div>
        <div class="mv-card"><dt class="mv-meta">جلسه‌های یادگیری</dt>
          <dd class="mv-big">${esc(toFa(s.sessions))}</dd></div>
      </dl>
    </section>
    <section class="mv-section"><h2>پیشرفت</h2>
      <p class="mv-meta">${percentSentence(s.percent, 'تمرین‌های')}</p>
      <div class="mv-progress" aria-hidden="true"><span style="width:${s.percent ?? 0}%"></span></div>
    </section>
    <section class="mv-section"><h2>تنظیمات</h2>
      <button type="button" class="mv-secondary" data-action="change-selection">تغییر پایه یا رشته</button>
    </section>`;
}
