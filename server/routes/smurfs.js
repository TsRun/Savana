import express from 'express';
import db from '../models/database.js';
import { getPuuidByRiotId, getRiotIdByPuuid } from '../utils/riotApi.js';
import { syncPlayer, normalizeSmurfStats, RANKED_QUEUES } from '../utils/playerSync.js';
import { registerSyncHandler, enqueueSync, activeSyncIds, queuedSyncIds, currentSyncId } from '../utils/syncQueue.js';

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

  const queue = db.getUserPreferences(userId).stats_queue;
  const syncingIds = activeSyncIds('smurf');

  const formattedSmurfs = smurfs.map(smurf => {
    // Stats des dernières parties de la queue choisie (SoloQ ou Flex).
    // 'pending' = jamais calculées ; 'empty' = calculées mais 0 partie.
    const statsByQueue = normalizeSmurfStats(smurf.stats_json);
    const computed = queue in statsByQueue;
    const stats = computed ? statsByQueue[queue] : null;
    const statsState = !computed ? 'pending' : (stats ? 'ok' : 'empty');

    return {
      PUUID: smurf.puuid,
      Pseudo: smurf.pseudo,
      UserName: smurf.username,
      // Le mot de passe n'est jamais envoyé avec la liste : voir GET /:id/credentials
      HasPassword: !!smurf.password,
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
      StatsByQueue: statsByQueue,
      last_updated: smurf.last_updated,
      id: smurf.id,
      SessionKey: smurf.session_key,
      sort_order: smurf.sort_order,
      is_syncing: syncingIds.has(smurf.id)
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

  const existing = db.getUserSmurfs(userId).find(s => s.puuid === puuid);
  if (existing) {
    return res.status(409).json({
      error: 'Ce compte est déjà enregistré',
      id: existing.id,
      Pseudo: existing.pseudo,
      SessionKey: existing.session_key
    });
  }

  const smurfId = db.addSmurf(userId, puuid, pseudo, username || '', password || '');

  enqueueSync('smurf', smurfId);

  const smurf = db.getSmurfById(smurfId);
  res.status(201).json({ id: smurf.id, Pseudo: smurf.pseudo, SessionKey: smurf.session_key });
});

/**
 * GET /api/smurfs/:id/credentials
 * Identifiants déchiffrés d'un seul compte, chargés à la demande (copie, édition).
 */
router.get('/:id/credentials', requireAuth, (req, res) => {
  const userId = req.session.user_id;
  const smurf = db.getSmurfById(parseInt(req.params.id));
  if (!smurf || smurf.user_id !== userId) {
    return res.status(404).json({ error: 'Smurf non trouvé' });
  }
  res.set('Cache-Control', 'no-store');
  res.json({ username: smurf.username || '', password: smurf.password || '' });
});

/**
 * PUT /api/smurfs/:id/credentials
 * Un champ absent du corps est conservé tel quel (mot de passe non chargé côté UI).
 */
router.put('/:id/credentials', requireAuth, (req, res) => {
  const userId = req.session.user_id;
  const smurfId = parseInt(req.params.id);
  const { username, password } = req.body;

  const smurf = db.getSmurfById(smurfId);
  if (!smurf || smurf.user_id !== userId) {
    return res.status(404).json({ error: 'Smurf non trouvé' });
  }

  db.updateSmurfCredentials(
    smurfId,
    username === undefined ? (smurf.username || '') : (username || ''),
    password === undefined ? (smurf.password || '') : (password || '')
  );
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


// === SYNCHRONISATION ===

/**
 * Mise à jour d'un seul smurf : rang, niveau, Riot ID et stats des deux queues
 */
async function updateSingleSmurf(smurfId) {
  const smurf = db.getSmurfById(smurfId);
  if (!smurf) return;

  console.log(`[UPDATE] ${smurf.pseudo} started...`);

  try {
    const result = await syncPlayer({ puuid: smurf.puuid, riotId: smurf.pseudo });

    if (result.puuid !== smurf.puuid) {
      db.updateSmurfPuuid(smurfId, result.puuid);
    }

    // Un échec API (null) n'efface ni le niveau ni le Riot ID connus
    const updateData = {};
    if (result.level) updateData.level = result.level;
    if (result.riotId && result.riotId !== smurf.pseudo) {
      console.log(`   [UPDATE] Riot ID changed: ${smurf.pseudo} -> ${result.riotId}`);
      updateData.pseudo = result.riotId;
    }

    // Seules les queues réussies remplacent les stats précédentes
    if (Object.keys(result.stats).length > 0) {
      updateData.stats_json = { ...normalizeSmurfStats(smurf.stats_json), ...result.stats };
    }

    // Mémoire du rang : un « unranked » de l'API ne remplace pas un rang connu
    for (const q of RANKED_QUEUES) {
      const fresh = result.rank[q];
      if (fresh.tier) {
        updateData[`${q}_tier`] = fresh.tier;
        updateData[`${q}_rank`] = fresh.rank;
        updateData[`${q}_lp`] = fresh.lp;
        updateData[`${q}_wins`] = fresh.wins;
        updateData[`${q}_losses`] = fresh.losses;
      } else if (smurf[`${q}_tier`]) {
        console.log(`   [KEEP] On garde le rang ${q} ${smurf[`${q}_tier`]} (Unranked sur l'API)`);
      } else {
        updateData[`${q}_tier`] = null;
      }
    }

    db.updateSmurfData(smurfId, updateData);
    console.log(`[UPDATE] ${smurf.pseudo} completed.`);
  } catch (err) {
    console.error(`[UPDATE] Error ${smurf.pseudo}: ${err.message}`);
  }
}

registerSyncHandler('smurf', updateSingleSmurf);

/**
 * POST /api/refresh
 * Lance la mise à jour en background
 */
export async function refreshSmurfs(req, res) {
  const userId = req.session?.user_id;
  if (!userId) return res.status(401).json({ error: 'Non authentifié' });

  const { force = false, queue } = req.body || {};
  if (RANKED_QUEUES.includes(queue)) db.updateUserPreferences(userId, undefined, queue);

  // Mettre tous les comptes en file de synchronisation
  const smurfs = db.getUserSmurfs(userId);
  let queuedCount = 0;
  const now = Date.now();

  for (const s of smurfs) {
    if (force || !s.last_updated || (now - new Date(s.last_updated).getTime() > REFRESH_COOLDOWN)) {
      enqueueSync('smurf', s.id);
      queuedCount++;
    }
  }

  res.status(202).json({
    status: 'Background update started',
    queued: queuedCount
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

  // Les deux queues sont toujours calculées : la queue envoyée n'a plus d'effet
  enqueueSync('smurf', smurfId);
  res.status(202).json({ status: 'Refresh queued' });
});

/**
 * GET /api/smurfs/refresh-status
 * État réel des mises à jour : comptes en file et compte en cours (suivi côté UI)
 */
router.get('/refresh-status', requireAuth, (req, res) => {
  const owned = new Set(db.getUserSmurfs(req.session.user_id).map(s => s.id));
  const queued = queuedSyncIds('smurf').filter(id => owned.has(id));
  const cur = currentSyncId('smurf');
  const current = cur !== null && owned.has(cur) ? cur : null;
  res.json({ queued, current });
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
