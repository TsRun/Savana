import axios from 'axios';
import { config } from '../config.js';

const REGION_HOST = config.regionHost;
const ROUTING_VALUE = config.routingValue;
const API_KEY = config.riotApiKey;

const headers = { 'X-Riot-Token': API_KEY };

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

async function safeRequest(url, options = {}) {
  // Enqueue the request
  return limiter.add(() => axios.get(url, { ...options, headers }));
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

export async function getSummonerLevel(puuid, gameName = null, tagLine = null) {
  try {
    const url = `https://${REGION_HOST}/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    const response = await safeRequest(url);
    return { level: response.data.summonerLevel || null, puuid };
  } catch (err) {
    // Retry logic if 400/404 AND we have RiotID
    if ((err.response?.status === 400 || err.response?.status === 404) && gameName && tagLine) {
      console.log(`   [API] PUUID suspect, tentative correction via ${gameName}#${tagLine}...`);
      const newPuuid = await getPuuidByRiotId(gameName, tagLine);
      if (newPuuid && newPuuid !== puuid) {
        try {
          const url2 = `https://${REGION_HOST}/lol/summoner/v4/summoners/by-puuid/${newPuuid}`;
          const response2 = await safeRequest(url2);
          return { level: response2.data.summonerLevel || null, puuid: newPuuid, corrected: true };
        } catch (e) { /* ignore */ }
      }
    }
    return { level: null, puuid };
  }
}

// Queue IDs Mapping
const QUEUE_IDS = {
  'soloq': 420,    // Ranked Solo/Duo
  'ranked': 420,   // Alias for backward compat
  'flex': 440,
  'aram': 450,
  'arena': 1700,
  'normal': 400,
  'quickplay': 490
};

export async function getMatchIds(puuid, queueType = 'ranked', period = '30') {
  const url = `https://${ROUTING_VALUE}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`;

  const currentTime = Math.floor(Date.now() / 1000);
  let startTime;

  if (period === '30') {
    startTime = currentTime - (30 * 24 * 60 * 60);
  } else if (period === 'season') {
    const seasonStart = new Date('2025-01-08T00:00:00Z');
    startTime = Math.floor(seasonStart.getTime() / 1000);
  } else {
    // 'all' or fallback: look back 6 months
    startTime = currentTime - (180 * 24 * 60 * 60);
  }

  // LIMITATION: On ne récupère que les 20 derniers matchs MAX pour économiser les requêtes
  const count = 20;

  const params = { start: 0, count, startTime };

  if (queueType !== 'all' && QUEUE_IDS[queueType]) {
    params.queue = QUEUE_IDS[queueType];
  }

  try {
    const response = await safeRequest(url, { params });
    const matches = response.data || [];
    console.log(`   [API] Matchs récupérés: ${matches.length} (${period}/${queueType})`);
    return matches;
  } catch (err) {
    console.error(`   [API] Erreur MatchIds: ${err.message}`);
    return [];
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

// Function helper pour batcher (bien que notre RateLimiter serialise déjà tout)
async function getMatchDetailsBatch(matchIds) {
  const results = [];
  // On traite séquentiellement pour ne pas bourrer la queue du RateLimiter
  for (const id of matchIds) {
    const detail = await getMatchDetails(id);
    if (detail) results.push(detail);
  }
  return results;
}

export async function calculateStats(puuid, matchIds) {
  if (!matchIds || matchIds.length === 0) return null;

  console.log(`   [API] Analyse de ${matchIds.length} matchs... (Est: ${matchIds.length * 1.25}s)`);

  const matches = await getMatchDetailsBatch(matchIds);
  if (matches.length === 0) return null;

  let totalKills = 0, totalDeaths = 0, totalAssists = 0, wins = 0, gamesCount = 0;
  const roles = {};
  const champions = {};

  for (const data of matches) {
    const participant = data.info?.participants?.find(p => p.puuid === puuid);
    if (!participant) continue;

    gamesCount++;
    totalKills += participant.kills || 0;
    totalDeaths += participant.deaths || 0;
    totalAssists += participant.assists || 0;
    if (participant.win) wins++;

    let role = participant.teamPosition || 'UNKNOWN';
    if (role === 'UTILITY') role = 'SUPPORT';
    if (role && role !== 'UNKNOWN' && role !== '') {
      roles[role] = (roles[role] || 0) + 1;
    }

    const champName = participant.championName;
    if (champName) {
      if (!champions[champName]) {
        champions[champName] = { wins: 0, games: 0, kills: 0, deaths: 0, assists: 0 };
      }
      champions[champName].games++;
      if (participant.win) champions[champName].wins++;
      champions[champName].kills += participant.kills || 0;
      champions[champName].deaths += participant.deaths || 0;
      champions[champName].assists += participant.assists || 0;
    }
  }

  if (gamesCount === 0) return null;

  const kda = Math.round(((totalKills + totalAssists) / Math.max(1, totalDeaths)) * 100) / 100;
  const winrate = Math.round((wins / gamesCount) * 100);

  let mainRole = 'FILL';
  if (Object.keys(roles).length > 0) {
    mainRole = Object.keys(roles).reduce((a, b) => roles[a] > roles[b] ? a : b, 'FILL');
  }
  const roleCount = roles[mainRole] || 0;
  const rolePercentage = gamesCount > 0 ? Math.round((roleCount / gamesCount) * 100) : 0;

  const champArray = Object.entries(champions).map(([name, data]) => ({
    name,
    wins: data.wins,
    games: data.games,
    winrate: data.games > 0 ? Math.round((data.wins / data.games) * 100) : 0,
    kda: Math.round(((data.kills + data.assists) / Math.max(1, data.deaths)) * 100) / 100
  }));

  champArray.sort((a, b) => b.games - a.games);

  // Logic "Main Champions" (Rule: 2x games to stand out)
  let bestChamps = [];
  if (champArray.length > 0) {
    bestChamps.push(champArray[0]);
    if (champArray.length > 1) {
      // If #1 has < 2x games of #2, show #2 as well
      if (champArray[0].games < (2 * champArray[1].games)) {
        bestChamps.push(champArray[1]);
        if (champArray.length > 2) {
          // If #2 has < 2x games of #3, show #3 as well
          if (champArray[1].games < (2 * champArray[2].games)) {
            bestChamps.push(champArray[2]);
          }
        }
      }
    }
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
  calculateStats,
  getRankData,
  formatRank
};
