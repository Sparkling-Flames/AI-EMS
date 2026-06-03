<template>
  <view class="page">
    <view class="section">
      <view class="row">
        <view>
          <text class="section-title">Course Evaluation</text>
          <text class="muted">{{ session.displayName }} - {{ session.role }}</text>
        </view>
        <view class="btn-row top-actions">
          <button class="secondary-btn" :loading="loading" @click="refresh">Refresh</button>
          <button class="secondary-btn" @click="backHome">Home</button>
        </view>
      </view>
    </view>

    <view v-if="session.role === 'student'" class="section">
      <text class="section-title">Submit Anonymous Feedback</text>
      <template v-if="courses.length">
        <view class="field">
          <text class="label">Course</text>
          <picker :range="courseNames" :value="courseIndex" @change="changeCourse">
            <view class="picker-value">{{ selectedCourseName }}</view>
          </picker>
        </view>
        <view class="score-grid">
          <view v-for="field in scoreFields" :key="field.key" class="field">
            <text class="label">{{ field.label }}</text>
            <picker :range="scoreOptions" :value="scoreIndex(field.key)" @change="changeScore(field.key, $event)">
              <view class="picker-value score-picker">{{ scores[field.key] }} / 5</view>
            </picker>
          </view>
        </view>
        <view class="field">
          <text class="label">Feedback</text>
          <textarea v-model="feedback" maxlength="500" placeholder="Your feedback will be stored anonymously." />
        </view>
        <button class="primary-btn full-btn" :loading="submitting" @click="submitEvaluation">Submit</button>
      </template>
      <view v-else class="empty-note">
        <text class="muted">No completed courses available for evaluation.</text>
      </view>
    </view>

    <view class="section">
      <text class="section-title">Teacher Course Evaluation Reviews</text>
      <template v-if="!reviewGroups.length">
        <text class="muted">No teacher course evaluations available.</text>
      </template>
      <template v-else>
        <view class="filter-grid">
          <view class="field">
            <text class="label">Teacher</text>
            <picker :range="reviewTeacherNames" :value="reviewTeacherIndex" @change="changeReviewTeacher">
              <view class="picker-value">{{ selectedReviewTeacherName }}</view>
            </picker>
          </view>
          <view class="field">
            <text class="label">Course</text>
            <picker :range="reviewCourseNames" :value="reviewCourseIndex" @change="changeReviewCourse">
              <view class="picker-value">{{ selectedReviewCourseName }}</view>
            </picker>
          </view>
          <button class="secondary-btn filter-reset-btn" @click="resetReviewFilters">Clear Filters</button>
        </view>
        <view v-if="!visibleReviewGroups.length" class="empty-note">
          <text class="muted">No evaluations match the selected filters.</text>
        </view>
      </template>
      <view
        v-for="item in visibleReviewGroups"
        :key="reviewGroupKey(item)"
        class="card review-link-card"
        @click="openReviewGroup(item)"
      >
        <view class="summary-head">
          <view class="summary-title-block">
            <text class="review-title">{{ reviewGroupTitle(item) }}</text>
            <text class="review-meta"
              >Average {{ reviewAverage(item) }} / 5 -
              {{ item.evaluation_count || item.total_evaluations || 0 }} review(s)</text
            >
          </view>
          <StatusBadge :status="Number(reviewAverage(item)) < 3 ? 'high' : 'present'" />
        </view>
        <view v-if="item.averageScores" class="dimension-grid">
          <view v-for="field in scoreFields" :key="field.key" class="dimension-cell">
            <text class="dimension-label">{{ field.label }}</text>
            <text class="dimension-value">{{ formatScore(item.averageScores[field.key]) }}</text>
          </view>
        </view>
        <view v-else-if="item.average_scores" class="dimension-grid">
          <view v-for="field in scoreFields" :key="field.key" class="dimension-cell">
            <text class="dimension-label">{{ field.label }}</text>
            <text class="dimension-value">{{ formatScore(item.average_scores[field.key]) }}</text>
          </view>
        </view>
        <button class="secondary-btn detail-btn" @click.stop="openReviewGroup(item)">View All Reviews</button>
      </view>
    </view>
  </view>
</template>

<script>
import StatusBadge from "../../components/StatusBadge.vue";
import { callAiemsFunction } from "../../common/api.js";
import { dashboardUrl, getSession, requireRole } from "../../common/session.js";

export default {
  components: { StatusBadge },
  data() {
    return {
      session: {},
      courses: [],
      summaries: [],
      reviewGroups: [],
      courseIndex: 0,
      reviewTeacherIndex: 0,
      reviewCourseIndex: 0,
      loading: false,
      submitting: false,
      feedback: "",
      scores: {
        content: 5,
        teaching_method: 5,
        difficulty: 3,
        workload: 3,
        achievement: 5,
        overall: 5
      },
      scoreFields: [
        { key: "content", label: "Content" },
        { key: "teaching_method", label: "Teaching" },
        { key: "difficulty", label: "Difficulty" },
        { key: "workload", label: "Workload" },
        { key: "achievement", label: "Achievement" },
        { key: "overall", label: "Overall" }
      ],
      scoreOptions: ["1", "2", "3", "4", "5"],
      lastLoadedAt: 0,
      loadTtlMs: 30000
    };
  },
  computed: {
    courseNames() {
      return this.courses.map(item => this.formatCourseLabel(item));
    },
    selectedCourseName() {
      return this.courseNames[this.courseIndex] || "No courses available";
    },
    reviewTeacherOptions() {
      return this.buildUniqueOptions(
        this.reviewGroups,
        this.reviewTeacherValue,
        this.reviewTeacherLabel,
        "All Teachers"
      );
    },
    reviewTeacherNames() {
      return this.reviewTeacherOptions.map(item => item.label);
    },
    reviewCourseOptions() {
      return this.buildUniqueOptions(this.reviewGroups, this.reviewCourseValue, this.reviewCourseLabel, "All Courses");
    },
    reviewCourseNames() {
      return this.reviewCourseOptions.map(item => item.label);
    },
    selectedReviewTeacherName() {
      return (
        (this.reviewTeacherOptions[this.reviewTeacherIndex] || this.reviewTeacherOptions[0] || {}).label ||
        "All Teachers"
      );
    },
    selectedReviewCourseName() {
      return (
        (this.reviewCourseOptions[this.reviewCourseIndex] || this.reviewCourseOptions[0] || {}).label || "All Courses"
      );
    },
    selectedReviewTeacherId() {
      return (this.reviewTeacherOptions[this.reviewTeacherIndex] || this.reviewTeacherOptions[0] || {}).value || "";
    },
    selectedReviewCourseId() {
      return (this.reviewCourseOptions[this.reviewCourseIndex] || this.reviewCourseOptions[0] || {}).value || "";
    },
    visibleReviewGroups() {
      return this.reviewGroups.filter(item => {
        const teacherMatches =
          !this.selectedReviewTeacherId || this.reviewTeacherValue(item) === this.selectedReviewTeacherId;
        const courseMatches =
          !this.selectedReviewCourseId || this.reviewCourseValue(item) === this.selectedReviewCourseId;
        return teacherMatches && courseMatches;
      });
    }
  },
  onShow() {
    const session = requireRole(["student", "teacher", "admin"]);
    if (!session) return;
    this.session = session;
    const now = Date.now();
    if (!this.lastLoadedAt || now - this.lastLoadedAt > this.loadTtlMs) {
      this.load();
    }
  },
  methods: {
    defaultScores() {
      return {
        content: 5,
        teaching_method: 5,
        difficulty: 3,
        workload: 3,
        achievement: 5,
        overall: 5
      };
    },
    async load(forceRefresh = false) {
      this.loading = true;
      const dashboard = await callAiemsFunction("get-dashboard-data", {
        session: getSession(),
        forceRefresh
      });
      if (dashboard.ok) {
        this.courses = this.filterEvaluableCourses(dashboard.data.courses || []);
      }

      const result = await callAiemsFunction("get-evaluation-summary", {
        session: getSession(),
        forceRefresh
      });
      this.loading = false;
      if (result.ok) {
        const payload = result.data || {};
        this.summaries = result.summary || payload.summary || (Array.isArray(payload) ? payload : []);
        this.reviewGroups =
          result.teacherCourseReviews || payload.teacher_course_reviews || payload.teacherCourseReviews || [];
        this.clampReviewFilters();
      }
      this.lastLoadedAt = Date.now();
      if (this.courseIndex >= this.courses.length) this.courseIndex = 0;
    },
    refresh() {
      this.load(true);
    },
    async submitEvaluation() {
      const course = this.courses[this.courseIndex];
      const scores = this.normalizedScores();
      if (!course || !scores || !this.feedback.trim()) {
        uni.showToast({ title: "Valid course, scores and feedback are required.", icon: "none" });
        return;
      }
      if (!this.canEvaluateCourse(course)) {
        uni.showToast({ title: "Course evaluations open only after the course has ended.", icon: "none" });
        return;
      }

      this.submitting = true;
      const result = await callAiemsFunction("submit-evaluation", {
        session: getSession(),
        courseOfferingId: course.courseOfferingId || course._id,
        rating: scores.overall,
        scores,
        feedback: this.feedback.trim()
      });
      this.submitting = false;

      if (result.ok) {
        this.feedback = "";
        this.scores = this.defaultScores();
        uni.showToast({ title: "Submitted anonymously", icon: "success" });
        this.load(true);
        return;
      }

      uni.showToast({ title: result.message || "Submit failed.", icon: "none" });
    },
    normalizedScores() {
      const next = {};
      for (const field of this.scoreFields) {
        const value = Number(this.scores[field.key]);
        if (!Number.isFinite(value) || value < 1 || value > 5) {
          return null;
        }
        next[field.key] = value;
      }
      return next;
    },
    changeCourse(event) {
      this.courseIndex = Number(event.detail.value);
    },
    changeReviewTeacher(event) {
      this.reviewTeacherIndex = Number(event.detail.value);
    },
    changeReviewCourse(event) {
      this.reviewCourseIndex = Number(event.detail.value);
    },
    resetReviewFilters() {
      this.reviewTeacherIndex = 0;
      this.reviewCourseIndex = 0;
    },
    clampReviewFilters() {
      if (this.reviewTeacherIndex >= this.reviewTeacherOptions.length) this.reviewTeacherIndex = 0;
      if (this.reviewCourseIndex >= this.reviewCourseOptions.length) this.reviewCourseIndex = 0;
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
    reviewTeacherValue(item) {
      return String(item.teacher_id || item.teacherId || "").trim();
    },
    reviewTeacherLabel(item) {
      return item.teacher_name || item.teacherName || this.reviewTeacherValue(item) || "Unassigned Teacher";
    },
    reviewCourseValue(item) {
      return String(item.course_offering_id || item.courseOfferingId || item.course_id || item.courseId || "").trim();
    },
    reviewCourseLabel(item) {
      return this.resolveReviewCourseLabel(item);
    },
    scoreIndex(key) {
      const value = Number(this.scores[key] || 1);
      return Math.max(0, Math.min(4, value - 1));
    },
    changeScore(key, event) {
      this.scores = {
        ...this.scores,
        [key]: Number(event.detail.value) + 1
      };
    },
    filterEvaluableCourses(courses) {
      if (this.session.role !== "student") return courses;
      return courses.filter(course => this.canEvaluateCourse(course));
    },
    canEvaluateCourse(course) {
      return Boolean(course && (course.completed === true || course.enrollmentStatus === "completed"));
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
    formatScore(value) {
      const numberValue = Number(value || 0);
      return numberValue ? numberValue.toFixed(1) : "0.0";
    },
    reviewGroupKey(item) {
      return [
        item.teacher_id || item.teacherId || "",
        item.course_offering_id || item.courseOfferingId || item.course_id || item.courseId || ""
      ].join("-");
    },
    reviewGroupTitle(item) {
      const teacher = item.teacher_name || item.teacherName || "Unassigned Teacher";
      const course = this.resolveReviewCourseLabel(item);
      return teacher + " - " + course;
    },
    resolveReviewCourseLabel(item) {
      const courseId = String(item.course_id || item.courseId || "").trim();
      const offeringId = String(item.course_offering_id || item.courseOfferingId || "").trim();
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
      const storedLabel = item.course_name || item.courseName || "";
      if (dashboardLabel) return dashboardLabel;
      if (this.isDisplayCourseName(storedLabel, courseId, offeringId)) return storedLabel;
      return courseId || offeringId || "Unnamed Course";
    },
    isDisplayCourseName(value, ...ids) {
      const text = String(value || "").trim();
      if (!text) return false;
      if (ids.some(id => String(id || "").trim() === text)) return false;
      return !/^[a-f0-9]{20,}$/i.test(text);
    },
    reviewAverage(item) {
      const value =
        item.average_rating ||
        item.averageRating ||
        item.average ||
        (item.average_scores && item.average_scores.overall) ||
        (item.averageScores && item.averageScores.overall) ||
        0;
      return Number(value || 0).toFixed(1);
    },
    openReviewGroup(item) {
      const teacherId = encodeURIComponent(item.teacher_id || item.teacherId || "");
      const courseOfferingId = encodeURIComponent(item.course_offering_id || item.courseOfferingId || "");
      uni.navigateTo({ url: `/pages/evaluation/details?teacherId=${teacherId}&courseOfferingId=${courseOfferingId}` });
    },
    backHome() {
      uni.reLaunch({ url: dashboardUrl(this.session.role) });
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
  overflow-wrap: anywhere;
}

.score-picker {
  text-align: center;
  font-weight: 600;
  color: #0f172a;
}

.score-grid,
.dimension-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx;
}

.filter-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 16rpx;
  align-items: end;
  margin-top: 18rpx;
  margin-bottom: 18rpx;
}

.filter-reset-btn {
  min-width: 180rpx;
}

.dimension-grid {
  margin-top: 16rpx;
}

.dimension-cell {
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
}

.dimension-label {
  color: #475569;
  font-size: 24rpx;
  font-weight: 600;
}

.dimension-value {
  color: #0f172a;
  font-size: 30rpx;
  font-weight: 700;
  white-space: nowrap;
}

.summary-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.summary-title-block {
  min-width: 0;
}

.review-title {
  display: block;
  color: #0f172a;
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.review-meta {
  display: block;
  margin-top: 8rpx;
  color: #64748b;
  font-size: 24rpx;
  line-height: 1.4;
}

.full-btn {
  width: 100%;
}

.empty-note {
  padding-top: 12rpx;
}

.comment {
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #e2e8f0;
}

.review-link-card {
  cursor: pointer;
}

.detail-btn {
  margin-top: 16rpx;
}

.top-actions {
  margin-top: 0;
}

@media (max-width: 700px) {
  .filter-grid {
    grid-template-columns: 1fr;
  }
}
</style>
