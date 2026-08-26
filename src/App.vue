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
      <div class="main-layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="logo">
            <img src="/SavanaLogo.jpg" alt="Savana" class="logo-img" />
            <div class="logo-text">
              <span class="logo-title">Savana</span>
              <span class="logo-subtitle eyebrow">No 02 &middot; v2.0</span>
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
          <div class="data-actions">
            <button @click="exportData" class="data-btn" title="Exporter tous les comptes, amis et préférences dans un fichier JSON">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Exporter</span>
            </button>
            <button @click="triggerImport" class="data-btn" title="Réimporter un fichier d'export Savana (.json)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span>Importer</span>
            </button>
            <input ref="importFileInput" type="file" accept=".json,application/json" style="display: none;" @change="handleImportFile" />
          </div>
        </div>
      </aside>

      <!-- VIEW: ACCOUNTS -->
      <main v-if="currentView === 'accounts'" class="main-content">
        <header class="content-header">
          <div class="header-left">
            <h1 class="page-title">My <em class="script">Accounts</em></h1>
            <p class="page-subtitle eyebrow">{{ smurfs.length }} accounts &middot; ranked tracker</p>
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
            <button @click="refreshElo(true)" :disabled="loading" class="btn btn-secondary" title="Actualiser les élos et stats de tous les comptes (Ctrl+R)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 6px;">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
              </svg>
              Refresh
            </button>
            <button @click="openAddModal" class="btn btn-success-soft" title="Add a new account by Riot ID">
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
          <div
            v-for="smurf in filteredSmurfs"
            :key="smurf.id || smurf.PUUID"
            class="drag-wrapper"
            :class="{ 'drag-over': dragState.overId === (smurf.id || smurf.PUUID), 'drag-source': dragState.dragId === (smurf.id || smurf.PUUID) && dragState.dragging }"
            draggable="true"
            @dragstart="onDragStart($event, smurf)"
            @dragover="onDragOver($event, smurf)"
            @dragleave="onDragLeave($event, smurf)"
            @drop="onDrop($event, smurf)"
            @dragend="onDragEnd"
          >
            <SmurfCard
              :smurf="smurf"
              :displayRank="displayRank"
              :queueFilter="statsQueue"
              :flippedId="flippedCardId"
              @copy="handleCopy"
              @delete="deleteSmurf"
              @save-session="handleSaveSession"
              @load-session="handleLoadSession"
              @update-credentials="handleUpdateCredentials"
              @disconnect-session="handleDisconnectSession"
              @flip="(id) => flippedCardId = id"
              @flip-back="flippedCardId = null"
            />
          </div>
        </div>
        <div v-if="filteredSmurfs.length === 0 && !loading" class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/>
            <line x1="22" y1="11" x2="16" y2="11"/>
          </svg>
          <h3>No accounts found</h3>
          <button @click="openAddModal" class="btn btn-primary">+ Add Account</button>
        </div>
      </main>
      
      <!-- VIEW: FRIENDS -->
      <main v-if="currentView === 'friends'" class="main-content">
        <FriendsView
          :friends="friends"
          :smurfs="smurfs"
          :smurfsQueue="statsQueue"
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
      :locked="confirmDialog.locked"
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
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
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
// Le rang affiché suit le filtre de queue (Flex sélectionnée => élo Flex)
const displayRank = computed(() => statsQueue.value === 'flex' ? 'flex' : 'soloq');
const searchQuery = ref('');
const isAuthenticated = ref(false);
const currentUser = ref(null);
const showAddModal = ref(false);
const showAddFriendModal = ref(false);
const flippedCardId = ref(null);
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
    // Les comptes sans stats calculées pour cette queue sont mis en file de refresh
    await refreshPendingStats(newQueue);
  } catch (e) {
    console.error('Failed to update queue preference:', e);
  }
});

// Calcule les stats manquantes pour la queue sélectionnée, puis re-fetch
// périodiquement tant que des comptes sont en attente.
let pendingPollTimer = null;
const refreshPendingStats = async (queue) => {
  const pending = smurfs.value.filter(s => s.StatsState === 'pending');
  if (pending.length === 0) return;

  showToast(`Calcul des stats ${queue} pour ${pending.length} compte(s)...`, 'info');
  await Promise.all(pending.map(s =>
    fetch(`${apiUrl.value}/smurfs/${s.id}/refresh`, { method: 'POST', credentials: 'include' })
      .catch(() => {})
  ));

  clearInterval(pendingPollTimer);
  let attempts = 0;
  pendingPollTimer = setInterval(async () => {
    attempts++;
    await fetchSmurfs();
    const stillPending = smurfs.value.some(s => s.StatsState === 'pending');
    if (!stillPending || attempts >= 30) {
      clearInterval(pendingPollTimer);
      pendingPollTimer = null;
      if (!stillPending) showToast('Stats à jour', 'success');
    }
  }, 10000);
};

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
  locked: false,
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
      locked: options.locked || false,
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

// Drag and drop reordering
const dragState = ref({ dragging: false, dragId: null, overId: null });

const onDragStart = (e, smurf) => {
  const smurfKey = smurf.id || smurf.PUUID;
  if (flippedCardId.value === smurfKey) return e.preventDefault();
  dragState.value.dragging = true;
  dragState.value.dragId = smurf.id || smurf.PUUID;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', '');
  e.target.closest('.card-wrapper').classList.add('dragging');
};

const onDragOver = (e, smurf) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const targetId = smurf.id || smurf.PUUID;
  if (targetId !== dragState.value.dragId) {
    dragState.value.overId = targetId;
  }
};

const onDragLeave = (e, smurf) => {
  const targetId = smurf.id || smurf.PUUID;
  if (dragState.value.overId === targetId) {
    dragState.value.overId = null;
  }
};

const onDrop = async (e, targetSmurf) => {
  e.preventDefault();
  const dragId = dragState.value.dragId;
  const targetId = targetSmurf.id || targetSmurf.PUUID;
  if (!dragId || dragId === targetId) return resetDrag();

  const list = [...filteredSmurfs.value];
  const fromIdx = list.findIndex(s => (s.id || s.PUUID) === dragId);
  const toIdx = list.findIndex(s => (s.id || s.PUUID) === targetId);
  if (fromIdx === -1 || toIdx === -1) return resetDrag();

  const [moved] = list.splice(fromIdx, 1);
  list.splice(toIdx, 0, moved);

  // Update sort_order in smurfs array
  const order = list.map((s, i) => ({ id: s.id, sort_order: i }));
  for (const o of order) {
    const s = smurfs.value.find(x => x.id === o.id);
    if (s) s.sort_order = o.sort_order;
  }

  resetDrag();

  // Persist to backend
  try {
    await fetch(`${apiUrl.value}/smurfs/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ order })
    });
  } catch (e) {
    console.error('Failed to save order:', e);
  }
};

const onDragEnd = () => {
  document.querySelectorAll('.card-wrapper.dragging').forEach(el => el.classList.remove('dragging'));
  resetDrag();
};

const resetDrag = () => {
  dragState.value = { dragging: false, dragId: null, overId: null };
};

const filteredSmurfs = computed(() => {
  let result = [...smurfs.value];

  // Filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(s => s.Pseudo?.toLowerCase().includes(query) || s.UserName?.toLowerCase().includes(query));
  }

  // If any smurf has a sort_order, use manual ordering (from DB)
  const hasManualOrder = result.some(s => s.sort_order != null);
  if (hasManualOrder && !searchQuery.value) {
    result.sort((a, b) => {
      if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order;
      if (a.sort_order != null) return -1;
      if (b.sort_order != null) return 1;
      return 0;
    });
    return result;
  }

  // Default: sort by rank
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
    if (!data.tier) return -1;

    return getTierValue(data.tier) + getDivisionValue(data.rank) + (data.lp || 0);
  };

  result.sort((a, b) => {
    const valA = getScore(a, displayRank.value);
    const valB = getScore(b, displayRank.value);
    if (valA === valB) return (b.Level || 0) - (a.Level || 0);
    return valB - valA;
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

// === EXPORT / IMPORT DES DONNÉES ===

const importFileInput = ref(null);

const exportData = async () => {
  try {
    const res = await fetch(apiUrl.value + '/data/export', { credentials: 'include' });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `savana-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Données exportées', 'success');
  } catch (e) {
    showToast("Échec de l'export", 'error');
  }
};

const triggerImport = () => importFileInput.value?.click();

const handleImportFile = async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    const confirmed = await showConfirm({
      title: 'Importer les données',
      message: `Importer ${data.smurfs?.length || 0} compte(s) et ${data.friends?.length || 0} ami(s) ?\nLes comptes existants (même PUUID) seront mis à jour.`,
      confirmText: 'Importer',
      cancelText: 'Annuler',
      type: 'warning'
    });
    if (confirmed.action !== 'confirm') return;

    const res = await fetch(apiUrl.value + '/data/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Import failed');

    showToast(`Import terminé : ${result.smurfs} compte(s), ${result.friends} ami(s)`, 'success');
    await fetchSmurfs();
    await fetchFriends();
  } catch (err) {
    showToast("Échec de l'import : " + err.message, 'error');
  }
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
  const confirmed = await showConfirm({
    title: 'Retirer cet ami',
    message: 'Retirer cet ami de votre liste ?',
    confirmText: 'Retirer',
    cancelText: 'Annuler',
    type: 'danger'
  });
  if (confirmed.action !== 'confirm') return;

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
    // Le calcul prend ~30s (rate limit API) : re-fetch au début puis à la fin
    setTimeout(() => fetchFriends(), 3000);
    setTimeout(() => {
      fetchFriends();
      showToast('Friend stats updated', 'success');
    }, 35000);
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
          locked: true,
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
      }
      // Auto-logged in via session — save directly, no dialog needed

      // Get current PUUID from Riot Client and sync Riot ID
      try {
        const loginInfo = await window.electronAPI.checkRiotLogin();
        if (loginInfo.loggedIn && loginInfo.puuid) {
          await fetch(`${apiUrl.value}/smurfs/sync-riot-id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ puuid: loginInfo.puuid })
          });
        }
      } catch (e) { console.error('Sync Riot ID error:', e); }

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
  // Dismiss the status bar
  window.electronAPI?.updateLaunchStatus?.({ status: 'idle' });

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
    showToast('Updated', 'success');
  } catch (e) {
    showToast('Failed to update: ' + e.message, 'error');
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

    // Sync Riot ID from active session
    try {
      const loginInfo = await window.electronAPI.checkRiotLogin();
      if (loginInfo.loggedIn && loginInfo.puuid) {
        await fetch(`${apiUrl.value}/smurfs/sync-riot-id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ puuid: loginInfo.puuid })
        });
      }
    } catch (e) { /* ignore */ }

    await fetchSmurfs();
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

  const name = smurf.Pseudo?.split('#')[0] || smurf.UserName || '?';
  showToast(`${name} — Fermeture de Riot, lancement de League...`, 'info');
  try {
    if (!window.electronAPI?.isElectron) throw new Error('Disponible uniquement sur l\'application Desktop');

    const filename = smurf.Pseudo ? getSafeFilename(smurf.Pseudo) : null;
    if (!filename) throw new Error('Impossible de générer un nom de fichier pour ce compte');

    const res = await window.electronAPI.loadSession(filename);
    if (!res.success) throw new Error(res.error || 'Erreur inconnue');

    showToast(`${name} — League is starting`, 'success');
  } catch (e) {
    showToast('Echec: ' + e.message, 'error');
  }
};

const handleDisconnectSession = async (smurf) => {
  const name = smurf.Pseudo?.split('#')[0] || smurf.UserName || '?';
  const confirmed = await showConfirm({
    title: 'Disconnect',
    message: `Supprimer la session sauvegardée pour ${name} ?\nLe compte ne pourra plus se connecter automatiquement.`,
    confirmText: 'Disconnect',
    cancelText: 'Annuler',
    type: 'warning'
  });
  if (confirmed.action !== 'confirm') return;

  try {
    const filename = smurf.Pseudo ? getSafeFilename(smurf.Pseudo) : null;
    if (!filename) throw new Error('Nom de fichier invalide');
    const res = await window.electronAPI.deleteSession(filename);
    if (!res.success) throw new Error(res.error || 'Erreur');
    await fetchSmurfs();
    showToast(`${name} — Session supprimée`, 'success');
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

// Ctrl+R / Cmd+R : actualiser les élos (au lieu de recharger la fenêtre)
const handleGlobalKeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    if (!loading.value && !confirmDialog.value.isOpen) refreshElo(true);
  }
};

onMounted(async () => {
  window.addEventListener('keydown', handleGlobalKeydown);
  await initApi();
  checkAuth();
  startAutoRefresh();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  if (pendingPollTimer) clearInterval(pendingPollTimer);
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
});
</script>

<style scoped>
.app-container { height: 100%; width: 100%; display: flex; flex-direction: column; background: var(--bg-primary); overflow: hidden; }
/* .titlebar* : styles globaux (style.css) */
.titlebar { border-bottom: 1px solid var(--border-subtle); padding-left: 16px; }
.main-layout { flex: 1; display: flex; overflow: hidden; min-height: 0; height: 100%; }
.content-wrapper { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.content-wrapper.with-titlebar { margin-top: 32px; }
.sidebar { width: 260px; background: var(--bg-secondary); border-right: 1px solid var(--border-subtle); display: flex; flex-direction: column; flex-shrink: 0; }
.sidebar-header { padding: 24px; border-bottom: 1px solid var(--border-subtle); }
.logo { display: flex; align-items: center; gap: 16px; }
.logo-img { width: 40px; height: 40px; border-radius: var(--radius-md); object-fit: contain; }
.logo-text { display: flex; flex-direction: column; gap: 3px; }
.logo-title { font-family: var(--font-display); font-weight: 600; font-size: 1.05rem; letter-spacing: -0.01em; color: var(--text-primary); }
.titlebar-logo { width: 18px; height: 18px; border-radius: var(--radius-xs); object-fit: contain; }
.sidebar-nav { flex: 1; padding: 16px 12px; }
.nav-item { display: flex; align-items: center; gap: 14px; padding: 11px 14px; border-radius: var(--radius-sm); color: var(--text-muted); font-family: var(--font-mono); font-size: 11px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; text-decoration: none; border-bottom: none; transition: background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast); }
.nav-item:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.nav-item.active { background: var(--bg-tertiary); color: var(--text-primary); box-shadow: inset 2px 0 0 var(--accent-primary); }
.nav-icon { width: 17px; height: 17px; stroke-width: 1.6; }
.sidebar-footer { padding: 16px; border-top: 1px solid var(--border-subtle); }
.data-actions { display: flex; gap: 8px; }
.data-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; height: 36px; background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-secondary); font-family: var(--font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast); }
.data-btn:hover { color: var(--text-primary); background: var(--bg-tertiary); border-color: var(--border-strong); }
.data-btn svg { width: 14px; height: 14px; stroke-width: 1.7; }
.main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-primary); contain: layout style; }
.content-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 32px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-secondary); flex-shrink: 0; transform: translateZ(0); }
.header-left { display: flex; flex-direction: column; gap: 6px; }
.page-title { font-size: 1.65rem; font-weight: 600; line-height: 1; }
.page-title .script { font-size: 1.6rem; margin-left: 2px; }
.header-actions { display: flex; align-items: center; gap: 12px; }
.search-box { position: relative; }
.search-input { width: 200px; height: 36px; padding: 0 14px; font-family: var(--font-body); font-size: 13px; color: var(--text-primary); background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
.search-input::placeholder { color: var(--text-muted); }
.search-input:focus { border-color: var(--accent-primary); box-shadow: var(--focus-ring); }
.error-banner { display: flex; align-items: center; gap: 16px; padding: 14px 32px; background: rgba(209, 104, 104, 0.08); border-bottom: 1px solid rgba(209, 104, 104, 0.3); color: var(--error); font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.04em; }
.accounts-grid { flex: 1; display: grid; grid-template-columns: repeat(auto-fill, 380px); justify-content: center; gap: 24px; padding: 32px; overflow-y: auto; align-content: start; contain: layout style; will-change: scroll-position; }
.drag-wrapper { position: relative; transition: transform 0.2s ease, opacity 0.2s ease; }
.drag-wrapper.drag-source { opacity: 0.4; transform: scale(0.95); }
.drag-wrapper.drag-over { transform: scale(1.02); }
.drag-wrapper.drag-over::before { content: ''; position: absolute; inset: -4px; border: 1px dashed var(--accent-primary); border-radius: var(--radius-lg); pointer-events: none; z-index: 10; }
.empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: var(--text-muted); }
.empty-icon { width: 64px; height: 64px; opacity: 0.4; }
.empty-state h3 { color: var(--text-secondary); font-size: 1.25rem; }
</style>
