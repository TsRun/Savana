<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="close">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Add Friend</h3>
        <button class="close-btn" @click="close">&times;</button>
      </div>
      
      <div class="modal-body">
        <form @submit.prevent="submit">
          <label>Riot ID</label>
          <div class="riot-input-container" :class="{ 'focused': isFocused, 'error': error }">
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
            />
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
            />
          </div>
          <small class="hint">Collez votre Riot ID complet (Ex: Faker#T1)</small>
          
          <div v-if="error" class="error-msg">{{ error }}</div>
          
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" @click="close" :disabled="loading">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="loading || !form.gameName || !form.tagLine">
              <span v-if="loading" class="spinner"></span>
              <span v-else>Add Friend</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import { useApi } from '../composables/useApi';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close', 'friend-added']);

const form = ref({ gameName: '', tagLine: '' });
const error = ref('');
const loading = ref(false);
const isFocused = ref(false);
const nameInput = ref(null);
const tagInput = ref(null);

const { apiUrl } = useApi();

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    form.value = { gameName: '', tagLine: '' };
    error.value = '';
    loading.value = false;
    nextTick(() => nameInput.value?.focus());
  }
});

const clearError = () => { if (error.value) error.value = ''; };

const handlePaste = (e) => {
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
};

const handleNameInput = (e) => {
    const val = e.target.value;
    if (val.includes('#')) {
        const [name, tag] = val.split('#');
        form.value.gameName = name;
        if (tag) form.value.tagLine = tag;
        nextTick(() => tagInput.value?.focus());
    }
};

const handleTagBackspace = () => {
  if (!form.value.tagLine) nameInput.value?.focus();
};

const close = () => {
  if (!loading.value) emit('close');
};

const submit = async () => {
  if (!form.value.gameName.trim() || !form.value.tagLine.trim()) return;
  
  const riotId = `${form.value.gameName.trim()}#${form.value.tagLine.trim()}`;
  
  loading.value = true;
  error.value = '';
  
  try {
    const res = await fetch(`${apiUrl.value}/friends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ riotId })
    });
    
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || 'Failed to add friend');
    
    emit('friend-added');
    close();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: var(--z-modal); animation: fadeIn 0.2s ease; }
.modal-card { background: var(--bg-secondary); width: 400px; border-radius: var(--radius-lg); border: 1px solid var(--border-strong); box-shadow: var(--shadow-lg); overflow: hidden; animation: slideUp 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); }
.modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; }
.modal-header h3 { margin: 0; font-family: var(--font-display); font-size: 1.1rem; font-weight: 600; letter-spacing: -0.01em; color: var(--text-primary); }
.close-btn { background: none; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer; transition: color 0.15s; line-height: 1; }
.close-btn:hover { color: var(--text-primary); }
.modal-body { padding: 24px; display: flex; flex-direction: column; gap: 16px; }

.riot-input-container { display: flex; align-items: center; width: 100%; padding: 0 16px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
.riot-input-container.focused { border-color: var(--accent-primary); box-shadow: var(--focus-ring); }
.riot-input-container.error { border-color: var(--error); box-shadow: inset 0 0 0 1px var(--error); }
.input-part { background: transparent; border: none; padding: 12px 0; color: var(--text-primary); font-size: 0.95rem; outline: none; }
.name-part { flex: 1; }
.tag-part { width: 70px; text-align: center; }
.separator { color: var(--text-muted); font-weight: 600; padding: 0 8px; user-select: none; }
.hint { display: block; font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.03em; color: var(--text-muted); margin-top: -8px; margin-bottom: 8px; }

.error-msg { color: var(--error); font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.03em; background: rgba(209, 104, 104, 0.08); border: 1px solid rgba(209, 104, 104, 0.3); padding: 8px 12px; border-radius: var(--radius-sm); }
.modal-footer { padding-top: 16px; display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid var(--border-subtle); margin-top: auto; }

/* .btn, .btn-ghost, .btn-primary : styles globaux (style.css) */
.btn-primary { min-width: 100px; }
.spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes spin { to { transform: rotate(360deg); } }

label { display: block; font-family: var(--font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 7px; color: var(--text-muted); }
</style>
