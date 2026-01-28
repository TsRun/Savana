<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="close">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Ajouter un compte</h3>
        <button @click="close" class="close-btn">×</button>
      </div>
      
      <form @submit.prevent="handleSubmit">
        <label>Riot ID</label>
        
        <div class="riot-input-container" :class="{ 'focused': isFocused, 'error': errorMessage }">
          <input 
            ref="nameInput"
            v-model="form.gameName" 
            type="text" 
            placeholder="Game Name"
            class="input-part name-part"
            required
            @focus="isFocused = true; clearError()"
            @blur="isFocused = false"
            @paste="handlePaste"
            @input="handleNameInput"
          >
          <span class="separator">#</span>
          <input 
            ref="tagInput"
            v-model="form.tagLine" 
            type="text" 
            placeholder="TAG"
            class="input-part tag-part"
            required
            @focus="isFocused = true; clearError()"
            @blur="isFocused = false"
            @keydown.backspace="handleTagBackspace"
          >
        </div>
        <small class="hint">Collez votre Riot ID complet (Ex: Faker#T1)</small>
        
        <!-- Error message display -->
        <div v-if="errorMessage" class="error-message">
             <span>{{ errorMessage }}</span>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" @click="close">
            Annuler
          </button>
          <button type="submit" class="btn btn-primary" :disabled="loading || !form.gameName || !form.tagLine">
            {{ loading ? 'Ajout...' : 'Ajouter' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close', 'smurf-added', 'error']);

const loading = ref(false);
const errorMessage = ref('');
const isFocused = ref(false);

const nameInput = ref(null);
const tagInput = ref(null);

const form = ref({
  gameName: '',
  tagLine: ''
});

import { useApi } from '../composables/useApi';
const { apiUrl } = useApi();

watch(() => props.isOpen, (val) => {
  if (val) {
    form.value = { gameName: '', tagLine: '' };
    errorMessage.value = '';
    nextTick(() => nameInput.value?.focus());
  }
});

function clearError() {
    if (errorMessage.value) errorMessage.value = '';
}

function handlePaste(e) {
  e.preventDefault();
  const text = e.clipboardData.getData('text');
  if (text.includes('#')) {
    const [name, ...rest] = text.split('#');
    form.value.gameName = name;
    form.value.tagLine = rest.join('#'); // Join rest in case tag has weird chars, though usually unlikely
    nextTick(() => tagInput.value?.focus());
  } else {
    form.value.gameName = text;
  }
}

function handleNameInput(e) {
  const val = e.target.value;
  if (val.includes('#')) {
    const [name, tag] = val.split('#');
    form.value.gameName = name;
    if (tag) form.value.tagLine = tag;
    nextTick(() => tagInput.value?.focus());
  }
}

function handleTagBackspace(e) {
  if (!form.value.tagLine) {
    nameInput.value?.focus();
  }
}

function close() {
  errorMessage.value = '';
  emit('close');
}

async function handleSubmit() {
  loading.value = true;
  errorMessage.value = '';
  
  const fullRiotId = `${form.value.gameName.trim()}#${form.value.tagLine.trim()}`;

  if (!form.value.gameName.trim() || !form.value.tagLine.trim()) {
      errorMessage.value = 'Riot ID incomplet';
      loading.value = false;
      return;
  }
  
  try {
    const res = await fetch(`${apiUrl.value}/smurfs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ riotId: fullRiotId })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Erreur lors de l\'ajout');
    }
    
    emit('smurf-added');
    close();
  } catch (e) {
    errorMessage.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

.modal-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 400px;
  animation: slideUp 0.3s ease;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.modal-header h3 {
  font-size: 1.25rem;
  font-weight: 600;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.5rem;
  cursor: pointer;
  transition: color 0.2s;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-primary);
}

label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 6px;
  color: var(--text-secondary);
}

.form-group input {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.95rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}

.form-group input.input-error {
  border-color: var(--error);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
}

.form-group input::placeholder {
  color: var(--text-muted);
}

.form-group small {
  display: block;
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: var(--error);
  font-size: 0.875rem;
  margin-bottom: 16px;
  animation: shake 0.3s ease;
}

.error-message svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { 
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to { 
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-4px); }
  40%, 80% { transform: translateX(4px); }
}

.riot-input-container {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s;
}

.riot-input-container.focused {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}

.riot-input-container.error {
  border-color: var(--error);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
}

.input-part {
  background: transparent;
  border: none;
  padding: 12px 0;
  color: var(--text-primary);
  font-size: 0.95rem;
  outline: none;
}

.name-part {
  flex: 1;
}

.tag-part {
  width: 70px;
  text-align: center;
}

.separator {
  color: var(--text-muted);
  font-weight: 600;
  padding: 0 8px;
  user-select: none;
}

.hint {
  display: block;
  margin-top: 6px;
  font-size: 0.75rem;
  color: var(--text-muted);
}


</style>
