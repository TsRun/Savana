<template>
  <div class="app-container">
    <div class="titlebar" v-if="isElectron">
      <div class="titlebar-title">
        <img src="/SavanaLogo.jpg" alt="Savana" class="titlebar-logo" />
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
    <div class="content-wrapper" :class="{ 'with-titlebar': isElectron }">
      <Login v-if="!isAuthenticated" @login-success="handleLoginSuccess" />
      <div v-else class="main-layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="logo">
            <img src="/SavanaLogo.jpg" alt="Savana" class="logo-img" />
            <div class="logo-text">
              <span class="logo-title">Savana</span>
              <span class="logo-subtitle">v2.0</span>
            </div>
          </div>
        </div>
        <nav class="sidebar-nav">
          <a href="#" class="nav-item" :class="{ active: currentView === 'accounts' }" @click.prevent="currentView = 'accounts'">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
            </svg>
            <span>Accounts</span>
          </a>
          <a href="#" class="nav-item" :class="{ active: currentView === 'friends' }" @click.prevent="showFriendsTab">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            <span>Friends</span>
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

      <!-- VIEW: ACCOUNTS -->
      <main v-if="currentView === 'accounts'" class="main-content">
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
              <select v-model="statsQueue" class="select-input" style="width: 120px;" title="Filter Stats by Queue">
                  <option value="soloq">SoloQ</option>
                  <option value="flex">Flex</option>
                  <option value="all">All</option>
              </select>
            </div>
            <button @click="openAddModal" class="btn btn-add-account" title="Add a new account by Riot ID">
              + Add Account
            </button>
            <button @click="saveAllSessions" :disabled="loading" class="btn btn-primary" title="Re-login each account via Riot Client and re-save their sessions. Uses existing sessions first, falls back to manual login.">
              Resave All
            </button>
            <button @click="resetClient" class="btn btn-danger-outline" title="Ferme Riot + LoL et supprime la session active">
              Logout
            </button>
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
            @update-credentials="handleUpdateCredentials"
          />
        </div>
        <div v-if="filteredSmurfs.length === 0 && !loading" class="empty-state">
          <div class="empty-icon">No Data</div>
          <h3>No accounts found</h3>
          <button @click="openAddModal" class="btn btn-primary">+ Add Account</button>
        </div>
      </main>
      
      <!-- VIEW: FRIENDS -->
      <main v-if="currentView === 'friends'" class="main-content">
        <FriendsView 
          :friends="friends"
          :smurfs="smurfs"
          v-model:showSmurfs="showSmurfsInFriends"
          :loading="loadingFriends"
          @open-add="showAddFriendModal = true"
          @delete-friend="handleDeleteFriend"
          @refresh-friend="handleRefreshFriend"
          @refresh-smurf="handleRefreshSmurf"
        />
      </main>

    </div>
    </div>
    <AddSmurfModal :isOpen="showAddModal" @close="showAddModal = false" @smurf-added="handleSmurfAdded" @session-saved="handleSessionSaved" />
    <AddFriendModal :isOpen="showAddFriendModal" @close="showAddFriendModal = false" @friend-added="fetchFriends" />
    <ConfirmDialog
      :isOpen="confirmDialog.isOpen"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :confirmText="confirmDialog.confirmText"
      :cancelText="confirmDialog.cancelText"
      :thirdText="confirmDialog.thirdText"
      :inputs="confirmDialog.inputs"
      :autoConfirm="confirmDialog.autoConfirm"
      :type="confirmDialog.type"
      @confirm="handleDialogConfirm"
      @cancel="handleDialogCancel"
      @third="handleDialogThird"
    />
    <div class="toast-container">
      <div v-for="toast in toasts" :key="toast.id" :class="['toast', 'toast-' + toast.type]">{{ toast.message }}</div>
    </div>
    <TourGuide 
        v-if="isAuthenticated && currentUser" 
        :alreadySeen="tourSeen"
        @finish="handleTourFinish"
    />
    <LoadingOverlay />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import Login from './components/Login.vue';
import AddSmurfModal from './components/AddSmurfModal.vue';
import AddFriendModal from './components/AddFriendModal.vue';
import SmurfCard from './components/SmurfCard.vue';
import FriendsView from './components/FriendsView.vue';
import TourGuide from './components/TourGuide.vue';
import LoadingOverlay from './components/LoadingOverlay.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';

const smurfs = ref([]);
const friends = ref([]);
const loading = ref(false);
const loadingFriends = ref(false);
const error = ref(null);
const displayRank = ref('soloq');
const searchQuery = ref('');
const isAuthenticated = ref(false);
const currentUser = ref(null);
const showAddModal = ref(false);
const showAddFriendModal = ref(false);
const toasts = ref([]);
const currentView = ref('accounts');
const showSmurfsInFriends = ref(false);
const statsQueue = ref('soloq');
const globalCancelled = ref(false);

const handleGlobalCancel = () => {
  globalCancelled.value = true;
  loading.value = false;
  // Abort all long-running main process operations immediately
  window.electronAPI?.abortRiotOperations?.();
  // Kill Riot Client
  window.electronAPI?.resetRiotClient?.();
  // If a confirm dialog is open, close it as 'third' (cancel all)
  if (confirmDialog.value.isOpen && confirmDialog.value.onThird) {
    confirmDialog.value.onThird({});
    confirmDialog.value.isOpen = false;
  }
};

// When user changes the queue filter, update backend preferences and re-fetch
watch(statsQueue, async (newQueue) => {
  try {
    await fetch(apiUrl.value + '/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ stats_queue: newQueue })
    });
    await fetchSmurfs();
  } catch (e) {
    console.error('Failed to update queue preference:', e);
  }
});

// Confirm dialog state
const confirmDialog = ref({
  isOpen: false,
  title: '',
  message: '',
  confirmText: 'Confirmer',
  cancelText: 'Annuler',
  thirdText: '',
  inputs: [],
  autoConfirm: 0,
  type: 'info',
  onConfirm: null,
  onCancel: null,
  onThird: null
});

const showConfirm = (options) => {
  return new Promise((resolve) => {
    confirmDialog.value = {
      isOpen: true,
      title: options.title || 'Confirmation',
      message: options.message || 'Êtes-vous sûr ?',
      confirmText: options.confirmText || 'Confirmer',
      cancelText: options.cancelText || 'Annuler',
      thirdText: options.thirdText || '',
      inputs: options.inputs || [],
      autoConfirm: 0,
      type: options.type || 'info',
      onConfirm: (data) => resolve({ action: 'confirm', data }),
      onCancel: (data) => resolve({ action: 'cancel', data }),
      onThird: (data) => resolve({ action: 'third', data })
    };
  });
};

// Trigger autoConfirm on the dialog (increments counter to trigger the watcher)
const triggerAutoConfirm = () => {
  if (confirmDialog.value.isOpen) {
    confirmDialog.value.autoConfirm++;
  }
};

const handleDialogConfirm = (data) => {
  if (confirmDialog.value.onConfirm) confirmDialog.value.onConfirm(data);
  confirmDialog.value.isOpen = false;
};

const handleDialogCancel = (data) => {
  if (confirmDialog.value.onCancel) confirmDialog.value.onCancel(data);
  confirmDialog.value.isOpen = false;
};

const handleDialogThird = (data) => {
  if (confirmDialog.value.onThird) confirmDialog.value.onThird(data);
  confirmDialog.value.isOpen = false;
};

// Sur Linux on utilise la frame native, donc pas de titlebar custom
const isElectron = computed(() => {
  const api = window.electronAPI;
  if (!api?.isElectron) return false;
  // Cacher la titlebar custom sur Linux (frame native)
  return api.platform !== 'linux';
});
import { useApi } from './composables/useApi';

const { apiUrl, initApi } = useApi();

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
    const valA = getScore(a, displayRank.value);
    const valB = getScore(b, displayRank.value);

    // If same rank score, sort by level (higher first)
    if (valA === valB) {
      return (b.Level || 0) - (a.Level || 0);
    }
    
    return valB - valA; // Descending
  });

  return result;
});


const showToast = (message, type = 'info') => {
  const id = Date.now();
  toasts.value.push({ id, message, type });
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3000);
};

const checkAuth = async () => {
  try {
    const res = await fetch(apiUrl.value + '/auth/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      currentUser.value = { ...data.user, preferences: data.preferences };
      isAuthenticated.value = true;
      await fetchSmurfs();
      await fetchFriends();
      // Start auto-refresh and trigger initial stats refresh
      startAutoRefresh();
      refreshElo();
    }
  } catch (e) { console.error('Auth check failed:', e); }
};

const handleLoginSuccess = (data) => {
  isAuthenticated.value = true;
  currentUser.value = { ...data.user, preferences: data.preferences };
  fetchSmurfs();
  fetchFriends();
  // Start auto-refresh and trigger initial stats refresh
  startAutoRefresh();
  refreshElo();
};

const logout = async () => {
  try { await fetch(apiUrl.value + '/auth/logout', { method: 'POST', credentials: 'include' }); } catch (e) {}
  isAuthenticated.value = false;
  currentUser.value = null;
  smurfs.value = [];
  friends.value = [];
};

const getSafeFilename = (pseudo) => {
  return pseudo.replace(/[^a-zA-Z0-9]/g, '_');
};

const fetchSmurfs = async () => {
  try {
    const res = await fetch(apiUrl.value + '/smurfs', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    
    // Si on est dans Electron, vérifier les sessions sauvegardées
    if (window.electronAPI?.isElectron) {
      try {
        const savedSessions = await window.electronAPI.getSavedSessions();
        smurfs.value = data.map(s => {
            const safeName = s.Pseudo ? getSafeFilename(s.Pseudo) : null;
            const sessionInfo = safeName ? savedSessions.find(sess => sess.name === safeName) : null;
            return {
                ...s,
                hasSession: !!sessionInfo,
                sessionSavedAt: sessionInfo?.savedAt || null
            };
        });
      } catch (e) {
        console.error('Error checking sessions:', e);
        smurfs.value = data;
      }
    } else {
      smurfs.value = data;
    }
  } catch (e) { error.value = "Could not load accounts."; }
};

// === FRIENDS LOGIC ===

const showFriendsTab = () => {
  currentView.value = 'friends';
  fetchFriends();
};

const fetchFriends = async () => {
  loadingFriends.value = true;
  try {
    const res = await fetch(apiUrl.value + '/friends', { credentials: 'include' });
    if (res.ok) {
      friends.value = await res.json();
    }
  } catch (e) {
    console.error('Failed to load friends', e);
  } finally {
    loadingFriends.value = false;
  }
};

const handleDeleteFriend = async (id) => {
  try {
    const res = await fetch(`${apiUrl.value}/friends/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      showToast('Friend removed', 'success');
      fetchFriends();
    }
  } catch (e) { showToast('Error removing friend', 'error'); }
};

const handleRefreshFriend = async (payload) => {
  const friendId = typeof payload === 'object' ? payload.id : payload;
  const queue = typeof payload === 'object' ? payload.queue : 'soloq';
  
  showToast(`Refreshing friend stats (${queue})...`, 'info');
  try {
    await fetch(`${apiUrl.value}/friends/${friendId}/refresh`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', 
      body: JSON.stringify({ queue }) 
    });
    setTimeout(() => {
      fetchFriends();
      showToast('Friend stats updated', 'success');
    }, 2000);
  } catch (e) {
    showToast('Failed to refresh friend', 'error');
  }
};

const handleRefreshSmurf = async (payload) => {
  const smurfId = typeof payload === 'object' ? payload.id : payload;
  const queue = typeof payload === 'object' ? payload.queue : 'soloq';

  showToast(`Refreshing smurf stats (${queue})...`, 'info');
  try {
    // Note: Assuming /smurfs/:id/refresh also accepts body now.
    // I need to update smurfs.js route next.
    await fetch(`${apiUrl.value}/smurfs/${smurfId}/refresh`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ queue })
    });
    setTimeout(() => {
      fetchSmurfs();
      showToast('Smurf stats updated', 'success');
    }, 3000);
  } catch (e) {
    showToast('Failed to refresh smurf', 'error');
  }
};


const refreshElo = async (force = false) => {
  loading.value = true;
  error.value = null;
  showToast(force ? 'Mise à jour complète...' : 'Refreshing...', 'info');
  try {
    await fetch(apiUrl.value + '/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ period: '30', queue: statsQueue.value, force }) });
    setTimeout(async () => { await fetchSmurfs(); loading.value = false; showToast('Done!', 'success'); }, 3000);
  } catch (e) { error.value = e.message; loading.value = false; }
};

const resetClient = async () => {
  const confirmed = await showConfirm({
    title: 'Réinitialiser le client',
    message: 'Cela va fermer Riot et League of Legends, puis supprimer la session active. Continuer ?',
    confirmText: 'Réinitialiser',
    cancelText: 'Annuler',
    type: 'warning'
  });

  if (confirmed.action !== 'confirm') return;

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

const saveAllSessions = async () => {
  if (!window.electronAPI?.isElectron) {
    showToast('Disponible uniquement sur l\'application Desktop', 'error');
    return;
  }

  if (smurfs.value.length === 0) {
    showToast('Aucun compte a sauvegarder', 'error');
    return;
  }

  const confirmed = await showConfirm({
    title: 'Resave All Sessions',
    message: `Re-login each account via Riot Client and resave their sessions.\nAccounts with an existing session will be tried first. Others will open Riot Client for manual login.\n\nContinue?`,
    confirmText: 'Lancer',
    cancelText: 'Annuler',
    type: 'info'
  });
  if (confirmed.action !== 'confirm') return;

  globalCancelled.value = false;
  await window.electronAPI?.resetAbortFlag?.();
  const total = smurfs.value.length;
  let saved = 0;
  let skipped = 0;
  let cancelled = false;
  let originalSessionPuuid = null;

  // Check if Riot Client is already logged in — save that account first without killing
  try {
    const loginCheck = await window.electronAPI.checkRiotLogin();
    if (loginCheck.loggedIn && loginCheck.puuid) {
      originalSessionPuuid = loginCheck.puuid;
      // Backup the current session so we can restore it at the end
      await window.electronAPI.backupRiotSession();

      // Find matching account and save its session immediately
      const currentAccount = smurfs.value.find(s => s.PUUID === originalSessionPuuid);
      if (currentAccount) {
        const name = currentAccount.Pseudo?.split('#')[0] || '?';
        const filename = currentAccount.Pseudo ? getSafeFilename(currentAccount.Pseudo) : null;
        if (filename) {
          const saveRes = await window.electronAPI.saveSession(filename);
          if (saveRes.success) {
            saved++;
            showToast(`${name} — Session saved (already connected)`, 'success');
          }
        }
      }
    }
  } catch (e) {
    console.error('Pre-check error:', e);
  }

  for (let i = 0; i < smurfs.value.length; i++) {
    if (globalCancelled.value) { cancelled = true; break; }

    // Skip the account that was already saved at the start
    if (smurfs.value[i].PUUID === originalSessionPuuid) continue;

    const smurf = smurfs.value[i];
    const name = smurf.Pseudo?.split('#')[0] || '?';
    const filename = smurf.Pseudo ? getSafeFilename(smurf.Pseudo) : null;
    if (!filename) { skipped++; continue; }

    const label = `[${i + 1}/${total}] ${name}`;
    smurf.is_syncing = true;

    try {
      let autoLoggedIn = false;

      // Step 1: Kill Riot + Launch with session or clean
      if (smurf.hasSession) {
        showToast(`${name} — Chargement session...`, 'info');
        const loadRes = await window.electronAPI.loadSessionRiotOnly(filename, { timeout: 25000, label });
        if (globalCancelled.value) { smurf.is_syncing = false; cancelled = true; break; }
        if (loadRes.success && loadRes.clientStarted) {
          const loginCheck = await window.electronAPI.checkRiotLogin();
          if (globalCancelled.value) { smurf.is_syncing = false; cancelled = true; break; }
          autoLoggedIn = loginCheck.loggedIn;
        }
      }

      if (globalCancelled.value) { smurf.is_syncing = false; cancelled = true; break; }

      if (!autoLoggedIn) {
        // No session or session didn't work — launch clean for manual login
        if (!smurf.hasSession) {
          showToast(`${name} — Ouverture Riot Client...`, 'info');
          await window.electronAPI.launchRiotOnly();
          if (globalCancelled.value) { smurf.is_syncing = false; cancelled = true; break; }
        }

        // Poll for login in background — auto-close dialog when user logs in
        let dialogResolved = false;
        window.electronAPI.waitRiotLogin({ timeout: 120000 }).then(res => {
          if (dialogResolved) return;
          if (res.loggedIn) triggerAutoConfirm();
        });

        // Show dialog — user logs in manually while filling credentials
        const { action, data } = await showConfirm({
          title: `${label}`,
          message: 'Connectez-vous manuellement au Riot Client.\nLa connexion sera detectee automatiquement.',
          confirmText: 'Save',
          cancelText: 'Skip',
          thirdText: 'Cancel All',
          inputs: [
            { key: 'username', label: 'Username', placeholder: 'Riot username', value: smurf.UserName || '' },
            { key: 'password', label: 'Password', type: 'password', placeholder: 'Password', value: smurf.Password || '' }
          ],
          type: 'info'
        });
        dialogResolved = true;

        // Save credentials if changed
        const newUser = (data?.username || '').trim();
        const newPass = (data?.password || '').trim();
        if (newUser !== (smurf.UserName || '') || newPass !== (smurf.Password || '')) {
          try {
            await fetch(`${apiUrl.value}/smurfs/${smurf.id}/credentials`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ username: newUser, password: newPass })
            });
            smurf.UserName = newUser;
            smurf.Password = newPass;
          } catch (e) { console.error('Credential save error:', e); }
        }

        if (action === 'third' || globalCancelled.value) {
          smurf.is_syncing = false;
          cancelled = true;
          break;
        }
        if (action !== 'confirm') {
          smurf.is_syncing = false;
          skipped++;
          continue;
        }
      } else {
        // Auto-logged in via session — still show quick dialog for credential editing
        const { action, data } = await showConfirm({
          title: `${label}`,
          message: 'Connecte automatiquement via session existante.',
          confirmText: 'Save',
          cancelText: 'Skip',
          thirdText: 'Cancel All',
          inputs: [
            { key: 'username', label: 'Username', placeholder: 'Riot username', value: smurf.UserName || '' },
            { key: 'password', label: 'Password', type: 'password', placeholder: 'Password', value: smurf.Password || '' }
          ],
          type: 'info'
        });

        // Save credentials if changed
        const newUser = (data?.username || '').trim();
        const newPass = (data?.password || '').trim();
        if (newUser !== (smurf.UserName || '') || newPass !== (smurf.Password || '')) {
          try {
            await fetch(`${apiUrl.value}/smurfs/${smurf.id}/credentials`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ username: newUser, password: newPass })
            });
            smurf.UserName = newUser;
            smurf.Password = newPass;
          } catch (e) { console.error('Credential save error:', e); }
        }

        if (action === 'third' || globalCancelled.value) {
          smurf.is_syncing = false;
          cancelled = true;
          break;
        }
        if (action !== 'confirm') {
          smurf.is_syncing = false;
          skipped++;
          continue;
        }
      }

      // Save the session
      await new Promise(r => setTimeout(r, 1000));
      const saveRes = await window.electronAPI.saveSession(filename);
      if (saveRes.success) {
        saved++;
        showToast(`${name} — Session saved`, 'success');
      } else {
        showToast(`${name} — Erreur sauvegarde: ${saveRes.error}`, 'error');
      }
    } catch (e) {
      console.error(`Save all error for ${name}:`, e);
    }

    smurf.is_syncing = false;
  }

  // Restore the original session that was active before the flow
  if (originalSessionPuuid) {
    try {
      await window.electronAPI.restoreRiotSession();
    } catch (e) {
      console.error('Restore session error:', e);
    }
  }

  await fetchSmurfs();
  if (cancelled) {
    showToast(`Annule. ${saved} sauvegarde(s) avant annulation.`, 'info');
  } else {
    showToast(`Termine ! ${saved} sauvegarde(s), ${skipped} passe(s)`, 'success');
  }
};

const openAddModal = () => { showAddModal.value = true; };
const handleSmurfAdded = async () => { await fetchSmurfs(); showToast('Account added!', 'success'); };
const handleSessionSaved = (riotId) => { showToast(`Session sauvegardée pour ${riotId}`, 'success'); };

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

const handleUpdateCredentials = async ({ id, username, password }) => {
  try {
    const res = await fetch(`${apiUrl.value}/smurfs/${id}/credentials`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) throw new Error('Failed to update');
    await fetchSmurfs();
    showToast('Credentials updated', 'success');
  } catch (e) {
    showToast('Failed to update credentials', 'error');
  }
};

const deleteSmurf = async (smurfId) => {
  const confirmed = await showConfirm({
    title: 'Supprimer le compte',
    message: 'Êtes-vous sûr de vouloir supprimer ce compte ? Cette action est irréversible.',
    confirmText: 'Supprimer',
    cancelText: 'Annuler',
    type: 'danger'
  });

  if (confirmed.action !== 'confirm') return;

  try {
    const res = await fetch(apiUrl.value + '/smurfs/' + smurfId, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { await fetchSmurfs(); showToast('Compte supprimé', 'success'); }
  } catch (e) { showToast('Échec de la suppression', 'error'); }
};


const handleSaveSession = async (smurf) => {
  showToast('Sauvegarde de la session...', 'info');
  try {
    if (!window.electronAPI?.isElectron) throw new Error('Disponible uniquement sur l\'application Desktop');
    
    const filename = smurf.Pseudo ? getSafeFilename(smurf.Pseudo) : null;
    if (!filename) throw new Error('Impossible de générer un nom de fichier pour ce compte');

    // Appeler Electron pour sauvegarder le fichier
    // On passe filename au lieu de smurfId
    const res = await window.electronAPI.saveSession(filename); // Pass directly as property expectation? Wait, updated main.cjs expects { filename } object structure or direct arg? 
    // Checking main.cjs: ipcMain.handle('save-session', async (event, { filename }) ...
    // So we need to pass object { filename: '...' }
    // Wait, let's verify how preload exposes it. Usually it's (...args) => ipcRenderer.invoke('save-session', ...args)
    // If preload matches main usage, we pass object.

    if (!res.success) throw new Error(res.error || 'Erreur inconnue');
    
    await fetchSmurfs(); // Refresh state
    
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
  
  const confirmed = await showConfirm({
    title: 'Charger la session',
    message: `Charger la session pour ${smurf.Pseudo || smurf.UserName} ? Cela va remplacer la session Riot actuelle.`,
    confirmText: 'Charger',
    cancelText: 'Annuler',
    type: 'info'
  });

  if (confirmed.action !== 'confirm') return;

  showToast('Chargement de la session...', 'info');
  try {
    if (!window.electronAPI?.isElectron) throw new Error('Disponible uniquement sur l\'application Desktop');
    
    const filename = smurf.Pseudo ? getSafeFilename(smurf.Pseudo) : null;
    if (!filename) throw new Error('Impossible de générer un nom de fichier pour ce compte');

    const res = await window.electronAPI.loadSession(filename); // Object passed? Need to check preload implementation or assumption.
    // Assuming preload is consistent with: saveSession: (filename) => ipcRenderer.invoke('save-session', { filename })
    // If preload was simply args spreading, then I need to modify preload too or call with object here.
    // I will check preload in next step to be sure, but for now assuming object passing here to be safe if preload spawns args.
    
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
    if (isAuthenticated.value) {
      if (currentView.value === 'friends') fetchFriends();
      else fetchSmurfs();
    }
  }, 5 * 60 * 1000); // 5 minutes
};

const handleTourFinish = () => {
  if (currentUser.value && currentUser.value.preferences) {
      currentUser.value.preferences.tour_completed = 1;
  }
};

const tourSeen = computed(() => {
    return !!(currentUser.value?.preferences?.tour_completed);
});

onMounted(async () => { 
  await initApi();
  checkAuth();
  startAutoRefresh();
});
</script>

<style scoped>
.app-container { height: 100%; width: 100%; display: flex; flex-direction: column; background: var(--bg-primary); overflow: hidden; }
.titlebar { -webkit-app-region: drag; height: 32px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; padding-left: 16px; flex-shrink: 0; }
.titlebar-title { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: var(--text-secondary); }
.titlebar-controls { -webkit-app-region: no-drag; display: flex; height: 100%; }
.titlebar-btn { width: 46px; height: 100%; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: var(--text-secondary); cursor: pointer; transition: background-color 0.1s ease, color 0.1s ease; }
.titlebar-btn:hover { background: var(--bg-tertiary); }
.titlebar-btn.close:hover { background: var(--error); color: white; }
.titlebar-btn svg { width: 10px; height: 10px; }
.main-layout { flex: 1; display: flex; overflow: hidden; min-height: 0; height: 100%; }
.content-wrapper { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.content-wrapper.with-titlebar { margin-top: 32px; }
.sidebar { width: 260px; background: var(--bg-secondary); border-right: 1px solid var(--border-subtle); display: flex; flex-direction: column; flex-shrink: 0; }
.sidebar-header { padding: 24px; border-bottom: 1px solid var(--border-subtle); }
.logo { display: flex; align-items: center; gap: 16px; }
.logo-img { width: 40px; height: 40px; border-radius: 10px; object-fit: contain; }
.logo-text { display: flex; flex-direction: column; }
.logo-title { font-weight: 700; font-size: 1rem; color: var(--text-primary); }
.logo-subtitle { font-size: 0.75rem; color: var(--text-muted); }
.titlebar-icon { width: 24px; height: 24px; background: var(--accent-gradient); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.625rem; color: white; }
.titlebar-logo { width: 20px; height: 20px; border-radius: 4px; object-fit: contain; }
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
.btn-danger-outline { background: transparent; color: var(--error); border: 1px solid var(--error); margin-right: 8px; }
.btn-danger-outline:hover { background: rgba(239, 68, 68, 0.1); }
.btn-add-account { background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.15)); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); }
.btn-add-account:hover { background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.25)); border-color: #10b981; transform: translateY(-1px); }
.select-input { padding: 8px 12px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-subtle); border-radius: 8px; outline: none; font-size: 0.875rem; cursor: pointer; }
</style>
