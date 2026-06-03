<template>
  <text class="status-badge" :style="badgeStyle">{{ label }}</text>
</template>

<script>
const STYLE_MAP = {
  present: { bg: "#d1fae5", text: "#065f46" },
  approved: { bg: "#d1fae5", text: "#065f46" },
  absent: { bg: "#fee2e2", text: "#991b1b" },
  rejected: { bg: "#fee2e2", text: "#991b1b" },
  on_leave: { bg: "#fef3c7", text: "#92400e" },
  pending: { bg: "#fef3c7", text: "#92400e" },
  late: { bg: "#ffedd5", text: "#9a3412" },
  excused: { bg: "#dbeafe", text: "#1e40af" },
  new: { bg: "#dbeafe", text: "#2563eb" },
  high: { bg: "#fee2e2", text: "#991b1b" },
  critical: { bg: "#fee2e2", text: "#7f1d1d" },
  medium: { bg: "#fef3c7", text: "#92400e" },
  low: { bg: "#dbeafe", text: "#1e40af" }
};

const LABEL_MAP = {
  present: "Present",
  approved: "Approved",
  absent: "Absent",
  rejected: "Rejected",
  on_leave: "On Leave",
  pending: "Pending",
  late: "Late",
  excused: "Excused",
  new: "New",
  high: "High",
  critical: "Critical",
  medium: "Medium",
  low: "Low"
};

export default {
  props: {
    status: { type: String, required: true }
  },
  computed: {
    label() {
      return LABEL_MAP[this.status] || this.status;
    },
    badgeStyle() {
      const s = STYLE_MAP[this.status] || { bg: "#f1f5f9", text: "#475569" };
      return `background:${s.bg};color:${s.text}`;
    }
  }
};
</script>

<style scoped>
.status-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  white-space: nowrap;
}
</style>
