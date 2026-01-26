const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Helper pour obtenir le home directory
 */
const getHomeDir = () => {
  return process.env.HOME || process.env.USERPROFILE || os.homedir();
};

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
 * Tue le processus Riot Client
 */
async function killRiotClient() {
  const startTime = Date.now();
  const DURATION = 5000; // 5 secondes de suppression aggressive

  console.log('[Tokens] Début kill loop (5s)...');

  while (Date.now() - startTime < DURATION) {
    try {
      const platform = process.platform;
      let command = '';

      if (platform === 'win32') {
        command = 'taskkill /F /IM RiotClientServices.exe /IM LeagueClient.exe /IM "League of Legends.exe" /IM LeagueClientUx.exe /IM LeagueCrashHandler.exe /IM LeagueClientUxRender.exe /IM RiotClientUx.exe /IM RiotClientUxRender.exe /IM RiotClientCrashHandler.exe /T';
      } else if (platform === 'darwin') {
        command = 'pkill -f "Riot Client" && pkill -f "League of Legends"';
      } else if (platform === 'linux') {
        // Check if WSL
        if (fs.existsSync('/mnt/c/')) {
          // WSL: Use Windows taskkill
          // Ajout de RiotClientUx.exe, RiotClientUxRender.exe, RiotClientCrashHandler.exe
          command = 'taskkill.exe /F /IM RiotClientServices.exe /IM LeagueClient.exe /IM "League of Legends.exe" /IM LeagueClientUx.exe /IM LeagueCrashHandler.exe /IM LeagueClientUxRender.exe /IM RiotClientUx.exe /IM RiotClientUxRender.exe /IM RiotClientCrashHandler.exe /T';
        } else {
          // Native Linux (Wine/Lutris)
          command = 'pkill -f RiotClientServices.exe; pkill -f LeagueClient.exe; pkill -f "League of Legends.exe"; pkill -f LeagueClientUx.exe; pkill -f LeagueCrashHandler.exe; pkill -f LeagueClientUxRender.exe; pkill -f RiotClientUx.exe; pkill -f RiotClientUxRender.exe; pkill -f RiotClientCrashHandler.exe';
        }
      }

      if (command) {
        await execPromise(command).catch((e) => {
          // Suppress "not found" errors which are expected
          const msg = e.message || '';
          if (!msg.includes('not found') && !msg.includes('introuvable') && !msg.includes('failed')) {
            // On ignore souvent 'failed' car taskkill renvoie 128 si un process n'existe pas
            console.log('[Tokens] Kill info:', msg);
          }
        });
      }
    } catch (e) {
      // Ignorer
    }

    // Pause de 500ms entre chaque kill pour laisser le temps au système
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('[Tokens] Fin kill loop.');
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
    // 1. D'abord fermer le client
    await killRiotClient();

    // Attendre un peu que le fichier soit libéré
    await new Promise(resolve => setTimeout(resolve, 500));

    const possiblePaths = getAllPossibleRiotPaths();

    console.log(`[Tokens] Recherche dans ${possiblePaths.length} emplacements...`);

    for (const riotPath of possiblePaths) {
      console.log('[Tokens] Test:', riotPath.config);

      const yamlPath = path.join(riotPath.config, 'RiotGamesPrivateSettings.yaml');
      const backupPath = yamlPath + '.backup'; // Supposition du nom de backup standard ou mentionné par l'utilisateur
      // Parfois c'est RiotGamesPrivateSettings.yaml.1 ou autre, mais on va cibler .backup comme demandé

      if (fs.existsSync(yamlPath)) {
        try {
          // 2. Extraire (Lire) le fichier
          console.log('[Tokens] Lecture YAML pour extraction:', yamlPath);
          const content = fs.readFileSync(yamlPath, 'utf8');

          // Sauvegarder ce qu'on a lu pour l'analyser
          const yamlTokens = extractFromYAMLContent(content);

          // 3. Supprimer le fichier et le backup
          console.log('[Tokens] Suppression des fichiers config...');
          try {
            fs.unlinkSync(yamlPath);
            if (fs.existsSync(backupPath)) {
              fs.unlinkSync(backupPath);
            }
            // Essayer aussi de supprimer d'autres backups potentiels si nécessaire, 
            // mais l'utilisateur a dit "le .backup"
          } catch (delErr) {
            console.error('[Tokens] Erreur suppression:', delErr.message);
          }

          // 4. Recopier dans le dossier
          console.log('[Tokens] Restauration du fichier...');
          fs.writeFileSync(yamlPath, content);

          // On retourne les tokens trouvés
          if (yamlTokens) {
            console.log('[Tokens] Total extraits:', Object.keys(yamlTokens).length);
            return yamlTokens;
          }

        } catch (e) {
          console.error('[Tokens] Erreur manipulation fichier:', e.message);
          // Continuer aux autres chemins si échec
        }
      }
    }

    throw new Error('Aucun token trouvé ou erreur manipulation fichiers.');
  } catch (error) {
    console.error('[Tokens] Erreur:', error.message);
    throw error;
  }
}

function extractFromYAMLContent(yamlContent) {
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
    }
  }
  return Object.keys(tokens).length > 0 ? tokens : null;
}

/**
 * Trouve l'exécutable Riot Client
 */
function getRiotClientExecutable() {
  const platform = process.platform;
  let clientPath = null;

  if (platform === 'linux') {
    const possiblePaths = [
      '/mnt/c/Riot Games/Riot Client/RiotClientServices.exe',
      path.join(getHomeDir(), '.wine/drive_c/Riot Games/Riot Client/RiotClientServices.exe'),
      '/opt/Riot Games/Riot Client/RiotClientServices.exe'
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        clientPath = p;
        break;
      }
    }
  } else if (platform === 'win32') {
    const standardPath = 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe';
    if (fs.existsSync(standardPath)) clientPath = standardPath;
  } else if (platform === 'darwin') {
    const standardPath = '/Applications/Riot Games/Riot Client.app';
    if (fs.existsSync(standardPath)) clientPath = standardPath;
  }

  return clientPath;
}

/**
 * Lance League of Legends avec arguments
 */
async function launchLeague() {
  const clientPath = getRiotClientExecutable();
  if (!clientPath) {
    throw new Error('Riot Client introuvable pour le lancement');
  }

  const platform = process.platform;
  let command;

  console.log('[Tokens] Launching League via:', clientPath);

  if (platform === 'win32') {
    command = `"${clientPath}" --launch-product=league_of_legends --launch-patchline=live`;
  } else if (platform === 'darwin') {
    command = `open "${clientPath}" --args --launch-product=league_of_legends`;
  } else if (platform === 'linux') {
    if (clientPath.startsWith('/mnt/c/')) {
      const windowsPath = clientPath.replace('/mnt/c/', 'C:\\').replace(/\//g, '\\');
      command = `cmd.exe /c start "" "${windowsPath}" --launch-product=league_of_legends --launch-patchline=live`;
    } else {
      command = `wine "${clientPath}" --launch-product=league_of_legends --launch-patchline=live`;
    }
  }

  if (command) {
    // On n'attend pas forcément la fin du process
    exec(command);
    return true;
  }
  return false;
}

module.exports = {
  extractRiotTokens,
  killRiotClient,
  getAllPossibleRiotPaths,
  launchLeague,
  getRiotClientExecutable
};

