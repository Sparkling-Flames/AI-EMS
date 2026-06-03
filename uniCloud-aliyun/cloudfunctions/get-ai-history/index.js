"use strict";

const db = uniCloud.database();
const HISTORY_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

exports.main = async (event = {}) => {
  const session = normalizeSession(event.session || {});
  if (!session.userId || !["student", "teacher", "admin"].includes(session.role)) {
    return { ok: false, message: "Login is required." };
  }

  await purgeExpiredAiHistory(Date.now());

  const conversations = await readUserConversations(session);
  const requestedId = String(event.conversationId || "").trim();
  const activeConversation = conversations.find(item => item._id === requestedId) || conversations[0] || null;
  const messages = activeConversation ? await readMessages(activeConversation._id, session) : [];

  return {
    ok: true,
    data: {
      userId: session.userId,
      role: session.role,
      conversations: conversations.map(toConversationView),
      activeConversationId: activeConversation ? activeConversation._id : "",
      messages: messages.map(toMessageView),
      retentionDays: 60
    }
  };
};

async function readUserConversations(session) {
  try {
    const rows = [];
    for (const userId of session.userIds) {
      rows.push(...(await readRows("ai_conversations", { user_id: userId }, 50)));
      rows.push(...(await readRows("ai_conversations", { userId }, 50)));
    }
    if (!rows.length) {
      rows.push(...(await readRows("ai_conversations", {}, 200)));
    }
    return uniqueById(rows)
      .filter(item => conversationBelongsToSession(item, session))
      .sort((a, b) => Number(b.updated_at || b.updatedAt || 0) - Number(a.updated_at || a.updatedAt || 0))
      .slice(0, 20);
  } catch (error) {
    console.warn("[get-ai-history] conversation read skipped.", error);
    return [];
  }
}

async function readMessages(conversationId, session) {
  try {
    const rows = [
      ...(await readRows("ai_messages", { conversation_id: conversationId }, 100)),
      ...(await readRows("ai_messages", { conversationId }, 100))
    ];
    return uniqueById(rows)
      .filter(item => messageBelongsToSession(item, session))
      .sort((a, b) => Number(a.created_at || a.createdAt || 0) - Number(b.created_at || b.createdAt || 0));
  } catch (error) {
    console.warn("[get-ai-history] message read skipped.", error);
    return [];
  }
}

async function readRows(collection, query, limit) {
  try {
    let request = db.collection(collection);
    if (query && Object.keys(query).length) {
      request = request.where(query);
    }
    const result = await request.limit(limit || 100).get();
    return result.data || [];
  } catch (_) {
    return [];
  }
}

function toConversationView(item) {
  return {
    _id: item._id,
    userId: item.user_id || item.userId || "",
    role: item.role || "",
    title: item.title || "AI Assistant Conversation",
    scenario: item.scenario || "other",
    contextSummary: item.context_summary || item.contextSummary || "",
    messageCount: Number(item.message_count || item.messageCount || 0),
    status: item.status || "active",
    createdAt: Number(item.created_at || item.createdAt || 0),
    updatedAt: Number(item.updated_at || item.updatedAt || 0)
  };
}

function toMessageView(item) {
  return {
    _id: item._id,
    conversationId: item.conversation_id || item.conversationId || "",
    userId: item.user_id || item.userId || "",
    ownerRole: item.role_owner || item.ownerRole || "",
    role: item.role || "",
    content: item.content || "",
    model: item.model || "",
    citations: Array.isArray(item.citations) ? item.citations : [],
    fallbackUsed: item.fallback_used === true,
    latencyMs: Number(item.latency_ms || 0),
    createdAt: Number(item.created_at || item.createdAt || 0)
  };
}

async function purgeExpiredAiHistory(now) {
  if (Math.random() >= 0.02) {
    return;
  }
  const cutoff = now - HISTORY_RETENTION_MS;
  await removeOldRows("ai_messages", "created_at", cutoff);
  await removeOldRows("ai_conversations", "updated_at", cutoff);
}

function normalizeSession(session) {
  const rawUserId = String(session.userId || session.uid || session.user_id || "").trim();
  const userId = normalizeCloudUserId(rawUserId);
  return {
    ...session,
    userId,
    rawUserId,
    userIds: buildUserIdAliases(rawUserId || userId),
    role: String(session.role || "").trim()
  };
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

function conversationBelongsToSession(item, session) {
  const userId = String(item.user_id || item.userId || "").trim();
  const role = String(item.role || item.role_owner || item.ownerRole || "").trim();
  return session.userIds.includes(userId) && (!role || role === session.role);
}

function messageBelongsToSession(item, session) {
  const userId = String(item.user_id || item.userId || "").trim();
  const role = String(item.role_owner || item.ownerRole || "").trim();
  return (!userId || session.userIds.includes(userId)) && (!role || role === session.role);
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
    console.warn(`[get-ai-history] ${collection} retention cleanup skipped.`, error);
  }
}
