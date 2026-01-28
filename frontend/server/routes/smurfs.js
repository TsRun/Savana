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
    Stats: smurf[statsKey],
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

    // 2. Ranked Matches (30 days & Season)
    // NOTE: On réduit la charge en demandant un par un
    // RateLimiter handle le spacing

    const matchIds_30_ranked = await getMatchIds(currentPuuid, 'ranked', '30');
    const stats_30_ranked = await calculateStats(currentPuuid, matchIds_30_ranked);

    // On ne fait que Ranked 30 days pour le moment pour aller plus vite,
    // ou alors on accepte que ce soit lent
    // On va faire Season Ranked aussi
    const matchIds_season_ranked = await getMatchIds(currentPuuid, 'ranked', 'season');
    const stats_season_ranked = await calculateStats(currentPuuid, matchIds_season_ranked);

    // Skip "ALL" queues for performance unless explicitly requested later?
    // Let's keep it minimal: Ranked is what matters most
    const stats_30_all = null;
    const stats_season_all = null;

    // 3. Preparer update object
    const updateData = {
      level,
      flex_tier: flex.tier,
      flex_rank: flex.rank,
      flex_lp: flex.lp,
      flex_wins: flex.wins,
      flex_losses: flex.losses,
      stats_30_ranked,
      stats_30_all,
      stats_season_ranked,
      stats_season_all
    };

    // LOGIQUE DE MEMOIRE DE RANG (Previous Season Fallback)
    // Si le joueur est Unranked cette saison/split (api renvoie null),
    // mais qu'on a un rang stocké en DB, on le garde !
    // Cela permet d'afficher "Diamond 4" de la saison passée au lieu de "Unranked"

    if (soloq.tier) {
      // Nouveau rang trouvé, on met à jour
      updateData.soloq_tier = soloq.tier;
      updateData.soloq_rank = soloq.rank;
      updateData.soloq_lp = soloq.lp;
      updateData.soloq_wins = soloq.wins;
      updateData.soloq_losses = soloq.losses;
    } else if (smurf.soloq_tier) {
      // Pas de nouveau rang, mais on en a un en stock -> On touche pas aux champs soloq_*
      console.log(`   [KEEP] On garde le rang ${smurf.soloq_tier} (Unranked sur l'API)`);
    } else {
      // Jamais eu de rang, on met null
      updateData.soloq_tier = null;
    }

    // 4. Update DB
    db.updateSmurfData(smurfId, updateData);

    console.log(`[UPDATE] ${smurf.pseudo} completed.`);
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

  const { queue = 'ranked', period = '30', force = false } = req.body;

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
