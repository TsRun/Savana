<template>
  <Teleport to="body">
    <div v-if="isOpen" class="confirm-overlay" @click.self="handleCancel">
      <div class="confirm-dialog" :class="dialogClass">
        <div class="confirm-icon" v-if="type">
          <svg v-if="type === 'danger'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <svg v-else-if="type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </div>
        <h3 class="confirm-title">{{ title }}</h3>
        <p class="confirm-message">{{ message }}</p>
        <div class="confirm-actions">
          <button @click="handleCancel" class="btn btn-secondary">
            {{ cancelText }}
          </button>
          <button @click="handleConfirm" :class="['btn', confirmButtonClass]">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  title: { type: String, default: 'Confirmation' },
  message: { type: String, default: 'Êtes-vous sûr ?' },
  confirmText: { type: String, default: 'Confirmer' },
  cancelText: { type: String, default: 'Annuler' },
  type: { type: String, default: 'info' } // 'info', 'warning', 'danger'
});

const emit = defineEmits(['confirm', 'cancel']);

const dialogClass = computed(() => `dialog-${props.type}`);
const confirmButtonClass = computed(() => {
  return props.type === 'danger' ? 'btn-danger' : 'btn-primary';
});

const handleConfirm = () => emit('confirm');
const handleCancel = () => emit('cancel');
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.15s ease;
}

.confirm-dialog {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 28px;
  width: 90%;
  max-width: 400px;
  text-align: center;
  animation: scaleIn 0.2s ease;
}

.confirm-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  padding: 12px;
  border-radius: 50%;
  background: var(--bg-tertiary);
}

.confirm-icon svg {
  width: 100%;
  height: 100%;
}

.dialog-danger .confirm-icon {
  background: rgba(239, 68, 68, 0.15);
  color: var(--error);
}

.dialog-warning .confirm-icon {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.dialog-info .confirm-icon {
  background: rgba(99, 102, 241, 0.15);
  color: var(--accent-primary);
}

.confirm-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.confirm-message {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin-bottom: 24px;
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn {
  padding: 10px 24px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.btn-primary {
  background: var(--accent-gradient);
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-danger {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
}

.btn-danger:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { 
    opacity: 0;
    transform: scale(0.9);
  }
  to { 
    opacity: 1;
    transform: scale(1);
  }
}
</style>
