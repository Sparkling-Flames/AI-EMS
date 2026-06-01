"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createAcademicSeed,
  createMockDb,
  loadCloudFunction,
} = require("./test-utils.cjs");

test("[Functional] auth-login validates an active database account", async () => {
  const db = createMockDb(createAcademicSeed());
  const login = loadCloudFunction("auth-login", db);

  const result = await login({ username: "student001", password: "Student123!" });

  assert.equal(result.ok, true);
  assert.equal(result.user.userId, "user_s_001");
  assert.equal(result.user.role, "student");
  assert.equal(result.user.displayName, "Alice Chen");
  assert.equal(db.snapshot("audit_logs").some((row) => row.action === "login"), true);
});

test("[Functional] leave approval synchronizes attendance to on_leave", async () => {
  const db = createMockDb(createAcademicSeed());
  const submitLeave = loadCloudFunction("submit-leave", db);
  const reviewLeave = loadCloudFunction("review-leave", db);
  const studentSession = { role: "student", userId: "user_s_001", displayName: "Alice Chen" };
  const teacherSession = { role: "teacher", userId: "user_t_001", displayName: "Dr. Zhang" };

  const submitted = await submitLeave({
    session: studentSession,
    courseOfferingId: "co_future",
    leaveDate: "2099-06-15",
    reasonType: "sick",
    reasonDetail: "Medical appointment.",
  });

  assert.equal(submitted.ok, true);
  assert.equal(submitted.leave.status, "pending");

  const reviewed = await reviewLeave({
    session: teacherSession,
    leaveId: submitted.leave._id,
    decision: "approved",
    reviewComment: "Approved.",
  });

  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.leave.status, "approved");

  const attendance = db.snapshot("attendance_records").find((row) => row._id === "att_future_absent");
  assert.equal(attendance.status, "on_leave");
  assert.equal(attendance.source, "leave_auto");
  assert.equal(attendance.leave_request_id, submitted.leave._id);

  const leaveSession = db.snapshot("leave_request_sessions")[0];
  assert.equal(leaveSession.previous_status, "absent");
  assert.equal(leaveSession.attendance_record_id, "att_future_absent");
});

test("[Functional] anonymous course evaluation stores no student identifier", async () => {
  const db = createMockDb(createAcademicSeed());
  const submitEvaluation = loadCloudFunction("submit-evaluation", db);

  const result = await submitEvaluation({
    session: { role: "student", userId: "user_s_001" },
    courseId: "course_software_design",
    courseOfferingId: "co_completed",
    rating: 5,
    feedback: "The course has clear project requirements and useful examples.",
    scores: {
      content: 5,
      teaching_method: 5,
      difficulty: 4,
      workload: 4,
      achievement: 5,
      overall: 5,
    },
  });

  assert.equal(result.code, 200);
  assert.equal(result.data.evaluation.status, "submitted");

  const stored = db.snapshot("course_evaluations")[0];
  assert.ok(stored.token_hash);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, "student_id"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, "user_id"), false);
  assert.equal(stored.feedback_text.includes("clear project"), true);
});

test("[Functional] AI assistant answers from the local knowledge base", async () => {
  const db = createMockDb(createAcademicSeed());
  const askAssistant = loadCloudFunction("ask-assistant", db);

  const result = await askAssistant({
    session: { role: "student", userId: "user_s_001", displayName: "Alice Chen" },
    query: "What credits should I check before graduation?",
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.fallbackUsed, true);
  assert.equal(/credit/i.test(result.data.answer), true);
  assert.ok(result.data.conversationId);
  assert.equal(db.snapshot("ai_messages").length, 2);
});
