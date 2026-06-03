<template>
  <view class="page">
    <PageHeader title="Teacher Dashboard" :display-name="session.displayName" :username="session.username">
      <button class="secondary-btn refresh-btn" :loading="loading" @click="refresh">Refresh</button>
    </PageHeader>

    <NavTabs :role="session.role" current="dashboard" />

    <view class="section">
      <view class="section-head">
        <view>
          <text class="section-title">Teaching Overview</text>
          <text class="muted">{{ teacherProfile.department }} - {{ teacherProfile.title }}</text>
        </view>
        <text class="muted">{{ lastUpdatedText }}</text>
      </view>
      <view class="row">
        <StatCard :value="data.courses.length" label="Courses" />
        <StatCard :value="teacherProfile.studentCount" label="Students" />
        <StatCard :value="riskStudents.length" label="At Risk" />
      </view>
    </view>

    <view class="section">
      <text class="section-title">Profile Review</text>
      <view class="info-grid">
        <view class="info-cell">
          <text class="label">Teacher ID</text>
          <text class="value">{{ teacherProfile.teacherNo }}</text>
        </view>
        <view class="info-cell">
          <text class="label">Department</text>
          <text class="value">{{ teacherProfile.department }}</text>
        </view>
      </view>
      <view class="field">
        <text class="label">Office</text>
        <input v-model="profileForm.office" />
      </view>
      <view class="field">
        <text class="label">Research Fields</text>
        <input v-model="profileForm.researchFields" />
      </view>
      <view class="field">
        <text class="label">Teaching Experience</text>
        <textarea v-model="profileForm.teachingExperience" />
      </view>
      <button class="primary-btn full-btn" :loading="savingProfile" @click="submitProfileChange">
        Submit for Review
      </button>
      <DataCard
        v-for="item in data.profileChangeRequests"
        :key="item._id"
        :title="formatChangeRequest(item)"
        :subtitle="[item.status, formatDate(item.createdAt)].filter(Boolean).join(' - ')"
      >
        <StatusBadge :status="item.status" />
      </DataCard>
    </view>

    <view class="section">
      <text class="section-title">Assigned Courses</text>
      <DataCard
        v-for="course in data.courses"
        :key="course.courseOfferingId || course._id"
        :title="course.code + ' ' + course.name"
        :subtitle="courseSubtitle(course)"
      />
    </view>

    <view class="section">
      <text class="section-title">Attendance Editor</text>
      <template v-if="!attendanceCourses.length">
        <text class="muted">No assigned courses available.</text>
      </template>
      <template v-else>
        <view class="attendance-controls">
          <view class="field">
            <text class="label">Course</text>
            <picker
              class="picker-shell"
              :range="attendanceCourseLabels"
              :value="attendanceCourseIndex"
              @change="changeAttendanceCourse"
            >
              <view class="picker-value">{{ attendanceCourseLabels[attendanceCourseIndex] || "Select course" }}</view>
            </picker>
          </view>
          <view class="field">
            <text class="label">Class Session</text>
            <picker
              class="picker-shell"
              :range="attendanceSessionLabels"
              :value="attendanceSessionIndex"
              @change="changeAttendanceSession"
            >
              <view class="picker-value">{{ attendanceSessionLabels[attendanceSessionIndex] || "No sessions" }}</view>
            </picker>
          </view>
        </view>
        <view class="attendance-list">
          <view v-for="student in attendanceStudents" :key="student.studentId" class="attendance-row">
            <view class="student-meta">
              <text class="value">{{ student.studentName }}</text>
              <text class="muted">{{ student.studentNo }}</text>
            </view>
            <view v-if="attendanceStatus(student) !== 'on_leave'" class="status-options">
              <view
                v-for="status in attendanceStatuses"
                :key="status.value"
                class="status-option"
                :class="{ active: attendanceStatus(student) === status.value }"
                @tap.stop="changeAttendanceStatusValue(student, status.value)"
              >
                <text>{{ status.label }}</text>
              </view>
            </view>
            <StatusBadge v-else status="on_leave" />
          </view>
        </view>
        <button class="primary-btn attendance-save-btn" :loading="savingAttendance" @tap="saveAttendance">
          Save Attendance
        </button>
      </template>
    </view>

    <view class="section">
      <text class="section-title">At-Risk Students</text>
      <text class="section-hint">Absence threshold: 3+ records</text>
      <template v-if="!riskStudents.length">
        <text class="muted">No at-risk students detected.</text>
      </template>
      <DataCard
        v-for="student in riskStudents"
        :key="student.studentId"
        :title="student.studentName"
        :subtitle="'Absent: ' + student.absenceCount + ' times across ' + student.courseCount + ' course(s)'"
      >
        <StatusBadge :status="student.severity || 'absent'" />
      </DataCard>
    </view>

    <view class="section">
      <text class="section-title">Pending Leave Reviews</text>
      <view class="leave-filter-panel">
        <view class="field">
          <text class="label">Course</text>
          <picker
            class="picker-shell"
            :range="leaveFilterCourseLabels"
            :value="leaveFilterCourseIndex"
            @change="changeLeaveFilterCourse"
          >
            <view class="picker-value">{{ selectedLeaveFilterCourseLabel }}</view>
          </picker>
        </view>
        <view class="field">
          <text class="label">Start Date</text>
          <picker mode="date" class="picker-shell" :value="leaveFilterStartDate" @change="changeLeaveFilterStartDate">
            <view class="picker-value">{{ leaveFilterStartDate || "All dates" }}</view>
          </picker>
        </view>
        <view class="field">
          <text class="label">End Date</text>
          <picker mode="date" class="picker-shell" :value="leaveFilterEndDate" @change="changeLeaveFilterEndDate">
            <view class="picker-value">{{ leaveFilterEndDate || "All dates" }}</view>
          </picker>
        </view>
        <button class="secondary-btn leave-filter-reset-btn" @click="resetLeaveFilters">Reset</button>
      </view>
      <template v-if="!pendingLeaveRequests.length">
        <text class="muted">{{
          unfilteredPendingLeaveRequests.length
            ? "No pending leave requests match the selected filters."
            : "No pending leave requests."
        }}</text>
      </template>
      <view v-for="item in pendingLeaveRequests" :key="item._id" class="leave-review-card">
        <view class="leave-review-head">
          <view>
            <text class="value">{{ leaveTitle(item) }}</text>
            <text class="muted">{{ [item.studentNo, item.date].filter(Boolean).join(" - ") }}</text>
          </view>
          <StatusBadge :status="item.status" />
        </view>
        <view class="leave-review-grid">
          <view class="info-cell">
            <text class="label">Course</text>
            <text class="value">{{ item.courseName || "Course unavailable" }}</text>
          </view>
          <view class="info-cell">
            <text class="label">Leave Date</text>
            <text class="value">{{ item.date || "Not set" }}</text>
          </view>
          <view class="info-cell">
            <text class="label">Reason Type</text>
            <text class="value">{{ item.reasonType || "Other" }}</text>
          </view>
        </view>
        <view class="note-box">
          <text class="label">Leave Reason</text>
          <text class="note-text">{{ item.reasonDetail || item.reason || "No reason provided." }}</text>
        </view>
        <view class="comment-control">
          <view class="comment-toggle" :class="{ active: isLeaveCommentEnabled(item) }" @tap="toggleLeaveComment(item)">
            <text>{{ isLeaveCommentEnabled(item) ? "With comment" : "No comment" }}</text>
          </view>
          <textarea
            v-if="isLeaveCommentEnabled(item)"
            :value="leaveReviewCommentFor(item)"
            class="review-textarea"
            placeholder="Optional note for this request."
            @input="changeLeaveReviewComment(item, $event)"
          />
        </view>
        <view class="inline-actions">
          <button class="primary-btn compact-btn" @click="review(item, 'approved')">Approve</button>
          <button class="danger-btn compact-btn" @click="review(item, 'rejected')">Reject</button>
        </view>
      </view>
    </view>

    <view class="section">
      <text class="section-title">Leave Review History</text>
      <template v-if="!leaveReviewHistory.length">
        <text class="muted">{{
          unfilteredLeaveReviewHistory.length
            ? "No reviewed leave records match the selected filters."
            : "No reviewed leave records yet."
        }}</text>
      </template>
      <view v-for="item in leaveReviewHistory" :key="item._id" class="leave-history-row">
        <view class="history-main">
          <text class="value">{{ leaveTitle(item) }}</text>
          <text class="muted">{{ [item.date, item.reasonType || item.reason].filter(Boolean).join(" - ") }}</text>
          <text v-if="item.reviewComment" class="history-comment">Comment: {{ item.reviewComment }}</text>
        </view>
        <StatusBadge :status="item.status" />
      </view>
    </view>

    <view class="section">
      <text class="section-title">Evaluation Snapshot</text>
      <DataCard
        v-for="item in data.evaluationSummary"
        :key="item.courseOfferingId || item.courseId"
        :title="item.courseName"
        :subtitle="'Average ' + item.average + ' / 5 - ' + item.count + ' response(s)'"
      />
    </view>
  </view>
</template>

<script>
import PageHeader from "../../components/PageHeader.vue";
import NavTabs from "../../components/NavTabs.vue";
import DataCard from "../../components/DataCard.vue";
import StatusBadge from "../../components/StatusBadge.vue";
import StatCard from "../../components/StatCard.vue";
import { callAiemsFunction } from "../../common/api.js";
import { getSession, requireRole } from "../../common/session.js";

export default {
  components: { PageHeader, NavTabs, DataCard, StatusBadge, StatCard },
  data() {
    return {
      session: {},
      loading: false,
      savingProfile: false,
      savingAttendance: false,
      lastUpdatedAt: 0,
      reviewDrafts: {},
      attendanceCourseIndex: 0,
      attendanceSessionIndex: 0,
      leaveFilterCourseIndex: 0,
      leaveFilterStartDate: "",
      leaveFilterEndDate: "",
      attendanceDrafts: {},
      attendanceStatuses: [
        { value: "present", label: "Present" },
        { value: "late", label: "Late" },
        { value: "absent", label: "Absent" },
        { value: "excused", label: "Excused" }
      ],
      profileForm: {
        office: "",
        researchFields: "",
        teachingExperience: ""
      },
      teacherProfile: {
        department: "",
        title: "",
        studentCount: 0,
        researchFields: []
      },
      data: {
        courses: [],
        classSessions: [],
        courseStudents: [],
        attendance: [],
        leaveRequests: [],
        evaluationSummary: [],
        profileChangeRequests: [],
        atRiskStudents: [],
        metrics: { courses: 0, pendingLeaves: 0, evaluations: 0 }
      }
    };
  },
  computed: {
    riskStudents() {
      if (this.data.atRiskStudents && this.data.atRiskStudents.length) {
        return this.data.atRiskStudents;
      }
      const courseOfferingIds = this.data.courses.map(c => c.courseOfferingId);
      const relevantAttendance = this.data.attendance.filter(a => courseOfferingIds.includes(a.courseOfferingId));
      const grouped = {};
      relevantAttendance.forEach(a => {
        if (a.status !== "absent") return;
        if (!grouped[a.studentId]) {
          grouped[a.studentId] = { count: 0, courseIds: new Set(), name: a.studentName || a.studentId };
        }
        grouped[a.studentId].count++;
        grouped[a.studentId].courseIds.add(a.courseOfferingId);
      });
      return Object.entries(grouped)
        .filter(([, d]) => d.count >= 3)
        .map(([studentId, d]) => ({
          studentId,
          studentName: d.name,
          absenceCount: d.count,
          courseCount: d.courseIds.size,
          severity: d.count >= 5 ? "critical" : "high"
        }));
    },
    lastUpdatedText() {
      return this.lastUpdatedAt ? "Updated " + this.formatTime(this.lastUpdatedAt) : "";
    },
    attendanceCourses() {
      return this.data.courses || [];
    },
    attendanceCourseLabels() {
      return this.attendanceCourses.map(course => [course.code, course.name].filter(Boolean).join(" "));
    },
    selectedAttendanceCourse() {
      return this.attendanceCourses[this.attendanceCourseIndex] || null;
    },
    attendanceSessionsForCourse() {
      const course = this.selectedAttendanceCourse;
      if (!course) return [];
      return (this.data.classSessions || []).filter(item => item.courseOfferingId === course.courseOfferingId);
    },
    attendanceSessionLabels() {
      return this.attendanceSessionsForCourse.map(item =>
        ["Session " + item.sequenceNo, item.sessionDate, item.startTime + "-" + item.endTime]
          .filter(Boolean)
          .join(" - ")
      );
    },
    selectedAttendanceSession() {
      return this.attendanceSessionsForCourse[this.attendanceSessionIndex] || null;
    },
    attendanceStudents() {
      const course = this.selectedAttendanceCourse;
      if (!course) return [];
      return (this.data.courseStudents || []).filter(item => item.courseOfferingId === course.courseOfferingId);
    },
    attendanceStatusLabels() {
      return this.attendanceStatuses.map(item => item.label);
    },
    leaveFilterCourses() {
      const seen = new Set();
      const courses = [{ value: "", label: "All Courses" }];
      const requests = this.data.leaveRequests || [];
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
    filteredLeaveRequests() {
      return (this.data.leaveRequests || []).filter(item => this.matchesLeaveFilters(item));
    },
    unfilteredPendingLeaveRequests() {
      return (this.data.leaveRequests || []).filter(item => item.status === "pending");
    },
    unfilteredLeaveReviewHistory() {
      return (this.data.leaveRequests || []).filter(item => item.status !== "pending");
    },
    pendingLeaveRequests() {
      return this.filteredLeaveRequests.filter(item => item.status === "pending");
    },
    leaveReviewHistory() {
      return this.filteredLeaveRequests.filter(item => item.status !== "pending");
    }
  },
  onShow() {
    const session = requireRole(["teacher"]);
    if (!session) return;
    this.session = session;
    const now = Date.now();
    if (!this.lastUpdatedAt || now - this.lastUpdatedAt > 30000) {
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
      if (result.ok) {
        this.data = {
          ...this.data,
          ...result.data,
          courses: result.data.courses || [],
          classSessions: result.data.classSessions || [],
          courseStudents: result.data.courseStudents || [],
          attendance: result.data.attendance || [],
          leaveRequests: result.data.leaveRequests || [],
          evaluationSummary: result.data.evaluationSummary || [],
          profileChangeRequests: result.data.profileChangeRequests || [],
          atRiskStudents: result.data.atRiskStudents || []
        };
        this.teacherProfile = {
          ...this.teacherProfile,
          ...(result.data.teacherProfile || {})
        };
        this.profileForm = {
          office: this.teacherProfile.office || "",
          researchFields: (this.teacherProfile.researchFields || []).join(", "),
          teachingExperience: this.teacherProfile.teachingExperience || ""
        };
        this.lastUpdatedAt = Date.now();
        this.normalizeAttendanceSelection();
        this.normalizeLeaveFilterSelection();
      }
    },
    refresh() {
      this.load(true);
    },
    async submitProfileChange() {
      this.savingProfile = true;
      const result = await callAiemsFunction("submit-profile-change", {
        session: getSession(),
        changes: {
          office: this.profileForm.office,
          researchFields: this.profileForm.researchFields
            .split(",")
            .map(item => item.trim())
            .filter(Boolean),
          teachingExperience: this.profileForm.teachingExperience
        }
      });
      this.savingProfile = false;
      if (result.ok) {
        uni.showToast({ title: "Submitted", icon: "success" });
        this.load(true);
        return;
      }
      uni.showToast({ title: result.message || "Submit failed.", icon: "none" });
    },
    async review(item, decision) {
      const draft = this.leaveReviewDraftFor(item);
      const result = await callAiemsFunction("review-leave", {
        session: getSession(),
        leaveId: item._id,
        decision,
        reviewComment: draft.enabled ? draft.comment.trim() : ""
      });
      if (result.ok) {
        uni.showToast({ title: decision === "approved" ? "Approved" : "Rejected", icon: "success" });
        this.load(true);
      } else {
        uni.showToast({ title: result.message || "Review failed.", icon: "none" });
      }
    },
    normalizeAttendanceSelection() {
      if (this.attendanceCourseIndex >= this.attendanceCourses.length) this.attendanceCourseIndex = 0;
      if (this.attendanceSessionIndex >= this.attendanceSessionsForCourse.length) this.attendanceSessionIndex = 0;
    },
    changeAttendanceCourse(event) {
      this.attendanceCourseIndex = Number(event.detail.value);
      this.attendanceSessionIndex = 0;
      this.attendanceDrafts = {};
    },
    changeAttendanceSession(event) {
      this.attendanceSessionIndex = Number(event.detail.value);
      this.attendanceDrafts = {};
    },
    changeLeaveFilterCourse(event) {
      this.leaveFilterCourseIndex = Number(event.detail.value);
    },
    changeLeaveFilterStartDate(event) {
      this.leaveFilterStartDate = event.detail.value;
    },
    changeLeaveFilterEndDate(event) {
      this.leaveFilterEndDate = event.detail.value;
    },
    resetLeaveFilters() {
      this.leaveFilterCourseIndex = 0;
      this.leaveFilterStartDate = "";
      this.leaveFilterEndDate = "";
    },
    attendanceRecord(student) {
      const session = this.selectedAttendanceSession;
      if (!session) return null;
      const studentIds = [this.studentKey(student), student.userId].filter(Boolean);
      return (
        (this.data.attendance || []).find(
          item =>
            studentIds.includes(item.studentId) &&
            item.courseOfferingId === student.courseOfferingId &&
            item.date === session.sessionDate
        ) || null
      );
    },
    attendanceStatus(student) {
      const key = this.studentKey(student);
      if (this.attendanceDrafts[key]) return this.attendanceDrafts[key];
      const record = this.attendanceRecord(student);
      return record ? record.status : "present";
    },
    attendanceStatusIndex(student) {
      const status = this.attendanceStatus(student);
      const index = this.attendanceStatuses.findIndex(item => item.value === status);
      return index >= 0 ? index : 0;
    },
    attendanceStatusLabel(status) {
      const item = this.attendanceStatuses.find(option => option.value === status);
      return item ? item.label : status;
    },
    changeAttendanceStatus(student, event) {
      const option = this.attendanceStatuses[Number(event.detail.value)] || this.attendanceStatuses[0];
      this.changeAttendanceStatusValue(student, option.value);
    },
    changeAttendanceStatusValue(student, status) {
      const key = this.studentKey(student);
      if (!key) {
        uni.showToast({ title: "Student id is missing.", icon: "none" });
        return;
      }
      this.attendanceDrafts = { ...this.attendanceDrafts, [key]: status };
    },
    async saveAttendance() {
      const course = this.selectedAttendanceCourse;
      const session = this.selectedAttendanceSession;
      if (!course || !session) {
        uni.showToast({ title: "Course and session are required.", icon: "none" });
        return;
      }
      const records = this.attendanceStudents
        .filter(student => this.attendanceStatus(student) !== "on_leave")
        .map(student => ({
          studentId: this.studentKey(student),
          status: this.attendanceStatus(student)
        }))
        .filter(record => record.studentId);
      if (!records.length) {
        uni.showToast({ title: "No editable students.", icon: "none" });
        return;
      }
      this.savingAttendance = true;
      const result = await callAiemsFunction("save-attendance-records", {
        session: getSession(),
        courseOfferingId: course.courseOfferingId,
        attendanceDate: session.sessionDate,
        records
      });
      this.savingAttendance = false;
      if (result.ok) {
        uni.showToast({ title: "Attendance saved", icon: "success" });
        this.attendanceDrafts = {};
        this.load(true);
        return;
      }
      uni.showToast({ title: result.message || "Save failed.", icon: "none" });
    },
    studentKey(student) {
      return String((student && (student.studentId || student.userId || student.studentNo)) || "").trim();
    },
    courseSubtitle(course) {
      return [
        course.schedule,
        course.credits ? course.credits + " credits" : "",
        course.totalSessions ? course.totalSessions + " sessions" : "",
        course.materialUploadDeadlineAt ? "Materials until " + this.formatDate(course.materialUploadDeadlineAt) : ""
      ]
        .filter(Boolean)
        .join(" - ");
    },
    formatChangeRequest(item) {
      const changes = item.changes || {};
      return Object.keys(changes)
        .map(key => {
          const change = changes[key] || {};
          return (change.label || key) + ": " + change.newValue;
        })
        .join("; ");
    },
    formatDate(value) {
      const timestamp = Number(value || 0);
      return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
    },
    formatTime(value) {
      const date = new Date(value);
      return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    },
    leaveTitle(item) {
      return [item.studentName, item.courseName].filter(Boolean).join(" - ") || "Leave request";
    },
    normalizeLeaveFilterSelection() {
      if (this.leaveFilterCourseIndex >= this.leaveFilterCourses.length) {
        this.leaveFilterCourseIndex = 0;
      }
    },
    leaveCourseFilterValue(item) {
      return String((item && (item.courseOfferingId || item.courseId || item.courseName)) || "").trim();
    },
    matchesLeaveFilters(item) {
      const selectedCourse = this.leaveFilterCourses[this.leaveFilterCourseIndex] || this.leaveFilterCourses[0];
      if (selectedCourse && selectedCourse.value && this.leaveCourseFilterValue(item) !== selectedCourse.value) {
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
    leaveReviewDraftKey(item) {
      return String((item && item._id) || "");
    },
    leaveReviewDraftFor(item) {
      const key = this.leaveReviewDraftKey(item);
      return this.reviewDrafts[key] || { enabled: false, comment: "" };
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
      this.reviewDrafts = {
        ...this.reviewDrafts,
        [key]: { ...current, enabled: !current.enabled }
      };
    },
    changeLeaveReviewComment(item, event) {
      const key = this.leaveReviewDraftKey(item);
      const current = this.leaveReviewDraftFor(item);
      this.reviewDrafts = {
        ...this.reviewDrafts,
        [key]: { ...current, comment: event.detail.value }
      };
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

.section-hint {
  display: block;
  margin-bottom: 10rpx;
  color: #94a3b8;
  font-size: 22rpx;
}

.refresh-btn {
  min-width: 150rpx;
}

.field {
  margin-bottom: 18rpx;
}

.full-btn {
  width: 100%;
  margin-top: 10rpx;
}

.attendance-save-btn {
  display: flex !important;
  align-items: center;
  justify-content: center;
  width: 100% !important;
  min-height: 44px !important;
  height: auto !important;
  margin: 14px 0 0 !important;
  padding: 0 16px !important;
  line-height: 1.25 !important;
  white-space: nowrap;
  box-sizing: border-box;
}

.attendance-save-btn::after {
  border: 0;
}

.inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.compact-btn {
  min-width: 126rpx;
  font-size: 24rpx;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx;
  margin: 16rpx 0;
}

.info-cell {
  padding: 16rpx;
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
  border-radius: 8rpx;
}

.leave-filter-panel {
  display: grid;
  grid-template-columns: minmax(220rpx, 1.4fr) repeat(2, minmax(180rpx, 1fr)) auto;
  align-items: end;
  gap: 14rpx;
  margin-top: 16rpx;
  margin-bottom: 8rpx;
}

.leave-filter-panel .field {
  margin-bottom: 0;
}

.leave-filter-reset-btn {
  min-width: 128rpx;
  margin: 0 !important;
}

.leave-review-card,
.leave-history-row {
  margin-top: 16rpx;
  padding: 18rpx;
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 8rpx;
}

.leave-review-head,
.leave-history-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.leave-review-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
  margin-top: 14rpx;
}

.note-box {
  margin-top: 12rpx;
  padding: 14rpx;
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
  border-radius: 8rpx;
}

.note-text,
.history-comment {
  display: block;
  margin-top: 6rpx;
  color: #0f172a;
  font-size: 26rpx;
  line-height: 1.5;
  white-space: pre-wrap;
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

.history-main {
  min-width: 0;
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

.attendance-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
  margin-bottom: 16rpx;
}

.attendance-list {
  display: grid;
  gap: 12rpx;
}

.attendance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  padding: 16rpx;
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
  border-radius: 8rpx;
}

.student-meta {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 180rpx;
}

.status-options {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8rpx;
}

.status-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 126rpx;
  min-height: 66rpx;
  margin: 0 !important;
  padding: 0 18rpx;
  border: 1rpx solid #cbd5e1;
  border-radius: 8rpx;
  background: #ffffff;
  color: #334155;
  font-size: 24rpx;
  line-height: 1.2;
  cursor: pointer;
  user-select: none;
  box-sizing: border-box;
}

.status-option.active {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.compact-picker {
  min-width: 170rpx;
  text-align: center;
}

@media (max-width: 700px) {
  .leave-filter-panel {
    grid-template-columns: 1fr;
  }

  .attendance-controls {
    grid-template-columns: 1fr;
  }

  .attendance-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .status-options {
    justify-content: flex-start;
  }
}
</style>
