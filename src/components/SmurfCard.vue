<template>
  <div class="card-wrapper" :class="{ flipped: isFlipped }">
    <!-- ============ FRONT ============ -->
    <div class="smurf-card card card-front" @mouseenter="isHovered = true" @mouseleave="isHovered = false" @click="flip">
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

        <!-- Data Freshness Badge -->
        <div v-if="dataFreshness === 'expired'" class="freshness-badge data-expired">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{{ dataAgeDays }}j — Obsolete</span>
        </div>
        <div v-else-if="dataFreshness === 'warning'" class="freshness-badge data-warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>{{ dataAgeDays }}j sans maj</span>
        </div>

        <!-- Sync Status -->
        <div v-if="smurf.is_syncing" class="sync-status" title="Mise a jour en cours...">
          <div class="spinner-sm"></div>
        </div>
      </div>

      <!-- Rank Section -->
      <div class="rank-section">
        <div class="rank-display">
          <img v-if="rankIcon" :src="rankIcon" :alt="rankTier" class="rank-emblem" :style="rankIconStyle" />
          <div v-else class="rank-unranked">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div class="rank-details">
            <div class="rank-tier">
              {{ rankTier }}
              <span v-if="isPreviousSeason" class="prev-season-badge" title="Classement de la saison precedente">Last Season</span>
            </div>
            <div class="rank-lp">{{ rankLP }} LP</div>
          </div>
        </div>
        <div class="rank-stats">
          <div class="stat-item">
            <span class="stat-value" :class="winrateClass">{{ winrate }}%</span>
            <span class="stat-label">WR</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ rankedGames }}</span>
            <span class="stat-label">Games</span>
          </div>
        </div>
      </div>

      <!-- Stats Section -->
      <div class="stats-section" v-if="smurf.Stats">
        <div class="role-badge" v-if="smurf.Stats.main_role" :title="smurf.Stats.main_role">
          <img :src="getRoleIcon(smurf.Stats.main_role)" :alt="smurf.Stats.main_role" class="role-icon" />
          <span class="role-pct">{{ smurf.Stats.role_percentage }}%</span>
        </div>
        <div class="kda-display">
          <div class="kda-values">
            <span class="kda-kills">{{ smurf.Stats.avg_kills?.toFixed(1) }}</span>
            <span class="kda-separator">/</span>
            <span class="kda-deaths">{{ smurf.Stats.avg_deaths?.toFixed(1) }}</span>
            <span class="kda-separator">/</span>
            <span class="kda-assists">{{ smurf.Stats.avg_assists?.toFixed(1) }}</span>
          </div>
          <div class="kda-ratio" :class="kdaClass">{{ smurf.Stats.kda?.toFixed(2) }}</div>
        </div>
        <div class="champions-section" v-if="bestChamps.length > 0">
          <div class="champ-item" v-for="champ in bestChamps" :key="champ.name" :title="champ.name">
            <img :src="getChampIcon(champ.name)" :alt="champ.name" class="champ-icon" />
            <div class="champ-stats">
              <span class="champ-wr" :class="getWinrateClass(champ.winrate)">{{ champ.winrate }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- No Stats Placeholder -->
      <div class="no-stats" v-else>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>
        </svg>
        <span>No recent games</span>
      </div>

      <!-- Actions Footer -->
      <div class="card-actions" @click.stop>
        <button v-if="smurf.UserName" @click="$emit('copy', smurf.UserName, 'Username')" class="action-btn" :title="`Copy: ${smurf.UserName}`">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span class="btn-label">User</span>
        </button>
        <button v-if="smurf.Password" @click="$emit('copy', smurf.Password, 'Password')" class="action-btn" title="Copy password">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          <span class="btn-label">Pass</span>
        </button>
        <button @click="$emit('save-session', smurf)" class="action-btn" :class="{ 'has-token': smurf.hasSession, 'session-old': isSessionOld }" :title="getSessionTitle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          <span v-if="isSessionOld" class="warning-badge">!</span>
        </button>
        <button v-if="smurf.hasSession" @click="$emit('load-session', smurf)" class="action-btn primary-action" title="Charger la session">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          <span class="btn-label">Load</span>
        </button>
        <button @click="$emit('delete', smurf.id)" class="action-btn danger" title="Delete Account">
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

    <!-- ============ BACK ============ -->
    <div class="smurf-card card card-back">
      <div class="back-header">
        <div class="back-title">
          <span class="back-name">{{ getPseudoName }}</span>
          <span class="back-tag">{{ getTag }}</span>
        </div>
        <button class="back-close" @click="flipBack" title="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="back-fields">
        <div class="field-group">
          <label>Username / Email</label>
          <div class="field-row">
            <input v-model="editForm.username" type="text" placeholder="Username" class="field-input" />
            <button v-if="editForm.username" class="field-copy" @click="$emit('copy', editForm.username, 'Username')" title="Copy">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="field-group">
          <label>Password</label>
          <div class="field-row">
            <input v-model="editForm.password" :type="showPassword ? 'text' : 'password'" placeholder="Password" class="field-input" />
            <button class="field-copy" @click="showPassword = !showPassword" :title="showPassword ? 'Hide' : 'Show'">
              <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
            <button v-if="editForm.password" class="field-copy" @click="$emit('copy', editForm.password, 'Password')" title="Copy">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="field-group">
          <label>Notes</label>
          <textarea v-model="editForm.notes" placeholder="Add notes..." class="field-textarea" rows="2"></textarea>
        </div>
      </div>

      <div class="back-actions">
        <button class="btn-back-cancel" @click="flipBack">Cancel</button>
        <button class="btn-back-save" @click="saveAndFlip" :disabled="editSaving">
          {{ editSaving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  smurf: {
    type: Object,
    required: true
  },
  displayRank: {
    type: String,
    default: 'soloq'
  }
});

const emit = defineEmits(['copy', 'delete', 'save-session', 'load-session', 'update-credentials']);

const isHovered = ref(false);
const isFlipped = ref(false);
const showPassword = ref(false);
const editSaving = ref(false);
const editForm = ref({ username: '', password: '', notes: '' });

const flip = () => {
  editForm.value.username = props.smurf.UserName || '';
  editForm.value.password = props.smurf.Password || '';
  editForm.value.notes = props.smurf.Notes || '';
  showPassword.value = false;
  isFlipped.value = true;
};

const flipBack = () => {
  isFlipped.value = false;
};

const saveAndFlip = () => {
  editSaving.value = true;
  emit('update-credentials', {
    id: props.smurf.id,
    username: editForm.value.username.trim(),
    password: editForm.value.password.trim(),
    notes: editForm.value.notes.trim()
  });
  editSaving.value = false;
  isFlipped.value = false;
};

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

const dataAgeDays = computed(() => {
  if (!props.smurf.last_updated) return null;
  const updated = new Date(props.smurf.last_updated);
  const now = new Date();
  return Math.floor((now - updated) / (1000 * 60 * 60 * 24));
});

const dataFreshness = computed(() => {
  if (dataAgeDays.value === null) return 'fresh';
  if (dataAgeDays.value >= 14) return 'expired';
  if (dataAgeDays.value >= 7) return 'warning';
  return 'fresh';
});

const sessionAgeDays = computed(() => {
  if (!props.smurf.sessionSavedAt) return null;
  const saved = new Date(props.smurf.sessionSavedAt);
  const now = new Date();
  return Math.floor((now - saved) / (1000 * 60 * 60 * 24));
});

const isSessionOld = computed(() => {
  return sessionAgeDays.value !== null && sessionAgeDays.value > 7;
});

const getSessionTitle = computed(() => {
  if (!props.smurf.hasSession) return 'Sauvegarder la session actuelle';
  if (sessionAgeDays.value !== null) {
    if (sessionAgeDays.value === 0) return 'Session sauvegardee aujourd\'hui (clic pour mettre a jour)';
    if (isSessionOld.value) return `Session vieille de ${sessionAgeDays.value} jours - Cliquez pour re-sauvegarder`;
    return `Session sauvegardee il y a ${sessionAgeDays.value} jour(s)`;
  }
  return 'Session sauvegardee (clic pour mettre a jour)';
});

const primaryRank = computed(() => {
  return props.displayRank === 'flex' ? (props.smurf.Elo_Flex || {}) : (props.smurf.Elo_SoloQ || {});
});

const altRank = computed(() => {
  return props.displayRank === 'flex' ? (props.smurf.Elo_SoloQ || {}) : (props.smurf.Elo_Flex || {});
});

const rankData = computed(() => {
  if (primaryRank.value.tier) return primaryRank.value;
  if (altRank.value.tier) return { ...altRank.value, is_fallback: true };
  return {};
});

const rankModeLabel = computed(() => {
  if (!rankData.value.tier) return '';
  if (rankData.value.is_fallback) return props.displayRank === 'flex' ? '(SoloQ)' : '(Flex)';
  return '';
});

const rankIcon = computed(() => {
  if (!rankData.value.tier) return null;
  return `/assets/ranks/${rankData.value.tier.toLowerCase()}.png`;
});

const rankTier = computed(() => {
  if (!rankData.value.tier) return 'Unranked';
  let label = `${rankData.value.tier} ${rankData.value.rank || ''}`;
  if (rankData.value.is_estimated) label += ' (Last Season)';
  if (rankModeLabel.value) label += ` ${rankModeLabel.value}`;
  return label;
});

const rankLP = computed(() => rankData.value.lp || 0);

const winrate = computed(() => {
  const wins = rankData.value.wins || 0;
  const losses = rankData.value.losses || 0;
  const rankedTotal = wins + losses;
  if (rankedTotal > 0) return Math.round((wins / rankedTotal) * 100);
  if (props.smurf.Stats?.total_games > 0) return props.smurf.Stats.winrate || 0;
  return 0;
});

const rankedGames = computed(() => {
  const wins = rankData.value.wins || 0;
  const losses = rankData.value.losses || 0;
  const rankedTotal = wins + losses;
  if (rankedTotal > 0) return rankedTotal;
  if (props.smurf.Stats?.total_games) return props.smurf.Stats.total_games;
  return 0;
});

const isPreviousSeason = computed(() => rankData.value.tier && rankedGames.value === 0);

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
  if (Array.isArray(champs)) return champs.slice(0, 3);
  if (props.smurf.Stats?.best_champion) return [props.smurf.Stats.best_champion];
  return [];
});

const getRoleIcon = (role) => role ? `/assets/roles/${role.toLowerCase()}.svg` : null;

const getChampIcon = (champName) => {
  if (!champName) return '';
  let name = champName;
  if (name === 'FiddleSticks') name = 'Fiddlesticks';
  return `/assets/champions/${name}.png`;
};

const getWinrateClass = (wr) => {
  if (wr >= 60) return 'wr-high';
  if (wr >= 50) return 'wr-mid';
  return 'wr-low';
};

const rankIconStyle = computed(() => {
  return rankData.value.is_estimated ? { opacity: 0.7, filter: 'grayscale(0.5)' } : {};
});
</script>

<style scoped>
/* ========== FLIP CONTAINER ========== */
.card-wrapper {
  position: relative;
  perspective: 1200px;
  min-height: 400px;
}

.card-wrapper .card-front,
.card-wrapper .card-back {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  position: absolute;
  inset: 0;
  transition: transform 0.45s cubic-bezier(0.4, 0.0, 0.2, 1);
}

.card-front {
  transform: rotateY(0deg);
  z-index: 2;
}

.card-back {
  transform: rotateY(180deg);
  z-index: 1;
}

.card-wrapper.flipped .card-front {
  transform: rotateY(180deg);
  pointer-events: none;
  z-index: 1;
}

.card-wrapper.flipped .card-back {
  transform: rotateY(0deg);
  z-index: 2;
}

/* ========== FRONT (stats card) ========== */
.smurf-card {
  position: relative;
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  min-height: 400px;
  cursor: pointer;
}

.card-front:hover {
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.08);
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
  width: 96px;
  height: 96px;
  object-fit: contain;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
  transform: scale(1.1);
}

.rank-unranked {
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.rank-unranked svg { width: 40px; height: 40px; }

.rank-details { display: flex; flex-direction: column; }

.rank-tier {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.rank-lp {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.rank-stats { display: flex; gap: var(--space-lg); }

.stat-item { display: flex; flex-direction: column; align-items: center; }
.stat-value { font-size: 1.125rem; font-weight: 700; }
.stat-label { font-size: 0.7rem; color: var(--text-muted); }

.prev-season-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 6px;
  font-size: 0.65rem;
  font-weight: 600;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.2));
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: 4px;
  color: #f59e0b;
  vertical-align: middle;
}

.wr-high { color: var(--success); }
.wr-mid { color: var(--warning); }
.wr-low { color: var(--text-muted); }

/* Stats Section */
.stats-section {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: nowrap;
  overflow: hidden;
}

.role-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.role-icon {
  width: 20px;
  height: 20px;
  filter: brightness(0) invert(1);
  opacity: 0.9;
}

.role-pct {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary);
}

.kda-display {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.kda-values { display: flex; align-items: center; gap: 2px; font-size: 0.8rem; font-weight: 600; }
.kda-kills { color: var(--success); }
.kda-deaths { color: var(--error); }
.kda-assists { color: var(--info); }
.kda-separator { color: var(--text-muted); font-size: 0.7rem; }

.kda-ratio {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.2);
}

.kda-excellent { color: var(--rank-gold); }
.kda-good { color: var(--success); }
.kda-average { color: var(--text-secondary); }
.kda-poor { color: var(--text-muted); }

.champions-section { display: flex; gap: 4px; margin-left: auto; flex-shrink: 0; }

.champ-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }

.champ-icon {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: 2px solid var(--border-subtle);
  object-fit: cover;
}

.champ-stats { font-size: 0.6rem; font-weight: 600; }

.no-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-lg);
  color: var(--text-muted);
  font-size: 0.875rem;
}

.no-stats svg { width: 20px; height: 20px; }

/* Actions Footer */
.card-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  cursor: default;
}

.action-btn {
  position: relative;
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

.action-btn:active { transform: scale(0.97); }
.action-btn svg { width: 18px; height: 18px; }

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

.action-btn.has-token {
  background: rgba(34, 197, 94, 0.25);
  border-color: rgba(34, 197, 94, 0.5);
  color: #22c55e;
}

.action-btn.session-old {
  background: rgba(245, 158, 11, 0.2);
  border-color: rgba(245, 158, 11, 0.5);
  color: #f59e0b;
}

.action-btn.session-old:hover {
  background: rgba(245, 158, 11, 0.4);
  border-color: #f59e0b;
}

.warning-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  font-size: 10px;
  font-weight: 700;
  background: #f59e0b;
  color: #000;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn.disabled {
  opacity: 0.3;
  cursor: not-allowed;
  pointer-events: none;
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
  background: radial-gradient(circle at 50% 0%, var(--accent-glow) 0%, transparent 70%);
}

.card-glow.active { opacity: 1; }

/* Freshness Badges */
.freshness-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 0.65rem;
  font-weight: 600;
  white-space: nowrap;
}

.data-warning {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #f59e0b;
}

.data-expired {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
  animation: pulse-red 2s ease-in-out infinite;
}

@keyframes pulse-red {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
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

/* ========== BACK (edit side) ========== */
.card-back {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: 16px;
  cursor: default;
}

.back-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.back-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.back-name {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}

.back-tag {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.back-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.back-close svg { width: 14px; height: 14px; }

.back-close:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: #ef4444;
}

.back-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-group label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field-row {
  display: flex;
  gap: 4px;
}

.field-input {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.85rem;
  box-sizing: border-box;
  transition: border-color 0.15s;
  min-width: 0;
}

.field-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}

.field-input::placeholder { color: var(--text-muted); }

.field-textarea {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.field-textarea:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}

.field-textarea::placeholder { color: var(--text-muted); }

.field-copy {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.field-copy svg { width: 14px; height: 14px; }

.field-copy:hover {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.4);
  color: var(--accent-primary);
}

.field-copy:active { transform: scale(0.92); }

.back-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.btn-back-cancel {
  padding: 8px 18px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s;
}

.btn-back-cancel:hover { background: var(--bg-primary); }

.btn-back-save {
  padding: 8px 24px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border: none;
  border-radius: 6px;
  color: white;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s ease;
}

.btn-back-save:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.btn-back-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
</style>
