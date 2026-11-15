
import express from 'express';
import db from '../models/database.js';
import { getPuuidByRiotId, getRankData, formatRank, getMatchIds, calculateStats, getSummonerLevel } from '../utils/riotApi.js';

const router = express.Router();

function requireAuth(req, res, next) {
    if (!req.session.user_id) {
        return res.status(401).json({ error: 'Non authentifié' });
    }
    next();
}

/**
 * GET /api/friends
 * Returns list of friends with cached stats
 */
router.get('/', requireAuth, (req, res) => {
    const friends = db.getUserFriends(req.session.user_id);
    res.json(friends);
});

/**
 * POST /api/friends
 * Add a new friend by Riot ID. Auto-fetches initial stats.
 */
router.post('/', requireAuth, async (req, res) => {
    const userId = req.session.user_id;
    const { riotId } = req.body;

    if (!riotId || !riotId.includes('#')) {
        return res.status(400).json({ error: 'Riot ID invalide (format Name#Tag)' });
    }

    const [gameName, tagLine] = riotId.split('#');

    try {
        const puuid = await getPuuidByRiotId(gameName, tagLine);
        if (!puuid) {
            return res.status(404).json({ error: 'Joueur introuvable' });
        }

        // Add to DB
        const friendId = db.addFriend(userId, puuid, riotId);

        // Trigger initial refresh
        refreshFriendStats(friendId, puuid).catch(console.error);

        res.status(201).json({ id: friendId, pseudo: riotId, puuid, stats_json: null });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * DELETE /api/friends/:id
 */
router.delete('/:id', requireAuth, (req, res) => {
    const success = db.deleteFriend(req.params.id, req.session.user_id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: 'Ami non trouvé' });
});

/**
 * POST /api/friends/:id/refresh
 */
// ...
router.post('/:id/refresh', requireAuth, async (req, res) => {
    const friendId = req.params.id;
    const { queue = 'soloq', period = '30' } = req.body;

    // We need the PUUID (la recherche dans les amis de l'utilisateur vérifie aussi la propriété)
    const friends = db.getUserFriends(req.session.user_id);
    const friend = friends.find(f => f.id == friendId);

    if (!friend) return res.status(404).json({ error: 'Ami non trouvé' });

    refreshFriendStats(friendId, friend.puuid, queue, period, friend.stats_json).catch(console.error);
    res.json({ status: 'Refresh queued' });
});

/**
 * GET /api/friends/refresh-status
 * Amis dont une actualisation est en cours (suivi côté UI)
 */
router.get('/refresh-status', requireAuth, (req, res) => {
    const owned = db.getUserFriends(req.session.user_id).map(f => f.id);
    res.json({ refreshing: owned.filter(id => inFlight.has(Number(id))) });
});

// Actualisations en vol par ami (compteur : plusieurs queues peuvent se chevaucher)
const inFlight = new Map();

/**
 * Helper to refresh stats (Rank + Main Role + Main Champs)
 * Les stats sont stockées par queue dans stats_by_queue pour ne pas
 * écraser celles des autres queues.
 */
async function refreshFriendStats(friendId, puuid, queue = 'soloq', period = '30', existingStatsJson = null) {
    const key = Number(friendId);
    inFlight.set(key, (inFlight.get(key) || 0) + 1);
    try {
        await doRefreshFriendStats(friendId, puuid, queue, period, existingStatsJson);
    } finally {
        const left = inFlight.get(key) - 1;
        if (left > 0) inFlight.set(key, left); else inFlight.delete(key);
    }
}

async function doRefreshFriendStats(friendId, puuid, queue, period, existingStatsJson) {
    console.log(`[FRIENDS] Refreshing ${friendId} (Queue: ${queue})...`);
    try {
        // 1. Rank (Always fetch rank data regardless of queue, used for badge)
        const rankData = await getRankData(puuid);
        const { soloq, flex } = formatRank(rankData);

        // 2. Stats (Filtered by Queue). Une erreur API garde les stats précédentes.
        const prev = existingStatsJson || {};
        const statsByQueue = { ...(prev.stats_by_queue || {}) };
        let stats_calc = null;
        let statsFailed = false;
        try {
            const matchIds = await getMatchIds(puuid, queue, period);
            stats_calc = await calculateStats(puuid, matchIds);
            statsByQueue[queue] = stats_calc;
        } catch (e) {
            statsFailed = true;
            console.error(`[FRIENDS] Stats ${queue} non mises à jour pour ${friendId} : ${e.message}`);
        }

        const stats = {
            soloq,
            flex,
            // dernière queue rafraîchie (compat)
            stats: statsFailed ? (prev.stats ?? null) : stats_calc,
            stats_by_queue: statsByQueue,    // stats par queue
            filter: statsFailed ? (prev.filter ?? { queue, period }) : { queue, period }
        };

        db.updateFriendData(friendId, stats);
        console.log(`[FRIENDS] Refreshed ${friendId}`);
    } catch (e) {
        console.error(`[FRIENDS] Failed refresh ${friendId}:`, e);
    }
}

export default router;
