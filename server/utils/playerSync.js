import db from '../models/database.js';
import {
  getRiotIdByPuuid, getPuuidByRiotId, getSummonerLevel, getRankData, formatRank,
  getMatchIds, getMatchDetails, extractMatchRow, computeStats, QUEUE_IDS
} from './riotApi.js';

// Synchronisation Riot commune aux comptes et aux amis : même découpage, mêmes règles.
// Le rang vient de league-v4 (bilan de la saison) ; le KDA, le rôle et les champions
// sont calculés sur les dernières parties de chaque queue, sans jamais mélanger les modes.

export const RANKED_QUEUES = Object.keys(QUEUE_IDS); // ['soloq', 'flex']

function parseJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/**
 * Stats d'un compte par queue : { soloq?, flex? }. Une clé absente = jamais calculée,
 * une valeur null = calculée mais aucune partie.
 * Accepte l'ancien format (une clé par période et queue, ex. stats_30_soloq).
 */
export function normalizeSmurfStats(raw) {
  const obj = parseJson(raw);
  const out = {};
  if (!obj) return out;
  for (const q of RANKED_QUEUES) {
    if (q in obj) out[q] = obj[q];
    else if (`stats_30_${q}` in obj) out[q] = obj[`stats_30_${q}`];
    else if (`stats_season_${q}` in obj) out[q] = obj[`stats_season_${q}`];
  }
  return out;
}

/**
 * Données d'un ami : { soloq, flex (rangs), stats_by_queue: { soloq?, flex? } },
 * ou null s'il n'a jamais été synchronisé. Accepte les anciens formats
 * (stats « all », stats de la dernière queue rafraîchie dans `stats` + `filter`).
 */
export function normalizeFriendStats(raw) {
  const obj = parseJson(raw);
  if (!obj) return null;
  const legacy = obj.stats_by_queue || {};
  const byQueue = {};
  for (const q of RANKED_QUEUES) {
    if (q in legacy) byQueue[q] = legacy[q];
    else if (obj.stats !== undefined && (obj.filter?.queue || 'soloq') === q) byQueue[q] = obj.stats;
  }
  return { soloq: obj.soloq || null, flex: obj.flex || null, stats_by_queue: byQueue };
}

/**
 * Mémoire du rang : un « unranked » de l'API (ou une erreur) ne remplace pas un rang connu.
 */
export function mergeRank(fresh, previous) {
  if (fresh?.tier) return fresh;
  return previous?.tier ? previous : (fresh || null);
}

/**
 * Stats des dernières parties d'une queue. Seules les parties absentes du cache sont
 * téléchargées. Lève une erreur si l'API échoue : l'appelant garde alors les stats
 * précédentes au lieu de les remplacer par « 0 partie ».
 */
async function syncQueueStats(puuid, queueKey) {
  const ids = await getMatchIds(puuid, queueKey);
  const cached = db.getCachedMatchRows(puuid, ids);
  const known = new Set(cached.map(r => r.match_id));
  const missing = ids.filter(id => !known.has(id));

  const fresh = [];
  for (const id of missing) {
    const match = await getMatchDetails(id);
    const row = match && extractMatchRow(match, puuid, id);
    if (row) fresh.push(row);
  }

  // Les parties chargées sont gardées même en cas d'échec partiel : rien n'est retéléchargé
  db.saveRecentMatches(puuid, QUEUE_IDS[queueKey], ids, fresh);

  const failed = missing.length - fresh.length;
  if (failed * 2 > ids.length) {
    throw new Error(`Détails de match indisponibles (${failed}/${ids.length} en échec)`);
  }
  if (missing.length > 0) {
    console.log(`   [API] ${queueKey}: ${fresh.length} nouvelle(s) partie(s), ${cached.length} en cache`);
  }
  return computeStats([...cached, ...fresh]);
}

/**
 * Récupère tout ce qu'on affiche pour un joueur.
 * Renvoie { puuid, riotId, level, rank: { soloq, flex }, stats: { soloq?, flex? } } :
 * - puuid peut différer de celui donné (PUUID corrigé via le Riot ID) ;
 * - riotId / level valent null en cas d'échec ;
 * - une queue absente de `stats` = échec API, les stats précédentes doivent être gardées.
 */
export async function syncPlayer({ puuid, riotId, withLevel = true }) {
  const [gameName, tagLine] = (riotId || '').includes('#') ? riotId.split('#') : [null, null];

  let currentPuuid = puuid;
  let currentRiotId = await getRiotIdByPuuid(currentPuuid);

  // PUUID refusé (compte migré, clé d'une autre application) : on le retrouve via le Riot ID
  if (!currentRiotId && gameName && tagLine) {
    const newPuuid = await getPuuidByRiotId(gameName, tagLine);
    if (newPuuid && newPuuid !== currentPuuid) {
      console.log(`   [FIX] Nouveau PUUID pour ${riotId}`);
      currentPuuid = newPuuid;
      currentRiotId = await getRiotIdByPuuid(currentPuuid);
    }
  }

  const level = withLevel ? await getSummonerLevel(currentPuuid) : null;
  const rank = formatRank(await getRankData(currentPuuid));

  const stats = {};
  for (const q of RANKED_QUEUES) {
    try {
      stats[q] = await syncQueueStats(currentPuuid, q);
    } catch (e) {
      console.error(`   [KEEP] Stats ${q} non mises à jour : ${e.message}`);
    }
  }

  return { puuid: currentPuuid, riotId: currentRiotId, level, rank, stats };
}
