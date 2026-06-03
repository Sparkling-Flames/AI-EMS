<template>
  <view class="stat-card">
    <text class="stat-value">{{ value }}</text>
    <text class="stat-label">{{ label }}</text>
  </view>
</template>

<script>
export default {
  props: {
    value: { type: [String, Number], required: true },
    label: { type: String, required: true }
  }
};
</script>

<style scoped>
.stat-card {
  flex: 1;
  min-width: 160px;
  padding: 20px 16px;
  background: #ffffff;
  border: 0;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
}

.stat-value {
  display: block;
  color: #111827;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.2;
}

.stat-label {
  display: block;
  margin-top: 8px;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.35;
}
</style>
