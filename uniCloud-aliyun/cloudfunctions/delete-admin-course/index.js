"use strict";

const db = uniCloud.database();

exports.main = async (event = {}) => {
  const session = event.session || {};
  if (session.role !== "admin" || !session.userId) {
    return { ok: false, message: "Only administrators can delete courses." };
  }

  const courseOfferingId = String(event.courseOfferingId || event.offeringId || event.course_offering_id || "").trim();
  const courseId = String(event.courseId || event.course_id || "").trim();
  if (!courseOfferingId && !courseId) {
    return { ok: false, message: "Course offering id is required." };
  }

  const [
    courses,
    offerings,
    classSessions,
    enrollments,
    attendanceRecords,
    leaveRequests,
    leaveRequestSessions,
    evaluations,
    materials,
    evaluationTokens,
    evaluationSummaries,
    recommendations,
    academicAlerts,
    grades,
  ] = await Promise.all([
    readCollection("courses"),
    readCollection("course_offerings"),
    readCollection("class_sessions"),
    readCollection("enrollments"),
    readCollection("attendance_records"),
    readCollection("leave_requests"),
    readCollection("leave_request_sessions"),
    readCollection("course_evaluations"),
    readCollection("course_materials"),
    readCollection("evaluation_tokens"),
    readCollection("course_evaluation_summaries"),
    readCollection("course_recommendations"),
    readCollection("academic_alerts"),
    readCollection("grades"),
  ]);

  const resolved = resolveOffering({ courseOfferingId, courseId, offerings });
  if (!resolved.ok) {
    return resolved;
  }

  const offering = resolved.offering;
  const targetOfferingId = offering._id;
  const targetCourseId = offering.course_id || "";
  const course = courses.find((item) => item._id === targetCourseId) || null;
  const otherOfferingsForCourse = offerings.filter((item) => item._id !== targetOfferingId && item.course_id === targetCourseId);
  const shouldRemoveCourse = Boolean(course && targetCourseId && !otherOfferingsForCourse.length);

  const targetSessionIds = new Set(
    classSessions
      .filter((item) => item.course_offering_id === targetOfferingId)
      .map((item) => item._id)
      .filter(Boolean),
  );
  const targetLeaveIds = new Set(
    leaveRequests
      .filter((item) => item.course_offering_id === targetOfferingId)
      .map((item) => item._id)
      .filter(Boolean),
  );

  const removed = {
    courses: 0,
    courseOfferings: 0,
    classSessions: 0,
    enrollments: 0,
    attendanceRecords: 0,
    leaveRequests: 0,
    leaveRequestSessions: 0,
    evaluations: 0,
    materials: 0,
    evaluationTokens: 0,
    evaluationSummaries: 0,
    recommendations: 0,
    academicAlerts: 0,
    grades: 0,
  };

  removed.leaveRequestSessions = await removeMatching("leave_request_sessions", leaveRequestSessions, (item) =>
    targetLeaveIds.has(item.leave_request_id) ||
    targetSessionIds.has(item.class_session_id),
  );
  removed.attendanceRecords = await removeMatching("attendance_records", attendanceRecords, (item) => item.course_offering_id === targetOfferingId);
  removed.leaveRequests = await removeMatching("leave_requests", leaveRequests, (item) => item.course_offering_id === targetOfferingId);
  removed.evaluations = await removeMatching("course_evaluations", evaluations, (item) => item.course_offering_id === targetOfferingId);
  removed.materials = await removeMatching("course_materials", materials, (item) => item.course_offering_id === targetOfferingId);
  removed.evaluationTokens = await removeMatching("evaluation_tokens", evaluationTokens, (item) => item.course_offering_id === targetOfferingId);
  removed.evaluationSummaries = await removeMatching("course_evaluation_summaries", evaluationSummaries, (item) =>
    item.course_offering_id === targetOfferingId ||
    (shouldRemoveCourse && item.course_id === targetCourseId),
  );
  removed.recommendations = await removeMatching("course_recommendations", recommendations, (item) =>
    item.recommended_offering_id === targetOfferingId ||
    item.course_offering_id === targetOfferingId ||
    (shouldRemoveCourse && item.recommended_course_id === targetCourseId),
  );
  removed.academicAlerts = await removeMatching("academic_alerts", academicAlerts, (item) => item.course_offering_id === targetOfferingId);
  removed.grades = await removeMatching("grades", grades, (item) => item.course_offering_id === targetOfferingId);
  removed.enrollments = await removeMatching("enrollments", enrollments, (item) => item.course_offering_id === targetOfferingId);
  removed.classSessions = await removeMatching("class_sessions", classSessions, (item) => item.course_offering_id === targetOfferingId);

  await db.collection("course_offerings").doc(targetOfferingId).remove();
  removed.courseOfferings = 1;

  if (shouldRemoveCourse) {
    await db.collection("courses").doc(targetCourseId).remove();
    removed.courses = 1;
  }

  await writeAudit("admin.course.delete", session, targetOfferingId, {
    course,
    offering,
  }, removed);

  return {
    ok: true,
    data: {
      deletedCourseOfferingId: targetOfferingId,
      deletedCourseId: removed.courses ? targetCourseId : "",
      removed,
    },
  };
};

async function readCollection(name, limit = 1000) {
  try {
    const result = await db.collection(name).limit(limit).get();
    return result.data || [];
  } catch (error) {
    console.warn(`[delete-admin-course] failed to read ${name}.`, error);
    return [];
  }
}

function resolveOffering(input) {
  if (input.courseOfferingId) {
    const offering = input.offerings.find((item) => item._id === input.courseOfferingId) || null;
    if (!offering) {
      return { ok: false, message: "Course offering was not found." };
    }
    return { ok: true, offering };
  }

  const matches = input.offerings.filter((item) => item.course_id === input.courseId);
  if (!matches.length) {
    return { ok: false, message: "Course offering was not found." };
  }
  if (matches.length > 1) {
    return { ok: false, message: "Multiple offerings use this course. Select a specific course offering to delete." };
  }
  return { ok: true, offering: matches[0] };
}

async function removeMatching(collectionName, rows, predicate) {
  const matched = (rows || []).filter((item) => item && item._id && predicate(item));
  for (const item of matched) {
    await db.collection(collectionName).doc(item._id).remove();
  }
  return matched.length;
}

async function writeAudit(action, session, targetId, before, after) {
  try {
    await db.collection("audit_logs").add({
      actor_user_id: session.userId,
      action,
      target_collection: "course_offerings",
      target_id: targetId,
      before: before || {},
      after: after || {},
      ip: session.ip || "",
      user_agent: session.userAgent || "",
      created_at: Date.now(),
    });
  } catch (error) {
    console.warn("[delete-admin-course] audit write skipped.", error);
  }
}
