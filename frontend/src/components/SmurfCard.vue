<template>
  <div class="smurf-card card" @mouseenter="isHovered = true" @mouseleave="isHovered = false">
    <!-- Card Header -->
    <div class="card-header">
      <div class="account-info">
        <div class="account-name">{{ getPseudoName }}</div>
        <div class="account-tag">{{ getTag }}</div>
      </div>
      <div class="account-level">
        <span class="level-value">{{ smurf.Level || '?' }}</span>
        <span class="level-label">LVL</span>
      </div>
      
      <!-- Sync Status -->
      <div v-if="smurf.is_syncing" class="sync-status" title="Mise à jour en cours...">
        <div class="spinner-sm"></div>
      </div>
    </div>

    <!-- Rank Section -->
    <div class="rank-section-container">
      <div v-for="queue in ['SoloQ', 'Flex']" :key="queue" class="rank-row">
        <div class="rank-display">
          <img 
            v-if="getRankIcon(queue)" 
            :src="getRankIcon(queue)" 
            :alt="getRankTier(queue)" 
            class="rank-emblem"
            :style="getRankStyle(queue)"
          />
          <div v-else class="rank-unranked">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div class="rank-details">
            <div class="rank-type">{{ queue }}</div>
            <div class="rank-tier">{{ getRankTier(queue) }}</div>
            <div class="rank-lp">{{ getRankLP(queue) }} LP</div>
          </div>
        </div>
        <div class="rank-stats">
          <div class="stat-item">
            <span class="stat-value" :class="getWinrateClass(getWinrate(queue))">{{ getWinrate(queue) }}%</span>
            <span class="stat-label">WR</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ getGames(queue) }}</span>
            <span class="stat-label">G</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Stats Section -->
    <div class="stats-section" v-if="smurf.Stats">
      <!-- Main Role -->
      <div class="role-badge">
        <img 
          v-if="smurf.Stats.main_role" 
          :src="getRoleIcon(smurf.Stats.main_role)" 
          :alt="smurf.Stats.main_role"
          class="role-icon"
        />
        <div class="role-info">
          <span class="role-name">{{ smurf.Stats.main_role }}</span>
          <span class="role-pct">{{ smurf.Stats.role_percentage }}%</span>
        </div>
      </div>

      <!-- KDA -->
      <div class="kda-display">
        <div class="kda-values">
          <span class="kda-kills">{{ smurf.Stats.avg_kills?.toFixed(1) }}</span>
          <span class="kda-separator">/</span>
          <span class="kda-deaths">{{ smurf.Stats.avg_deaths?.toFixed(1) }}</span>
          <span class="kda-separator">/</span>
          <span class="kda-assists">{{ smurf.Stats.avg_assists?.toFixed(1) }}</span>
        </div>
        <div class="kda-ratio" :class="kdaClass">{{ smurf.Stats.kda?.toFixed(2) }} KDA</div>
      </div>

      <!-- Best Champions -->
      <div class="champions-section" v-if="bestChamps.length > 0">
        <div class="champ-item" v-for="champ in bestChamps" :key="champ.name">
          <img :src="getChampIcon(champ.name)" :alt="champ.name" class="champ-icon" />
          <div class="champ-stats">
            <span class="champ-wr" :class="getWinrateClass(champ.winrate)">{{ champ.winrate }}%</span>
            <span class="champ-games">{{ champ.games }}G</span>
          </div>
        </div>
      </div>
    </div>

    <!-- No Stats Placeholder -->
    <div class="no-stats" v-else>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M18 20V10"/>
        <path d="M12 20V4"/>
        <path d="M6 20v-6"/>
      </svg>
      <span>No recent games</span>
    </div>

    <!-- Actions Footer -->
    <div class="card-actions">

      

      
      <button 
        @click="$emit('save-session', smurf)" 
        class="action-btn"
        :class="{ 'has-token': smurf.hasSession }"
        :title="smurf.hasSession ? 'Session déjà sauvegardée (clic pour mettre à jour)' : 'Sauvegarder la session actuelle (RiotGamesPrivateSettings.yaml)'"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
      </button>
      
      <button 
        @click="$emit('load-session', smurf)" 
        class="action-btn primary-action"
        :class="{ disabled: !smurf.hasSession }"
        :title="smurf.hasSession ? 'Charger la session (Ferme Riot, Nettoie Data, Copie Session)' : 'Aucune session sauvegardée'"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/>
          <polyline points="10 17 15 12 10 7"/>
          <line x1="15" y1="12" x2="3" y2="12"/>
        </svg>
        <span class="btn-label">Load</span>
      </button>
      
      <button 
        @click="$emit('delete', smurf.id)" 
        class="action-btn danger"
        title="Delete Account"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          <line x1="10" y1="11" x2="10" y2="17"/>
          <line x1="14" y1="11" x2="14" y2="17"/>
        </svg>
      </button>
    </div>

    <!-- Hover Glow Effect -->
    <div class="card-glow" :class="{ active: isHovered }"></div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  smurf: {
    type: Object,
    required: true
  }
});

defineEmits(['copy', 'delete', 'save-session', 'load-session']);

const isHovered = ref(false);

// Computed properties
const getPseudoName = computed(() => {
  if (!props.smurf.Pseudo) return 'Unknown';
  return props.smurf.Pseudo.split('#')[0];
});

const getTag = computed(() => {
  if (!props.smurf.Pseudo) return '';
  const parts = props.smurf.Pseudo.split('#');
  return parts.length > 1 ? `#${parts[1]}` : '';
});

const getRankData = (queue) => {
  return queue === 'Flex' ? (props.smurf.Elo_Flex || {}) : (props.smurf.Elo_SoloQ || {});
};

const getRankIcon = (queue) => {
  const data = getRankData(queue);
  if (!data.tier) return null;
  return `/assets/ranks/${data.tier.toLowerCase()}.png`;
};

const getRankTier = (queue) => {
  const data = getRankData(queue);
  if (!data.tier) return 'Unranked';
  let label = `${data.tier} ${data.rank || ''}`;
  if (data.is_estimated) label += ' (Est.)';
  return label;
};

const getRankLP = (queue) => {
  return getRankData(queue).lp || 0;
};

const getWinrate = (queue) => {
  const data = getRankData(queue);
  const wins = data.wins || 0;
  const losses = data.losses || 0;
  const total = wins + losses;
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
};

const getWinrateClass = (wr) => {
  if (wr >= 60) return 'wr-high';
  if (wr >= 50) return 'wr-mid';
  return 'wr-low';
};

const kdaClass = computed(() => {
  const kda = props.smurf.Stats?.kda || 0;
  if (kda >= 4) return 'kda-excellent';
  if (kda >= 3) return 'kda-good';
  if (kda >= 2) return 'kda-average';
  return 'kda-poor';
});

const bestChamps = computed(() => {
  const champs = props.smurf.Stats?.best_champions || [];
  // Handle both array and single object format
  if (Array.isArray(champs)) {
    return champs.slice(0, 3);
  }
  if (props.smurf.Stats?.best_champion) {
    return [props.smurf.Stats.best_champion];
  }
  return [];
});

// Helper functions
const getRoleIcon = (role) => {
  if (!role) return null;
  return `/assets/roles/${role.toLowerCase()}.svg`;
};

const getChampIcon = (champName) => {
  if (!champName) return '';
  // Handle special cases
  let name = champName;
  if (name === 'FiddleSticks') name = 'Fiddlesticks';
  return `/assets/champions/${name}.png`;
};


</script>

<style scoped>
.smurf-card {
  position: relative;
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  min-height: 400px;
  /* GPU acceleration */
  transform: translateZ(0);
  will-change: transform, box-shadow;
}

/* Card Header */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.account-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-name {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
}

.account-tag {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.account-level {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-sm) var(--space-md);
  background: var(--accent-gradient);
  border-radius: var(--radius-md);
}

.level-value {
  font-size: 1.125rem;
  font-weight: 700;
  color: white;
}

.level-label {
  font-size: 0.625rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Rank Section */
.rank-section-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: var(--space-md);
  background: rgba(255, 255, 255, 0.03);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}

.rank-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.rank-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.rank-display {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex: 1;
}

.rank-emblem {
  width: 64px;
  height: 64px;
  object-fit: contain;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
}

.rank-unranked {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.rank-unranked svg {
  width: 32px;
  height: 32px;
}

.rank-details {
  display: flex;
  flex-direction: column;
}

.rank-type {
  font-size: 0.65rem;
  text-transform: uppercase;
  color: var(--text-muted);
  font-weight: 600;
  margin-bottom: 2px;
}

.rank-tier {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.rank-lp {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.rank-stats {
  display: flex;
  gap: var(--space-md);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 40px;
}

.stat-value {
  font-size: 0.9rem;
  font-weight: 700;
}

.stat-label {
  font-size: 0.65rem;
  color: var(--text-muted);
}

.wr-high { color: var(--success); }
.wr-mid { color: var(--warning); }
.wr-low { color: var(--text-muted); }

/* Stats Section */
.stats-section {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.role-badge {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
}

.role-icon {
  width: 24px;
  height: 24px;
  filter: brightness(0) invert(1);
  opacity: 0.9;
}

.role-info {
  display: flex;
  flex-direction: column;
}

.role-name {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-primary);
  text-transform: capitalize;
}

.role-pct {
  font-size: 0.625rem;
  color: var(--text-muted);
}

.kda-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
}

.kda-values {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.875rem;
  font-weight: 600;
}

.kda-kills { color: var(--success); }
.kda-deaths { color: var(--error); }
.kda-assists { color: var(--info); }
.kda-separator { color: var(--text-muted); }

.kda-ratio {
  font-size: 0.75rem;
  font-weight: 500;
}

.kda-excellent { color: var(--rank-gold); }
.kda-good { color: var(--success); }
.kda-average { color: var(--text-secondary); }
.kda-poor { color: var(--text-muted); }

.champions-section {
  display: flex;
  gap: var(--space-sm);
  margin-left: auto;
}

.champ-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.champ-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  border: 2px solid var(--border-subtle);
  object-fit: cover;
}

.champ-stats {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.625rem;
}

.champ-wr {
  font-weight: 600;
}

.champ-games {
  color: var(--text-muted);
}

/* No Stats */
.no-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-lg);
  color: var(--text-muted);
  font-size: 0.875rem;
}

.no-stats svg {
  width: 20px;
  height: 20px;
}

/* Actions Footer */
.card-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.action-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 8px;
  background: rgba(30, 30, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #a1a1aa;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: rgba(50, 50, 65, 0.9);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.2);
}

.action-btn:active {
  transform: scale(0.97);
}

.action-btn svg {
  width: 18px;
  height: 18px;
}

.action-btn.primary-action {
  flex: 2;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-color: transparent;
  color: white;
  font-weight: 600;
}

.action-btn.primary-action:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
}

.action-btn.danger:hover {
  background: #ef4444;
  border-color: #ef4444;
  color: white;
}

.action-btn.save-token {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.3);
  color: #4ade80;
}

.action-btn.has-token {
  background: rgba(34, 197, 94, 0.25);
  border-color: rgba(34, 197, 94, 0.5);
  color: #22c55e;
}

.action-btn.save-token.has-token {
  background: rgba(34, 197, 94, 0.25);
  border-color: rgba(34, 197, 94, 0.5);
  color: #22c55e;
}

.action-btn.save-token:hover {
  background: rgba(34, 197, 94, 0.35);
  border-color: #22c55e;
}

.action-btn.disabled {
  opacity: 0.3;
  cursor: not-allowed;
  pointer-events: none;
}

.action-btn.restore-token:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.action-btn.restore-token:not(:disabled) {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(139, 92, 246, 0.25));
  border-color: rgba(139, 92, 246, 0.5);
  color: #a78bfa;
}

.action-btn.restore-token:not(:disabled):hover {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(139, 92, 246, 0.4));
  border-color: #8b5cf6;
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(139, 92, 246, 0.4);
}

.btn-label {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Glow Effect */
.card-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--transition-normal);
  background: radial-gradient(
    circle at 50% 0%,
    var(--accent-glow) 0%,
    transparent 70%
  );
}

.card-glow.active {
  opacity: 1;
}

.sync-status {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.4);
  padding: 4px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner-sm {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
</style>
