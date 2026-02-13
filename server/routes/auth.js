import express from 'express';
import db from '../models/database.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Inscription d'un nouvel utilisateur
 */
router.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username et password requis' });
  }

  const userId = db.createUser(username, password);
  if (userId) {
    req.session.user_id = userId;
    req.session.save();
    console.log(`[AUTH] Register OK - user_id=${userId}`);
    return res.status(201).json({ message: 'Utilisateur créé', user_id: userId });
  } else {
    return res.status(409).json({ error: 'Username déjà existant' });
  }
});

/**
 * POST /api/auth/login
 * Connexion d'un utilisateur
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  const userId = db.authenticateUser(username, password);
  if (userId) {
    req.session.user_id = userId;
    req.session.save();
    console.log(`[AUTH] Login OK - user_id=${userId}`);

    const prefs = db.getUserPreferences(userId);
    const userInfo = db.getUserInfo(userId);

    return res.json({
      message: 'Connexion réussie',
      user: userInfo,
      preferences: prefs
    });
  } else {
    console.log(`[AUTH] Login FAILED - username=${username}`);
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
});

/**
 * POST /api/auth/logout
 * Déconnexion
 */
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Déconnexion réussie' });
});

/**
 * GET /api/auth/me
 * Récupère l'utilisateur connecté
 */
router.get('/me', (req, res) => {
  const userId = req.session.user_id;
  console.log(`[AUTH] /api/auth/me - user_id: ${userId}`);

  if (!userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  const userInfo = db.getUserInfo(userId);
  const prefs = db.getUserPreferences(userId);

  res.json({
    user: userInfo,
    preferences: prefs
  });
});

export default router;
