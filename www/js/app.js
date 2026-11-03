// Mentora demo prototype: UI controller.
// All educational content is demo content (see data/demo-content.js).
// No Learning State is computed or shown.

import { CONTENT, DEMO_LABEL } from './data/demo-content.js';
import { validateContent } from './domain/content-validate.js';
import { evaluateAnswer, computeResult } from './domain/evaluate.js';
import { createStore } from './data/attempt-store.js';

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toFa(value) {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function pickStorage() {
  try {
    const s = window.localStorage;
    s.getItem('__mentora_probe__');
    return { storage: s, usingMemory: false };
  } catch {
    return { storage: memoryStorage(), usingMemory: true };
  }
}

const appEl = document.getElementById('app');
const invalid = validateContent(CONTENT);

if (invalid.length > 0) {
  appEl.innerHTML = `<section class="card"><h1 id="title" tabindex="-1">محتوای نمونه نامعتبر است</h1>
    <ul>${invalid.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></section>`;
} else {
  start();
}

function start() {
  const { storage, usingMemory } = pickStorage();
  const store = createStore(storage, CONTENT);
  const loaded = store.load();

  let state = loaded.state;
  let pendingNotices = [];
  if (usingMemory) {
    pendingNotices.push('ذخیرهٔ دائمی در این مرورگر فعال نیست؛ پیشرفت پس از بستن برنامه حفظ نمی‌شود.');
  } else if (!loaded.storageOk) {
    pendingNotices.push('ذخیرهٔ پیشرفت در این مرورگر ممکن نیست.');
  }
  if (loaded.recovered) {
    pendingNotices.push('داده‌های ذخیره‌شدهٔ قبلی نامعتبر بود و بازنشانی شد.');
  }
  let persistFailed = false;
  // Replace corrupt data with the clean default once, so the notice is not repeated.
  if (loaded.recovered && loaded.storageOk) {
    persistFailed = !store.save(state);
  }

  const chapter = CONTENT.chapter;
  const lesson = () => CONTENT.lessons.find((l) => l.id === state.lessonId);
  const lessonQuestions = () => CONTENT.questions.filter((q) => q.lessonId === state.lessonId);
  const answeredCount = () => lessonQuestions().filter((q) => state.answers[q.id]).length;

  function commit(next) {
    state = next;
    persistFailed = !store.save(state);
    render();
  }

  function firstUnansweredIndex() {
    const idx = lessonQuestions().findIndex((q) => !state.answers[q.id]);
    return idx === -1 ? 0 : idx;
  }

  function banners() {
    const items = [];
    if (persistFailed) items.push('ذخیرهٔ پیشرفت در این لحظه انجام نشد.');
    for (const n of pendingNotices) items.push(n);
    pendingNotices = [];
    if (items.length === 0) return '';
    return `<div class="banner" role="status">${items.map((t) => `<p>${esc(t)}</p>`).join('')}</div>`;
  }

  function demoBadge() {
    return `<span class="badge">${esc(DEMO_LABEL)}</span>`;
  }

  function chapterView() {
    const total = lessonQuestions().length;
    const done = answeredCount();
    return `
      <header class="top">
        <p class="kicker">پایه دهم · شیمی</p>
        <h1 id="title" tabindex="-1">${esc(chapter.title)}</h1>
        ${demoBadge()}
      </header>
      <section class="card">
        <h2>${esc(lesson().title)}</h2>
        <p class="meta">${esc(toFa(done))} از ${esc(toFa(total))} پاسخ ثبت‌شده</p>
        <button type="button" class="primary" data-action="start-lesson">شروع درس</button>
      </section>
      <p class="note">این صفحه نمونه‌ای از جریان برنامه است و محتوای تأییدشدهٔ کتاب نیست.</p>`;
  }

  function lessonView() {
    const total = lessonQuestions().length;
    const done = answeredCount();
    const body = lesson().body.map((p) => `<p>${esc(toFa(p))}</p>`).join('');
    return `
      <nav class="crumbs"><button type="button" class="link" data-action="back-chapter">فصل</button></nav>
      <header class="top">
        <h1 id="title" tabindex="-1">${esc(lesson().title)}</h1>
        ${demoBadge()}
      </header>
      <article class="card lesson-body">${body}</article>
      <p class="meta">${esc(toFa(done))} از ${esc(toFa(total))} تمرین پاسخ داده شده</p>
      <button type="button" class="primary" data-action="start-practice">شروع تمرین</button>
      ${done > 0 ? '<button type="button" class="secondary" data-action="restart-lesson">تمرین دوباره از ابتدا</button>' : ''}`;
  }

  function questionView() {
    const questions = lessonQuestions();
    const total = questions.length;
    const q = questions[state.questionIndex];
    const entry = state.answers[q.id];
    const answered = Boolean(entry);
    const progress = Math.round((state.questionIndex / total) * 100);

    const choices = q.options
      .map((opt, i) => {
        const selected = answered && entry.selectedIndex === i;
        const cls = ['choice'];
        if (answered && i === q.correctIndex) cls.push('is-correct');
        if (selected && !entry.correct) cls.push('is-wrong');
        return `<button type="button" role="radio" aria-checked="${selected}" class="${cls.join(' ')}"
          data-action="choose" data-index="${i}" ${answered ? 'disabled' : ''}>${esc(toFa(opt))}</button>`;
      })
      .join('');

    let feedback = '';
    if (answered) {
      feedback = entry.correct
        ? '<p class="feedback ok">درست است.</p>'
        : `<p class="feedback bad">نادرست است. پاسخ درست: ${esc(toFa(q.options[q.correctIndex]))}</p>`;
    }
    const isLast = state.questionIndex === total - 1;

    return `
      <nav class="crumbs"><button type="button" class="link" data-action="back-lesson">بازگشت به درس</button></nav>
      <div class="progress" aria-hidden="true"><span style="width:${progress}%"></span></div>
      <p class="meta">سؤال ${esc(toFa(state.questionIndex + 1))} از ${esc(toFa(total))} ${demoBadge()}</p>
      <h1 id="title" tabindex="-1" class="prompt">${esc(toFa(q.prompt))}</h1>
      <div class="choices" role="radiogroup" aria-label="گزینه‌ها">${choices}</div>
      <div role="status" aria-live="polite">${feedback}</div>
      <button type="button" class="primary" data-action="next" ${answered ? '' : 'disabled'}>
        ${isLast ? 'مشاهدهٔ نتیجه' : 'سؤال بعدی'}
      </button>`;
  }

  function resultView() {
    const result = computeResult(lessonQuestions(), state.answers);
    const message = result.correct === result.total
      ? 'همهٔ پاسخ‌ها درست بود.'
      : 'پاسخ‌های نادرست را دوباره مرور کنید.';
    return `
      <header class="top">
        <h1 id="title" tabindex="-1">نتیجهٔ تمرین نمونه</h1>
        ${demoBadge()}
      </header>
      <section class="card score">
        <p class="big">${esc(toFa(result.correct))} از ${esc(toFa(result.total))}</p>
        <p class="meta">${esc(toFa(result.percent))}٪ درست</p>
        <p>${esc(message)}</p>
      </section>
      <button type="button" class="primary" data-action="back-chapter">بازگشت به فصل</button>
      <button type="button" class="secondary" data-action="restart-lesson">تمرین دوباره از ابتدا</button>`;
  }

  function render() {
    let view;
    if (state.phase === 'chapter') view = chapterView();
    else if (state.phase === 'lesson') view = lessonView();
    else if (state.phase === 'question') view = questionView();
    else view = resultView();
    appEl.innerHTML = banners() + view;
    const title = appEl.querySelector('#title');
    if (title) title.focus({ preventScroll: true });
  }

  function handle(action, dataset) {
    const questions = lessonQuestions();
    switch (action) {
      case 'start-lesson':
        return commit({ ...state, phase: 'lesson' });
      case 'back-chapter':
        return commit({ ...state, phase: 'chapter' });
      case 'back-lesson':
        return commit({ ...state, phase: 'lesson' });
      case 'start-practice': {
        if (answeredCount() === questions.length) {
          return commit({ ...state, phase: 'result' });
        }
        return commit({ ...state, phase: 'question', questionIndex: firstUnansweredIndex() });
      }
      case 'choose': {
        const q = questions[state.questionIndex];
        if (!q || state.answers[q.id]) return undefined;
        const selectedIndex = Number(dataset.index);
        const { correct } = evaluateAnswer(q, selectedIndex);
        return commit({
          ...state,
          answers: { ...state.answers, [q.id]: { selectedIndex, correct } },
        });
      }
      case 'next': {
        const q = questions[state.questionIndex];
        if (!q || !state.answers[q.id]) return undefined;
        if (state.questionIndex < questions.length - 1) {
          return commit({ ...state, questionIndex: state.questionIndex + 1 });
        }
        if (computeResult(questions, state.answers).complete) {
          return commit({ ...state, phase: 'result' });
        }
        return commit({ ...state, questionIndex: firstUnansweredIndex() });
      }
      case 'restart-lesson':
        return commit({ ...state, phase: 'lesson', questionIndex: 0, answers: {} });
      default:
        return undefined;
    }
  }

  appEl.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    handle(el.dataset.action, el.dataset);
  });

  render();
}
