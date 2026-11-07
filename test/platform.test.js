import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerBackButton, getCapacitorApp } from '../www/js/core/platform.js';

function fakeNative() {
  const state = { listeners: {}, exited: 0, removed: 0 };
  const app = {
    addListener(name, fn) {
      state.listeners[name] = fn;
      return Promise.resolve({ remove() { state.removed += 1; } });
    },
    exitApp() { state.exited += 1; },
  };
  return { state, globalRef: { Capacitor: { Plugins: { App: app } } } };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test('detects the Capacitor App plugin only when present', () => {
  assert.equal(getCapacitorApp({}), null);
  assert.equal(getCapacitorApp({ Capacitor: { Plugins: {} } }), null);
  const { globalRef } = fakeNative();
  assert.ok(getCapacitorApp(globalRef));
});

test('back press that is handled does not exit the app', async () => {
  const { state, globalRef } = fakeNative();
  const handle = registerBackButton(() => true, globalRef);
  await flush();
  state.listeners.backButton();
  assert.equal(state.exited, 0);
  assert.equal(handle.isNative, true);
});

test('back press that is not handled exits the app (root screen)', async () => {
  const { state, globalRef } = fakeNative();
  registerBackButton(() => false, globalRef);
  await flush();
  state.listeners.backButton();
  assert.equal(state.exited, 1);
});

test('dispose removes the native listener even if registration finishes later', async () => {
  const { state, globalRef } = fakeNative();
  const handle = registerBackButton(() => true, globalRef);
  handle.dispose();
  await flush();
  assert.equal(state.removed, 1);
});

test('in a browser, Escape triggers onBack and other keys do not', () => {
  const listeners = {};
  const globalRef = {
    addEventListener(name, fn) { listeners[name] = fn; },
    removeEventListener(name) { delete listeners[name]; },
  };
  let calls = 0;
  const handle = registerBackButton(() => { calls += 1; return true; }, globalRef);
  assert.equal(handle.isNative, false);
  listeners.keydown({ key: 'Enter' });
  assert.equal(calls, 0);
  listeners.keydown({ key: 'Escape' });
  assert.equal(calls, 1);
  handle.dispose();
  assert.equal(listeners.keydown, undefined);
});
