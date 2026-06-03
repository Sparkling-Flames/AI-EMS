<template>
  <view class="data-card">
    <view class="data-card-body">
      <view class="data-card-main">
        <text class="data-card-title">{{ title }}</text>
        <text v-if="subtitle" class="data-card-sub">{{ subtitle }}</text>
      </view>
      <view v-if="$slots.default" class="data-card-extra">
        <slot></slot>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  props: {
    title: { type: String, required: true },
    subtitle: { type: String, default: "" }
  }
};
</script>

<style scoped>
.data-card {
  margin-top: 16px;
  padding: 18px;
  background: #ffffff;
  border: 0;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
}

.data-card-body {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.data-card-main {
  flex: 1;
  min-width: 0;
}

.data-card-title {
  display: block;
  color: #111827;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
}

.data-card-sub {
  display: block;
  margin-top: 6px;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.45;
}

.data-card-extra {
  flex-shrink: 0;
  margin-left: 0;
}
</style>
