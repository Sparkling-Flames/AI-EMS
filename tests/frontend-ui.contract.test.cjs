'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('evaluation review pages expose teacher/course filters and readable score cells', () => {
  const listPage = readProjectFile('src/pages/evaluation/evaluation.vue');
  const detailPage = readProjectFile('src/pages/evaluation/details.vue');

  assert.match(listPage, /reviewTeacherNames/);
  assert.match(listPage, /reviewCourseNames/);
  assert.match(listPage, /visibleReviewGroups/);
  assert.match(listPage, /dimension-label/);
  assert.match(listPage, /dimension-value/);
  assert.match(listPage, /resolveReviewCourseLabel/);

  assert.match(detailPage, /teacherNames/);
  assert.match(detailPage, /courseNames/);
  assert.match(detailPage, /filteredGroups/);
  assert.match(detailPage, /dimension-label/);
  assert.match(detailPage, /dimension-value/);
  assert.match(detailPage, /resolveGroupCourseLabel/);
});

test('student materials hide raw URLs and keep download as the student action', () => {
  const materialsPage = readProjectFile('src/pages/materials/materials.vue');

  assert.match(materialsPage, /downloadMaterial/);
  assert.doesNotMatch(materialsPage, /Copy URL/i);
  assert.doesNotMatch(materialsPage, /copyUrl/i);
});

test('assistant history is loaded without cache and keyed by the active account', () => {
  const assistantPage = readProjectFile('src/pages/assistant/assistant.vue');
  const api = readProjectFile('src/common/api.js');

  assert.match(api, /"get-ai-history":\s*0/);
  assert.match(assistantPage, /activeSessionKey/);
  assert.match(assistantPage, /loadHistory/);
  assert.match(assistantPage, /forceRefresh:\s*true/);
  assert.match(assistantPage, /sessionStorageKey/);
});
