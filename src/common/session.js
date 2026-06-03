const SESSION_KEY = "ai_ems_session";
const SESSION_BACKUP_KEY = "ai_ems_session_backup";
const VALID_ROLES = ["student", "teacher", "admin"];

export function setSession(user) {
  const session = normalizeSession(user);
  if (!session) return null;
  persistSession(session);
  return session;
}

export function getSession() {
  const session = readStoredSession();
  if (!session) return null;
  persistSession(session);
  return session;
}

export function clearSession() {
  if (hasBrowserTabStorage()) {
    removeBrowserTabStorage(SESSION_KEY);
    removeBrowserTabStorage(SESSION_BACKUP_KEY);
    return;
  }
  removeUniStorage(SESSION_KEY);
  removeUniStorage(SESSION_BACKUP_KEY);
}

export function requireRole(allowedRoles) {
  const session = getSession();
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles].filter(Boolean);
  if (!session || !allowed.includes(session.role)) {
    uni.reLaunch({ url: "/pages/login/login" });
    return null;
  }
  return session;
}

export function dashboardUrl(role) {
  const normalizedRole = normalizeRole([role]);
  const routes = {
    student: "/pages/student/dashboard",
    teacher: "/pages/teacher/dashboard",
    admin: "/pages/admin/dashboard"
  };
  return routes[normalizedRole] || "/pages/login/login";
}

function readStoredSession() {
  const candidates = hasBrowserTabStorage()
    ? [readBrowserTabStorage(SESSION_KEY), readBrowserTabStorage(SESSION_BACKUP_KEY)]
    : [readUniStorage(SESSION_KEY), readUniStorage(SESSION_BACKUP_KEY)];
  for (const candidate of candidates) {
    const session = normalizeSession(candidate);
    if (session) return session;
  }
  return null;
}

function persistSession(session) {
  if (hasBrowserTabStorage()) {
    writeBrowserTabStorage(SESSION_KEY, session);
    writeBrowserTabStorage(SESSION_BACKUP_KEY, session);
    return;
  }
  writeUniStorage(SESSION_KEY, session);
  writeUniStorage(SESSION_BACKUP_KEY, session);
}

function normalizeSession(raw) {
  const parsed = parseSession(raw);
  if (!parsed || typeof parsed !== "object") return null;

  const role = normalizeRole([
    parsed.role,
    parsed.primaryRole,
    parsed.roleCode,
    parsed.userRole,
    ...(Array.isArray(parsed.roleCodes) ? parsed.roleCodes : []),
    ...(Array.isArray(parsed.roles)
      ? parsed.roles.map(item => (item && typeof item === "object" ? item.code || item.role || item.name : item))
      : [])
  ]);
  const userId = String(parsed.userId || parsed.user_id || parsed.uid || parsed._id || parsed.id || "").trim();

  if (!userId || !role) return null;

  return {
    ...parsed,
    userId,
    role,
    username: String(parsed.username || parsed.userName || parsed.account || "").trim(),
    displayName: String(parsed.displayName || parsed.display_name || parsed.name || parsed.username || "").trim(),
    persistedAt: Number(parsed.persistedAt || parsed.loginAt || parsed.login_at || 0) || Date.now()
  };
}

function parseSession(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }
  return raw;
}

function normalizeRole(candidates) {
  const values = (Array.isArray(candidates) ? candidates : [candidates])
    .map(value =>
      String(value || "")
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);

  const mapped = values.map(value => {
    if (value === "academic_staff") return "admin";
    if (value === "counselor") return "teacher";
    return value;
  });

  return VALID_ROLES.find(role => mapped.includes(role)) || "";
}

function readUniStorage(key) {
  try {
    return typeof uni !== "undefined" ? uni.getStorageSync(key) : null;
  } catch (error) {
    return null;
  }
}

function writeUniStorage(key, value) {
  try {
    if (typeof uni !== "undefined") {
      uni.setStorageSync(key, value);
    }
  } catch (error) {
    // Best-effort storage write; unsupported runtimes should not block navigation.
  }
}

function removeUniStorage(key) {
  try {
    if (typeof uni !== "undefined") {
      uni.removeStorageSync(key);
    }
  } catch (error) {
    // Best-effort storage cleanup; unsupported runtimes should not block logout.
  }
}

function hasBrowserTabStorage() {
  try {
    return typeof sessionStorage !== "undefined";
  } catch (error) {
    return false;
  }
}

function readBrowserTabStorage(key) {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage.getItem(key) : null;
  } catch (error) {
    return null;
  }
}

function writeBrowserTabStorage(key, value) {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    // Best-effort tab storage write; unsupported runtimes should not block navigation.
  }
}

function removeBrowserTabStorage(key) {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(key);
    }
  } catch (error) {
    // Best-effort tab storage cleanup; unsupported runtimes should not block logout.
  }
}
