import express from 'express';
import db from '../models/database.js';
import { getSummonerLevel, getMatchIds, calculateStats, getRankData, formatRank, getPuuidByRiotId } from '../utils/riotApi.js';

const router = express.Router();

// Cache pour les refreshs (10 minutes minimum)
const REFRESH_COOLDOWN = 10 * 60 * 1000;

function requireAuth(req, res, next) {
  if (!req.session.user_id) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

/**
 * POST /api/smurfs/reset-all
 * Reset all rank and stats data (admin/debug endpoint)
 */
router.post('/reset-all', requireAuth, (req, res) => {
  try {
    const count = db.resetAllSmurfData();
    res.json({ success: true, message: `Reset ${count} smurfs data`, count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/smurfs
 */
router.get('/', requireAuth, (req, res) => {
  const userId = req.session.user_id;
  const smurfs = db.getUserSmurfs(userId);

  const prefs = db.getUserPreferences(userId);
  const period = prefs?.stats_period || '30';
  const queue = prefs?.stats_queue || 'ranked';
  const statsKey = `stats_${period}_${queue}`;

  const formattedSmurfs = smurfs.map(smurf => ({
    PUUID: smurf.puuid,
    Pseudo: smurf.pseudo,
    UserName: smurf.username,
    Password: smurf.password,
    Elo_SoloQ: smurf.soloq_tier ? {
      tier: smurf.soloq_tier,
      rank: smurf.soloq_rank,
      lp: smurf.soloq_lp,
      wins: smurf.soloq_wins,
      losses: smurf.soloq_losses
    } : null,
    Elo_Flex: smurf.flex_tier ? {
      tier: smurf.flex_tier,
      rank: smurf.flex_rank,
      lp: smurf.flex_lp,
      wins: smurf.flex_wins,
      losses: smurf.flex_losses
    } : null,
    Level: smurf.level,
    Stats: smurf[statsKey] || (smurf.stats_json && smurf.stats_json[statsKey]) || null,
    last_updated: smurf.last_updated,
    id: smurf.id,
    hasToken: !!smurf.riot_tokens,
    is_syncing: false // Could be real if we track global state
  }));

  res.json(formattedSmurfs);
});

/**
 * POST /api/smurfs
 */
router.post('/', requireAuth, async (req, res) => {
  const userId = req.session.user_id;
  let { puuid, pseudo, riotId, username, password } = req.body;

  if (!puuid && riotId && riotId.includes('#')) {
    const [gameName, tagLine] = riotId.split('#');
    try {
      puuid = await getPuuidByRiotId(gameName, tagLine);
      if (!puuid) {
        return res.status(404).json({ error: `Compte Riot introuvable : ${gameName}#${tagLine} (Verifiez l'orthographe ou l'API Key)` });
      }
    } catch (err) {
      return res.status(400).json({ error: `Erreur API Riot: ${err.message}` });
    }
  }

  if (!pseudo && riotId) pseudo = riotId;

  if (!puuid || !pseudo) {
    return res.status(400).json({ error: 'PUUID ou Riot ID requis' });
  }

  const smurfId = db.addSmurf(userId, puuid, pseudo, username || '', password || '');

  // Prioritize update
  scheduler.enqueue(smurfId);

  const smurf = db.getSmurfById(smurfId);
  res.status(201).json(smurf);
});

/**
 * DELETE /api/smurfs/:id
 */
router.delete('/:id', requireAuth, (req, res) => {
  const userId = req.session.user_id;
  const smurfId = parseInt(req.params.id);
  const success = db.deleteSmurf(smurfId, userId);
  success ? res.json({ message: 'Smurf supprimé' }) : res.status(404).json({ error: 'Smurf non trouvé' });
});


// === WORKER / SCHEDULER ===
// Queue simple pour traiter les smurfs un par un
const scheduler = {
  queue: [],
  processing: false,
  enqueue(smurfId) {
    if (!this.queue.includes(smurfId)) {
      this.queue.push(smurfId);
      this.process();
    }
  },
  async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const id = this.queue.shift();
      try {
        await updateSingleSmurf(id);
      } catch (e) { console.error(e); }
    }

    this.processing = false;
  }
};

/**
 * Mise à jour d'un seul smurf
 */
async function updateSingleSmurf(smurfId) {
  const smurf = db.getSmurfById(smurfId);
  if (!smurf) return;

  console.log(`[UPDATE] ${smurf.pseudo} started...`);

  // Extraire gameName et tagLine
  let gameName = null;
  let tagLine = null;
  if (smurf.pseudo && smurf.pseudo.includes('#')) {
    const parts = smurf.pseudo.split('#');
    gameName = parts[0];
    tagLine = parts[1];
  }

  let currentPuuid = smurf.puuid;

  try {
    // 1. Level + Tier
    const [levelResult, rankData] = await Promise.all([
      getSummonerLevel(currentPuuid, gameName, tagLine),
      getRankData(currentPuuid)
    ]);

    if (levelResult.corrected && levelResult.puuid !== currentPuuid) {
      currentPuuid = levelResult.puuid;
      db.updateSmurfPuuid(smurfId, currentPuuid);
    }

    const level = levelResult.level;
    const { soloq, flex } = formatRank(rankData);

    // 2. Stats (Dynamic based on preferences)
    const prefs = db.getUserPreferences(smurf.user_id);
    const queue = prefs.stats_queue || 'soloq';
    const period = prefs.stats_period || '30';

    const matchIds = await getMatchIds(currentPuuid, queue, period);
    const stats = await calculateStats(currentPuuid, matchIds);

    // 3. Prepare Update
    const updateData = {
      level,
      flex_tier: flex.tier,
      flex_rank: flex.rank,
      flex_lp: flex.lp,
      flex_wins: flex.wins,
      flex_losses: flex.losses
    };

    // Update Legacy Stats Columns if applicable (for backward compat)
    if (queue === 'soloq' && period === '30') updateData.stats_30_ranked = stats;
    if (queue === 'soloq' && period === 'season') updateData.stats_season_ranked = stats;
    if (queue === 'all' && period === '30') updateData.stats_30_all = stats;
    if (queue === 'all' && period === 'season') updateData.stats_season_all = stats;

    // Update Dynamic Stats JSON
    let statsJson = {};
    try {
      // smurf.stats_json sent by db is string or null
      statsJson = smurf.stats_json ? JSON.parse(smurf.stats_json) : {};
    } catch (e) { }

    const statsKey = `stats_${period}_${queue}`;
    statsJson[statsKey] = stats;
    updateData.stats_json = statsJson;

    // LOGIQUE DE MEMOIRE DE RANG (Keep existing rank if new is null)
    if (soloq.tier) {
      updateData.soloq_tier = soloq.tier;
      updateData.soloq_rank = soloq.rank;
      updateData.soloq_lp = soloq.lp;
      updateData.soloq_wins = soloq.wins;
      updateData.soloq_losses = soloq.losses;
    } else if (smurf.soloq_tier) {
      console.log(`   [KEEP] On garde le rang ${smurf.soloq_tier} (Unranked sur l'API)`);
    } else {
      updateData.soloq_tier = null;
    }

    // 4. Update DB
    db.updateSmurfData(smurfId, updateData);

    console.log(`[UPDATE] ${smurf.pseudo} completed (${queue}/${period}).`);
  } catch (err) {
    console.error(`[UPDATE] Error ${smurf.pseudo}: ${err.message}`);
  }
}

/**
 * POST /api/refresh
 * Lance la mise à jour en background
 */
export async function refreshSmurfs(req, res) {
  const userId = req.session?.user_id;
  if (!userId) return res.status(401).json({ error: 'Non authentifié' });

  const { queue = 'soloq', period = '30', force = false } = req.body;

  db.updateUserPreferences(userId, period, queue);

  // Ajouter tous les smurfs à la queue du scheduler
  const smurfs = db.getUserSmurfs(userId);
  let queuedCount = 0;
  const now = Date.now();

  for (const s of smurfs) {
    if (force || !s.last_updated || (now - new Date(s.last_updated).getTime() > REFRESH_COOLDOWN)) {
      scheduler.enqueue(s.id);
      queuedCount++;
    }
  }

  res.status(202).json({
    status: 'Background update started',
    queued: queuedCount,
    filters: { queue, period }
  });
}

/**
 * POST /api/smurfs/:id/refresh
 */
router.post('/:id/refresh', requireAuth, async (req, res) => {
  const smurfId = parseInt(req.params.id);
  const smurf = db.getSmurfById(smurfId);
  if (!smurf || smurf.user_id !== req.session.user_id) {
    return res.status(404).json({ error: 'Smurf non trouvé' });
  }

  scheduler.enqueue(smurfId);
  res.status(202).json({ status: 'Refresh queued' });
});

export default router;
