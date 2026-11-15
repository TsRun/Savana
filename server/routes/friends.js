import express from 'express';
import db from '../models/database.js';
import { getPuuidByRiotId } from '../utils/riotApi.js';
import { syncPlayer, normalizeFriendStats, mergeRank } from '../utils/playerSync.js';
import { registerSyncHandler, enqueueSync, activeSyncIds } from '../utils/syncQueue.js';

const router = express.Router();

function requireAuth(req, res, next) {
    if (!req.session.user_id) {
        return res.status(401).json({ error: 'Non authentifié' });
    }
    next();
}

/**
 * GET /api/friends
 * Amis avec leurs données en cache : { soloq, flex, stats_by_queue: { soloq?, flex? } }
 */
router.get('/', requireAuth, (req, res) => {
    const friends = db.getUserFriends(req.session.user_id)
        .map(f => ({ ...f, stats_json: normalizeFriendStats(f.stats_json) }));
    res.json(friends);
});

/**
 * POST /api/friends
 * Ajoute un ami par Riot ID et lance sa première synchronisation.
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

        const friendId = db.addFriend(userId, puuid, riotId);
        enqueueSync('friend', friendId);

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
 * Les deux queues sont toujours calculées : la queue éventuellement envoyée est ignorée.
 */
router.post('/:id/refresh', requireAuth, (req, res) => {
    const friendId = Number(req.params.id);
    // La recherche dans les amis de l'utilisateur vérifie aussi la propriété
    const friend = db.getUserFriends(req.session.user_id).find(f => f.id === friendId);
    if (!friend) return res.status(404).json({ error: 'Ami non trouvé' });

    enqueueSync('friend', friendId);
    res.json({ status: 'Refresh queued' });
});

/**
 * GET /api/friends/refresh-status
 * Amis en file ou en cours de synchronisation (suivi côté UI)
 */
router.get('/refresh-status', requireAuth, (req, res) => {
    const active = activeSyncIds('friend');
    const owned = db.getUserFriends(req.session.user_id).map(f => Number(f.id));
    res.json({ refreshing: owned.filter(id => active.has(id)) });
});

/**
 * Synchronisation d'un ami : mêmes règles que pour les comptes (mémoire du rang,
 * correction du PUUID, Riot ID suivi, stats gardées en cas d'erreur API).
 */
async function refreshFriend(friendId) {
    const friend = db.getFriendById(friendId);
    if (!friend) return;

    console.log(`[FRIENDS] Refreshing ${friend.pseudo}...`);
    const result = await syncPlayer({ puuid: friend.puuid, riotId: friend.pseudo, withLevel: false });
    const prev = normalizeFriendStats(friend.stats_json) || { soloq: null, flex: null, stats_by_queue: {} };

    const identity = {};
    if (result.puuid !== friend.puuid) identity.puuid = result.puuid;
    if (result.riotId && result.riotId !== friend.pseudo) identity.pseudo = result.riotId;
    if (Object.keys(identity).length > 0) db.updateFriendIdentity(friendId, identity);

    db.updateFriendData(friendId, {
        soloq: mergeRank(result.rank.soloq, prev.soloq),
        flex: mergeRank(result.rank.flex, prev.flex),
        stats_by_queue: { ...prev.stats_by_queue, ...result.stats }
    });
    console.log(`[FRIENDS] Refreshed ${result.riotId || friend.pseudo}`);
}

registerSyncHandler('friend', refreshFriend);

export default router;
