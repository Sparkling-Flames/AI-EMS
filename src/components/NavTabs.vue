<template>
  <view class="nav-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="nav-btn"
      :class="tab.key === current ? 'nav-btn-active' : ''"
      :disabled="tab.key === current"
      @click="go(tab.url)"
    >
      {{ tab.label }}
    </button>
  </view>
</template>

<script>
export default {
  props: {
    role: { type: String, required: true },
    current: { type: String, required: true }
  },
  computed: {
    tabs() {
      const roleDashboard = `/pages/${this.role}/dashboard`
      const tabs = [
        { key: 'dashboard', url: roleDashboard, label: 'Dashboard' },
        ...(this.role === 'admin' ? [{ key: 'management', url: '/pages/admin/management', label: 'Management' }] : []),
        { key: 'leave', url: '/pages/leave/leave', label: 'Leave' },
        { key: 'evaluation', url: '/pages/evaluation/evaluation', label: 'Evaluation' },
        { key: 'materials', url: '/pages/materials/materials', label: 'Materials' },
        { key: 'assistant', url: '/pages/assistant/assistant', label: 'Assistant' }
      ]
      return tabs
    }
  },
  methods: {
    go(url) {
      uni.navigateTo({ url })
    }
  }
}
</script>

<style scoped>
.nav-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 14px 12px 14px;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 96px;
  min-height: 40px;
  margin: 0 !important;
  padding: 0 14px !important;
  background: #e2e8f0;
  color: #475569;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.25;
  text-align: center;
  white-space: nowrap;
  overflow: visible;
  box-sizing: border-box;
}

.nav-btn::after {
  border: 0;
}

.nav-btn-active {
  background: #2563eb;
  color: #ffffff;
  font-weight: 600;
}
</style>
