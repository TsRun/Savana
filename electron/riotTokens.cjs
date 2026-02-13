const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Trouve le chemin Riot Client sur Windows
 */
function getAllPossibleRiotPaths() {
  const appData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const basePath = path.join(appData, 'Riot Games', 'Riot Client');

  return [{
    config: path.join(basePath, 'Config'),
    data: path.join(basePath, 'Data'),
    localState: path.join(basePath, 'Local State')
  }];
}

/**
 * Tue tous les processus Riot/League (Windows)
 */
async function killRiotClient() {
  const DURATION = 5000;
  const startTime = Date.now();

  console.log('[Kill] Arrêt des processus Riot/LoL (5s)...');

  while (Date.now() - startTime < DURATION) {
    try {
      await execPromise('taskkill /F /IM RiotClientServices.exe /IM LeagueClient.exe /IM "League of Legends.exe" /IM LeagueClientUx.exe /IM LeagueCrashHandler.exe /IM LeagueClientUxRender.exe /IM RiotClientUx.exe /IM RiotClientUxRender.exe /IM RiotClientCrashHandler.exe /T 2>nul').catch(() => { });
    } catch (e) {
      // Ignorer les erreurs (process non trouvé)
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('[Kill] Processus arrêtés.');
}

/**
 * Trouve l'exécutable Riot Client
 */
function getRiotClientExecutable() {
  const possiblePaths = [
    'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
    'D:\\Riot Games\\Riot Client\\RiotClientServices.exe'
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Lance League of Legends
 */
async function launchLeague() {
  const clientPath = getRiotClientExecutable();
  if (!clientPath) {
    throw new Error('Riot Client introuvable');
  }

  console.log('[Launch] Lancement de League via:', clientPath);
  const command = `"${clientPath}" --launch-product=league_of_legends --launch-patchline=live`;
  exec(command);
  return true;
}

/**
 * Extrait les tokens depuis le YAML
 */
function extractFromYAMLContent(yamlContent) {
  const tokens = {};
  const patterns = {
    persistLoginToken: /persist[-_]login[-_]token:\s*["']?([^"'\n\r]+)["']?/i,
    rsoToken: /rso[-_]token:\s*["']?([^"'\n\r]+)["']?/i,
    authToken: /auth[-_]token:\s*["']?([^"'\n\r]+)["']?/i
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = yamlContent.match(pattern);
    if (match && match[1]) {
      tokens[key] = match[1].trim();
    }
  }
  return Object.keys(tokens).length > 0 ? tokens : null;
}

/**
 * Extrait les tokens Riot
 */
async function extractRiotTokens() {
  try {
    await killRiotClient();
    await new Promise(resolve => setTimeout(resolve, 500));

    const possiblePaths = getAllPossibleRiotPaths();
    console.log(`[Tokens] Recherche dans ${possiblePaths.length} emplacements...`);

    for (const riotPath of possiblePaths) {
      const yamlPath = path.join(riotPath.config, 'RiotGamesPrivateSettings.yaml');
      const backupPath = yamlPath + '.backup';

      if (fs.existsSync(yamlPath)) {
        try {
          console.log('[Tokens] Lecture YAML:', yamlPath);
          const content = fs.readFileSync(yamlPath, 'utf8');
          const yamlTokens = extractFromYAMLContent(content);

          // Supprimer et restaurer
          console.log('[Tokens] Suppression des fichiers config...');
          try {
            fs.unlinkSync(yamlPath);
            if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
          } catch (e) {
            console.error('[Tokens] Erreur suppression:', e.message);
          }

          console.log('[Tokens] Restauration du fichier...');
          fs.writeFileSync(yamlPath, content);

          if (yamlTokens) {
            console.log('[Tokens] Tokens extraits:', Object.keys(yamlTokens).length);
            return yamlTokens;
          }
        } catch (e) {
          console.error('[Tokens] Erreur:', e.message);
        }
      }
    }

    throw new Error('Aucun token trouvé');
  } catch (error) {
    console.error('[Tokens] Erreur:', error.message);
    throw error;
  }
}

module.exports = {
  extractRiotTokens,
  killRiotClient,
  getAllPossibleRiotPaths,
  launchLeague,
  getRiotClientExecutable
};
