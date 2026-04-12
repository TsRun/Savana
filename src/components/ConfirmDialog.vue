<template>
  <Teleport to="body">
    <div v-if="isOpen" class="confirm-overlay" @click.self="!locked && handleCancel()">
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
        <p class="confirm-message" style="white-space: pre-line;">{{ message }}</p>
        <div v-if="inputs.length" class="confirm-inputs">
          <div v-for="input in inputs" :key="input.key" class="confirm-input-group">
            <label class="confirm-input-label">{{ input.label }}</label>
            <div class="confirm-input-row">
              <input
                :type="input.type || 'text'"
                :placeholder="input.placeholder || ''"
                v-model="inputValues[input.key]"
                class="confirm-input"
              />
              <button v-if="inputValues[input.key]" class="confirm-copy-btn" @click="copyValue(inputValues[input.key])" title="Copy">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="confirm-actions">
          <button v-if="thirdText" @click="handleThird" class="btn btn-danger-sm">
            {{ thirdText }}
          </button>
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
import { computed, reactive, watch } from 'vue';

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  title: { type: String, default: 'Confirmation' },
  message: { type: String, default: 'Êtes-vous sûr ?' },
  confirmText: { type: String, default: 'Confirmer' },
  cancelText: { type: String, default: 'Annuler' },
  thirdText: { type: String, default: '' },
  inputs: { type: Array, default: () => [] },
  autoConfirm: { type: Number, default: 0 },
  locked: { type: Boolean, default: false },
  type: { type: String, default: 'info' } // 'info', 'warning', 'danger'
});

const emit = defineEmits(['confirm', 'cancel', 'third']);

const inputValues = reactive({});

// Reset input values when dialog opens with new inputs
watch(() => props.inputs, (newInputs) => {
  Object.keys(inputValues).forEach(k => delete inputValues[k]);
  for (const input of newInputs) {
    inputValues[input.key] = input.value || '';
  }
}, { immediate: true });

const dialogClass = computed(() => `dialog-${props.type}`);
const confirmButtonClass = computed(() => {
  return props.type === 'danger' ? 'btn-danger' : 'btn-primary';
});

const getInputData = () => ({ ...inputValues });

const copyValue = (text) => {
  if (window.electronAPI?.writeToClipboard) {
    window.electronAPI.writeToClipboard(text);
  } else {
    navigator.clipboard.writeText(text);
  }
};

const handleConfirm = () => emit('confirm', getInputData());
const handleCancel = () => emit('cancel', getInputData());
const handleThird = () => emit('third', getInputData());

// Watch autoConfirm counter — when it increments, auto-trigger confirm
watch(() => props.autoConfirm, (val) => {
  if (val > 0 && props.isOpen) handleConfirm();
});
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

.confirm-inputs {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
  text-align: left;
}

.confirm-input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.confirm-input-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.confirm-input-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.confirm-input {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s ease;
  min-width: 0;
}

.confirm-input:focus {
  border-color: var(--accent-primary);
}

.confirm-copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}

.confirm-copy-btn svg {
  width: 14px;
  height: 14px;
}

.confirm-copy-btn:hover {
  background: rgba(99, 102, 241, 0.15);
  color: var(--accent-primary);
  border-color: var(--accent-primary);
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

.btn-danger-sm {
  background: transparent;
  color: var(--error, #ef4444);
  border: 1px solid var(--error, #ef4444);
}

.btn-danger-sm:hover {
  background: rgba(239, 68, 68, 0.15);
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
