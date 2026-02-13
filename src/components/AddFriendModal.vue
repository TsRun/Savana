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
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.2s ease; }
.modal-card { background: var(--bg-secondary); width: 400px; border-radius: 16px; border: 1px solid var(--border-subtle); box-shadow: 0 20px 40px rgba(0,0,0,0.4); overflow: hidden; animation: slideUp 0.3s ease; }
.modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; }
.modal-header h3 { margin: 0; font-size: 1.125rem; font-weight: 600; color: var(--text-primary); }
.close-btn { background: none; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer; transition: color 0.15s; line-height: 1; }
.close-btn:hover { color: var(--text-primary); }
.modal-body { padding: 24px; display: flex; flex-direction: column; gap: 16px; }

.riot-input-container { display: flex; align-items: center; width: 100%; padding: 0 16px; background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: 8px; transition: all 0.2s; }
.riot-input-container.focused { border-color: var(--accent-primary); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }
.riot-input-container.error { border-color: var(--error); box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2); }
.input-part { background: transparent; border: none; padding: 12px 0; color: var(--text-primary); font-size: 0.95rem; outline: none; }
.name-part { flex: 1; }
.tag-part { width: 70px; text-align: center; }
.separator { color: var(--text-muted); font-weight: 600; padding: 0 8px; user-select: none; }
.hint { display: block; font-size: 0.75rem; color: var(--text-muted); margin-top: -8px; margin-bottom: 8px; }

.error-msg { color: var(--error); font-size: 0.875rem; background: rgba(239, 68, 68, 0.1); padding: 8px 12px; border-radius: 6px; }
.modal-footer { padding-top: 16px; display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid var(--border-subtle); margin-top: auto; }

.btn { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 0.875rem; cursor: pointer; border: none; transition: all 0.2s; }
.btn-ghost { background: transparent; color: var(--text-secondary); }
.btn-ghost:hover { background: rgba(255,255,255,0.05); color: var(--text-primary); }
.btn-primary { background: var(--accent-gradient); color: white; display: flex; align-items: center; justify-content: center; min-width: 100px; }
.btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.7; cursor: not-allowed; transform: none; }
.spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes spin { to { transform: rotate(360deg); } }

label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px; color: var(--text-secondary); }
</style>
