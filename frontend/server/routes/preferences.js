import express from 'express';
import db from '../models/database.js';

const router = express.Router();

/**
 * PUT /api/preferences
 * Met à jour les préférences utilisateur
 */
router.put('/', (req, res) => {
  const userId = req.session.user_id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  
  const { stats_period, stats_queue } = req.body;
  
  db.updateUserPreferences(userId, stats_period, stats_queue);
  
  res.json({ message: 'Préférences mises à jour' });
});

export default router;
