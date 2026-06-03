<template>
  <view class="page">
    <PageHeader title="Admin Dashboard" :display-name="session.displayName" :username="session.username">
      <button class="secondary-btn refresh-btn" :loading="loading" @click="refresh">Refresh</button>
    </PageHeader>

    <NavTabs :role="session.role" current="dashboard" />

    <view class="section">
      <view class="section-head">
        <view>
          <text class="section-title">System Overview</text>
          <text class="muted">Role-based academic operations</text>
        </view>
        <text class="muted">{{ lastUpdatedText }}</text>
      </view>
      <view class="row">
        <StatCard :value="sysStats.totalStudents" label="Students" />
        <StatCard :value="sysStats.totalTeachers" label="Teachers" />
        <StatCard :value="sysStats.activeCourses" label="Courses" />
      </view>
    </view>

    <view class="section">
      <text class="section-title">System Metrics</text>
      <view class="metric-grid">
        <view v-for="m in metricList" :key="m.label" class="metric-card">
          <text class="metric-value">{{ m.value }}</text>
          <text class="metric-label">{{ m.label }}</text>
        </view>
      </view>
    </view>

    <view class="section">
      <text class="section-title">Profile Change Reviews</text>
      <template v-if="!data.profileChangeRequests.length">
        <text class="muted">No pending profile changes.</text>
      </template>
      <view v-for="item in data.profileChangeRequests" :key="item._id" class="profile-review-card">
        <view class="review-card-head">
          <view class="review-card-title">
            <text class="value">{{ profileRequestTitle(item) }}</text>
            <text class="muted">{{ formatDate(item.createdAt) || "Date unavailable" }}</text>
          </view>
          <StatusBadge :status="item.status" />
        </view>
        <view class="change-grid">
          <view v-for="change in profileChangeItems(item)" :key="change.key" class="change-cell">
            <text class="label">{{ change.label }}</text>
            <view class="change-values">
              <text class="old-value">{{ change.oldValue || "Empty" }}</text>
              <text class="change-arrow">to</text>
              <text class="new-value">{{ change.newValue || "Empty" }}</text>
            </view>
          </view>
        </view>
        <view class="comment-control">
          <view
            class="comment-toggle"
            :class="{ active: isProfileCommentEnabled(item) }"
            @tap="toggleProfileComment(item)"
          >
            <text>{{ isProfileCommentEnabled(item) ? "With comment" : "No comment" }}</text>
          </view>
          <textarea
            v-if="isProfileCommentEnabled(item)"
            :value="profileReviewCommentFor(item)"
            class="review-textarea"
            placeholder="Optional note for this profile request."
            @input="changeProfileReviewComment(item, $event)"
          />
        </view>
        <view class="inline-actions">
          <button class="primary-btn compact-btn" @click="reviewProfile(item, 'approved')">Approve</button>
          <button class="danger-btn compact-btn" @click="reviewProfile(item, 'rejected')">Reject</button>
        </view>
      </view>
    </view>

    <view class="section">
      <text class="section-title">Course Quality Monitor</text>
      <template v-if="!data.evaluationSummary.length">
        <text class="muted">No evaluation summary yet.</text>
      </template>
      <DataCard
        v-for="item in data.evaluationSummary"
        :key="item.courseOfferingId || item.courseId"
        :title="item.courseName"
        :subtitle="'Average ' + item.average + ' / 5 - ' + item.count + ' response(s)'"
      >
        <StatusBadge :status="item.average < 3 ? 'high' : 'present'" />
      </DataCard>
    </view>

    <view class="section">
      <text class="section-title">Quick Actions</text>
      <view class="quick-actions">
        <button class="primary-btn quick-action-btn" @click="go('/pages/admin/management')">Management</button>
        <button class="primary-btn quick-action-btn" @click="go('/pages/leave/leave')">Leave Reviews</button>
        <button class="primary-btn quick-action-btn" @click="go('/pages/evaluation/evaluation')">Evaluations</button>
        <button class="primary-btn quick-action-btn" @click="go('/pages/materials/materials')">Materials</button>
        <button class="primary-btn quick-action-btn" @click="go('/pages/assistant/assistant')">Assistant</button>
      </view>
    </view>
  </view>
</template>

<script>
import PageHeader from "../../components/PageHeader.vue";
import NavTabs from "../../components/NavTabs.vue";
import DataCard from "../../components/DataCard.vue";
import StatCard from "../../components/StatCard.vue";
import StatusBadge from "../../components/StatusBadge.vue";
import { callAiemsFunction } from "../../common/api.js";
import { getSession, requireRole } from "../../common/session.js";

export default {
  components: { PageHeader, NavTabs, DataCard, StatCard, StatusBadge },
  data() {
    return {
      session: {},
      loading: false,
      lastUpdatedAt: 0,
      profileReviewDrafts: {},
      leaveReviewDrafts: {},
      deletingLeaveId: "",
      leaveFilterCourseIndex: 0,
      leaveFilterTeacherIndex: 0,
      leaveFilterStartDate: "",
      leaveFilterEndDate: "",
      reasonTypes: [
        { value: "sick", label: "Sick Leave" },
        { value: "personal", label: "Personal Leave" },
        { value: "official", label: "Official Duty" },
        { value: "other", label: "Other" }
      ],
      sysStats: {
        totalStudents: 0,
        totalTeachers: 0,
        activeCourses: 0
      },
      data: {
        leaveRequests: [],
        profileChangeRequests: [],
        evaluationSummary: [],
        atRiskStudents: [],
        metrics: { courses: 0, pendingLeaves: 0, evaluations: 0, profileChanges: 0, riskStudents: 0 }
      }
    };
  },
  computed: {
    metricList() {
      return [
        { label: "Courses", value: this.data.metrics.courses },
        { label: "Pending Leaves", value: this.data.metrics.pendingLeaves },
        { label: "Evaluations Submitted", value: this.data.metrics.evaluations },
        { label: "Profile Reviews", value: this.data.metrics.profileChanges },
        { label: "At-Risk Students", value: this.data.metrics.riskStudents }
      ];
    },
    lastUpdatedText() {
      return this.lastUpdatedAt ? "Updated " + this.formatTime(this.lastUpdatedAt) : "";
    },
    leaveFilterCourses() {
      const seen = new Set();
      const courses = [{ value: "", label: "All Courses" }];
      const requests = this.data.leaveRequests || [];
      requests.forEach(item => {
        const value = this.leaveCourseFilterValue(item);
        if (!value || seen.has(value)) return;
        seen.add(value);
        courses.push({ value, label: item.courseName || value });
      });
      return courses;
    },
    leaveFilterCourseLabels() {
      return this.leaveFilterCourses.map(item => item.label);
    },
    selectedLeaveFilterCourseLabel() {
      return this.leaveFilterCourseLabels[this.leaveFilterCourseIndex] || "All Courses";
    },
    leaveFilterTeachers() {
      const seen = new Set();
      const teachers = [{ value: "", label: "All Teachers" }];
      const requests = this.data.leaveRequests || [];
      requests.forEach(item => {
        this.leaveTeacherOptions(item).forEach(option => {
          if (!option.value || seen.has(option.value)) return;
          seen.add(option.value);
          teachers.push(option);
        });
      });
      return teachers;
    },
    leaveFilterTeacherLabels() {
      return this.leaveFilterTeachers.map(item => item.label);
    },
    selectedLeaveFilterTeacherLabel() {
      return this.leaveFilterTeacherLabels[this.leaveFilterTeacherIndex] || "All Teachers";
    },
    filteredLeaveRequests() {
      return (this.data.leaveRequests || []).filter(item => this.matchesLeaveFilters(item));
    }
  },
  onShow() {
    const session = requireRole(["admin"]);
    if (!session) return;
    this.session = session;
    this.load(true);
  },
  methods: {
    async load(forceRefresh = false) {
      this.loading = true;
      const result = await callAiemsFunction("get-dashboard-data", {
        session: getSession(),
        forceRefresh
      });
      this.loading = false;
      if (result.ok) {
        this.data = {
          ...this.data,
          ...result.data,
          leaveRequests: result.data.leaveRequests || [],
          profileChangeRequests: result.data.profileChangeRequests || [],
          evaluationSummary: result.data.evaluationSummary || [],
          atRiskStudents: result.data.atRiskStudents || [],
          metrics: this.normalizeMetrics(result.data.metrics)
        };
        this.sysStats = result.data.systemStats || this.sysStats;
        this.lastUpdatedAt = Date.now();
        this.normalizeLeaveFilterSelection();
      }
    },
    refresh() {
      this.load(true);
    },
    normalizeMetrics(metrics = {}) {
      return {
        courses: Number(metrics.courses || 0),
        pendingLeaves: Number(metrics.pendingLeaves || 0),
        evaluations: Number(metrics.evaluations || 0),
        profileChanges: Number(metrics.profileChanges || 0),
        riskStudents: Number(metrics.riskStudents || 0)
      };
    },
    async reviewLeave(item, decision) {
      const draft = this.leaveReviewDraftFor(item);
      const result = await callAiemsFunction("review-leave", {
        session: getSession(),
        leaveId: item._id,
        decision,
        reviewComment: draft.enabled ? draft.comment.trim() : ""
      });
      this.afterReview(result, decision);
    },
    async reviewProfile(item, decision) {
      const draft = this.profileReviewDraftFor(item);
      const result = await callAiemsFunction("review-profile-change", {
        session: getSession(),
        requestId: item._id,
        decision,
        reviewComment: draft.enabled ? draft.comment.trim() : ""
      });
      this.afterReview(result, decision);
    },
    deleteLeave(item) {
      uni.showModal({
        title: "Delete leave request",
        content: "This will remove the request from admin, teacher, and student views.",
        confirmText: "Delete",
        success: async modal => {
          if (!modal.confirm) return;
          this.deletingLeaveId = item._id;
          const result = await callAiemsFunction("delete-leave", {
            session: getSession(),
            leaveId: item._id
          });
          this.deletingLeaveId = "";
          if (result.ok) {
            uni.showToast({ title: "Deleted", icon: "success" });
            this.load(true);
            return;
          }
          uni.showToast({ title: result.message || "Delete failed.", icon: "none" });
        }
      });
    },
    afterReview(result, decision) {
      if (result.ok) {
        uni.showToast({ title: decision === "approved" ? "Approved" : "Rejected", icon: "success" });
        this.load(true);
        return;
      }
      uni.showToast({ title: result.message || "Review failed.", icon: "none" });
    },
    profileRequestTitle(item) {
      return [item.requesterName || item.requester_user_id, item.targetType || item.target_type]
        .filter(Boolean)
        .join(" - ");
    },
    profileChangeItems(item) {
      const changes = item.changes || {};
      return Object.keys(changes).map(key => {
        const change = changes[key] || {};
        return {
          key,
          label: change.label || change.field || key,
          oldValue: String(change.oldValue || ""),
          newValue: String(change.newValue || "")
        };
      });
    },
    formatChangeRequest(item) {
      const changes = item.changes || {};
      return Object.keys(changes)
        .map(key => {
          const change = changes[key] || {};
          return (change.label || change.field || key) + ": " + change.oldValue + " -> " + change.newValue;
        })
        .join("; ");
    },
    changeLeaveFilterCourse(event) {
      this.leaveFilterCourseIndex = Number(event.detail.value);
    },
    changeLeaveFilterTeacher(event) {
      this.leaveFilterTeacherIndex = Number(event.detail.value);
    },
    changeLeaveFilterStartDate(event) {
      this.leaveFilterStartDate = event.detail.value;
    },
    changeLeaveFilterEndDate(event) {
      this.leaveFilterEndDate = event.detail.value;
    },
    resetLeaveFilters() {
      this.leaveFilterCourseIndex = 0;
      this.leaveFilterTeacherIndex = 0;
      this.leaveFilterStartDate = "";
      this.leaveFilterEndDate = "";
    },
    normalizeLeaveFilterSelection() {
      if (this.leaveFilterCourseIndex >= this.leaveFilterCourses.length) {
        this.leaveFilterCourseIndex = 0;
      }
      if (this.leaveFilterTeacherIndex >= this.leaveFilterTeachers.length) {
        this.leaveFilterTeacherIndex = 0;
      }
    },
    leaveCourseFilterValue(item) {
      return String((item && (item.courseOfferingId || item.courseId || item.courseName)) || "").trim();
    },
    leaveTeacherOptions(item) {
      const selectedName = String((item && (item.selectedTeacherName || item.selected_teacher_name)) || "").trim();
      const selectedId = String(
        (item &&
          (item.selectedTeacherId ||
            item.selected_teacher_id ||
            item.selectedTeacherUserId ||
            item.selected_teacher_user_id)) ||
          ""
      ).trim();
      if (selectedName) {
        return [{ value: selectedId || selectedName, label: selectedName }];
      }
      const ids = Array.isArray(item && item.teacherIds)
        ? item.teacherIds
        : Array.isArray(item && item.teacher_ids)
          ? item.teacher_ids
          : [];
      const userIds = Array.isArray(item && item.teacherUserIds)
        ? item.teacherUserIds
        : Array.isArray(item && item.teacher_user_ids)
          ? item.teacher_user_ids
          : [];
      const names = Array.isArray(item && item.teacherNames)
        ? item.teacherNames
        : Array.isArray(item && item.teacher_names)
          ? item.teacher_names
          : [];
      return names
        .map((name, index) => ({
          value: String(ids[index] || userIds[index] || name || "").trim(),
          label: String(name || ids[index] || userIds[index] || "").trim()
        }))
        .filter(option => option.value && option.label);
    },
    leaveTeacherFilterValues(item) {
      const values = new Set();
      this.leaveTeacherOptions(item).forEach(option => {
        values.add(option.value);
        values.add(option.label);
      });
      const directValues = [
        item && item.selectedTeacherId,
        item && item.selected_teacher_id,
        item && item.selectedTeacherUserId,
        item && item.selected_teacher_user_id,
        item && item.selectedTeacherName,
        item && item.selected_teacher_name
      ];
      directValues.forEach(value => {
        const normalized = String(value || "").trim();
        if (normalized) values.add(normalized);
      });
      return values;
    },
    matchesLeaveFilters(item) {
      const selectedCourse = this.leaveFilterCourses[this.leaveFilterCourseIndex] || this.leaveFilterCourses[0];
      if (selectedCourse && selectedCourse.value && this.leaveCourseFilterValue(item) !== selectedCourse.value) {
        return false;
      }
      const selectedTeacher = this.leaveFilterTeachers[this.leaveFilterTeacherIndex] || this.leaveFilterTeachers[0];
      if (selectedTeacher && selectedTeacher.value && !this.leaveTeacherFilterValues(item).has(selectedTeacher.value)) {
        return false;
      }
      const leaveDate = String((item && item.date) || "").trim();
      if (this.leaveFilterStartDate && (!leaveDate || leaveDate < this.leaveFilterStartDate)) {
        return false;
      }
      if (this.leaveFilterEndDate && (!leaveDate || leaveDate > this.leaveFilterEndDate)) {
        return false;
      }
      return true;
    },
    leaveTitle(item) {
      return [item.studentName, item.courseName].filter(Boolean).join(" - ") || "Leave request";
    },
    leaveTeacherLabel(item) {
      return (
        this.leaveTeacherOptions(item)
          .map(option => option.label)
          .filter(Boolean)
          .join(", ") || "Unassigned"
      );
    },
    reasonTypeLabel(value) {
      const type = this.reasonTypes.find(item => item.value === value);
      return type ? type.label : value || "Other";
    },
    profileReviewDraftKey(item) {
      return String((item && item._id) || "");
    },
    profileReviewDraftFor(item) {
      const key = this.profileReviewDraftKey(item);
      return this.profileReviewDrafts[key] || { enabled: false, comment: "" };
    },
    isProfileCommentEnabled(item) {
      return this.profileReviewDraftFor(item).enabled;
    },
    profileReviewCommentFor(item) {
      return this.profileReviewDraftFor(item).comment;
    },
    toggleProfileComment(item) {
      const key = this.profileReviewDraftKey(item);
      const current = this.profileReviewDraftFor(item);
      this.profileReviewDrafts = {
        ...this.profileReviewDrafts,
        [key]: { ...current, enabled: !current.enabled }
      };
    },
    changeProfileReviewComment(item, event) {
      const key = this.profileReviewDraftKey(item);
      const current = this.profileReviewDraftFor(item);
      this.profileReviewDrafts = {
        ...this.profileReviewDrafts,
        [key]: { ...current, comment: event.detail.value }
      };
    },
    leaveReviewDraftKey(item) {
      return String((item && item._id) || "");
    },
    leaveReviewDraftFor(item) {
      const key = this.leaveReviewDraftKey(item);
      return this.leaveReviewDrafts[key] || { enabled: false, comment: "" };
    },
    isLeaveCommentEnabled(item) {
      return this.leaveReviewDraftFor(item).enabled;
    },
    leaveReviewCommentFor(item) {
      return this.leaveReviewDraftFor(item).comment;
    },
    toggleLeaveComment(item) {
      const key = this.leaveReviewDraftKey(item);
      const current = this.leaveReviewDraftFor(item);
      this.leaveReviewDrafts = {
        ...this.leaveReviewDrafts,
        [key]: { ...current, enabled: !current.enabled }
      };
    },
    changeLeaveReviewComment(item, event) {
      const key = this.leaveReviewDraftKey(item);
      const current = this.leaveReviewDraftFor(item);
      this.leaveReviewDrafts = {
        ...this.leaveReviewDrafts,
        [key]: { ...current, comment: event.detail.value }
      };
    },
    formatDate(value) {
      const timestamp = Number(value || 0);
      return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
    },
    formatTime(value) {
      const date = new Date(value);
      return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    },
    go(url) {
      uni.navigateTo({ url });
    }
  }
};
</script>

<style scoped>
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 14rpx;
}

.refresh-btn {
  min-width: 150rpx;
}

.field {
  margin-bottom: 18rpx;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14rpx;
}

.metric-card {
  min-height: 112rpx;
  padding: 18rpx;
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
  border-radius: 8rpx;
  box-sizing: border-box;
}

.metric-value {
  display: block;
  color: #0f172a;
  font-size: 34rpx;
  font-weight: 700;
  line-height: 1.2;
}

.metric-label {
  display: block;
  margin-top: 8rpx;
  color: #64748b;
  font-size: 24rpx;
  line-height: 1.35;
}

.inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-top: 14rpx;
}

.compact-btn {
  min-width: 126rpx;
  font-size: 24rpx;
}

.profile-review-card,
.leave-admin-card {
  margin-top: 16rpx;
  padding: 18rpx;
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 8rpx;
}

.review-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 14rpx;
}

.review-card-title {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}

.change-grid,
.leave-info-grid {
  display: grid;
  gap: 12rpx;
}

.change-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.leave-info-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.change-cell,
.info-cell,
.note-box {
  padding: 14rpx;
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
  border-radius: 8rpx;
}

.change-values {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-top: 8rpx;
}

.old-value,
.new-value {
  color: #0f172a;
  font-size: 26rpx;
  line-height: 1.4;
}

.old-value {
  color: #64748b;
}

.new-value {
  font-weight: 600;
}

.change-arrow {
  color: #94a3b8;
  font-size: 22rpx;
}

.leave-filter-panel {
  display: grid;
  grid-template-columns: minmax(210rpx, 1.3fr) minmax(190rpx, 1fr) repeat(2, minmax(170rpx, 0.9fr)) auto;
  align-items: end;
  gap: 14rpx;
  margin: 16rpx 0 8rpx;
}

.leave-filter-panel .field {
  margin-bottom: 0;
}

.leave-filter-reset-btn {
  min-width: 128rpx;
  margin: 0 !important;
}

.picker-value {
  min-height: 44rpx;
  padding: 18rpx;
  background: #ffffff;
  border: 1rpx solid #cbd5e1;
  border-radius: 8rpx;
  color: #0f172a;
  font-size: 28rpx;
  line-height: 1.5;
}

.picker-shell {
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
}

.note-box {
  margin-top: 12rpx;
}

.note-text {
  display: block;
  margin-top: 6rpx;
  color: #0f172a;
  font-size: 26rpx;
  line-height: 1.5;
  white-space: pre-wrap;
}

.review-note {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.comment-control {
  margin-top: 12rpx;
}

.comment-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 64rpx;
  padding: 0 20rpx;
  border: 1rpx solid #cbd5e1;
  border-radius: 8rpx;
  background: #ffffff;
  color: #334155;
  font-size: 24rpx;
}

.comment-toggle.active {
  border-color: #2563eb;
  background: #dbeafe;
  color: #1d4ed8;
}

.review-textarea {
  width: 100%;
  min-height: 150rpx;
  margin-top: 12rpx;
  box-sizing: border-box;
}

.leave-actions {
  align-items: center;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  margin-top: 12px;
}

.quick-action-btn {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: auto !important;
  min-width: 112px !important;
  max-width: none;
  min-height: 40px !important;
  height: auto !important;
  margin: 0 !important;
  padding: 0 14px !important;
  line-height: 1.25;
  white-space: nowrap;
  overflow: visible;
  box-sizing: border-box;
}

.quick-action-btn::after {
  border: 0;
}

@media (max-width: 700px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .change-grid,
  .leave-info-grid,
  .leave-filter-panel {
    grid-template-columns: 1fr;
  }

  .quick-action-btn {
    min-width: calc(50% - 5px) !important;
    max-width: none;
  }
}
</style>
