<template>
  <view class="page">
    <PageHeader title="Admin Management" :displayName="session.displayName" :username="session.username">
      <button class="secondary-btn refresh-btn" :loading="loading" @click="refresh">Refresh</button>
    </PageHeader>

    <NavTabs :role="session.role" current="management" />

    <view class="section">
      <view class="section-head">
        <view>
          <text class="section-title">Create Account</text>
          <text class="muted">Account and role profile are saved together.</text>
        </view>
      </view>

      <view class="form-grid">
        <view class="field">
          <text class="label">Username</text>
          <input v-model="accountForm.username" placeholder="s2026001" />
        </view>
        <view class="field">
          <text class="label">Initial Password</text>
          <input v-model="accountForm.password" password placeholder="Set initial password" />
        </view>
        <view class="field">
          <text class="label">Role</text>
          <picker :range="accountRoleLabels" :value="accountRoleIndex" @change="changeAccountRole">
            <view class="picker-value">{{ accountRoleLabels[accountRoleIndex] }}</view>
          </picker>
        </view>
        <view class="field">
          <text class="label">Name</text>
          <input v-model="accountForm.displayName" placeholder="Display name" />
        </view>
        <view v-if="accountForm.roleCode === 'student'" class="field">
          <text class="label">Student No.</text>
          <input v-model="accountForm.studentNo" placeholder="S2026001" />
        </view>
        <view v-if="accountForm.roleCode === 'teacher'" class="field">
          <text class="label">Teacher No.</text>
          <input v-model="accountForm.teacherNo" placeholder="T1003" />
        </view>
        <view class="field">
          <text class="label">Email</text>
          <input v-model="accountForm.email" placeholder="student@ai-ems.test" />
        </view>
        <view class="field">
          <text class="label">Phone</text>
          <input v-model="accountForm.phone" placeholder="13700000000" />
        </view>
        <view v-if="accountForm.roleCode === 'student'" class="field">
          <text class="label">Major</text>
          <picker :range="optionLabels.majors" :value="majorIndex" @change="majorIndex = Number($event.detail.value)">
            <view class="picker-value">{{ optionLabels.majors[majorIndex] || 'Select major' }}</view>
          </picker>
        </view>
        <view v-if="accountForm.roleCode === 'student'" class="field">
          <text class="label">Enrollment Year</text>
          <input v-model="accountForm.enrollmentYear" type="number" placeholder="2026" />
        </view>
        <view v-if="accountForm.roleCode === 'teacher'" class="field">
          <text class="label">Department</text>
          <picker :range="optionLabels.departments" :value="teacherDepartmentIndex"
            @change="teacherDepartmentIndex = Number($event.detail.value)">
            <view class="picker-value">{{ optionLabels.departments[teacherDepartmentIndex] || 'Select department' }}
            </view>
          </picker>
        </view>
        <view v-if="accountForm.roleCode === 'teacher'" class="field">
          <text class="label">Title</text>
          <input v-model="accountForm.title" placeholder="Lecturer" />
        </view>
        <view v-if="accountForm.roleCode === 'teacher'" class="field">
          <text class="label">Office</text>
          <input v-model="accountForm.office" placeholder="Teaching Building 3-503" />
        </view>
      </view>
      <button class="primary-btn full-btn" :loading="savingAccount"
        @click="saveAccount">{{ accountSubmitLabel }}</button>
    </view>

    <view class="section">
      <text class="section-title">Publish Course to Cohort</text>
      <view class="form-grid">
        <view class="field">
          <text class="label">Course Code</text>
          <input v-model="courseForm.courseCode" placeholder="JC3506" />
        </view>
        <view class="field">
          <text class="label">Course Name</text>
          <input v-model="courseForm.courseName" placeholder="Software Design" />
        </view>
        <view class="field">
          <text class="label">Credits</text>
          <input v-model="courseForm.credits" type="number" placeholder="15" />
        </view>
        <view class="field">
          <text class="label">Capacity</text>
          <input v-model="courseForm.capacity" type="number" placeholder="50" />
        </view>
        <view class="field">
          <text class="label">Target Major</text>
          <picker :range="optionLabels.majors" :value="courseMajorIndex"
            @change="courseMajorIndex = Number($event.detail.value)">
            <view class="picker-value">{{ optionLabels.majors[courseMajorIndex] || 'Select major' }}</view>
          </picker>
        </view>
        <view class="field">
          <text class="label">Cohort Year</text>
          <input v-model="courseForm.gradeYear" type="number" placeholder="2026" />
        </view>
        <view class="field">
          <text class="label">Start Date</text>
          <picker mode="date" :value="courseForm.startDate" @change="courseForm.startDate = $event.detail.value">
            <view class="picker-value">{{ courseForm.startDate }}</view>
          </picker>
        </view>
        <view class="field">
          <text class="label">End Date</text>
          <picker mode="date" :value="courseForm.endDate" @change="courseForm.endDate = $event.detail.value">
            <view class="picker-value">{{ courseForm.endDate }}</view>
          </picker>
        </view>
        <view class="field">
          <text class="label">Total Sessions</text>
          <input v-model="courseForm.totalSessions" type="number" placeholder="16" />
        </view>
        <view class="field">
          <text class="label">Weekly Sessions</text>
          <view class="readonly-value">{{ weeklySessionCount }}</view>
        </view>
        <view class="field">
          <text class="label">Available Sessions</text>
          <view class="readonly-value" :class="{ 'readonly-error': availableSessionCount < Number(courseForm.totalSessions || 0) }">
            {{ availableSessionCount }}
          </view>
          <text class="field-hint" :class="{ 'field-hint-error': availableSessionCount < Number(courseForm.totalSessions || 0) }">
            {{ sessionCapacityMessage }}
          </text>
        </view>
        <view class="field">
          <text class="label">Section</text>
          <input v-model="courseForm.sectionNo" placeholder="01" />
        </view>
      </view>

      <view class="field">
        <view class="label-row">
          <text class="label">Schedule Slots</text>
          <button class="secondary-btn slot-action-btn" @click="addScheduleSlot">Add Slot</button>
        </view>
        <view class="slot-list">
          <view v-for="(slot, index) in courseForm.scheduleSlots" :key="slot.localId" class="slot-row">
            <view class="slot-field">
              <text class="label">Weekday</text>
              <picker :range="weekdayLabels" :value="slot.weekday - 1" @change="changeSlotWeekday(index, $event)">
                <view class="picker-value">{{ weekdayLabels[slot.weekday - 1] || 'Mon' }}</view>
              </picker>
            </view>
            <view class="slot-field">
              <text class="label">Start</text>
              <picker mode="time" :value="slot.startTime" @change="slot.startTime = $event.detail.value">
                <view class="picker-value">{{ slot.startTime || 'Start' }}</view>
              </picker>
            </view>
            <view class="slot-field">
              <text class="label">End</text>
              <picker mode="time" :value="slot.endTime" @change="slot.endTime = $event.detail.value">
                <view class="picker-value">{{ slot.endTime || 'End' }}</view>
              </picker>
            </view>
            <view class="slot-field slot-classroom">
              <text class="label">Classroom</text>
              <picker :range="optionLabels.classrooms" :value="classroomIndexForSlot(slot)"
                @change="changeSlotClassroom(index, $event)">
                <view class="picker-value">{{ classroomLabel(slot.classroomId) }}</view>
              </picker>
            </view>
            <button class="secondary-btn slot-remove-btn" :disabled="courseForm.scheduleSlots.length <= 1"
              @click="removeScheduleSlot(index)">Remove</button>
          </view>
        </view>
      </view>

      <view class="field">
        <text class="label">Assigned Teachers</text>
        <view v-if="options.teachers.length" class="teacher-list">
          <view v-for="teacher in options.teachers" :key="teacher.value" class="teacher-option"
            :class="{ selected: courseForm.teacherIds.includes(teacher.value) }" @click="toggleTeacher(teacher.value)">
            <text class="teacher-check">{{ courseForm.teacherIds.includes(teacher.value) ? 'OK' : '+' }}</text>
            <view class="teacher-copy">
              <text class="teacher-name">{{ teacher.label }}</text>
              <text v-if="teacher.subtitle" class="teacher-meta">{{ teacher.subtitle }}</text>
            </view>
          </view>
        </view>
        <text v-else class="empty-hint">No teachers available. Create a teacher account first.</text>
      </view>

      <button class="primary-btn form-submit-btn" :loading="savingCourse" @click="saveCourse">Publish Course</button>
    </view>

    <view class="section">
      <view class="section-head">
        <view>
          <text class="section-title">Cohort Timetable</text>
          <text class="muted">Filtered by target major and cohort year.</text>
        </view>
      </view>
      <view class="timetable-filters">
        <view class="field">
          <text class="label">Major</text>
          <picker :range="optionLabels.majors" :value="timetableMajorIndex"
            @change="timetableMajorIndex = Number($event.detail.value)">
            <view class="picker-value">{{ optionLabels.majors[timetableMajorIndex] || 'Select major' }}</view>
          </picker>
        </view>
        <view class="field">
          <text class="label">Cohort Year</text>
          <input v-model="timetableYear" type="number" placeholder="2026" />
        </view>
      </view>
      <view class="timetable-grid">
        <view v-for="day in timetableWeekColumns" :key="day.weekday" class="timetable-day">
          <text class="timetable-day-title">{{ day.label }}</text>
          <view v-if="!day.sessions.length" class="timetable-empty">No sessions</view>
          <view v-for="sessionItem in day.sessions" :key="sessionItem._id" class="timetable-session"
            :class="{ conflict: sessionItem.hasConflict }">
            <text class="timetable-time">{{ sessionItem.startTime }}-{{ sessionItem.endTime }}</text>
            <text class="timetable-course">{{ sessionItem.courseName }}</text>
            <text class="timetable-meta">{{ sessionItem.classroomName }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="section">
      <text class="section-title">Published Courses</text>
      <DataCard v-for="course in courses" :key="course.courseOfferingId"
        :title="[course.courseCode, course.courseName].filter(Boolean).join(' ')" :subtitle="courseSummary(course)">
        <view class="course-actions">
          <button class="mini-btn danger" :loading="deletingCourseId === course.courseOfferingId"
            @click="deleteCourse(course)">Delete</button>
        </view>
      </DataCard>
    </view>

    <view class="section">
      <text class="section-title">Recent Accounts</text>
      <DataCard v-for="account in accounts.slice(0, 8)" :key="account._id"
        :title="account.displayName || account.username"
        :subtitle="[account.username, account.primaryRole, account.status].filter(Boolean).join(' - ')">
        <view class="account-actions">
          <button class="mini-btn" @click="resetAccountPassword(account)">Reset Password</button>
          <button class="mini-btn danger" :disabled="!canDeleteAccount(account)"
            @click="deleteAccount(account)">Delete</button>
        </view>
      </DataCard>
    </view>
  </view>
</template>

<script>
  import PageHeader from '../../components/PageHeader.vue'
  import NavTabs from '../../components/NavTabs.vue'
  import DataCard from '../../components/DataCard.vue'
  import {
    callAiemsFunction
  } from '../../common/api.js'
  import {
    getSession,
    requireRole
  } from '../../common/session.js'

  export default {
    components: {
      PageHeader,
      NavTabs,
      DataCard
    },
    data() {
      return {
        session: {},
        loading: false,
        savingAccount: false,
        savingCourse: false,
        deletingCourseId: '',
        accounts: [],
        courses: [],
        classSessions: [],
        options: {
          departments: [],
          majors: [],
          semesters: [],
          trainingPlans: [],
          teachers: [],
          classrooms: []
        },
        accountRoleOptions: [{
            value: 'student',
            label: 'Student'
          },
          {
            value: 'teacher',
            label: 'Teacher'
          }
        ],
        accountRoleIndex: 0,
        majorIndex: 0,
        teacherDepartmentIndex: 0,
        courseMajorIndex: 0,
        timetableMajorIndex: 0,
        timetableYear: '2026',
        weekdayLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        accountForm: {
          roleCode: 'student',
          username: '',
          password: '',
          displayName: '',
          studentNo: '',
          teacherNo: '',
          email: '',
          phone: '',
          enrollmentYear: '2026',
          title: '',
          office: ''
        },
        courseForm: {
          courseCode: '',
          courseName: '',
          credits: '15',
          capacity: '50',
          gradeYear: '2026',
          sectionNo: '01',
          startDate: this.formatLocalDate(new Date()),
          endDate: this.formatLocalDate(new Date(Date.now() + 12 * 7 * 24 * 60 * 60 * 1000)),
          totalSessions: '16',
          scheduleSlots: [],
          teacherIds: []
        }
      }
    },
    computed: {
      optionLabels() {
        const labels = {}
        Object.keys(this.options).forEach(key => {
          labels[key] = (this.options[key] || []).map(item => item.label || item.value)
        })
        return labels
      },
      accountRoleLabels() {
        return this.accountRoleOptions.map(item => item.label)
      },
      accountSubmitLabel() {
        return 'Create Student/Teacher'
      },
      weeklySessionCount() {
        return this.courseForm.scheduleSlots.length
      },
      availableSessionCount() {
        return this.countAvailableSessions(this.courseForm.startDate, this.courseForm.endDate, this.normalizeScheduleSlots())
      },
      sessionCapacityMessage() {
        const totalSessions = Number(this.courseForm.totalSessions || 0)
        if (!this.courseForm.startDate || !this.courseForm.endDate || !this.courseForm.scheduleSlots.length) {
          return 'Set dates and schedule slots first.'
        }
        if (this.availableSessionCount < totalSessions) {
          return `Date range can only generate ${this.availableSessionCount} session(s).`
        }
        if (this.availableSessionCount > totalSessions) {
          return `The system will create the first ${totalSessions} of ${this.availableSessionCount} possible session(s).`
        }
        return 'Date range exactly matches total sessions.'
      },
      filteredTimetableSessions() {
        const majorId = this.optionValue('majors', this.timetableMajorIndex)
        const gradeYear = Number(this.timetableYear || 0)
        const rows = this.groupTimetableSessions((this.classSessions || []).filter(item =>
          (!majorId || item.majorId === majorId) &&
          (!gradeYear || Number(item.gradeYear || 0) === gradeYear)
        ))
        return rows.map(item => ({
          ...item,
          hasConflict: this.sessionHasConflict(item, rows)
        }))
      },
      timetableWeekColumns() {
        return this.weekdayLabels.map((label, index) => {
          const weekday = index + 1
          return {
            weekday,
            label,
            sessions: this.filteredTimetableSessions
              .filter(item => Number(item.weekday || 0) === weekday)
              .sort((left, right) => String(left.startTime || '').localeCompare(String(right.startTime || '')))
          }
        })
      }
    },
    onShow() {
      const session = requireRole(['admin'])
      if (!session) return
      this.session = session
      this.load()
    },
    methods: {
      emptyAccountForm() {
        return {
          roleCode: 'student',
          username: '',
          password: '',
          displayName: '',
          studentNo: '',
          teacherNo: '',
          email: '',
          phone: '',
          enrollmentYear: '2026',
          title: '',
          office: ''
        }
      },
      emptyCourseForm() {
        return {
          courseCode: '',
          courseName: '',
          credits: '15',
          capacity: '50',
          gradeYear: '2026',
          sectionNo: '01',
          startDate: this.formatLocalDate(new Date()),
          endDate: this.formatLocalDate(new Date(Date.now() + 12 * 7 * 24 * 60 * 60 * 1000)),
          totalSessions: '16',
          scheduleSlots: [this.defaultScheduleSlot()],
          teacherIds: []
        }
      },
      async load(forceRefresh = false) {
        this.loading = true
        const result = await callAiemsFunction('get-admin-management-data', {
          session: getSession(),
          forceRefresh
        })
        this.loading = false
        if (!result.ok) {
          uni.showToast({
            title: result.message || 'Failed to load management data.',
            icon: 'none'
          })
          return
        }
        this.accounts = result.data.accounts || []
        this.courses = result.data.courses || []
        this.classSessions = result.data.classSessions || []
        this.options = {
          ...this.options,
          ...(result.data.options || {})
        }
        if (!this.courseForm.scheduleSlots.length) {
          this.courseForm.scheduleSlots = [this.defaultScheduleSlot()]
        }
        this.timetableYear = this.timetableYear || this.courseForm.gradeYear || '2026'
      },
      refresh() {
        this.load(true)
      },
      optionValue(key, index) {
        const option = (this.options[key] || [])[index]
        return option ? option.value : ''
      },
      changeAccountRole(event) {
        this.accountRoleIndex = Number(event.detail.value)
        const role = this.accountRoleOptions[this.accountRoleIndex] || this.accountRoleOptions[0]
        this.accountForm.roleCode = role.value
      },
      async saveAccount() {
        const password = this.accountForm.password.trim()
        const roleCode = this.accountForm.roleCode || 'student'
        if (!this.accountForm.username || !this.accountForm.displayName || !password) {
          uni.showToast({
            title: 'Username, name and password are required.',
            icon: 'none'
          })
          return
        }
        if (roleCode === 'student' && (!this.accountForm.studentNo || !this.optionValue('majors', this.majorIndex) ||
            !this.accountForm.enrollmentYear)) {
          uni.showToast({
            title: 'Student number, major and enrollment year are required.',
            icon: 'none'
          })
          return
        }
        if (roleCode === 'teacher' && (!this.accountForm.teacherNo || !this.optionValue('departments', this
            .teacherDepartmentIndex))) {
          uni.showToast({
            title: 'Teacher number and department are required.',
            icon: 'none'
          })
          return
        }
        const payload = {
          session: getSession(),
          username: this.accountForm.username.trim(),
          password,
          displayName: this.accountForm.displayName.trim(),
          email: this.accountForm.email.trim(),
          phone: this.accountForm.phone.trim(),
          roleCode
        }
        if (roleCode === 'student') {
          payload.studentProfile = {
            studentNo: this.accountForm.studentNo.trim(),
            majorId: this.optionValue('majors', this.majorIndex),
            enrollmentYear: Number(this.accountForm.enrollmentYear || 0)
          }
        } else {
          payload.teacherProfile = {
            teacherNo: this.accountForm.teacherNo.trim(),
            departmentId: this.optionValue('departments', this.teacherDepartmentIndex),
            title: this.accountForm.title.trim(),
            office: this.accountForm.office.trim()
          }
        }
        this.savingAccount = true
        const result = await callAiemsFunction('save-admin-account', payload)
        this.savingAccount = false
        if (result.ok) {
          uni.showToast({
            title: roleCode === 'teacher' ? 'Teacher created' : 'Student created',
            icon: 'success'
          })
          this.accountForm = this.emptyAccountForm()
          this.accountRoleIndex = 0
          this.load(true)
          return
        }
        uni.showToast({
          title: result.message || 'Save failed.',
          icon: 'none'
        })
      },
      canDeleteAccount(account) {
        return account && account._id && account._id !== this.session.userId
      },
      resetAccountPassword(account) {
        if (!account || !account._id) return
        uni.showModal({
          title: 'Reset Password',
          content: '',
          editable: true,
          placeholderText: 'Enter new password',
          success: async (modal) => {
            if (!modal.confirm) return
            const password = String(modal.content || '').trim()
            if (!password) {
              uni.showToast({
                title: 'New password is required.',
                icon: 'none'
              })
              return
            }
            const result = await callAiemsFunction('save-admin-account', {
              session: getSession(),
              userId: account._id,
              roleCode: account.primaryRole,
              password
            })
            if (result.ok) {
              uni.showToast({
                title: 'Password reset',
                icon: 'success'
              })
              this.load(true)
              return
            }
            uni.showToast({
              title: result.message || 'Reset failed.',
              icon: 'none'
            })
          }
        })
      },
      deleteAccount(account) {
        if (!this.canDeleteAccount(account)) {
          uni.showToast({
            title: 'You cannot delete the current admin account.',
            icon: 'none'
          })
          return
        }
        uni.showModal({
          title: 'Delete Account',
          content: `Delete ${account.displayName || account.username}? This cannot be undone.`,
          confirmText: 'Delete',
          success: async (modal) => {
            if (!modal.confirm) return
            const result = await callAiemsFunction('delete-admin-account', {
              session: getSession(),
              userId: account._id
            })
            if (result.ok) {
              uni.showToast({
                title: 'Account deleted',
                icon: 'success'
              })
              this.load(true)
              return
            }
            uni.showToast({
              title: result.message || 'Delete failed.',
              icon: 'none'
            })
          }
        })
      },
      toggleTeacher(teacherId) {
        if (!teacherId) return
        const selected = new Set(this.courseForm.teacherIds)
        if (selected.has(teacherId)) {
          selected.delete(teacherId)
        } else {
          selected.add(teacherId)
        }
        this.courseForm.teacherIds = Array.from(selected)
      },
      defaultScheduleSlot() {
        return {
          localId: `slot_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          weekday: 1,
          startTime: '10:00',
          endTime: '12:00',
          classroomId: this.optionValue('classrooms', 0)
        }
      },
      addScheduleSlot() {
        this.courseForm.scheduleSlots.push(this.defaultScheduleSlot())
      },
      removeScheduleSlot(index) {
        if (this.courseForm.scheduleSlots.length <= 1) return
        this.courseForm.scheduleSlots.splice(index, 1)
      },
      changeSlotWeekday(index, event) {
        const slot = this.courseForm.scheduleSlots[index]
        if (!slot) return
        slot.weekday = Number(event.detail.value) + 1
      },
      changeSlotClassroom(index, event) {
        const slot = this.courseForm.scheduleSlots[index]
        if (!slot) return
        slot.classroomId = this.optionValue('classrooms', Number(event.detail.value))
      },
      classroomIndexForSlot(slot) {
        const index = (this.options.classrooms || []).findIndex(item => item.value === slot.classroomId)
        return index >= 0 ? index : 0
      },
      classroomLabel(classroomId) {
        const option = (this.options.classrooms || []).find(item => item.value === classroomId)
        return option ? option.label : 'Select classroom'
      },
      normalizeScheduleSlots() {
        return (this.courseForm.scheduleSlots || []).map(slot => ({
          weekday: Number(slot.weekday || 0),
          startTime: String(slot.startTime || '').trim(),
          endTime: String(slot.endTime || '').trim(),
          classroomId: String(slot.classroomId || '').trim()
        }))
      },
      validateCourseForm(capacity, totalSessions, scheduleSlots) {
        const majorId = this.optionValue('majors', this.courseMajorIndex)
        const gradeYear = Number(this.courseForm.gradeYear || 0)
        if (!this.courseForm.courseCode || !this.courseForm.courseName || !majorId || !gradeYear || !this.courseForm.teacherIds.length || !capacity) {
          return 'Course code, name, major, cohort year, teachers and capacity are required.'
        }
        if (!Number.isInteger(capacity) || capacity < 1) {
          return 'Capacity must be a positive integer.'
        }
        if (!Number.isInteger(totalSessions) || totalSessions < 1) {
          return 'Total sessions must be a positive integer.'
        }
        if (Date.parse(`${this.courseForm.startDate}T00:00:00`) > Date.parse(`${this.courseForm.endDate}T23:59:59`)) {
          return 'Start date cannot be later than end date.'
        }
        if (!scheduleSlots.length) {
          return 'At least one schedule slot is required.'
        }
        for (const slot of scheduleSlots) {
          if (!slot.weekday || !slot.startTime || !slot.endTime || !slot.classroomId) {
            return 'Every schedule slot must include weekday, start time, end time and classroom.'
          }
          if (this.timeToMinutes(slot.endTime) <= this.timeToMinutes(slot.startTime)) {
            return 'Each schedule slot end time must be later than start time.'
          }
        }
        for (let leftIndex = 0; leftIndex < scheduleSlots.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < scheduleSlots.length; rightIndex += 1) {
            const left = scheduleSlots[leftIndex]
            const right = scheduleSlots[rightIndex]
            if (left.weekday === right.weekday && this.timeRangesOverlap(left.startTime, left.endTime, right.startTime,
                right.endTime)) {
              return 'Schedule slots in the same course cannot overlap.'
            }
          }
        }
        const availableSessions = this.countAvailableSessions(this.courseForm.startDate, this.courseForm.endDate, scheduleSlots)
        if (availableSessions < totalSessions) {
          return `Date range can only generate ${availableSessions} session(s), fewer than total sessions ${totalSessions}.`
        }
        return ''
      },
      countAvailableSessions(startDate, endDate, scheduleSlots) {
        const start = new Date(`${startDate}T00:00:00`)
        const end = new Date(`${endDate}T23:59:59`)
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) {
          return 0
        }
        let count = 0
        for (const cursor = new Date(start.getTime()); cursor.getTime() <= end.getTime(); cursor.setDate(cursor.getDate() + 1)) {
          const weekday = cursor.getDay() === 0 ? 7 : cursor.getDay()
          count += scheduleSlots.filter(slot => Number(slot.weekday || 0) === weekday).length
        }
        return count
      },
      formatLocalDate(date) {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      },
      timeToMinutes(value) {
        const [hours, minutes] = String(value || '').split(':').map(Number)
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return -1
        return hours * 60 + minutes
      },
      timeRangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
        return this.timeToMinutes(leftStart) < this.timeToMinutes(rightEnd) &&
          this.timeToMinutes(rightStart) < this.timeToMinutes(leftEnd)
      },
      groupTimetableSessions(rows) {
        const grouped = new Map()
        const sortedRows = (rows || []).slice().sort((left, right) =>
          Number(left.sessionStartAt || 0) - Number(right.sessionStartAt || 0) ||
          String(left.courseName || '').localeCompare(String(right.courseName || ''))
        )
        sortedRows.forEach(item => {
          const key = this.timetableSessionKey(item)
          const existing = grouped.get(key)
          if (!existing) {
            grouped.set(key, {
              ...item,
              _id: `weekly_${key}`,
              sessionCount: 1
            })
            return
          }
          existing.sessionCount = Number(existing.sessionCount || 1) + 1
        })
        return Array.from(grouped.values())
      },
      timetableSessionKey(item) {
        return [
          item.courseOfferingId || item.courseId || item.courseName || '',
          Number(item.weekday || 0),
          item.startTime || '',
          item.endTime || '',
          item.classroomId || item.classroomName || ''
        ].join('|')
      },
      sessionHasConflict(sessionItem, rows) {
        return rows.some(item =>
          item._id !== sessionItem._id &&
          Number(item.weekday || 0) === Number(sessionItem.weekday || 0) &&
          this.timeRangesOverlap(sessionItem.startTime, sessionItem.endTime, item.startTime, item.endTime)
        )
      },
      async saveCourse() {
        const capacity = Number(this.courseForm.capacity || 0)
        const totalSessions = Number(this.courseForm.totalSessions || 0)
        const scheduleSlots = this.normalizeScheduleSlots()
        const validationMessage = this.validateCourseForm(capacity, totalSessions, scheduleSlots)
        if (validationMessage) {
          uni.showToast({
            title: validationMessage,
            icon: 'none'
          })
          return
        }
        this.savingCourse = true
        const result = await callAiemsFunction('save-admin-course', {
          session: getSession(),
          courseCode: this.courseForm.courseCode.trim(),
          courseName: this.courseForm.courseName.trim(),
          majorId: this.optionValue('majors', this.courseMajorIndex),
          classroomId: scheduleSlots[0].classroomId,
          gradeYear: Number(this.courseForm.gradeYear || 0),
          sectionNo: this.courseForm.sectionNo.trim() || '01',
          teacherIds: this.courseForm.teacherIds,
          capacity,
          selectionStatus: 'open',
          courseStartDate: this.courseForm.startDate,
          courseEndDate: this.courseForm.endDate,
          classWeekday: scheduleSlots[0].weekday,
          classStartTime: scheduleSlots[0].startTime,
          classEndTime: scheduleSlots[0].endTime,
          scheduleSlots,
          totalSessions,
          credits: Number(this.courseForm.credits || 0),
          courseType: 'major_required',
          difficultyLevel: 3
        })
        this.savingCourse = false
        if (result.ok) {
          uni.showToast({
            title: 'Course published',
            icon: 'success'
          })
          this.courseForm = this.emptyCourseForm()
          this.load(true)
          return
        }
        uni.showToast({
          title: result.message || 'Publish failed.',
          icon: 'none'
        })
      },
      deleteCourse(course) {
        if (!course || !course.courseOfferingId) {
          uni.showToast({
            title: 'Course offering id is missing.',
            icon: 'none'
          })
          return
        }
        const courseName = [course.courseCode, course.courseName].filter(Boolean).join(' ') || course.courseOfferingId
        uni.showModal({
          title: 'Delete Course',
          content: `Delete ${courseName}? Related sessions, enrollments, attendance, leave requests, evaluations and materials will be removed.`,
          confirmText: 'Delete',
          success: async (modal) => {
            if (!modal.confirm) return
            this.deletingCourseId = course.courseOfferingId
            const result = await callAiemsFunction('delete-admin-course', {
              session: getSession(),
              courseOfferingId: course.courseOfferingId,
              courseId: course.courseId
            })
            this.deletingCourseId = ''
            if (result.ok) {
              uni.showToast({
                title: 'Course deleted',
                icon: 'success'
              })
              this.load(true)
              return
            }
            uni.showToast({
              title: result.message || 'Delete failed.',
              icon: 'none'
            })
          }
        })
      },
      courseSummary(course) {
        const schedule = [course.startDate, course.endDate, this.formatScheduleSlots(course.scheduleSlots || [])]
          .filter(Boolean).join(' / ')
        return [
          'Cohort ' + (course.gradeYear || ''),
          course.majorName || '',
          course.classroomName || '',
          (course.teacherNames || []).join(', '),
          course.credits ? course.credits + ' credits' : '',
          course.totalSessions ? course.totalSessions + ' sessions' : '',
          schedule
        ].filter(Boolean).join(' - ')
      },
      formatScheduleSlots(slots) {
        if (!Array.isArray(slots) || !slots.length) return ''
        return slots.map(slot => {
          const label = this.weekdayLabels[Number(slot.weekday || 1) - 1] || ''
          return `${label} ${slot.startTime || ''}-${slot.endTime || ''}`.trim()
        }).join('; ')
      }
    }
  }
</script>

<style scoped>
  .section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16rpx;
    margin-bottom: 14rpx;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16rpx;
  }

  .field {
    margin-bottom: 18rpx;
  }

  .picker-value {
    padding: 18rpx;
    background: #ffffff;
    border: 1rpx solid #cbd5e1;
    border-radius: 8rpx;
    font-size: 28rpx;
  }

  .readonly-value {
    margin-top: 10rpx;
    padding: 18rpx;
    background: #f8fafc;
    border: 1rpx solid #cbd5e1;
    border-radius: 8rpx;
    color: #0f172a;
    font-size: 28rpx;
    box-sizing: border-box;
  }

  .readonly-error {
    border-color: #fca5a5;
    background: #fef2f2;
    color: #b91c1c;
  }

  .field-hint {
    display: block;
    margin-top: 6px;
    color: #64748b;
    font-size: 12px;
    line-height: 1.35;
  }

  .field-hint-error {
    color: #b91c1c;
  }

  .label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
    margin-bottom: 10rpx;
  }

  .slot-list {
    display: flex;
    flex-direction: column;
    gap: 14rpx;
  }

  .slot-row {
    display: grid;
    grid-template-columns: 180rpx 170rpx 170rpx minmax(260rpx, 1fr) 150rpx;
    gap: 12rpx;
    align-items: end;
    padding: 14rpx;
    background: #f8fafc;
    border: 1rpx solid #e2e8f0;
    border-radius: 8rpx;
  }

  .slot-field {
    min-width: 0;
  }

  .slot-action-btn,
  .slot-remove-btn {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    width: auto !important;
    min-width: 86px !important;
    min-height: 36px !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 12px !important;
    line-height: 1.25 !important;
    white-space: nowrap;
    overflow: visible;
    box-sizing: border-box;
  }

  .slot-action-btn::after,
  .slot-remove-btn::after,
  .form-submit-btn::after,
  .full-btn::after {
    border: 0;
  }

  .form-submit-btn {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    width: 100% !important;
    min-height: 42px !important;
    height: auto !important;
    margin: 10px 0 0 !important;
    padding: 0 16px !important;
    line-height: 1.25 !important;
    white-space: nowrap;
    overflow: visible;
    box-sizing: border-box;
  }

  .timetable-filters {
    display: grid;
    grid-template-columns: minmax(260rpx, 1fr) minmax(220rpx, 1fr);
    gap: 16rpx;
  }

  .timetable-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(170rpx, 1fr));
    gap: 12rpx;
    margin-top: 16rpx;
    overflow-x: auto;
  }

  .timetable-day {
    min-width: 170rpx;
    padding: 12rpx;
    background: #f8fafc;
    border: 1rpx solid #e2e8f0;
    border-radius: 8rpx;
  }

  .timetable-day-title {
    display: block;
    margin-bottom: 10rpx;
    color: #0f172a;
    font-size: 26rpx;
    font-weight: 700;
  }

  .timetable-empty {
    color: #94a3b8;
    font-size: 22rpx;
  }

  .timetable-session {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    margin-bottom: 10rpx;
    padding: 10rpx;
    background: #ffffff;
    border: 1rpx solid #dbeafe;
    border-left: 6rpx solid #2563eb;
    border-radius: 6rpx;
  }

  .timetable-session.conflict {
    border-color: #fecaca;
    border-left-color: #dc2626;
    background: #fef2f2;
  }

  .timetable-time,
  .timetable-course,
  .timetable-meta {
    display: block;
    word-break: break-word;
  }

  .timetable-time {
    color: #2563eb;
    font-size: 22rpx;
    font-weight: 700;
  }

  .timetable-course {
    color: #0f172a;
    font-size: 24rpx;
  }

  .timetable-meta {
    color: #64748b;
    font-size: 22rpx;
  }

  .teacher-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12rpx;
    margin-top: 12rpx;
  }

  .teacher-option {
    display: flex;
    align-items: center;
    gap: 10rpx;
    min-height: 80rpx;
    padding: 14rpx 16rpx;
    background: #f8fafc;
    border: 1rpx solid #e2e8f0;
    border-radius: 8rpx;
    color: #0f172a;
  }

  .teacher-option.selected {
    background: #eff6ff;
    border-color: #2563eb;
  }

  .teacher-check {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34rpx;
    height: 34rpx;
    border: 1rpx solid #94a3b8;
    border-radius: 50%;
    color: #2563eb;
    font-size: 24rpx;
    line-height: 1;
    flex-shrink: 0;
  }

  .teacher-option.selected .teacher-check {
    background: #2563eb;
    border-color: #2563eb;
    color: #ffffff;
  }

  .teacher-copy {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    min-width: 0;
  }

  .teacher-name {
    color: #0f172a;
    font-size: 28rpx;
  }

  .teacher-meta,
  .empty-hint {
    color: #64748b;
    font-size: 24rpx;
  }

  .empty-hint {
    display: block;
    margin-top: 12rpx;
  }

  .full-btn {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    width: 100% !important;
    min-height: 42px !important;
    height: auto !important;
    margin: 10px 0 0 !important;
    padding: 0 16px !important;
    line-height: 1.25 !important;
    white-space: nowrap;
    overflow: visible;
    box-sizing: border-box;
  }

  .account-actions,
  .course-actions {
    display: flex;
    gap: 10rpx;
    align-items: center;
  }

  .mini-btn {
    min-width: 150rpx;
    padding: 8rpx 14rpx;
    border: 1rpx solid #cbd5e1;
    border-radius: 8rpx;
    background: #ffffff;
    color: #1e293b;
    font-size: 24rpx;
    line-height: 1.4;
  }

  .mini-btn.danger {
    border-color: #fecaca;
    color: #b91c1c;
  }

  .mini-btn[disabled] {
    color: #94a3b8;
    background: #f1f5f9;
    border-color: #e2e8f0;
  }

  .refresh-btn {
    min-width: 150rpx;
  }

  @media (max-width: 700px) {

    .form-grid,
    .teacher-list,
    .timetable-filters {
      grid-template-columns: 1fr;
    }

    .slot-row {
      grid-template-columns: 1fr;
    }

    .timetable-grid {
      grid-template-columns: repeat(7, 220rpx);
    }

    .account-actions,
    .course-actions {
      margin-top: 14rpx;
      width: 100%;
    }
  }
</style>
