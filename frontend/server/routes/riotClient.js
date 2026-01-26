import express from 'express';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { exec } from 'child_process';

const router = express.Router();

/**
 * Trouve le chemin du Riot Client selon l'OS
 */
function getRiotClientPath() {
  const platform = process.platform;
  
  // WSL - Scanner les utilisateurs Windows
  if (platform === 'linux' && fs.existsSync('/mnt/c/')) {
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
        const riotPath = `/mnt/c/Users/${user}/AppData/Local/Riot Games/Riot Client`;
        // Vérifier si le dossier Data existe (pas seulement lockfile)
        if (fs.existsSync(path.join(riotPath, 'Data'))) {
          return riotPath;
        }
      }
    } catch (e) {
      console.error('[RiotClient] Erreur scan WSL:', e.message);
    }
  } else if (platform === 'win32') {
    const appData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
    return path.join(appData, 'Riot Games', 'Riot Client');
  } else if (platform === 'darwin') {
    return path.join(process.env.HOME, 'Library', 'Application Support', 'Riot Games', 'Riot Client');
  }
  
  return null;
}

/**
 * Lit le lockfile pour obtenir les credentials de l'API locale
 */
function readLockfile(riotPath) {
  const lockfilePath = path.join(riotPath, 'Config', 'lockfile');
  
  if (!fs.existsSync(lockfilePath)) {
    return null;
  }
  
  const content = fs.readFileSync(lockfilePath, 'utf8');
  // Format: Riot Client:PID:PORT:PASSWORD:PROTOCOL
  const parts = content.split(':');
  
  if (parts.length >= 4) {
    return {
      port: parts[2],
      password: parts[3],
      protocol: parts[4] || 'https'
    };
  }
  
  return null;
}

/**
 * Lit les tokens depuis RiotGamesPrivateSettings.yaml
 */
function readPrivateSettings(riotPath) {
  const yamlPath = path.join(riotPath, 'Data', 'RiotGamesPrivateSettings.yaml');
  
  if (!fs.existsSync(yamlPath)) {
    return null;
  }
  
  const content = fs.readFileSync(yamlPath, 'utf8');
  
  // Extraire le SUB (account ID)
  const subMatch = content.match(/name:\s*"sub"[\s\S]*?value:\s*"([^"]+)"/);
  const sub = subMatch ? subMatch[1] : null;
  
  // Extraire le SSID (session token)
  const ssidMatch = content.match(/name:\s*"ssid"[\s\S]*?value:\s*"([^"]+)"/);
  const ssid = ssidMatch ? ssidMatch[1] : null;
  
  // Extraire la région
  const regionMatch = content.match(/region:\s*"([^"]+)"/);
  const region = regionMatch ? regionMatch[1] : 'EUW';
  
  return { sub, ssid, region };
}

/**
 * Extrait le gameName et tagLine depuis les logs récents du Riot Client
 */
function extractFromRecentLogs(riotPath) {
  try {
    const logsDir = path.join(riotPath, 'Logs', 'Riot Client Logs');
    
    if (!fs.existsSync(logsDir)) {
      return null;
    }
    
    // Trouver tous les fichiers log et les trier par date
    const logFiles = fs.readdirSync(logsDir)
      .filter(f => f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: path.join(logsDir, f),
        mtime: fs.statSync(path.join(logsDir, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);
    
    if (logFiles.length === 0) {
      return null;
    }
    
    // Scanner les 5 logs les plus récents
    for (let i = 0; i < Math.min(5, logFiles.length); i++) {
      const logFile = logFiles[i];
      console.log('[RiotClient] Scan log:', logFile.name);
      
      try {
        const stats = fs.statSync(logFile.path);
        // Lire les derniers 3MB du fichier
        const readSize = Math.min(stats.size, 3 * 1024 * 1024);
        const fd = fs.openSync(logFile.path, 'r');
        const buffer = Buffer.alloc(readSize);
        fs.readSync(fd, buffer, 0, readSize, Math.max(0, stats.size - readSize));
        fs.closeSync(fd);
        
        const content = buffer.toString('utf8');
        
        // Pattern 1: JSON échappé dans les logs (le plus courant)
        // "gameName":"xxx","tagLine":"yyy" ou \"gameName\":\"xxx\",\"tagLine\":\"yyy\"
        const escapedPattern = /\\?"gameName\\?":\\?"([^"\\]+)\\?"[,\s]*\\?"tagLine\\?":\\?"([^"\\]+)\\?"/g;
        let matches = [...content.matchAll(escapedPattern)];
        
        if (matches.length > 0) {
          const lastMatch = matches[matches.length - 1];
          return {
            gameName: lastMatch[1],
            tagLine: lastMatch[2]
          };
        }
        
        // Pattern 2: game_name avec underscore
        const underscorePattern = /\\?"game_name\\?":\\?"([^"\\]+)\\?"[,\s]*\\?"game_tag\\?":\\?"([^"\\]+)\\?"/g;
        matches = [...content.matchAll(underscorePattern)];
        
        if (matches.length > 0) {
          const lastMatch = matches[matches.length - 1];
          return {
            gameName: lastMatch[1],
            tagLine: lastMatch[2]
          };
        }
      } catch (e) {
        console.log('[RiotClient] Erreur lecture log', logFile.name, ':', e.message);
      }
    }
    
    return null;
  } catch (e) {
    console.error('[RiotClient] Erreur lecture logs:', e.message);
    return null;
  }
}

/**
 * Appelle l'API locale du Riot Client
 */
function callRiotClientApi(lockfile, endpoint) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`riot:${lockfile.password}`).toString('base64');
    
    const options = {
      hostname: '127.0.0.1',
      port: lockfile.port,
      path: endpoint,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      rejectUnauthorized: false // Le certificat est self-signed
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

/**
 * GET /api/riot-client/status
 * Vérifie si le Riot Client est accessible
 */
router.get('/status', async (req, res) => {
  try {
    const riotPath = getRiotClientPath();
    
    if (!riotPath) {
      return res.json({ 
        available: false, 
        reason: 'Riot Client non trouvé' 
      });
    }
    
    const lockfile = readLockfile(riotPath);
    
    if (!lockfile) {
      return res.json({ 
        available: false, 
        reason: 'Riot Client non lancé (lockfile absent)' 
      });
    }
    
    // Tester la connexion
    try {
      await callRiotClientApi(lockfile, '/rnet-lifecycle/v1/product-context');
      return res.json({ available: true });
    } catch {
      return res.json({ 
        available: false, 
        reason: 'Impossible de se connecter à l\'API du Riot Client' 
      });
    }
  } catch (error) {
    res.json({ available: false, reason: error.message });
  }
});

/**
 * GET /api/riot-client/current-account
 * Récupère les infos du compte actuellement connecté
 */
router.get('/current-account', async (req, res) => {
  try {
    const riotPath = getRiotClientPath();
    
    if (!riotPath) {
      return res.status(404).json({ error: 'Riot Client non trouvé' });
    }
    
    const lockfile = readLockfile(riotPath);
    
    if (!lockfile) {
      return res.status(404).json({ 
        error: 'Riot Client non lancé. Ouvrez le Riot Client et connectez-vous.' 
      });
    }
    
    // Lire les settings privés pour obtenir le SUB
    const privateSettings = readPrivateSettings(riotPath);
    
    if (!privateSettings || !privateSettings.sub) {
      return res.status(404).json({ 
        error: 'Aucun compte connecté trouvé. Connectez-vous dans le Riot Client.' 
      });
    }
    
    // Récupérer les infos via l'API locale
    let accountInfo = null;
    
    try {
      // Essayer d'obtenir les infos du compte
      const chatSession = await callRiotClientApi(lockfile, '/chat/v1/session');
      
      if (chatSession && chatSession.game_name) {
        accountInfo = {
          gameName: chatSession.game_name,
          tagLine: chatSession.game_tag,
          puuid: chatSession.puuid,
          region: privateSettings.region
        };
      }
    } catch (e) {
      console.log('[RiotClient] Chat API non disponible:', e.message);
    }
    
    // Si pas d'infos via chat, essayer alias
    if (!accountInfo) {
      try {
        const aliases = await callRiotClientApi(lockfile, '/player-account/aliases/v1/current-player');
        
        if (aliases && Array.isArray(aliases) && aliases.length > 0) {
          const lolAlias = aliases.find(a => a.product === 'lol') || aliases[0];
          accountInfo = {
            gameName: lolAlias.game_name,
            tagLine: lolAlias.tag_line,
            puuid: privateSettings.sub,
            region: privateSettings.region
          };
        }
      } catch (e) {
        console.log('[RiotClient] Aliases API non disponible:', e.message);
      }
    }
    
    // Si toujours pas d'infos, essayer de scanner les logs
    if (!accountInfo || !accountInfo.gameName) {
      console.log('[RiotClient] Tentative extraction depuis les logs...');
      const logData = extractFromRecentLogs(riotPath);
      
      if (logData && logData.gameName) {
        accountInfo = {
          gameName: logData.gameName,
          tagLine: logData.tagLine,
          puuid: null, // Sera récupéré via l'API Riot avec le Riot ID
          region: privateSettings?.region || 'EUW',
          note: 'PUUID sera récupéré automatiquement via l\'API Riot'
        };
        console.log('[RiotClient] Extrait des logs:', logData.gameName + '#' + logData.tagLine);
      }
    }
    
    // Fallback: utiliser juste le SUB
    if (!accountInfo) {
      accountInfo = {
        gameName: null,
        tagLine: null,
        puuid: privateSettings?.sub || null,
        region: privateSettings?.region || 'EUW',
        note: 'Riot ID non récupéré, vous devrez le saisir manuellement'
      };
    }
    
    console.log('[RiotClient] Compte trouvé:', accountInfo.gameName || accountInfo.puuid);
    
    res.json(accountInfo);
    
  } catch (error) {
    console.error('[RiotClient] Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/riot-client/all-tokens
 * Récupère tous les tokens disponibles (pour debug)
 */
router.get('/all-tokens', async (req, res) => {
  try {
    const riotPath = getRiotClientPath();
    
    if (!riotPath) {
      return res.status(404).json({ error: 'Riot Client non trouvé' });
    }
    
    const lockfile = readLockfile(riotPath);
    const privateSettings = readPrivateSettings(riotPath);
    
    res.json({
      lockfile: lockfile ? { port: lockfile.port, hasPassword: !!lockfile.password } : null,
      privateSettings: privateSettings ? {
        hasSub: !!privateSettings.sub,
        hasSsid: !!privateSettings.ssid,
        region: privateSettings.region
      } : null
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/riot-client/save-tokens
 * Récupère les tokens actuels du Riot Client pour les sauvegarder
 */
router.get('/save-tokens', async (req, res) => {
  try {
    const riotPath = getRiotClientPath();
    
    if (!riotPath) {
      return res.status(404).json({ error: 'Riot Client non trouvé' });
    }
    
    // Lire le fichier YAML complet
    const yamlPath = path.join(riotPath, 'Data', 'RiotGamesPrivateSettings.yaml');
    
    if (!fs.existsSync(yamlPath)) {
      return res.status(404).json({ error: 'Fichier de tokens non trouvé. Connectez-vous au Riot Client.' });
    }
    
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    
    // Extraire les infos importantes
    const subMatch = yamlContent.match(/name:\s*"sub"[\s\S]*?value:\s*"([^"]+)"/);
    const sub = subMatch ? subMatch[1] : null;
    
    const regionMatch = yamlContent.match(/region:\s*"([^"]+)"/);
    const region = regionMatch ? regionMatch[1] : 'EUW';
    
    if (!sub) {
      return res.status(404).json({ error: 'Aucun compte connecté trouvé' });
    }
    
    // Retourner le contenu YAML complet + les métadonnées
    res.json({
      sub,
      region,
      yamlContent,
      savedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[RiotClient] Erreur save-tokens:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/riot-client/restore-tokens
 * Restaure les tokens sauvegardés dans le fichier du Riot Client
 */
router.post('/restore-tokens', async (req, res) => {
  try {
    const { yamlContent } = req.body;
    
    if (!yamlContent) {
      return res.status(400).json({ error: 'Contenu YAML requis' });
    }
    
    const riotPath = getRiotClientPath();
    
    if (!riotPath) {
      return res.status(404).json({ error: 'Riot Client non trouvé' });
    }
    
    const yamlPath = path.join(riotPath, 'Data', 'RiotGamesPrivateSettings.yaml');
    
    // Vérifier que le Riot Client n'est pas en cours d'exécution
    const lockfile = readLockfile(riotPath);
    if (lockfile) {
      return res.status(400).json({ 
        error: 'Fermez le Riot Client avant de restaurer les tokens' 
      });
    }
    
    // Sauvegarder l'ancien fichier
    if (fs.existsSync(yamlPath)) {
      const backupPath = yamlPath + '.backup';
      fs.copyFileSync(yamlPath, backupPath);
    }
    
    // Écrire le nouveau contenu
    fs.writeFileSync(yamlPath, yamlContent, 'utf8');
    
    console.log('[RiotClient] Tokens restaurés avec succès');
    
    res.json({ 
      success: true, 
      message: 'Tokens restaurés. Lancez le Riot Client pour vous connecter automatiquement.' 
    });
    
  } catch (error) {
    console.error('[RiotClient] Erreur restore-tokens:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Ferme le Riot Client (Windows via WSL ou natif)
 */
function killRiotClient() {
  return new Promise((resolve) => {
    const platform = process.platform;
    
    if (platform === 'linux' && fs.existsSync('/mnt/c/')) {
      // WSL - utiliser taskkill.exe Windows
      exec('taskkill.exe /F /IM "RiotClientServices.exe" 2>/dev/null; taskkill.exe /F /IM "RiotClientUx.exe" 2>/dev/null; taskkill.exe /F /IM "RiotClientCrashHandler.exe" 2>/dev/null', (err) => {
        // Ignorer les erreurs (le process n'existe peut-être pas)
        setTimeout(resolve, 1500); // Attendre que le processus se termine
      });
    } else if (platform === 'win32') {
      exec('taskkill /F /IM "RiotClientServices.exe" & taskkill /F /IM "RiotClientUx.exe" & taskkill /F /IM "RiotClientCrashHandler.exe"', () => {
        setTimeout(resolve, 1500);
      });
    } else if (platform === 'darwin') {
      exec('pkill -9 "RiotClient" 2>/dev/null', () => {
        setTimeout(resolve, 1500);
      });
    } else {
      resolve();
    }
  });
}

/**
 * Lance League of Legends directement
 */
function startLeagueOfLegends() {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    
    if (platform === 'linux' && fs.existsSync('/mnt/c/')) {
      // WSL - Utiliser le protocole riot-client:// via cmd.exe
      // C'est le moyen le plus fiable de lancer LoL
      console.log('[RiotClient] Lancement de LoL via protocole riot-client://');
      exec('cmd.exe /c start "" "riot-client://launch-product/league_of_legends/live"', (err) => {
        if (err) {
          console.error('[RiotClient] Erreur protocole, essai direct...', err.message);
          // Fallback: chercher LeagueClient.exe
          const possiblePaths = [
            '/mnt/c/Riot Games/League of Legends/LeagueClient.exe',
            '/mnt/c/Program Files/Riot Games/League of Legends/LeagueClient.exe',
            '/mnt/c/Program Files (x86)/Riot Games/League of Legends/LeagueClient.exe'
          ];
          
          let clientPath = null;
          for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
              clientPath = p;
              break;
            }
          }
          
          if (clientPath) {
            const winPath = clientPath.replace('/mnt/c/', 'C:\\').replace(/\//g, '\\');
            exec(`cmd.exe /c start "" "${winPath}"`, () => resolve());
          } else {
            resolve(); // On ne fait pas échouer même si ça ne marche pas
          }
        } else {
          resolve();
        }
      });
    } else if (platform === 'win32') {
      // Windows natif - Utiliser le protocole
      exec('start "" "riot-client://launch-product/league_of_legends/live"', (err) => {
        if (err) {
          console.error('[RiotClient] Erreur lancement:', err.message);
        }
        resolve();
      });
    } else if (platform === 'darwin') {
      exec('open "riot-client://launch-product/league_of_legends/live"', (err) => {
        if (err) console.error('[RiotClient] Erreur lancement:', err.message);
        resolve();
      });
    } else {
      reject(new Error('Plateforme non supportée'));
    }
  });
}

/**
 * POST /api/riot-client/switch-account
 * Ferme le Riot Client, restaure les tokens, et relance le client
 */
router.post('/switch-account', async (req, res) => {
  try {
    const { yamlContent } = req.body;
    
    if (!yamlContent) {
      return res.status(400).json({ error: 'Contenu YAML requis' });
    }
    
    const riotPath = getRiotClientPath();
    
    if (!riotPath) {
      return res.status(404).json({ error: 'Riot Client non trouvé' });
    }
    
    const yamlPath = path.join(riotPath, 'Data', 'RiotGamesPrivateSettings.yaml');
    
    console.log('[RiotClient] Début switch-account...');
    
    // 1. Fermer le Riot Client
    console.log('[RiotClient] Fermeture du Riot Client...');
    await killRiotClient();
    
    // 2. Attendre un peu que les fichiers soient libérés
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 3. Sauvegarder l'ancien fichier
    if (fs.existsSync(yamlPath)) {
      const backupPath = yamlPath + '.backup';
      fs.copyFileSync(yamlPath, backupPath);
    }
    
    // 4. Écrire les nouveaux tokens
    console.log('[RiotClient] Écriture des nouveaux tokens...');
    fs.writeFileSync(yamlPath, yamlContent, 'utf8');
    
    // 5. Attendre un peu
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 6. Lancer League of Legends
    console.log('[RiotClient] Lancement de League of Legends...');
    try {
      await startLeagueOfLegends();
    } catch (launchError) {
      console.error('[RiotClient] Erreur lancement:', launchError.message);
      // On ne fait pas échouer la requête, les tokens sont restaurés
    }
    
    console.log('[RiotClient] Switch terminé avec succès');
    
    res.json({ 
      success: true, 
      message: 'Compte changé ! League of Legends se lance...' 
    });
    
  } catch (error) {
    console.error('[RiotClient] Erreur switch-account:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/riot-client/login-account
 * Se connecte à un compte en utilisant username/password via RSO
 * Puis lance League of Legends
 */
router.post('/login-account', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username et password requis' });
    }
    
    const riotPath = getRiotClientPath();
    
    if (!riotPath) {
      return res.status(404).json({ error: 'Riot Client non trouvé' });
    }
    
    console.log('[RiotClient] Login-account pour:', username);
    
    // 1. Fermer le Riot Client
    console.log('[RiotClient] Fermeture du Riot Client...');
    await killRiotClient();
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 2. Authentification RSO
    console.log('[RiotClient] Authentification RSO...');
    const { authenticateRSO } = await import('../utils/riotAuth.js');
    
    let tokens;
    try {
      tokens = await authenticateRSO(username, password);
    } catch (authError) {
      console.error('[RiotClient] Erreur RSO:', authError.message);
      return res.status(401).json({ error: 'Échec authentification: ' + authError.message });
    }
    
    // 3. Générer et écrire le fichier YAML
    console.log('[RiotClient] Écriture des tokens...');
    const yamlPath = path.join(riotPath, 'Data', 'RiotGamesPrivateSettings.yaml');
    
    // Sauvegarder l'ancien fichier
    if (fs.existsSync(yamlPath)) {
      fs.copyFileSync(yamlPath, yamlPath + '.backup');
    }
    
    // Générer le YAML avec les nouveaux tokens
    const { generatePrivateSettingsYaml } = await import('../utils/riotAuth.js');
    const yamlContent = generatePrivateSettingsYaml(tokens, 'EUW');
    fs.writeFileSync(yamlPath, yamlContent, 'utf8');
    
    // 4. Attendre un peu
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 5. Lancer League of Legends
    console.log('[RiotClient] Lancement de LoL...');
    try {
      await startLeagueOfLegends();
    } catch (launchError) {
      console.error('[RiotClient] Erreur lancement:', launchError.message);
    }
    
    console.log('[RiotClient] Login terminé avec succès');
    
    res.json({ 
      success: true, 
      message: 'Connexion réussie ! League of Legends se lance...' 
    });
    
  } catch (error) {
    console.error('[RiotClient] Erreur login-account:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
