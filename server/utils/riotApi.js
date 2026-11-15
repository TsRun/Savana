import axios from 'axios';
import { config } from '../config.js';

const REGION_HOST = config.regionHost;
const ROUTING_VALUE = config.routingValue;

// La clé peut être saisie/modifiée à chaud via l'UI : lecture dynamique
function getHeaders() {
  return { 'X-Riot-Token': config.riotApiKey || '' };
}

const TIERS_ORDER = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];

// === RATE LIMITER ===
// Dev Key limits: 
// 1. 20 requests every 1 second
// 2. 100 requests every 2 minutes
// We optimize for limit #2 (the bottleneck). 
// 120s / 100 req = 1.2s per request to be essentially safe.
// We'll use 1.25s to be safe.

class RateLimiter {
  constructor(intervalMs) {
    this.queue = [];
    this.interval = intervalMs;
    this.isProcessing = false;
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const { fn, resolve, reject } = this.queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (e) {
      reject(e);
    }

    // Wait interval before next
    await new Promise(r => setTimeout(r, this.interval));

    this.isProcessing = false;
    this.process();
  }
}

// 1.25s entre chaque requête globalement
const limiter = new RateLimiter(1250);

// 429 : on attend le Retry-After puis on retente, dans le créneau du limiteur
// (toute la file est en pause, la clé étant limitée globalement).
const MAX_429_RETRIES = 3;
const DEFAULT_RETRY_AFTER_S = 10;
const MAX_RETRY_AFTER_S = 120;

async function requestWithRetry(url, options) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await axios.get(url, { ...options, headers: getHeaders() });
    } catch (err) {
      if (err.response?.status !== 429 || attempt >= MAX_429_RETRIES) throw err;
      const header = Number(err.response.headers?.['retry-after']);
      const waitS = Math.min(Number.isFinite(header) && header > 0 ? header : DEFAULT_RETRY_AFTER_S, MAX_RETRY_AFTER_S);
      console.warn(`   [API] 429 rate limit, nouvel essai dans ${waitS}s (${attempt + 1}/${MAX_429_RETRIES})`);
      await new Promise(r => setTimeout(r, waitS * 1000));
    }
  }
}

async function safeRequest(url, options = {}) {
  return limiter.add(() => requestWithRetry(url, options));
}

// Cache pour les PUUIDs
const puuidCache = new Map();


// === EXPORTED FUNCTIONS ===

export async function getRiotIdByPuuid(puuid) {
  try {
    const url = `https://${ROUTING_VALUE}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`;
    const response = await safeRequest(url);
    const { gameName, tagLine } = response.data || {};
    if (gameName && tagLine) return `${gameName}#${tagLine}`;
    return null;
  } catch (err) {
    console.error(`   [API ERROR] getRiotIdByPuuid failed: ${err.message}`);
    return null;
  }
}

export async function getPuuidByRiotId(gameName, tagLine) {
  const cacheKey = `${gameName}#${tagLine}`;
  if (puuidCache.has(cacheKey)) return puuidCache.get(cacheKey);

  try {
    const url = `https://${ROUTING_VALUE}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const response = await safeRequest(url);
    const puuid = response.data?.puuid;
    if (puuid) {
      puuidCache.set(cacheKey, puuid);
      console.log(`   [API] PUUID trouvé: ${gameName}#${tagLine}`);
    }
    return puuid;
  } catch (err) {
    if (err.response) {
      console.error(`   [API ERROR] PUUID fetch failed for ${gameName}#${tagLine} - Status: ${err.response.status}`);
      console.error(`   [API ERROR] Data:`, err.response.data);
    } else {
      console.error(`   [API ERROR] Network/Other: ${err.message}`);
    }
    return null;
  }
}

export async function getSummonerLevel(puuid) {
  try {
    const url = `https://${REGION_HOST}/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    const response = await safeRequest(url);
    return response.data?.summonerLevel || null;
  } catch (err) {
    return null;
  }
}

// Queues suivies. Les modes ne sont jamais mélangés (pas d'ARAM, d'Arena ni de normales).
export const QUEUE_IDS = {
  soloq: 420, // Ranked Solo/Duo
  flex: 440   // Ranked Flex
};

// Nombre de parties récentes analysées par queue
export const RECENT_MATCH_COUNT = 20;

/**
 * Ids des dernières parties d'une queue, les plus récentes d'abord.
 * Une erreur API est propagée : [] signifie uniquement « aucune partie ».
 */
export async function getMatchIds(puuid, queueKey, count = RECENT_MATCH_COUNT) {
  const queue = QUEUE_IDS[queueKey];
  if (!queue) throw new Error(`Queue inconnue : ${queueKey}`);
  const url = `https://${ROUTING_VALUE}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`;
  try {
    const response = await safeRequest(url, { params: { start: 0, count, queue } });
    return response.data || [];
  } catch (err) {
    console.error(`   [API] Erreur MatchIds (${queueKey}): ${err.message}`);
    throw err;
  }
}

export async function getMatchDetails(matchId) {
  try {
    const url = `https://${ROUTING_VALUE}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    const response = await safeRequest(url);
    return response.data;
  } catch (err) {
    return null;
  }
}

/**
 * Ligne de cache d'un joueur dans un match : uniquement ce qui sert aux stats.
 * null si le joueur n'y figure pas.
 */
export function extractMatchRow(match, puuid, matchId) {
  const info = match?.info;
  const p = info?.participants?.find(x => x.puuid === puuid);
  if (!p) return null;

  let position = p.teamPosition || '';
  if (position === 'UTILITY') position = 'SUPPORT';
  if (position === 'UNKNOWN') position = '';

  return {
    match_id: matchId || match.metadata?.matchId,
    queue_id: info.queueId,
    game_start: info.gameStartTimestamp || info.gameCreation || 0,
    champion: p.championName || '',
    kills: p.kills || 0,
    deaths: p.deaths || 0,
    assists: p.assists || 0,
    win: p.win ? 1 : 0,
    position,
    // Remake : abandon anticipé ou partie de moins de 5 min, exclue des stats
    remake: (p.gameEndedInEarlySurrender || (info.gameDuration || 0) < 300) ? 1 : 0
  };
}

/**
 * Stats sur des parties en cache. Renvoie null si aucune partie comptée (vrai « 0 partie »).
 */
export function computeStats(rows) {
  let totalKills = 0, totalDeaths = 0, totalAssists = 0, wins = 0, gamesCount = 0;
  const roles = {};
  const champions = {};

  for (const r of rows || []) {
    if (r.remake) continue;

    gamesCount++;
    totalKills += r.kills || 0;
    totalDeaths += r.deaths || 0;
    totalAssists += r.assists || 0;
    if (r.win) wins++;

    if (r.position) roles[r.position] = (roles[r.position] || 0) + 1;

    if (r.champion) {
      if (!champions[r.champion]) {
        champions[r.champion] = { wins: 0, games: 0, kills: 0, deaths: 0, assists: 0 };
      }
      const c = champions[r.champion];
      c.games++;
      if (r.win) c.wins++;
      c.kills += r.kills || 0;
      c.deaths += r.deaths || 0;
      c.assists += r.assists || 0;
    }
  }

  if (gamesCount === 0) return null;

  const kda = Math.round(((totalKills + totalAssists) / Math.max(1, totalDeaths)) * 100) / 100;
  const winrate = Math.round((wins / gamesCount) * 100);

  let mainRole = 'FILL';
  if (Object.keys(roles).length > 0) {
    mainRole = Object.keys(roles).reduce((a, b) => roles[a] > roles[b] ? a : b);
  }
  const roleCount = roles[mainRole] || 0;
  const rolePercentage = Math.round((roleCount / gamesCount) * 100);

  const champArray = Object.entries(champions).map(([name, data]) => ({
    name,
    wins: data.wins,
    games: data.games,
    winrate: data.games > 0 ? Math.round((data.wins / data.games) * 100) : 0,
    kda: Math.round(((data.kills + data.assists) / Math.max(1, data.deaths)) * 100) / 100
  }));

  champArray.sort((a, b) => b.games - a.games);

  // Champions principaux : le suivant n'est affiché que si le précédent n'a pas 2x plus de parties
  const bestChamps = [];
  for (let i = 0; i < Math.min(3, champArray.length); i++) {
    if (i > 0 && champArray[i - 1].games >= 2 * champArray[i].games) break;
    bestChamps.push(champArray[i]);
  }

  return {
    kda,
    avg_kills: Math.round((totalKills / gamesCount) * 10) / 10,
    avg_deaths: Math.round((totalDeaths / gamesCount) * 10) / 10,
    avg_assists: Math.round((totalAssists / gamesCount) * 10) / 10,
    winrate,
    wins,
    losses: gamesCount - wins,
    total_games: gamesCount,
    main_role: mainRole,
    role_percentage: rolePercentage,
    best_champions: bestChamps
  };
}

export async function getRankData(puuid) {
  try {
    const url = `https://${REGION_HOST}/lol/league/v4/entries/by-puuid/${puuid}`;
    const response = await safeRequest(url);
    const data = response.data || [];
    return data;
  } catch (err) {
    return [];
  }
}

export function formatRank(rankData) {
  const result = {
    soloq: { tier: null, rank: null, lp: 0, wins: 0, losses: 0 },
    flex: { tier: null, rank: null, lp: 0, wins: 0, losses: 0 }
  };

  if (!rankData || rankData.length === 0) return result;

  for (const entry of rankData) {
    if (!entry.tier) continue;

    const tier = entry.tier.charAt(0) + entry.tier.slice(1).toLowerCase();
    const rankObj = {
      tier: tier,
      rank: entry.rank || '',
      lp: entry.leaguePoints || 0,
      wins: entry.wins || 0,
      losses: entry.losses || 0,
      is_estimated: entry.is_estimated || false
    };

    if (entry.queueType === 'RANKED_SOLO_5x5') {
      result.soloq = rankObj;
    } else if (entry.queueType === 'RANKED_FLEX_SR') {
      result.flex = rankObj;
    }
  }

  return result;
}

export default {
  getRiotIdByPuuid,
  getPuuidByRiotId,
  getSummonerLevel,
  getMatchIds,
  getMatchDetails,
  extractMatchRow,
  computeStats,
  getRankData,
  formatRank
};
