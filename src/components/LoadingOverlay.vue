<template>
  <div v-if="state.status === 'loading'" class="loading-overlay">
    <div class="loading-content">
      <div class="spinner"></div>
      <div class="loading-message">{{ state.message }}</div>
      <div class="loading-sub">Veuillez patienter...</div>
      <button @click="cancelLoading" class="cancel-btn">
        ✕ Annuler
      </button>
    </div>
  </div>
</template>

<script setup>
import { reactive, onMounted, onUnmounted } from 'vue';

const state = reactive({
  status: 'idle',
  message: ''
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
