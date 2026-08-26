import express from 'express';
import db from '../models/database.js';

const router = express.Router();

/**
 * GET /api/data/export
 * Exporte toutes les données (comptes, amis, préférences) en JSON téléchargeable.
 */
router.get('/export', (req, res) => {
  try {
    const data = db.exportUserData(req.session.user_id);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="savana-export-${date}.json"`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/data/import
 * Réimporte un fichier d'export : upsert par PUUID, préférences mises à jour.
 */
router.post('/import', (req, res) => {
  const data = req.body;
  if (!data || data.app !== 'savana' || !Array.isArray(data.smurfs)) {
    return res.status(400).json({ error: 'Fichier invalide : export Savana attendu' });
  }

  try {
    const result = db.importUserData(req.session.user_id, data);
    console.log(`[IMPORT] ${result.smurfs} smurf(s), ${result.friends} ami(s) importés`);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
