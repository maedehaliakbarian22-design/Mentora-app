// Test helpers. Not a test file (no .test.js suffix).
import { CATALOG, indexCatalog } from '../../www/js/content/catalog.js';

export const realIndex = () => indexCatalog(CATALOG);

// In-memory Storage. Options:
//   failSet(key, value) -> true makes setItem throw.
//   dropSet(key, value) -> true makes setItem silently store nothing (readback mismatch).
export function fakeStorage(initial = {}, opts = {}) {
  const map = new Map(Object.entries(initial));
  return {
    _map: map,
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      if (opts.failSet && opts.failSet(k, String(v))) throw new Error('quota');
      if (opts.dropSet && opts.dropSet(k, String(v))) return;
      map.set(k, String(v));
    },
    removeItem(k) { map.delete(k); },
  };
}

export function backupKeys(storage, prefix) {
  return [...storage._map.keys()].filter((k) => k.startsWith(prefix));
}

// Small catalog for scenarios that need two sections with questions.
export function twoSectionIndex() {
  return indexCatalog({
    grades: [{ id: 'g', label: 'g', fields: [{ id: 'f', label: 'f', available: true }] }],
    subjects: [{ id: 's', label: 's', gradeId: 'g', fieldId: 'f', chapters: ['c'] }],
    chapters: [{
      id: 'c', subjectId: 's', title: 'c', titleVerified: false,
      sections: [
        { id: 'A', title: 'A', placeholder: false, body: [], questions: [
          { id: 'a1', status: 'demo', prompt: 'a1', options: ['x', 'y'], optionIds: ['ax', 'ay'], correctIndex: 0 },
          { id: 'a2', status: 'demo', prompt: 'a2', options: ['x', 'y'], optionIds: ['ax', 'ay'], correctIndex: 1 },
        ] },
        { id: 'B', title: 'B', placeholder: false, body: [], questions: [
          { id: 'b1', status: 'demo', prompt: 'b1', options: ['x', 'y'], optionIds: ['bx', 'by'], correctIndex: 0 },
        ] },
      ],
    }],
  });
}

// Deterministic clock and ids.
export function sequence(prefix = 'id') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
export function ticking() {
  let t = 0;
  return () => new Date(2026, 10, 11, 15, 0, t++);
}
