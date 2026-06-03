<template>
  <view class="page">
    <view class="section">
      <view class="row">
        <view>
          <text class="section-title">{{
            selectedCourse ? formatCourseLabel(selectedCourse) : "Course Materials"
          }}</text>
          <text class="muted">{{
            selectedCourse ? "Course materials and timeline" : session.displayName + " - " + session.role
          }}</text>
        </view>
        <view class="btn-row top-actions">
          <button class="secondary-btn" :loading="loading" @click="refresh">Refresh</button>
          <button class="secondary-btn" @click="backHome">Home</button>
        </view>
      </view>
    </view>

    <view v-if="session.role !== 'student'" class="section">
      <text class="section-title">{{ form.materialId ? "Edit Material" : "Add Material" }}</text>

      <template v-if="!courses.length">
        <text class="muted">No manageable courses available.</text>
      </template>

      <template v-else>
        <view class="field">
          <text class="label">Course</text>
          <picker
            :range="courseLabels"
            :value="courseIndex"
            :disabled="Boolean(routeCourseOfferingId)"
            @change="changeCourse"
          >
            <view class="picker-value">{{ selectedCourseLabel }}</view>
          </picker>
        </view>

        <view class="field">
          <text class="label">Title</text>
          <input v-model="form.title" placeholder="Material title" />
        </view>

        <view class="field">
          <text class="label">File</text>
          <view class="file-picker">
            <view class="file-picker-main">
              <text class="file-name">{{ form.fileName || fileNameFromUrl(form.fileUrl) || "No file selected" }}</text>
              <text class="muted">{{
                form.fileSize
                  ? formatFileSize(form.fileSize)
                  : form.fileUrl
                    ? "Uploaded to UniCloud cloud storage"
                    : "Choose a local file from this computer."
              }}</text>
            </view>
            <button class="secondary-btn file-picker-btn" :loading="uploadingFile" @click="chooseMaterialFile">
              {{ form.fileUrl ? "Replace File" : "Choose File" }}
            </button>
          </view>
        </view>

        <view class="field">
          <text class="label">Available Date</text>
          <picker mode="date" :value="form.availableDate" @change="form.availableDate = $event.detail.value">
            <view class="picker-value">{{ form.availableDate }}</view>
          </picker>
        </view>

        <view class="field">
          <text class="label">Available Time</text>
          <input v-model="form.availableTime" placeholder="10:00" />
        </view>

        <view class="switch-row">
          <view>
            <text class="label">Visible to Students</text>
            <text class="muted">Controls whether students can read this material later.</text>
          </view>
          <switch :checked="form.isPublicToStudents" @change="togglePublic" />
        </view>

        <view class="btn-row">
          <button class="primary-btn" :loading="saving" @click="saveMaterial">
            {{ form.materialId ? "Update" : "Create" }}
          </button>
          <button v-if="form.materialId" class="secondary-btn" @click="resetForm">Cancel Edit</button>
        </view>
      </template>
    </view>

    <view class="section">
      <text class="section-title">{{ selectedCourse ? "Materials" : "Uploaded Materials" }}</text>
      <template v-if="!visibleMaterials.length">
        <text class="muted">No course materials yet.</text>
      </template>

      <view v-for="item in visibleMaterials" :key="item._id" class="card material-card">
        <view class="material-file-icon">
          <text>{{ fileExtensionLabel(item) }}</text>
        </view>
        <view class="material-content">
          <text class="material-title">{{ item.title }}</text>
          <text class="material-course">{{ item.courseName || "Course not found" }}</text>
          <view class="material-meta">
            <text>{{ item.fileName || fileNameFromUrl(item.fileUrl) || "Course material" }}</text>
            <text v-if="session.role !== 'student'">{{ item.isPublicToStudents ? "Public" : "Private" }}</text>
            <text v-if="formatTimeline(item.timelineAt)">{{ formatTimeline(item.timelineAt) }}</text>
          </view>
          <text v-if="session.role !== 'student' && (item.fileId || item.fileUrl)" class="link-text">{{
            item.fileId || item.fileUrl
          }}</text>
        </view>
        <view class="material-actions">
          <button class="primary-btn" :loading="downloadingMaterialId === item._id" @click="downloadMaterial(item)">
            Download
          </button>
          <button v-if="session.role !== 'student'" class="secondary-btn" @click="editMaterial(item)">Edit</button>
        </view>
      </view>
    </view>

    <view v-if="session.role === 'student'" class="section">
      <text class="section-title">Course Timeline</text>
      <template v-if="!visibleTimeline.length">
        <text class="muted">No scheduled sessions yet.</text>
      </template>
      <view class="timeline-list">
        <view v-for="item in visibleTimeline" :key="item._id" class="timeline-card">
          <view class="timeline-marker">
            <text>{{ item.sequenceNo || "-" }}</text>
          </view>
          <view class="timeline-body">
            <view class="timeline-head">
              <text class="timeline-title">{{ item.courseName }}</text>
              <text class="timeline-date">{{ item.sessionDate }}</text>
            </view>
            <text class="timeline-time">{{ formatSessionTime(item) }}</text>
            <view v-if="materialsForSession(item).length" class="timeline-material-list">
              <view v-for="material in materialsForSession(item)" :key="material._id" class="timeline-material">
                <text class="timeline-material-title">{{ material.title }}</text>
                <text class="timeline-material-type">{{ material.fileType || "link" }}</text>
              </view>
            </view>
            <text v-else class="timeline-empty">No materials for this session.</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { callAiemsFunction } from "../../common/api.js";
import { dashboardUrl, getSession, requireRole } from "../../common/session.js";

export default {
  data() {
    return {
      session: {},
      courses: [],
      materials: [],
      timeline: [],
      routeCourseOfferingId: "",
      courseIndex: 0,
      loading: false,
      saving: false,
      uploadingFile: false,
      downloadingMaterialId: "",
      lastLoadedAt: 0,
      loadTtlMs: 30000,
      form: {
        materialId: "",
        title: "",
        fileUrl: "",
        fileName: "",
        fileSize: 0,
        fileType: "",
        availableDate: new Date().toISOString().slice(0, 10),
        availableTime: "10:00",
        isPublicToStudents: true
      }
    };
  },
  computed: {
    visibleCourses() {
      if (!this.routeCourseOfferingId) return this.courses;
      return this.courses.filter(item => item.courseOfferingId === this.routeCourseOfferingId);
    },
    courseLabels() {
      return this.visibleCourses.map(item => this.formatCourseLabel(item));
    },
    selectedCourseLabel() {
      return this.courseLabels[this.courseIndex] || "No courses available";
    },
    selectedCourse() {
      return this.visibleCourses[this.courseIndex] || null;
    },
    selectedCourseOfferingId() {
      if (this.routeCourseOfferingId) return this.routeCourseOfferingId;
      const course = this.selectedCourse;
      return course ? course.courseOfferingId : "";
    },
    visibleMaterials() {
      if (!this.selectedCourseOfferingId) return this.materials;
      return this.materials.filter(item => item.courseOfferingId === this.selectedCourseOfferingId);
    },
    visibleTimeline() {
      if (!this.selectedCourseOfferingId) return this.timeline;
      return this.timeline.filter(item => item.courseOfferingId === this.selectedCourseOfferingId);
    }
  },
  onLoad(options = {}) {
    this.routeCourseOfferingId = String(options.courseOfferingId || options.course_offering_id || "").trim();
  },
  onShow() {
    const session = requireRole(["student", "teacher", "admin"]);
    if (!session) return;
    this.session = session;
    const now = Date.now();
    if (!this.materials.length || now - this.lastLoadedAt > this.loadTtlMs) {
      this.load();
    }
  },
  methods: {
    emptyForm() {
      return {
        materialId: "",
        title: "",
        fileUrl: "",
        fileName: "",
        fileSize: 0,
        fileType: "",
        availableDate: new Date().toISOString().slice(0, 10),
        availableTime: "10:00",
        isPublicToStudents: true
      };
    },
    async load(forceRefresh = false) {
      this.loading = true;
      const result = await callAiemsFunction("get-course-materials", {
        session: getSession(),
        forceRefresh
      });
      this.loading = false;
      if (!result.ok) {
        uni.showToast({ title: result.message || "Failed to load materials.", icon: "none" });
        return;
      }

      this.courses = result.data.courses || [];
      this.materials = result.data.materials || [];
      this.timeline = result.data.timeline || [];
      this.lastLoadedAt = Date.now();
      const matchedIndex = this.routeCourseOfferingId
        ? this.visibleCourses.findIndex(course => course.courseOfferingId === this.routeCourseOfferingId)
        : -1;
      if (matchedIndex >= 0) {
        this.courseIndex = matchedIndex;
      } else if (this.courseIndex >= this.visibleCourses.length) {
        this.courseIndex = 0;
      }
    },
    refresh() {
      this.load(true);
    },
    async saveMaterial() {
      const title = this.form.title.trim();
      const fileUrl = this.form.fileUrl.trim();
      if (this.uploadingFile) {
        uni.showToast({ title: "File is still uploading.", icon: "none" });
        return;
      }
      if (!this.selectedCourseOfferingId || !title || !fileUrl) {
        uni.showToast({ title: "Course, title and uploaded file are required.", icon: "none" });
        return;
      }

      this.saving = true;
      const result = await callAiemsFunction("save-course-material", {
        session: getSession(),
        materialId: this.form.materialId,
        courseOfferingId: this.selectedCourseOfferingId,
        title,
        fileUrl,
        fileId: fileUrl,
        fileName: this.form.fileName.trim() || this.fileNameFromUrl(fileUrl),
        fileSize: Number(this.form.fileSize || 0),
        fileType: this.form.fileType || this.inferFileType(this.form.fileName || fileUrl),
        isPublicToStudents: this.form.isPublicToStudents,
        availableAt: this.buildAvailableAt()
      });
      this.saving = false;

      if (result.ok) {
        uni.showToast({ title: this.form.materialId ? "Updated" : "Created", icon: "success" });
        this.resetForm();
        this.load(true);
        return;
      }

      uni.showToast({ title: result.message || "Save failed.", icon: "none" });
    },
    editMaterial(item) {
      const courseIndex = this.visibleCourses.findIndex(course => course.courseOfferingId === item.courseOfferingId);
      this.courseIndex = courseIndex >= 0 ? courseIndex : 0;
      this.form = {
        materialId: item._id,
        title: item.title || "",
        fileUrl: item.fileUrl || "",
        fileName: item.fileName || this.fileNameFromUrl(item.fileUrl),
        fileSize: Number(item.fileSize || 0),
        fileType: item.fileType || "",
        availableDate: item.timelineAt
          ? new Date(item.timelineAt).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        availableTime: item.timelineAt ? this.formatClock(item.timelineAt) : "10:00",
        isPublicToStudents: item.isPublicToStudents === true
      };
    },
    resetForm() {
      this.form = this.emptyForm();
    },
    changeCourse(event) {
      this.courseIndex = Number(event.detail.value);
    },
    togglePublic(event) {
      this.form.isPublicToStudents = event.detail.value === true;
    },
    async chooseMaterialFile() {
      if (!this.selectedCourseOfferingId) {
        uni.showToast({ title: "Select a course first.", icon: "none" });
        return;
      }
      try {
        const file = await this.chooseLocalFile();
        if (!file || !file.path) return;
        await this.uploadMaterialFile(file);
      } catch (error) {
        if (error && error.cancel) return;
        uni.showToast({ title: (error && error.message) || "File selection failed.", icon: "none" });
      }
    },
    chooseLocalFile() {
      return new Promise((resolve, reject) => {
        const onSuccess = res => {
          const file = (res.tempFiles && res.tempFiles[0]) || {};
          const path = file.path || file.tempFilePath || (res.tempFilePaths && res.tempFilePaths[0]) || "";
          resolve({
            path,
            name: file.name || this.fileNameFromUrl(path) || "material",
            size: Number(file.size || 0)
          });
        };
        const onFail = error =>
          reject(error && error.errMsg && error.errMsg.includes("cancel") ? { cancel: true } : error);
        if (typeof uni.chooseFile === "function") {
          uni.chooseFile({ count: 1, success: onSuccess, fail: onFail });
          return;
        }
        if (typeof uni.chooseImage === "function") {
          uni.chooseImage({ count: 1, success: onSuccess, fail: onFail });
          return;
        }
        reject(new Error("Local file picker is unavailable in this runtime."));
      });
    },
    async uploadMaterialFile(file) {
      if (typeof uniCloud === "undefined" || typeof uniCloud.uploadFile !== "function") {
        uni.showToast({ title: "UniCloud upload is unavailable. Use HBuilderX cloud runtime.", icon: "none" });
        return;
      }
      this.uploadingFile = true;
      try {
        const safeName = this.sanitizeCloudFileName(file.name);
        const cloudPath = `course-materials/${this.selectedCourseOfferingId}/${Date.now()}-${safeName}`;
        const result = await uniCloud.uploadFile({
          filePath: file.path,
          cloudPath
        });
        const fileUrl = result.fileID || result.fileId || result.fileUrl || result.tempFileURL || "";
        if (!fileUrl) {
          throw new Error("UniCloud did not return a file id.");
        }
        this.form = {
          ...this.form,
          fileUrl,
          fileName: file.name || safeName,
          fileSize: Number(file.size || 0),
          fileType: this.inferFileType(file.name || safeName)
        };
        uni.showToast({ title: "Uploaded", icon: "success" });
      } catch (error) {
        uni.showToast({ title: (error && error.message) || "Upload failed.", icon: "none" });
      }
      this.uploadingFile = false;
    },
    buildAvailableAt() {
      const timestamp = Date.parse(`${this.form.availableDate}T${this.form.availableTime || "00:00"}:00`);
      return Number.isFinite(timestamp) ? timestamp : 0;
    },
    materialsForSession(session) {
      const start = Number(session.sessionStartAt || 0);
      const end = Number(session.sessionEndAt || 0);
      return this.materials.filter(
        item =>
          item.courseOfferingId === session.courseOfferingId &&
          Number(item.timelineAt || 0) >= start &&
          (!end || Number(item.timelineAt || 0) <= end)
      );
    },
    formatTimeline(value) {
      const timestamp = Number(value || 0);
      return timestamp ? new Date(timestamp).toISOString().slice(0, 16).replace("T", " ") : "";
    },
    formatSessionTime(item) {
      return ["Session " + (item.sequenceNo || "-"), [item.startTime, item.endTime].filter(Boolean).join("-")]
        .filter(Boolean)
        .join(" - ");
    },
    formatClock(value) {
      const date = new Date(Number(value || 0));
      return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    },
    async downloadMaterial(item) {
      if (!item || this.downloadingMaterialId) return;
      this.downloadingMaterialId = item._id;
      try {
        const url = await this.resolveDownloadUrl(item);
        if (!url) {
          throw new Error("Download file was not found.");
        }
        await this.openDownloadUrl(url, item.fileName || this.fileNameFromUrl(url) || item.title || "material");
      } catch (error) {
        uni.showToast({ title: (error && error.message) || "Download failed.", icon: "none" });
      }
      this.downloadingMaterialId = "";
    },
    async resolveDownloadUrl(item) {
      const value = String(item.fileId || item.fileUrl || "").trim();
      if (!value) return "";
      if (
        /^cloud:\/\//i.test(value) &&
        typeof uniCloud !== "undefined" &&
        typeof uniCloud.getTempFileURL === "function"
      ) {
        const result = await uniCloud.getTempFileURL({ fileList: [value] });
        const file = (result && result.fileList && result.fileList[0]) || {};
        return file.tempFileURL || file.download_url || file.url || value;
      }
      return value;
    },
    openDownloadUrl(url, fileName) {
      return new Promise((resolve, reject) => {
        if (typeof window !== "undefined" && /^https?:\/\//i.test(url)) {
          const link = document.createElement("a");
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener";
          link.download = fileName || "";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          uni.showToast({ title: "Download started", icon: "success" });
          resolve();
          return;
        }
        if (typeof uni.downloadFile !== "function") {
          reject(new Error("Download is unavailable in this runtime."));
          return;
        }
        uni.downloadFile({
          url,
          success: res => {
            if (res.statusCode && res.statusCode !== 200) {
              reject(new Error("Download failed."));
              return;
            }
            if (typeof uni.openDocument === "function" && res.tempFilePath) {
              uni.openDocument({
                filePath: res.tempFilePath,
                showMenu: true,
                success: () => resolve(),
                fail: () => resolve()
              });
              return;
            }
            uni.showToast({ title: "Downloaded", icon: "success" });
            resolve();
          },
          fail: reject
        });
      });
    },
    formatCourseLabel(course) {
      return [course.code, course.name, course.sectionNo].filter(Boolean).join(" ").trim() || "Unnamed course";
    },
    fileNameFromUrl(value) {
      const text = String(value || "");
      return decodeURIComponent(text.split("?")[0].split("/").filter(Boolean).pop() || "");
    },
    formatFileSize(value) {
      const size = Number(value || 0);
      if (!size) return "";
      if (size < 1024) return size + " B";
      if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
      return (size / 1024 / 1024).toFixed(1) + " MB";
    },
    fileExtensionLabel(item) {
      const fileName = (item && (item.fileName || this.fileNameFromUrl(item.fileUrl))) || "";
      const ext = String(fileName || (item && item.fileType) || "file")
        .split("?")[0]
        .split(".")
        .pop()
        .toUpperCase();
      return ext && ext.length <= 5 ? ext : "FILE";
    },
    sanitizeCloudFileName(value) {
      const fallback = "material";
      const name = String(value || fallback).trim();
      const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "");
      return sanitized || fallback;
    },
    inferFileType(value) {
      const ext = String(value || "")
        .split("?")[0]
        .split(".")
        .pop()
        .toLowerCase();
      if (["pdf", "doc", "docx", "xls", "xlsx", "txt"].includes(ext)) return "document";
      if (["ppt", "pptx"].includes(ext)) return "slide";
      if (["mp4", "mov", "avi", "mkv"].includes(ext)) return "video";
      if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
      return "file";
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
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 22rpx;
}

.file-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 10rpx;
  padding: 16px;
  background: #f9fafb;
  border: 1px solid transparent;
  border-radius: 12px;
  box-sizing: border-box;
}

.file-picker-main {
  min-width: 0;
  flex: 1;
}

.file-name {
  display: block;
  color: #0f172a;
  font-size: 28rpx;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.file-picker-btn {
  flex: 0 0 280rpx;
  min-width: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.material-card {
  display: grid;
  grid-template-columns: 76rpx minmax(0, 1fr) auto;
  align-items: center;
  gap: 18rpx;
  padding: 20px;
  background: #ffffff;
  border: 0;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
}

.material-file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 76rpx;
  height: 76rpx;
  border-radius: 8rpx;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1;
}

.material-content {
  min-width: 0;
}

.material-title {
  display: block;
  color: #0f172a;
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.material-course {
  display: block;
  margin-top: 6rpx;
  color: #475569;
  font-size: 24rpx;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.material-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx 14rpx;
  margin-top: 10rpx;
  color: #64748b;
  font-size: 23rpx;
  line-height: 1.4;
}

.material-meta text {
  display: inline-flex;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.material-actions {
  display: flex;
  gap: 12rpx;
  align-items: center;
  justify-content: flex-end;
}

.material-actions button {
  min-width: 86px;
  margin: 0;
}

.link-text {
  display: block;
  margin-top: 10rpx;
  color: #2563eb;
  font-size: 24rpx;
  line-height: 1.5;
  word-break: break-all;
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.primary-btn,
.secondary-btn {
  min-width: 92px;
  margin: 0;
}

.top-actions {
  margin-top: 0;
}

.timeline-list {
  display: grid;
  gap: 14rpx;
}

.timeline-card {
  display: flex;
  gap: 18rpx;
  padding: 18rpx;
  background: #ffffff;
  border: 0;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
  box-sizing: border-box;
}

.timeline-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 56rpx;
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: #2563eb;
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1;
}

.timeline-body {
  min-width: 0;
  flex: 1;
}

.timeline-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
}

.timeline-title {
  display: block;
  min-width: 0;
  color: #0f172a;
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.timeline-date {
  flex-shrink: 0;
  color: #475569;
  font-size: 24rpx;
  line-height: 1.5;
}

.timeline-time {
  display: block;
  margin-top: 4rpx;
  color: #64748b;
  font-size: 24rpx;
  line-height: 1.5;
}

.timeline-material-list {
  display: grid;
  gap: 10rpx;
  margin-top: 14rpx;
}

.timeline-material {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 12px 14px;
  background: #f9fafb;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}

.timeline-material-title {
  min-width: 0;
  color: #1d4ed8;
  font-size: 24rpx;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.timeline-material-type {
  flex-shrink: 0;
  color: #64748b;
  font-size: 22rpx;
  line-height: 1.4;
}

.timeline-empty {
  display: block;
  margin-top: 12rpx;
  color: #94a3b8;
  font-size: 24rpx;
  line-height: 1.5;
}

@media (max-width: 700px) {
  .timeline-card {
    gap: 14rpx;
    padding: 16rpx;
  }

  .timeline-head,
  .timeline-material,
  .material-card,
  .material-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .material-card {
    display: flex;
  }

  .material-file-icon {
    width: 64rpx;
    height: 64rpx;
  }

  .timeline-date,
  .timeline-material-type {
    flex-shrink: 1;
  }
}
</style>
