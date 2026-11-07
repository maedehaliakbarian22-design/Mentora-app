// Mentora app shell. Wires the pure navigation, progress and render modules to
// the DOM. Learning State is never computed, stored or shown here.

import { CATALOG, indexCatalog } from './content/catalog.js';
import { validateCatalog } from './content/validate.js';
import {
  createProgressStore, recordAnswer, clearSection, setSelection, sectionAnswers,
} from './progress/progress-store.js';
import { createNavigator, ROUTES } from './core/navigation.js';
import { registerBackButton } from './core/platform.js';
import { evaluateAnswer, computeResult } from './domain/evaluate.js';
import {
  newPracticeUi, selectOption, checkAnswer, autoAdvancePlan,
  requestAdvance, cancelAutoAdvance,
} from './domain/practice-flow.js';
import * as view from './ui/render.js';

const appEl = document.getElementById('app');
const errors = validateCatalog(CATALOG);

if (errors.length > 0) {
  appEl.innerHTML = view.renderCatalogError(errors);
} else {
  boot();
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

function boot() {
  const index = indexCatalog(CATALOG);
  const { storage, usingMemory } = pickStorage();
  const store = createProgressStore(storage, index);
  const loaded = store.load();

  let progress = loaded.progress;
  let pendingNotices = [];
  if (usingMemory) {
    pendingNotices.push('ذخیرهٔ دائمی در این مرورگر فعال نیست؛ پیشرفت پس از بستن برنامه حفظ نمی‌شود.');
  } else if (!loaded.storageOk) {
    pendingNotices.push('ذخیرهٔ پیشرفت در این مرورگر ممکن نیست.');
  }
  if (loaded.recovered) {
    pendingNotices.push('داده‌های ذخیره‌شدهٔ قبلی نامعتبر بود و بخشی از آن بازنشانی شد.');
  }
  let persistFailed = false;
  if (loaded.recovered && loaded.storageOk) persistFailed = !store.save(progress);

  const nav = createNavigator({ name: ROUTES.DASHBOARD });
  if (!progress.selection) nav.reset({ name: ROUTES.SELECTION });

  // Practice-only UI state. Held in memory and never persisted, so a pending
  // selection is lost on restart by design.
  let practiceUi = null;
  let autoAdvanceTimer = null;
  let autoAdvanceKey = null;

  function commit(next) {
    progress = next;
    persistFailed = !store.save(progress);
    render();
  }

  function goBack() {
    clearAutoAdvance();
    const moved = nav.back();
    if (moved) render();
    return moved;
  }

  // ----- practice state helpers ------------------------------------------------

  function practiceKey(route) {
    return `${route.sectionId}:${route.index}`;
  }

  function uiFor(route) {
    const key = practiceKey(route);
    if (!practiceUi || practiceUi.key !== key) practiceUi = newPracticeUi(key);
    return practiceUi;
  }

  function isAnsweredNow(route) {
    const section = index.sections.get(route.sectionId);
    const question = section && section.questions[route.index];
    return Boolean(question) && sectionAnswers(progress, section.id)[question.id] !== undefined;
  }

  // Cancels a scheduled automatic advance and marks it cancelled, so a late
  // timer cannot advance the learner.
  function clearAutoAdvance() {
    if (autoAdvanceTimer !== null) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
    autoAdvanceKey = null;
    if (practiceUi) practiceUi = cancelAutoAdvance(practiceUi);
  }

  function advancePractice() {
    const route = nav.current();
    if (route.name !== ROUTES.PRACTICE) return;
    const section = index.sections.get(route.sectionId);
    if (route.index < section.questions.length - 1) {
      nav.replace({ name: ROUTES.PRACTICE, sectionId: section.id, index: route.index + 1 });
    } else {
      nav.replace({ name: ROUTES.RESULT, sectionId: section.id });
    }
    render();
  }

  // Shared by Continue and the automatic timer. The flow module guarantees the
  // advance happens at most once per question.
  function tryAdvance(source) {
    const route = nav.current();
    if (route.name !== ROUTES.PRACTICE) return false;
    const ui = uiFor(route);
    const result = requestAdvance(ui, isAnsweredNow(route), source);
    practiceUi = result.ui;
    if (!result.advance) return false;
    clearAutoAdvance();
    advancePractice();
    return true;
  }

  function onAutoAdvanceFired(key) {
    if (key !== autoAdvanceKey) return;
    autoAdvanceTimer = null;
    autoAdvanceKey = null;
    tryAdvance('timer');
  }

  // Background cancels the automatic advance. The correct panel stays visible
  // and waits for Continue when the app returns.
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') clearAutoAdvance();
  }

  // ----- derived view models -------------------------------------------------

  function sectionProgress(section) {
    const answers = sectionAnswers(progress, section.id);
    return {
      answered: section.questions.filter((q) => answers[q.id] !== undefined).length,
      total: section.questions.length,
      hasDemo: section.questions.some((q) => q.status === 'demo'),
    };
  }

  function selectionLabel() {
    const sel = progress.selection;
    if (!sel) return '';
    const grade = CATALOG.grades.find((g) => g.id === sel.gradeId);
    const field = grade && grade.fields.find((f) => f.id === sel.fieldId);
    return [grade && grade.label, field && field.label].filter(Boolean).join(' · ');
  }

  function dashboardVm() {
    const sel = progress.selection;
    const subjects = [...index.subjects.values()]
      .filter((s) => sel && s.gradeId === sel.gradeId && s.fieldId === sel.fieldId)
      .map((s) => ({
        id: s.id,
        label: s.label,
        chapters: s.chapters.map((cid) => {
          const c = index.chapters.get(cid);
          const sums = c.sections.map((sec) => sectionProgress(index.sections.get(sec.id)));
          return {
            id: c.id,
            title: c.title,
            answered: sums.reduce((n, x) => n + x.answered, 0),
            total: sums.reduce((n, x) => n + x.total, 0),
            hasDemo: sums.some((x) => x.hasDemo),
          };
        }),
      }));
    return { selectionLabel: selectionLabel(), subjects };
  }

  function screenFor(route) {
    switch (route.name) {
      case ROUTES.SELECTION:
        return view.renderSelection({
          grades: CATALOG.grades,
          gradeId: route.gradeId || (progress.selection && progress.selection.gradeId) || CATALOG.grades[0].id,
          selection: progress.selection,
          canGoBack: nav.canGoBack(),
        });
      case ROUTES.DASHBOARD:
        if (!progress.selection) return screenFor({ name: ROUTES.SELECTION });
        return view.renderDashboard(dashboardVm());
      case ROUTES.SUBJECT: {
        const subject = index.subjects.get(route.subjectId);
        if (!subject) return screenFor({ name: ROUTES.DASHBOARD });
        const chapters = subject.chapters.map((cid) => index.chapters.get(cid));
        return view.renderSubject({ subject: { id: subject.id, label: subject.label }, chapters });
      }
      case ROUTES.CHAPTER: {
        const chapter = index.chapters.get(route.chapterId);
        if (!chapter) return screenFor({ name: ROUTES.DASHBOARD });
        const sections = chapter.sections.map((s) => {
          const sec = index.sections.get(s.id);
          return { id: sec.id, title: sec.title, placeholder: sec.placeholder, ...sectionProgress(sec) };
        });
        return view.renderChapter({ chapter, sections });
      }
      case ROUTES.SECTION: {
        const section = index.sections.get(route.sectionId);
        if (!section) return screenFor({ name: ROUTES.DASHBOARD });
        return view.renderSection({ section, ...sectionProgress(section) });
      }
      case ROUTES.PRACTICE: {
        const section = index.sections.get(route.sectionId);
        const question = section && section.questions[route.index];
        if (!question) return screenFor({ name: ROUTES.SECTION, sectionId: route.sectionId });
        const selected = sectionAnswers(progress, section.id)[question.id];
        const answer = selected === undefined
          ? null
          : { selectedIndex: selected, correct: evaluateAnswer(question, selected).correct };
        const ui = uiFor(route);
        return view.renderPractice({
          section,
          question,
          index: route.index,
          total: section.questions.length,
          answer,
          pending: answer ? null : ui.pending,
          isLast: route.index === section.questions.length - 1,
        });
      }
      case ROUTES.RESULT: {
        const section = index.sections.get(route.sectionId);
        const answers = sectionAnswers(progress, section.id);
        const asEntries = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { selectedIndex: v }]));
        const result = computeResult(section.questions, asEntries);
        return view.renderResult({ section, result, hasDemo: section.questions.some((q) => q.status === 'demo') });
      }
      default:
        return screenFor({ name: ROUTES.DASHBOARD });
    }
  }

  function banners() {
    const items = [];
    if (persistFailed) items.push('ذخیرهٔ پیشرفت در این لحظه انجام نشد.');
    items.push(...pendingNotices);
    pendingNotices = [];
    return view.renderBanners(items);
  }

  function render() {
    appEl.innerHTML = banners() + screenFor(nav.current());
    const title = appEl.querySelector('#title');
    if (title) title.focus({ preventScroll: true });
  }

  // ----- actions ---------------------------------------------------------------

  function handle(action, ds) {
    switch (action) {
      case 'back':
        return goBack();
      case 'pick-grade':
        nav.replace({ name: ROUTES.SELECTION, gradeId: ds.grade });
        return render();
      case 'pick-field':
        nav.reset({ name: ROUTES.DASHBOARD });
        return commit(setSelection(progress, { gradeId: ds.grade, fieldId: ds.field }));
      case 'change-selection':
        nav.push({ name: ROUTES.SELECTION, gradeId: progress.selection ? progress.selection.gradeId : undefined });
        return render();
      case 'open-subject':
        nav.push({ name: ROUTES.SUBJECT, subjectId: ds.subject });
        return render();
      case 'open-chapter':
        nav.push({ name: ROUTES.CHAPTER, chapterId: ds.chapter });
        return render();
      case 'open-section':
        nav.push({ name: ROUTES.SECTION, sectionId: ds.section });
        return render();
      case 'start-practice': {
        const section = index.sections.get(ds.section);
        if (!section || section.questions.length === 0) return undefined;
        const answers = sectionAnswers(progress, section.id);
        const firstOpen = section.questions.findIndex((q) => answers[q.id] === undefined);
        if (firstOpen === -1) nav.push({ name: ROUTES.RESULT, sectionId: section.id });
        else nav.push({ name: ROUTES.PRACTICE, sectionId: section.id, index: firstOpen });
        return render();
      }
      case 'select': {
        // Changes the pending choice only. Never evaluates or saves.
        const route = nav.current();
        if (route.name !== ROUTES.PRACTICE) return undefined;
        const section = index.sections.get(route.sectionId);
        const question = section.questions[route.index];
        if (!question) return undefined;
        practiceUi = selectOption(uiFor(route), isAnsweredNow(route), Number(ds.index), question.options.length);
        return render();
      }
      case 'check': {
        // The only transition that evaluates and persists. Once per question.
        const route = nav.current();
        if (route.name !== ROUTES.PRACTICE) return undefined;
        const section = index.sections.get(route.sectionId);
        const question = section.questions[route.index];
        const ui = uiFor(route);
        const { ui: nextUi, outcome } = checkAnswer(ui, isAnsweredNow(route), question);
        practiceUi = nextUi;
        if (!outcome) return render();
        commit(recordAnswer(progress, question.id, outcome.selectedIndex, index));
        const plan = autoAdvancePlan(outcome);
        if (plan.scheduleMs !== null) {
          const key = practiceKey(route);
          autoAdvanceKey = key;
          autoAdvanceTimer = setTimeout(() => onAutoAdvanceFired(key), plan.scheduleMs);
        }
        return undefined;
      }
      case 'continue':
        return tryAdvance('continue');
      case 'restart-section':
        clearAutoAdvance();
        practiceUi = null;
        commit(clearSection(progress, ds.section));
        nav.back();
        return render();
      default:
        return undefined;
    }
  }

  appEl.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    handle(el.dataset.action, el.dataset);
  });

  document.addEventListener('visibilitychange', onVisibilityChange);

  // Android hardware back: pop the in-app stack; at the root the app exits.
  registerBackButton(() => goBack(), window);

  render();
}
