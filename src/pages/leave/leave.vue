<template>
  <view class="page">
    <view class="section">
      <view class="row">
        <view>
          <text class="section-title">Leave Workflow</text>
          <text class="muted">{{ session.displayName }} - {{ session.role }}</text>
        </view>
        <view class="btn-row top-actions">
          <button class="secondary-btn" :loading="loading" @click="refresh">Refresh</button>
          <button class="secondary-btn" @click="backHome">Home</button>
        </view>
      </view>
    </view>

    <view v-if="session.role === 'student'" class="section">
      <text class="section-title">Submit Leave Request</text>

      <view class="field">
        <text class="label">Course</text>
        <picker :range="courseLabels" :value="courseIndex" @change="changeCourse">
          <view class="picker-value">{{ selectedCourseLabel }}</view>
        </picker>
      </view>

      <view class="field">
        <text class="label">Leave Type</text>
        <picker :range="reasonTypeLabels" :value="reasonTypeIndex" @change="changeReasonType">
          <view class="picker-value">{{ selectedReasonTypeLabel }}</view>
        </picker>
      </view>

      <view class="field">
        <text class="label">Date</text>
        <picker mode="date" :value="date" @change="changeDate">
          <view class="picker-value">{{ date }}</view>
        </picker>
      </view>

      <view class="field">
        <text class="label">Reason Detail</text>
        <textarea v-model="reasonDetail" placeholder="Explain the leave reason briefly." />
      </view>

      <button class="primary-btn full-btn" @click="submitLeave">Submit</button>
    </view>

    <view class="section">
      <text class="section-title">{{ leaveListTitle }}</text>

      <view class="filter-panel" :class="{ admin: session.role === 'admin' }">
        <view class="field">
          <text class="label">Course</text>
          <picker :range="leaveFilterCourseLabels" :value="leaveFilterCourseIndex" @change="changeLeaveFilterCourse">
            <view class="picker-value">{{ selectedLeaveFilterCourseLabel }}</view>
          </picker>
        </view>
        <view v-if="session.role === 'admin'" class="field">
          <text class="label">Teacher</text>
          <picker :range="leaveFilterTeacherLabels" :value="leaveFilterTeacherIndex" @change="changeLeaveFilterTeacher">
            <view class="picker-value">{{ selectedLeaveFilterTeacherLabel }}</view>
          </picker>
        </view>
        <view class="field">
          <text class="label">Start Date</text>
          <picker mode="date" :value="leaveFilterStartDate" @change="changeLeaveFilterStartDate">
            <view class="picker-value">{{ leaveFilterStartDate || "All dates" }}</view>
          </picker>
        </view>
        <view class="field">
          <text class="label">End Date</text>
          <picker mode="date" :value="leaveFilterEndDate" @change="changeLeaveFilterEndDate">
            <view class="picker-value">{{ leaveFilterEndDate || "All dates" }}</view>
          </picker>
        </view>
        <button class="secondary-btn filter-reset-btn" @click="resetLeaveFilters">Reset</button>
      </view>

      <view v-if="!leaveRequests.length" class="muted">No leave requests available.</view>
      <view v-else-if="!filteredLeaveRequests.length" class="muted">No leave requests match the selected filters.</view>

      <view v-for="item in filteredLeaveRequests" :key="item._id" class="leave-card">
        <view class="leave-card-head">
          <view class="leave-title">
            <text class="value">{{ leaveTitle(item) }}</text>
            <text class="muted">{{ item.studentNo || item.date }}</text>
          </view>
          <StatusBadge :status="item.status" />
        </view>

        <view class="leave-info-grid" :class="{ admin: session.role === 'admin' }">
          <view class="info-cell">
            <text class="label">Student</text>
            <text class="value">{{ item.studentName || session.displayName }}</text>
          </view>
          <view class="info-cell">
            <text class="label">Course</text>
            <text class="value">{{ item.courseName || "Course unavailable" }}</text>
          </view>
          <view class="info-cell">
            <text class="label">Leave Date</text>
            <text class="value">{{ item.date || "Not set" }}</text>
          </view>
          <view class="info-cell">
            <text class="label">Leave Type</text>
            <text class="value">{{ reasonTypeLabel(item.reasonType) || "Other" }}</text>
          </view>
          <view v-if="session.role === 'admin'" class="info-cell">
            <text class="label">Teacher</text>
            <text class="value">{{ leaveTeacherLabel(item) }}</text>
          </view>
        </view>

        <view class="note-box">
          <text class="label">Leave Reason</text>
          <text class="note-text">{{ item.reasonDetail || item.reason || "No reason provided." }}</text>
        </view>

        <view v-if="item.reviewComment && session.role === 'student'" class="comment-visibility">
          <view
            class="comment-toggle"
            :class="{ active: isReviewCommentVisible(item) }"
            @tap="toggleReviewCommentVisibility(item)"
          >
            <text>{{ isReviewCommentVisible(item) ? "Hide comment" : "Show comment" }}</text>
          </view>
          <view v-if="isReviewCommentVisible(item)" class="note-box review-note">
            <text class="label">Teacher Comment</text>
            <text class="note-text">{{ item.reviewComment }}</text>
          </view>
        </view>
        <view v-else-if="item.reviewComment" class="note-box review-note">
          <text class="label">Teacher Comment</text>
          <text class="note-text">{{ item.reviewComment }}</text>
        </view>

        <view v-if="session.role !== 'student' && item.status === 'pending'" class="btn-row">
          <view class="comment-control">
            <view class="comment-toggle" :class="{ active: isCommentEnabled(item) }" @tap="toggleReviewComment(item)">
              <text>{{ isCommentEnabled(item) ? "With comment" : "No comment" }}</text>
            </view>
            <textarea
              v-if="isCommentEnabled(item)"
              :value="reviewCommentFor(item)"
              class="review-textarea"
              placeholder="Optional note for this request."
              @input="changeReviewComment(item, $event)"
            />
          </view>
          <button class="primary-btn" @click="review(item, 'approved')">Approve</button>
          <button class="danger-btn" @click="review(item, 'rejected')">Reject</button>
        </view>

        <view v-if="session.role === 'student' && ['pending', 'approved'].includes(item.status)" class="btn-row">
          <button class="secondary-btn" @click="cancelLeave(item)">Cancel</button>
        </view>

        <view v-if="session.role === 'admin'" class="btn-row">
          <button class="secondary-btn" :loading="deletingLeaveId === item._id" @click="deleteLeave(item)">
            Delete
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { callAiemsFunction } from "../../common/api.js";
import { dashboardUrl, getSession, requireRole } from "../../common/session.js";
import StatusBadge from "../../components/StatusBadge.vue";

export default {
  components: { StatusBadge },
  data() {
    return {
      session: {},
      courses: [],
      leaveRequests: [],
      courseIndex: 0,
      reasonTypeIndex: 0,
      leaveFilterCourseIndex: 0,
      leaveFilterTeacherIndex: 0,
      leaveFilterStartDate: "",
      leaveFilterEndDate: "",
      date: new Date().toISOString().slice(0, 10),
      reasonDetail: "",
      reviewDrafts: {},
      reviewCommentVisibility: {},
      deletingLeaveId: "",
      loading: false,
      lastLoadedAt: 0,
      loadTtlMs: 30000,
      reasonTypes: [
        { value: "sick", label: "Sick Leave" },
        { value: "personal", label: "Personal Leave" },
        { value: "official", label: "Official Duty" },
        { value: "other", label: "Other" }
      ]
    };
  },
  computed: {
    courseLabels() {
      return this.courses.map(item => this.formatCourseLabel(item));
    },
    selectedCourseLabel() {
      return this.courseLabels[this.courseIndex] || "No courses available";
    },
    leaveListTitle() {
      return this.session.role === "student" ? "My Leave Requests" : "Leave Reviews";
    },
    leaveFilterCourses() {
      const seen = new Set();
      const courses = [{ value: "", label: "All Courses" }];
      const requests = this.leaveRequests || [];
      requests.forEach(item => {
        const value = this.leaveCourseFilterValue(item);
        if (!value || seen.has(value)) return;
        seen.add(value);
        courses.push({
          value,
          label: item.courseName || value
        });
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
      const requests = this.leaveRequests || [];
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
      return (this.leaveRequests || []).filter(item => this.matchesLeaveFilters(item));
    },
    reasonTypeLabels() {
      return this.reasonTypes.map(item => item.label);
    },
    selectedReasonTypeLabel() {
      return this.reasonTypeLabels[this.reasonTypeIndex] || "Other";
    }
  },
  onShow() {
    const session = requireRole(["student", "teacher", "admin"]);
    if (!session) return;
    this.session = session;
    const now = Date.now();
    if (!this.courses.length || now - this.lastLoadedAt > this.loadTtlMs) {
      this.load();
    }
  },
  methods: {
    async load(forceRefresh = false) {
      this.loading = true;
      const result = await callAiemsFunction("get-dashboard-data", {
        session: getSession(),
        forceRefresh
      });
      this.loading = false;

      if (!result.ok) {
        uni.showToast({ title: result.message || "Failed to load leave data.", icon: "none" });
        return;
      }

      this.courses = result.data.courses || [];
      this.leaveRequests = result.data.leaveRequests || [];
      if (!this.courses.length) {
        console.warn("[AI-EMS] No courses returned for leave page.", {
          session: getSession(),
          dashboardMeta: result.data.meta || null
        });
      }
      this.lastLoadedAt = Date.now();

      if (this.courseIndex >= this.courses.length) {
        this.courseIndex = 0;
      }
      if (this.reasonTypeIndex >= this.reasonTypes.length) {
        this.reasonTypeIndex = 0;
      }
      if (this.leaveFilterCourseIndex >= this.leaveFilterCourses.length) {
        this.leaveFilterCourseIndex = 0;
      }
      if (this.leaveFilterTeacherIndex >= this.leaveFilterTeachers.length) {
        this.leaveFilterTeacherIndex = 0;
      }
    },
    refresh() {
      this.load(true);
    },
    async submitLeave() {
      const course = this.courses[this.courseIndex];
      const reasonDetail = this.reasonDetail.trim();

      if (!course || !reasonDetail) {
        uni.showToast({ title: "Course and reason are required.", icon: "none" });
        return;
      }

      const reasonType = this.reasonTypes[this.reasonTypeIndex] || this.reasonTypes[3];
      const result = await callAiemsFunction("submit-leave", {
        session: getSession(),
        courseOfferingId: course.courseOfferingId,
        leaveDate: this.date,
        reasonType: reasonType.value,
        reasonDetail
      });

      if (result.ok) {
        this.reasonDetail = "";
        uni.showToast({ title: "Submitted", icon: "success" });
        this.load(true);
        return;
      }

      uni.showToast({ title: result.message || "Submit failed.", icon: "none" });
    },
    changeReasonType(event) {
      this.reasonTypeIndex = Number(event.detail.value);
    },
    changeCourse(event) {
      this.courseIndex = Number(event.detail.value);
    },
    changeDate(event) {
      this.date = event.detail.value;
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
    async review(item, decision) {
      const draft = this.reviewDraftFor(item);
      const result = await callAiemsFunction("review-leave", {
        session: getSession(),
        leaveId: item._id,
        decision,
        reviewComment: draft.enabled ? draft.comment.trim() : ""
      });

      if (result.ok) {
        uni.showToast({ title: decision === "approved" ? "Approved" : "Rejected", icon: "success" });
        this.load(true);
        return;
      }

      uni.showToast({ title: result.message || "Review failed.", icon: "none" });
    },
    async cancelLeave(item) {
      const result = await callAiemsFunction("cancel-leave", {
        session: getSession(),
        leaveId: item._id
      });

      if (result.ok) {
        uni.showToast({ title: "Cancelled", icon: "success" });
        this.load(true);
        return;
      }

      uni.showToast({ title: result.message || "Cancel failed.", icon: "none" });
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
    backHome() {
      uni.reLaunch({ url: dashboardUrl(this.session.role) });
    },
    formatCourseLabel(course) {
      if (!course) {
        return "Unnamed course";
      }
      const title = [course.code, course.name].filter(Boolean).join(" ").trim() || "Unnamed course";
      const selected = course.selectedTeacherName || "";
      const teachers = selected
        ? ` (${selected})`
        : Array.isArray(course.teacherNames) && course.teacherNames.length
          ? ` (${course.teacherNames.join(", ")})`
          : "";
      return title + teachers;
    },
    leaveTitle(item) {
      return [item.studentName || this.session.displayName, item.courseName].filter(Boolean).join(" - ");
    },
    reasonTypeLabel(value) {
      const type = this.reasonTypes.find(item => item.value === value);
      return type ? type.label : value;
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
    leaveTeacherLabel(item) {
      return (
        this.leaveTeacherOptions(item)
          .map(option => option.label)
          .filter(Boolean)
          .join(", ") || "Unassigned"
      );
    },
    matchesLeaveFilters(item) {
      const selectedCourse = this.leaveFilterCourses[this.leaveFilterCourseIndex] || this.leaveFilterCourses[0];
      if (selectedCourse && selectedCourse.value && this.leaveCourseFilterValue(item) !== selectedCourse.value) {
        return false;
      }
      const selectedTeacher = this.leaveFilterTeachers[this.leaveFilterTeacherIndex] || this.leaveFilterTeachers[0];
      if (
        this.session.role === "admin" &&
        selectedTeacher &&
        selectedTeacher.value &&
        !this.leaveTeacherFilterValues(item).has(selectedTeacher.value)
      ) {
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
    reviewDraftKey(item) {
      return String((item && item._id) || "");
    },
    reviewDraftFor(item) {
      const key = this.reviewDraftKey(item);
      return this.reviewDrafts[key] || { enabled: false, comment: "" };
    },
    isCommentEnabled(item) {
      return this.reviewDraftFor(item).enabled;
    },
    reviewCommentFor(item) {
      return this.reviewDraftFor(item).comment;
    },
    toggleReviewComment(item) {
      const key = this.reviewDraftKey(item);
      const current = this.reviewDraftFor(item);
      this.reviewDrafts = {
        ...this.reviewDrafts,
        [key]: { ...current, enabled: !current.enabled }
      };
    },
    changeReviewComment(item, event) {
      const key = this.reviewDraftKey(item);
      const current = this.reviewDraftFor(item);
      this.reviewDrafts = {
        ...this.reviewDrafts,
        [key]: { ...current, comment: event.detail.value }
      };
    },
    reviewCommentVisibilityKey(item) {
      return String((item && item._id) || "");
    },
    isReviewCommentVisible(item) {
      return Boolean(this.reviewCommentVisibility[this.reviewCommentVisibilityKey(item)]);
    },
    toggleReviewCommentVisibility(item) {
      const key = this.reviewCommentVisibilityKey(item);
      this.reviewCommentVisibility = {
        ...this.reviewCommentVisibility,
        [key]: !this.reviewCommentVisibility[key]
      };
    }
  }
};
</script>

<style scoped>
.field {
  margin-bottom: 18rpx;
}

.picker-value {
  min-height: 46px;
  padding: 11px 16px;
  background: #f9fafb;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #111827;
  font-size: 16px;
  line-height: 1.45;
}

.full-btn {
  width: 100%;
}

.top-actions {
  margin-top: 0;
}

.filter-panel {
  display: grid;
  grid-template-columns: minmax(220rpx, 1.3fr) repeat(2, minmax(170rpx, 1fr)) auto;
  align-items: end;
  gap: 14rpx;
  margin-top: 16rpx;
  margin-bottom: 8rpx;
}

.filter-panel.admin {
  grid-template-columns: minmax(220rpx, 1.3fr) minmax(190rpx, 1fr) repeat(2, minmax(170rpx, 1fr)) auto;
}

.filter-panel .field {
  margin-bottom: 0;
}

.filter-reset-btn {
  min-width: 128rpx;
  margin: 0 !important;
}

.leave-card {
  margin-top: 16rpx;
  padding: 18px;
  background: #ffffff;
  border: 0;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
}

.leave-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.leave-title {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}

.leave-info-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12rpx;
}

.leave-info-grid.admin {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.info-cell,
.note-box {
  padding: 14px;
  background: #f9fafb;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}

.info-cell .value,
.note-box .note-text {
  display: block;
  margin-top: 6rpx;
}

.note-box {
  margin-top: 12rpx;
}

.note-text {
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
  flex: 1 1 100%;
}

.comment-visibility {
  margin-top: 12rpx;
}

.comment-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f3f4f6;
  color: #374151;
  font-size: 14px;
  line-height: 1.25;
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

@media (max-width: 800px) {
  .filter-panel,
  .filter-panel.admin {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .leave-info-grid,
  .leave-info-grid.admin {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .filter-panel,
  .filter-panel.admin {
    grid-template-columns: 1fr;
  }

  .leave-info-grid,
  .leave-info-grid.admin {
    grid-template-columns: 1fr;
  }
}
</style>
