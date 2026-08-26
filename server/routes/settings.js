import express from 'express';
import axios from 'axios';
import { config, getRiotApiKey, setRiotApiKey } from '../config.js';

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user_id) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

/**
 * GET /api/settings/riot-key
 * État de la clé API Riot (jamais renvoyée en clair, juste masquée)
 */
router.get('/riot-key', requireAuth, (req, res) => {
  const key = getRiotApiKey();
  res.json({
    configured: !!key,
    masked: key ? `${key.slice(0, 6)}…${key.slice(-4)}` : null,
    fromEnv: !!process.env.RIOT_API_KEY
  });
});

/**
 * PUT /api/settings/riot-key
 * Enregistre la clé après l'avoir validée contre l'API Riot
 */
router.put('/riot-key', requireAuth, async (req, res) => {
  const key = String(req.body?.key || '').trim();
  if (!key) return res.status(400).json({ error: 'Clé requise' });

  // Validation live : endpoint léger, hors rate limiter (appel unique)
  try {
    await axios.get(`https://${config.regionHost}/lol/status/v4/platform-data`, {
      headers: { 'X-Riot-Token': key },
      timeout: 10000
    });
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      return res.status(400).json({ error: 'Clé invalide ou expirée (les clés dev Riot expirent après 24h)' });
    }
    // Réseau/5xx : on accepte quand même (la clé sera peut-être valide)
    console.warn('[SETTINGS] Validation clé impossible:', err.message);
  }

  try {
    setRiotApiKey(key);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
