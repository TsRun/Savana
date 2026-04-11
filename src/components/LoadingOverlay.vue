<template>
  <Transition name="statusbar">
    <div v-if="state.status === 'loading'" class="status-bar">
      <div class="status-spinner"></div>
      <span class="status-text">{{ state.message || 'Chargement...' }}</span>
      <div v-if="progressInfo" class="status-progress">
        <div class="status-progress-track">
          <div class="status-progress-fill" :style="{ width: progressInfo.pct + '%' }"></div>
        </div>
        <span class="status-progress-label">{{ progressInfo.current }}/{{ progressInfo.total }}</span>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { reactive, computed, onMounted } from 'vue';

const state = reactive({
  status: 'idle',
  message: ''
});

const progressInfo = computed(() => {
  const m = state.message.match(/^\[(\d+)\/(\d+)\]/);
  if (!m) return null;
  const current = parseInt(m[1]);
  const total = parseInt(m[2]);
  return { current, total, pct: Math.round((current / total) * 100) };
});

onMounted(() => {
  if (window.electronAPI?.onLaunchStatus) {
    window.electronAPI.onLaunchStatus((data) => {
      state.status = data.status;
      state.message = data.message || 'Chargement...';
    });
  }
});
</script>

<style scoped>
.status-bar {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: rgba(17, 17, 27, 0.92);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 10px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  z-index: 300;
  max-width: 500px;
  pointer-events: none;
}

.status-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(99, 102, 241, 0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.status-text {
  color: #d4d4d8;
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.status-progress-track {
  width: 60px;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.status-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  border-radius: 2px;
  transition: width 0.4s ease;
}

.status-progress-label {
  font-size: 0.7rem;
  color: #71717a;
}

/* Transitions */
.statusbar-enter-active { animation: slideUp 0.25s ease; }
.statusbar-leave-active { animation: slideUp 0.2s ease reverse; }

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
