<template>
  <view class="page">
    <view class="section">
      <view class="row">
        <view>
          <text class="section-title">Evaluation Review Details</text>
          <text class="muted">Anonymous feedback by teacher and course</text>
        </view>
        <view class="btn-row top-actions">
          <button class="secondary-btn" :loading="loading" @click="refresh">Refresh</button>
          <button class="secondary-btn" @click="goBack">Back</button>
        </view>
      </view>
    </view>

    <view v-if="allGroups.length" class="section filter-section">
      <view class="filter-grid">
        <view class="field">
          <text class="label">Teacher</text>
          <picker :range="teacherNames" :value="teacherIndex" @change="changeTeacher">
            <view class="picker-value">{{ selectedTeacherName }}</view>
          </picker>
        </view>
        <view class="field">
          <text class="label">Course</text>
          <picker :range="courseNames" :value="courseIndex" @change="changeCourse">
            <view class="picker-value">{{ selectedCourseName }}</view>
          </picker>
        </view>
        <button class="secondary-btn filter-reset-btn" @click="resetFilters">Clear Filters</button>
      </view>
    </view>

    <template v-if="!filteredGroups.length && !loading">
      <view class="section">
        <text class="muted">{{
          allGroups.length ? "No evaluations match the selected filters." : "No evaluation reviews available."
        }}</text>
      </view>
    </template>

    <view v-for="group in filteredGroups" :key="groupKey(group)" class="section review-section">
      <view class="review-head">
        <view>
          <text class="section-title">{{ groupTitle(group) }}</text>
          <text class="muted"
            >Average {{ average(group) }} / 5 -
            {{ group.evaluation_count || group.total_evaluations || 0 }} review(s)</text
          >
        </view>
        <text class="score-badge">{{ average(group) }}</text>
      </view>

      <view class="dimension-grid">
        <view v-for="field in scoreFields" :key="field.key" class="dimension-cell">
          <text class="dimension-label">{{ field.label }}</text>
          <text class="dimension-value">{{ formatScore((group.average_scores || {})[field.key]) }}</text>
        </view>
      </view>

      <template v-if="!(group.evaluations || []).length">
        <text class="muted">No anonymous comments in this group.</text>
      </template>

      <view v-for="(review, index) in group.evaluations" :key="reviewKey(group, review, index)" class="review-item">
        <view class="review-item-head">
          <text class="value">Anonymous Review {{ index + 1 }}</text>
          <text class="muted">{{ formatDate(review.submitted_at || review.create_time) }}</text>
        </view>
        <view class="review-score-grid">
          <view v-for="field in scoreFields" :key="field.key" class="score-cell">
            <text class="dimension-label">{{ field.label }}</text>
            <text class="score-text">{{ formatScore((review.scores || {})[field.key]) }}</text>
          </view>
        </view>
        <text class="feedback-text">{{ review.feedback_text || review.content || "No written feedback." }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { callAiemsFunction } from "../../common/api.js";
import { getSession, requireRole } from "../../common/session.js";

export default {
  data() {
    return {
      loading: false,
      teacherId: "",
      courseOfferingId: "",
      teacherIndex: 0,
      courseIndex: 0,
      filtersInitialized: false,
      courses: [],
      allGroups: [],
      scoreFields: [
        { key: "content", label: "Content" },
        { key: "teaching_method", label: "Teaching" },
        { key: "difficulty", label: "Difficulty" },
        { key: "workload", label: "Workload" },
        { key: "achievement", label: "Achievement" },
        { key: "overall", label: "Overall" }
      ]
    };
  },
  onLoad(options = {}) {
    this.teacherId = String(options.teacherId || options.teacher_id || "").trim();
    this.courseOfferingId = String(options.courseOfferingId || options.course_offering_id || "").trim();
    this.filtersInitialized = false;
  },
  onShow() {
    const session = requireRole(["student", "teacher", "admin"]);
    if (!session) return;
    this.load();
  },
  computed: {
    teacherOptions() {
      return this.buildUniqueOptions(this.allGroups, this.teacherValue, this.teacherLabel, "All Teachers");
    },
    teacherNames() {
      return this.teacherOptions.map(item => item.label);
    },
    courseOptions() {
      return this.buildUniqueOptions(this.allGroups, this.courseValue, this.courseLabel, "All Courses");
    },
    courseNames() {
      return this.courseOptions.map(item => item.label);
    },
    selectedTeacherName() {
      return (this.teacherOptions[this.teacherIndex] || this.teacherOptions[0] || {}).label || "All Teachers";
    },
    selectedCourseName() {
      return (this.courseOptions[this.courseIndex] || this.courseOptions[0] || {}).label || "All Courses";
    },
    selectedTeacherId() {
      return (this.teacherOptions[this.teacherIndex] || this.teacherOptions[0] || {}).value || "";
    },
    selectedCourseId() {
      return (this.courseOptions[this.courseIndex] || this.courseOptions[0] || {}).value || "";
    },
    filteredGroups() {
      return this.allGroups.filter(item => {
        const teacherMatches = !this.selectedTeacherId || this.teacherValue(item) === this.selectedTeacherId;
        const courseMatches = !this.selectedCourseId || this.courseValue(item) === this.selectedCourseId;
        return teacherMatches && courseMatches;
      });
    }
  },
  methods: {
    async load(forceRefresh = false) {
      this.loading = true;
      const session = getSession();
      const [dashboard, result] = await Promise.all([
        callAiemsFunction("get-dashboard-data", { session, forceRefresh }),
        callAiemsFunction("get-evaluation-summary", { session, forceRefresh })
      ]);
      this.loading = false;
      if (dashboard.ok) {
        this.courses = dashboard.data.courses || [];
      }
      if (!result.ok) {
        uni.showToast({ title: result.message || "Failed to load evaluations.", icon: "none" });
        return;
      }
      const payload = result.data || {};
      this.allGroups =
        result.teacherCourseReviews || payload.teacher_course_reviews || payload.teacherCourseReviews || [];
      this.initializeFilters();
    },
    refresh() {
      this.load(true);
    },
    groupKey(group) {
      return [
        group.teacher_id || group.teacherId || "",
        group.course_offering_id || group.courseOfferingId || group.course_id || group.courseId || ""
      ].join("-");
    },
    reviewKey(group, review, index) {
      return [this.groupKey(group), review.submitted_at || review.create_time || index].join("-");
    },
    changeTeacher(event) {
      this.teacherIndex = Number(event.detail.value);
    },
    changeCourse(event) {
      this.courseIndex = Number(event.detail.value);
    },
    resetFilters() {
      this.teacherIndex = 0;
      this.courseIndex = 0;
    },
    initializeFilters() {
      if (!this.filtersInitialized) {
        this.teacherIndex = this.findOptionIndex(this.teacherOptions, this.teacherId);
        this.courseIndex = this.findOptionIndex(this.courseOptions, this.courseOfferingId);
        this.filtersInitialized = true;
        return;
      }
      if (this.teacherIndex >= this.teacherOptions.length) this.teacherIndex = 0;
      if (this.courseIndex >= this.courseOptions.length) this.courseIndex = 0;
    },
    findOptionIndex(options, value) {
      const normalized = String(value || "").trim();
      if (!normalized) return 0;
      const index = options.findIndex(item => item.value === normalized);
      return index >= 0 ? index : 0;
    },
    buildUniqueOptions(items, valueGetter, labelGetter, allLabel) {
      const options = [{ value: "", label: allLabel }];
      const seen = new Set();
      for (const item of items || []) {
        const value = valueGetter(item);
        if (!value || seen.has(value)) continue;
        seen.add(value);
        options.push({ value, label: labelGetter(item) });
      }
      return options;
    },
    teacherValue(group) {
      return String(group.teacher_id || group.teacherId || "").trim();
    },
    teacherLabel(group) {
      return group.teacher_name || group.teacherName || this.teacherValue(group) || "Unassigned Teacher";
    },
    courseValue(group) {
      return String(
        group.course_offering_id || group.courseOfferingId || group.course_id || group.courseId || ""
      ).trim();
    },
    courseLabel(group) {
      return this.resolveGroupCourseLabel(group);
    },
    groupTitle(group) {
      const teacher = group.teacher_name || group.teacherName || "Unassigned Teacher";
      const course = this.resolveGroupCourseLabel(group);
      return teacher + " - " + course;
    },
    resolveGroupCourseLabel(group) {
      const courseId = String(group.course_id || group.courseId || "").trim();
      const offeringId = String(group.course_offering_id || group.courseOfferingId || "").trim();
      const course = this.courses.find(course => {
        const ids = [
          course.courseOfferingId,
          course.course_offering_id,
          course._id,
          course.id,
          course.courseId,
          course.course_id
        ].map(value => String(value || "").trim());
        return ids.includes(offeringId) || ids.includes(courseId);
      });
      const dashboardLabel = course ? this.formatCourseLabel(course) : "";
      const storedLabel = group.course_name || group.courseName || "";
      if (dashboardLabel) return dashboardLabel;
      if (this.isDisplayCourseName(storedLabel, courseId, offeringId)) return storedLabel;
      return courseId || offeringId || "Unnamed Course";
    },
    formatCourseLabel(course) {
      return [
        course.code || course.courseCode || course.course_code,
        course.name || course.courseName || course.course_name
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
    },
    isDisplayCourseName(value, ...ids) {
      const text = String(value || "").trim();
      if (!text) return false;
      if (ids.some(id => String(id || "").trim() === text)) return false;
      return !/^[a-f0-9]{20,}$/i.test(text);
    },
    average(group) {
      const value =
        group.average_rating || group.averageRating || (group.average_scores && group.average_scores.overall) || 0;
      return Number(value || 0).toFixed(1);
    },
    formatScore(value) {
      const numberValue = Number(value || 0);
      return numberValue ? numberValue.toFixed(1) : "0.0";
    },
    formatDate(value) {
      const timestamp = Number(value || 0);
      if (!timestamp) return "";
      return new Date(timestamp).toISOString().slice(0, 16).replace("T", " ");
    },
    goBack() {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        uni.navigateBack();
        return;
      }
      uni.reLaunch({ url: "/pages/evaluation/evaluation" });
    }
  }
};
</script>

<style scoped>
.top-actions {
  margin-top: 0;
}

.review-section {
  display: block;
}

.field {
  min-width: 0;
  margin-bottom: 0;
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
  overflow-wrap: anywhere;
}

.filter-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 16rpx;
  align-items: end;
}

.filter-reset-btn {
  min-width: 180rpx;
}

.review-head,
.review-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
}

.score-badge {
  flex: 0 0 auto;
  min-width: 88rpx;
  padding: 10rpx 16rpx;
  border-radius: 8rpx;
  background: #dcfce7;
  color: #166534;
  font-size: 28rpx;
  font-weight: 700;
  text-align: center;
}

.dimension-grid,
.review-score-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14rpx;
  margin-top: 18rpx;
}

.dimension-cell,
.score-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  min-width: 0;
  padding: 16px 18px;
  background: #ffffff;
  border: 0;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
  box-sizing: border-box;
}

.dimension-label {
  color: #475569;
  font-size: 24rpx;
  font-weight: 600;
}

.dimension-value,
.score-text {
  color: #0f172a;
  font-size: 30rpx;
  font-weight: 700;
  white-space: nowrap;
}

.score-text {
  display: block;
  line-height: 1.4;
}

.review-item {
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid #e2e8f0;
}

.feedback-text {
  display: block;
  margin-top: 16rpx;
  color: #334155;
  font-size: 26rpx;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

@media (max-width: 700px) {
  .filter-grid {
    grid-template-columns: 1fr;
  }

  .review-head,
  .review-item-head {
    flex-direction: column;
  }

  .dimension-grid,
  .review-score-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
