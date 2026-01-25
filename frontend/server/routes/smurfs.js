import express from 'express';
import db from '../models/database.js';
import { getSummonerLevel, getMatchIds, calculateStats, getRankData, formatRank, getPuuidByRiotId } from '../utils/riotApi.js';

const router = express.Router();

// Cache pour éviter les refreshs trop fréquents (5 minutes minimum entre refreshs)
const REFRESH_COOLDOWN = 5 * 60 * 1000; // 5 minutes en ms

function requireAuth(req, res, next) {
  if (!req.session.user_id) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

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
    id: smurf.id
  }));
  
  res.json(formattedSmurfs);
});

/**
 * POST /api/smurfs
 */
router.post('/', requireAuth, async (req, res) => {
  const userId = req.session.user_id;
  const { puuid, pseudo, username, password } = req.body;
  
  if (!puuid || !pseudo) {
    return res.status(400).json({ error: 'PUUID et pseudo requis' });
  }
  
  const smurfId = db.addSmurf(userId, puuid, pseudo, username || '', password || '');
  
  // Lancer un refresh automatique pour le nouveau smurf
  updateSingleSmurf(smurfId).catch(err => console.error('Auto-refresh error:', err));
  
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
  if (success) {
    res.json({ message: 'Smurf supprimé' });
  } else {
    res.status(404).json({ error: 'Smurf non trouvé' });
  }
});

/**
 * Met à jour un seul smurf (utilisé pour refresh ciblé)
 */
async function updateSingleSmurf(smurfId) {
  const smurf = db.getSmurfById(smurfId);
  if (!smurf) return;
  
  console.log(`\n[UPDATE] ${smurf.pseudo}`);
  
  // Extraire gameName et tagLine du pseudo (format "Name#Tag")
  let gameName = null;
  let tagLine = null;
  if (smurf.pseudo && smurf.pseudo.includes('#')) {
    const parts = smurf.pseudo.split('#');
    gameName = parts[0];
    tagLine = parts[1];
  }
  
  let currentPuuid = smurf.puuid;
  
  try {
    // 1. Level + Rank (avec auto-correction du PUUID si erreur 400)
    const [levelResult, rankData] = await Promise.all([
      getSummonerLevel(currentPuuid, gameName, tagLine),
      getRankData(currentPuuid)
    ]);
    
    // Si le PUUID a été corrigé, le mettre à jour
    if (levelResult.corrected && levelResult.puuid !== currentPuuid) {
      console.log(`   [FIX] PUUID corrige pour ${smurf.pseudo}`);
      currentPuuid = levelResult.puuid;
      // Mettre à jour le PUUID en base
      db.updateSmurfPuuid(smurfId, currentPuuid);
    }
    
    const level = levelResult.level;
    const { soloq, flex } = formatRank(rankData);
    
    // 2. Stats pour les 4 combinaisons (avec le PUUID corrigé si besoin)
    // On fait ranked en premier (plus commun), puis all
    const [matchIds_30_ranked, matchIds_season_ranked] = await Promise.all([
      getMatchIds(currentPuuid, 'ranked', '30'),
      getMatchIds(currentPuuid, 'ranked', 'season')
    ]);
    
    const [stats_30_ranked, stats_season_ranked] = await Promise.all([
      calculateStats(currentPuuid, matchIds_30_ranked),
      calculateStats(currentPuuid, matchIds_season_ranked)
    ]);
    
    // All games (moins prioritaire, on peut skip si peu de matchs ranked)
    let stats_30_all = null;
    let stats_season_all = null;
    
    const [matchIds_30_all, matchIds_season_all] = await Promise.all([
      getMatchIds(currentPuuid, 'all', '30'),
      getMatchIds(currentPuuid, 'all', 'season')
    ]);
    
    [stats_30_all, stats_season_all] = await Promise.all([
      calculateStats(currentPuuid, matchIds_30_all),
      calculateStats(currentPuuid, matchIds_season_all)
    ]);
    
    // 3. Sauvegarder
    db.updateSmurfData(smurfId, {
      level,
      soloq_tier: soloq.tier,
      soloq_rank: soloq.rank,
      soloq_lp: soloq.lp,
      soloq_wins: soloq.wins,
      soloq_losses: soloq.losses,
      flex_tier: flex.tier,
      flex_rank: flex.rank,
      flex_lp: flex.lp,
      flex_wins: flex.wins,
      flex_losses: flex.losses,
      stats_30_ranked,
      stats_30_all,
      stats_season_ranked,
      stats_season_all
    });
    
    console.log(`   [OK] ${smurf.pseudo} - Done`);
  } catch (err) {
    console.error(`   [ERROR] ${smurf.pseudo}: ${err.message}`);
  }
}

/**
 * Update tous les smurfs d'un user (avec check cooldown)
 */
async function updateSmurfsInBackground(userId, force = false) {
  const smurfs = db.getUserSmurfs(userId);
  const now = Date.now();
  
  console.log(`\n[REFRESH] === User ${userId} (${smurfs.length} smurfs) ===`);
  
  for (const smurf of smurfs) {
    // Check cooldown sauf si force
    if (!force && smurf.last_updated) {
      const lastUpdate = new Date(smurf.last_updated).getTime();
      if (now - lastUpdate < REFRESH_COOLDOWN) {
        console.log(`[SKIP] ${smurf.pseudo} (updated ${Math.round((now - lastUpdate) / 1000)}s ago)`);
        continue;
      }
    }
    
    await updateSingleSmurf(smurf.id);
  }
  
  console.log(`\n[REFRESH] === DONE ===\n`);
}

/**
 * POST /api/refresh
 */
export async function refreshSmurfs(req, res) {
  const userId = req.session?.user_id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  
  const { queue = 'ranked', period = '30', force = false } = req.body;
  
  console.log(`[REFRESH] Request - user=${userId}, force=${force}`);
  
  // Sauvegarder les préférences
  db.updateUserPreferences(userId, period, queue);
  
  // Lancer en background
  updateSmurfsInBackground(userId, force);
  
  res.status(202).json({ 
    status: 'Update started in background', 
    filters: { queue, period } 
  });
}

/**
 * POST /api/smurfs/:id/refresh - Refresh un seul smurf
 */
router.post('/:id/refresh', requireAuth, async (req, res) => {
  const smurfId = parseInt(req.params.id);
  
  // Vérifier que le smurf appartient à l'utilisateur
  const smurf = db.getSmurfById(smurfId);
  if (!smurf || smurf.user_id !== req.session.user_id) {
    return res.status(404).json({ error: 'Smurf non trouvé' });
  }
  
  // Lancer le refresh en background
  updateSingleSmurf(smurfId);
  
  res.status(202).json({ status: 'Refresh started' });
});

export default router;
