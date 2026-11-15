import initSqlJs from 'sql.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { encrypt, decrypt, isEncrypted, encryptWithPassword, decryptWithPassword } from '../utils/crypto.js';

let db = null;
let SQL = null;

/**
 * Clé aléatoire et stable qui nomme le dossier de session Riot d'un compte
 * (`sessions/<session_key>/`). Indépendante du pseudo (qui peut changer) et
 * de l'id (qui diffère entre la base de dev et celle de l'app installée).
 */
function newSessionKey() {
  return crypto.randomBytes(12).toString('hex');
}

/**
 * Sauvegarde la base de données sur le disque
 */
function saveDatabase() {
  if (!db) return;
  const buffer = Buffer.from(db.export());
  // Écriture atomique : fichier temporaire puis renommage, pour qu'un crash
  // pendant l'écriture ne laisse jamais un smurfs.db tronqué.
  const tmpPath = config.dbPath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, config.dbPath);
  } catch (err) {
    // Windows : le renommage échoue si un autre processus (antivirus) tient le fichier
    console.warn('[DB] Écriture atomique impossible, écriture directe:', err.message);
    fs.writeFileSync(config.dbPath, buffer);
    try { fs.rmSync(tmpPath, { force: true }); } catch (e) { }
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

      -- Stats par combinaison (période, queue) : { "stats_30_soloq": {...}, ... }
      stats_json TEXT DEFAULT NULL,
      sort_order INTEGER DEFAULT NULL,
      -- Nom du dossier de session Riot du compte (sessions/<session_key>/)
      session_key TEXT DEFAULT NULL,
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

  // Migration: clé de session par compte (nom du dossier de session Riot)
  try {
    const tableInfo = db.exec("PRAGMA table_info(smurfs)");
    const columns = tableInfo.length > 0 ? tableInfo[0].values.map(row => row[1]) : [];
    if (!columns.includes('session_key')) {
      db.run('ALTER TABLE smurfs ADD COLUMN session_key TEXT DEFAULT NULL');
      console.log('[DB] Migration: colonne session_key ajoutee');
    }
    const missing = db.exec('SELECT id FROM smurfs WHERE session_key IS NULL');
    if (missing.length > 0) {
      for (const [id] of missing[0].values) {
        db.run('UPDATE smurfs SET session_key = ? WHERE id = ?', [newSessionKey(), id]);
      }
    }
  } catch (err) {
    console.error('[DB] Erreur migration session_key:', err.message);
  }

  // Migration: chiffrer les secrets existants stockés en clair (username, password)
  try {
    const res = db.exec('SELECT id, username, password FROM smurfs');
    if (res.length > 0) {
      let migrated = 0;
      for (const row of res[0].values) {
        const [id, username, password] = row;
        const needs = [username, password].some(
          v => v !== null && v !== undefined && String(v) !== '' && !isEncrypted(v)
        );
        if (needs) {
          db.run(
            'UPDATE smurfs SET username = ?, password = ? WHERE id = ?',
            [encrypt(username), encrypt(password), id]
          );
          migrated++;
        }
      }
      if (migrated > 0) console.log(`[DB] Migration chiffrement: ${migrated} smurf(s) chiffré(s)`);
    }
  } catch (err) {
    console.error('[DB] Migration chiffrement échouée:', err.message);
  }

  // Migration: suppression des colonnes mortes (stats legacy remplacées par
  // stats_json, cookies Riot jamais utilisés, date de session jamais écrite)
  try {
    const tableInfo = db.exec("PRAGMA table_info(smurfs)");
    const columns = tableInfo.length > 0 ? tableInfo[0].values.map(row => row[1]) : [];
    const dead = ['stats_30_ranked', 'stats_30_all', 'stats_season_ranked', 'stats_season_all', 'riot_tokens', 'session_saved_at'];
    for (const col of dead.filter(c => columns.includes(c))) {
      db.run(`ALTER TABLE smurfs DROP COLUMN ${col}`);
      console.log(`[DB] Migration: colonne ${col} supprimee`);
    }
  } catch (err) {
    console.error('[DB] Erreur suppression colonnes mortes:', err.message);
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
 * Mode local sans login : renvoie le premier utilisateur existant,
 * ou en crée un ("local") avec un mot de passe aléatoire.
 */
let localUserId = null;
export function getOrCreateLocalUser() {
  if (localUserId) return localUserId;
  const result = db.exec('SELECT id FROM users ORDER BY id ASC LIMIT 1');
  if (result.length > 0 && result[0].values.length > 0) {
    localUserId = result[0].values[0][0];
  } else {
    localUserId = createUser('local', crypto.randomBytes(24).toString('hex'));
    console.log('[DB] Utilisateur local créé (mode sans login)');
  }
  return localUserId;
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
    INSERT INTO smurfs (user_id, puuid, pseudo, username, password, session_key)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [userId, puuid, pseudo, encrypt(username), encrypt(password), newSessionKey()]);

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
    stats_json: smurf.stats_json ? JSON.parse(smurf.stats_json) : {}
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
      stats_json = NULL,
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

// === EXPORT / IMPORT ===

// Identifiants exclus : ils partent chiffrés par mot de passe dans `secrets`
const SMURF_EXPORT_FIELDS = [
  'puuid', 'pseudo',
  'soloq_tier', 'soloq_rank', 'soloq_lp', 'soloq_wins', 'soloq_losses',
  'flex_tier', 'flex_rank', 'flex_lp', 'flex_wins', 'flex_losses',
  'level', 'stats_json', 'sort_order', 'last_updated'
];

/**
 * Exporte toutes les données d'un utilisateur dans un objet JSON portable.
 * Format v2 : les identifiants Riot sont regroupés dans `secrets`, chiffrés
 * avec le mot de passe choisi à l'export (lisible sur n'importe quelle machine).
 */
export function exportUserData(userId, password) {
  const secrets = {};
  const smurfs = getUserSmurfs(userId).map(s => {
    const out = {};
    for (const f of SMURF_EXPORT_FIELDS) out[f] = s[f] !== undefined ? s[f] : null;
    secrets[s.puuid] = { username: s.username || '', password: s.password || '' };
    return out;
  });
  const encryptedSecrets = encryptWithPassword(JSON.stringify(secrets), password);

  const friends = getUserFriends(userId).map(f => ({
    puuid: f.puuid,
    pseudo: f.pseudo,
    stats_json: f.stats_json || null,
    last_updated: f.last_updated || null
  }));

  const prefs = getUserPreferences(userId);

  return {
    app: 'savana',
    version: 2,
    exported_at: new Date().toISOString(),
    secrets: encryptedSecrets,
    smurfs,
    friends,
    preferences: {
      stats_period: prefs.stats_period,
      stats_queue: prefs.stats_queue,
      tour_completed: prefs.tour_completed
    }
  };
}

/**
 * Importe des données exportées : upsert des smurfs et amis par PUUID,
 * mise à jour des préférences. Les secrets sont re-chiffrés à l'écriture.
 * v2 : identifiants dans `secrets`, déchiffrés avec `password` (erreur
 * BAD_PASSWORD / PASSWORD_REQUIRED sinon, avant toute écriture).
 * v1 : identifiants en clair dans chaque compte (anciens exports).
 */
export function importUserData(userId, data, password) {
  let smurfCount = 0;
  let friendCount = 0;

  const secrets = data.secrets
    ? JSON.parse(decryptWithPassword(data.secrets, password))
    : null;

  const existingSmurfs = getUserSmurfs(userId);
  for (const s of (data.smurfs || [])) {
    if (!s.puuid || !s.pseudo) continue;
    const statsJson = s.stats_json ? JSON.stringify(s.stats_json) : null;
    const match = existingSmurfs.find(e => e.puuid === s.puuid);
    // Identifiants absents du fichier : on garde ceux déjà en base
    const creds = secrets ? secrets[s.puuid] : s;
    const username = creds?.username ?? match?.username ?? '';
    const pwd = creds?.password ?? match?.password ?? '';
    const values = [
      s.pseudo, encrypt(username), encrypt(pwd),
      s.soloq_tier ?? null, s.soloq_rank ?? null, s.soloq_lp ?? 0, s.soloq_wins ?? 0, s.soloq_losses ?? 0,
      s.flex_tier ?? null, s.flex_rank ?? null, s.flex_lp ?? 0, s.flex_wins ?? 0, s.flex_losses ?? 0,
      s.level ?? 0, statsJson, s.sort_order ?? null, s.last_updated ?? null
    ];

    if (match) {
      db.run(`
        UPDATE smurfs SET
          pseudo = ?, username = ?, password = ?,
          soloq_tier = ?, soloq_rank = ?, soloq_lp = ?, soloq_wins = ?, soloq_losses = ?,
          flex_tier = ?, flex_rank = ?, flex_lp = ?, flex_wins = ?, flex_losses = ?,
          level = ?, stats_json = ?, sort_order = ?, last_updated = ?
        WHERE id = ?
      `, [...values, match.id]);
    } else {
      db.run(`
        INSERT INTO smurfs (
          user_id, puuid, pseudo, username, password,
          soloq_tier, soloq_rank, soloq_lp, soloq_wins, soloq_losses,
          flex_tier, flex_rank, flex_lp, flex_wins, flex_losses,
          level, stats_json, sort_order, last_updated, session_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, s.puuid, ...values, newSessionKey()]);
    }
    smurfCount++;
  }

  const existingFriends = getUserFriends(userId);
  for (const f of (data.friends || [])) {
    if (!f.puuid || !f.pseudo) continue;
    const statsJson = f.stats_json ? JSON.stringify(f.stats_json) : null;
    const match = existingFriends.find(e => e.puuid === f.puuid);
    if (match) {
      db.run('UPDATE friends SET pseudo = ?, stats_json = ?, last_updated = ? WHERE id = ?',
        [f.pseudo, statsJson, f.last_updated ?? null, match.id]);
    } else {
      db.run('INSERT INTO friends (user_id, puuid, pseudo, stats_json, last_updated) VALUES (?, ?, ?, ?, ?)',
        [userId, f.puuid, f.pseudo, statsJson, f.last_updated ?? null]);
    }
    friendCount++;
  }

  if (data.preferences) {
    updateUserPreferences(
      userId,
      data.preferences.stats_period,
      data.preferences.stats_queue,
      data.preferences.tour_completed
    );
  }

  saveDatabase();
  return { smurfs: smurfCount, friends: friendCount };
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
  getOrCreateLocalUser,
  getUserInfo,
  addSmurf,
  getUserSmurfs,
  updateSmurfData,
  updateSmurfCredentials,
  updateSmurfPuuid,
  updateSmurfOrder,
  deleteSmurf,
  getSmurfById,
  getUserPreferences,
  updateUserPreferences,
  resetAllSmurfData,
  exportUserData,
  importUserData,
  // Friends
  addFriend,
  getUserFriends,
  deleteFriend,
  updateFriendData
};
