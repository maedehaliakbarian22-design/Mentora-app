// Structural and status validation for a content catalog. Returns a list of
// human-readable error strings; an empty list means the catalog is usable.
// Pure: no DOM, no storage.

export function validateCatalog(catalog) {
  const errors = [];
  const seen = new Set();
  const claim = (kind, id) => {
    if (typeof id !== 'string' || id.trim() === '') {
      errors.push(`${kind}: id must be a non-empty string`);
      return false;
    }
    if (seen.has(id)) {
      errors.push(`${kind} "${id}": duplicate id`);
      return false;
    }
    seen.add(id);
    return true;
  };

  if (!catalog || typeof catalog !== 'object') {
    return ['catalog: must be an object'];
  }

  const fieldKeys = new Set();
  for (const g of catalog.grades || []) {
    if (claim('grade', g.id) && (typeof g.label !== 'string' || !g.label)) {
      errors.push(`grade "${g.id}": label is required`);
    }
    for (const f of g.fields || []) {
      fieldKeys.add(`${g.id}/${f.id}`);
      if (typeof f.id !== 'string' || !f.id) errors.push(`field in "${g.id}": id is required`);
      if (typeof f.available !== 'boolean') errors.push(`field "${f.id}": available must be boolean`);
    }
  }

  const chapterIds = new Set();
  for (const s of catalog.subjects || []) {
    claim('subject', s.id);
    if (!fieldKeys.has(`${s.gradeId}/${s.fieldId}`)) {
      errors.push(`subject "${s.id}": unknown grade/field ${s.gradeId}/${s.fieldId}`);
    }
    for (const cid of s.chapters || []) {
      if (!(catalog.chapters || []).some((c) => c.id === cid)) {
        errors.push(`subject "${s.id}": missing chapter "${cid}"`);
      }
    }
  }

  for (const c of catalog.chapters || []) {
    claim('chapter', c.id);
    chapterIds.add(c.id);
    if (typeof c.title !== 'string' || !c.title) errors.push(`chapter "${c.id}": title is required`);
    if (!(catalog.subjects || []).some((s) => s.id === c.subjectId)) {
      errors.push(`chapter "${c.id}": unknown subject "${c.subjectId}"`);
    }
    if (!Array.isArray(c.sections) || c.sections.length === 0) {
      errors.push(`chapter "${c.id}": at least one section is required`);
    }
    for (const sec of c.sections || []) {
      claim('section', sec.id);
      if (typeof sec.title !== 'string' || !sec.title) errors.push(`section "${sec.id}": title is required`);
      if (typeof sec.placeholder !== 'boolean') errors.push(`section "${sec.id}": placeholder must be boolean`);
      if (!Array.isArray(sec.body) || sec.body.length === 0) {
        errors.push(`section "${sec.id}": body must be a non-empty array`);
      }
      if (sec.placeholder === false && (sec.body || []).some((p) => typeof p !== 'string' || !p)) {
        errors.push(`section "${sec.id}": body paragraphs must be non-empty strings`);
      }
      for (const q of sec.questions || []) {
        validateQuestion(q, sec.id, claim, errors);
      }
    }
  }

  return errors;
}

function validateQuestion(q, sectionId, claim, errors) {
  claim('question', q.id);
  const where = `question "${q.id}" in section "${sectionId}"`;
  if (q.status !== 'demo' && q.status !== 'verified') {
    errors.push(`${where}: status must be 'demo' or 'verified'`);
  }
  if (q.status === 'verified' && (typeof q.source !== 'string' || !q.source)) {
    errors.push(`${where}: verified questions need a source reference`);
  }
  if (typeof q.prompt !== 'string' || !q.prompt) errors.push(`${where}: prompt is required`);
  if (!Array.isArray(q.options) || q.options.length < 2) {
    errors.push(`${where}: at least two options are required`);
  } else {
    if (new Set(q.options).size !== q.options.length) errors.push(`${where}: options must be distinct`);
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
      errors.push(`${where}: correctIndex out of range`);
    }
  }
}
