// Structural validation for demo content. Returns a list of error strings;
// an empty list means the content is structurally valid.

export function validateContent(content) {
  const errors = [];
  if (!content || typeof content !== 'object') {
    return ['content must be an object'];
  }
  if (content.demo !== true) {
    errors.push('content must be marked demo: true');
  }

  const chapter = content.chapter;
  if (!chapter || typeof chapter.id !== 'string' || !chapter.id) {
    errors.push('chapter.id is required');
  }
  if (!chapter || typeof chapter.title !== 'string' || !chapter.title.trim()) {
    errors.push('chapter.title is required');
  }

  const lessons = Array.isArray(content.lessons) ? content.lessons : [];
  const lessonIds = new Set();
  if (lessons.length === 0) errors.push('at least one lesson is required');
  for (const lesson of lessons) {
    if (!lesson || typeof lesson.id !== 'string' || !lesson.id) {
      errors.push('lesson.id is required');
      continue;
    }
    if (lessonIds.has(lesson.id)) errors.push(`duplicate lesson id: ${lesson.id}`);
    lessonIds.add(lesson.id);
    if (typeof lesson.title !== 'string' || !lesson.title.trim()) {
      errors.push(`lesson ${lesson.id} needs a title`);
    }
    if (!Array.isArray(lesson.body) || lesson.body.length === 0) {
      errors.push(`lesson ${lesson.id} needs body paragraphs`);
    }
  }

  const questions = Array.isArray(content.questions) ? content.questions : [];
  const questionIds = new Set();
  for (const q of questions) {
    if (!q || typeof q.id !== 'string' || !q.id) {
      errors.push('question.id is required');
      continue;
    }
    if (questionIds.has(q.id)) errors.push(`duplicate question id: ${q.id}`);
    questionIds.add(q.id);
    if (q.demo !== true) errors.push(`question ${q.id} must be demo: true`);
    if (!lessonIds.has(q.lessonId)) errors.push(`question ${q.id} references unknown lesson`);
    if (typeof q.prompt !== 'string' || !q.prompt.trim()) {
      errors.push(`question ${q.id} needs a prompt`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      errors.push(`question ${q.id} needs at least two options`);
    } else {
      if (new Set(q.options).size !== q.options.length) {
        errors.push(`question ${q.id} has duplicate options`);
      }
      if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        errors.push(`question ${q.id} has an invalid correctIndex`);
      }
    }
  }
  if (questions.length === 0) errors.push('at least one question is required');
  return errors;
}
