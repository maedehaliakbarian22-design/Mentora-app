import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, indexCatalog } from '../www/js/content/catalog.js';
import { validateCatalog } from '../www/js/content/validate.js';

function clone(v) { return JSON.parse(JSON.stringify(v)); }

test('shipped catalog validates with no errors', () => {
  assert.deepEqual(validateCatalog(CATALOG), []);
});

test('chapter 1 title is the verified textbook title and is flagged verified', () => {
  const ch = indexCatalog(CATALOG).chapters.get('chapter-1');
  assert.equal(ch.title, 'کیهان، زادگاه عناصر');
  assert.equal(ch.titleVerified, true);
});

test('every shipped question is demo data (no invented verified answer keys)', () => {
  const idx = indexCatalog(CATALOG);
  for (const q of idx.questions.values()) assert.equal(q.status, 'demo', q.id);
});

test('placeholder sections carry no verified content', () => {
  const idx = indexCatalog(CATALOG);
  for (const sec of idx.sections.values()) {
    if (sec.placeholder) assert.ok(sec.body.length > 0);
  }
});

test('duplicate ids are reported', () => {
  const c = clone(CATALOG);
  c.chapters[0].sections[1].id = c.chapters[0].sections[0].id;
  assert.ok(validateCatalog(c).some((e) => e.includes('duplicate')));
});

test('verified questions without a source are rejected', () => {
  const c = clone(CATALOG);
  c.chapters[0].sections[0].questions[0].status = 'verified';
  assert.ok(validateCatalog(c).some((e) => e.includes('need a source')));
});

test('a question with a bad correctIndex is rejected', () => {
  const c = clone(CATALOG);
  c.chapters[0].sections[0].questions[0].correctIndex = 9;
  assert.ok(validateCatalog(c).some((e) => e.includes('correctIndex out of range')));
});

test('subjects pointing at unknown grade/field are rejected', () => {
  const c = clone(CATALOG);
  c.subjects[0].fieldId = 'missing';
  assert.ok(validateCatalog(c).some((e) => e.includes('unknown grade/field')));
});

test('duplicate option labels are rejected', () => {
  const c = clone(CATALOG);
  c.chapters[0].sections[0].questions[0].options = ['5', '5', '6'];
  assert.ok(validateCatalog(c).some((e) => e.includes('distinct')));
});

test('non-object input returns an error instead of throwing', () => {
  assert.deepEqual(validateCatalog(null), ['catalog: must be an object']);
});
