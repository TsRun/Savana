const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const { extractRiotTokens, killRiotClient, getAllPossibleRiotPaths, launchLeague } = require('./riotTokens.cjs');
const { autoUpdater } = require('electron-updater');

// --- Auto Updater Config ---
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'available', info });
  });

  autoUpdater.on('update-not-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'not-available', info });
  });

  autoUpdater.on('error', (err) => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'error', error: err.message });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloading', progress: progressObj });
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloaded', info });
    // Ask user or auto restart? For now, auto install on quit
  });
}

const execAsync = promisify(exec);

// =====================================================
// PERFORMANCE FLAGS
// =====================================================
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('force-gpu-mem-available-mb', '1024');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// Linux/X11 specific - better window rendering
app.commandLine.appendSwitch('disable-gpu-compositing'); // Évite les artefacts X11
app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform');
app.commandLine.appendSwitch('ozone-platform-hint', 'auto'); // Wayland si dispo, sinon X11

// Force dark theme pour les éléments natifs
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('force-dark-mode');
  app.commandLine.appendSwitch('gtk-version', '4'); // Meilleur rendu GTK
}

let mainWindow;
let serverProcess;

// Helper pour obtenir le home directory
const getHomeDir = () => {
  return process.env.HOME || process.env.USERPROFILE || os.homedir();
};

// Chemins Riot selon l'OS
const RIOT_PATHS = {
  win32: {
    client: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
    config: process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Riot Games', 'Riot Client', 'Config')
      : path.join(getHomeDir(), 'AppData', 'Local', 'Riot Games', 'Riot Client', 'Config'),
    lockfile: process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Riot Games', 'Riot Client', 'Config', 'lockfile')
      : path.join(getHomeDir(), 'AppData', 'Local', 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
    data: process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Riot Games', 'Riot Client', 'Data')
      : path.join(getHomeDir(), 'AppData', 'Local', 'Riot Games', 'Riot Client', 'Data')
  },
  darwin: {
    client: '/Applications/Riot Games/Riot Client.app',
    config: path.join(getHomeDir(), 'Library', 'Application Support', 'Riot Games', 'Riot Client', 'Config'),
    lockfile: path.join(getHomeDir(), 'Library', 'Application Support', 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
    data: path.join(getHomeDir(), 'Library', 'Application Support', 'Riot Games', 'Riot Client', 'Data')
  },
  linux: {
    client: path.join(getHomeDir(), '.local', 'share', 'lutris', 'runners', 'wine'),
    config: path.join(getHomeDir(), '.wine', 'drive_c', 'Riot Games', 'Riot Client', 'Config'),
    lockfile: null,
    data: path.join(getHomeDir(), '.wine', 'drive_c', 'Riot Games', 'Riot Client', 'Data')
  }
};

function createWindow() {
  // Sur Linux, utiliser la frame native pour éviter les problèmes de resize
  const isLinux = process.platform === 'linux';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    // Frame native sur Linux, frameless sur Windows/Mac
    frame: isLinux,
    titleBarStyle: isLinux ? 'default' : 'hiddenInset',
    transparent: false,
    hasShadow: !isLinux,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling: false,
      spellcheck: false,
    },
    icon: path.join(__dirname, '../public/icon.png'),
    backgroundColor: '#0a0a0f',
    title: 'Savana',
    show: false,
    paintWhenInitiallyHidden: true,
    autoHideMenuBar: true,
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // Init Auto Updater
    setupAutoUpdater();
    autoUpdater.checkForUpdatesAndNotify();
  });

  // Démarrer le serveur backend (sauf si déjà lancé séparément)
  if (!process.env.SKIP_BACKEND_SERVER) {
    startBackendServer();
  } else {
    console.log('[Backend] Mode externe - Serveur backend deja lance sur http://localhost:3000');
  }

  // Toujours charger depuis Vite en dev, ou build en prod
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    // Attendre que Vite soit prêt
    setTimeout(() => {
      mainWindow.loadURL('http://localhost:5173');
      // DevTools désactivés par défaut - Ctrl+Shift+I pour ouvrir manuellement
    }, 1000);
  } else {
    // En production, charger les fichiers buildés
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopBackendServer();
  });
}

function startBackendServer() {
  const serverPath = path.join(__dirname, '../server/server.js');
  serverProcess = require('child_process').fork(serverPath, [], {
    env: { ...process.env, ELECTRON_MODE: 'true' }
  });

  serverProcess.on('error', (err) => {
    console.error('[Backend] Erreur serveur:', err);
  });

  console.log('[Backend] Serveur backend demarre');
}

function stopBackendServer() {
  if (serverProcess) {
    serverProcess.kill();
    console.log('[Backend] Serveur backend arrete');
  }
}

// =====================================================
// WINDOW CONTROLS (Frameless)
// =====================================================

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('write-clipboard', (event, text) => {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
  return { success: true };
});

// =====================================================
// RIOT CLIENT INTEGRATION
// =====================================================

// Handler pour lancer le Riot Client avec injection de credentials
ipcMain.handle('launch-riot-client', async (event, { username, password }) => {
  const platform = process.platform;
  const riotPath = RIOT_PATHS[platform];

  if (!riotPath) {
    throw new Error('Plateforme non supportee');
  }

  try {
    console.log('[Riot Client] Recherche du client...');

    // Vérifier si le client existe
    let clientExists = false;
    let actualClientPath = riotPath.client;
    let possiblePaths = [riotPath.client];

    // Pour Linux/WSL, chercher dans plusieurs emplacements possibles
    if (platform === 'linux') {
      possiblePaths = [
        '/mnt/c/Riot Games/Riot Client/RiotClientServices.exe',
        path.join(getHomeDir(), '.wine/drive_c/Riot Games/Riot Client/RiotClientServices.exe'),
        '/opt/Riot Games/Riot Client/RiotClientServices.exe'
      ];

      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          clientExists = true;
          actualClientPath = testPath;
          console.log('[Riot Client] Trouve a:', actualClientPath);
          break;
        }
      }
    } else {
      clientExists = fs.existsSync(riotPath.client);
      actualClientPath = riotPath.client;
    }

    if (!clientExists) {
      throw new Error(`Riot Client non trouve. Chemins testes:\n${possiblePaths.join('\n')}`);
    }

    // Injecter les credentials dans la config
    await injectCredentialsToConfig(riotPath.config, username, password);

    // Lancer le client (Juste Riot)
    let command;
    if (platform === 'win32') {
      command = `"${actualClientPath}"`;
    } else if (platform === 'darwin') {
      command = `open "${actualClientPath}"`;
    } else if (platform === 'linux') {
      if (actualClientPath.startsWith('/mnt/c/')) {
        const windowsPath = actualClientPath.replace('/mnt/c/', 'C:\\').replace(/\//g, '\\');
        command = `cmd.exe /c start "" "${windowsPath}"`;
      } else {
        command = `wine "${actualClientPath}"`;
      }
    }

    console.log('[Riot Client] Commande:', command);
    await execAsync(command);
    console.log('[Riot Client] Lancement reussi');

    // Auto-fill après délai
    setTimeout(async () => {
      await autoFillCredentials(username, password);
    }, 3000);

    return { success: true, message: 'Client lance avec auto-login' };
  } catch (error) {
    console.error('[Riot Client] Erreur:', error);
    throw error;
  }
});

// Injection des credentials dans le fichier de config
async function injectCredentialsToConfig(configPath, username, password) {
  try {
    const autofillConfig = {
      username: username,
      remember: true,
      timestamp: Date.now()
    };

    const configFile = path.join(configPath, 'autofill.json');

    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(configPath, { recursive: true });
    }

    fs.writeFileSync(configFile, JSON.stringify(autofillConfig, null, 2));
    console.log('[Config] Autofill config creee:', configFile);

  } catch (error) {
    console.error('[Config] Erreur:', error);
  }
}

// Auto-fill avec robotjs (si disponible)
async function autoFillCredentials(username, password) {
  try {
    const robot = require('robotjs');

    await sleep(500);
    robot.typeString(username);
    await sleep(300);
    robot.keyTap('tab');
    await sleep(200);
    robot.typeString(password);
    await sleep(300);
    robot.keyTap('enter');

    console.log('[AutoFill] Credentials remplis');
  } catch (error) {
    console.log('[AutoFill] Non disponible:', error.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================================================
// SESSION MANAGEMENT (New Flow)
// =====================================================

function getSessionDir(smurfId) {
  const sessionDir = path.join(app.getPath('userData'), 'sessions', String(smurfId));
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  return sessionDir;
}

ipcMain.handle('save-session', async (event, { smurfId }) => {
  try {
    console.log(`[Session] Sauvegarde pour smurf ${smurfId}...`);

    const possiblePaths = getAllPossibleRiotPaths();
    if (possiblePaths.length === 0) {
      throw new Error('Aucune installation Riot trouvée');
    }

    // On cherche le fichier dans le dossier Data
    let sourcePath = null;
    for (const p of possiblePaths) {
      const candidate = path.join(p.data, 'RiotGamesPrivateSettings.yaml');
      if (fs.existsSync(candidate)) {
        sourcePath = candidate;
        break;
      }
    }

    if (!sourcePath) {
      throw new Error('Fichier RiotGamesPrivateSettings.yaml non trouvé (Lancez Riot Client une fois)');
    }

    const sessionDir = getSessionDir(smurfId);
    const destPath = path.join(sessionDir, 'RiotGamesPrivateSettings.yaml');

    fs.copyFileSync(sourcePath, destPath);
    console.log(`[Session] Sauvegardée dans ${destPath}`);

    return { success: true, message: 'Session sauvegardée' };
  } catch (error) {
    console.error('[Session] Erreur sauvegarde:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-session', async (event, { smurfId }) => {
  try {
    console.log(`[Session] Chargement pour smurf ${smurfId}...`);

    const sessionDir = getSessionDir(smurfId);
    const sourcePath = path.join(sessionDir, 'RiotGamesPrivateSettings.yaml');

    if (!fs.existsSync(sourcePath)) {
      throw new Error('Aucune session sauvegardée pour ce compte');
    }

    const possiblePaths = getAllPossibleRiotPaths();
    if (possiblePaths.length === 0) {
      throw new Error('Aucune installation Riot trouvée');
    }

    // 1. Tuer Riot Client
    console.log('[Session] Arrêt forcé de Riot Client...');
    await killRiotClient();
    await sleep(1000); // Attendre un peu

    // 2. Nettoyer et restaurer pour chaque chemin potentiel (au cas où)
    // Mais généralement il n'y en a qu'un valide par OS principal
    let restored = false;

    for (const p of possiblePaths) {
      const dataDir = p.data;

      if (fs.existsSync(dataDir)) {
        console.log(`[Session] Nettoyage de ${dataDir}...`);

        // Vider le dossier Data
        const files = fs.readdirSync(dataDir);
        for (const file of files) {
          // On supprime tout sauf peut-être les dossiers si nécessaire ? 
          // L'utilisateur a dit "clear le dossier... et y copier dedans"
          // On va supprimer récursivement tout le contenu
          const curPath = path.join(dataDir, file);
          try {
            fs.rmSync(curPath, { recursive: true, force: true });
          } catch (e) {
            console.log('Erreur suppression fichier inutile:', e.message);
          }
        }

        // Copier le fichier de session
        console.log('[Session] Injection du fichier session...');
        fs.copyFileSync(sourcePath, path.join(dataDir, 'RiotGamesPrivateSettings.yaml'));
        restored = true;
      }
    }

    if (!restored) {
      throw new Error('Dossier Data Riot introuvable pour la restauration');
    }

    // 3. Relancer League of Legends
    console.log('[Session] Relancement de League of Legends...');

    try {
      // Pause pour laisser le temps au système de fichiers de se stabiliser
      await new Promise(resolve => setTimeout(resolve, 1000));
      await launchLeague();
    } catch (launchErr) {
      console.error('[Session] Erreur lancement LoL:', launchErr.message);
      // On ne throw pas ici, car la session est déjà restaurée
    }

    console.log('[Session] Session chargée et LoL lancé');
    return { success: true, message: 'Session chargée, lancement de LoL...' };

  } catch (error) {
    console.error('[Session] Erreur chargement:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-saved-sessions', async () => {
  try {
    const sessionsDir = path.join(app.getPath('userData'), 'sessions');
    if (!fs.existsSync(sessionsDir)) {
      return [];
    }
    const smurfIds = fs.readdirSync(sessionsDir).filter(f => {
      // On vérifie que c'est un dossier et qu'il contient le yaml
      const p = path.join(sessionsDir, f);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'RiotGamesPrivateSettings.yaml'));
    });
    return smurfIds;
  } catch (error) {
    console.error('[Session] Erreur listing sessions:', error);
    return [];
  }
});

ipcMain.handle('reset-riot-client', async () => {
  try {
    console.log('[Reset] Demande de réinitialisation...');
    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'loading', message: 'Arrêt des processus (5s)...' });

    // 1. Tuer les processus
    await killRiotClient();
    await sleep(1000); // Attendre fermeture

    // 2. Trouver et supprimer le fichier de session
    const possiblePaths = getAllPossibleRiotPaths();
    let deleted = false;

    for (const p of possiblePaths) {
      const yamlPath = path.join(p.data, 'RiotGamesPrivateSettings.yaml');
      if (fs.existsSync(yamlPath)) {
        try {
          console.log('[Reset] Suppression:', yamlPath);
          fs.rmSync(yamlPath, { force: true });
          deleted = true;
        } catch (e) {
          console.error('[Reset] Erreur suppression:', e);
        }
      }
    }

    // 3. Relancer Riot Client
    console.log('[Reset] Lancement Riot Client...');
    // Tentative de résolution du chemin du client
    let clientPath = '';
    const platform = process.platform;

    if (platform === 'linux') {
      const wslPath = '/mnt/c/Riot Games/Riot Client/RiotClientServices.exe';
      const winePath = path.join(getHomeDir(), '.wine/drive_c/Riot Games/Riot Client/RiotClientServices.exe');
      const lutrisPath = '/opt/Riot Games/Riot Client/RiotClientServices.exe';

      if (fs.existsSync('/mnt/c/')) {
        if (fs.existsSync(wslPath)) clientPath = wslPath;
        else clientPath = wslPath;
      } else {
        if (fs.existsSync(winePath)) clientPath = winePath;
        else if (fs.existsSync(lutrisPath)) clientPath = lutrisPath;
        else clientPath = winePath;
      }
    } else if (platform === 'win32') {
      clientPath = 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe';
    } else if (platform === 'darwin') {
      clientPath = '/Applications/Riot Games/Riot Client.app';
    }

    console.log('[Reset] Chemin client résolu:', clientPath);

    let command;
    if (platform === 'win32') {
      command = `"${clientPath}"`;
    } else if (platform === 'darwin') {
      command = `open "${clientPath}"`;
    } else if (platform === 'linux') {
      if (clientPath.includes('/mnt/c/')) {
        const windowsPath = clientPath.replace('/mnt/c/', 'C:\\').replace(/\//g, '\\');
        command = `cmd.exe /c start "" "${windowsPath}"`;
      } else {
        command = `wine "${clientPath}"`;
      }
    }

    if (command) {
      console.log('[Reset] Commande launch:', command);
      if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'loading', message: 'Lancement du client...' });

      try {
        exec(command);

        // Délai pour laisser le temps au client de s'ouvrir
        setTimeout(() => {
          if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'idle' });
        }, 8000);

      } catch (execErr) {
        console.error('[Reset] Erreur exec:', execErr);
        if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'idle' });
      }
    } else {
      if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'idle' });
    }

    return { success: true, message: deleted ? 'Client réinitialisé et relancé' : 'Rien à nettoyer, client relancé' };
  } catch (error) {
    console.error('[Reset] Erreur:', error);
    return { success: false, error: error.message };
  }
});


// =====================================================
// APP LIFECYCLE
// =====================================================

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopBackendServer();
});
