"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const rootDir = path.join(__dirname, "..");
const reportDir = path.join(__dirname, "reports");
const performanceMetricsPath = path.join(reportDir, "performance-metrics.json");

function projectPath(...parts) {
  return path.join(rootDir, ...parts);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function md5Hex(value) {
  return crypto.createHash("md5").update(String(value)).digest("hex");
}

function ensureReportsDir() {
  fs.mkdirSync(reportDir, { recursive: true });
}

function resetPerformanceMetrics() {
  ensureReportsDir();
  fs.writeFileSync(performanceMetricsPath, "[]");
}

function recordPerformanceMetric(metric) {
  ensureReportsDir();
  const existing = fs.existsSync(performanceMetricsPath)
    ? JSON.parse(fs.readFileSync(performanceMetricsPath, "utf8") || "[]")
    : [];
  existing.push({
    name: metric.name,
    durationMs: round(metric.durationMs),
    thresholdMs: round(metric.thresholdMs),
    passed: metric.durationMs <= metric.thresholdMs,
    details: metric.details || "",
  });
  fs.writeFileSync(performanceMetricsPath, JSON.stringify(existing, null, 2));
}

async function measurePerformance(name, thresholdMs, fn, details = "") {
  const startedAt = performance.now();
  const result = await fn();
  const durationMs = performance.now() - startedAt;
  recordPerformanceMetric({ name, durationMs, thresholdMs, details });
  return { result, durationMs };
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function createMockDb(seed = {}) {
  const collections = new Map();
  for (const [name, rows] of Object.entries(seed)) {
    collections.set(name, rows.map(clone));
  }

  function ensureCollection(name) {
    if (!collections.has(name)) {
      collections.set(name, []);
    }
    return collections.get(name);
  }

  function matchesQuery(doc, query = {}) {
    return Object.entries(query || {}).every(([key, expected]) => {
      const actual = doc[key];
      if (Array.isArray(actual) && !Array.isArray(expected)) {
        return actual.includes(expected);
      }
      if (expected && typeof expected === "object" && !Array.isArray(expected)) {
        if (Object.prototype.hasOwnProperty.call(expected, "$in")) {
          return expected.$in.includes(actual);
        }
      }
      return actual === expected;
    });
  }

  function queryBuilder(items) {
    let current = items.slice();
    return {
      where(query) {
        current = current.filter((doc) => matchesQuery(doc, query));
        return this;
      },
      orderBy(field, direction = "asc") {
        const multiplier = direction === "desc" ? -1 : 1;
        current = current.slice().sort((left, right) => {
          const a = left[field];
          const b = right[field];
          if (a === b) return 0;
          return a > b ? multiplier : -multiplier;
        });
        return this;
      },
      skip(count) {
        current = current.slice(Number(count) || 0);
        return this;
      },
      limit(count) {
        current = current.slice(0, Number(count) || 0);
        return this;
      },
      get() {
        return Promise.resolve({ data: current.map(clone) });
      },
      count() {
        return Promise.resolve({ total: current.length });
      },
    };
  }

  return {
    collection(name) {
      const docs = ensureCollection(name);
      return {
        add(doc) {
          const stored = clone(doc);
          if (!stored._id) {
            stored._id = `${name}_${docs.length + 1}`;
          }
          docs.push(stored);
          return Promise.resolve({ id: stored._id });
        },
        doc(id) {
          return {
            get() {
              const item = docs.find((doc) => doc._id === id);
              return Promise.resolve({ data: item ? [clone(item)] : [] });
            },
            update(updateDoc) {
              const item = docs.find((doc) => doc._id === id);
              if (item) {
                Object.assign(item, clone(updateDoc));
              }
              return Promise.resolve({ updated: item ? 1 : 0 });
            },
            remove() {
              const index = docs.findIndex((doc) => doc._id === id);
              if (index >= 0) {
                docs.splice(index, 1);
              }
              return Promise.resolve({ deleted: index >= 0 ? 1 : 0 });
            },
          };
        },
        where(query) {
          return queryBuilder(docs.filter((doc) => matchesQuery(doc, query)));
        },
        orderBy(field, direction) {
          return queryBuilder(docs).orderBy(field, direction);
        },
        limit(count) {
          return queryBuilder(docs).limit(count);
        },
        get() {
          return Promise.resolve({ data: docs.map(clone) });
        },
        count() {
          return Promise.resolve({ total: docs.length });
        },
      };
    },
    snapshot(name) {
      return ensureCollection(name).map(clone);
    },
  };
}

function createVmConsole() {
  return {
    ...console,
    warn() {},
    error() {},
  };
}

function loadCloudFunction(functionName, mockDb) {
  const filePath = projectPath("uniCloud-aliyun", "cloudfunctions", functionName, "index.js");
  const code = fs.readFileSync(filePath, "utf8");
  const module = { exports: {} };
  const sandbox = {
    exports: module.exports,
    module,
    uniCloud: {
      database() {
        return mockDb;
      },
      httpclient: {
        request() {
          return Promise.reject(new Error("Network access is disabled in tests."));
        },
      },
    },
    console: createVmConsole(),
    Date,
    Math,
    JSON,
    String,
    Number,
    Boolean,
    RegExp,
    Object,
    Array,
    Set,
    Map,
    Promise,
    Buffer,
    require,
    process: { env: {} },
    setTimeout,
    clearTimeout,
    __dirname: path.dirname(filePath),
    __filename: filePath,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  return module.exports.main || sandbox.exports.main;
}

function loadFrontendApiModule(options = {}) {
  const filePath = projectPath("src", "common", "api.js");
  const code = fs.readFileSync(filePath, "utf8").replace(/^export\s+/gm, "");
  const sandbox = {
    console: createVmConsole(),
    Date,
    Math,
    JSON,
    String,
    Number,
    Boolean,
    RegExp,
    Object,
    Array,
    Set,
    Map,
    Promise,
    Buffer,
    require,
    setTimeout,
    clearTimeout,
  };
  if (options.uniCloud) {
    sandbox.uniCloud = options.uniCloud;
  }
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  return sandbox;
}

function createAcademicSeed() {
  const futureDate = "2099-06-15";
  const completedDate = "2024-05-01";
  const completedEndAt = Date.parse(`${completedDate}T11:00:00`);

  return {
    roles: [
      { _id: "role_student", code: "student" },
      { _id: "role_teacher", code: "teacher" },
      { _id: "role_admin", code: "admin" },
    ],
    users: [
      {
        _id: "user_s_001",
        username: "student001",
        password_hash: sha256Hex("Student123!"),
        role_ids: ["role_student"],
        role: "student",
        status: "active",
        display_name: "Alice Chen",
      },
      {
        _id: "user_t_001",
        username: "teacher001",
        password_hash: sha256Hex("Teacher123!"),
        role_ids: ["role_teacher"],
        role: "teacher",
        status: "active",
        display_name: "Dr. Zhang",
      },
      {
        _id: "user_admin_001",
        username: "admin001",
        password_hash: sha256Hex("Admin123!"),
        role_ids: ["role_admin"],
        role: "admin",
        status: "active",
        display_name: "Academic Admin",
      },
    ],
    students: [
      {
        _id: "stu_001",
        user_id: "user_s_001",
        student_no: "S2026001",
        name: "Alice Chen",
        major_id: "major_se",
        admin_class_id: "class_se_1",
        training_plan_id: "tp_se_2024",
        enrollment_year: 2024,
        status: "active",
      },
    ],
    teachers: [
      {
        _id: "tea_001",
        user_id: "user_t_001",
        teacher_no: "T1001",
        name: "Dr. Zhang",
        title: "Associate Professor",
        department_name: "Computer Science",
      },
    ],
    courses: [
      {
        _id: "course_software_design",
        course_code: "JC3506",
        code: "JC3506",
        name: "Software Design and Implementation",
        credits: 15,
        course_type: "major_required",
        status: "active",
      },
    ],
    course_offerings: [
      {
        _id: "co_future",
        course_id: "course_software_design",
        teacher_ids: ["tea_001"],
        section_no: "01",
        capacity: 50,
        enrolled_count: 1,
        course_start_date: "2099-06-01",
        course_end_date: "2099-07-01",
        class_weekday: 1,
        class_start_time: "09:00",
        class_end_time: "11:00",
        selection_status: "open",
      },
      {
        _id: "co_completed",
        course_id: "course_software_design",
        teacher_ids: ["tea_001"],
        section_no: "02",
        capacity: 50,
        enrolled_count: 1,
        course_start_date: "2024-04-01",
        course_end_date: "2024-05-01",
        class_weekday: 3,
        class_start_time: "09:00",
        class_end_time: "11:00",
        selection_status: "closed",
      },
    ],
    enrollments: [
      {
        _id: "enr_future",
        student_id: "stu_001",
        course_offering_id: "co_future",
        status: "enrolled",
        selected_teacher_id: "tea_001",
        selected_teacher_user_id: "user_t_001",
        selected_teacher_name: "Dr. Zhang",
      },
      {
        _id: "enr_completed",
        student_id: "stu_001",
        course_offering_id: "co_completed",
        status: "enrolled",
        selected_teacher_id: "tea_001",
        selected_teacher_user_id: "user_t_001",
        selected_teacher_name: "Dr. Zhang",
      },
    ],
    class_sessions: [
      {
        _id: "cs_future",
        course_offering_id: "co_future",
        session_date: futureDate,
        start_time: "09:00",
        end_time: "11:00",
        session_start_at: Date.parse(`${futureDate}T09:00:00`),
        session_end_at: Date.parse(`${futureDate}T11:00:00`),
        status: "scheduled",
      },
      {
        _id: "cs_completed",
        course_offering_id: "co_completed",
        session_date: completedDate,
        start_time: "09:00",
        end_time: "11:00",
        session_start_at: Date.parse(`${completedDate}T09:00:00`),
        session_end_at: completedEndAt,
        status: "completed",
      },
    ],
    attendance_records: [
      {
        _id: "att_future_absent",
        student_id: "stu_001",
        course_offering_id: "co_future",
        class_session_id: "cs_future",
        attendance_date: futureDate,
        status: "absent",
        source: "location",
        created_at: 1,
        updated_at: 1,
      },
    ],
    course_evaluations: [],
    leave_requests: [],
    leave_request_sessions: [],
    course_materials: [],
    profile_change_requests: [],
    academic_alerts: [],
    admin_classes: [{ _id: "class_se_1", name: "SE 2024 Class 1" }],
    majors: [{ _id: "major_se", name: "Software Engineering" }],
    training_plans: [{ _id: "tp_se_2024", name: "Software Engineering 2024" }],
    audit_logs: [],
    knowledge_base: [
      {
        _id: "kb_graduation",
        title: "Graduation credit requirement",
        keywords: ["graduation", "credit", "credits"],
        content: "Students should track total credits, module credits, GPA trend, and remaining required courses before graduation.",
        status: "active",
        is_public: true,
      },
    ],
    ai_conversations: [],
    ai_messages: [],
  };
}

function createLargeDashboardSeed(studentCount = 120, offeringCount = 8) {
  const seed = createAcademicSeed();
  seed.students = [];
  seed.enrollments = [];
  seed.attendance_records = [];
  seed.course_offerings = [];
  seed.class_sessions = [];
  seed.courses = Array.from({ length: offeringCount }, (_, index) => ({
    _id: `course_${index + 1}`,
    course_code: `C${String(index + 1).padStart(3, "0")}`,
    name: `Course ${index + 1}`,
    credits: 4,
    course_type: index % 2 ? "major_elective" : "major_required",
    status: "active",
  }));
  seed.course_offerings = seed.courses.map((course, index) => ({
    _id: `co_${index + 1}`,
    course_id: course._id,
    teacher_ids: ["tea_001"],
    section_no: "01",
    capacity: 80,
    enrolled_count: studentCount,
    course_start_date: "2024-03-01",
    course_end_date: "2024-06-30",
    class_weekday: (index % 5) + 1,
    class_start_time: "09:00",
    class_end_time: "11:00",
    selection_status: "closed",
  }));
  seed.class_sessions = seed.course_offerings.flatMap((offering, offeringIndex) =>
    Array.from({ length: 4 }, (_, sessionIndex) => {
      const date = `2024-04-${String(1 + sessionIndex + offeringIndex).padStart(2, "0")}`;
      return {
        _id: `${offering._id}_session_${sessionIndex + 1}`,
        course_offering_id: offering._id,
        session_date: date,
        start_time: "09:00",
        end_time: "11:00",
        session_end_at: Date.parse(`${date}T11:00:00`),
        status: "completed",
      };
    }),
  );

  for (let index = 0; index < studentCount; index += 1) {
    const studentId = `stu_${String(index + 1).padStart(3, "0")}`;
    const userId = index === 0 ? "user_s_001" : `user_s_${String(index + 1).padStart(3, "0")}`;
    seed.students.push({
      _id: studentId,
      user_id: userId,
      student_no: `S${String(2026000 + index + 1)}`,
      name: `Student ${index + 1}`,
      major_id: "major_se",
      admin_class_id: "class_se_1",
      training_plan_id: "tp_se_2024",
      enrollment_year: 2024,
      status: "active",
    });
    for (const offering of seed.course_offerings) {
      seed.enrollments.push({
        _id: `enr_${studentId}_${offering._id}`,
        student_id: studentId,
        course_offering_id: offering._id,
        status: "enrolled",
        selected_teacher_id: "tea_001",
        selected_teacher_user_id: "user_t_001",
      });
    }
  }

  for (const enrollment of seed.enrollments) {
    for (const session of seed.class_sessions.filter((item) => item.course_offering_id === enrollment.course_offering_id)) {
      seed.attendance_records.push({
        _id: `att_${enrollment.student_id}_${session._id}`,
        student_id: enrollment.student_id,
        course_offering_id: enrollment.course_offering_id,
        class_session_id: session._id,
        attendance_date: session.session_date,
        status: Number(enrollment.student_id.slice(-1)) % 7 === 0 ? "absent" : "present",
        source: "system_import",
        created_at: 1,
        updated_at: 1,
      });
    }
  }

  return seed;
}

module.exports = {
  clone,
  createAcademicSeed,
  createLargeDashboardSeed,
  createMockDb,
  loadCloudFunction,
  loadFrontendApiModule,
  md5Hex,
  measurePerformance,
  performanceMetricsPath,
  projectPath,
  recordPerformanceMetric,
  reportDir,
  resetPerformanceMetrics,
  sha256Hex,
};
