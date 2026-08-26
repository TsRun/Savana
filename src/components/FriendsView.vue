<template>
  <div class="friends-view">
    <header class="friends-header">
      <div class="header-left">
        <h1 class="page-title">Your <em class="script">Friends</em></h1>
        <p class="page-subtitle eyebrow">Track your friends' progress</p>
      </div>
      <div class="header-actions">
        <label class="toggle-switch">
          <input type="checkbox" v-model="showSmurfs">
          <span class="toggle-slider"></span>
          <span class="toggle-label">Include my smurfs</span>
        </label>
        
        <select v-model="statsFilter" class="select-input">
          <option value="soloq">SoloQ</option>
          <option value="flex">Flex</option>
          <option value="all">All Modes</option>
        </select>

        <button @click="refreshAllFriends" class="btn btn-secondary" title="Rafraîchir les stats de tous les amis pour la queue sélectionnée">Refresh</button>
        <button @click="emit('open-add')" class="btn btn-primary">+ Add Friend</button>
      </div>
    </header>

    <div class="table-container">
      <table class="friends-table">
        <thead>
          <tr>
            <th class="col-rank">Rank</th>
            <th class="col-name">Name</th>
            <th class="col-role">Main Role</th>
            <th class="col-champs">Top Champions</th>
            <th class="col-wr">Winrate</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading" class="loading-row">
            <td colspan="6" class="text-center">Loading...</td>
          </tr>
          
          <tr v-else-if="sortedList.length === 0" class="empty-row">
            <td colspan="6" class="text-center">No friends added yet.</td>
          </tr>

          <tr v-for="player in sortedList" :key="player.id + '-' + player.type" :class="player.type">
            <!-- Rank -->
            <td class="col-rank">
               <div class="rank-badge-cell">
                 <img v-if="getTierIcon(player)" :src="getTierIcon(player)" class="rank-icon-sm" />
                 <div class="rank-info">
                   <span :class="getTierClass(player)">{{ getTierText(player) }}</span>
                   <span class="lp-text" v-if="getLP(player) !== null">{{ getLP(player) }} LP</span>
                 </div>
               </div>
            </td>

            <!-- Name -->
            <td class="col-name">
              <div class="player-identity">
                <span class="player-name">{{ player.pseudo }}</span>
                <span v-if="player.type === 'smurf'" class="smurf-badge">YOU</span>
              </div>
            </td>

            <!-- Role -->
            <td class="col-role">
              <div v-if="getMainRole(player)" class="role-cell" :title="getMainRole(player)">
                <img :src="getRoleIcon(getMainRole(player))" class="role-icon" />
              </div>
              <span v-else class="text-muted">-</span>
            </td>

            <!-- Champions -->
            <td class="col-champs">
              <div class="champs-list">
                <div v-for="champ in getTopChamps(player)" :key="champ.name" class="champ-item" :title="champ.name + ' (' + champ.winrate + '%)'">
                  <img :src="getChampIcon(champ.name)" class="champ-icon" />

                </div>
              </div>
            </td>

            <!-- Winrate -->
            <td class="col-wr">
               <div v-if="getGlobalWr(player)" class="wr-cell">
                 <span class="wr-val" :class="getWrClass(getGlobalWr(player).winrate)">{{ getGlobalWr(player).winrate }}%</span>
                 <span class="wr-games">{{ getGlobalWr(player).games }}G</span>
               </div>
               <span v-else class="text-muted">-</span>
            </td>

            <!-- Actions -->
            <td class="col-actions">
              <button v-if="player.type === 'friend'" @click="refreshFriend(player.id)" class="btn-icon" title="Refresh stats">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
              </button>
              <button v-if="player.type === 'friend'" @click="deleteFriend(player.id)" class="btn-icon delete" title="Remove Friend">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useApi } from '../composables/useApi';

const props = defineProps({
  friends: Array,
  smurfs: Array,
  loading: Boolean,
  // Queue du filtre principal (vue Accounts) : les stats des smurfs sont calculées pour elle
  smurfsQueue: { type: String, default: 'soloq' }
});

const emit = defineEmits(['open-add', 'delete-friend', 'refresh-friend', 'refresh-smurf']);
const { apiUrl } = useApi();

const showSmurfs = defineModel('showSmurfs', { default: false });

const statsFilter = ref('soloq');

// Queue de rang affichée (pour 'all', on garde la SoloQ comme référence)
const rankQueue = computed(() => statsFilter.value === 'flex' ? 'flex' : 'soloq');

// Stats pour la queue sélectionnée (null si pas encore calculées pour cette queue)
const getStats = (p) => {
  if (p.type === 'friend') {
    const sj = p.raw.stats_json;
    if (!sj) return null;
    if (sj.stats_by_queue && statsFilter.value in sj.stats_by_queue) {
      return sj.stats_by_queue[statsFilter.value];
    }
    // Données legacy : stats de la dernière queue rafraîchie, uniquement si elle correspond
    if ((sj.filter?.queue || 'soloq') === statsFilter.value) return sj.stats;
    return null;
  }
  // Smurf : ses stats sont calculées pour la queue du filtre principal
  return props.smurfsQueue === statsFilter.value ? p.raw.Stats : null;
};

// Helper to normalize data structure between friend and smurf
const normalizedList = computed(() => {
  const list = [];

  // Friends
  if (props.friends) {
    props.friends.forEach(f => {
      list.push({
        id: f.id,
        pseudo: f.pseudo,
        rankData: f.stats_json,     // Store full object for rank access
        type: 'friend',
        raw: f
      });
    });
  }

  // Smurfs
  if (showSmurfs.value && props.smurfs) {
    props.smurfs.forEach(s => {
      list.push({
        id: s.id,
        pseudo: s.Pseudo,
        type: 'smurf',
        raw: s
      });
    });
  }

  return list;
});

const sortedList = computed(() => {
  return [...normalizedList.value].sort((a, b) => {
    // Sort by tier roughly
    const valA = getRankScore(a);
    const valB = getRankScore(b);
    return valB - valA;
  });
});

const getRankScore = (p) => {
  const tier = getTierText(p); // "Diamond IV" or "Unranked"
  if (tier === 'Unranked') return 0;
  
  const tiers = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
  const tBase = tier.split(' ')[0].toUpperCase();
  const tIdx = tiers.indexOf(tBase);
  if (tIdx === -1) return 0;
  
  // Rough division handling
  const div = tier.split(' ')[1] || 'I';
  const divs = { 'I': 400, 'II': 300, 'III': 200, 'IV': 100 };
  
  return (tIdx * 1000) + (divs[div] || 0) + (getLP(p) || 0);
};

// === Data Accessors ===

// Objet rang (tier/rank/lp) selon la queue sélectionnée
const getRankObj = (p) => {
  if (p.type === 'smurf') {
    return (rankQueue.value === 'flex' ? p.raw.Elo_Flex : p.raw.Elo_SoloQ) || null;
  }
  return p.rankData?.[rankQueue.value] || null;
};

const getTierText = (p) => {
  const r = getRankObj(p);
  return r?.tier ? `${r.tier} ${r.rank}` : 'Unranked';
};

const getTierClass = (p) => {
  const text = getTierText(p);
  if (text === 'Unranked') return 'text-muted';
  const base = text.split(' ')[0].toLowerCase();
  return `text-rank-${base}`;
};

const getTierIcon = (p) => {
  const tier = getRankObj(p)?.tier;
  if (!tier) return null;
  return `/assets/ranks/${tier.toLowerCase()}.png`;
};

const getLP = (p) => {
  return getRankObj(p)?.lp ?? null;
};

const getMainRole = (p) => {
  return getStats(p)?.main_role || null;
};

const getRoleIcon = (role) => {
  if (!role || role === 'FILL' || role === 'UNKNOWN') return 'https://raw.communitydragon.org/pbe/plugins/rcp-fe-lol-static-assets/global/default/svg/position-fill.svg';
  
  let roleLower = role.toLowerCase();
  if (roleLower === 'utility') roleLower = 'support';
  if (roleLower === 'mid') roleLower = 'middle';
  if (roleLower === 'bot') roleLower = 'bottom';
  
  return `https://raw.communitydragon.org/pbe/plugins/rcp-fe-lol-static-assets/global/default/svg/position-${roleLower}.svg`;
};

// Icônes locales (le CDN ddragon épinglé sur un vieux patch cassait les champions récents)
const getChampIcon = (name) => {
  return `/assets/champions/${name}.png`;
};

const getTopChamps = (p) => {
  return getStats(p)?.best_champions || [];
};

const getGlobalWr = (p) => {
  const stats = getStats(p);
  if (!stats) return null;
  return { winrate: stats.winrate, games: stats.total_games };
};

const getWrClass = (wr) => {
  if (wr >= 60) return 'text-gold';
  if (wr >= 50) return 'text-success';
  return 'text-muted';
};

// === Actions ===

// La confirmation est gérée par le ConfirmDialog global (App.vue)
const deleteFriend = (id) => {
  emit('delete-friend', id);
};

const refreshFriend = (id) => {
  emit('refresh-friend', { id, queue: statsFilter.value });
};

const refreshAllFriends = () => {
  (props.friends || []).forEach(f => refreshFriend(f.id));
};

// Au changement de queue, rafraîchir les amis qui n'ont pas encore de stats pour celle-ci
watch(statsFilter, (newQueue) => {
  (props.friends || []).forEach(f => {
    const sj = f.stats_json;
    const hasStats = sj && ((sj.stats_by_queue && newQueue in sj.stats_by_queue) || (sj.filter?.queue || 'soloq') === newQueue);
    if (!hasStats) emit('refresh-friend', { id: f.id, queue: newQueue });
  });
});


</script>

<style scoped>
.friends-view { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.friends-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 32px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-secondary); flex-shrink: 0; }
.header-left { display: flex; flex-direction: column; gap: 4px; }
.page-title { font-size: 1.65rem; font-weight: 600; line-height: 1; }
.page-title .script { font-size: 1.6rem; margin-left: 2px; }
.header-actions { display: flex; align-items: center; gap: 24px; }
.toggle-switch { display: flex; align-items: center; gap: 12px; cursor: pointer; }
.toggle-switch input { display: none; }
.toggle-slider { width: 40px; height: 20px; background: var(--bg-tertiary); border-radius: var(--radius-full); position: relative; transition: background 140ms ease-out; border: 1px solid var(--border-color); }
.toggle-slider::after { content: ''; position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; background: var(--text-muted); border-radius: 50%; transition: 0.2s; }
input:checked + .toggle-slider { background: var(--accent-primary); border-color: var(--accent-primary); }
input:checked + .toggle-slider::after { transform: translateX(20px); background: var(--bg-primary); }
.toggle-label { font-family: var(--font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-secondary); }

.table-container { flex: 1; overflow-y: auto; padding: 0; }
.friends-table { width: 100%; border-collapse: collapse; text-align: left; }
.friends-table th { position: sticky; top: 0; background: var(--bg-primary); z-index: var(--z-sticky); padding: 12px 24px; font-family: var(--font-mono); font-weight: 500; font-size: 9.5px; letter-spacing: 0.18em; color: var(--text-muted); text-transform: uppercase; border-bottom: 1px solid var(--border-color); }
.friends-table td { padding: 16px 24px; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
.friends-table tr:last-child td { border-bottom: none; }
.friends-table tr:hover { background: var(--bg-card-hover); }

.col-rank { width: 180px; }
.col-name { width: 250px; }
.col-role { width: 80px; text-align: center; }
.col-champs { width: 200px; }
.col-wr { width: 100px; }
.col-actions { width: 100px; text-align: right; }

.rank-badge-cell { display: flex; align-items: center; gap: 12px; }
.rank-icon-sm { width: 32px; height: 32px; object-fit: contain; }
.rank-info { display: flex; flex-direction: column; }
.lp-text { font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.04em; color: var(--text-muted); }

.player-identity { display: flex; flex-direction: column; }
.player-name { font-family: var(--font-display); font-weight: 600; font-size: 0.95rem; letter-spacing: -0.005em; color: var(--text-primary); }
.smurf-badge { font-family: var(--font-mono); font-size: 0.55rem; letter-spacing: 0.14em; background: var(--accent-gradient); color: var(--bg-primary); padding: 2px 8px; border-radius: var(--radius-full); align-self: flex-start; margin-top: 4px; font-weight: 700; }

.role-icon { width: 24px; height: 24px; opacity: 0.8; }

.champs-list { display: flex; gap: 8px; }
.champ-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.champ-icon { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--border-subtle); }
.champ-wr { font-size: 0.625rem; font-weight: 600; }

.wr-cell { display: flex; flex-direction: column; }
.wr-val { font-family: var(--font-mono); font-weight: 700; font-size: 0.85rem; }
.wr-games { font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted); }

.btn-icon { background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 6px; border-radius: var(--radius-sm); transition: 0.2s; }
.btn-icon svg { width: 16px; height: 16px; display: block; }
.btn-icon:hover { background: var(--bg-secondary); color: var(--text-primary); }
.btn-icon.delete:hover { color: var(--error); background: rgba(209, 104, 104, 0.1); }

.text-rank-iron { color: #574d4f; }
.text-rank-bronze { color: #8c513a; }
.text-rank-silver { color: #80989d; }
.text-rank-gold { color: #cdfafa; text-shadow: 0 0 10px rgba(205, 250, 250, 0.4); }
.text-rank-platinum { color: #4e9996; }
.text-rank-emerald { color: #00cf85; }
.text-rank-diamond { color: #576bce; }
.text-rank-master { color: #9d48e0; text-shadow: 0 0 10px rgba(157, 72, 224, 0.4); }
.text-rank-grandmaster { color: #e13a4b; text-shadow: 0 0 10px rgba(225, 58, 75, 0.4); }
.text-rank-challenger { color: #f4c874; text-shadow: 0 0 10px rgba(244, 200, 116, 0.4); }

.text-gold { color: var(--gold); }
.text-success { color: var(--success); }
.text-muted { color: var(--text-muted); }
.text-center { text-align: center; }
</style>
