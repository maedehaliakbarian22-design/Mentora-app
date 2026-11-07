// Pure Select → Check transitions for one practice question.
//
// Selecting an option only changes a pending choice held in memory. Check is
// the only transition that evaluates an answer, and the caller records it once
// through the existing progress store. Nothing here touches storage or the DOM.

import { evaluateAnswer } from './evaluate.js';

// Correct answers advance automatically after this delay. Incorrect answers
// never advance automatically.
export const AUTO_ADVANCE_MS = 1200;

// Per-question UI state. `key` identifies the question, so a new question starts
// from a clean state.
export function newPracticeUi(key) {
  return { key, pending: null, checked: false, advanced: false, autoAdvanceCancelled: false };
}

// Changes the pending choice. Ignored once the answer is locked or out of range.
export function selectOption(ui, locked, index, optionCount) {
  if (locked || ui.checked) return ui;
  if (!Number.isInteger(index) || index < 0 || index >= optionCount) return ui;
  return { ...ui, pending: index };
}

export function canCheck(ui, locked) {
  return !locked && !ui.checked && ui.pending !== null;
}

// Evaluates the pending choice exactly once. Returns the outcome to record, or
// null when Check is not allowed (no selection, already locked, or already checked).
export function checkAnswer(ui, locked, question) {
  if (locked || ui.checked || ui.pending === null) return { ui, outcome: null };
  const { correct } = evaluateAnswer(question, ui.pending);
  return {
    ui: { ...ui, checked: true },
    outcome: { selectedIndex: ui.pending, correct },
  };
}

// Whether, and after how long, an outcome schedules automatic advance.
export function autoAdvancePlan(outcome) {
  return outcome && outcome.correct ? { scheduleMs: AUTO_ADVANCE_MS } : { scheduleMs: null };
}

// Continue or the timer may advance at most once per question. The timer is
// ignored once it has been cancelled. Continue is still accepted.
export function requestAdvance(ui, locked, source) {
  if (!locked || ui.advanced) return { ui, advance: false };
  if (source === 'timer' && ui.autoAdvanceCancelled) return { ui, advance: false };
  return { ui: { ...ui, advanced: true }, advance: true };
}

// Marks the automatic advance as cancelled (Back, app background). Does not lock
// or unlock anything.
export function cancelAutoAdvance(ui) {
  return ui.autoAdvanceCancelled ? ui : { ...ui, autoAdvanceCancelled: true };
}
