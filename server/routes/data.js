import express from 'express';
import db from '../models/database.js';

const router = express.Router();

/**
 * POST /api/data/export  { password }
 * Exporte toutes les données (comptes, amis, préférences) en JSON téléchargeable.
 * Les identifiants Riot sont chiffrés avec le mot de passe fourni.
 */
router.post('/export', (req, res) => {
  const password = req.body?.password;
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Mot de passe requis', code: 'PASSWORD_REQUIRED' });
  }
  try {
    const data = db.exportUserData(req.session.user_id, password);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="savana-export-${date}.json"`);
    res.set('Cache-Control', 'no-store');
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
  // Corps : { data, password } (export v2 protégé) ou l'export lui-même (v1)
  const data = req.body?.data ?? req.body;
  const password = req.body?.password;
  if (!data || data.app !== 'savana' || !Array.isArray(data.smurfs)) {
    return res.status(400).json({ error: 'Fichier invalide : export Savana attendu' });
  }

  try {
    const result = db.importUserData(req.session.user_id, data, password);
    console.log(`[IMPORT] ${result.smurfs} smurf(s), ${result.friends} ami(s) importés`);
    res.json({ success: true, ...result });
  } catch (e) {
    if (['PASSWORD_REQUIRED', 'BAD_PASSWORD', 'BAD_FORMAT'].includes(e.code)) {
      return res.status(400).json({ error: e.message, code: e.code });
    }
    res.status(500).json({ error: e.message });
  }
});

export default router;
