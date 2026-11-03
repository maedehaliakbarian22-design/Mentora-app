// Pure answer evaluation and result calculation for the demo practice flow.
// This module records and scores answers only. It does not compute or name
// any Learning State.

export function evaluateAnswer(question, selectedIndex) {
  if (!question || !Array.isArray(question.options)) {
    throw new TypeError('question with options is required');
  }
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= question.options.length) {
    throw new RangeError(`selectedIndex out of range: ${String(selectedIndex)}`);
  }
  return {
    correct: selectedIndex === question.correctIndex,
    correctIndex: question.correctIndex,
  };
}

// Scores answers against the questions. `correct` is recomputed from the
// question content, never trusted from stored data.
export function computeResult(questions, answers) {
  const total = questions.length;
  let answered = 0;
  let correct = 0;
  for (const q of questions) {
    const entry = answers[q.id];
    if (!entry) continue;
    answered += 1;
    if (evaluateAnswer(q, entry.selectedIndex).correct) correct += 1;
  }
  const percent = total === 0 ? 0 : Math.round((correct * 100) / total);
  return { total, answered, correct, percent, complete: answered === total };
}
