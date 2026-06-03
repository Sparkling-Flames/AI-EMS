<template>
  <view class="page-header">
    <view class="header-row">
      <view class="header-left">
        <text class="header-title">{{ title }}</text>
        <text class="header-sub">{{ displayName }} - {{ username }}</text>
      </view>
      <view class="header-right">
        <slot></slot>
        <button class="logout-btn" @click="handleLogout">Logout</button>
      </view>
    </view>
  </view>
</template>

<script>
import { clearSession } from "../common/session.js";

export default {
  props: {
    title: { type: String, required: true },
    displayName: { type: String, default: "" },
    username: { type: String, default: "" }
  },
  methods: {
    handleLogout() {
      clearSession();
      uni.reLaunch({ url: "/pages/login/login" });
    }
  }
};
</script>

<style scoped>
.page-header {
  margin-bottom: 20px;
  padding: 24px;
  background: #ffffff;
  border: 0;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.header-left {
  flex: 1;
  min-width: 220px;
}

.header-title {
  display: block;
  color: #111827;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.25;
}

.header-sub {
  display: block;
  margin-top: 6px;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.45;
}

.header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.page-header :global(uni-button),
.page-header :global(button),
.header-right :slotted(button),
.logout-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  width: auto !important;
  min-width: 88px !important;
  min-height: 40px;
  height: auto;
  padding: 8px 14px !important;
  border: 0;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.2;
  white-space: normal;
  overflow-wrap: anywhere;
  box-sizing: border-box;
}

.logout-btn {
  background: #fee2e2;
  color: #b91c1c;
}

.logout-btn::after {
  border: 0;
}

@media (max-width: 700px) {
  .page-header {
    padding: 18px;
  }

  .header-left,
  .header-right {
    width: 100%;
  }

  .header-right {
    justify-content: flex-start;
  }
}
</style>
