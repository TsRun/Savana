import axios from 'axios';
import { config } from '../config.js';

const REGION_HOST = config.regionHost;
const ROUTING_VALUE = config.routingValue;
const API_KEY = config.riotApiKey;

const headers = { 'X-Riot-Token': API_KEY };

// Rate limiting - 10ms entre requêtes (limites Production très élevées)
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 10;

// Cache pour les PUUIDs corrigés (évite de refaire la requête)
const puuidCache = new Map();

// Récupérer le PUUID via Riot ID (gameName#tagLine)
export async function getPuuidByRiotId(gameName, tagLine) {
  const cacheKey = `${gameName}#${tagLine}`;
  if (puuidCache.has(cacheKey)) {
    return puuidCache.get(cacheKey);
  }
  
  try {
    const url = `https://${ROUTING_VALUE}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const response = await rateLimitedRequest(url);
    const puuid = response.data?.puuid;
    if (puuid) {
      puuidCache.set(cacheKey, puuid);
      console.log(`   [+] PUUID recupere pour ${cacheKey}`);
    }
    return puuid;
  } catch (err) {
    console.error(`   [!] Impossible de recuperer PUUID pour ${cacheKey}: ${err.message}`);
    return null;
  }
}

async function rateLimitedRequest(url, options = {}) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  return axios.get(url, { ...options, headers });
}

export async function getSummonerLevel(puuid, gameName = null, tagLine = null) {
  try {
    const url = `https://${REGION_HOST}/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    const response = await rateLimitedRequest(url);
    return { level: response.data.summonerLevel || null, puuid };
  } catch (err) {
    // Si erreur 400 et qu'on a le Riot ID, essayer de récupérer le bon PUUID
    if (err.response?.status === 400 && gameName && tagLine) {
      console.log(`   [!] PUUID invalide, tentative de recuperation via ${gameName}#${tagLine}...`);
      const newPuuid = await getPuuidByRiotId(gameName, tagLine);
      if (newPuuid && newPuuid !== puuid) {
        // Réessayer avec le nouveau PUUID
        try {
          const url2 = `https://${REGION_HOST}/lol/summoner/v4/summoners/by-puuid/${newPuuid}`;
          const response2 = await rateLimitedRequest(url2);
          return { level: response2.data.summonerLevel || null, puuid: newPuuid, corrected: true };
        } catch (err2) {
          console.error(`get_summoner_level error (retry): ${err2.message}`);
        }
      }
    } else if (err.response?.status !== 404) {
      console.error(`get_summoner_level error: ${err.message}`);
    }
    return { level: null, puuid };
  }
}

export async function getMatchIds(puuid, queueType = 'ranked', period = '30') {
  const url = `https://${ROUTING_VALUE}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`;
  
  const currentTime = Math.floor(Date.now() / 1000);
  let startTime;
  
  if (period === '30') {
    startTime = currentTime - (30 * 24 * 60 * 60);
  } else {
    const seasonStart = new Date('2025-01-08T00:00:00Z');
    startTime = Math.floor(seasonStart.getTime() / 1000);
  }
  
  const allMatches = [];
  let startIndex = 0;
  const countPerRequest = 100;
  
  while (true) {
    const params = {
      start: startIndex,
      count: countPerRequest,
      startTime: startTime
    };
    
    if (queueType === 'ranked') {
      params.queue = 420;
    }
    
    try {
      const response = await rateLimitedRequest(url, { params });
      const matches = response.data || [];
      
      if (!matches || matches.length === 0) break;
      
      allMatches.push(...matches);
      startIndex += countPerRequest;
      
      if (matches.length < countPerRequest) break;
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error(`get_match_ids error: ${err.message}`);
      }
      break;
    }
  }
  
  console.log(`   -> ${allMatches.length} matchs (${period}/${queueType})`);
  return allMatches;
}

export async function getMatchDetails(matchId) {
  try {
    const url = `https://${ROUTING_VALUE}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    const response = await rateLimitedRequest(url);
    return response.data;
  } catch (err) {
    return null;
  }
}

async function getMatchDetailsBatch(matchIds, batchSize = 5) {
  const results = [];
  
  for (let i = 0; i < matchIds.length; i += batchSize) {
    const batch = matchIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(id => getMatchDetails(id)));
    results.push(...batchResults.filter(Boolean));
    
    if (i + batchSize < matchIds.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  return results;
}

export async function calculateStats(puuid, matchIds) {
  if (!matchIds || matchIds.length === 0) return null;
  
  console.log(`   Analyse de ${matchIds.length} matchs...`);
  
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
    best_champions: champArray.slice(0, 3)
  };
}

export async function getRankData(puuid) {
  try {
    const url = `https://${REGION_HOST}/lol/league/v4/entries/by-puuid/${puuid}`;
    const response = await rateLimitedRequest(url);
    return response.data || [];
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
      losses: entry.losses || 0
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
  getPuuidByRiotId,
  getSummonerLevel,
  getMatchIds,
  getMatchDetails,
  calculateStats,
  getRankData,
  formatRank
};
