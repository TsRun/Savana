import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
// Import circulaire assumé : crypto.js lit `config.dbPath` et config.js utilise
// encrypt/decrypt, mais chacun seulement à l'exécution, jamais au chargement.
import { encrypt, decrypt, isEncrypted } from './utils/crypto.js';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// Charger .env depuis la racine du projet
const isProd = process.env.ELECTRON_MODE === 'true';
const envPath = isProd
  ? path.join(_dirname, '../.env') // resources/.env (backend is in resources/backend)
  : path.join(_dirname, '../.env'); // project root/.env

console.log('[CONFIG] Loading .env from:', envPath);
console.log('[CONFIG] Current working directory:', process.cwd());
import fs from 'fs';
if (fs.existsSync(envPath)) {
  console.log('[CONFIG] .env file FOUND');
} else {
  console.log('[CONFIG] .env file NOT FOUND');
}

dotenv.config({ path: envPath });

/**
 * Résout le secret de session.
 * - Si SECRET_KEY est défini (et n'est pas la valeur placeholder) → on l'utilise.
 * - Sinon, on NE retombe PAS sur un secret en dur partagé (forge de session possible).
 *   On génère un secret aléatoire persisté localement (par machine), avec repli éphémère.
 */
function resolveSessionSecret() {
  const fromEnv = process.env.SECRET_KEY;
  const placeholder = 'change-this-to-a-random-string';
  if (fromEnv && fromEnv !== placeholder && fromEnv !== 'dev-secret-key-change-in-production') {
    return fromEnv;
  }

  const dir = process.env.USER_DATA_PATH || path.join(_dirname, '..');
  const secretPath = path.join(dir, '.session_secret');
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, 'utf8').trim();
      if (existing) return existing;
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretPath, generated, { mode: 0o600 });
    console.warn('[CONFIG] SECRET_KEY absent — secret de session aléatoire généré et persisté localement (.session_secret).');
    return generated;
  } catch (e) {
    console.warn('[CONFIG] Persistance du secret impossible, secret éphémère généré (sessions invalidées au redémarrage):', e.message);
    return crypto.randomBytes(48).toString('hex');
  }
}

/**
 * Clé API Riot, plus jamais embarquée dans l'installeur.
 * Priorité : variable d'environnement (dev/.env) > fichier local userData
 * (saisie via l'UI au premier lancement). Le fichier est chiffré avec la clé
 * de la base (elle-même scellée par DPAPI dans l'app installée).
 */
const riotKeyPath = path.join(
  process.env.USER_DATA_PATH || path.join(_dirname, '..'),
  '.riot_api_key'
);

let riotKeyCache = undefined; // undefined = pas encore lu

// Une clé collée avec ses guillemets ("RGAPI-…") est rejetée en 401 par Riot
export function normalizeRiotKey(key) {
  return String(key || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
}

export function getRiotApiKey() {
  if (process.env.RIOT_API_KEY) return normalizeRiotKey(process.env.RIOT_API_KEY);
  if (riotKeyCache !== undefined) return riotKeyCache;
  try {
    if (!fs.existsSync(riotKeyPath)) {
      riotKeyCache = null;
    } else {
      const raw = fs.readFileSync(riotKeyPath, 'utf8').trim();
      riotKeyCache = normalizeRiotKey(isEncrypted(raw) ? decrypt(raw) : raw) || null;
      // Migration : une clé encore en clair (versions précédentes) est rechiffrée
      if (riotKeyCache && !isEncrypted(raw)) {
        fs.writeFileSync(riotKeyPath, encrypt(riotKeyCache), { mode: 0o600 });
        console.log('[CONFIG] Clé API Riot chiffrée sur disque');
      }
    }
  } catch (e) {
    console.error('[CONFIG] Lecture de la clé API Riot impossible:', e.message);
    riotKeyCache = null;
  }
  return riotKeyCache;
}

export function setRiotApiKey(key) {
  const trimmed = normalizeRiotKey(key);
  if (!trimmed) throw new Error('Clé vide');
  fs.writeFileSync(riotKeyPath, encrypt(trimmed), { mode: 0o600 });
  riotKeyCache = trimmed;
  return true;
}

export const config = {
  port: process.env.PORT || 3000,
  get riotApiKey() { return getRiotApiKey(); },
  regionHost: 'euw1.api.riotgames.com',
  routingValue: 'europe',
  sessionSecret: resolveSessionSecret(),
  dbPath: process.env.USER_DATA_PATH
    ? path.join(process.env.USER_DATA_PATH, 'smurfs.db')
    : path.join(_dirname, '../smurfs.db'),
  matchHistoryCount: 100
};
