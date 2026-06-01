"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createAcademicSeed,
  createMockDb,
  loadCloudFunction,
  loadFrontendApiModule,
  md5Hex,
} = require("./test-utils.cjs");

test("[Error Handling] auth-login rejects an invalid password", async () => {
  const db = createMockDb(createAcademicSeed());
  const login = loadCloudFunction("auth-login", db);

  const result = await login({ username: "student001", password: "WrongPassword" });

  assert.equal(result.ok, false);
  assert.match(result.message, /invalid/i);
});

test("[Error Handling] submit-leave rejects a non-student session", async () => {
  const db = createMockDb(createAcademicSeed());
  const submitLeave = loadCloudFunction("submit-leave", db);

  const result = await submitLeave({
    session: { role: "teacher", userId: "user_t_001" },
    courseOfferingId: "co_future",
    leaveDate: "2099-06-15",
    reasonDetail: "Wrong role.",
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /students can submit/i);
});

test("[Error Handling] review-leave rejects invalid decisions", async () => {
  const seed = createAcademicSeed();
  seed.leave_requests.push({
    _id: "leave_pending",
    student_id: "stu_001",
    course_offering_id: "co_future",
    leave_date: "2099-06-15",
    reason_type: "sick",
    reason_detail: "Medical appointment.",
    status: "pending",
  });
  const db = createMockDb(seed);
  const reviewLeave = loadCloudFunction("review-leave", db);

  const result = await reviewLeave({
    session: { role: "teacher", userId: "user_t_001" },
    leaveId: "leave_pending",
    decision: "maybe",
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /approved.*rejected/i);
});

test("[Error Handling] submit-evaluation rejects duplicate submissions", async () => {
  const seed = createAcademicSeed();
  seed.course_evaluations.push({
    _id: "eval_existing",
    course_id: "course_software_design",
    course_offering_id: "co_completed",
    token_hash: md5Hex("user_s_001:co_completed"),
    scores: {
      content: 5,
      teaching_method: 5,
      difficulty: 4,
      workload: 4,
      achievement: 5,
      overall: 5,
    },
    feedback_text: "Existing anonymous feedback.",
    status: "submitted",
  });
  const db = createMockDb(seed);
  const submitEvaluation = loadCloudFunction("submit-evaluation", db);

  const result = await submitEvaluation({
    session: { role: "student", userId: "user_s_001" },
    courseId: "course_software_design",
    courseOfferingId: "co_completed",
    rating: 5,
    feedback: "Trying to submit again.",
    scores: {
      content: 5,
      teaching_method: 5,
      difficulty: 4,
      workload: 4,
      achievement: 5,
      overall: 5,
    },
  });

  assert.equal(result.code, 400);
  assert.match(result.message, /already submitted/i);
});

test("[Error Handling] frontend API falls back for read failures and blocks strict write failures", async () => {
  const api = loadFrontendApiModule({
    uniCloud: {
      callFunction() {
        return Promise.reject(new Error("simulated cloud outage"));
      },
    },
  });

  const readResult = await api.callAiemsFunction("get-dashboard-data", {
    session: { role: "admin", userId: "user_admin_001" },
  });
  const writeResult = await api.callAiemsFunction("submit-leave", {
    session: { role: "student", userId: "user_s_001" },
    courseOfferingId: "co_future",
    leaveDate: "2099-06-15",
    reasonDetail: "Network failure path.",
  });

  assert.equal(readResult.ok, true);
  assert.equal(readResult.data.meta.source, "local-fallback");
  assert.equal(writeResult.ok, false);
  assert.match(writeResult.message, /cloud function submit-leave failed/i);
});
