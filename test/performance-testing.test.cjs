"use strict";

const assert = require("node:assert/strict");
const { before, test } = require("node:test");
const {
  createLargeDashboardSeed,
  createMockDb,
  loadCloudFunction,
  loadFrontendApiModule,
  measurePerformance,
  resetPerformanceMetrics
} = require("./test-utils.cjs");

before(() => {
  resetPerformanceMetrics();
});

test("[Performance] admin dashboard aggregation completes within the local budget", async () => {
  const db = createMockDb(createLargeDashboardSeed(160, 8));
  const dashboard = loadCloudFunction("get-dashboard-data", db);

  const { result, durationMs } = await measurePerformance(
    "Admin dashboard aggregation",
    1200,
    () => dashboard({ session: { role: "admin", userId: "user_admin_001" } }),
    "160 students, 8 offerings, 5120 attendance records"
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.systemStats.totalStudents, 160);
  assert.ok(durationMs <= 1200, `Expected <= 1200 ms, got ${durationMs.toFixed(2)} ms`);
});

test("[Performance] teacher dashboard role filtering completes within the local budget", async () => {
  const db = createMockDb(createLargeDashboardSeed(120, 6));
  const dashboard = loadCloudFunction("get-dashboard-data", db);

  const { result, durationMs } = await measurePerformance(
    "Teacher dashboard role filtering",
    900,
    () => dashboard({ session: { role: "teacher", userId: "user_t_001" } }),
    "120 students, 6 offerings, teacher-scoped data"
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.courses.length, 6);
  assert.ok(durationMs <= 900, `Expected <= 900 ms, got ${durationMs.toFixed(2)} ms`);
});

test("[Performance] frontend fallback dashboard cache responds within the local budget", async () => {
  const api = loadFrontendApiModule();
  const session = { role: "admin", userId: "user_admin_001", displayName: "Academic Admin" };

  const first = await measurePerformance(
    "Frontend fallback dashboard first read",
    250,
    () => api.callAiemsFunction("get-dashboard-data", { session, forceRefresh: true }),
    "Local fallback without uniCloud"
  );
  const second = await measurePerformance(
    "Frontend fallback dashboard cached read",
    80,
    () => api.callAiemsFunction("get-dashboard-data", { session }),
    "Local fallback response cache"
  );

  assert.equal(first.result.ok, true);
  assert.equal(second.result.ok, true);
  assert.ok(first.durationMs <= 250, `Expected <= 250 ms, got ${first.durationMs.toFixed(2)} ms`);
  assert.ok(second.durationMs <= 80, `Expected <= 80 ms, got ${second.durationMs.toFixed(2)} ms`);
});
