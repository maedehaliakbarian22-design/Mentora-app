// Demo content for the Mentora prototype.
//
// IMPORTANT: Everything in this file is DEMO / نمونه آزمایشی unless explicitly
// marked otherwise. The only verified item is the chapter title. Lesson body
// text and questions are placeholders used to exercise the app flow. They are
// NOT textbook content and contain NO chemistry facts.

export const CONTENT = Object.freeze({
  demo: true,
  chapter: Object.freeze({
    id: 'chapter-1',
    title: 'کیهان، زادگاه عناصر',
    titleVerified: true,
    grade: 10,
    subject: 'شیمی',
  }),
  lessons: Object.freeze([
    Object.freeze({
      id: 'lesson-1',
      title: 'درس نمونه ۱',
      demo: true,
      bodyVerified: false,
      body: Object.freeze([
        'این متن جای‌نگهدار است. محتوای درسی تأییدشده از کتاب هنوز در دسترس نیست.',
        'در این نسخهٔ آزمایشی، تمرین‌ها فقط برای آزمودن جریان برنامه طراحی شده‌اند.',
      ]),
    }),
  ]),
  questions: Object.freeze([
    Object.freeze({
      id: 'q1',
      lessonId: 'lesson-1',
      demo: true,
      prompt: 'نمونه: حاصل ۲ + ۳ چند است؟',
      options: Object.freeze(['4', '5', '6']),
      correctIndex: 1,
    }),
    Object.freeze({
      id: 'q2',
      lessonId: 'lesson-1',
      demo: true,
      prompt: 'نمونه: حاصل ۱۰ − ۴ چند است؟',
      options: Object.freeze(['6', '5', '4']),
      correctIndex: 0,
    }),
    Object.freeze({
      id: 'q3',
      lessonId: 'lesson-1',
      demo: true,
      prompt: 'نمونه: حاصل ۳ × ۴ چند است؟',
      options: Object.freeze(['7', '12', '14']),
      correctIndex: 1,
    }),
  ]),
});

export const DEMO_LABEL = 'نمونه آزمایشی';
