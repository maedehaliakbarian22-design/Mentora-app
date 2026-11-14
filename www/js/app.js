// Mentora app shell. Wires the pure navigation, practice service and render
// modules to the DOM. Learning State is never computed, stored or shown here.
// Attempt history lives in the Attempt Log (see domain/practice-service.js).

import { CATALOG, indexCatalog } from './content/catalog.js';
import { validateCatalog } from './content/validate.js';
import { openPracticeService } from './domain/practice-service.js';
import { createNavigator, ROUTES } from './core/navigation.js';
import { registerBackButton } from './core/platform.js';
import { evaluateAnswer } from './domain/evaluate.js';
import {
  newPracticeUi, selectOption, checkAnswer, requestAdvance,
} from './domain/practice-flow.js';
import { setSelection, sectionAnswers } from './progress/progress-store.js';
import * as view from './ui/render.js';
import * as tabViews from './ui/tab-views.js';
import { isTab, shouldShowTabBar, resolveBack } from './core/tabs.js';
import { continueTarget, learnerStats, overallProgress } from './domain/learner-summary.js';

const appEl = document.getElementById('app');
const errors = validateCatalog(CATALOG);

if (errors.length > 0) {
  appEl.innerHTML = view.renderCatalogError(errors);
} else {
  boot();
}

// Persian text for each notice code the practice service can report.
const NOTICE_TEXT = {
  'storage-unavailable':
 'ذخیرهٔ پیشرفت در این مرورگر ممکن نیست.',
  'progress-recovered': 'داده‌های ذخیره‌شدهٔ قبلی نامعتبر بود و بخشی از آن بازنشانی شد.',
  'log-corrupt': 'تاریخچهٔ تلاش‌ها نامعتبر بود؛ نسخهٔ پشتیبان آن ذخیره شد.',
  'log-unavailable': 'تاریخچهٔ تلاش‌ها در این مرورگر در دسترس نیست.',
  'log-invalid': 'برخی رکوردهای تاریخچه نامعتبرند و در نتیجه و در تعداد تلاش‌ها و دقت شمرده نمی‌شوند. داده‌ها حذف نشده‌اند و پاسخ‌های ذخیره‌شده‌ی همان سؤال‌ها در تمرین باقی می‌مانند.',
  'migration-incomplete': 'انتقال تاریخچهٔ قبلی کامل نشد؛ داده‌های قبلی حفظ شده‌اند.',
  'unlogged-answers': 'بعضی پاسخ‌ها در تاریخچه ثبت نشده‌اند. در تمرین دیده می‌شوند، اما در نتیجه و در تعداد تلاش‌ها و دقت پاسخ‌ها شمرده نمی‌شوند.',
  'save-failed': 'ذخیرهٔ پیشرفت در این لحظه انجام نشد.',
};
const LOG_WRITE_TEXT = 'ثبت این پاسخ در تاریخچه انجام نشد؛ دوباره تلاش کنید.';

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
  const service = openPracticeService({ storage, index, catalogVersion: CATALOG.version });

  let progress = service.progress();
  // Structural notices (from loading and migration) stay until the app restarts.
  const bootNotices = [];
  if (usingMemory) bootNotices.push('ذخیرهٔ دائمی در این مرورگر فعال نیست؛ پیشرفت پس از بستن برنامه حفظ نمی‌شود.');
  for (const code of service.notices()) {
    if (NOTICE_TEXT[code]) bootNotices.push(NOTICE_TEXT[code]);
  }
  // Transient notices are shown once, on the next render.
  let pendingNotices = [];
  let persistFailed = false;

  const tabbarEl = document.getElementById('tabbar');
  // Each tab keeps its own stack, so switching tabs never resets a screen.
  const ROOTS = {
    home: { name: ROUTES.HOME },
    learn: { name: ROUTES.DASHBOARD },
    profile: { name: ROUTES.PROFILE },
  };
  const navs = {
    home: createNavigator(ROOTS.home),
    learn: createNavigator(ROOTS.learn),
    profile: createNavigator(ROOTS.profile),
  };
  let activeTab = 'home';
  // Routes every nav call to the active tab's stack. Existing call sites are unchanged.
  const nav = {
    current: () => navs[activeTab].current(),
    canGoBack: () => navs[activeTab].canGoBack(),
    push: (route) => navs[activeTab].push(route),
    replace: (route) => navs[activeTab].replace(route),
    back: () => navs[activeTab].back(),
    reset: (route) => navs[activeTab].reset(route),
  };
  let animateTab = false;
  if (!progress.selection) {
    activeTab = 'learn';
    navs.learn.reset({ name: ROUTES.SELECTION });
  }

  // Practice-only UI state. Held in memory and never persisted, so a pending
  // selection is lost on restart by design.
  let practiceUi = null;

  function syncProgress() {
    progress = service.progress();
  }

  function commit(next) {
    persistFailed = !service.setProgress(next);
    syncProgress();
    render();
  }

  // Android back: pop the active tab's stack; from a non-home tab's root go to
  // Home; at Home's root return false so the app can close.
  function goBack() {
    const action = resolveBack({
      activeTab,
      canPop: nav.canGoBack(),
      hasSelection: Boolean(progress.selection),
    });
    if (action === 'pop') {
      nav.back();
      render();
      return true;
    }
    if (action === 'home') {
      activeTab = 'home';
      animateTab = true;
      render();
      return true;
    }
    return false;
  }

  function switchTab(tab) {
    if (!isTab(tab)) return undefined;
    if (tab === activeTab) {
      // Tapping the active tab returns it to its root screen.
      navs[tab].reset(ROOTS[tab]);
    } else {
      activeTab = tab;
    }
    animateTab = true;
    return render();
  }

  // ----- practice state helpers ------------------------------------------------

  function practiceKey(route) {
    return `${route.sectionId}:${route.index}`;
  }

  function uiFor(route) {
    const key = practiceKey(route);
    // shownAt is kept for the flow state only; response timing is not stored.
    if (!practiceUi || practiceUi.key !== key) practiceUi = { ...newPracticeUi(key), shownAt: Date.now() };
    return practiceUi;
  }

  function isAnsweredNow(route) {
    const section = index.sections.get(route.sectionId);
    const question = section && section.questions[route.index];
    return Boolean(question) && sectionAnswers(progress, section.id)[question.id] !== undefined;
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

  // Continue is the only way to advance. The flow module keeps it to once per question.
  function tryAdvance() {
    const route = nav.current();
    if (route.name !== ROUTES.PRACTICE) return false;
    const ui = uiFor(route);
    const result = requestAdvance(ui, isAnsweredNow(route));
    practiceUi = result.ui;
    if (!result.advance) return false;
    advancePractice();
    return true;
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

  function homeVm() {
    return {
      selectionLabel: selectionLabel(),
      overall: overallProgress(progress, index),
      target: continueTarget(progress, index),
    };
  }

  function profileVm() {
    return { selectionLabel: selectionLabel(), stats: learnerStats(service.statsInput(), index) };
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
        // The current practice run of this section, from the service.
        const section = index.sections.get(route.sectionId);
        const session = service.result(section.id);
        return view.renderResult({
          section,
          session,
          hasDemo: section.questions.some((q) => q.status === 'demo'),
        });
      }
      case ROUTES.HOME:
        if (!progress.selection) return screenFor({ name: ROUTES.SELECTION });
        return tabViews.renderHome(homeVm());
      case ROUTES.PROFILE:
        if (!progress.selection) return screenFor({ name: ROUTES.SELECTION });
        return tabViews.renderProfile(profileVm());
      default:
        return screenFor({ name: ROUTES.DASHBOARD });
    }
  }

  function banners() {
    const items = [];
    if (persistFailed) items.push(NOTICE_TEXT['save-failed']);
    items.push(...bootNotices);
    items.push(...pendingNotices);
    pendingNotices = [];
    return view.renderBanners(items);
  }

  function render() {
    const route = nav.current();
    // Without a selection the learner is on the first-run screen, which has no bar.
    const effective = progress.selection ? route.name : ROUTES.SELECTION;
    const showTabs = shouldShowTabBar(effective);
    appEl.classList.toggle('has-tabbar', showTabs);
    if (animateTab) {
      animateTab = false;
      appEl.classList.remove('is-entering');
      void appEl.offsetWidth; // restart the fade-in animation
      appEl.classList.add('is-entering');
    }
    tabbarEl.innerHTML = tabViews.renderBottomNav({ active: activeTab, visible: showTabs });
    appEl.innerHTML = banners() + screenFor(route);
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
        // A new selection starts the learner on Home with fresh stacks.
        navs.learn.reset(ROOTS.learn);
        navs.home.reset(ROOTS.home);
        navs.profile.reset(ROOTS.profile);
        activeTab = 'home';
        return commit(setSelection(progress, { gradeId: ds.grade, fieldId: ds.field }));
      case 'switch-tab':
        return switchTab(ds.tab);
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
        // The only transition that evaluates and records. Once per question.
        const route = nav.current();
        if (route.name !== ROUTES.PRACTICE) return undefined;
        const section = index.sections.get(route.sectionId);
        const question = section.questions[route.index];
        const ui = uiFor(route);
        const { ui: nextUi, outcome } = checkAnswer(ui, isAnsweredNow(route), question);
        if (!outcome) {
          practiceUi = nextUi;
          return render();
        }
        // Record first. If the log write fails, nothing is shown as answered.
        const res = service.check(section.id, question.id, outcome.selectedIndex);
        if (!res.ok) {
          if (res.reason === 'log-write') pendingNotices.push(LOG_WRITE_TEXT);
          practiceUi = ui;
          syncProgress();
          return render();
        }
        practiceUi = nextUi;
        if (!res.saved) persistFailed = true;
        syncProgress();
        return render();
      }
      case 'continue':
        return tryAdvance();
      case 'restart-section': {
        practiceUi = null;
        const res = service.restartSection(ds.section);
        if (res.ok && !res.saved) persistFailed = true;
        syncProgress();
        nav.back();
        return render();
      }
      default:
        return undefined;
    }
  }

  function onActionClick(event) {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    handle(el.dataset.action, el.dataset);
  }
  appEl.addEventListener('click', onActionClick);
  tabbarEl.addEventListener('click', onActionClick);


  // Android hardware back: pop the in-app stack; at the root the app exits.
  registerBackButton(() => goBack(), window);

  render();
}
