import express from 'express';
import db from '../models/database.js';
import { getSummonerLevel, getMatchIds, calculateStats, getRankData, formatRank, getPuuidByRiotId, getRiotIdByPuuid } from '../utils/riotApi.js';

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
  const queue = prefs?.stats_queue || 'soloq';

  const dynamicStatsKey = `stats_${period}_${queue}`;

  const formattedSmurfs = smurfs.map(smurf => {
    // Stats strictement pour la combinaison (période, queue) demandée.
    // 'pending' = jamais calculé pour ce filtre ; 'empty' = calculé mais 0 partie.
    let stats = null;
    let statsState = 'pending';
    const statsJson = smurf.stats_json || {};
    if (Object.prototype.hasOwnProperty.call(statsJson, dynamicStatsKey)) {
      stats = statsJson[dynamicStatsKey];
      statsState = stats ? 'ok' : 'empty';
    }

    return {
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
      Stats: stats,
      StatsState: statsState,
      last_updated: smurf.last_updated,
      id: smurf.id,
      hasToken: !!smurf.riot_tokens,
      sort_order: smurf.sort_order,
      is_syncing: false
    };
  });

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
 * PUT /api/smurfs/:id/credentials
 */
router.put('/:id/credentials', requireAuth, (req, res) => {
  const userId = req.session.user_id;
  const smurfId = parseInt(req.params.id);
  const { username, password } = req.body;

  const smurf = db.getSmurfById(smurfId);
  if (!smurf || smurf.user_id !== userId) {
    return res.status(404).json({ error: 'Smurf non trouvé' });
  }

  db.updateSmurfCredentials(smurfId, username || '', password || '');
  res.json({ success: true });
});

/**
 * PUT /api/smurfs/reorder
 */
router.put('/reorder', requireAuth, (req, res) => {
  const userId = req.session.user_id;
  const { order } = req.body;

  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'order must be an array of {id, sort_order}' });
  }

  try {
    db.updateSmurfOrder(userId, order);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
    // 1. Level + Tier + Current Riot ID
    let [levelResult, rankData, currentRiotId] = await Promise.all([
      getSummonerLevel(currentPuuid, gameName, tagLine),
      getRankData(currentPuuid),
      getRiotIdByPuuid(currentPuuid)
    ]);

    // If PUUID lookup failed, try to re-resolve from stored Riot ID
    if (!currentRiotId && gameName && tagLine) {
      console.log(`   [FIX] PUUID lookup failed, re-resolving from ${gameName}#${tagLine}...`);
      const newPuuid = await getPuuidByRiotId(gameName, tagLine);
      if (newPuuid && newPuuid !== currentPuuid) {
        console.log(`   [FIX] New PUUID found: ${newPuuid} (was ${currentPuuid})`);
        currentPuuid = newPuuid;
        db.updateSmurfPuuid(smurfId, currentPuuid);
        // Re-fetch with corrected PUUID
        [levelResult, rankData, currentRiotId] = await Promise.all([
          getSummonerLevel(currentPuuid),
          getRankData(currentPuuid),
          getRiotIdByPuuid(currentPuuid)
        ]);
      }
    }

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
    const updateData = { level };

    // Update Riot ID if changed
    if (currentRiotId && currentRiotId !== smurf.pseudo) {
      console.log(`   [UPDATE] Riot ID changed: ${smurf.pseudo} -> ${currentRiotId}`);
      updateData.pseudo = currentRiotId;
    }

    // Update Dynamic Stats JSON
    // (Les colonnes legacy stats_30_ranked/etc. ne sont plus écrites : le mapping
    // flex->ranked contaminait les stats SoloQ avec des stats Flex et inversement.)
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

    // Même mémoire de rang pour la Flex
    if (flex.tier) {
      updateData.flex_tier = flex.tier;
      updateData.flex_rank = flex.rank;
      updateData.flex_lp = flex.lp;
      updateData.flex_wins = flex.wins;
      updateData.flex_losses = flex.losses;
    } else if (smurf.flex_tier) {
      console.log(`   [KEEP] On garde le rang Flex ${smurf.flex_tier} (Unranked sur l'API)`);
    } else {
      updateData.flex_tier = null;
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

/**
 * PATCH /api/smurfs/:id/nickname
 * Manually update the Riot ID (nickname#tag) and re-resolve PUUID
 */
router.patch('/:id/nickname', requireAuth, async (req, res) => {
  const smurfId = parseInt(req.params.id);
  const smurf = db.getSmurfById(smurfId);
  if (!smurf || smurf.user_id !== req.session.user_id) {
    return res.status(404).json({ error: 'Smurf non trouvé' });
  }

  const { riotId } = req.body;
  if (!riotId || !riotId.includes('#')) {
    return res.status(400).json({ error: 'Format invalide. Utilisez Pseudo#TAG' });
  }

  const [gameName, tagLine] = riotId.split('#');
  try {
    const newPuuid = await getPuuidByRiotId(gameName, tagLine);
    if (!newPuuid) {
      return res.status(404).json({ error: `Compte introuvable: ${riotId}` });
    }

    db.updateSmurfData(smurfId, { pseudo: riotId });
    if (newPuuid !== smurf.puuid) {
      db.updateSmurfPuuid(smurfId, newPuuid);
    }

    res.json({ success: true, pseudo: riotId, puuid: newPuuid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/smurfs/sync-riot-id
 * Takes a PUUID (from lockfile), resolves current Riot ID, updates matching smurf
 */
router.post('/sync-riot-id', requireAuth, async (req, res) => {
  const { puuid } = req.body;
  if (!puuid) return res.status(400).json({ error: 'puuid required' });

  try {
    const currentRiotId = await getRiotIdByPuuid(puuid);
    if (!currentRiotId) {
      return res.json({ success: false, error: 'Could not resolve Riot ID' });
    }

    // Find matching smurf by PUUID
    const smurfs = db.getUserSmurfs(req.session.user_id);
    const match = smurfs.find(s => s.puuid === puuid);

    if (match && currentRiotId !== match.pseudo) {
      console.log(`[SYNC] Riot ID updated: ${match.pseudo} -> ${currentRiotId}`);
      db.updateSmurfData(match.id, { pseudo: currentRiotId });
      return res.json({ success: true, oldPseudo: match.pseudo, newPseudo: currentRiotId, smurfId: match.id });
    }

    // Maybe PUUID changed — try to find by old Riot ID
    if (!match) {
      return res.json({ success: false, error: 'No matching account found for this PUUID' });
    }

    return res.json({ success: true, pseudo: currentRiotId, unchanged: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
