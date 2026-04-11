<template>
  <div v-if="state.status === 'loading'" class="loading-overlay">
    <div class="loading-content">
      <div class="spinner"></div>
      <div class="loading-message">{{ mainMessage }}</div>
      <div v-if="progressInfo" class="loading-progress-bar">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: progressInfo.pct + '%' }"></div>
        </div>
        <span class="progress-label">{{ progressInfo.current }} / {{ progressInfo.total }}</span>
      </div>
      <div class="loading-sub">{{ subMessage }}</div>
      <button @click="cancelLoading" class="cancel-btn">
        ✕ Annuler
      </button>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, onMounted, onUnmounted } from 'vue';

const state = reactive({
  status: 'idle',
  message: ''
});

// Parse "[2/9] PlayerName — Sous-message" pour extraire les parties
const mainMessage = computed(() => {
  const m = state.message.match(/^(\[\d+\/\d+\]\s+\S+)\s+—\s+(.+)$/);
  return m ? `${m[1]} — ${m[2]}` : state.message || 'Chargement...';
});

const subMessage = computed(() => {
  const m = state.message.match(/^(\[\d+\/\d+\])/);
  return m ? 'Update All en cours...' : 'Veuillez patienter...';
});

const progressInfo = computed(() => {
  const m = state.message.match(/^\[(\d+)\/(\d+)\]/);
  if (!m) return null;
  const current = parseInt(m[1]);
  const total = parseInt(m[2]);
  return { current, total, pct: Math.round((current / total) * 100) };
});

let cleanup = null;

onMounted(() => {
  if (window.electronAPI?.onLaunchStatus) {
    cleanup = window.electronAPI.onLaunchStatus((data) => {
      state.status = data.status;
      state.message = data.message || 'Chargement...';
    });
  }
});

onUnmounted(() => {
  // Cleanup logic if needed
});

const cancelLoading = () => {
  // Reset the loading state
  state.status = 'idle';
  state.message = '';
  
  // Try to kill any Riot processes if possible
  if (window.electronAPI?.cancelLaunch) {
    window.electronAPI.cancelLaunch();
  }
};
</script>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 15, 0.95);
  backdrop-filter: blur(10px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.spinner {
  width: 60px;
  height: 60px;
  border: 4px solid rgba(99, 102, 241, 0.1);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  box-shadow: 0 0 30px rgba(99, 102, 241, 0.2);
}

.loading-message {
  color: white;
  font-size: 1.25rem;
  font-weight: 600;
  text-align: center;
}

.loading-progress-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 280px;
}

.progress-track {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  border-radius: 2px;
  transition: width 0.4s ease;
}

.progress-label {
  font-size: 0.75rem;
  color: #71717a;
}

.loading-sub {
  color: #a1a1aa;
  font-size: 0.875rem;
}

.cancel-btn {
  margin-top: 20px;
  padding: 10px 24px;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.5);
  color: #ef4444;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn:hover {
  background: rgba(239, 68, 68, 0.4);
  border-color: #ef4444;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
