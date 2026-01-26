import Database from 'better-sqlite3';
import crypto from 'crypto';
import { config } from '../config.js';

const db = new Database(config.dbPath);

// Active les clés étrangères
db.pragma('foreign_keys = ON');

/**
 * Initialise la base de données avec les tables nécessaires
 */
export function initDb() {
  // Table des utilisateurs
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      google_id TEXT UNIQUE,
      riot_id TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Table des smurfs
  db.exec(`
    CREATE TABLE IF NOT EXISTS smurfs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      puuid TEXT NOT NULL,
      pseudo TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      
      -- SoloQ
      soloq_tier TEXT DEFAULT NULL,
      soloq_rank TEXT DEFAULT NULL,
      soloq_lp INTEGER DEFAULT 0,
      soloq_wins INTEGER DEFAULT 0,
      soloq_losses INTEGER DEFAULT 0,
      
      -- Flex
      flex_tier TEXT DEFAULT NULL,
      flex_rank TEXT DEFAULT NULL,
      flex_lp INTEGER DEFAULT 0,
      flex_wins INTEGER DEFAULT 0,
      flex_losses INTEGER DEFAULT 0,
      
      -- Autre
      level INTEGER DEFAULT 0,
      
      -- Cookies Riot pour auto-login
      riot_tokens TEXT DEFAULT NULL,
      
      -- Stats pré-calculées pour chaque combinaison
      stats_30_ranked TEXT,
      stats_30_all TEXT,
      stats_season_ranked TEXT,
      stats_season_all TEXT,
      last_updated TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Table des préférences utilisateur
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY,
      stats_period TEXT DEFAULT '30',
      stats_queue TEXT DEFAULT 'ranked',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Index pour performance
  db.exec('CREATE INDEX IF NOT EXISTS idx_smurfs_user ON smurfs(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_smurfs_puuid ON smurfs(puuid)');

  // Migration: Ajouter la colonne riot_tokens si elle n'existe pas
  try {
    const tableInfo = db.prepare("PRAGMA table_info(smurfs)").all();
    const hasRiotTokens = tableInfo.some(col => col.name === 'riot_tokens');
    if (!hasRiotTokens) {
      db.exec('ALTER TABLE smurfs ADD COLUMN riot_tokens TEXT DEFAULT NULL');
      console.log('[DB] Migration: colonne riot_tokens ajoutee');
    }
  } catch (err) {
    console.error('[DB] Erreur migration riot_tokens:', err.message);
  }

  console.log('[DB] Base de donnees initialisee');
}

/**
 * Hash un mot de passe avec SHA256
 */
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// === USERS ===

/**
 * Crée un nouvel utilisateur
 * @returns {number|null} user_id ou null si username existe déjà
 */
export function createUser(username, password, googleId = null, riotId = null) {
  try {
    const passwordHash = hashPassword(password);
    const stmt = db.prepare('INSERT INTO users (username, password_hash, google_id, riot_id) VALUES (?, ?, ?, ?)');
    const info = stmt.run(username, passwordHash, googleId, riotId);
    const userId = info.lastInsertRowid;

    // Créer les préférences par défaut
    const prefStmt = db.prepare('INSERT INTO user_preferences (user_id) VALUES (?)');
    prefStmt.run(userId);

    return userId;
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT' || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return null; // Username déjà existant
    }
    throw err;
  }
}

/**
 * Authentifie un utilisateur
 * @returns {number|null} user_id ou null si invalide
 */
export function findUserByGoogleId(googleId) {
  const stmt = db.prepare('SELECT id FROM users WHERE google_id = ?');
  const user = stmt.get(googleId);
  return user ? user.id : null;
}

export function findUserByRiotId(riotId) {
  const stmt = db.prepare('SELECT id FROM users WHERE riot_id = ?');
  const user = stmt.get(riotId);
  return user ? user.id : null;
}

export function authenticateUser(username, password) {
  const passwordHash = hashPassword(password);
  const stmt = db.prepare('SELECT id FROM users WHERE username = ? AND password_hash = ?');
  const user = stmt.get(username, passwordHash);
  return user ? user.id : null;
}



/**
 * Récupère les infos d'un utilisateur
 */
export function getUserInfo(userId) {
  const stmt = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?');
  return stmt.get(userId);
}

// === SMURFS ===

/**
 * Ajoute un smurf pour un utilisateur
 */
export function addSmurf(userId, puuid, pseudo, username, password) {
  const stmt = db.prepare(`
    INSERT INTO smurfs (user_id, puuid, pseudo, username, password)
    VALUES (?, ?, ?, ?, ?)
  `);
  const info = stmt.run(userId, puuid, pseudo, username, password);
  return info.lastInsertRowid;
}

/**
 * Récupère tous les smurfs d'un utilisateur
 */
export function getUserSmurfs(userId) {
  const stmt = db.prepare('SELECT * FROM smurfs WHERE user_id = ? ORDER BY created_at DESC');
  const smurfs = stmt.all(userId);

  // Parser tous les JSON stats
  return smurfs.map(smurf => ({
    ...smurf,
    stats_30_ranked: smurf.stats_30_ranked ? JSON.parse(smurf.stats_30_ranked) : null,
    stats_30_all: smurf.stats_30_all ? JSON.parse(smurf.stats_30_all) : null,
    stats_season_ranked: smurf.stats_season_ranked ? JSON.parse(smurf.stats_season_ranked) : null,
    stats_season_all: smurf.stats_season_all ? JSON.parse(smurf.stats_season_all) : null
  }));
}

/**
 * Met à jour les données d'un smurf
 */
export function updateSmurfData(smurfId, data) {
  const fields = [];
  const values = [];

  // SoloQ
  if (data.soloq_tier !== undefined) {
    fields.push('soloq_tier = ?');
    values.push(data.soloq_tier);
  }
  if (data.soloq_rank !== undefined) {
    fields.push('soloq_rank = ?');
    values.push(data.soloq_rank);
  }
  if (data.soloq_lp !== undefined) {
    fields.push('soloq_lp = ?');
    values.push(data.soloq_lp);
  }
  if (data.soloq_wins !== undefined) {
    fields.push('soloq_wins = ?');
    values.push(data.soloq_wins);
  }
  if (data.soloq_losses !== undefined) {
    fields.push('soloq_losses = ?');
    values.push(data.soloq_losses);
  }

  // Flex
  if (data.flex_tier !== undefined) {
    fields.push('flex_tier = ?');
    values.push(data.flex_tier);
  }
  if (data.flex_rank !== undefined) {
    fields.push('flex_rank = ?');
    values.push(data.flex_rank);
  }
  if (data.flex_lp !== undefined) {
    fields.push('flex_lp = ?');
    values.push(data.flex_lp);
  }
  if (data.flex_wins !== undefined) {
    fields.push('flex_wins = ?');
    values.push(data.flex_wins);
  }
  if (data.flex_losses !== undefined) {
    fields.push('flex_losses = ?');
    values.push(data.flex_losses);
  }

  // Autre
  if (data.level !== undefined) {
    fields.push('level = ?');
    values.push(data.level);
  }

  // Stats pré-calculées
  if (data.stats_30_ranked !== undefined) {
    fields.push('stats_30_ranked = ?');
    values.push(JSON.stringify(data.stats_30_ranked));
  }
  if (data.stats_30_all !== undefined) {
    fields.push('stats_30_all = ?');
    values.push(JSON.stringify(data.stats_30_all));
  }
  if (data.stats_season_ranked !== undefined) {
    fields.push('stats_season_ranked = ?');
    values.push(JSON.stringify(data.stats_season_ranked));
  }
  if (data.stats_season_all !== undefined) {
    fields.push('stats_season_all = ?');
    values.push(JSON.stringify(data.stats_season_all));
  }

  fields.push('last_updated = CURRENT_TIMESTAMP');
  values.push(smurfId);

  const sql = `UPDATE smurfs SET ${fields.join(', ')} WHERE id = ?`;
  const stmt = db.prepare(sql);
  stmt.run(...values);
}

/**
 * Supprime un smurf
 */
export function deleteSmurf(smurfId, userId) {
  const stmt = db.prepare('DELETE FROM smurfs WHERE id = ? AND user_id = ?');
  const info = stmt.run(smurfId, userId);
  return info.changes > 0;
}

/**
 * Récupère un smurf par ID
 */
export function getSmurfById(smurfId) {
  const stmt = db.prepare('SELECT * FROM smurfs WHERE id = ?');
  const smurf = stmt.get(smurfId);
  if (smurf && smurf.stats) {
    smurf.stats = JSON.parse(smurf.stats);
  }
  return smurf;
}

/**
 * Met à jour les tokens Riot d'un smurf
 */
export function updateSmurfTokens(smurfId, tokens) {
  const stmt = db.prepare('UPDATE smurfs SET riot_tokens = ? WHERE id = ?');
  const info = stmt.run(JSON.stringify(tokens), smurfId);
  return info.changes > 0;
}

/**
 * Met à jour le PUUID d'un smurf (en cas de correction automatique)
 */
export function updateSmurfPuuid(smurfId, newPuuid) {
  const stmt = db.prepare('UPDATE smurfs SET puuid = ? WHERE id = ?');
  const info = stmt.run(newPuuid, smurfId);
  return info.changes > 0;
}

// === PREFERENCES ===

/**
 * Récupère les préférences d'un utilisateur
 */
export function getUserPreferences(userId) {
  const stmt = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?');
  return stmt.get(userId) || { stats_period: '30', stats_queue: 'ranked' };
}

/**
 * Met à jour les préférences d'un utilisateur
 */
export function updateUserPreferences(userId, statsPeriod, statsQueue) {
  const stmt = db.prepare(`
    INSERT INTO user_preferences (user_id, stats_period, stats_queue)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      stats_period = excluded.stats_period,
      stats_queue = excluded.stats_queue
  `);
  stmt.run(userId, statsPeriod, statsQueue);
}

export default {
  initDb,
  createUser,
  authenticateUser,
  getUserInfo,
  addSmurf,
  getUserSmurfs,
  updateSmurfData,
  updateSmurfPuuid,
  updateSmurfTokens,
  deleteSmurf,
  getSmurfById,
  getUserPreferences,
  updateUserPreferences,
  findUserByGoogleId,
  findUserByRiotId
};
