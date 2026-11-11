// Practice session identity and reconciliation. Pure: no storage, no DOM.
//
// Lifecycle rules (a practice run is one pass through one section):
//   - Background and resume: same run. Nothing is reset.
//   - Termination and restart with unfinished work: same run, because the run
//     id is stored on the section and in the Attempt Log.
//   - Restarting a section: its run is closed (added to closedRunIds). The next
//     Check starts a new run. Closed runs stay in the log but are never current.
//   - Switching sections: each section has its own run id, so runs are independent.
//   - Corrupt or missing history: nothing is invented. Existing answers are kept
//     and reported as unlogged. The Attempt Log is authoritative for answers
//     that it holds.

// Reconciles one section's cache against its log records.
// state: { answers, runId, closedRunIds }. sectionRecords: validated log records
// (view or record shape with questionId, sessionId, selectedOptionId).
// Returns { state, changed, notices: { unlogged, restored, overridden } }.
export function reconcileSection(state, sectionRecords, index) {
  const closed = new Set(state.closedRunIds);
  const open = sectionRecords.filter((r) => !closed.has(r.sessionId));

  // Latest open record per question. Later records win.
  const latest = new Map();
  for (const r of open) latest.set(r.questionId, r);

  const answers = { ...state.answers };
  let restored = 0;
  let overridden = 0;
  for (const [questionId, r] of latest) {
    const q = index.questions.get(questionId);
    const i = q ? q.optionIds.indexOf(r.selectedOptionId) : -1;
    if (i < 0) continue;
    if (answers[questionId] === undefined) restored += 1;
    else if (answers[questionId] !== i) overridden += 1;
    answers[questionId] = i;
  }

  // The current run is the run of the latest open record, when one exists.
  // That is the log's answer. Without log records, the cached run id is kept.
  const last = open.length > 0 ? open[open.length - 1] : null;
  const runId = last ? last.sessionId : state.runId;

  const unlogged = Object.keys(answers).filter((qid) => !latest.has(qid));
  const next = { answers, runId, closedRunIds: state.closedRunIds };
  const changed = JSON.stringify(next) !== JSON.stringify({
    answers: state.answers, runId: state.runId, closedRunIds: state.closedRunIds,
  });
  return { state: next, changed, notices: { unlogged, restored, overridden } };
}
