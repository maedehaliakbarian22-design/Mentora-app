// Pure tab rules for the bottom navigation. No DOM access.
//
// Three tabs: Home, Learn (the existing lesson flow), Profile. Each tab keeps
// its own navigation stack, so switching tabs never resets progress or screens.

export const TABS = Object.freeze(['home', 'learn', 'profile']);

// The route each tab returns to when its stack is rooted (and when tapped again).
export const TAB_ROOT_ROUTE = Object.freeze({
  home: 'home',
  learn: 'dashboard',
  profile: 'profile',
});

export function isTab(value) {
  return TABS.includes(value);
}

// The bar is hidden during first-run selection and during a practice question,
// so it never distracts from answering. It is visible on every other screen.
const HIDDEN_ON_ROUTES = new Set(['selection', 'practice']);

export function shouldShowTabBar(routeName) {
  return !HIDDEN_ON_ROUTES.has(routeName);
}

// Decides what the Android back button does.
//   'pop'  - pop the active tab's stack
//   'home' - leave a non-home tab that is at its root, and go to Home
//   'exit' - at Home's root (or with no selection yet): let the app close
export function resolveBack({ activeTab, canPop, hasSelection }) {
  if (canPop) return 'pop';
  if (activeTab !== 'home' && hasSelection) return 'home';
  return 'exit';
}
