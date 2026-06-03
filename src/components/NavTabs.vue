<template>
  <scroll-view scroll-x class="nav-tabs-scroll" show-scrollbar="false">
    <view class="nav-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="nav-btn"
        :class="tab.key === current ? 'nav-btn-active' : ''"
        @click="go(tab)"
      >
        <text class="nav-label">{{ tab.label }}</text>
      </button>
    </view>
  </scroll-view>
</template>

<script>
export default {
  props: {
    role: { type: String, required: true },
    current: { type: String, required: true }
  },
  computed: {
    tabs() {
      const roleDashboard = `/pages/${this.role}/dashboard`;
      const tabs = [
        { key: "dashboard", url: roleDashboard, label: "Dashboard" },
        ...(this.role === "admin" ? [{ key: "management", url: "/pages/admin/management", label: "Management" }] : []),
        { key: "leave", url: "/pages/leave/leave", label: "Leave" },
        { key: "evaluation", url: "/pages/evaluation/evaluation", label: "Evaluation" },
        ...(this.role === "student"
          ? []
          : [{ key: "materials", url: "/pages/materials/materials", label: "Materials" }]),
        { key: "assistant", url: "/pages/assistant/assistant", label: "Assistant" }
      ];
      return tabs;
    }
  },
  methods: {
    go(tab) {
      if (!tab || tab.key === this.current) return;
      uni.navigateTo({ url: tab.url });
    }
  }
};
</script>

<style scoped>
.nav-tabs-scroll {
  width: 100%;
  padding: 0 0 16px;
  box-sizing: border-box;
  white-space: nowrap;
}

.nav-tabs {
  display: flex;
  align-items: stretch;
  gap: 8px;
  min-width: max-content;
  padding: 4px;
  background: #e5e7eb;
  border: 0;
  border-radius: 12px;
  box-sizing: border-box;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: auto !important;
  min-width: 96px;
  max-width: none;
  min-height: 42px;
  margin: 0 !important;
  padding: 8px 16px !important;
  background: transparent;
  color: #374151;
  border: 0;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.25;
  text-align: center;
  white-space: normal;
  overflow: visible;
  box-sizing: border-box;
}

.nav-label {
  display: block;
  max-width: 100%;
  overflow: visible;
  word-break: break-word;
  overflow-wrap: anywhere;
  text-overflow: clip;
}

.nav-btn::after {
  border: 0;
}

.nav-btn-active {
  background: #ffffff;
  color: #2563eb;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
}

.nav-btn:active {
  opacity: 0.85;
  transform: scale(0.98);
}
</style>
