<script>
export default {
  onLaunch() {
    console.log("AI-EMS launch");
  },
  onShow() {
    console.log("AI-EMS show");
  },
  onHide() {
    console.log("AI-EMS hide");
  }
};
</script>

<style>
page {
  min-height: 100%;
  background: #f3f4f6;
  color: #111827;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 20px;
}

.section {
  margin-bottom: 20px;
  padding: 24px;
  background: #ffffff;
  border: 0;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
}

.section-title {
  display: block;
  margin-bottom: 12px;
  color: #111827;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
}

.muted {
  color: #6b7280;
  font-size: 14px;
  line-height: 1.45;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  margin-top: 16px;
}

.primary-btn,
.secondary-btn,
.danger-btn {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: auto !important;
  min-width: 92px;
  min-height: 44px;
  height: auto !important;
  margin: 0;
  padding: 8px 16px !important;
  border: 0;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.25 !important;
  text-align: center;
  white-space: normal;
  overflow: visible;
  overflow-wrap: anywhere;
  box-sizing: border-box;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.primary-btn::after,
.secondary-btn::after,
.danger-btn::after {
  border: 0;
}

.primary-btn:active,
.secondary-btn:active,
.danger-btn:active {
  opacity: 0.85;
  transform: scale(0.98);
}

.primary-btn {
  background: #2563eb;
  color: #ffffff;
  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
}

.secondary-btn {
  background: #f3f4f6;
  color: #374151;
  box-shadow: none;
}

.danger-btn {
  background: #fee2e2;
  color: #b91c1c;
  box-shadow: none;
}

.full-btn {
  width: 100% !important;
}

.compact-btn,
.mini-btn {
  min-width: 76px;
  min-height: 36px;
  padding: 6px 12px !important;
  font-size: 14px;
}

.card {
  margin-top: 16px;
  padding: 18px;
  background: #ffffff;
  border: 0;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
}

.label {
  display: block;
  color: #374151;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.value {
  color: #111827;
  font-size: 16px;
  line-height: 1.45;
}

input,
textarea,
picker {
  box-sizing: border-box;
  width: 100%;
  margin-top: 8px;
  padding: 0 16px;
  background: #f9fafb;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #111827;
  font-size: 16px;
  line-height: 1.45;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

input:focus,
textarea:focus,
picker:focus {
  background: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  outline: none;
}

input {
  height: 46px;
  min-height: 46px;
  line-height: 46px;
}

textarea {
  min-height: 120px;
  padding: 12px 16px;
  line-height: 1.5;
}

picker {
  min-height: 46px;
  padding: 0;
}

.picker-value,
.readonly-value,
.input-box {
  box-sizing: border-box;
  min-height: 46px;
  padding: 11px 16px;
  background: #f9fafb;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #111827;
  font-size: 16px;
  line-height: 1.45;
}

.field {
  margin-bottom: 16px;
}

@media (max-width: 700px) {
  .page {
    padding: 16px;
  }

  .section {
    padding: 18px;
    border-radius: 14px;
  }

  .row {
    align-items: flex-start;
    flex-direction: column;
  }

  .primary-btn,
  .secondary-btn,
  .danger-btn {
    min-width: 0;
  }
}
</style>
