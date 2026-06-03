"use strict";

const db = uniCloud.database();

exports.main = async (event = {}) => {
  const session = event.session || {};
  if (session.role !== "admin" || !session.userId) {
    return { ok: false, message: "Only administrators can delete leave requests." };
  }

  const leaveId = String(event.leaveId || event._id || "").trim();
  if (!leaveId) {
    return { ok: false, message: "Leave request id is required." };
  }

  const leave = await findById("leave_requests", leaveId);
  if (!leave) {
    return { ok: false, message: "Leave request not found." };
  }

  const now = Date.now();
  const leaveWithId = { ...leave, _id: leaveId };
  let restore = null;
  if (leave.status === "approved") {
    restore = await restoreAttendance(leaveWithId, now);
  }

  await removeLeaveSessionLinks(leaveId);
  await db.collection("leave_requests").doc(leaveId).remove();
  await writeAudit("leave.delete", session, leaveId, leave, null);

  return {
    ok: true,
    leaveId,
    deletedLeave: buildLeaveView(leaveWithId),
    restore,
  };
};

async function restoreAttendance(leave, now) {
  const links = await findLeaveSessionLinks(leave._id);
  const restored = [];

  for (const link of links) {
    const attendance = await findAttendanceByLink(leave, link);
    if (!attendance) {
      continue;
    }

    const previousStatus = link.previous_status || "absent";
    const previousSource = link.previous_source || "system_import";
    await db.collection("attendance_records").doc(attendance._id).update({
      status: previousStatus,
      source: previousSource,
      leave_request_id: "",
      updated_at: now,
    });

    restored.push({
      attendanceId: attendance._id,
      previousStatus,
      previousSource,
    });
  }

  return { restored };
}

async function findAttendanceByLink(leave, link) {
  if (link.attendance_record_id) {
    const attendance = await findById("attendance_records", link.attendance_record_id);
    if (attendance) {
      return attendance;
    }
  }

  const date = leave.leave_date || dateFromTimestamp(leave.start_at);
  const result = await db
    .collection("attendance_records")
    .where({
      student_id: leave.student_id,
      course_offering_id: leave.course_offering_id,
      attendance_date: date,
    })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function removeLeaveSessionLinks(leaveId) {
  const links = await findLeaveSessionLinks(leaveId);
  for (const link of links) {
    if (link._id) {
      await db.collection("leave_request_sessions").doc(link._id).remove();
    }
  }
}

async function findLeaveSessionLinks(leaveId) {
  const result = await db
    .collection("leave_request_sessions")
    .where({ leave_request_id: leaveId })
    .get();
  return result.data || [];
}

async function findById(collection, id) {
  const result = await db.collection(collection).doc(id).get();
  return result.data && result.data[0] ? result.data[0] : null;
}

function buildLeaveView(leave) {
  const date = leave.leave_date || dateFromTimestamp(leave.start_at);
  return {
    _id: leave._id,
    studentId: leave.student_id,
    courseOfferingId: leave.course_offering_id,
    leaveDate: date,
    date,
    startAt: Number(leave.start_at || 0),
    endAt: Number(leave.end_at || 0),
    reasonType: leave.reason_type || "",
    reasonDetail: leave.reason_detail || "",
    reason: leave.reason_detail || "",
    status: leave.status || "",
    reviewerUserId: leave.reviewer_user_id || "",
    reviewComment: leave.review_comment || "",
    reviewedAt: Number(leave.reviewed_at || 0),
    createdAt: Number(leave.created_at || 0),
    updatedAt: Number(leave.updated_at || 0),
  };
}

function dateFromTimestamp(value) {
  const timestamp = Number(value || 0);
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
}

async function writeAudit(action, session, targetId, before, after) {
  try {
    await db.collection("audit_logs").add({
      action,
      actor_user_id: session.userId,
      target_collection: "leave_requests",
      target_id: targetId,
      before,
      after,
      created_at: Date.now(),
    });
  } catch (error) {
    console.warn("[delete-leave] audit write skipped.", error);
  }
}
