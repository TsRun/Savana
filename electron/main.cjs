const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const { extractRiotTokens, killRiotClient, getAllPossibleRiotPaths, launchLeague, getRiotClientExecutable } = require('./riotTokens.cjs');
const { autoUpdater } = require('electron-updater');

const execAsync = promisify(exec);

let backendPort = null;
let mainWindow;
let serverProcess;

// =====================================================
// PERFORMANCE FLAGS (Windows)
// =====================================================
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('force-gpu-mem-available-mb', '1024');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// Chemin Riot Windows
const RIOT_PATH = {
  client: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
  config: path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Riot Games', 'Riot Client', 'Config'),
  data: path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Riot Games', 'Riot Client', 'Data')
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hiddenInset',
    transparent: false,
    hasShadow: true,
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
    icon: path.join(__dirname, '../public/SavanaLogo.jpg'),
    backgroundColor: '#0a0a0f',
    title: 'Savana',
    show: false,
    paintWhenInitiallyHidden: true,
    autoHideMenuBar: true,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Démarrer le serveur backend
  if (!process.env.SKIP_BACKEND_SERVER) {
    if (!serverProcess) startBackendServer();
  }

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    setTimeout(() => {
      mainWindow.loadURL('http://localhost:5173');
    }, 1000);
  } else {
    // Config Production : Unified Server Architecture
    // On n'utilise plus loadFile, on attend que le backend serve le frontend
    if (backendPort) {
      console.log('[Main] Loading URL directly (port ready):', `http://localhost:${backendPort}`);
      mainWindow.loadURL(`http://localhost:${backendPort}`);
    } else {
      console.log('[Main] Waiting for backend port to load URL...');
      // On peut afficher un écran de chargement basique si on veut, 
      // ou laisser l'écran de fond (backgroundColor)
    }

    // DEBUG: Ouvrir les devtools uniquement en dev
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopBackendServer();
  });
}

function startBackendServer() {
  const isDev = !app.isPackaged;
  console.log('[Backend] Mode:', isDev ? 'Development' : 'Production (Fork)');

  // En Dev: server/server.js ; En Prod: resources/backend/server.mjs (bundlé)
  const serverPath = isDev
    ? path.join(__dirname, '../server/server.js')
    : path.join(process.resourcesPath, 'backend', 'server.mjs');

  console.log('[Backend] Script:', serverPath);

  try {
    serverProcess = require('child_process').fork(serverPath, [], {
      env: { ...process.env, ELECTRON_MODE: 'true', USER_DATA_PATH: app.getPath('userData') },
      cwd: isDev ? path.join(__dirname, '..') : path.join(process.resourcesPath, 'backend'),
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'] // IPC pour process.msg
    });

    serverProcess.on('message', (msg) => {
      if (msg && msg.type === 'PORT') {
        backendPort = msg.port;
        console.log('[Backend] Port received via IPC:', backendPort);

        // UNIFIED SERVER TRIGGER
        // Dès qu'on a le port, on charge l'interface servie par le backend
        if (mainWindow && !isDev) {
          console.log('[Main] Loading URL via IPC trigger:', `http://localhost:${backendPort}`);
          mainWindow.loadURL(`http://localhost:${backendPort}`);
        }
      }
    });

    if (serverProcess.stdout) {
      serverProcess.stdout.on('data', (data) => console.log('[Backend]', data.toString()));
    }
    if (serverProcess.stderr) {
      serverProcess.stderr.on('data', (data) => console.error('[Backend ERROR]', data.toString()));
    }

    serverProcess.on('error', (err) => {
      console.error('[Backend] FAILED TO START:', err);
    });

    console.log('[Backend] Process started, PID:', serverProcess.pid);
  } catch (e) {
    console.error('[Backend] Exception launching backend:', e);
  }
}

function stopBackendServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
    console.log('[Backend] Serveur backend arrete');
  }
}

// =====================================================
// WINDOW CONTROLS
// =====================================================

ipcMain.handle('get-platform', () => 'win32');

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

ipcMain.handle('launch-riot-client', async (event, { username, password }) => {
  try {
    const clientPath = getRiotClientExecutable();
    if (!clientPath) throw new Error('Riot Client non trouvé');

    await injectCredentialsToConfig(RIOT_PATH.config, username, password);

    const command = `"${clientPath}"`;
    await execAsync(command);

    setTimeout(async () => {
      await autoFillCredentials(username, password);
    }, 3000);

    return { success: true, message: 'Client lance avec auto-login' };
  } catch (error) {
    console.error('[Riot Client] Erreur:', error);
    throw error;
  }
});

async function injectCredentialsToConfig(configPath, username, password) {
  try {
    const autofillConfig = { username: username, remember: true, timestamp: Date.now() };
    const configFile = path.join(configPath, 'autofill.json');

    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(configPath, { recursive: true });
    }

    fs.writeFileSync(configFile, JSON.stringify(autofillConfig, null, 2));
  } catch (error) {
    console.error('[Config] Erreur:', error);
  }
}

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
  } catch (error) {
    console.log('[AutoFill] Non disponible:', error.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================================================
// SESSION MANAGEMENT
// =====================================================

// =====================================================
// SESSION MANAGEMENT
// =====================================================

function getSessionDir(filename) {
  const sessionDir = path.join(app.getPath('userData'), 'sessions', filename);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  return sessionDir;
}

ipcMain.handle('save-session', async (event, { filename }) => {
  try {
    if (!filename) throw new Error('Filename requis');

    const possiblePaths = getAllPossibleRiotPaths();
    if (possiblePaths.length === 0) throw new Error('Aucune installation Riot trouvée');

    let sourcePath = null;
    for (const p of possiblePaths) {
      const candidate = path.join(p.data, 'RiotGamesPrivateSettings.yaml');
      if (fs.existsSync(candidate)) {
        sourcePath = candidate;
        break;
      }
    }

    if (!sourcePath) throw new Error('Fichier RiotGamesPrivateSettings.yaml non trouvé (Lancez Riot Client une fois)');

    const sessionDir = getSessionDir(filename);
    const destPath = path.join(sessionDir, 'RiotGamesPrivateSettings.yaml');

    fs.copyFileSync(sourcePath, destPath);
    return { success: true, message: 'Session sauvegardée' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

async function countLeagueClientUxRender() {
  try {
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq LeagueClientUxRender.exe"');
    return (stdout.match(/LeagueClientUxRender/gi) || []).length;
  } catch {
    return 0;
  }
}

ipcMain.handle('update-launch-status', (event, data) => {
  if (mainWindow) mainWindow.webContents.send('launch-status', data);
});

ipcMain.handle('load-session', async (event, { filename, timeout = 60000, label = '', keepOverlay = false }) => {
  const prefix = label ? `${label} — ` : '';
  const send = (message) => {
    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'loading', message: `${prefix}${message}` });
  };

  try {
    if (!filename) throw new Error('Filename requis');

    send('Préparation...');

    const sessionDir = getSessionDir(filename);
    const sourcePath = path.join(sessionDir, 'RiotGamesPrivateSettings.yaml');

    if (!fs.existsSync(sourcePath)) throw new Error('Aucune session sauvegardée pour ce compte');

    const possiblePaths = getAllPossibleRiotPaths();
    if (possiblePaths.length === 0) throw new Error('Aucune installation Riot trouvée');

    send('Fermeture de Riot...');
    await killRiotClient();
    await sleep(2000);

    let restored = false;
    for (const p of possiblePaths) {
      const dataDir = p.data;
      if (fs.existsSync(dataDir)) {
        send('Nettoyage des fichiers...');
        const files = fs.readdirSync(dataDir);
        for (const file of files) {
          try { fs.rmSync(path.join(dataDir, file), { recursive: true, force: true }); } catch (e) { }
        }
        send('Injection de la session...');
        fs.copyFileSync(sourcePath, path.join(dataDir, 'RiotGamesPrivateSettings.yaml'));
        restored = true;
      }
    }

    if (!restored) throw new Error('Dossier Data Riot introuvable pour la restauration');

    send('Lancement du client...');
    try { await sleep(1000); await launchLeague(); } catch (launchErr) { }

    // Attente du client avec countdown
    const timeoutSec = Math.floor(timeout / 1000);
    const startTime = Date.now();
    let clientStarted = false;
    while (Date.now() - startTime < timeout) {
      const count = await countLeagueClientUxRender();
      if (count >= 2) { clientStarted = true; break; }
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      send(`Attente connexion... ${elapsed}s / ${timeoutSec}s`);
      await sleep(1000);
    }

    if (!keepOverlay) {
      if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'idle' });
    }
    return { success: true, clientStarted };

  } catch (error) {
    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'idle' });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-session', async (event, { filename }) => {
  try {
    if (!filename) throw new Error('Filename requis');
    const sessionDir = path.join(app.getPath('userData'), 'sessions', filename);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-saved-sessions', async () => {
  try {
    const sessionsDir = path.join(app.getPath('userData'), 'sessions');
    if (!fs.existsSync(sessionsDir)) return [];

    const sessionDirs = fs.readdirSync(sessionsDir).filter(f => {
      const p = path.join(sessionsDir, f);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'RiotGamesPrivateSettings.yaml'));
    });

    // Return session objects with metadata
    return sessionDirs.map(name => {
      const yamlPath = path.join(sessionsDir, name, 'RiotGamesPrivateSettings.yaml');
      let savedAt = null;
      try {
        const stats = fs.statSync(yamlPath);
        savedAt = stats.mtime.toISOString();
      } catch (e) { }
      return { name, savedAt };
    });
  } catch (error) {
    return [];
  }
});

ipcMain.handle('reset-riot-client', async () => {
  try {
    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'loading', message: 'Arrêt des processus (2s)...' });
    await killRiotClient();
    await sleep(1000);

    const possiblePaths = getAllPossibleRiotPaths();
    let deleted = false;
    for (const p of possiblePaths) {
      const yamlPath = path.join(p.data, 'RiotGamesPrivateSettings.yaml');
      if (fs.existsSync(yamlPath)) {
        try {
          fs.rmSync(yamlPath, { force: true });
          deleted = true;
        } catch (e) { }
      }
    }

    const clientPath = getRiotClientExecutable() || 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe';
    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'loading', message: 'Lancement du client...' });
    try {
      exec(`"${clientPath}"`);
      setTimeout(() => {
        if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'idle' });
      }, 8000);
    } catch (execErr) {
      if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'idle' });
    }

    return { success: true, message: deleted ? 'Client réinitialisé' : 'Client relancé' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.log('[AutoUpdater] Pas de mise à jour disponible:', err.message);
    });
    autoUpdater.on('update-available', () => {
      if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloading' });
    });
    autoUpdater.on('update-downloaded', () => {
      if (mainWindow) mainWindow.webContents.send('update-status', { status: 'ready' });
    });
    autoUpdater.on('error', (err) => {
      console.log('[AutoUpdater] Error:', err.message);
    });
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  stopBackendServer();
});

ipcMain.handle('get-api-config', () => {
  if (!backendPort) return null;
  return { port: backendPort, baseUrl: `http://localhost:${backendPort}/api` };
});
