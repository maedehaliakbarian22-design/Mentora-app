// Android hardware back-button handling.
//
// When running inside Capacitor, plugins are exposed on window.Capacitor.Plugins.
// In a plain browser they are absent: the Escape key is used instead, and
// exiting the app is a no-op.

export function getCapacitorApp(globalRef = globalThis) {
  const cap = globalRef.Capacitor;
  return cap && cap.Plugins && cap.Plugins.App ? cap.Plugins.App : null;
}

// onBack() must return true when it handled the press (for example by popping
// the navigation stack) and false when the app should close.
export function registerBackButton(onBack, globalRef = globalThis) {
  const app = getCapacitorApp(globalRef);
  let handle = null;
  let disposed = false;

  const press = () => {
    const handled = onBack();
    if (!handled && app && typeof app.exitApp === 'function') {
      app.exitApp();
    }
  };

  if (app && typeof app.addListener === 'function') {
    Promise.resolve(app.addListener('backButton', press))
      .then((h) => {
        if (disposed) {
          if (h && typeof h.remove === 'function') h.remove();
        } else {
          handle = h;
        }
      })
      .catch(() => {});
  }

  const onKey = (event) => {
    if (event.key === 'Escape' && !app) press();
  };
  if (!app && typeof globalRef.addEventListener === 'function') {
    globalRef.addEventListener('keydown', onKey);
  }

  return {
    isNative: Boolean(app),
    dispose() {
      disposed = true;
      if (handle && typeof handle.remove === 'function') handle.remove();
      if (typeof globalRef.removeEventListener === 'function') {
        globalRef.removeEventListener('keydown', onKey);
      }
    },
  };
}
