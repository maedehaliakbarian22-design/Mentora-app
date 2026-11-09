// Pure navigation stack for the single-page shell. No DOM access, so it is
// unit-testable and the Android back button can pop it deterministically.

export const ROUTES = Object.freeze({
  SELECTION: 'selection',
  DASHBOARD: 'dashboard',
  SUBJECT: 'subject',
  CHAPTER: 'chapter',
  SECTION: 'section',
  PRACTICE: 'practice',
  RESULT: 'result',
  HOME: 'home',
  PROFILE: 'profile',
});

const ROUTE_NAMES = Object.freeze(Object.values(ROUTES));

function normalize(route) {
  if (!route || typeof route !== 'object' || !ROUTE_NAMES.includes(route.name)) {
    throw new TypeError(`unknown route: ${JSON.stringify(route)}`);
  }
  return Object.freeze({ ...route });
}

export function createNavigator(initial = { name: ROUTES.DASHBOARD }) {
  const stack = [normalize(initial)];

  const current = () => stack[stack.length - 1];

  return {
    current,
    depth: () => stack.length,
    canGoBack: () => stack.length > 1,
    push(route) {
      stack.push(normalize(route));
      return current();
    },
    replace(route) {
      stack[stack.length - 1] = normalize(route);
      return current();
    },
    // Pops one level. Returns false when already at the root, so the caller
    // can decide to leave the app instead.
    back() {
      if (stack.length <= 1) return false;
      stack.pop();
      return true;
    },
    reset(route) {
      stack.length = 0;
      stack.push(normalize(route));
      return current();
    },
  };
}
