// Content catalog: grades → fields → subjects → chapters → sections → questions.
//
// Content status rules (enforced by validate.js):
//   - A chapter whose title came from the textbook sets titleVerified: true.
//   - A section with placeholder: true contains no textbook content.
//   - A question with status 'demo' is exercise-flow test data, NOT chemistry
//     and has no textbook source. It is labelled as demo in the UI.
//   - A question with status 'verified' must carry a source reference. No
//     verified questions exist yet: real Chapter 1 content is still needed.
//
// Option identity: every question has `optionIds`, parallel to `options`.
// An option's id travels with its text. Attempts store the id (selectedOptionId),
// never the array position, so reordering options does not change history.
// Reorder `options` and `optionIds` together, and keep `correctIndex` pointing
// at the correct text.

export const CATALOG = Object.freeze({
  version: 1,
  grades: Object.freeze([
    Object.freeze({
      id: 'grade-10',
      label: 'پایه دهم',
      fields: Object.freeze([
        Object.freeze({ id: 'experimental', label: 'علوم تجربی', available: true }),
        Object.freeze({ id: 'math', label: 'ریاضی و فیزیک', available: false }),
        Object.freeze({ id: 'humanities', label: 'علوم انسانی', available: false }),
      ]),
    }),
    Object.freeze({ id: 'grade-11', label: 'پایه یازدهم', fields: Object.freeze([]) }),
    Object.freeze({ id: 'grade-12', label: 'پایه دوازدهم', fields: Object.freeze([]) }),
  ]),
  subjects: Object.freeze([
    Object.freeze({
      id: 'chemistry',
      label: 'شیمی',
      gradeId: 'grade-10',
      fieldId: 'experimental',
      chapters: Object.freeze(['chapter-1']),
    }),
  ]),
  chapters: Object.freeze([
    Object.freeze({
      id: 'chapter-1',
      subjectId: 'chemistry',
      title: 'کیهان، زادگاه عناصر',
      titleVerified: true,
      sections: Object.freeze([
        Object.freeze({
          id: 'chapter-1-section-1',
          title: 'بخش ۱',
          placeholder: true,
          body: Object.freeze([
            'این متن جای‌نگهدار است. متن تأییدشدهٔ کتاب هنوز وارد نشده است.',
          ]),
          questions: Object.freeze([
            Object.freeze({
              id: 'demo-q1',
              status: 'demo',
              prompt: 'نمونه: حاصل ۲ + ۳ چند است؟',
              options: Object.freeze(['4', '5', '6']),
              optionIds: Object.freeze(['o-4', 'o-5', 'o-6']),
              correctIndex: 1,
            }),
            Object.freeze({
              id: 'demo-q2',
              status: 'demo',
              prompt: 'نمونه: حاصل ۱۰ − ۴ چند است؟',
              options: Object.freeze(['6', '5', '4']),
              optionIds: Object.freeze(['o-6', 'o-5', 'o-4']),
              correctIndex: 0,
            }),
            Object.freeze({
              id: 'demo-q3',
              status: 'demo',
              prompt: 'نمونه: حاصل ۳ × ۴ چند است؟',
              options: Object.freeze(['7', '12', '14']),
              optionIds: Object.freeze(['o-7', 'o-12', 'o-14']),
              correctIndex: 1,
            }),
          ]),
        }),
        Object.freeze({
          id: 'chapter-1-section-2',
          title: 'بخش ۲',
          placeholder: true,
          body: Object.freeze([
            'این بخش جای‌نگهدار است. محتوای تأییدشده هنوز در دسترس نیست.',
          ]),
          questions: Object.freeze([]),
        }),
      ]),
    }),
  ]),
});

// Lookup tables built once from a catalog. Pure: never mutates the input.
export function indexCatalog(catalog) {
  const grades = new Map();
  const fields = new Map();
  const subjects = new Map();
  const chapters = new Map();
  const sections = new Map();
  const questions = new Map();
  for (const g of catalog.grades || []) {
    grades.set(g.id, g);
    for (const f of g.fields || []) fields.set(`${g.id}/${f.id}`, { ...f, gradeId: g.id });
  }
  for (const s of catalog.subjects || []) subjects.set(s.id, s);
  for (const c of catalog.chapters || []) {
    chapters.set(c.id, c);
    for (const sec of c.sections || []) {
      sections.set(sec.id, { ...sec, chapterId: c.id });
      for (const q of sec.questions || []) questions.set(q.id, { ...q, sectionId: sec.id });
    }
  }
  return { grades, fields, subjects, chapters, sections, questions };
}
