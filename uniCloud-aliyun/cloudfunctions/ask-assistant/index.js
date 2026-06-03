"use strict";

const db = uniCloud.database();
const HISTORY_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-chat";
const DEEPSEEK_TIMEOUT = 30000;
const RAG_TOP_K = 3;
const MAX_QUERY_LENGTH = 2000;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_CONTENT_LENGTH = 1200;
const ALLOWED_PROVIDERS = new Set(["deepseek", "openai"]);
const EVALUATION_SCORE_KEYS = ["content", "teaching_method", "difficulty", "workload", "achievement", "overall"];
const MAX_KNOWLEDGE_CONTENT_LENGTH = 1400;
const NON_KNOWLEDGE_COLLECTIONS = new Set(["ai_conversations", "ai_messages"]);
const AI_KNOWLEDGE_COLLECTIONS = [
  { name: "academic_alerts", limit: 80 },
  { name: "admin_classes", limit: 50 },
  { name: "ai_conversations", limit: 40 },
  { name: "ai_messages", limit: 80 },
  { name: "api_clients", limit: 40 },
  { name: "api_request_logs", limit: 80 },
  { name: "attendance_records", limit: 120 },
  { name: "audit_logs", limit: 80 },
  { name: "class_sessions", limit: 120 },
  { name: "classrooms", limit: 50 },
  { name: "course_evaluation_summaries", limit: 120 },
  { name: "course_evaluations", limit: 160 },
  { name: "course_materials", limit: 100 },
  { name: "course_offerings", limit: 120 },
  { name: "course_prerequisites", limit: 80 },
  { name: "course_recommendations", limit: 80 },
  { name: "courses", limit: 120 },
  { name: "departments", limit: 50 },
  { name: "enrollments", limit: 200 },
  { name: "evaluation_tokens", limit: 60 },
  { name: "grades", limit: 200 },
  { name: "guardians", limit: 80 },
  { name: "interest_tags", limit: 60 },
  { name: "knowledge_chunks", limit: 120 },
  { name: "knowledge_documents", limit: 120 },
  { name: "leave_request_sessions", limit: 80 },
  { name: "leave_requests", limit: 120 },
  { name: "majors", limit: 50 },
  { name: "notifications", limit: 80 },
  { name: "plan_requirements", limit: 80 },
  { name: "password_reset_tokens", limit: 30 },
  { name: "profile_change_requests", limit: 80 },
  { name: "roles", limit: 30 },
  { name: "semesters", limit: 20 },
  { name: "sso_identities", limit: 30 },
  { name: "student_interest_tags", limit: 120 },
  { name: "students", limit: 200 },
  { name: "teachers", limit: 100 },
  { name: "training_plans", limit: 50 },
  { name: "users", limit: 80 }
];

exports.main = async (event = {}) => {
  const session = normalizeSession(event.session || {});
  if (!["student", "teacher", "admin"].includes(session.role) || !session.userId) {
    return { ok: false, message: "Login is required." };
  }

  const query = String(event.query || event.question || "").trim();
  if (!query) {
    return { ok: false, message: "Question is required." };
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return { ok: false, message: `Question cannot exceed ${MAX_QUERY_LENGTH} characters.` };
  }

  // Handle model listing request
  if (query === "__list_models__") {
    return listModels(event);
  }

  const startedAt = Date.now();
  await purgeExpiredAiHistory(startedAt);
  const conversation = await resolveConversation(session, event, query, startedAt);

  const keywords = buildQueryKeywords(query);
  const contextData = await enrichContext(session, query, keywords);
  const topHits = findTopMatches(contextData.knowledgeRows || [], query, keywords, RAG_TOP_K);

  const systemPrompt = buildSystemPrompt(topHits, contextData, session);
  const historyMessages = buildHistoryMessages(event.history);
  const messages = [{ role: "system", content: systemPrompt }, ...historyMessages, { role: "user", content: query }];

  const userSettings = normalizeApiSettings(event.apiSettings || {});
  const apiKey = userSettings.apiKey || getEnv("DEEPSEEK_API_KEY");
  const provider = userSettings.provider;
  const baseUrl = provider === "openai" ? "https://api.openai.com/v1" : DEEPSEEK_BASE_URL;
  const model = userSettings.model;
  const temperature = userSettings.temperature;
  const maxTokens = userSettings.maxTokens;
  const citations = topHits.map(h => ({ knowledge_base_id: h._id, title: h.title || "" }));

  if (!apiKey) {
    const latencyMs = Date.now() - startedAt;
    const localAnswer = buildLocalContextAnswer(session, query, contextData);
    const grounded = Boolean(localAnswer) || topHits.length > 0;
    const answer =
      localAnswer && localAnswer.answer
        ? localAnswer.answer
        : topHits.length > 0
          ? topHits[0].content || ""
          : "The current knowledge base does not have enough information. Please configure a DeepSeek API key or contact academic staff for confirmation.";
    const answerCitations = localAnswer ? [] : citations;
    const sourceTitle =
      localAnswer && localAnswer.sourceTitle ? localAnswer.sourceTitle : (topHits[0] && topHits[0].title) || "";
    const knowledgeBaseId =
      localAnswer && localAnswer.sourceId && /^kb_/i.test(localAnswer.sourceId)
        ? localAnswer.sourceId
        : (topHits[0] && topHits[0]._id) || undefined;

    await writeMessage(
      conversation._id,
      {
        role: "user",
        content: query,
        fallback_used: false,
        citations: [],
        latency_ms: 0,
        created_at: startedAt
      },
      session
    );
    await writeMessage(
      conversation._id,
      {
        role: "assistant",
        content: answer,
        model: "local-keyword-kb",
        citations: answerCitations,
        fallback_used: true,
        latency_ms: latencyMs,
        created_at: Date.now()
      },
      session
    );
    await updateConversation(conversation, query, startedAt, session);
    await writeAudit("ask_assistant", session, {
      query,
      grounded,
      source_id: localAnswer ? localAnswer.sourceId || "assistant_context" : grounded ? topHits[0]._id : "",
      context_turns: Array.isArray(event.history) ? Math.min(event.history.length, 5) : 0,
      conversation_id: conversation._id,
      latency_ms: latencyMs,
      fallback_reason: "missing_api_key"
    });

    return {
      ok: true,
      data: {
        answer,
        source: sourceTitle,
        sourceTitle,
        grounded,
        fallbackUsed: true,
        knowledgeBaseId,
        conversationId: conversation._id
      }
    };
  }

  let answer;

  try {
    const result = await uniCloud.httpclient.request(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      data: {
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      },
      dataType: "json",
      timeout: DEEPSEEK_TIMEOUT
    });
    answer = result.data.choices[0].message.content;
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    await writeMessage(
      conversation._id,
      {
        role: "user",
        content: query,
        fallback_used: false,
        citations: [],
        latency_ms: 0,
        created_at: startedAt
      },
      session
    );
    await writeAudit("ask_assistant", session, {
      query,
      grounded: false,
      source_id: "",
      context_turns: Array.isArray(event.history) ? Math.min(event.history.length, 5) : 0,
      conversation_id: conversation._id,
      latency_ms: latencyMs,
      error: String(error.message || error)
    });
    return {
      ok: false,
      message: `AI service error: ${error.message || "Unknown error"}. Please try again later.`
    };
  }

  const latencyMs = Date.now() - startedAt;
  const grounded = topHits.length > 0;

  await writeMessage(
    conversation._id,
    {
      role: "user",
      content: query,
      fallback_used: false,
      citations: [],
      latency_ms: 0,
      created_at: startedAt
    },
    session
  );
  await writeMessage(
    conversation._id,
    {
      role: "assistant",
      content: answer,
      model,
      citations,
      fallback_used: false,
      latency_ms: latencyMs,
      created_at: Date.now()
    },
    session
  );
  await updateConversation(conversation, query, startedAt, session);

  await writeAudit("ask_assistant", session, {
    query,
    grounded,
    source_id: grounded ? topHits[0]._id : "",
    context_turns: Array.isArray(event.history) ? Math.min(event.history.length, 5) : 0,
    conversation_id: conversation._id,
    latency_ms: latencyMs
  });

  return {
    ok: true,
    data: {
      answer,
      source: grounded ? topHits[0].title || "" : "",
      sourceTitle: grounded ? topHits[0].title || "" : "",
      grounded,
      fallbackUsed: false,
      knowledgeBaseId: grounded ? topHits[0]._id : undefined,
      conversationId: conversation._id
    }
  };
};

function buildSystemPrompt(topHits, contextData, session) {
  let prompt =
    "You are a helpful educational management assistant for a university. Answer questions accurately in Chinese. Be concise.";

  if (contextData) {
    if (session.role === "student" || session.role === "teacher") {
      prompt += `\n\nCurrent user: ${session.displayName || ""} (${session.role}, id: ${session.userId}).`;
    }
    if (contextData.userProfile) {
      prompt += `\n\nUser Profile:\n${contextData.userProfile}`;
    }
    if (contextData.courses && contextData.courses.length > 0) {
      prompt += `\n\nCourses (${contextData.courses.length}):\n${contextData.courses.map(c => `- ${c.code} ${c.name} (${c.credits} credits, ${c.teacher || ""}, semester ${c.semester || ""})`).join("\n")}`;
    }
    if (contextData.attendance && contextData.attendance.length > 0) {
      prompt += `\n\nRecent Attendance (${contextData.attendance.length} records):\n${contextData.attendance.map(a => `- ${a.date} ${a.courseName}: ${a.status}`).join("\n")}`;
    }
    if (contextData.leaves && contextData.leaves.length > 0) {
      prompt += `\n\nLeave Requests (${contextData.leaves.length}):\n${contextData.leaves.map(l => `- ${l.date} ${l.courseName}: ${l.status} (${l.type})`).join("\n")}`;
    }
    if (contextData.grades) {
      prompt += `\n\nGPA / Grades:\n${contextData.grades}`;
    }
    if (contextData.evaluations && contextData.evaluations.length > 0) {
      prompt += `\n\nCourse Evaluations:\n${contextData.evaluations.map(e => `- ${e.courseName}: avg ${e.avg}/5 (${e.count} responses), difficulty ${e.diffAvg}/5`).join("\n")}`;
    }
    if (contextData.courseParticipants && contextData.courseParticipants.length > 0) {
      prompt += `\n\nCourse Participants:\n${contextData.courseParticipants.map(formatCourseParticipantPromptLine).join("\n")}`;
    }
    if (contextData.evaluationInsights && contextData.evaluationInsights.length > 0) {
      prompt += `\n\nAnonymous Evaluation Insights:\n${contextData.evaluationInsights.map(formatEvaluationPromptLine).join("\n")}`;
    }
    if (contextData.teachers && contextData.teachers.length > 0) {
      prompt += `\n\nTeachers:\n${contextData.teachers.map(t => `- ${t.name} (${t.title || ""}): ${t.department || ""}, ${t.fields || ""}`).join("\n")}`;
    }
    if (contextData.graduation) {
      prompt += `\n\nGraduation Progress:\n${contextData.graduation}`;
    }
    if (contextData.stats) {
      prompt += `\n\nSystem Stats:\n- Students: ${contextData.stats.students}\n- Teachers: ${contextData.stats.teachers}\n- Courses: ${contextData.stats.courses}`;
    }
    if (contextData.students && contextData.students.length > 0) {
      prompt += `\n\nStudent Roster (${contextData.students.length} shown):\n${contextData.students.map(formatStudentPromptLine).join("\n")}`;
    }
  }

  if (topHits.length > 0) {
    prompt += "\n\nKnowledge base references:\n";
    topHits.forEach((hit, i) => {
      prompt += `[KB-${i + 1}] ${hit.title}\n${hit.content}\n\n`;
    });
  }
  return prompt;
}

async function enrichContext(session, query) {
  const result = {
    knowledgeRows: [],
    courses: [],
    attendance: [],
    leaves: [],
    evaluations: [],
    teachers: [],
    students: [],
    courseParticipants: [],
    evaluationInsights: []
  };

  // Always load knowledge base
  try {
    result.knowledgeRows = await readKnowledgeBase();
  } catch (_) {
    /* ignore */
  }

  try {
    const expandedKnowledge = await readExpandedKnowledgeContext(session, query);
    if (expandedKnowledge && Array.isArray(expandedKnowledge.knowledgeRows)) {
      result.knowledgeRows = result.knowledgeRows.concat(expandedKnowledge.knowledgeRows);
    }
    if (expandedKnowledge && Array.isArray(expandedKnowledge.courseParticipants)) {
      result.courseParticipants = expandedKnowledge.courseParticipants;
    }
    if (expandedKnowledge && Array.isArray(expandedKnowledge.evaluationInsights)) {
      result.evaluationInsights = expandedKnowledge.evaluationInsights;
    }
  } catch (error) {
    console.warn("[ask-assistant] expanded knowledge read skipped.", error);
  }

  // Always load courses with teachers (simple: fetch all, join in memory)
  try {
    const allCourses = await scanCollection("courses", 50);
    const allOfferings = await scanCollection("course_offerings", 50);
    const allTeachers = await scanCollection("teachers", 50);
    const allDepts = await scanCollection("departments", 30);
    const allSemesters = await scanCollection("semesters", 20);

    const deptMap = {};
    allDepts.forEach(d => {
      deptMap[d._id] = d.name || "";
    });
    const tMap = {};
    allTeachers.forEach(t => {
      tMap[t._id] = t;
    });
    const semMap = {};
    allSemesters.forEach(s => {
      semMap[s._id] = s.name || "";
    });

    const active = allCourses.filter(c => c.status === "active");
    result.courses = active.slice(0, 30).map(c => {
      const offering = allOfferings.find(o => o.course_id === c._id && o.selection_status === "open");
      const tNames = ((offering && offering.teacher_ids) || [])
        .map(tid => (tMap[tid] ? tMap[tid].name : ""))
        .filter(Boolean);
      return {
        code: c.course_code || "",
        name: c.name || "",
        credits: c.credits || 0,
        semester: offering && offering.semester_id ? semMap[offering.semester_id] || "" : "",
        teacher: tNames.join(", "),
        department: c.department_id ? deptMap[c.department_id] || "" : ""
      };
    });

    result.teachers = allTeachers.slice(0, 20).map(t => ({
      name: t.name || "",
      title: t.title || "",
      department: t.department_id ? deptMap[t.department_id] || "" : "",
      fields: (t.research_fields || []).join(", ")
    }));
  } catch (_) {
    /* ignore */
  }

  // Role-specific data
  if (session.role === "student") {
    try {
      result.userProfile = await buildStudentProfile(session.userId);
      result.attendance = await readStudentAttendance(session.userId);
      result.leaves = await readStudentLeaves(session.userId);
      result.grades = await buildGradeSummary(session.userId);
      result.graduation = await buildGraduationProgress(session.userId);
    } catch (_) {
      /* ignore */
    }
  }

  if (session.role === "teacher") {
    try {
      const tProfile = await readTeacherProfile(session.userId);
      result.userProfile = tProfile ? tProfile.profile : "";
      if (tProfile) {
        result.attendance = await readTeacherAtRiskStudents(tProfile.teacherId);
        result.evaluations = await readTeacherEvaluationSummaries(tProfile.teacherId);
      }
    } catch (_) {
      /* ignore */
    }
  }

  if (session.role === "admin") {
    try {
      result.students = await readAdminStudentRoster();
    } catch (_) {
      /* ignore */
    }
    try {
      result.evaluations = await readAllEvaluationSummaries();
      try {
        const s = await db.collection("students").where({ status: "active" }).count();
        const t = await db.collection("teachers").where({}).count();
        const c = await db.collection("courses").where({ status: "active" }).count();
        result.stats = { students: s.total || 0, teachers: t.total || 0, courses: c.total || 0 };
      } catch (_) {
        /* ignore */
      }
    } catch (_) {
      /* ignore */
    }
  }

  return result;
}

async function listModels(event) {
  const userSettings = normalizeApiSettings(event.apiSettings || {});
  const apiKey = userSettings.apiKey || getEnv("DEEPSEEK_API_KEY");
  const provider = userSettings.provider;
  const baseUrl = provider === "openai" ? "https://api.openai.com/v1" : DEEPSEEK_BASE_URL;

  if (!apiKey) {
    return { ok: false, message: "API key not configured." };
  }

  // Try live API first
  for (const path of ["/models", "/model/list"]) {
    try {
      const result = await uniCloud.httpclient.request(`${baseUrl}${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        dataType: "json",
        timeout: 10000
      });
      const ids = (result.data.data || result.data || [])
        .map(m => m.id)
        .filter(Boolean)
        .sort();
      if (ids.length > 0) return { ok: true, data: { models: ids, provider, source: "live" } };
    } catch (_) {
      /* try next */
    }
  }

  // Fallback: known models per provider
  const fallback = {
    deepseek: ["deepseek-chat", "deepseek-reasoner"],
    openai: ["gpt-4.1", "gpt-4o", "gpt-4o-mini", "o3-mini", "o1", "o1-mini", "o3", "o4-mini"]
  };
  return { ok: true, data: { models: fallback[provider] || fallback.deepseek, provider, source: "fallback" } };
}

function getEnv(name) {
  if (typeof process !== "undefined" && process.env && process.env[name]) {
    return process.env[name];
  }
  return "";
}

function buildHistoryMessages(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-MAX_HISTORY_TURNS)
    .filter(item => item && (item.role === "user" || item.role === "assistant"))
    .map(item => ({
      role: item.role,
      content: String(item.content || "").slice(0, MAX_HISTORY_CONTENT_LENGTH)
    }))
    .filter(item => item.content);
}

function findTopMatches(rows, query, keywords, topK) {
  const cleanedQuery = query.toLowerCase();
  const scored = rows
    .map(item => {
      const itemKeywords = Array.isArray(item.keywords) ? item.keywords : [];
      const hitCount = itemKeywords.reduce((sum, keyword) => {
        const normalized = singularize(String(keyword || "").toLowerCase());
        return sum + (keywords.includes(normalized) || cleanedQuery.includes(normalized) ? 1 : 0);
      }, 0);
      const titleHit = item.title && cleanedQuery.includes(String(item.title).toLowerCase()) ? 1 : 0;
      return { ...item, _score: hitCount + titleHit };
    })
    .filter(item => item._score > 0)
    .sort((a, b) => b._score - a._score);
  return scored.slice(0, topK);
}

async function resolveConversation(session, event, query, now) {
  const requestedId = String(event.conversationId || "").trim();
  if (requestedId) {
    const existing = await findConversationById(requestedId);
    if (existing && conversationBelongsToSession(existing, session)) {
      return existing;
    }
  }
  const scenario = resolveScenario(query);
  const active = await findActiveConversation(session, scenario);
  if (active) return active;
  const conversation = {
    user_id: session.userId,
    role: session.role,
    title: query.slice(0, 40) || "AI Assistant Conversation",
    scenario,
    context_summary: "",
    message_count: 0,
    status: "active",
    created_at: now,
    updated_at: now
  };
  const result = await db.collection("ai_conversations").add(conversation);
  return { ...conversation, _id: result.id };
}

async function findConversationById(id) {
  try {
    const result = await db.collection("ai_conversations").doc(id).get();
    return result.data && result.data[0] ? result.data[0] : null;
  } catch (error) {
    console.warn("[ask-assistant] conversation lookup skipped.", error);
    return null;
  }
}

async function findActiveConversation(session, scenario) {
  try {
    const rows = [];
    for (const userId of session.userIds || [session.userId]) {
      rows.push(...(await readRows("ai_conversations", { user_id: userId, scenario, status: "active" }, 20)));
      rows.push(...(await readRows("ai_conversations", { userId, scenario, status: "active" }, 20)));
    }
    return (
      uniqueById(rows)
        .filter(item => conversationBelongsToSession(item, session))
        .sort((a, b) => Number(b.updated_at || b.updatedAt || 0) - Number(a.updated_at || a.updatedAt || 0))[0] || null
    );
  } catch (error) {
    console.warn("[ask-assistant] active conversation lookup skipped.", error);
    return null;
  }
}

async function readRows(collection, query, limit) {
  try {
    const result = await db
      .collection(collection)
      .where(query)
      .limit(limit || 50)
      .get();
    return result.data || [];
  } catch (_) {
    return [];
  }
}

async function writeMessage(conversationId, message, session) {
  try {
    await db.collection("ai_messages").add({
      conversation_id: conversationId,
      user_id: (session && session.userId) || "",
      role_owner: (session && session.role) || "",
      ...message
    });
  } catch (error) {
    console.warn("[ask-assistant] ai message write skipped.", error);
  }
}

async function updateConversation(conversation, query, now, session) {
  try {
    await db
      .collection("ai_conversations")
      .doc(conversation._id)
      .update({
        title: conversation.title || query.slice(0, 40) || "AI Assistant Conversation",
        user_id: (session && session.userId) || conversation.user_id || conversation.userId || "",
        role: conversation.role || (session && session.role) || "",
        context_summary: query.slice(0, 120),
        message_count: Number(conversation.message_count || 0) + 2,
        updated_at: now
      });
  } catch (error) {
    console.warn("[ask-assistant] conversation update skipped.", error);
  }
}

function conversationBelongsToSession(conversation, session) {
  const userId = String(conversation.user_id || conversation.userId || "").trim();
  const role = String(conversation.role || conversation.role_owner || conversation.ownerRole || "").trim();
  const userIds = session.userIds || [session.userId];
  return userIds.includes(userId) && (!role || role === session.role);
}

async function purgeExpiredAiHistory(now = Date.now()) {
  if (Math.random() >= 0.02) {
    return;
  }
  const cutoff = now - HISTORY_RETENTION_MS;
  await removeOldRows("ai_messages", "created_at", cutoff);
  await removeOldRows("ai_conversations", "updated_at", cutoff);
}

async function removeOldRows(collection, field, cutoff) {
  try {
    const result = await db.collection(collection).limit(500).get();
    const rows = (result.data || []).filter(item => Number(item[field] || 0) < cutoff);
    for (const row of rows) {
      if (row._id) {
        await db.collection(collection).doc(row._id).remove();
      }
    }
  } catch (error) {
    console.warn(`[ask-assistant] ${collection} retention cleanup skipped.`, error);
  }
}

function resolveScenario(query) {
  const value = String(query || "").toLowerCase();
  if (/(course|selection|elective|课程|选课)/.test(value)) return "course_selection";
  if (/(schedule|timetable|课表|安排)/.test(value)) return "schedule_query";
  if (/(exam|考试)/.test(value)) return "exam_query";
  if (/(graduation|credit|毕业|学分)/.test(value)) return "graduation_check";
  if (/(policy|rule|制度|政策)/.test(value)) return "policy_qa";
  return "other";
}

async function readKnowledgeBase() {
  try {
    const result = await db.collection("knowledge_base").limit(300).get();
    return (result.data || []).filter(item => item.status !== "hidden" && item.is_public !== false);
  } catch (error) {
    console.warn("[ask-assistant] knowledge_base read failed.", error);
    return [];
  }
}

function normalizeSession(session) {
  const normalized = { ...session };
  const rawUserId = String(normalized.userId || normalized.uid || normalized.user_id || "").trim();
  normalized.userId = normalizeCloudUserId(rawUserId);
  normalized.rawUserId = rawUserId;
  normalized.userIds = buildUserIdAliases(rawUserId || normalized.userId);
  normalized.role = String(normalized.role || "").trim();
  normalized.displayName = String(normalized.displayName || normalized.display_name || "").slice(0, 80);
  return normalized;
}

function normalizeCloudUserId(userId) {
  const value = String(userId || "").trim();
  if (/^u_student_/i.test(value)) return `user_s_${value.slice("u_student_".length)}`;
  if (/^student_/i.test(value)) return `user_s_${value.slice("student_".length)}`;
  if (/^u_teacher_/i.test(value)) return `user_t_${value.slice("u_teacher_".length)}`;
  if (/^teacher_/i.test(value)) return `user_t_${value.slice("teacher_".length)}`;
  if (/^u_admin_/i.test(value)) return `user_admin_${value.slice("u_admin_".length)}`;
  return value;
}

function buildUserIdAliases(userId) {
  const value = String(userId || "").trim();
  const normalized = normalizeCloudUserId(value);
  const aliases = new Set([value, normalized].filter(Boolean));
  addReverseAliases(aliases, normalized);
  addReverseAliases(aliases, value);
  return Array.from(aliases);
}

function addReverseAliases(aliases, value) {
  const lower = String(value || "").toLowerCase();
  if (lower.startsWith("user_s_")) {
    const suffix = value.slice("user_s_".length);
    aliases.add(`u_student_${suffix}`);
    aliases.add(`student_${suffix}`);
  }
  if (lower.startsWith("user_t_")) {
    const suffix = value.slice("user_t_".length);
    aliases.add(`u_teacher_${suffix}`);
    aliases.add(`teacher_${suffix}`);
  }
  if (lower.startsWith("user_admin_")) {
    aliases.add(`u_admin_${value.slice("user_admin_".length)}`);
  }
}

function uniqueById(rows) {
  const seen = new Set();
  const result = [];
  for (const row of rows || []) {
    const key = String((row && (row._id || row.id || JSON.stringify(row))) || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function normalizeApiSettings(settings) {
  const provider = ALLOWED_PROVIDERS.has(String(settings.provider || "").trim())
    ? String(settings.provider || "").trim()
    : "deepseek";
  const model =
    String(settings.model || DEEPSEEK_MODEL)
      .trim()
      .slice(0, 80) || DEEPSEEK_MODEL;
  const rawTemperature = Number(settings.temperature ?? 0.7);
  const temperature = Number.isFinite(rawTemperature) ? Math.max(0, Math.min(2, rawTemperature)) : 0.7;
  const rawMaxTokens = Number(settings.maxTokens ?? 2048);
  const maxTokens = Number.isFinite(rawMaxTokens) ? Math.max(256, Math.min(4096, Math.round(rawMaxTokens))) : 2048;
  return {
    provider,
    model,
    temperature,
    maxTokens,
    apiKey: String(settings.apiKey || "").trim()
  };
}

async function scanCollection(name, limit) {
  try {
    const result = await db
      .collection(name)
      .limit(limit || 50)
      .get();
    return result.data || [];
  } catch (_) {
    return [];
  }
}

function getById(list, id) {
  return (list || []).find(item => item._id === id) || null;
}

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return String(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function buildStudentProfile(userId) {
  try {
    const users = await scanCollection("users", 50);
    const user = users.find(u => u._id === userId);
    const students = await scanCollection("students", 50);
    const student = students.find(s => s.user_id === userId);
    if (!student) return "";
    const majors = await scanCollection("majors", 30);
    const major = majors.find(m => m._id === student.major_id);
    let profile = `Student ID: ${student.student_no || ""}, Name: ${user ? user.display_name || student.name : student.name}, Enrollment: ${student.enrollment_year || ""}`;
    if (major) profile += `, Major: ${major.name}`;
    return profile;
  } catch (_) {
    return "";
  }
}

async function readAdminStudentRoster(limit = 100) {
  const [students, majors, classes, users] = await Promise.all([
    scanCollection("students", limit),
    scanCollection("majors", 100),
    scanCollection("admin_classes", 100),
    scanCollection("users", 200)
  ]);
  const majorMap = new Map(majors.map(item => [item._id, item]));
  const classMap = new Map(classes.map(item => [item._id, item]));
  const userMap = new Map(users.map(item => [item._id, item]));

  return students
    .slice(0, limit)
    .map(student => {
      const userId = String(student.user_id || student.userId || "").trim();
      const user = userMap.get(userId) || {};
      const major = majorMap.get(student.major_id || student.majorId) || {};
      const adminClass = classMap.get(student.admin_class_id || student.adminClassId) || {};
      return {
        studentNo: String(student.student_no || student.studentNo || "").trim(),
        name: String(student.name || student.display_name || user.display_name || user.username || "").trim(),
        userId,
        major: String(student.major_name || student.majorName || major.name || "").trim(),
        adminClass: String(student.admin_class_name || student.adminClassName || adminClass.name || "").trim(),
        enrollmentYear: Number(student.enrollment_year || student.enrollmentYear || 0) || "",
        status: String(student.status || "").trim()
      };
    })
    .filter(student => student.studentNo || student.name || student.userId);
}

function buildLocalContextAnswer(session, query, contextData) {
  if (
    session.role === "admin" &&
    isStudentRosterQuery(query) &&
    contextData &&
    Array.isArray(contextData.students) &&
    contextData.students.length > 0 &&
    extractCourseCodes(query).length === 0
  ) {
    return {
      answer: formatAdminStudentRosterAnswer(contextData.students),
      sourceTitle: "Student roster",
      sourceId: "student_roster"
    };
  }

  if (
    session.role !== "student" &&
    isStudentRosterQuery(query) &&
    contextData &&
    Array.isArray(contextData.courseParticipants) &&
    contextData.courseParticipants.length > 0
  ) {
    const rosterSections = filterCourseSectionsByQuery(contextData.courseParticipants, query);
    if (rosterSections.length > 0) {
      return {
        answer: formatCourseParticipantAnswer(rosterSections),
        sourceTitle: rosterSections.length === 1 ? rosterSections[0].courseLabel : "Student roster",
        sourceId: rosterSections.length === 1 ? rosterSections[0].offeringId : "student_roster"
      };
    }
  }

  if (
    isEvaluationQuestion(query) &&
    contextData &&
    Array.isArray(contextData.evaluationInsights) &&
    contextData.evaluationInsights.length > 0
  ) {
    const evaluationSections = filterEvaluationSectionsByQuery(contextData.evaluationInsights, query);
    if (evaluationSections.length > 0) {
      return {
        answer: formatEvaluationAnswer(evaluationSections),
        sourceTitle:
          evaluationSections.length === 1 ? evaluationSections[0].courseLabel : "Anonymous course evaluations",
        sourceId: evaluationSections.length === 1 ? evaluationSections[0].offeringId : "course_evaluations"
      };
    }
  }
  return null;
}

function isStudentRosterQuery(query) {
  const value = String(query || "").toLowerCase();
  const mentionsStudent = /(student|students|\u5b66\u751f)/.test(value);
  const asksList =
    /(list|roster|names?|who|\u540d\u5355|\u540d\u5b57|\u540d\u518c|\u5217\u51fa|\u5217\u8868|\u6709\u54ea\u4e9b|\u5177\u4f53|\u53c2\u4e0e|\u53c2\u52a0)/.test(
      value
    );
  const mentionsCourse = /(course|课程|选课|JC\d{3,4}|[A-Z]{2,6}\d{3,4})/.test(value);
  return asksList && (mentionsStudent || mentionsCourse);
}

function isEvaluationQuestion(query) {
  const value = String(query || "").toLowerCase();
  return /(evaluation|feedback|review|rating|course evaluation|课程评价|评价|反馈|打分|评分|匿名)/.test(value);
}

function formatCourseParticipantAnswer(sections) {
  const lines = ["参与学生名单："];
  sections.forEach(section => {
    lines.push(
      `${section.courseLabel}${section.teacherLabel ? ` / ${section.teacherLabel}` : ""}（${section.studentCount}人）`
    );
    section.students.forEach(student => {
      lines.push(formatStudentPromptLine(student));
    });
  });
  return lines.join("\n");
}

function formatEvaluationAnswer(sections) {
  const lines = ["匿名课程评价："];
  sections.forEach(section => {
    const metrics = [
      `平均 ${formatAverage(section.averageScores.overall)}/5`,
      `内容 ${formatAverage(section.averageScores.content)}/5`,
      `教学 ${formatAverage(section.averageScores.teaching_method)}/5`,
      `难度 ${formatAverage(section.averageScores.difficulty)}/5`,
      `工作量 ${formatAverage(section.averageScores.workload)}/5`,
      `成效 ${formatAverage(section.averageScores.achievement)}/5`
    ].join("，");
    lines.push(
      `${section.courseLabel}${section.teacherLabel ? ` / ${section.teacherLabel}` : ""}：${section.evaluationCount}条，${metrics}`
    );
    if (section.feedbackSamples && section.feedbackSamples.length > 0) {
      lines.push(`- 反馈：${section.feedbackSamples.slice(0, 3).join("；")}`);
    }
  });
  return lines.join("\n");
}

function formatCourseParticipantPromptLine(section) {
  return `- ${section.courseLabel}${section.teacherLabel ? ` / ${section.teacherLabel}` : ""}: ${section.studentCount} students`;
}

function formatEvaluationPromptLine(section) {
  const metrics = [
    `overall ${formatAverage(section.averageScores.overall)}/5`,
    `content ${formatAverage(section.averageScores.content)}/5`,
    `teaching ${formatAverage(section.averageScores.teaching_method)}/5`,
    `difficulty ${formatAverage(section.averageScores.difficulty)}/5`,
    `workload ${formatAverage(section.averageScores.workload)}/5`,
    `achievement ${formatAverage(section.averageScores.achievement)}/5`
  ].join(", ");
  const feedback =
    section.feedbackSamples && section.feedbackSamples.length > 0
      ? `; feedback ${section.feedbackSamples.slice(0, 2).join(" | ")}`
      : "";
  return `- ${section.courseLabel}${section.teacherLabel ? ` / ${section.teacherLabel}` : ""}: ${section.evaluationCount} responses, ${metrics}${feedback}`;
}

function formatAverage(value) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue.toFixed(1) : "0.0";
}

function filterCourseSectionsByQuery(sections, query) {
  const value = String(query || "").toLowerCase();
  const codes = extractCourseCodes(query);
  const matched = sections.filter(section => {
    const courseCode = String(section.courseCode || "").toLowerCase();
    const courseLabel = String(section.courseLabel || "").toLowerCase();
    const teacherLabel = String(section.teacherLabel || "").toLowerCase();
    return (
      codes.some(code => code === String(section.courseCode || "").toUpperCase()) ||
      (courseCode && value.includes(courseCode)) ||
      (courseLabel && value.includes(courseLabel)) ||
      (teacherLabel && value.includes(teacherLabel))
    );
  });
  return matched.length > 0 ? matched : sections.slice(0, 5);
}

function filterEvaluationSectionsByQuery(sections, query) {
  const value = String(query || "").toLowerCase();
  const codes = extractCourseCodes(query);
  const matched = sections.filter(section => {
    const courseCode = String(section.courseCode || "").toLowerCase();
    const courseLabel = String(section.courseLabel || "").toLowerCase();
    const teacherLabel = String(section.teacherLabel || "").toLowerCase();
    return (
      codes.some(code => code === String(section.courseCode || "").toUpperCase()) ||
      (courseCode && value.includes(courseCode)) ||
      (courseLabel && value.includes(courseLabel)) ||
      (teacherLabel && value.includes(teacherLabel))
    );
  });
  return matched.length > 0 ? matched : sections.slice(0, 5);
}

function extractCourseCodes(query) {
  const matches = String(query || "").match(/\b[A-Z]{2,6}\d{3,4}\b/gi) || [];
  return Array.from(new Set(matches.map(value => String(value || "").toUpperCase())));
}

async function readExpandedKnowledgeContext(session, query) {
  const tableData = await readKnowledgeSourceTables();
  const references = buildKnowledgeReferenceMaps(tableData);
  const knowledgeRows = buildKnowledgeRowsFromTables(tableData, references);
  const courseParticipants = isStudentRosterQuery(query)
    ? buildCourseParticipantInsights(session, query, tableData, references)
    : [];
  const evaluationInsights = isEvaluationQuestion(query) ? buildEvaluationInsights(query, tableData, references) : [];
  return { knowledgeRows, courseParticipants, evaluationInsights };
}

async function readKnowledgeSourceTables() {
  const entries = await Promise.all(
    AI_KNOWLEDGE_COLLECTIONS.map(async spec => [spec.name, await scanCollection(spec.name, spec.limit)])
  );
  return Object.fromEntries(entries);
}

function buildKnowledgeReferenceMaps(tableData) {
  return {
    courses: mapRowsById(tableData.courses),
    courseOfferings: mapRowsById(tableData.course_offerings),
    students: mapRowsById(tableData.students),
    teachers: mapRowsById(tableData.teachers),
    teachersByUserId: mapRowsByUserId(tableData.teachers, ["user_id", "userId"]),
    departments: mapRowsById(tableData.departments),
    majors: mapRowsById(tableData.majors),
    adminClasses: mapRowsById(tableData.admin_classes),
    semesters: mapRowsById(tableData.semesters),
    classrooms: mapRowsById(tableData.classrooms),
    users: mapRowsById(tableData.users)
  };
}

function buildKnowledgeRowsFromTables(tableData, references) {
  const rows = [];
  for (const spec of AI_KNOWLEDGE_COLLECTIONS) {
    if (NON_KNOWLEDGE_COLLECTIONS.has(spec.name)) {
      continue;
    }
    const items = tableData[spec.name] || [];
    for (const item of items) {
      const knowledgeRow = createKnowledgeRow(spec.name, item, references);
      if (knowledgeRow) {
        rows.push(knowledgeRow);
      }
    }
  }
  return rows;
}

function createKnowledgeRow(collectionName, row, references) {
  const enriched = enrichKnowledgeRow(collectionName, row, references);
  const title = pickKnowledgeTitle(collectionName, enriched, row, references);
  const content = summarizeKnowledgeValue(enriched, 0).slice(0, MAX_KNOWLEDGE_CONTENT_LENGTH);
  const keywords = buildQueryKeywords([collectionName, title, content].join(" "));
  return {
    _id: `${collectionName}:${String(row._id || row.id || title || Date.now())}`,
    title: title || collectionName,
    content,
    keywords,
    category: inferKnowledgeCategory(collectionName),
    sourceTable: collectionName,
    sourceId: String(row._id || row.id || "").trim()
  };
}

function enrichKnowledgeRow(collectionName, row, references) {
  const copy = { ...row };
  switch (collectionName) {
    case "courses": {
      copy.courseLabel = buildCourseLabel(row, references);
      copy.departmentName = resolveDepartmentName(references, row.department_id || row.departmentId || "");
      break;
    }
    case "course_offerings": {
      const course = references.courses.get(String(row.course_id || "").trim()) || null;
      copy.courseLabel = buildCourseLabel(course || row, references);
      copy.teacherNames = resolveTeacherNames(references, row.teacher_ids || row.teacherIds || []);
      copy.semesterName = resolveSemesterName(references, row.semester_id || row.semesterId || "");
      copy.classroomLabel = resolveClassroomLabel(references, row.classroom_id || row.classroomId || "");
      break;
    }
    case "students":
      copy.studentLabel = buildStudentLabel(row, references);
      copy.majorName = resolveMajorName(references, row.major_id || row.majorId || "");
      copy.adminClassName = resolveAdminClassName(references, row.admin_class_id || row.adminClassId || "");
      break;
    case "teachers":
      copy.teacherLabel = buildTeacherLabel(row, references);
      copy.departmentName = resolveDepartmentName(references, row.department_id || row.departmentId || "");
      break;
    case "enrollments": {
      const student = references.students.get(String(row.student_id || row.studentId || "").trim()) || null;
      const offering =
        references.courseOfferings.get(String(row.course_offering_id || row.courseOfferingId || "").trim()) || null;
      const course = offering ? references.courses.get(String(offering.course_id || "").trim()) || null : null;
      copy.studentLabel = buildStudentLabel(student || row, references);
      copy.courseLabel = buildCourseLabel(course || offering || row, references);
      copy.teacherNames = offering
        ? resolveTeacherNames(references, offering.teacher_ids || offering.teacherIds || [])
        : [];
      break;
    }
    case "course_evaluations": {
      const course = references.courses.get(String(row.course_id || row.courseId || "").trim()) || null;
      const offering =
        references.courseOfferings.get(String(row.course_offering_id || row.courseOfferingId || "").trim()) || null;
      copy.courseLabel = buildCourseLabel(course || offering || row, references);
      copy.teacherNames = resolveEvaluationTeacherNames(row, offering, references);
      copy.feedbackPreview = String(row.feedback_text || row.feedback || "").slice(0, 180);
      break;
    }
    case "course_evaluation_summaries":
      copy.courseLabel = buildCourseLabel(
        references.courses.get(String(row.course_id || row.courseId || "").trim()) || row,
        references
      );
      break;
    case "grades": {
      const student = references.students.get(String(row.student_id || row.studentId || "").trim()) || null;
      const course = references.courses.get(String(row.course_id || row.courseId || "").trim()) || null;
      copy.studentLabel = buildStudentLabel(student || row, references);
      copy.courseLabel = buildCourseLabel(course || row, references);
      break;
    }
    case "attendance_records": {
      const student = references.students.get(String(row.student_id || row.studentId || "").trim()) || null;
      const offering =
        references.courseOfferings.get(String(row.course_offering_id || row.courseOfferingId || "").trim()) || null;
      const course = offering ? references.courses.get(String(offering.course_id || "").trim()) || null : null;
      copy.studentLabel = buildStudentLabel(student || row, references);
      copy.courseLabel = buildCourseLabel(course || offering || row, references);
      break;
    }
    case "leave_requests": {
      const student = references.students.get(String(row.student_id || row.studentId || "").trim()) || null;
      const offering =
        references.courseOfferings.get(String(row.course_offering_id || row.courseOfferingId || "").trim()) || null;
      const course = offering ? references.courses.get(String(offering.course_id || "").trim()) || null : null;
      copy.studentLabel = buildStudentLabel(student || row, references);
      copy.courseLabel = buildCourseLabel(course || offering || row, references);
      break;
    }
    default:
      break;
  }
  return copy;
}

function pickKnowledgeTitle(collectionName, row, originalRow, references) {
  const candidates = [
    row.courseLabel,
    row.studentLabel,
    row.teacherLabel,
    row.course_name,
    row.courseName,
    row.title,
    row.name,
    row.student_no,
    row.studentNo,
    row.teacher_no,
    row.teacherNo,
    row.code,
    row.course_code,
    row.alert_type,
    row.path_name,
    row.pathName
  ];
  const title = candidates.map(value => String(value || "").trim()).find(Boolean);
  if (title) {
    return title;
  }
  return `${collectionName} ${String(originalRow._id || originalRow.id || "").trim()}`.trim();
}

function buildCourseParticipantInsights(session, query, tableData, references) {
  if (session.role === "student") {
    return [];
  }
  const rosterCourses = resolveRosterCourseOfferings(session, query, tableData, references);
  const enrollments = tableData.enrollments || [];
  return rosterCourses.map(offering => {
    const course = references.courses.get(String(offering.course_id || "").trim()) || null;
    const courseLabel = buildCourseLabel(course || offering, references);
    const teacherNames = resolveTeacherNames(references, offering.teacher_ids || offering.teacherIds || []);
    const students = enrollments
      .filter(
        item =>
          String(item.course_offering_id || item.courseOfferingId || "").trim() === String(offering._id || "").trim()
      )
      .filter(item => String(item.status || "").toLowerCase() !== "dropped")
      .map(item => {
        const student = references.students.get(String(item.student_id || item.studentId || "").trim()) || null;
        return {
          studentId: String(item.student_id || item.studentId || "").trim(),
          studentNo: String((student && (student.student_no || student.studentNo)) || "").trim(),
          name: String(
            (student && (student.name || student.display_name || student.username)) ||
              item.student_id ||
              item.studentId ||
              ""
          ).trim(),
          major: resolveMajorName(references, (student && (student.major_id || student.majorId)) || ""),
          adminClass: resolveAdminClassName(
            references,
            (student && (student.admin_class_id || student.adminClassId)) || ""
          )
        };
      });
    return {
      offeringId: String(offering._id || "").trim(),
      courseCode: String((course && (course.course_code || course.code)) || "").trim(),
      courseName: String((course && course.name) || "").trim(),
      courseLabel,
      teacherLabel: teacherNames.length ? `教师：${teacherNames.join("、")}` : "",
      studentCount: students.length,
      students
    };
  });
}

function buildEvaluationInsights(query, tableData, references) {
  const evaluations = tableData.course_evaluations || [];
  const grouped = new Map();
  const codes = extractCourseCodes(query);
  const normalizedQuery = String(query || "").toLowerCase();

  evaluations.forEach(evaluation => {
    const offeringId = String(evaluation.course_offering_id || evaluation.courseOfferingId || "").trim();
    const offering = references.courseOfferings.get(offeringId) || null;
    const course =
      references.courses.get(
        String(evaluation.course_id || evaluation.courseId || (offering && offering.course_id) || "").trim()
      ) || null;
    const courseLabel = buildCourseLabel(course || offering || evaluation, references);
    const teacherIds = resolveEvaluationTeacherIds(evaluation, offering);
    const teacherNames = teacherIds.length
      ? teacherIds.map(teacherId => resolveTeacherName(references, teacherId)).filter(Boolean)
      : [""];
    const searchTarget = `${courseLabel} ${teacherNames.join(" ")}`.toLowerCase();
    if (codes.length > 0 && !codes.some(code => searchTarget.includes(code.toLowerCase()))) {
      if (!normalizedQuery.includes(String(courseLabel || "").toLowerCase())) {
        return;
      }
    }

    teacherNames.forEach((teacherName, index) => {
      const teacherId = teacherIds[index] || teacherIds[0] || "";
      const key = `${offeringId}::${teacherId || teacherName || "all"}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          offeringId,
          courseCode: String((course && (course.course_code || course.code)) || "").trim(),
          courseName: String(
            (course && course.name) || (offering && offering.course_name) || (offering && offering.courseName) || ""
          ).trim(),
          courseLabel,
          teacherId,
          teacherLabel: teacherName ? `教师：${teacherName}` : "",
          evaluationCount: 0,
          scoreTotals: Object.fromEntries(EVALUATION_SCORE_KEYS.map(scoreKey => [scoreKey, 0])),
          feedbackSamples: []
        });
      }
      const group = grouped.get(key);
      group.evaluationCount += 1;
      const scores = evaluation.scores && typeof evaluation.scores === "object" ? evaluation.scores : {};
      EVALUATION_SCORE_KEYS.forEach(scoreKey => {
        const value = Number(scores[scoreKey] || 0);
        if (Number.isFinite(value)) {
          group.scoreTotals[scoreKey] += value;
        }
      });
      const feedback = String(evaluation.feedback_text || evaluation.feedback || "").trim();
      if (feedback && group.feedbackSamples.length < 3) {
        group.feedbackSamples.push(feedback.slice(0, 180));
      }
    });
  });

  return Array.from(grouped.values()).map(group => {
    const averageScores = Object.fromEntries(
      EVALUATION_SCORE_KEYS.map(scoreKey => [
        scoreKey,
        group.evaluationCount ? Number((group.scoreTotals[scoreKey] / group.evaluationCount).toFixed(1)) : 0
      ])
    );
    return { ...group, averageScores };
  });
}

function resolveRosterCourseOfferings(session, query, tableData, references) {
  const offerings = tableData.course_offerings || [];
  const teacher =
    session.role === "teacher" ? references.teachersByUserId.get(String(session.userId || "").trim()) || null : null;
  const queryCodes = extractCourseCodes(query);
  const normalizedQuery = String(query || "").toLowerCase();
  const accessible = offerings.filter(offering => {
    if (session.role !== "teacher" || !teacher) {
      return true;
    }
    const teacherIds = (offering.teacher_ids || offering.teacherIds || []).map(value => String(value || "").trim());
    return teacherIds.includes(String(teacher._id || "").trim());
  });
  const matched = accessible.filter(offering => {
    const course = references.courses.get(String(offering.course_id || "").trim()) || null;
    const courseCode = String((course && (course.course_code || course.code)) || "").toUpperCase();
    const courseName = String((course && course.name) || "").toLowerCase();
    const teacherNames = resolveTeacherNames(references, offering.teacher_ids || offering.teacherIds || []);
    return (
      queryCodes.includes(courseCode) ||
      (courseCode && normalizedQuery.includes(courseCode.toLowerCase())) ||
      (courseName && normalizedQuery.includes(courseName)) ||
      teacherNames.some(teacherName => normalizedQuery.includes(String(teacherName || "").toLowerCase()))
    );
  });
  return matched.length > 0 ? matched : accessible.slice(0, 5);
}

function buildCourseLabel(courseOrOffering, references) {
  const course =
    courseOrOffering && courseOrOffering.course_code
      ? courseOrOffering
      : courseOrOffering && courseOrOffering.course_id
        ? references.courses.get(String(courseOrOffering.course_id || "").trim()) || null
        : null;
  if (!course) {
    return String(
      (courseOrOffering &&
        (courseOrOffering.courseLabel || courseOrOffering.name || courseOrOffering.title || courseOrOffering._id)) ||
        ""
    ).trim();
  }
  return [course.course_code || course.code, course.name].filter(Boolean).join(" ").trim();
}

function buildStudentLabel(studentOrRow, references) {
  const student =
    studentOrRow &&
    (studentOrRow.student_no || studentOrRow.studentNo || studentOrRow.name || studentOrRow.display_name)
      ? studentOrRow
      : studentOrRow && studentOrRow._id
        ? references.students.get(String(studentOrRow._id).trim()) || studentOrRow
        : null;
  if (!student) {
    return String(
      (studentOrRow &&
        (studentOrRow.studentLabel ||
          studentOrRow.student_no ||
          studentOrRow.studentNo ||
          studentOrRow.name ||
          studentOrRow.username ||
          studentOrRow._id)) ||
        ""
    ).trim();
  }
  return [student.student_no || student.studentNo, student.name || student.display_name || student.username]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildTeacherLabel(teacherOrRow, references) {
  const teacher =
    teacherOrRow && (teacherOrRow.teacher_no || teacherOrRow.teacherNo || teacherOrRow.name)
      ? teacherOrRow
      : teacherOrRow && teacherOrRow._id
        ? references.teachers.get(String(teacherOrRow._id).trim()) || teacherOrRow
        : null;
  if (!teacher) {
    return String(
      (teacherOrRow &&
        (teacherOrRow.teacherLabel ||
          teacherOrRow.teacher_no ||
          teacherOrRow.teacherNo ||
          teacherOrRow.name ||
          teacherOrRow._id)) ||
        ""
    ).trim();
  }
  return [teacher.teacher_no || teacher.teacherNo, teacher.name].filter(Boolean).join(" ").trim();
}

function resolveTeacherNames(references, teacherIds) {
  return (Array.isArray(teacherIds) ? teacherIds : [])
    .map(teacherId => resolveTeacherName(references, teacherId))
    .filter(Boolean);
}

function resolveTeacherName(references, teacherId) {
  const teacher = references.teachers.get(String(teacherId || "").trim()) || null;
  return teacher ? String(teacher.name || teacher.teacher_no || teacher.teacherNo || teacher._id || "").trim() : "";
}

function resolveEvaluationTeacherNames(evaluation, offering, references) {
  return resolveEvaluationTeacherIds(evaluation, offering)
    .map(teacherId => resolveTeacherName(references, teacherId))
    .filter(Boolean);
}

function resolveEvaluationTeacherIds(evaluation, offering) {
  const explicit = Array.isArray(evaluation.teacher_ids || evaluation.teacherIds)
    ? evaluation.teacher_ids || evaluation.teacherIds
    : [];
  if (explicit.length > 0) {
    return explicit.map(value => String(value || "").trim()).filter(Boolean);
  }
  const fallback = Array.isArray(offering && (offering.teacher_ids || offering.teacherIds))
    ? offering.teacher_ids || offering.teacherIds
    : [];
  return fallback.map(value => String(value || "").trim()).filter(Boolean);
}

function resolveDepartmentName(references, departmentId) {
  const department = references.departments.get(String(departmentId || "").trim()) || null;
  return department ? String(department.name || department.code || department._id || "").trim() : "";
}

function resolveMajorName(references, majorId) {
  const major = references.majors.get(String(majorId || "").trim()) || null;
  return major ? String(major.name || major.code || major._id || "").trim() : "";
}

function resolveAdminClassName(references, classId) {
  const adminClass = references.adminClasses.get(String(classId || "").trim()) || null;
  return adminClass ? String(adminClass.name || adminClass.code || adminClass._id || "").trim() : "";
}

function resolveSemesterName(references, semesterId) {
  const semester = references.semesters.get(String(semesterId || "").trim()) || null;
  return semester ? String(semester.name || semester.code || semester._id || "").trim() : "";
}

function resolveClassroomLabel(references, classroomId) {
  const classroom = references.classrooms.get(String(classroomId || "").trim()) || null;
  if (!classroom) {
    return String(classroomId || "").trim();
  }
  return (
    [classroom.name || classroom.building, classroom.room_no || classroom.roomNo].filter(Boolean).join(" ").trim() ||
    String(classroomId || "").trim()
  );
}

function mapRowsById(rows) {
  const map = new Map();
  (rows || []).forEach(row => {
    if (row && row._id) {
      map.set(String(row._id).trim(), row);
    }
  });
  return map;
}

function mapRowsByUserId(rows, fields = ["user_id", "userId"]) {
  const map = new Map();
  (rows || []).forEach(row => {
    fields.forEach(field => {
      const value = String((row && row[field]) || "").trim();
      if (value) {
        map.set(value, row);
      }
    });
  });
  return map;
}

function summarizeKnowledgeValue(value, depth) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (depth > 2) return "[object]";
  if (Array.isArray(value)) {
    return value
      .slice(0, 8)
      .map(item => summarizeKnowledgeValue(item, depth + 1))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(
        ([key, item]) =>
          !isSensitiveKnowledgeField(key) && item !== undefined && item !== null && String(item).trim() !== ""
      )
      .map(([key, item]) => `${key}: ${summarizeKnowledgeValue(item, depth + 1)}`)
      .filter(Boolean)
      .join("; ");
  }
  return String(value);
}

function isSensitiveKnowledgeField(fieldName) {
  return /(password|secret|token|salt|hash|credential|api[_-]?key|client[_-]?key|provider_uid|vector_id|authorization)/i.test(
    String(fieldName || "")
  );
}

function inferKnowledgeCategory(collectionName) {
  if (
    collectionName === "knowledge_base" ||
    collectionName === "knowledge_documents" ||
    collectionName === "knowledge_chunks"
  ) {
    return "common";
  }
  if (/(course|student|teacher|attendance|leave|evaluation|grade|recommendation|alert)/.test(collectionName)) {
    return "course";
  }
  return "common";
}

function formatAdminStudentRosterAnswer(students) {
  const lines = students.slice(0, 100).map(formatStudentPromptLine);
  const suffix = students.length > 100 ? "\n..." : "";
  return `\u5b66\u751f\u540d\u5355\uff1a\n${lines.join("\n")}${suffix}`;
}

function formatStudentPromptLine(student) {
  const title = [student.studentNo, student.name].filter(Boolean).join(" ");
  const details = [
    student.major ? `Major: ${student.major}` : "",
    student.adminClass ? `Class: ${student.adminClass}` : "",
    student.enrollmentYear ? `Enrollment: ${student.enrollmentYear}` : "",
    student.status ? `Status: ${student.status}` : ""
  ]
    .filter(Boolean)
    .join(", ");
  return `- ${title || student.userId}${details ? ` (${details})` : ""}`;
}

async function readStudentAttendance(userId) {
  try {
    const students = await scanCollection("students", 50);
    const student = students.find(s => s.user_id === userId);
    if (!student) return [];
    const records = await scanCollection("attendance_records", 50);
    const mine = records.filter(r => r.student_id === student._id).slice(-20);
    const offerings = await scanCollection("course_offerings", 50);
    const courses = await scanCollection("courses", 50);
    return mine.map(r => {
      const o = getById(offerings, r.course_offering_id);
      const c = o ? getById(courses, o.course_id) : null;
      return {
        date: formatDate(r.attendance_date),
        courseName: c ? `${c.course_code || ""} ${c.name || ""}`.trim() : r.course_offering_id || "",
        status: r.status
      };
    });
  } catch (_) {
    return [];
  }
}

async function readStudentLeaves(userId) {
  try {
    const students = await scanCollection("students", 50);
    const student = students.find(s => s.user_id === userId);
    if (!student) return [];
    const leaves = await scanCollection("leave_requests", 50);
    const mine = leaves.filter(l => l.student_id === student._id).slice(-20);
    const offerings = await scanCollection("course_offerings", 50);
    const courses = await scanCollection("courses", 50);
    return mine.map(l => {
      const o = getById(offerings, l.course_offering_id);
      const c = o ? getById(courses, o.course_id) : null;
      return {
        date: formatDate(l.leave_date),
        courseName: c ? `${c.course_code || ""} ${c.name || ""}`.trim() : l.course_offering_id || "",
        status: l.status,
        type: l.reason_type
      };
    });
  } catch (_) {
    return [];
  }
}

async function buildGradeSummary(userId) {
  try {
    const students = await scanCollection("students", 50);
    const student = students.find(s => s.user_id === userId);
    if (!student) return "";
    const grades = await scanCollection("grades", 100);
    const mine = grades.filter(g => g.student_id === student._id);
    if (!mine.length) return "No grades on record.";
    const totalWeighted = mine.reduce((sum, r) => sum + (Number(r.grade_point) || 0) * (Number(r.credit) || 0), 0);
    const totalCredits = mine.reduce((sum, r) => sum + (Number(r.credit) || 0), 0);
    const gpa = totalCredits ? totalWeighted / totalCredits : 0;
    return `GPA: ${gpa.toFixed(2)}, Total Credits: ${totalCredits}`;
  } catch (_) {
    return "";
  }
}

async function buildGraduationProgress(userId) {
  try {
    const students = await scanCollection("students", 50);
    const student = students.find(s => s.user_id === userId);
    if (!student || !student.training_plan_id) return "";
    const reqs = await scanCollection("plan_requirements", 30);
    const myReqs = reqs.filter(r => r.plan_id === student.training_plan_id);
    if (!myReqs.length) return "";
    const grades = await scanCollection("grades", 100);
    const myGrades = grades.filter(g => g.student_id === student._id);
    const earned = myGrades.reduce((sum, g) => sum + (Number(g.credit) || 0), 0);
    const required = myReqs.reduce((sum, r) => sum + (Number(r.required_credits) || 0), 0);
    const cats = myReqs.map(r => `${r.category || r.name}: ${r.required_credits} credits`).join(", ");
    return `${earned}/${required} credits. Requirements: ${cats}`;
  } catch (_) {
    return "";
  }
}

async function readTeacherProfile(userId) {
  try {
    const teachers = await scanCollection("teachers", 50);
    const t = teachers.find(te => te.user_id === userId);
    if (!t) return "";
    const depts = await scanCollection("departments", 30);
    const dept = depts.find(d => d._id === t.department_id);
    let profile = `Name: ${t.name}, Title: ${t.title || ""}`;
    if (dept) profile += `, Department: ${dept.name}`;
    if (t.research_fields && t.research_fields.length) profile += `, Fields: ${t.research_fields.join(", ")}`;
    return { profile, teacherId: t._id };
  } catch (_) {
    return "";
  }
}

async function readTeacherAtRiskStudents(teacherId) {
  try {
    const offerings = await scanCollection("course_offerings", 50);
    const myOfferings = offerings.filter(o => (o.teacher_ids || []).includes(teacherId));
    const offeringIds = myOfferings.map(o => o._id);
    const records = await scanCollection("attendance_records", 100);
    const absent = records.filter(r => offeringIds.includes(r.course_offering_id) && r.status === "absent");
    const students = await scanCollection("students", 50);
    const counts = {};
    absent.forEach(r => {
      counts[r.student_id] = (counts[r.student_id] || 0) + 1;
    });
    return Object.entries(counts).map(([sid, c]) => {
      const s = getById(students, sid);
      return { student: s ? s.name || s.student_no : sid, absences: c };
    });
  } catch (_) {
    return [];
  }
}

async function readTeacherEvaluationSummaries(teacherId) {
  try {
    const offerings = await scanCollection("course_offerings", 50);
    const myOfferings = offerings.filter(o => (o.teacher_ids || []).includes(teacherId));
    const offeringIds = myOfferings.map(o => o._id);
    const evals = await scanCollection("course_evaluations", 100);
    const mine = evals.filter(e => offeringIds.includes(e.course_offering_id));
    const courses = await scanCollection("courses", 50);
    const groups = {};
    mine.forEach(e => {
      const key = e.course_offering_id;
      if (!groups[key]) groups[key] = { total: 0, count: 0, diffTotal: 0 };
      const scores = e.scores || {};
      const dims = Object.values(scores).filter(v => typeof v === "number");
      groups[key].total += dims.reduce((s, v) => s + v, 0);
      groups[key].count += dims.length;
      groups[key].diffTotal += Number(scores.difficulty || 0);
    });
    return Object.entries(groups).map(([oid, g]) => {
      const o = getById(myOfferings, oid);
      const c = o ? getById(courses, o.course_id) : null;
      return {
        courseName: c ? `${c.course_code || ""} ${c.name || ""}`.trim() : oid,
        avg: g.count ? (g.total / g.count).toFixed(1) : "0",
        count: Math.round(g.count / 6),
        diffAvg: g.count ? (g.diffTotal / Math.max(1, g.count / 6)).toFixed(1) : "0"
      };
    });
  } catch (_) {
    return [];
  }
}

async function readAllEvaluationSummaries() {
  try {
    const evals = await scanCollection("course_evaluations", 200);
    const offerings = await scanCollection("course_offerings", 50);
    const courses = await scanCollection("courses", 50);
    const groups = {};
    evals.forEach(e => {
      const key = e.course_offering_id;
      if (!groups[key]) groups[key] = { total: 0, count: 0 };
      const scores = e.scores || {};
      Object.values(scores)
        .filter(v => typeof v === "number")
        .forEach(v => {
          groups[key].total += v;
          groups[key].count++;
        });
    });
    return Object.entries(groups).map(([oid, g]) => {
      const o = getById(offerings, oid);
      const c = o ? getById(courses, o.course_id) : null;
      return {
        courseName: c ? `${c.course_code || ""} ${c.name || ""}`.trim() : oid,
        avg: g.count ? (g.total / g.count).toFixed(1) : "0",
        count: Math.round(g.count / 6),
        diffAvg: "N/A"
      };
    });
  } catch (_) {
    return [];
  }
}

function buildQueryKeywords(query) {
  const cleaned = query
    .toLowerCase()
    .replace(/[^一-龥a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned ? cleaned.split(" ") : [];
  return Array.from(new Set(words.flatMap(word => [word, singularize(word)]).filter(Boolean)));
}

function singularize(value) {
  return String(value || "").replace(/s$/i, "");
}

async function writeAudit(action, session, data) {
  try {
    await db.collection("audit_logs").add({
      action,
      actor_user_id: session.userId,
      target_collection: "knowledge_base",
      after: data,
      created_at: Date.now()
    });
  } catch (error) {
    console.warn("[ask-assistant] audit write skipped.", error);
  }
}
