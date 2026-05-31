'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadFallbackApi() {
  const filePath = path.join(__dirname, '..', 'src/common/api.js');
  const code = fs.readFileSync(filePath, 'utf8').replace(/^export\s+/mg, '');
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require,
    console,
    Date,
    Math,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Promise,
    RegExp,
    Buffer,
    setTimeout,
    clearTimeout,
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  return sandbox.callAiemsFunction || sandbox.module.exports.callAiemsFunction || sandbox.exports.callAiemsFunction;
}

test('fallback ask-assistant answers anonymous evaluation questions', async () => {
  const callAiemsFunction = loadFallbackApi();
  const result = await callAiemsFunction('ask-assistant', {
    session: { userId: 'u_student_001', role: 'student', displayName: 'Alice Chen' },
    query: '\u8bfe\u7a0b\u8bc4\u4ef7\u662f\u533f\u540d\u7684\u5417',
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.sourceTitle, 'Anonymous course evaluations');
  assert.match(result.data.answer, /匿名课程评价：/);
  assert.match(result.data.answer, /\u6210\u6548 5\.0\/5/);
  assert.match(result.data.answer, /The course is practical and useful for project architecture/);

  const history = await callAiemsFunction('get-ai-history', {
    session: { userId: 'u_student_001', role: 'student', displayName: 'Alice Chen' },
    forceRefresh: true,
  });

  assert.equal(history.ok, true);
  assert.equal(history.data.activeConversationId, result.data.conversationId);
  assert.equal(history.data.messages.length, 2);
});

test('fallback ask-assistant answers roster queries for admins', async () => {
  const callAiemsFunction = loadFallbackApi();
  const result = await callAiemsFunction('ask-assistant', {
    session: { userId: 'u_admin_001', role: 'admin', displayName: 'Academic Admin' },
    query: '\u7ed9\u6211\u5b66\u751f\u540d\u5355',
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.sourceTitle, 'Student roster');
  assert.match(result.data.answer, /学生名单：/);
  assert.match(result.data.answer, /Alice Chen/);
});