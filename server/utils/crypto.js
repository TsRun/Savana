/**
 * Chiffrement symétrique des secrets stockés en base (mots de passe Riot,
 * identifiants, tokens de session).
 *
 * - Algorithme: AES-256-GCM (confidentialité + intégrité authentifiée).
 * - La clé (32 octets) est stockée HORS de la base, dans `.savana_key` placé
 *   dans le dossier userData (prod) ou à la racine du projet (dev). Copier
 *   uniquement `smurfs.db` ne suffit donc plus à lire les secrets.
 * - Format des valeurs chiffrées: "enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>".
 * - `decrypt()` renvoie tel quel toute valeur NON préfixée → compatibilité
 *   ascendante avec les données historiques en clair (migration progressive).
 *
 * - Dans l'app installée, la clé est scellée par le coffre Windows (Electron
 *   `safeStorage` / DPAPI) dans `.savana_key.sealed` : le process principal la
 *   descelle et la transmet au backend via SAVANA_DB_KEY, et `.savana_key` en
 *   clair n'existe plus. Le fichier en clair reste le repli (dev, ou coffre
 *   indisponible).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const PREFIX = 'enc:v1:';
let keyCache = null;

// Clé transmise par Electron (descellée via DPAPI). Retirée de l'environnement
// pour ne pas être héritée par les processus que le backend lance.
const envKey = process.env.SAVANA_DB_KEY;
delete process.env.SAVANA_DB_KEY;

function getKey() {
  if (keyCache) return keyCache;
  if (envKey && /^[0-9a-f]{64}$/i.test(envKey)) {
    keyCache = Buffer.from(envKey, 'hex');
    return keyCache;
  }
  const dir = path.dirname(config.dbPath);
  const keyPath = path.join(dir, '.savana_key');

  if (fs.existsSync(keyPath)) {
    const hex = fs.readFileSync(keyPath, 'utf8').trim();
    const buf = Buffer.from(hex, 'hex');
    if (buf.length === 32) {
      keyCache = buf;
      return buf;
    }
    throw new Error('Clé de chiffrement invalide (.savana_key corrompu)');
  }

  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
  console.warn('[CRYPTO] Clé de chiffrement générée (.savana_key).');
  keyCache = key;
  return key;
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return plaintext;
  const str = String(plaintext);
  if (str === '') return str;             // chaîne vide → inchangée
  if (str.startsWith(PREFIX)) return str; // déjà chiffré

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decrypt(value) {
  if (value === null || value === undefined) return value;
  const str = String(value);
  if (!str.startsWith(PREFIX)) return value; // legacy en clair → tel quel

  try {
    const [ivB64, tagB64, ctB64] = str.slice(PREFIX.length).split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch (e) {
    console.error('[CRYPTO] Échec déchiffrement:', e.message);
    return null;
  }
}

// === Chiffrement par mot de passe (fichiers d'export portables) ===
// Indépendant de la clé locale : un export se relit sur une autre machine avec
// le seul mot de passe choisi à l'export. scrypt + AES-256-GCM.
const SCRYPT_N = 1 << 15;
const SCRYPT_OPTS = { N: SCRYPT_N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function passwordError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function encryptWithPassword(plaintext, password) {
  if (!password) throw passwordError('Mot de passe requis', 'PASSWORD_REQUIRED');
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, 32, SCRYPT_OPTS);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return {
    kdf: 'scrypt', N: SCRYPT_N, r: 8, p: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ct.toString('base64')
  };
}

export function decryptWithPassword(blob, password) {
  if (!password) throw passwordError('Mot de passe requis', 'PASSWORD_REQUIRED');
  // Paramètres bornés : un fichier forgé ne doit pas pouvoir épuiser la mémoire
  if (!blob || blob.kdf !== 'scrypt' || blob.N !== SCRYPT_N || blob.r !== 8 || blob.p !== 1) {
    throw passwordError('Format de chiffrement non reconnu', 'BAD_FORMAT');
  }
  try {
    const key = crypto.scryptSync(String(password), Buffer.from(blob.salt, 'base64'), 32, SCRYPT_OPTS);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    throw passwordError('Mot de passe incorrect', 'BAD_PASSWORD');
  }
}

export default { encrypt, decrypt, isEncrypted, encryptWithPassword, decryptWithPassword };
