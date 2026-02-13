import express from 'express';
import db from '../models/database.js';

const router = express.Router();

/**
 * Middleware: Vérifier l'authentification
 */
function requireAuth(req, res, next) {
  if (!req.session.user_id) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

/**
 * GET /api/tokens/:smurfId
 * Récupère les tokens sauvegardés pour un smurf
 */
router.get('/:smurfId', requireAuth, (req, res) => {
  const userId = req.session.user_id;
  const smurfId = parseInt(req.params.smurfId);
  
  const smurf = db.getSmurfById(smurfId);
  
  if (!smurf || smurf.user_id !== userId) {
    return res.status(404).json({ error: 'Smurf non trouvé' });
  }
  
  res.json({ 
    tokens: smurf.riot_tokens ? JSON.parse(smurf.riot_tokens) : null
  });
});

/**
 * PUT /api/tokens/:smurfId
 * Sauvegarde les tokens Riot pour un smurf
 */
router.put('/:smurfId', requireAuth, (req, res) => {
  const userId = req.session.user_id;
  const smurfId = parseInt(req.params.smurfId);
  const { tokens } = req.body;
  
  if (!tokens || typeof tokens !== 'object') {
    return res.status(400).json({ error: 'Tokens invalides' });
  }
  
  const smurf = db.getSmurfById(smurfId);
  
  if (!smurf || smurf.user_id !== userId) {
    return res.status(404).json({ error: 'Smurf non trouvé' });
  }
  
  const success = db.updateSmurfTokens(smurfId, tokens);
  
  if (success) {
    res.json({ message: 'Tokens sauvegardés' });
  } else {
    res.status(500).json({ error: 'Erreur de sauvegarde' });
  }
});

export default router;
