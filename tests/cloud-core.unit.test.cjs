'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMockDb(seed = {}) {
  const collections = new Map();

  for (const [name, items] of Object.entries(seed)) {
    collections.set(name, items.map(clone));
  }

  function ensureCollection(name) {
    if (!collections.has(name)) {
      collections.set(name, []);
    }
    return collections.get(name);
  }

  function matches(doc, query) {
    return Object.entries(query || {}).every(([key, expected]) => {
      if (Array.isArray(doc[key]) && !Array.isArray(expected)) {
        return doc[key].includes(expected);
      }
      if (Array.isArray(expected)) {
        return expected.includes(doc[key]);
      }
      return doc[key] === expected;
    });
  }

  function buildQuery(items) {
    let working = items.slice();
    return {
      where(query) {
        working = working.filter((doc) => matches(doc, query));
        return this;
      },
      limit(count) {
        working = working.slice(0, count);
        return this;
      },
      get() {
        return Promise.resolve({ data: working.map(clone) });
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
              if (!item) {
                return Promise.resolve({ updated: 0 });
              }
              Object.assign(item, clone(updateDoc));
              return Promise.resolve({ updated: 1 });
            },
            remove() {
              const index = docs.findIndex((doc) => doc._id === id);
              if (index < 0) {
                return Promise.resolve({ deleted: 0 });
              }
              docs.splice(index, 1);
              return Promise.resolve({ deleted: 1 });
            },
          };
        },
        where(query) {
          return buildQuery(docs.filter((doc) => matches(doc, query)));
        },
        limit(count) {
          return buildQuery(docs).limit(count);
        },
        get() {
          return Promise.resolve({ data: docs.map(clone) });
        },
      };
    },
    snapshot(name) {
      return ensureCollection(name).map(clone);
    },
  };
}

function loadFunction(relativePath, mockDb) {
  const filePath = path.join(__dirname, '..', relativePath);
  const code = fs.readFileSync(filePath, 'utf8');
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
    uniCloud: {
      database() {
        return mockDb;
      },
    },
    __dirname: path.dirname(filePath),
    __filename: filePath,
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  const main = sandbox.module.exports.main || sandbox.exports.main;
  main.sandbox = sandbox;
  return main;
}

test('ask-assistant evaluation prompt includes detailed score dimensions and feedback', async () => {
  const askAssistant = loadFunction('uniCloud-aliyun/cloudfunctions/ask-assistant/index.js', createMockDb());
  const promptLine = askAssistant.sandbox.formatEvaluationPromptLine({
    courseLabel: 'JC3506 Software Design and Implementation',
    teacherLabel: '教师：John',
    evaluationCount: 2,
    averageScores: {
      overall: 5,
      content: 5,
      teaching_method: 4.5,
      difficulty: 3,
      workload: 3.5,
      achievement: 4,
    },
    feedbackSamples: ['good', 'clear and practical'],
  });

  assert.match(promptLine, /content 5\.0\/5/);
  assert.match(promptLine, /teaching 4\.5\/5/);
  assert.match(promptLine, /achievement 4\.0\/5/);
  assert.match(promptLine, /good/);
});

test('ask-assistant uses current user query instead of locking on previous assistant answer', async () => {
  const db = createMockDb({
    knowledge_base: [
      {
        _id: 'kb_eval',
        title: 'Anonymous course evaluation',
        keywords: ['evaluation', 'anonymous', '课程评价', '匿名'],
        content: 'Course evaluation summaries are anonymous.',
      },
      {
        _id: 'kb_grad',
        title: 'Graduation credit requirement',
        keywords: ['graduation', 'credit', '毕业', '学分'],
        content: 'Check credits, core modules and GPA before graduation.',
      },
    ],
    ai_conversations: [],
    ai_messages: [],
    audit_logs: [],
  });
  const askAssistant = loadFunction('uniCloud-aliyun/cloudfunctions/ask-assistant/index.js', db);

  const first = await askAssistant({
    session: { userId: 'user_s_005', role: 'student' },
    query: '课程评价是匿名的吗',
    history: [],
    skipRetentionCleanup: true,
  });
  assert.equal(first.ok, true);
  assert.equal(first.data.sourceTitle, 'Anonymous course evaluation');

  const second = await askAssistant({
    session: { userId: 'user_s_005', role: 'student' },
    query: '毕业学分要求',
    history: [
      { role: 'user', content: '课程评价是匿名的吗' },
      { role: 'assistant', content: 'Course evaluation summaries are anonymous.' },
    ],
    skipRetentionCleanup: true,
  });

  assert.equal(second.ok, true);
  assert.equal(second.data.sourceTitle, 'Graduation credit requirement');
});

test('ask-assistant gives admins concrete student roster from database context', async () => {
  const db = createMockDb({
    knowledge_base: [],
    students: [{
      _id: 'student_001',
      user_id: 'user_s_001',
      student_no: 'S2023009',
      name: 'Alice',
      major_id: 'major_ai',
      admin_class_id: 'class_ai_2023',
      enrollment_year: 2023,
      status: 'active',
    }],
    majors: [{ _id: 'major_ai', name: 'Artificial Intelligence' }],
    admin_classes: [{ _id: 'class_ai_2023', name: 'AI 2023-1' }],
    users: [{ _id: 'user_s_001', display_name: 'Alice' }],
    courses: [],
    course_offerings: [],
    teachers: [],
    departments: [],
    semesters: [],
    course_evaluations: [],
    ai_conversations: [],
    ai_messages: [],
    audit_logs: [],
  });
  const askAssistant = loadFunction('uniCloud-aliyun/cloudfunctions/ask-assistant/index.js', db);

  const result = await askAssistant({
    session: { userId: 'user_admin', role: 'admin' },
    query: 'student roster',
    history: [],
    skipRetentionCleanup: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.sourceTitle, 'Student roster');
  assert.match(result.data.answer, /S2023009/);
  assert.match(result.data.answer, /Alice/);
  assert.match(result.data.answer, /Artificial Intelligence/);
});

test('AI history and requested conversations are isolated by user and role', async () => {
  const now = Date.now();
  const db = createMockDb({
    knowledge_base: [],
    courses: [],
    course_offerings: [],
    teachers: [],
    departments: [],
    semesters: [],
    students: [],
    majors: [],
    admin_classes: [],
    users: [],
    course_evaluations: [],
    ai_conversations: [
      {
        _id: 'conv_student',
        user_id: 'user_s_001',
        role: 'student',
        title: 'Student chat',
        scenario: 'other',
        status: 'active',
        updated_at: now,
        created_at: now,
      },
      {
        _id: 'conv_admin',
        user_id: 'user_admin_001',
        role: 'admin',
        title: 'Admin chat',
        scenario: 'other',
        status: 'active',
        updated_at: now + 1,
        created_at: now + 1,
      },
      {
        _id: 'conv_admin_legacy',
        user_id: 'u_admin_001',
        title: 'Legacy admin chat',
        scenario: 'other',
        status: 'active',
        updated_at: now + 2,
        created_at: now + 2,
      },
    ],
    ai_messages: [
      { _id: 'msg_student', conversation_id: 'conv_student', user_id: 'user_s_001', role_owner: 'student', role: 'user', content: 'student only', created_at: now },
      { _id: 'msg_admin', conversation_id: 'conv_admin', user_id: 'user_admin_001', role_owner: 'admin', role: 'user', content: 'admin only', created_at: now + 1 },
      { _id: 'msg_admin_legacy', conversation_id: 'conv_admin_legacy', user_id: 'u_admin_001', role: 'user', content: 'legacy admin only', created_at: now + 2 },
    ],
    audit_logs: [],
  });
  const getHistory = loadFunction('uniCloud-aliyun/cloudfunctions/get-ai-history/index.js', db);
  const askAssistant = loadFunction('uniCloud-aliyun/cloudfunctions/ask-assistant/index.js', db);

  const history = await getHistory({ session: { userId: 'u_admin_001', role: 'admin' } });
  assert.equal(history.ok, true);
  assert.equal(history.data.conversations.length, 2);
  assert.equal(history.data.conversations[0]._id, 'conv_admin_legacy');
  assert.deepEqual(JSON.parse(JSON.stringify(history.data.messages.map((item) => item.content))), ['legacy admin only']);

  const continueLegacy = await askAssistant({
    session: { userId: 'u_admin_001', role: 'admin' },
    conversationId: 'conv_admin_legacy',
    query: 'continue',
    history: [],
    skipRetentionCleanup: true,
  });
  assert.equal(continueLegacy.ok, true);
  assert.equal(continueLegacy.data.conversationId, 'conv_admin_legacy');

  const askResult = await askAssistant({
    session: { userId: 'u_admin_001', role: 'admin' },
    conversationId: 'conv_student',
    query: 'policy rules',
    history: [],
    skipRetentionCleanup: true,
  });
  assert.equal(askResult.ok, true);
  assert.notEqual(askResult.data.conversationId, 'conv_student');
  const adminConversations = db.snapshot('ai_conversations').filter((item) => item.user_id === 'user_admin_001' && item.role === 'admin');
  assert.ok(adminConversations.some((item) => item._id === askResult.data.conversationId));
  const newMessages = db.snapshot('ai_messages').filter((item) => item.conversation_id === askResult.data.conversationId);
  assert.equal(newMessages.every((item) => item.user_id === 'user_admin_001' && item.role_owner === 'admin'), true);
});

test('get-dashboard-data returns enrolled courses for user_s_005 via student mapping', async () => {
  const db = createMockDb({
    courses: [{ _id: 'course_software_design', course_code: 'JC3506', name: 'Software Design', credits: 15 }],
    course_offerings: [{ _id: 'offering_sd_2026s', course_id: 'course_software_design', teacher_ids: ['teacher_001'], section_no: '01' }],
    students: [{ _id: 'student_005', user_id: 'user_s_005', name: 'Emily Zhao' }],
    teachers: [],
    enrollments: [{ _id: 'enroll_005_sd', student_id: 'student_005', course_offering_id: 'offering_sd_2026s', status: 'enrolled' }],
    attendance_records: [],
    leave_requests: [],
    course_evaluations: [],
  });
  const getDashboard = loadFunction('uniCloud-aliyun/cloudfunctions/get-dashboard-data/index.js', db);

  const result = await getDashboard({ session: { userId: 'user_s_005', role: 'student' } });

  assert.equal(result.ok, true);
  assert.equal(result.data.courses.length, 1);
  assert.equal(result.data.courses[0].courseOfferingId, 'offering_sd_2026s');
});

test('get-dashboard-data returns pending profile changes for admin review', async () => {
  const db = createMockDb({
    courses: [],
    course_offerings: [],
    enrollments: [],
    students: [],
    teachers: [],
    attendance_records: [],
    leave_requests: [],
    course_evaluations: [],
    class_sessions: [],
    course_materials: [],
    training_plans: [],
    admin_classes: [],
    majors: [],
    profile_change_requests: [{
      _id: 'pcr_001',
      requesterUserId: 'user_s_001',
      targetType: 'student',
      targetId: 'student_001',
      changes: { contact_email: { field: 'contact.email', label: 'Email', oldValue: 'old@example.com', newValue: 'new@example.com' } },
      status: ' pending ',
      created_at: 10,
      updated_at: 10,
    }],
  });
  const getDashboard = loadFunction('uniCloud-aliyun/cloudfunctions/get-dashboard-data/index.js', db);

  const result = await getDashboard({ session: { userId: 'user_admin', role: 'admin' } });

  assert.equal(result.ok, true);
  assert.equal(result.data.profileChangeRequests.length, 1);
  assert.equal(result.data.profileChangeRequests[0].changes.contact_email.field, 'contact.email');
  assert.equal(result.data.metrics.profileChanges, 1);
});


test('get-dashboard-data includes student names on pending leave reviews', async () => {
  const db = createMockDb({
    courses: [{ _id: 'course_sd', course_code: 'JC2506', name: 'Software Design' }],
    course_offerings: [{ _id: 'offering_sd', course_id: 'course_sd', teacher_ids: ['teacher_001'] }],
    enrollments: [],
    students: [{ _id: 'student_001', user_id: 'user_s_001', student_no: 'S2023009', name: 'Alice' }],
    teachers: [],
    attendance_records: [],
    leave_requests: [{
      _id: 'leave_001',
      student_id: 'student_001',
      course_offering_id: 'offering_sd',
      leave_date: '2026-06-01',
      reason_detail: 'Medical appointment',
      status: 'pending',
    }],
    course_evaluations: [],
    class_sessions: [],
    course_materials: [],
    training_plans: [],
    admin_classes: [],
    majors: [],
    profile_change_requests: [],
  });
  const getDashboard = loadFunction('uniCloud-aliyun/cloudfunctions/get-dashboard-data/index.js', db);

  const result = await getDashboard({ session: { userId: 'user_admin', role: 'admin' } });

  assert.equal(result.ok, true);
  assert.equal(result.data.leaveRequests.length, 1);
  assert.equal(result.data.leaveRequests[0].studentName, 'Alice');
  assert.equal(result.data.leaveRequests[0].studentNo, 'S2023009');
  assert.equal(result.data.leaveRequests[0].courseName, 'JC2506 Software Design');
});

test('save-course-material allows teacher when offering stores user_id in teacher_ids', async () => {
  const db = createMockDb({
    course_offerings: [{ _id: 'offering_sd_2026s', course_id: 'course_software_design', teacher_ids: ['user_t_004'] }],
    course_materials: [],
    teachers: [],
    audit_logs: [],
  });
  const saveMaterial = loadFunction('uniCloud-aliyun/cloudfunctions/save-course-material/index.js', db);

  const result = await saveMaterial({
    session: { userId: 'user_t_004', role: 'teacher' },
    courseOfferingId: 'offering_sd_2026s',
    title: 'Week 1 Slides',
    fileID: 'cloud://ai-ems/course-materials/week1.pdf',
    fileName: 'week1.pdf',
    fileSize: 2048,
    isPublicToStudents: true,
  });

  assert.equal(result.ok, true);
  assert.equal(db.snapshot('course_materials').length, 1);
  assert.equal(db.snapshot('course_materials')[0].file_url, 'cloud://ai-ems/course-materials/week1.pdf');
  assert.equal(db.snapshot('course_materials')[0].file_name, 'week1.pdf');
  assert.equal(db.snapshot('course_materials')[0].file_type, 'document');
  assert.equal(result.data.material.fileSize, 2048);
});

test('save-attendance-records lets a teacher save a scheduled session outside the class time', async () => {
  const db = createMockDb({
    course_offerings: [{ _id: 'offering_sd', teacher_ids: ['teacher_001'] }],
    teachers: [{ _id: 'teacher_001', user_id: 'user_t_001', name: 'Dr. Chen' }],
    class_sessions: [{
      _id: 'session_future',
      course_offering_id: 'offering_sd',
      session_date: '2099-01-01',
      start_time: '10:00',
      end_time: '12:00',
      session_start_at: Date.parse('2099-01-01T10:00:00'),
      session_end_at: Date.parse('2099-01-01T12:00:00'),
    }],
    enrollments: [{ _id: 'enroll_001', student_id: 'student_001', course_offering_id: 'offering_sd', status: 'enrolled' }],
    attendance_records: [],
    audit_logs: [],
  });
  const saveAttendance = loadFunction('uniCloud-aliyun/cloudfunctions/save-attendance-records/index.js', db);

  const result = await saveAttendance({
    session: { userId: 'user_t_001', role: 'teacher' },
    courseOfferingId: 'offering_sd',
    attendanceDate: '2099-01-01',
    records: [{ studentId: 'student_001', status: 'absent' }],
  });

  assert.equal(result.ok, true);
  assert.equal(db.snapshot('attendance_records').length, 1);
  assert.equal(db.snapshot('attendance_records')[0].status, 'absent');
});

test('save-admin-course allows cohort offerings without a training plan', async () => {
  const db = createMockDb({
    courses: [],
    course_offerings: [],
    teachers: [{ _id: 'teacher_001', user_id: 'user_t_001', name: 'Dr. Chen', department_id: 'dept_cs' }],
    departments: [{ _id: 'dept_cs', name: 'Computer Science' }],
    semesters: [{ _id: 'sem_2026_spring', name: '2026 Spring', is_current: true }],
    course_materials: [],
    training_plans: [],
    majors: [{ _id: 'major_ai', name: 'Artificial Intelligence', department_id: 'dept_cs' }],
    students: [
      { _id: 'student_ai_2023', user_id: 'user_s_001', major_id: 'major_ai', enrollment_year: 2023, training_plan_id: '' },
      { _id: 'student_ai_2024', user_id: 'user_s_002', major_id: 'major_ai', enrollment_year: 2024, training_plan_id: '' },
      { _id: 'student_se_2023', user_id: 'user_s_003', major_id: 'major_se', enrollment_year: 2023, training_plan_id: '' },
    ],
    enrollments: [],
    class_sessions: [],
    classrooms: [{ _id: 'room_a101', name: 'Room A101', capacity: 60 }],
    audit_logs: [],
  });
  const saveCourse = loadFunction('uniCloud-aliyun/cloudfunctions/save-admin-course/index.js', db);

  const result = await saveCourse({
    session: { userId: 'user_admin', role: 'admin' },
    courseCode: 'AI2023',
    courseName: 'AI Project Practice',
    majorId: 'major_ai',
    gradeYear: 2023,
    sectionNo: '01',
    teacherIds: ['teacher_001'],
    capacity: 50,
    selectionStatus: 'open',
    courseStartDate: '2026-06-01',
    courseEndDate: '2026-06-08',
    scheduleSlots: [{ weekday: 1, startTime: '09:00', endTime: '10:40', classroomId: 'room_a101' }],
    totalSessions: 2,
    credits: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.course.trainingPlanId, '');
  assert.equal(result.data.course.gradeYear, 2023);

  const offerings = db.snapshot('course_offerings');
  assert.equal(offerings.length, 1);
  assert.equal(offerings[0].training_plan_id, '');
  assert.equal(offerings[0].major_id, 'major_ai');
  assert.equal(offerings[0].grade_year, 2023);

  const enrollments = db.snapshot('enrollments');
  assert.equal(enrollments.length, 1);
  assert.equal(enrollments[0].student_id, 'student_ai_2023');
  assert.equal(enrollments[0].status, 'selected');
});

test('delete-admin-course removes a published offering and related records', async () => {
  const db = createMockDb({
    courses: [
      { _id: 'course_ai_project', course_code: 'AI2023', name: 'AI Project Practice' },
      { _id: 'course_database', course_code: 'DB2023', name: 'Database Systems' },
    ],
    course_offerings: [
      { _id: 'offering_ai_2023', course_id: 'course_ai_project', major_id: 'major_ai', grade_year: 2023 },
      { _id: 'offering_db_2023', course_id: 'course_database', major_id: 'major_ai', grade_year: 2023 },
    ],
    class_sessions: [
      { _id: 'session_ai_1', course_offering_id: 'offering_ai_2023' },
      { _id: 'session_db_1', course_offering_id: 'offering_db_2023' },
    ],
    enrollments: [
      { _id: 'enroll_ai_1', student_id: 'student_001', course_offering_id: 'offering_ai_2023' },
      { _id: 'enroll_db_1', student_id: 'student_001', course_offering_id: 'offering_db_2023' },
    ],
    attendance_records: [
      { _id: 'attendance_ai_1', student_id: 'student_001', course_offering_id: 'offering_ai_2023' },
      { _id: 'attendance_db_1', student_id: 'student_001', course_offering_id: 'offering_db_2023' },
    ],
    leave_requests: [
      { _id: 'leave_ai_1', student_id: 'student_001', course_offering_id: 'offering_ai_2023' },
      { _id: 'leave_db_1', student_id: 'student_001', course_offering_id: 'offering_db_2023' },
    ],
    leave_request_sessions: [
      { _id: 'leave_session_ai_1', leave_request_id: 'leave_ai_1', class_session_id: 'session_ai_1' },
      { _id: 'leave_session_db_1', leave_request_id: 'leave_db_1', class_session_id: 'session_db_1' },
    ],
    course_evaluations: [
      { _id: 'eval_ai_1', course_id: 'course_ai_project', course_offering_id: 'offering_ai_2023' },
      { _id: 'eval_db_1', course_id: 'course_database', course_offering_id: 'offering_db_2023' },
    ],
    course_materials: [
      { _id: 'mat_ai_1', course_offering_id: 'offering_ai_2023' },
      { _id: 'mat_db_1', course_offering_id: 'offering_db_2023' },
    ],
    evaluation_tokens: [{ _id: 'token_ai_1', course_offering_id: 'offering_ai_2023' }],
    course_evaluation_summaries: [{ _id: 'summary_ai_1', course_id: 'course_ai_project', course_offering_id: 'offering_ai_2023' }],
    course_recommendations: [{ _id: 'rec_ai_1', recommended_course_id: 'course_ai_project', recommended_offering_id: 'offering_ai_2023' }],
    academic_alerts: [{ _id: 'alert_ai_1', course_offering_id: 'offering_ai_2023' }],
    grades: [{ _id: 'grade_ai_1', enrollment_id: 'enroll_ai_1', student_id: 'student_001', course_offering_id: 'offering_ai_2023' }],
    audit_logs: [],
  });
  const deleteCourse = loadFunction('uniCloud-aliyun/cloudfunctions/delete-admin-course/index.js', db);

  const result = await deleteCourse({
    session: { userId: 'user_admin', role: 'admin' },
    courseOfferingId: 'offering_ai_2023',
    courseId: 'course_ai_project',
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.deletedCourseOfferingId, 'offering_ai_2023');
  assert.equal(result.data.deletedCourseId, 'course_ai_project');
  assert.equal(db.snapshot('courses').some((item) => item._id === 'course_ai_project'), false);
  assert.equal(db.snapshot('course_offerings').some((item) => item._id === 'offering_ai_2023'), false);
  assert.equal(db.snapshot('course_offerings').some((item) => item._id === 'offering_db_2023'), true);

  for (const collectionName of [
    'class_sessions',
    'enrollments',
    'attendance_records',
    'leave_requests',
    'leave_request_sessions',
    'course_evaluations',
    'course_materials',
    'evaluation_tokens',
    'course_evaluation_summaries',
    'course_recommendations',
    'academic_alerts',
    'grades',
  ]) {
    assert.equal(
      db.snapshot(collectionName).some((item) => JSON.stringify(item).includes('offering_ai_2023') || JSON.stringify(item).includes('course_ai_project') || JSON.stringify(item).includes('session_ai_1') || JSON.stringify(item).includes('leave_ai_1')),
      false,
      `${collectionName} should not keep target course data`,
    );
  }
  assert.equal(db.snapshot('class_sessions').some((item) => item._id === 'session_db_1'), true);
  assert.equal(db.snapshot('audit_logs').length, 1);
});

test('profile change requests use database-safe keys and apply nested fields', async () => {
  const db = createMockDb({
    students: [{
      _id: 'student_001',
      user_id: 'user_s_001',
      student_no: 'S2023009',
      name: 'Alice',
      major_id: 'major_ai',
      enrollment_year: 2023,
      contact: { email: 'old@example.com', phone: '100', address: 'Old dorm' },
      family_info: { guardianPhone: '200' },
      status: 'active',
    }],
    teachers: [],
    users: [{ _id: 'user_s_001', email: 'old@example.com', phone: '100' }],
    profile_change_requests: [],
    audit_logs: [],
  });
  const submitProfileChange = loadFunction('uniCloud-aliyun/cloudfunctions/submit-profile-change/index.js', db);
  const reviewProfileChange = loadFunction('uniCloud-aliyun/cloudfunctions/review-profile-change/index.js', db);

  const submitResult = await submitProfileChange({
    session: { userId: 'user_s_001', role: 'student' },
    changes: {
      contact: {
        email: 'new@example.com',
        phone: '300',
        address: 'New dorm',
      },
      familyInfo: {
        guardianPhone: '400',
      },
    },
  });

  assert.equal(submitResult.ok, true);
  const request = db.snapshot('profile_change_requests')[0];
  assert.deepEqual(Object.keys(request.changes).sort(), [
    'contact_address',
    'contact_email',
    'contact_phone',
    'family_info_guardianPhone',
  ]);
  assert.equal(request.changes.contact_email.field, 'contact.email');
  assert.equal(request.changes.family_info_guardianPhone.field, 'family_info.guardianPhone');

  const reviewResult = await reviewProfileChange({
    session: { userId: 'user_admin', role: 'admin' },
    requestId: request._id,
    decision: 'approved',
  });

  assert.equal(reviewResult.ok, true);
  const student = db.snapshot('students')[0];
  assert.equal(student.contact.email, 'new@example.com');
  assert.equal(student.contact.phone, '300');
  assert.equal(student.contact.address, 'New dorm');
  assert.equal(student.family_info.guardianPhone, '400');
  const user = db.snapshot('users')[0];
  assert.equal(user.email, 'new@example.com');
  assert.equal(user.phone, '300');
});
