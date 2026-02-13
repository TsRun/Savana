<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="close">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Ajouter un compte</h3>
        <button @click="close" class="close-btn">×</button>
      </div>
      
      <form @submit.prevent="handleSubmit">
        <div class="import-section">
          <button type="button" class="btn btn-import" @click="handleImport" :disabled="loading">
            <span v-if="importing">Détection...</span>
            <span v-else>📲 Importer la session active</span>
          </button>
          <div class="divider"><span>OU</span></div>
        </div>

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
import { useApi } from '../composables/useApi';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close', 'smurf-added', 'error', 'session-saved']);

const loading = ref(false);
const importing = ref(false);
const errorMessage = ref('');
const isFocused = ref(false);

const nameInput = ref(null);
const tagInput = ref(null);

const form = ref({
  gameName: '',
  tagLine: ''
});

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
    form.value.tagLine = rest.join('#'); 
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
    e.preventDefault(); // Prevent deleting the last char of name directly
  }
}

function close() {
  errorMessage.value = '';
  emit('close');
}

// Helper for cleaning filename
const getSafeFilename = (pseudo) => {
  return pseudo.replace(/[^a-zA-Z0-9]/g, '_');
};

async function handleImport() {
  importing.value = true;
  loading.value = true;
  errorMessage.value = '';

  try {
    // 1. Get Current Account from Local Client
    const res = await fetch(`${apiUrl.value}/riot-client/current-account`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Impossible de détecter le compte. Vérifiez que Riot Client est ouvert.');
    }
    
    const account = await res.json();
    if (!account.gameName || !account.tagLine) {
       throw new Error('Pseudo introuvable sur le client. Connectez-vous et réessayez.');
    }

    form.value.gameName = account.gameName;
    form.value.tagLine = account.tagLine;
    
    // 2. Add to DB
    await performSubmit(true); // true = autoSaveSession

  } catch (e) {
    errorMessage.value = e.message;
    loading.value = false;
    importing.value = false;
  }
}

async function handleSubmit() {
  await performSubmit(false);
}

async function performSubmit(autoSaveSession = false) {
  loading.value = true;
  errorMessage.value = '';
  
  const fullRiotId = `${form.value.gameName.trim()}#${form.value.tagLine.trim()}`;

  if (!form.value.gameName.trim() || !form.value.tagLine.trim()) {
      errorMessage.value = 'Riot ID incomplet';
      loading.value = false;
      return;
  }
  
  try {
    // Add Smurf
    const res = await fetch(`${apiUrl.value}/smurfs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ riotId: fullRiotId })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      if (res.status === 409 && autoSaveSession) {
          // If already exists and we are importing, we still want to save session!
          // Proceed to save session. 
          // But we need to know the ID? Actually saveSession inputs are just file ops.
      } else {
        throw new Error(data.error || 'Erreur lors de l\'ajout');
      }
    }
    
    // Auto Save Session
    if (autoSaveSession) {
       if (!window.electronAPI?.isElectron) throw new Error("Feature disponible uniquement sur l'application Desktop");
       
       const filename = getSafeFilename(fullRiotId);
       const saveRes = await window.electronAPI.saveSession(filename);
       
       if (!saveRes.success) throw new Error('Compte ajouté mais erreur sauvegarde session: ' + saveRes.error);
       
       emit('session-saved', fullRiotId);
    }
    
    emit('smurf-added');
    close();
  } catch (e) {
    errorMessage.value = e.message;
  } finally {
    loading.value = false;
    importing.value = false;
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



.import-section {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.btn-import {
  width: 100%;
  padding: 12px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px dashed var(--accent-primary);
  color: var(--accent-primary);
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-import:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.2);
  transform: translateY(-1px);
}

.btn-import:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--border-subtle);
}

.divider span {
  padding: 0 10px;
}
</style>
