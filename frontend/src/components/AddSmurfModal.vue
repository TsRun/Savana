<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="close">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Ajouter un compte</h3>
        <button @click="close" class="close-btn">×</button>
      </div>
      
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>Riot ID (Pseudo#Tag)</label>
          <input 
            v-model="form.riotId" 
            type="text" 
            placeholder="Ex: TsRun#EUW"
            required
          >
          <small>Format: NomDeJeu#Tag - Le PUUID sera récupéré automatiquement</small>
        </div>
        
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" @click="close">
            Annuler
          </button>
          <button type="submit" class="btn btn-primary" :disabled="loading || !form.riotId">
            {{ loading ? 'Ajout...' : 'Ajouter' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close', 'smurf-added']);

const loading = ref(false);

const form = ref({
  riotId: ''
});

const API_URL = '/api';

watch(() => props.isOpen, (val) => {
  if (val) {
    form.value = { riotId: '' };
  }
});

function close() {
  emit('close');
}

async function handleSubmit() {
  loading.value = true;
  
  try {
    const res = await fetch(`${API_URL}/smurfs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ pseudo: form.value.riotId })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Erreur lors de l\'ajout');
    }
    
    emit('smurf-added');
    close();
  } catch (e) {
    alert('Erreur: ' + e.message);
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

.form-group {
  margin-bottom: 16px;
}

.form-group label {
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

.form-group input::placeholder {
  color: var(--text-muted);
}

.form-group small {
  display: block;
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--text-muted);
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
</style>
