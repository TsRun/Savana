import initSqlJs from 'sql.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { encrypt, decrypt, isEncrypted } from '../utils/crypto.js';

let db = null;
let SQL = null;

/**
 * Sauvegarde la base de données sur le disque
 */
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(config.dbPath, buffer);
  }
}

/**
 * Initialise la connexion à la base de données
 */
async function initConnection() {
  if (db) return db;

  SQL = await initSqlJs();

  // Charger la base de données existante ou en créer une nouvelle
  if (fs.existsSync(config.dbPath)) {
    const buffer = fs.readFileSync(config.dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Activer les clés étrangères
  db.run('PRAGMA foreign_keys = ON');

  return db;
}

/**
 * Initialise la base de données avec les tables nécessaires
 */
export async function initDb() {
  await initConnection();

  // Table des utilisateurs
  db.run(`
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
  db.run(`
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
  db.run(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY,
      stats_period TEXT DEFAULT '30',
      stats_queue TEXT DEFAULT 'soloq',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Table des amis (Friends)
  db.run(`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      puuid TEXT NOT NULL,
      pseudo TEXT NOT NULL,
      stats_json TEXT DEFAULT NULL,
      last_updated TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Index pour performance
  db.run('CREATE INDEX IF NOT EXISTS idx_smurfs_user ON smurfs(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_smurfs_puuid ON smurfs(puuid)');

  // Migration: Ajouter la colonne riot_tokens si elle n'existe pas
  try {
    const tableInfo = db.exec("PRAGMA table_info(smurfs)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map(row => row[1]);
      if (!columns.includes('riot_tokens')) {
        db.run('ALTER TABLE smurfs ADD COLUMN riot_tokens TEXT DEFAULT NULL');
        console.log('[DB] Migration: colonne riot_tokens ajoutee');
      }
    }
  } catch (err) {
    console.error('[DB] Erreur migration riot_tokens:', err.message);
  }

  // Migration: Ajouter la colonne tour_completed si elle n'existe pas
  try {
    const tableInfo = db.exec("PRAGMA table_info(user_preferences)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map(row => row[1]);
      if (!columns.includes('tour_completed')) {
        db.run('ALTER TABLE user_preferences ADD COLUMN tour_completed INTEGER DEFAULT 0');
        console.log('[DB] Migration: colonne tour_completed ajoutee');
      }
    }
  } catch (err) {
    console.error('[DB] Erreur migration tour_completed:', err.message);
  }

  // Migration: Ajouter la colonne stats_json si elle n'existe pas
  try {
    const tableInfo = db.exec("PRAGMA table_info(smurfs)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map(row => row[1]);
      if (!columns.includes('stats_json')) {
        db.run('ALTER TABLE smurfs ADD COLUMN stats_json TEXT DEFAULT NULL');
        console.log('[DB] Migration: colonne stats_json ajoutee');
      }
    }
  } catch (err) {
    console.error('[DB] Erreur migration stats_json:', err.message);
  }

  // Migration: Ajouter la colonne session_saved_at pour tracker l'âge des sessions
  try {
    const tableInfo = db.exec("PRAGMA table_info(smurfs)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map(row => row[1]);
      if (!columns.includes('session_saved_at')) {
        db.run('ALTER TABLE smurfs ADD COLUMN session_saved_at TIMESTAMP DEFAULT NULL');
        console.log('[DB] Migration: colonne session_saved_at ajoutee');
      }
    }
  } catch (err) {
    console.error('[DB] Erreur migration session_saved_at:', err.message);
  }

  // Migration: Update old 'ranked' preference to 'soloq'
  try {
    db.run("UPDATE user_preferences SET stats_queue = 'soloq' WHERE stats_queue = 'ranked'");
  } catch (e) {
    console.error('[DB] Migration prefs ranked->soloq fail:', e.message);
  }

  // Migration: Add sort_order column for drag-and-drop reordering
  try {
    const tableInfo = db.exec("PRAGMA table_info(smurfs)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map(row => row[1]);
      if (!columns.includes('sort_order')) {
        db.run('ALTER TABLE smurfs ADD COLUMN sort_order INTEGER DEFAULT NULL');
        console.log('[DB] Migration: colonne sort_order ajoutee');
      }
    }
  } catch (err) {
    console.error('[DB] Erreur migration sort_order:', err.message);
  }

  // Migration: chiffrer les secrets existants stockés en clair (username, password, riot_tokens)
  try {
    const res = db.exec('SELECT id, username, password, riot_tokens FROM smurfs');
    if (res.length > 0) {
      let migrated = 0;
      for (const row of res[0].values) {
        const [id, username, password, tokens] = row;
        const needs = [username, password, tokens].some(
          v => v !== null && v !== undefined && String(v) !== '' && !isEncrypted(v)
        );
        if (needs) {
          db.run(
            'UPDATE smurfs SET username = ?, password = ?, riot_tokens = ? WHERE id = ?',
            [encrypt(username), encrypt(password), encrypt(tokens), id]
          );
          migrated++;
        }
      }
      if (migrated > 0) console.log(`[DB] Migration chiffrement: ${migrated} smurf(s) chiffré(s)`);
    }
  } catch (err) {
    console.error('[DB] Migration chiffrement échouée:', err.message);
  }

  saveDatabase();
  console.log('[DB] Base de donnees initialisee');
}

/**
 * Hash un mot de passe avec scrypt + sel aléatoire.
 * Format stocké: "scrypt$<saltHex>$<hashHex>"
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

/**
 * Vérifie un mot de passe contre un hash stocké.
 * Supporte le nouveau format scrypt ET l'ancien SHA-256 nu (pour migration).
 * Comparaison en temps constant.
 */
function verifyPassword(password, stored) {
  if (!stored) return false;
  stored = String(stored);

  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$');
    if (!salt || !hash) return false;
    const derived = crypto.scryptSync(String(password), salt, 64);
    const hashBuf = Buffer.from(hash, 'hex');
    if (hashBuf.length !== derived.length) return false;
    return crypto.timingSafeEqual(hashBuf, derived);
  }

  // Legacy: SHA-256 nu (hex 64 chars)
  const legacy = crypto.createHash('sha256').update(String(password)).digest('hex');
  if (legacy.length !== stored.length) return false;
  return crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(stored));
}

/**
 * Indique si un hash stocké utilise l'ancien schéma (à migrer).
 */
function isLegacyHash(stored) {
  return !!stored && !String(stored).startsWith('scrypt$');
}




// === USERS ===

export function createUser(username, password) {
  try {
    const passwordHash = hashPassword(password);
    db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]);

    const result = db.exec('SELECT last_insert_rowid() as id');
    const userId = result[0].values[0][0];

    // Créer les préférences par défaut
    db.run('INSERT INTO user_preferences (user_id) VALUES (?)', [userId]);

    saveDatabase();
    return userId;
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return null; // Username déjà existant
    }
    throw err;
  }
}


export function authenticateUser(username, password) {
  const result = db.exec('SELECT id, password_hash FROM users WHERE username = ?', [username]);
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const userId = result[0].values[0][0];
  const storedHash = result[0].values[0][1];

  if (!verifyPassword(password, storedHash)) {
    return null;
  }

  // Migration transparente: ré-hacher en scrypt si ancien format
  if (isLegacyHash(storedHash)) {
    try {
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), userId]);
      saveDatabase();
      console.log(`[DB] Hash mot de passe migré vers scrypt (user_id=${userId})`);
    } catch (e) {
      console.error('[DB] Échec migration hash:', e.message);
    }
  }

  return userId;
}

/**
 * Récupère les infos d'un utilisateur
 */
export function getUserInfo(userId) {
  const result = db.exec('SELECT id, username, created_at FROM users WHERE id = ?', [userId]);
  if (result.length > 0 && result[0].values.length > 0) {
    const row = result[0].values[0];
    return { id: row[0], username: row[1], created_at: row[2] };
  }
  return null;
}

// === SMURFS ===

/**
 * Ajoute un smurf pour un utilisateur
 */
export function addSmurf(userId, puuid, pseudo, username, password) {
  db.run(`
    INSERT INTO smurfs (user_id, puuid, pseudo, username, password)
    VALUES (?, ?, ?, ?, ?)
  `, [userId, puuid, pseudo, encrypt(username), encrypt(password)]);

  const result = db.exec('SELECT last_insert_rowid() as id');
  saveDatabase();
  return result[0].values[0][0];
}

/**
 * Récupère tous les smurfs d'un utilisateur
 */
export function getUserSmurfs(userId) {
  const result = db.exec('SELECT * FROM smurfs WHERE user_id = ? ORDER BY CASE WHEN sort_order IS NOT NULL THEN 0 ELSE 1 END, sort_order ASC, created_at DESC', [userId]);

  if (result.length === 0) return [];

  const columns = result[0].columns;
  const smurfs = result[0].values.map(row => {
    const smurf = {};
    columns.forEach((col, i) => {
      smurf[col] = row[i];
    });
    return smurf;
  });

  // Parser tous les JSON stats + déchiffrer les secrets
  return smurfs.map(smurf => ({
    ...smurf,
    username: decrypt(smurf.username),
    password: decrypt(smurf.password),
    riot_tokens: decrypt(smurf.riot_tokens),
    stats_json: smurf.stats_json ? JSON.parse(smurf.stats_json) : {},
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
  if (data.pseudo !== undefined) {
    fields.push('pseudo = ?');
    values.push(data.pseudo);
  }
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

  if (data.stats_json !== undefined) {
    fields.push('stats_json = ?');
    values.push(JSON.stringify(data.stats_json));
  }

  fields.push('last_updated = CURRENT_TIMESTAMP');
  values.push(smurfId);

  const sql = `UPDATE smurfs SET ${fields.join(', ')} WHERE id = ?`;
  db.run(sql, values);
  saveDatabase();
}

/**
 * Supprime un smurf
 */
export function deleteSmurf(smurfId, userId) {
  db.run('DELETE FROM smurfs WHERE id = ? AND user_id = ?', [smurfId, userId]);
  const changes = db.getRowsModified();
  saveDatabase();
  return changes > 0;
}

/**
 * Récupère un smurf par ID
 */
export function getSmurfById(smurfId) {
  const result = db.exec('SELECT * FROM smurfs WHERE id = ?', [smurfId]);
  if (result.length === 0 || result[0].values.length === 0) return null;

  const columns = result[0].columns;
  const row = result[0].values[0];
  const smurf = {};
  columns.forEach((col, i) => {
    smurf[col] = row[i];
  });

  // Déchiffrer les secrets
  if ('username' in smurf) smurf.username = decrypt(smurf.username);
  if ('password' in smurf) smurf.password = decrypt(smurf.password);
  if ('riot_tokens' in smurf) smurf.riot_tokens = decrypt(smurf.riot_tokens);

  if (smurf.stats) {
    smurf.stats = JSON.parse(smurf.stats);
  }
  return smurf;
}

/**
 * Met à jour les identifiants d'un smurf
 */
export function updateSmurfCredentials(smurfId, username, password) {
  db.run('UPDATE smurfs SET username = ?, password = ? WHERE id = ?', [encrypt(username), encrypt(password), smurfId]);
  const changes = db.getRowsModified();
  saveDatabase();
  return changes > 0;
}

/**
 * Met à jour les tokens Riot d'un smurf
 */
export function updateSmurfTokens(smurfId, tokens) {
  db.run('UPDATE smurfs SET riot_tokens = ? WHERE id = ?', [encrypt(JSON.stringify(tokens)), smurfId]);
  const changes = db.getRowsModified();
  saveDatabase();
  return changes > 0;
}

/**
 * Met à jour le PUUID d'un smurf (en cas de correction automatique)
 */
export function updateSmurfPuuid(smurfId, newPuuid) {
  db.run('UPDATE smurfs SET puuid = ? WHERE id = ?', [newPuuid, smurfId]);
  const changes = db.getRowsModified();
  saveDatabase();
  return changes > 0;
}

// === PREFERENCES ===

/**
 * Récupère les préférences d'un utilisateur
 */
export function getUserPreferences(userId) {
  const result = db.exec('SELECT * FROM user_preferences WHERE user_id = ?', [userId]);
  if (result.length > 0 && result[0].values.length > 0) {
    const columns = result[0].columns;
    const row = result[0].values[0];
    const prefs = {};
    columns.forEach((col, i) => {
      prefs[col] = row[i];
    });
    // Ensure defaults
    if (!prefs.stats_period) prefs.stats_period = '30';
    if (!prefs.stats_queue) prefs.stats_queue = 'soloq';
    if (prefs.tour_completed === undefined || prefs.tour_completed === null) prefs.tour_completed = 0;

    return prefs;
  }
  // Default if not found
  return { stats_period: '30', stats_queue: 'soloq', tour_completed: 0 };
}

/**
 * Met à jour les préférences d'un utilisateur
 */
export function updateUserPreferences(userId, statsPeriod, statsQueue, tourCompleted) {
  const current = getUserPreferences(userId);

  const newPeriod = statsPeriod !== undefined ? statsPeriod : current.stats_period;
  const newQueue = statsQueue !== undefined ? statsQueue : current.stats_queue;
  const newTour = tourCompleted !== undefined ? (tourCompleted ? 1 : 0) : current.tour_completed;

  db.run(`
    INSERT INTO user_preferences (user_id, stats_period, stats_queue, tour_completed)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      stats_period = excluded.stats_period,
      stats_queue = excluded.stats_queue,
      tour_completed = excluded.tour_completed
  `, [userId, newPeriod, newQueue, newTour]);
  saveDatabase();
}

/**
 * Reset all rank and stats data for all smurfs (for debugging/maintenance)
 */
// Friends - New helpers
export function addFriend(userId, puuid, pseudo) {
  db.run(`
    INSERT INTO friends (user_id, puuid, pseudo)
    VALUES (?, ?, ?)
  `, [userId, puuid, pseudo]);
  const result = db.exec('SELECT last_insert_rowid() as id');
  saveDatabase();
  return result[0].values[0][0];
}

export function getUserFriends(userId) {
  const result = db.exec('SELECT * FROM friends WHERE user_id = ? ORDER BY pseudo ASC', [userId]);
  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const friend = {};
    columns.forEach((col, i) => friend[col] = row[i]);
    if (friend.stats_json) friend.stats_json = JSON.parse(friend.stats_json);
    return friend;
  });
}

export function deleteFriend(friendId, userId) {
  db.run('DELETE FROM friends WHERE id = ? AND user_id = ?', [friendId, userId]);
  const changes = db.getRowsModified();
  saveDatabase();
  return changes > 0;
}

export function updateFriendData(friendId, stats) {
  db.run(`
    UPDATE friends 
    SET stats_json = ?, last_updated = CURRENT_TIMESTAMP 
    WHERE id = ?
  `, [JSON.stringify(stats), friendId]);
  saveDatabase();
}

export function resetAllSmurfData() {
  db.run(`
    UPDATE smurfs SET
      soloq_tier = NULL,
      soloq_rank = NULL,
      soloq_lp = 0,
      soloq_wins = 0,
      soloq_losses = 0,
      flex_tier = NULL,
      flex_rank = NULL,
      flex_lp = 0,
      flex_wins = 0,
      flex_losses = 0,
      level = 0,
      stats_30_ranked = NULL,
      stats_30_all = NULL,
      stats_season_ranked = NULL,
      stats_season_all = NULL,
      last_updated = NULL
  `);
  const changes = db.getRowsModified();
  saveDatabase();
  console.log(`[DB] Reset ${changes} smurfs data`);
  return changes;
}

/**
 * Update sort_order for multiple smurfs (drag-and-drop reorder)
 */
export function updateSmurfOrder(userId, orderList) {
  for (const { id, sort_order } of orderList) {
    db.run('UPDATE smurfs SET sort_order = ? WHERE id = ? AND user_id = ?', [sort_order, id, userId]);
  }
  saveDatabase();
}

/**
 * Close the database connection
 */
export function closeDb() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    console.log('[DB] Base de données fermée');
  }
}

export default {
  initDb,
  closeDb,
  createUser,
  authenticateUser,
  getUserInfo,
  addSmurf,
  getUserSmurfs,
  updateSmurfData,
  updateSmurfCredentials,
  updateSmurfPuuid,
  updateSmurfTokens,
  updateSmurfOrder,
  deleteSmurf,
  getSmurfById,
  getUserPreferences,
  updateUserPreferences,
  resetAllSmurfData,
  // Friends
  addFriend,
  getUserFriends,
  deleteFriend,
  updateFriendData
};
