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
  padding: 0 28rpx 20rpx 28rpx;
  box-sizing: border-box;
  white-space: nowrap;
}

.nav-tabs {
  display: flex;
  align-items: stretch;
  gap: 12rpx;
  min-width: max-content;
  padding: 8rpx;
  background: #f1f5f9;
  border: 1rpx solid #e2e8f0;
  border-radius: 8rpx;
  box-sizing: border-box;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: auto !important;
  min-width: 184rpx;
  max-width: 300rpx;
  min-height: 76rpx;
  margin: 0 !important;
  padding: 12rpx 24rpx !important;
  background: transparent;
  color: #334155;
  border: 0;
  border-radius: 8rpx;
  font-size: 26rpx;
  line-height: 1.2;
  text-align: center;
  white-space: normal;
  overflow: hidden;
  box-sizing: border-box;
}

.nav-label {
  display: -webkit-box;
  max-width: 100%;
  overflow: hidden;
  word-break: break-word;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.nav-btn::after {
  border: 0;
}

.nav-btn-active {
  background: #ffffff;
  color: #1d4ed8;
  font-weight: 600;
  box-shadow: 0 2rpx 4rpx rgba(15, 23, 42, 0.08);
}
</style>
