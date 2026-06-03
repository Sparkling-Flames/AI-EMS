"use strict";

const db = uniCloud.database();

const SCORE_KEYS = ["content", "teaching_method", "difficulty", "workload", "achievement", "overall"];

exports.main = async (event = {}, context = {}) => {
  const auth = normalizeAuth(event.session || context.auth || {});
  const role = String(auth.role || "student");

  if (!["student", "teacher", "admin"].includes(role)) {
    return { code: 403, message: "No permission to view course evaluations", data: null };
  }

  try {
    const filter = buildFilter(event);
    const [queryResult, offerings, courses, teachers] = await Promise.all([
      db.collection("course_evaluations").get(),
      readCollection("course_offerings"),
      readCollection("courses"),
      readCollection("teachers")
    ]);
    const offeringMap = mapByKeys(offerings, ["_id", "id", "course_offering_id", "courseOfferingId"]);
    const courseMap = mapByKeys(courses, ["_id", "id", "course_id", "courseId"]);
    const teacherMap = mapByKeys(teachers, ["_id", "id", "teacher_id", "teacherId", "user_id", "userId"]);
    const rows = (queryResult.data || [])
      .filter(item => item.status !== "hidden")
      .map(normalizeEvaluation)
      .map(item => enrichEvaluation(item, offeringMap, courseMap, teacherMap))
      .filter(item => applyFilter(item, filter));

    const grouped = groupEvaluations(rows);
    const summary = Array.from(grouped.values())
      .map(buildSummaryItem)
      .sort((a, b) => String(a.course_name).localeCompare(String(b.course_name)));
    const teacherCourseReviews = buildTeacherCourseReviews(rows, teacherMap).sort((a, b) =>
      `${a.teacher_name} ${a.course_name}`.localeCompare(`${b.teacher_name} ${b.course_name}`)
    );
    const anonymousEvaluations = rows
      .slice()
      .sort((a, b) => b.submitted_at - a.submitted_at)
      .map(stripIdentityFields);

    return {
      code: 200,
      message: "Query successful",
      data: {
        summary,
        teacher_course_reviews: teacherCourseReviews,
        anonymous_evaluations: anonymousEvaluations
      }
    };
  } catch (error) {
    console.error("Failed to query evaluations:", error);
    return { code: 500, message: "Server error, please try again later", data: null };
  }
};

function normalizeAuth(auth) {
  return {
    uid: String(auth.uid || auth.userId || auth.user_id || "").trim(),
    role: String(auth.role || "").trim()
  };
}

async function readCollection(name) {
  try {
    const result = await db.collection(name).get();
    return result.data || [];
  } catch (_) {
    return [];
  }
}

function buildFilter(event) {
  return {
    courseId: String(event.course_id || event.courseId || "").trim(),
    courseOfferingId: String(event.course_offering_id || event.courseOfferingId || "").trim(),
    teacherId: String(event.teacher_id || event.teacherId || "").trim()
  };
}

function applyFilter(row, filter) {
  if (filter.courseId && !sameId(filter.courseId, row.course_id, row.courseId)) {
    return false;
  }
  if (filter.courseOfferingId && !sameId(filter.courseOfferingId, row.course_offering_id, row.courseOfferingId)) {
    return false;
  }
  if (filter.teacherId && Array.isArray(row.teacher_ids) && !row.teacher_ids.includes(filter.teacherId)) {
    return false;
  }
  return true;
}

function normalizeEvaluation(item) {
  const scores = normalizeScores(item);
  const courseId = String(item.course_id || item.courseId || "").trim();
  const courseOfferingId = String(item.course_offering_id || item.courseOfferingId || courseId || "").trim();
  const feedbackText = String(item.feedback_text || item.content || item.feedback || "").trim();

  return {
    ...item,
    course_id: courseId || courseOfferingId,
    course_offering_id: courseOfferingId,
    teacher_ids: Array.isArray(item.teacher_ids) ? item.teacher_ids : [],
    scores,
    feedback_text: feedbackText,
    rating: Number(scores.overall || item.rating || 0),
    content: feedbackText,
    submitted_at: Number(item.submitted_at || item.create_time || item.created_at || 0)
  };
}

function enrichEvaluation(row, offeringMap, courseMap, teacherMap) {
  const offering =
    firstMappedValue(offeringMap, [row.course_offering_id, row.courseOfferingId, row.offering_id, row.course_id]) || {};
  const course =
    firstMappedValue(courseMap, [offering.course_id, offering.courseId, row.course_id, row.courseId]) || {};
  const storedCourseId = String(row.course_id || row.courseId || "").trim();
  const offeringCourseId = String(offering.course_id || offering.courseId || "").trim();
  const resolvedCourseId =
    offeringCourseId ||
    String(course._id || course.id || "").trim() ||
    (storedCourseId !== row.course_offering_id ? storedCourseId : "") ||
    storedCourseId;
  const resolvedCourseOfferingId = String(
    row.course_offering_id || row.courseOfferingId || offering._id || offering.id || resolvedCourseId
  ).trim();
  const storedCourseName = String(row.course_name || row.courseName || "").trim();
  const courseTitle = buildCourseTitle(course) || buildCourseTitle(offering);
  const courseName =
    courseTitle ||
    (isDisplayableName(storedCourseName, resolvedCourseId, resolvedCourseOfferingId) ? storedCourseName : "") ||
    resolvedCourseId ||
    resolvedCourseOfferingId ||
    "Unnamed Course";
  const offeringTeacherIds = Array.isArray(offering.teacher_ids) ? offering.teacher_ids : [];
  const teacherIds = row.teacher_ids && row.teacher_ids.length ? row.teacher_ids : offeringTeacherIds;
  const teacherNames = teacherIds
    .map(teacherId => {
      const teacher = teacherMap.get(teacherId) || {};
      return teacher.name || teacher.teacher_no || teacherId;
    })
    .filter(Boolean);
  return {
    ...row,
    course_id: resolvedCourseId,
    course_offering_id: resolvedCourseOfferingId,
    course_name: courseName,
    teacher_ids: teacherIds,
    teacher_names: teacherNames
  };
}

function normalizeScores(item) {
  const sourceScores = item.scores && typeof item.scores === "object" ? item.scores : {};
  const fallbackRating = Number(item.rating || 0);
  const normalized = {};

  for (const key of SCORE_KEYS) {
    const rawValue = Object.prototype.hasOwnProperty.call(sourceScores, key)
      ? sourceScores[key]
      : key === "overall"
        ? fallbackRating
        : fallbackRating;
    normalized[key] = toDisplayScore(rawValue);
  }

  if (!normalized.overall) {
    normalized.overall = toDisplayScore(fallbackRating);
  }

  return normalized;
}

function toDisplayScore(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(5, numberValue));
}

function groupEvaluations(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.course_id}::${row.course_offering_id || row.course_id}`;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(row);
  }
  return map;
}

function buildSummaryItem(groupRows) {
  const first = groupRows[0];
  const totals = groupRows.length;
  const sums = SCORE_KEYS.reduce((accumulator, key) => {
    accumulator[key] = groupRows.reduce((sum, row) => sum + Number(row.scores[key] || 0), 0);
    return accumulator;
  }, {});
  const averages = SCORE_KEYS.reduce((accumulator, key) => {
    accumulator[key] = totals ? round1(sums[key] / totals) : 0;
    return accumulator;
  }, {});
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of groupRows) {
    const overall = Math.round(Number(row.scores.overall || row.rating || 0));
    if (distribution[overall] !== undefined) {
      distribution[overall] += 1;
    }
  }

  return {
    course_id: first.course_id,
    course_offering_id: first.course_offering_id,
    course_name: first.course_name || first.courseName || "",
    evaluation_count: totals,
    total_evaluations: totals,
    average_scores: averages,
    average_rating: averages.overall.toFixed(1),
    rating_distribution: distribution,
    positive_tags: [],
    negative_tags: [],
    ai_summary: ""
  };
}

function buildTeacherCourseReviews(rows, teacherMap) {
  const groups = new Map();
  for (const row of rows) {
    const teacherIds = row.teacher_ids && row.teacher_ids.length ? row.teacher_ids : [""];
    for (const teacherId of teacherIds) {
      const key = `${teacherId}::${row.course_id}::${row.course_offering_id || row.course_id}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push({ ...row, teacher_id: teacherId });
    }
  }

  return Array.from(groups.values()).map(groupRows => {
    const first = groupRows[0];
    const teacher = teacherMap.get(first.teacher_id) || {};
    const summary = buildSummaryItem(groupRows);
    const teacherName =
      teacher.name ||
      teacher.teacher_no ||
      (first.teacher_names && first.teacher_names[0]) ||
      first.teacher_id ||
      "Unassigned Teacher";
    return {
      teacher_id: first.teacher_id || "",
      teacher_name: teacherName,
      course_id: first.course_id,
      course_offering_id: first.course_offering_id,
      course_name: first.course_name || "",
      evaluation_count: summary.evaluation_count,
      total_evaluations: summary.total_evaluations,
      average_scores: summary.average_scores,
      average_rating: summary.average_rating,
      rating_distribution: summary.rating_distribution,
      evaluations: groupRows
        .slice()
        .sort((a, b) => b.submitted_at - a.submitted_at)
        .map(row => stripIdentityFields({ ...row, teacher_id: first.teacher_id, teacher_name: teacherName }))
    };
  });
}

function stripIdentityFields(row) {
  return {
    course_id: row.course_id,
    course_offering_id: row.course_offering_id,
    course_name: row.course_name || row.courseName || "",
    teacher_id: row.teacher_id || "",
    teacher_name: row.teacher_name || "",
    scores: row.scores,
    feedback_text: row.feedback_text,
    status: row.status,
    submitted_at: row.submitted_at,
    rating: row.rating,
    content: row.content,
    create_time: row.submitted_at
  };
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function mapByKeys(items, keys) {
  const map = new Map();
  for (const item of items || []) {
    if (!item) continue;
    for (const key of keys) {
      const value = String(item[key] || "").trim();
      if (value && !map.has(value)) {
        map.set(value, item);
      }
    }
  }
  return map;
}

function firstMappedValue(map, values) {
  for (const value of values || []) {
    const key = String(value || "").trim();
    if (key && map.has(key)) {
      return map.get(key);
    }
  }
  return null;
}

function sameId(expected, ...candidates) {
  const value = String(expected || "").trim();
  return Boolean(value && candidates.some(candidate => String(candidate || "").trim() === value));
}

function buildCourseTitle(course = {}) {
  const code = String(course.course_code || course.courseCode || course.code || "").trim();
  const name = String(course.name || course.course_name || course.courseName || "").trim();
  return [code, name].filter(Boolean).join(" ").trim();
}

function isDisplayableName(value, ...ids) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (ids.some(id => String(id || "").trim() === text)) return false;
  return !/^[a-f0-9]{20,}$/i.test(text);
}
