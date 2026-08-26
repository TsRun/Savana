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
              <button v-if="inputValues[input.key]" class="confirm-copy-btn" :class="{ copied: copiedKey === input.key }" @click="copyInput(input.key)" :title="copyShortcutFor(input.key) ? `Copy (${copyShortcutFor(input.key)})` : 'Copy'">
                <svg v-if="copiedKey === input.key" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
              </button>
            </div>
          </div>
          <p v-if="hasCredentialInputs" class="confirm-shortcut-hint">
            Ctrl+U : copier l'username &middot; Ctrl+P : copier le mot de passe
          </p>
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
import { computed, reactive, ref, watch, onMounted, onUnmounted } from 'vue';

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

const copiedKey = ref('');
let copiedTimer = null;

const copyValue = (text) => {
  if (window.electronAPI?.writeToClipboard) {
    window.electronAPI.writeToClipboard(text);
  } else {
    navigator.clipboard.writeText(text);
  }
};

const copyInput = (key) => {
  const value = inputValues[key];
  if (!value) return;
  copyValue(value);
  copiedKey.value = key;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { copiedKey.value = ''; }, 1200);
};

// Raccourcis copie : Ctrl+U (username) / Ctrl+P (password)
const COPY_SHORTCUTS = { u: 'username', p: 'password' };

const copyShortcutFor = (key) => {
  const letter = Object.keys(COPY_SHORTCUTS).find(l => COPY_SHORTCUTS[l] === key);
  return letter ? `Ctrl+${letter.toUpperCase()}` : '';
};

const hasCredentialInputs = computed(() =>
  props.inputs.some(i => i.key === 'username' || i.key === 'password')
);

const handleShortcut = (e) => {
  if (!props.isOpen || !props.inputs.length) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  const targetKey = COPY_SHORTCUTS[e.key.toLowerCase()];
  if (!targetKey || inputValues[targetKey] === undefined) return;
  e.preventDefault();
  e.stopPropagation();
  copyInput(targetKey);
};

onMounted(() => window.addEventListener('keydown', handleShortcut, true));
onUnmounted(() => {
  window.removeEventListener('keydown', handleShortcut, true);
  clearTimeout(copiedTimer);
});

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
  background: rgba(9, 11, 14, 0.6);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-dialog);
  animation: fadeIn 0.15s ease;
}

.confirm-dialog {
  background: var(--bg-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
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
  background: rgba(209, 104, 104, 0.12);
  color: var(--error);
}

.dialog-warning .confirm-icon {
  background: rgba(217, 164, 65, 0.12);
  color: var(--warning);
}

.dialog-info .confirm-icon {
  background: var(--accent-soft);
  color: var(--accent-primary);
}

.confirm-title {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 600;
  letter-spacing: -0.01em;
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
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-muted);
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
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  min-width: 0;
}

.confirm-input:focus {
  border-color: var(--accent-primary);
  box-shadow: var(--focus-ring);
}

.confirm-copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
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
  background: var(--accent-soft);
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}

.confirm-copy-btn.copied {
  background: rgba(78, 192, 122, 0.12);
  color: var(--success);
  border-color: var(--success);
}

.confirm-shortcut-hint {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-top: 2px;
  text-align: center;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

/* .btn, .btn-primary, .btn-secondary, .btn-danger : styles globaux (style.css) */
.confirm-actions .btn {
  padding: 10px 24px;
}

.btn-danger-sm {
  background: transparent;
  color: var(--error);
  border: 1px solid var(--error);
}

.btn-danger-sm:hover {
  background: rgba(209, 104, 104, 0.12);
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
