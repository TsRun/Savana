<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="close">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Add Account</h3>
        <button @click="close" class="close-btn">X</button>
      </div>
      
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>PUUID</label>
          <input 
            v-model="form.puuid" 
            type="text" 
            placeholder="PUUID Riot" 
            required
          >
          <small>Trouvez votre PUUID sur le site Riot Developer</small>
        </div>
        
        <div class="form-group">
          <label>Pseudo (in-game)</label>
          <input 
            v-model="form.pseudo" 
            type="text" 
            placeholder="Nom d'invocateur" 
            required
          >
        </div>
        
        <div class="form-group">
          <label>Username</label>
          <input 
            v-model="form.username" 
            type="text" 
            placeholder="Nom de connexion Riot" 
            required
          >
        </div>
        
        <div class="form-group">
          <label>Password</label>
          <input 
            v-model="form.password" 
            type="password" 
            placeholder="Mot de passe" 
            required
          >
        </div>
        
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" @click="close">
            Annuler
          </button>
          <button type="submit" class="btn btn-primary" :disabled="loading">
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

const emit = defineEmits(['close', 'add']);

const loading = ref(false);
const form = ref({
  puuid: '',
  pseudo: '',
  username: '',
  password: ''
});

watch(() => props.isOpen, (val) => {
  if (val) {
    form.value = { puuid: '', pseudo: '', username: '', password: '' };
  }
});

function close() {
  emit('close');
}

async function handleSubmit() {
  loading.value = true;
  try {
    emit('add', { ...form.value });
    close();
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
  max-width: 450px;
  animation: slideUp 0.3s ease;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
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
}

.close-btn:hover {
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 8px;
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
  margin-top: 6px;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 28px;
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
