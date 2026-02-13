/**
 * Riot RSO Authentication
 * Authentification via l'API RSO de Riot Games
 * 
 * NOTE: Cette approche peut être bloquée par Cloudflare.
 * Alternative: Utiliser le Riot Client local API pour gérer les sessions.
 */

import https from 'https';
import tls from 'tls';

// Ciphers TLS 1.3 similaires à ceux du Riot Client
const CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384'
].join(':');

const USER_AGENT = 'RiotClient/91.0.2.1687.4193 rso-auth (Windows;10;;Professional, x64)';

/**
 * Crée un agent HTTPS avec les bons paramètres TLS
 */
function createHttpsAgent() {
  return new https.Agent({
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    ciphers: CIPHERS
  });
}

/**
 * Fait une requête HTTPS avec cookies
 */
function httpsRequest(options, postData = null, cookies = {}) {
  return new Promise((resolve, reject) => {
    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    
    const reqOptions = {
      ...options,
      agent: createHttpsAgent(),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        ...(cookieStr ? { 'Cookie': cookieStr } : {}),
        ...options.headers
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Récupérer les cookies
        const setCookies = res.headers['set-cookie'] || [];
        const newCookies = { ...cookies };
        for (const header of setCookies) {
          const parts = header.split(';')[0].split('=');
          if (parts.length >= 2) {
            newCookies[parts[0]] = parts.slice(1).join('=');
          }
        }
        
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            cookies: newCookies,
            data: data ? JSON.parse(data) : null
          });
        } catch {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            cookies: newCookies,
            data
          });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

/**
 * Authentification RSO complète
 * @param {string} username - Nom d'utilisateur Riot
 * @param {string} password - Mot de passe
 * @returns {Promise<object>} Tokens d'authentification
 */
export async function authenticateRSO(username, password) {
  let cookies = {};

  console.log('[RSO] Début authentification pour', username);

  // Étape 1: Initialiser la session auth
  console.log('[RSO] Étape 1: Initialisation session...');
  
  const authInitRes = await httpsRequest({
    hostname: 'auth.riotgames.com',
    path: '/api/v1/authorization',
    method: 'POST'
  }, {
    client_id: 'riot-client',
    nonce: Math.random().toString(36).substring(2),
    redirect_uri: 'http://localhost/redirect',
    response_type: 'token id_token',
    scope: 'openid link ban lol_region account'
  }, cookies);

  if (authInitRes.status !== 200) {
    console.log('[RSO] Init response:', authInitRes.data);
    throw new Error('Erreur initialisation auth: ' + authInitRes.status);
  }

  cookies = authInitRes.cookies;
  console.log('[RSO] Session initialisée');

  // Étape 2: Envoyer les credentials
  console.log('[RSO] Étape 2: Envoi credentials...');
  
  const loginRes = await httpsRequest({
    hostname: 'auth.riotgames.com',
    path: '/api/v1/authorization',
    method: 'PUT'
  }, {
    type: 'auth',
    username,
    password,
    remember: true,
    language: 'en_US'
  }, cookies);

  cookies = loginRes.cookies;
  console.log('[RSO] Login response type:', loginRes.data?.type);

  // Vérifier le résultat
  if (loginRes.data?.type === 'multifactor') {
    throw new Error('2FA requis - non supporté');
  }

  if (loginRes.data?.type === 'auth' && loginRes.data?.error) {
    throw new Error('Identifiants incorrects: ' + loginRes.data.error);
  }

  if (loginRes.data?.type !== 'response') {
    throw new Error('Réponse inattendue: ' + JSON.stringify(loginRes.data));
  }

  // Extraire les tokens de l'URL de redirection
  const redirectUri = loginRes.data.response?.parameters?.uri;
  if (!redirectUri) {
    throw new Error('URI de redirection manquante');
  }

  console.log('[RSO] Authentification réussie, extraction tokens...');

  // Parser l'URL pour extraire les tokens
  const fragment = redirectUri.split('#')[1] || redirectUri.split('?')[1];
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const idToken = params.get('id_token');

  if (!accessToken) {
    throw new Error('Access token manquant');
  }

  console.log('[RSO] Tokens récupérés avec succès');

  return {
    accessToken,
    idToken,
    ssid: cookies.ssid,
    sub: cookies.sub,
    tdid: cookies.tdid,
    cookies
  };
}

/**
 * Génère le contenu YAML pour RiotGamesPrivateSettings.yaml
 */
export function generatePrivateSettingsYaml(tokens, region = 'EUW') {
  const cookieEntries = Object.entries(tokens.cookies)
    .filter(([name]) => ['ssid', 'sub', 'tdid', 'csid', 'clid'].includes(name.toLowerCase()))
    .map(([name, value]) => `                -
                    domain: "riotgames.com"
                    hostOnly: false
                    httpOnly: true
                    name: "${name}"
                    path: "/"
                    persistent: true
                    secureOnly: true
                    value: "${value}"`)
    .join('\n');

  return `riot-login:
    persist:
        region: "${region}"
        session:
            cookies:
${cookieEntries}
`;
}

export default {
  authenticateRSO,
  generatePrivateSettingsYaml
};
