// Pure HTML renderers. Each function takes a plain view model and returns an
// HTML string. No DOM access and no storage, so they are unit-testable.
// Every interpolated value passes through esc(); numbers pass through toFa().

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toFa(value) {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const demoBadge = () => '<span class="mv-badge">نمونه آزمایشی</span>';
const placeholderBadge = () => '<span class="mv-badge mv-badge--soft">در حال آماده‌سازی</span>';

export function renderBanners(messages) {
  if (!messages || messages.length === 0) return '';
  return `<div class="mv-banner" role="status">${messages.map((m) => `<p>${esc(m)}</p>`).join('')}</div>`;
}

export function renderCatalogError(errors) {
  return `<section class="mv-card"><h1 id="title" tabindex="-1">محتوای برنامه نامعتبر است</h1>
    <ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></section>`;
}

export function renderTopBar({ title, backLabel }) {
  const back = backLabel
    ? `<button type="button" class="mv-link" data-action="back">${esc(backLabel)}</button>`
    : '';
  return `<nav class="mv-topbar">${back}</nav>
    <h1 id="title" tabindex="-1" class="mv-title">${esc(title)}</h1>`;
}

// vm: { grades: [{id,label,fields:[{id,label,available}]}], selection, gradeId, canGoBack }
export function renderSelection(vm) {
  const grades = vm.grades.map((g) => {
    const active = g.id === vm.gradeId ? ' is-active' : '';
    return `<button type="button" class="mv-chip${active}" data-action="pick-grade" data-grade="${esc(g.id)}"
      aria-pressed="${g.id === vm.gradeId}">${esc(g.label)}</button>`;
  }).join('');

  const grade = vm.grades.find((g) => g.id === vm.gradeId);
  let fields = '';
  if (grade && grade.fields.length > 0) {
    fields = grade.fields.map((f) => {
      if (!f.available) {
        return `<div class="mv-option is-disabled" aria-disabled="true">
          <span>${esc(f.label)}</span><span class="mv-badge mv-badge--soft">به‌زودی</span></div>`;
      }
      const chosen = vm.selection && vm.selection.gradeId === grade.id && vm.selection.fieldId === f.id;
      return `<button type="button" class="mv-option${chosen ? ' is-chosen' : ''}"
        data-action="pick-field" data-grade="${esc(grade.id)}" data-field="${esc(f.id)}">
        <span>${esc(f.label)}</span>${chosen ? '<span class="mv-badge">انتخاب شما</span>' : ''}</button>`;
    }).join('');
  } else if (grade) {
    fields = '<p class="mv-note">برای این پایه هنوز رشته‌ای فعال نشده است.</p>';
  }

  return `${renderTopBar({ title: 'پایه و رشته‌ی خود را انتخاب کنید', backLabel: vm.canGoBack ? 'بازگشت' : '' })}
    <p class="mv-kicker">این انتخاب را بعداً می‌توانید تغییر دهید.</p>
    <section class="mv-section"><h2>پایه</h2><div class="mv-chips">${grades}</div></section>
    ${fields ? `<section class="mv-section"><h2>رشته</h2><div class="mv-options">${fields}</div></section>` : ''}`;
}

// vm: { selectionLabel, subjects: [{id,label,chapters:[{id,title,answered,total,hasDemo}]}] }
export function renderDashboard(vm) {
  const subjects = vm.subjects.map((s) => {
    const chapters = s.chapters.map((c) => `
      <button type="button" class="mv-card mv-card--tap" data-action="open-chapter" data-chapter="${esc(c.id)}">
        <span class="mv-card__title">${esc(c.title)}</span>
        <span class="mv-meta">${esc(toFa(c.answered))} از ${esc(toFa(c.total))} تمرین پاسخ داده شده</span>
        ${c.hasDemo ? demoBadge() : ''}
      </button>`).join('');
    return `<section class="mv-section"><h2>${esc(s.label)}</h2>${chapters}</section>`;
  }).join('');

  return `<header class="mv-hero">
      <p class="mv-kicker">${esc(vm.selectionLabel)}</p>
      <h1 id="title" tabindex="-1" class="mv-title">درس‌های امروز</h1>
      <button type="button" class="mv-link" data-action="change-selection">تغییر پایه یا رشته</button>
    </header>
    ${subjects || '<p class="mv-note">درسی برای این انتخاب موجود نیست.</p>'}`;
}

// vm: { subject: {id,label}, chapters: [{id,title}] }
export function renderSubject(vm) {
  const items = vm.chapters.map((c) => `
    <button type="button" class="mv-card mv-card--tap" data-action="open-chapter" data-chapter="${esc(c.id)}">
      <span class="mv-card__title">${esc(c.title)}</span>
    </button>`).join('');
  return `${renderTopBar({ title: vm.subject.label, backLabel: 'بازگشت' })}${items}`;
}

// vm: { chapter: {id,title,titleVerified}, sections: [{id,title,placeholder,answered,total,hasDemo}] }
export function renderChapter(vm) {
  const items = vm.sections.map((s) => `
    <button type="button" class="mv-card mv-card--tap" data-action="open-section" data-section="${esc(s.id)}">
      <span class="mv-card__title">${esc(s.title)}</span>
      <span class="mv-meta">${esc(toFa(s.answered))} از ${esc(toFa(s.total))} تمرین پاسخ داده شده</span>
      ${s.placeholder ? placeholderBadge() : ''}${s.hasDemo ? demoBadge() : ''}
    </button>`).join('');
  return `${renderTopBar({ title: vm.chapter.title, backLabel: 'بازگشت' })}${items}`;
}

// vm: { section: {id,title,placeholder,body:[]}, total, answered, hasDemo }
export function renderSection(vm) {
  const body = vm.section.body.map((p) => `<p>${esc(p)}</p>`).join('');
  const practice = vm.total > 0
    ? `<button type="button" class="mv-primary" data-action="start-practice" data-section="${esc(vm.section.id)}">
         ${vm.answered > 0 ? 'ادامهٔ تمرین' : 'شروع تمرین'}</button>
       <p class="mv-meta">${esc(toFa(vm.answered))} از ${esc(toFa(vm.total))} تمرین پاسخ داده شده</p>`
    : '<p class="mv-note">تمرین این بخش پس از ورود محتوای تأییدشده در دسترس خواهد بود.</p>';
  return `${renderTopBar({ title: vm.section.title, backLabel: 'بازگشت' })}
    <header class="mv-hero">${vm.section.placeholder ? placeholderBadge() : ''}${vm.hasDemo ? demoBadge() : ''}</header>
    <article class="mv-card mv-lesson">${body}</article>
    ${practice}`;
}

// vm: { section, question, index, total, answer: {selectedIndex, correct}|null, isLast }
// question.options and correctIndex are used only to show feedback after an answer.
export function renderPractice(vm) {
  const progress = Math.round((vm.index / vm.total) * 100);
  const answered = Boolean(vm.answer);
  const choices = vm.question.options.map((opt, i) => {
    const selected = answered && vm.answer.selectedIndex === i;
    const correctChoice = answered && i === vm.question.correctIndex;
    const cls = ['mv-choice'];
    if (correctChoice) cls.push('is-correct');
    if (selected && !vm.answer.correct) cls.push('is-wrong');
    return `<button type="button" role="radio" aria-checked="${selected}" class="${cls.join(' ')}"
      data-action="choose" data-index="${i}" ${answered ? 'disabled' : ''}>${esc(toFa(opt))}</button>`;
  }).join('');
  let feedback = '';
  if (answered) {
    feedback = vm.answer.correct
      ? '<p class="mv-feedback is-ok">درست است.</p>'
      : `<p class="mv-feedback is-bad">نادرست است. پاسخ درست: ${esc(toFa(vm.question.options[vm.question.correctIndex]))}</p>`;
  }
  return `${renderTopBar({ title: vm.section.title, backLabel: 'بازگشت به بخش' })}
    <div class="mv-progress" aria-hidden="true"><span style="width:${progress}%"></span></div>
    <p class="mv-meta">سؤال ${esc(toFa(vm.index + 1))} از ${esc(toFa(vm.total))} ${demoBadge()}</p>
    <h2 class="mv-prompt" id="title" tabindex="-1">${esc(toFa(vm.question.prompt))}</h2>
    <div class="mv-choices" role="radiogroup" aria-label="گزینه‌ها">${choices}</div>
    <div role="status" aria-live="polite">${feedback}</div>
    <button type="button" class="mv-primary" data-action="next" ${answered ? '' : 'disabled'}>
      ${vm.isLast ? 'مشاهدهٔ نتیجه' : 'سؤال بعدی'}</button>`;
}

// vm: { section, result: {correct,total,percent}, hasDemo }
export function renderResult(vm) {
  const message = vm.result.correct === vm.result.total
    ? 'همهٔ پاسخ‌ها درست بود.'
    : 'پاسخ‌های نادرست را دوباره مرور کنید.';
  return `${renderTopBar({ title: 'نتیجهٔ تمرین', backLabel: 'بازگشت به بخش' })}
    <section class="mv-card mv-score">
      <p class="mv-big">${esc(toFa(vm.result.correct))} از ${esc(toFa(vm.result.total))}</p>
      <p class="mv-meta">${esc(toFa(vm.result.percent))}٪ درست</p>
      <p>${esc(message)}</p>
      ${vm.hasDemo ? demoBadge() : ''}
    </section>
    <button type="button" class="mv-primary" data-action="back">بازگشت به بخش</button>
    <button type="button" class="mv-secondary" data-action="restart-section" data-section="${esc(vm.section.id)}">تمرین دوباره از ابتدا</button>`;
}
