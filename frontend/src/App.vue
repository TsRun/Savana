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
            <button @click="refreshElo" :disabled="loading" class="btn btn-ghost">
              <span v-if="loading" class="loading-spinner"></span>
              <span v-else>Refresh</span>
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
            @instant-login="handleInstantLogin"
            @copy="handleCopy"
            @delete="deleteSmurf"
            @extract-tokens="openTokenExtractor"
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
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import Login from './components/Login.vue';
import AddSmurfModal from './components/AddSmurfModal.vue';
import SmurfCard from './components/SmurfCard.vue';

const smurfs = ref([]);
const loading = ref(false);
const error = ref(null);
const sortKey = ref('rank');
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
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(s => s.Pseudo?.toLowerCase().includes(query) || s.UserName?.toLowerCase().includes(query));
  }
  return result;
});

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
    smurfs.value = await res.json();
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

const openAddModal = () => { showAddModal.value = true; };
const handleSmurfAdded = async () => { await fetchSmurfs(); showToast('Account added!', 'success'); };

const deleteSmurf = async (smurfId) => {
  if (!confirm('Delete?')) return;
  try {
    const res = await fetch(API_URL + '/smurfs/' + smurfId, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { await fetchSmurfs(); showToast('Deleted', 'success'); }
  } catch (e) { showToast('Failed', 'error'); }
};

const handleInstantLogin = async (smurf) => {
  showToast('Logging in...', 'info');
  try {
    if (window.electronAPI?.isElectron) {
      await window.electronAPI.launchRiotClient(smurf.UserName, smurf.Password);
      showToast('Launched!', 'success');
    } else {
      await navigator.clipboard.writeText(smurf.UserName);
      showToast('Username copied!', 'info');
    }
  } catch (e) { showToast('Failed: ' + e.message, 'error'); }
};

const handleCopy = async (text, type) => { await navigator.clipboard.writeText(text); showToast(type + ' copied!', 'success'); };

const openTokenExtractor = async (smurf) => {
  if (!window.electronAPI?.isElectron) { showToast('Requires desktop app', 'warning'); return; }
  showToast('Extracting...', 'info');
  try {
    const result = await window.electronAPI.extractRiotTokens();
    if (result.success) {
      await fetch('/api/tokens/' + smurf.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: result.tokens }) });
      showToast('Extracted!', 'success');
    } else { throw new Error(result.error); }
  } catch (e) { showToast('Failed: ' + e.message, 'error'); }
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
</style>
