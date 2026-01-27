<template>
  <div class="app-container">
    <div class="titlebar" v-if="isElectron">
      <div class="titlebar-title">
        <span class="titlebar-icon">SV</span>
        <span>Savana</span>
      </div>
      <div class="titlebar-controls">
        <button class="titlebar-btn minimize" @click="minimizeWindow" title="Minimize">
          <svg viewBox="0 0 10 1"><path d="M0 0h10v1H0z" fill="currentColor"/></svg>
        </button>
        <button class="titlebar-btn maximize" @click="maximizeWindow" title="Maximize">
          <svg viewBox="0 0 10 10"><path d="M0 0v10h10V0H0zm1 1h8v8H1V1z" fill="currentColor"/></svg>
        </button>
        <button class="titlebar-btn close" @click="closeWindow" title="Close">
          <svg viewBox="0 0 10 10"><path d="M1 0L0 1l4 4-4 4 1 1 4-4 4 4 1-1-4-4 4-4-1-1-4 4-4-4z" fill="currentColor"/></svg>
        </button>
      </div>
    </div>
    <Login v-if="!isAuthenticated" @login-success="handleLoginSuccess" />
    <div v-else class="main-layout" :class="{ 'with-titlebar': isElectron }">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="logo">
            <div class="logo-icon-box">SV</div>
            <div class="logo-text">
              <span class="logo-title">Savana</span>
              <span class="logo-subtitle">v2.0</span>
            </div>
          </div>
        </div>
        <nav class="sidebar-nav">
          <a href="#" class="nav-item active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
            </svg>
            <span>Accounts</span>
          </a>
        </nav>
        <div class="sidebar-footer">
          <div class="user-profile">
            <div class="user-avatar">{{ currentUser?.username?.charAt(0).toUpperCase() }}</div>
            <div class="user-info">
              <span class="user-name">{{ currentUser?.username }}</span>
              <span class="user-status">Online</span>
            </div>
            <button @click="logout" class="logout-btn" title="Logout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>
      <main class="main-content">
        <header class="content-header">
          <div class="header-left">
            <h1 class="page-title">My Accounts</h1>
            <p class="page-subtitle">{{ smurfs.length }} accounts</p>
          </div>
          <div class="header-actions">
            <div class="search-box">
              <input type="text" v-model="searchQuery" placeholder="Search..." class="search-input" />
            </div>
            
            <div class="filter-controls" style="display: flex; gap: 8px;">
              <select v-model="sortBy" class="select-input" @change="handleSortChange">
                <option value="soloq">Sort: SoloQ</option>
                <option value="flex">Sort: Flex</option>
                <option value="level">Sort: Level</option>
                <option value="name">Sort: Name</option>
              </select>
              
              <div class="toggle-group" style="display: flex; background: var(--bg-tertiary); padding: 2px; border-radius: 8px;">
                <button 
                  @click="displayRank = 'soloq'" 
                  class="toggle-btn" 
                  :class="{ active: displayRank === 'soloq' }"
                  style="padding: 4px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.75rem; font-weight: 600;"
                  title="Show SoloQ Rank"
                >SoloQ</button>
                <button 
                  @click="displayRank = 'flex'" 
                  class="toggle-btn" 
                  :class="{ active: displayRank === 'flex' }"
                  style="padding: 4px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.75rem; font-weight: 600;"
                  title="Show Flex Rank"
                >Flex</button>
              </div>
            </div>
            <button @click="refreshElo" :disabled="loading" class="btn btn-ghost">
              <span v-if="loading" class="loading-spinner"></span>
              <span v-else>Refresh</span>
            </button>
            <button @click="resetClient" class="btn btn-danger-outline" title="Ferme Riot + LoL et supprime la session active">
              Reset Client
            </button>
            <button @click="openAddModal" class="btn btn-primary">+ Add</button>
          </div>
        </header>
        <div v-if="error" class="error-banner">{{ error }}</div>
        <div class="accounts-grid">
          <SmurfCard 
            v-for="smurf in filteredSmurfs" 
            :key="smurf.id || smurf.PUUID"
            :smurf="smurf"
            :displayRank="displayRank"
            @copy="handleCopy"
            @delete="deleteSmurf"
            @save-session="handleSaveSession"
            @load-session="handleLoadSession"
          />
        </div>
        <div v-if="filteredSmurfs.length === 0 && !loading" class="empty-state">
          <div class="empty-icon">No Data</div>
          <h3>No accounts found</h3>
          <button @click="openAddModal" class="btn btn-primary">+ Add Account</button>
        </div>
      </main>
    </div>
    <AddSmurfModal :isOpen="showAddModal" @close="showAddModal = false" @smurf-added="handleSmurfAdded" />
    <div class="toast-container">
      <div v-for="toast in toasts" :key="toast.id" :class="['toast', 'toast-' + toast.type]">{{ toast.message }}</div>
    </div>
    <TourGuide v-if="isAuthenticated" />
    <LoadingOverlay />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import Login from './components/Login.vue';
import AddSmurfModal from './components/AddSmurfModal.vue';
import SmurfCard from './components/SmurfCard.vue';
import TourGuide from './components/TourGuide.vue';
import LoadingOverlay from './components/LoadingOverlay.vue';

const smurfs = ref([]);
const loading = ref(false);
const error = ref(null);
const sortKey = ref('soloq'); // Replaced by sortBy but keeping variable name structure consistent if needed
const sortBy = ref('soloq');
const displayRank = ref('soloq');
const searchQuery = ref('');
const isAuthenticated = ref(false);
const currentUser = ref(null);
const showAddModal = ref(false);
const toasts = ref([]);

// Sur Linux on utilise la frame native, donc pas de titlebar custom
const isElectron = computed(() => {
  const api = window.electronAPI;
  if (!api?.isElectron) return false;
  // Cacher la titlebar custom sur Linux (frame native)
  return api.platform !== 'linux';
});
const API_URL = '/api';

const filteredSmurfs = computed(() => {
  let result = [...smurfs.value];
  
  // Filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(s => s.Pseudo?.toLowerCase().includes(query) || s.UserName?.toLowerCase().includes(query));
  }
  
  // Sort
  const getTierValue = (tier) => {
    if (!tier) return 0;
    const tiers = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
    return tiers.indexOf(tier.toUpperCase()) * 1000;
  };

  const getDivisionValue = (rank) => {
    if (!rank) return 0;
    const divs = { 'I': 400, 'II': 300, 'III': 200, 'IV': 100 };
    return divs[rank] || 0;
  };

  const getScore = (smurf, type) => {
    if (type === 'level') return smurf.Level || 0;
    if (type === 'name') return smurf.Pseudo || smurf.UserName || '';
    
    const data = type === 'flex' ? (smurf.Elo_Flex || {}) : (smurf.Elo_SoloQ || {});
    if (!data.tier) return -1; // Unranked at bottom
    
    return getTierValue(data.tier) + getDivisionValue(data.rank) + (data.lp || 0);
  };

  result.sort((a, b) => {
    const valA = getScore(a, sortBy.value);
    const valB = getScore(b, sortBy.value);

    if (sortBy.value === 'name') {
      return valA.localeCompare(valB);
    }
    
    return valB - valA; // Descending for everything else
  });

  return result;
});

const handleSortChange = () => {
    if (sortBy.value === 'flex') displayRank.value = 'flex';
    if (sortBy.value === 'soloq') displayRank.value = 'soloq';
};

const showToast = (message, type = 'info') => {
  const id = Date.now();
  toasts.value.push({ id, message, type });
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3000);
};

const checkAuth = async () => {
  try {
    const res = await fetch(API_URL + '/auth/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      currentUser.value = data.user;
      isAuthenticated.value = true;
      await fetchSmurfs();
    }
  } catch (e) { console.error('Auth check failed:', e); }
};

const handleLoginSuccess = (data) => {
  isAuthenticated.value = true;
  currentUser.value = data.user;
  fetchSmurfs();
};

const logout = async () => {
  try { await fetch(API_URL + '/auth/logout', { method: 'POST', credentials: 'include' }); } catch (e) {}
  isAuthenticated.value = false;
  currentUser.value = null;
  smurfs.value = [];
};

const fetchSmurfs = async () => {
  try {
    const res = await fetch(API_URL + '/smurfs', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    
    // Si on est dans Electron, vérifier les sessions sauvegardées
    if (window.electronAPI?.isElectron) {
      try {
        const savedIds = await window.electronAPI.getSavedSessions();
        smurfs.value = data.map(s => ({
          ...s,
          hasSession: savedIds.includes(String(s.id))
        }));
      } catch (e) {
        console.error('Error checking sessions:', e);
        smurfs.value = data;
      }
    } else {
      smurfs.value = data;
    }
  } catch (e) { error.value = "Could not load accounts."; }
};

const refreshElo = async () => {
  loading.value = true;
  error.value = null;
  showToast('Refreshing...', 'info');
  try {
    await fetch(API_URL + '/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ period: '30', queue: 'ranked' }) });
    setTimeout(async () => { await fetchSmurfs(); loading.value = false; showToast('Done!', 'success'); }, 3000);
  } catch (e) { error.value = e.message; loading.value = false; }
};

const resetClient = async () => {
  if (!confirm('Voulez-vous réinitialiser le client ?\n\nCela va fermer Riot/League et supprimer la session active.')) return;
  
  showToast('Réinitialisation...', 'info');
  try {
    if (!window.electronAPI?.isElectron) throw new Error('Disponible uniquement sur l\'application Desktop');
    
    const res = await window.electronAPI.resetRiotClient();
    
    if (!res.success) throw new Error(res.error || 'Erreur inconnue');
    
    showToast('Client réinitialisé', 'success');
  } catch (e) {
    showToast('Echec: ' + e.message, 'error');
  }
};

const openAddModal = () => { showAddModal.value = true; };
const handleSmurfAdded = async () => { await fetchSmurfs(); showToast('Account added!', 'success'); };

const handleCopy = async (text, type) => {
  try {
    if (!text) throw new Error('Texte vide');
    
    if (window.electronAPI?.writeToClipboard) {
      window.electronAPI.writeToClipboard(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
    showToast(type + ' copied!', 'success');
  } catch (e) {
    console.error('Copy error:', e);
    showToast('Failed to copy ' + type, 'error');
  }
};

const deleteSmurf = async (smurfId) => {
  if (!confirm('Delete?')) return;
  try {
    const res = await fetch(API_URL + '/smurfs/' + smurfId, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { await fetchSmurfs(); showToast('Deleted', 'success'); }
  } catch (e) { showToast('Failed', 'error'); }
};


const handleSaveSession = async (smurf) => {
  showToast('Sauvegarde de la session...', 'info');
  try {
    if (!window.electronAPI?.isElectron) throw new Error('Disponible uniquement sur l\'application Desktop');
    
    // Appeler Electron pour sauvegarder le fichier
    const res = await window.electronAPI.saveSession(smurf.id);
    
    if (!res.success) throw new Error(res.error || 'Erreur inconnue');
    
    // Mise à jour locale
    const idx = smurfs.value.findIndex(s => s.id === smurf.id);
    if (idx !== -1) smurfs.value[idx].hasSession = true;
    
    showToast('Session sauvegardée pour ' + (smurf.Pseudo || smurf.UserName), 'success');
  } catch (e) {
    showToast('Echec: ' + e.message, 'error');
  }
};

const handleLoadSession = async (smurf) => {
  if (!smurf.hasSession) {
    showToast('Aucune session sauvegardée pour ce compte.', 'error');
    return;
  }
  
  if (!confirm('Charger la session pour ' + (smurf.Pseudo || smurf.UserName) + '?\n\nAttention: Riot Client sera fermé de force.')) return;
  
  showToast('Chargement de la session...', 'info');
  try {
    if (!window.electronAPI?.isElectron) throw new Error('Disponible uniquement sur l\'application Desktop');
    
    const res = await window.electronAPI.loadSession(smurf.id);
    
    if (!res.success) throw new Error(res.error || 'Erreur inconnue');
    
    showToast('Session chargée ! Vous pouvez lancer Riot.', 'success');
  } catch (e) {
    showToast('Echec: ' + e.message, 'error');
  }
};

const minimizeWindow = () => window.electronAPI?.minimizeWindow();
const maximizeWindow = () => window.electronAPI?.maximizeWindow();
const closeWindow = () => window.electronAPI?.closeWindow();

// Auto-refresh toutes les 5 minutes
let autoRefreshInterval = null;

const startAutoRefresh = () => {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(async () => {
    if (isAuthenticated.value && smurfs.value.length > 0) {
      console.log('🔄 Auto-refresh triggered');
      await fetchSmurfs(); // Juste récupérer les données à jour
    }
  }, 5 * 60 * 1000); // 5 minutes
};

onMounted(() => { 
  checkAuth();
  startAutoRefresh();
});
</script>

<style scoped>
.app-container { height: 100%; width: 100%; display: flex; flex-direction: column; background: var(--bg-primary); overflow: hidden; }
.titlebar { -webkit-app-region: drag; height: 32px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; padding-left: 16px; flex-shrink: 0; }
.titlebar-icon { font-size: 14px; }
.titlebar-title { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: var(--text-secondary); }
.titlebar-controls { -webkit-app-region: no-drag; display: flex; height: 100%; }
.titlebar-btn { width: 46px; height: 100%; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: var(--text-secondary); cursor: pointer; transition: background-color 0.1s ease, color 0.1s ease; }
.titlebar-btn:hover { background: var(--bg-tertiary); }
.titlebar-btn.close:hover { background: var(--error); color: white; }
.titlebar-btn svg { width: 10px; height: 10px; }
.main-layout { flex: 1; display: flex; overflow: hidden; min-height: 0; }
.main-layout.with-titlebar { flex: 1; }
.sidebar { width: 260px; background: var(--bg-secondary); border-right: 1px solid var(--border-subtle); display: flex; flex-direction: column; flex-shrink: 0; }
.sidebar-header { padding: 24px; border-bottom: 1px solid var(--border-subtle); }
.logo { display: flex; align-items: center; gap: 16px; }
.logo-icon-box { width: 40px; height: 40px; background: var(--accent-gradient); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.875rem; color: white; }
.logo-text { display: flex; flex-direction: column; }
.logo-title { font-weight: 700; font-size: 1rem; color: var(--text-primary); }
.logo-subtitle { font-size: 0.75rem; color: var(--text-muted); }
.titlebar-icon { width: 24px; height: 24px; background: var(--accent-gradient); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.625rem; color: white; }
.loading-spinner { width: 14px; height: 14px; border: 2px solid var(--text-muted); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }
.sidebar-nav { flex: 1; padding: 16px; }
.nav-item { display: flex; align-items: center; gap: 16px; padding: 8px 16px; border-radius: 10px; color: var(--text-secondary); font-weight: 500; text-decoration: none; transition: background-color 0.15s ease, color 0.15s ease; }
.nav-item:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.nav-item.active { background: var(--accent-gradient); color: white; }
.nav-icon { width: 20px; height: 20px; }
.sidebar-footer { padding: 16px; border-top: 1px solid var(--border-subtle); }
.user-profile { display: flex; align-items: center; gap: 16px; padding: 8px; border-radius: 10px; background: var(--bg-tertiary); }
.user-avatar { width: 36px; height: 36px; background: var(--accent-gradient); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 600; color: white; }
.user-info { flex: 1; display: flex; flex-direction: column; }
.user-name { font-weight: 500; color: var(--text-primary); font-size: 0.875rem; }
.user-status { font-size: 0.75rem; color: var(--success); }
.logout-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; border-radius: 6px; color: var(--text-muted); cursor: pointer; transition: background-color 0.15s ease, color 0.15s ease; }
.logout-btn:hover { background: var(--error); color: white; }
.logout-btn svg { width: 18px; height: 18px; }
.main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-primary); contain: layout style; }
.content-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 32px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-secondary); flex-shrink: 0; transform: translateZ(0); }
.header-left { display: flex; flex-direction: column; gap: 4px; }
.page-title { font-size: 1.5rem; font-weight: 700; }
.page-subtitle { color: var(--text-muted); font-size: 0.875rem; }
.header-actions { display: flex; align-items: center; gap: 16px; }
.search-box { position: relative; }
.search-input { width: 220px; padding: 8px 16px; font-size: 0.875rem; color: var(--text-primary); background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: 10px; outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
.search-input:focus { border-color: var(--accent-primary); box-shadow: 0 0 0 3px var(--accent-glow); }
.error-banner { display: flex; align-items: center; gap: 16px; padding: 16px 32px; background: rgba(239, 68, 68, 0.1); border-bottom: 1px solid rgba(239, 68, 68, 0.3); color: var(--error); }
.accounts-grid { flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 24px; padding: 32px; overflow-y: auto; align-content: start; contain: layout style; will-change: scroll-position; }
.empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: var(--text-muted); }
.empty-icon { font-size: 4rem; opacity: 0.5; }
.empty-state h3 { color: var(--text-secondary); font-size: 1.25rem; }

.btn { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 0.875rem; cursor: pointer; border: none; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; }
.btn-primary { background: var(--accent-gradient); color: white; }
.btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
.btn-ghost { background: transparent; color: var(--text-secondary); border: 1px solid var(--border-subtle); }
.btn-ghost:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.btn-danger-outline { background: transparent; color: var(--error); border: 1px solid var(--error); margin-right: 8px; }
.btn-danger-outline:hover { background: rgba(239, 68, 68, 0.1); }
.select-input { padding: 8px 12px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-subtle); border-radius: 8px; outline: none; font-size: 0.875rem; cursor: pointer; }
.toggle-btn { background: transparent; color: var(--text-muted); transition: all 0.2s; }
.toggle-btn:hover { color: var(--text-primary); }
.toggle-btn.active { background: var(--bg-secondary); color: var(--accent-primary); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
</style>
