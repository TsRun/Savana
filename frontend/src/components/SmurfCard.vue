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
    </div>

    <!-- Rank Section -->
    <div class="rank-section">
      <div class="rank-display">
        <img 
          v-if="rankIcon" 
          :src="rankIcon" 
          :alt="rankTier" 
          class="rank-emblem"
        />
        <div v-else class="rank-unranked">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div class="rank-details">
          <div class="rank-tier">{{ rankTier }}</div>
          <div class="rank-lp">{{ rankLP }} LP</div>
        </div>
      </div>
      <div class="rank-stats">
        <div class="stat-item">
          <span class="stat-value" :class="winrateClass">{{ winrate }}%</span>
          <span class="stat-label">Win Rate</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ rankedGames }}</span>
          <span class="stat-label">Games</span>
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
        @click="$emit('instant-login', smurf)" 
        class="action-btn primary-action"
        title="Instant Login"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span>Play</span>
      </button>
      
      <button 
        @click="$emit('copy', smurf.UserName, 'Username')" 
        class="action-btn"
        title="Copy Username"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </button>
      
      <button 
        @click="$emit('copy', smurf.Password, 'Password')" 
        class="action-btn"
        title="Copy Password"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
      </button>
      
      <button 
        @click="$emit('extract-tokens', smurf)" 
        class="action-btn"
        title="Extract Tokens"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
        </svg>
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

defineEmits(['instant-login', 'copy', 'delete', 'extract-tokens']);

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

const rankData = computed(() => props.smurf.Elo_SoloQ || {});

const rankIcon = computed(() => {
  if (!rankData.value.tier) return null;
  return `/assets/ranks/${rankData.value.tier.toLowerCase()}.png`;
});

const rankTier = computed(() => {
  if (!rankData.value.tier) return 'Unranked';
  return `${rankData.value.tier} ${rankData.value.rank || ''}`;
});

const rankLP = computed(() => rankData.value.lp || 0);

const winrate = computed(() => {
  if (!rankData.value.wins && !rankData.value.losses) {
    return props.smurf.Stats?.winrate || 0;
  }
  const total = (rankData.value.wins || 0) + (rankData.value.losses || 0);
  if (total === 0) return 0;
  return Math.round((rankData.value.wins / total) * 100);
});

const rankedGames = computed(() => {
  const wins = rankData.value.wins || 0;
  const losses = rankData.value.losses || 0;
  return wins + losses;
});

const winrateClass = computed(() => {
  if (winrate.value >= 60) return 'wr-high';
  if (winrate.value >= 50) return 'wr-mid';
  return 'wr-low';
});

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

const getWinrateClass = (wr) => {
  if (wr >= 60) return 'wr-high';
  if (wr >= 50) return 'wr-mid';
  return 'wr-low';
};
</script>

<style scoped>
.smurf-card {
  position: relative;
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  overflow: hidden;
  /* GPU acceleration */
  transform: translateZ(0);
  will-change: transform, box-shadow;
  contain: layout style;
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
.rank-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md);
  background: rgba(255, 255, 255, 0.03);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}

.rank-display {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.rank-emblem {
  width: 56px;
  height: 56px;
  object-fit: contain;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
}

.rank-unranked {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.rank-unranked svg {
  width: 40px;
  height: 40px;
}

.rank-details {
  display: flex;
  flex-direction: column;
}

.rank-tier {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.rank-lp {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.rank-stats {
  display: flex;
  gap: var(--space-lg);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 1.125rem;
  font-weight: 700;
}

.stat-label {
  font-size: 0.75rem;
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
  gap: var(--space-sm);
  margin-top: auto;
  padding-top: var(--space-md);
  border-top: 1px solid var(--border-subtle);
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  /* GPU-optimized transitions */
  transition: transform 0.1s ease, background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  transform: translateZ(0);
}

.action-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
  border-color: var(--border-active);
}

.action-btn:active {
  transform: scale(0.97);
}

.action-btn svg {
  width: 16px;
  height: 16px;
}

.action-btn.primary-action {
  flex: 2;
  background: var(--accent-gradient);
  border-color: transparent;
  color: white;
  font-weight: 600;
}

.action-btn.primary-action:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px var(--accent-glow);
}

.action-btn.danger:hover {
  background: var(--error);
  border-color: var(--error);
  color: white;
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
</style>
