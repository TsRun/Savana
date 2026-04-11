<template>
  <div class="friends-view">
    <header class="friends-header">
      <div class="header-left">
        <h1 class="page-title">Friends</h1>
        <p class="page-subtitle">Track your friends' progress</p>
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
import { computed, ref } from 'vue';
import { useApi } from '../composables/useApi';

const props = defineProps({
  friends: Array,
  smurfs: Array,
  loading: Boolean
});

const emit = defineEmits(['open-add', 'delete-friend', 'refresh-friend', 'refresh-smurf']);
const { apiUrl } = useApi();

const showSmurfs = defineModel('showSmurfs', { default: false });

// Helper to normalize data structure between friend and smurf
const normalizedList = computed(() => {
  const list = [];
  
  // Friends
  if (props.friends) {
    props.friends.forEach(f => {
      list.push({
        id: f.id,
        pseudo: f.pseudo,
        stats: f.stats_json?.stats, // stats_json stores { soloq, flex, stats: { ... } }
        rankData: f.stats_json,     // Store full object for rank access
        type: 'friend',
        raw: f
      });
    });
  }

  // Smurfs
  if (showSmurfs.value && props.smurfs) {
    props.smurfs.forEach(s => {
      // Reconstruct similar structure
      // Smurf object has Elo_SoloQ object directly
      list.push({
        id: s.id,
        pseudo: s.Pseudo,
        stats: s.Stats, // Smurf stats are in .Stats
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

const getTierText = (p) => {
  if (p.type === 'smurf') {
    return p.raw.Elo_SoloQ?.tier ? `${p.raw.Elo_SoloQ.tier} ${p.raw.Elo_SoloQ.rank}` : 'Unranked';
  } else {
    // Friend
    const solo = p.rankData?.soloq;
    return solo?.tier ? `${solo.tier} ${solo.rank}` : 'Unranked';
  }
};

const getTierClass = (p) => {
  const text = getTierText(p);
  if (text === 'Unranked') return 'text-muted';
  const base = text.split(' ')[0].toLowerCase();
  return `text-rank-${base}`;
};

const getTierIcon = (p) => {
  let tier = 'UNRANKED';
  if (p.type === 'smurf') {
    if (p.raw.Elo_SoloQ?.tier) tier = p.raw.Elo_SoloQ.tier;
  } else {
    if (p.rankData?.soloq?.tier) tier = p.rankData.soloq.tier;
  }
  
  if (tier === 'UNRANKED') return null;
  return `/assets/ranks/${tier.toLowerCase()}.png`;
};

const getLP = (p) => {
  if (p.type === 'smurf') return p.raw.Elo_SoloQ?.lp ?? null;
  return p.rankData?.soloq?.lp ?? null;
};

const getMainRole = (p) => {
  return p.stats?.main_role || null;
};

const getRoleIcon = (role) => {
  if (!role || role === 'FILL' || role === 'UNKNOWN') return 'https://raw.communitydragon.org/pbe/plugins/rcp-fe-lol-static-assets/global/default/svg/position-fill.svg';
  
  let roleLower = role.toLowerCase();
  if (roleLower === 'utility') roleLower = 'support';
  if (roleLower === 'mid') roleLower = 'middle';
  if (roleLower === 'bot') roleLower = 'bottom';
  
  return `https://raw.communitydragon.org/pbe/plugins/rcp-fe-lol-static-assets/global/default/svg/position-${roleLower}.svg`;
};

const getChampIcon = (name) => {
  return `https://ddragon.leagueoflegends.com/cdn/14.2.1/img/champion/${name}.png`;
};

const getTopChamps = (p) => {
  return p.stats?.best_champions || [];
};

const getGlobalWr = (p) => {
  if (!p.stats) return null;
  return { winrate: p.stats.winrate, games: p.stats.total_games };
};

const getWrClass = (wr) => {
  if (wr >= 60) return 'text-gold';
  if (wr >= 50) return 'text-success';
  return 'text-muted';
};

// === Actions ===

const deleteFriend = (id) => {
  if (confirm('Remove this friend?')) {
    emit('delete-friend', id);
  }
};

const statsFilter = ref('soloq');

const refreshPlayer = (p) => {
  if (p.type === 'friend') emit('refresh-friend', { id: p.id, queue: statsFilter.value });
  else emit('refresh-smurf', { id: p.id, queue: statsFilter.value });
};

</script>

<style scoped>
.friends-view { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.friends-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 32px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-secondary); flex-shrink: 0; }
.header-left { display: flex; flex-direction: column; gap: 4px; }
.page-title { font-size: 1.5rem; font-weight: 700; }
.page-subtitle { color: var(--text-muted); font-size: 0.875rem; }
.header-actions { display: flex; align-items: center; gap: 24px; }
.toggle-switch { display: flex; align-items: center; gap: 12px; cursor: pointer; }
.toggle-switch input { display: none; }
.toggle-slider { width: 40px; height: 20px; background: var(--bg-tertiary); border-radius: 20px; position: relative; transition: 0.2s; border: 1px solid var(--border-subtle); }
.toggle-slider::after { content: ''; position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; background: var(--text-muted); border-radius: 50%; transition: 0.2s; }
input:checked + .toggle-slider { background: var(--accent-primary); border-color: var(--accent-primary); }
input:checked + .toggle-slider::after { transform: translateX(20px); background: white; }
.toggle-label { font-size: 0.875rem; font-weight: 500; color: var(--text-secondary); }

.table-container { flex: 1; overflow-y: auto; padding: 0; }
.friends-table { width: 100%; border-collapse: collapse; text-align: left; }
.friends-table th { position: sticky; top: 0; background: var(--bg-primary); z-index: 10; padding: 12px 24px; font-weight: 600; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; border-bottom: 1px solid var(--border-subtle); }
.friends-table td { padding: 16px 24px; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
.friends-table tr:last-child td { border-bottom: none; }
.friends-table tr:hover { background: var(--bg-tertiary); }

.col-rank { width: 180px; }
.col-name { width: 250px; }
.col-role { width: 80px; text-align: center; }
.col-champs { width: 200px; }
.col-wr { width: 100px; }
.col-actions { width: 100px; text-align: right; }

.rank-badge-cell { display: flex; align-items: center; gap: 12px; }
.rank-icon-sm { width: 32px; height: 32px; object-fit: contain; }
.rank-info { display: flex; flex-direction: column; }
.lp-text { font-size: 0.75rem; color: var(--text-muted); }

.player-identity { display: flex; flex-direction: column; }
.player-name { font-weight: 600; font-size: 0.9375rem; color: var(--text-primary); }
.smurf-badge { font-size: 0.625rem; background: var(--accent-gradient); color: white; padding: 2px 6px; border-radius: 4px; align-self: flex-start; margin-top: 4px; font-weight: 700; }

.role-icon { width: 24px; height: 24px; opacity: 0.8; }

.champs-list { display: flex; gap: 8px; }
.champ-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.champ-icon { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--border-subtle); }
.champ-wr { font-size: 0.625rem; font-weight: 600; }

.wr-cell { display: flex; flex-direction: column; }
.wr-val { font-weight: 700; font-size: 0.9375rem; }
.wr-games { font-size: 0.75rem; color: var(--text-muted); }

.btn-icon { background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 6px; border-radius: 6px; transition: 0.2s; }
.btn-icon:hover { background: var(--bg-secondary); color: var(--text-primary); }
.btn-icon.delete:hover { color: var(--error); background: rgba(239, 68, 68, 0.1); }

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

.text-gold { color: #fbbf24; }
.text-success { color: #34d399; }
.text-muted { color: var(--text-muted); }
.text-center { text-align: center; }

.select-input { 
  padding: 8px 12px; 
  background: var(--bg-tertiary); 
  color: var(--text-primary); 
  border: 1px solid var(--border-subtle); 
  border-radius: 8px; 
  outline: none; 
  font-size: 0.875rem; 
  cursor: pointer; 
}
.select-input:focus { 
  border-color: var(--accent-primary); 
  box-shadow: 0 0 0 3px var(--accent-glow); 
}
</style>
