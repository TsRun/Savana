const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Trouve tous les chemins possibles de Riot Client selon l'OS et les utilisateurs
 */
function getAllPossibleRiotPaths() {
  const platform = process.platform;
  const paths = [];

  if (platform === 'linux' && fs.existsSync('/mnt/c/')) {
    // WSL - Scanner tous les utilisateurs Windows
    try {
      const usersDir = '/mnt/c/Users';
      const users = fs.readdirSync(usersDir).filter(u => {
        const userPath = path.join(usersDir, u);
        try {
          return fs.statSync(userPath).isDirectory() && 
                 !['Public', 'Default', 'Default User', 'All Users', 'desktop.ini'].includes(u);
        } catch {
          return false;
        }
      });
      
      for (const user of users) {
        const basePath = `/mnt/c/Users/${user}/AppData/Local/Riot Games/Riot Client`;
        paths.push({
          config: path.join(basePath, 'Config'),
          data: path.join(basePath, 'Data'),
          localState: path.join(basePath, 'Local State')
        });
      }
    } catch (e) {
      console.error('[Tokens] Erreur scan utilisateurs:', e.message);
    }
  } else if (platform === 'win32') {
    const appData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const basePath = path.join(appData, 'Riot Games', 'Riot Client');
    paths.push({
      config: path.join(basePath, 'Config'),
      data: path.join(basePath, 'Data'),
      localState: path.join(basePath, 'Local State')
    });
  } else if (platform === 'darwin') {
    const basePath = path.join(os.homedir(), 'Library', 'Application Support', 'Riot Games', 'Riot Client');
    paths.push({
      config: path.join(basePath, 'Config'),
      data: path.join(basePath, 'Data'),
      localState: path.join(basePath, 'Local State')
    });
  }

  return paths;
}

/**
 * Extrait les tokens depuis Local Storage LevelDB
 */
function extractFromLocalStorage(leveldbPath) {
  try {
    if (!fs.existsSync(leveldbPath)) {
      return null;
    }

    console.log('[Tokens] Scan Local Storage:', leveldbPath);
    
    const files = fs.readdirSync(leveldbPath).filter(f => 
      f.endsWith('.ldb') || f.endsWith('.log')
    );

    for (const file of files) {
      const filePath = path.join(leveldbPath, file);
      const buffer = fs.readFileSync(filePath);
      const content = buffer.toString('utf8', 0, buffer.length);
      
      const tokens = {};
      
      // Patterns pour les tokens Riot
      const patterns = {
        accessToken: /eyJhbGciOi[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
        idToken: /id_token["\s:]+([A-Za-z0-9_\-\.]+)/gi,
        sub: /"sub"["\s:]+["']([a-f0-9\-]+)["']/gi,
        ssid: /"ssid"["\s:]+["']([a-zA-Z0-9_\-\.]+)["']/gi,
        entitlementsToken: /entitlements_token["\s:]+["']([a-zA-Z0-9_\-\.]+)["']/gi
      };

      // Extraire access tokens JWT
      const accessTokenMatches = [...content.matchAll(patterns.accessToken)];
      if (accessTokenMatches.length > 0) {
        tokens.accessToken = accessTokenMatches[accessTokenMatches.length - 1][0];
        console.log('[Tokens] Access Token (JWT):', tokens.accessToken.substring(0, 50) + '...');
      }

      // Extraire les autres tokens
      for (const [key, pattern] of Object.entries(patterns)) {
        if (key === 'accessToken') continue;
        
        const matches = [...content.matchAll(pattern)];
        if (matches.length > 0) {
          tokens[key] = matches[matches.length - 1][1];
          console.log(`[Tokens] ${key}:`, tokens[key].substring(0, 30) + '...');
        }
      }

      if (Object.keys(tokens).length > 0) {
        return tokens;
      }
    }

    return null;
  } catch (e) {
    console.error('[Tokens] Erreur lecture Local Storage:', e.message);
    return null;
  }
}

/**
 * Extrait depuis le lockfile (credentials actifs du client)
 */
function extractFromLockfile(configPath) {
  try {
    const lockfilePath = path.join(configPath, 'lockfile');
    
    if (!fs.existsSync(lockfilePath)) {
      return null;
    }

    console.log('[Tokens] Lecture lockfile...');
    const content = fs.readFileSync(lockfilePath, 'utf8');
    
    // Format: LeagueClient:PORT:PASSWORD:https
    const match = content.match(/LeagueClient:(\d+):([^:\s]+):(https?)/);
    
    if (match) {
      return {
        port: match[1],
        password: match[2],
        protocol: match[3]
      };
    }

    return null;
  } catch (e) {
    console.error('[Tokens] Erreur lecture lockfile:', e.message);
    return null;
  }
}

/**
 * Extrait les tokens persistants depuis le YAML
 */
function extractFromYAML(configPath) {
  try {
    const yamlPath = path.join(configPath, 'RiotGamesPrivateSettings.yaml');
    
    if (!fs.existsSync(yamlPath)) {
      return null;
    }

    console.log('[Tokens] Lecture YAML:', yamlPath);
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    
    const tokens = {};
    const yamlPatterns = {
      persistLoginToken: /persist[-_]login[-_]token:\s*["']?([^"'\n\r]+)["']?/i,
      rsoToken: /rso[-_]token:\s*["']?([^"'\n\r]+)["']?/i,
      authToken: /auth[-_]token:\s*["']?([^"'\n\r]+)["']?/i
    };

    for (const [key, pattern] of Object.entries(yamlPatterns)) {
      const match = yamlContent.match(pattern);
      if (match && match[1]) {
        tokens[key] = match[1].trim();
        console.log(`[Tokens] YAML - ${key}:`, tokens[key].substring(0, 30) + '...');
      }
    }

    return Object.keys(tokens).length > 0 ? tokens : null;
  } catch (e) {
    console.error('[Tokens] Erreur lecture YAML:', e.message);
    return null;
  }
}

/**
 * Fonction principale d'extraction des tokens
 */
async function extractRiotTokens() {
  try {
    const possiblePaths = getAllPossibleRiotPaths();
    
    console.log(`[Tokens] Recherche dans ${possiblePaths.length} emplacements...`);
    
    for (const riotPath of possiblePaths) {
      console.log('[Tokens] Test:', riotPath.config);
      
      let allTokens = {};
      
      // 1. Local Storage (meilleure source pour access tokens)
      const localStoragePath = path.join(path.dirname(riotPath.config), 'Data', 'Local Storage', 'leveldb');
      const lsTokens = extractFromLocalStorage(localStoragePath);
      if (lsTokens) {
        allTokens = { ...allTokens, ...lsTokens };
      }

      // 2. Lockfile (credentials API locale)
      const lockfileData = extractFromLockfile(riotPath.config);
      if (lockfileData) {
        allTokens.lockfile = lockfileData;
        console.log('[Tokens] Lockfile - Port:', lockfileData.port);
      }

      // 3. YAML (tokens persistants)
      const yamlTokens = extractFromYAML(riotPath.config);
      if (yamlTokens) {
        allTokens = { ...allTokens, ...yamlTokens };
      }

      // Si on a trouvé des tokens, retourner
      if (Object.keys(allTokens).length > 0) {
        console.log('[Tokens] Total extraits:', Object.keys(allTokens).length);
        console.log('[Tokens] Types:', Object.keys(allTokens).join(', '));
        return allTokens;
      }
    }

    throw new Error('Aucun token trouvé. Connectez-vous à Riot Client et lancez League of Legends au moins une fois.');
  } catch (error) {
    console.error('[Tokens] Erreur:', error.message);
    throw error;
  }
}

module.exports = {
  getAllPossibleRiotPaths,
  extractRiotTokens
};
