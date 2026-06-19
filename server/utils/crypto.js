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
 * NOTE sécurité: pour un durcissement supplémentaire (liaison au compte OS),
 * la clé pourrait être scellée via Electron `safeStorage` (DPAPI/Keychain).
 * Voir recommandations de l'audit.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const PREFIX = 'enc:v1:';
let keyCache = null;

function getKey() {
  if (keyCache) return keyCache;
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

export default { encrypt, decrypt, isEncrypted };
