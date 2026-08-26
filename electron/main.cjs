const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const { killRiotClient, getAllPossibleRiotPaths, launchLeague, launchRiotClientOnly, getRiotClientExecutable } = require('./riotTokens.cjs');
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
  // Supprime le menu par défaut : ses accélérateurs (Ctrl+R = reload)
  // masqueraient le raccourci Ctrl+R "actualiser les élos" de l'app.
  Menu.setApplicationMenu(null);

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

  // === Durcissement navigation ===
  // Bloquer toute popup/nouvelle fenêtre ; ouvrir les liens externes dans le
  // navigateur de l'utilisateur plutôt que dans une BrowserWindow Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      try { require('electron').shell.openExternal(url); } catch (e) { }
    }
    return { action: 'deny' };
  });

  // Empêcher la navigation du renderer vers une origine non locale
  // (une XSS ne pourra pas rediriger l'app vers un site arbitraire).
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
    if (!isLocal) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) {
        try { require('electron').shell.openExternal(url); } catch (e) { }
      }
    }
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Global abort flag — checked by long-running handlers
let abortFlag = false;

ipcMain.handle('abort-riot-operations', () => {
  abortFlag = true;
  return { success: true };
});

ipcMain.handle('reset-abort-flag', () => {
  abortFlag = false;
  return { success: true };
});

// =====================================================
// RIOT CLIENT LOCKFILE & AUTH CHECK
// =====================================================

/**
 * Parse the Riot Client lockfile to get the local API connection info.
 * Lockfile format: name:pid:port:password:protocol
 */
function parseLockfile() {
  const lockfilePath = path.join(RIOT_PATH.config, 'lockfile');
  if (!fs.existsSync(lockfilePath)) return null;
  try {
    const content = fs.readFileSync(lockfilePath, 'utf8').trim();
    const parts = content.split(':');
    if (parts.length < 5) return null;
    return { name: parts[0], pid: parts[1], port: parts[2], password: parts[3], protocol: parts[4] };
  } catch (e) {
    return null;
  }
}

/**
 * Check if the Riot Client is logged in by hitting its local API.
 * Returns { loggedIn: true/false, error?: string }
 */
async function checkRiotLogin() {
  const lock = parseLockfile();
  if (!lock) return { loggedIn: false, error: 'no lockfile' };

  try {
    const https = require('https');
    const auth = Buffer.from(`riot:${lock.password}`).toString('base64');
    const url = `https://127.0.0.1:${lock.port}/rso-auth/v1/authorization`;

    const result = await new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: { 'Authorization': `Basic ${auth}` },
        rejectUnauthorized: false
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const json = JSON.parse(data);
              // If we get a valid response with a subject (PUUID), user is logged in
              resolve({ loggedIn: !!(json.subject || json.accessToken || json.token), puuid: json.subject || null });
            } catch {
              resolve({ loggedIn: false });
            }
          } else if (res.statusCode === 404) {
            // Endpoint not found — try alternative check
            resolve({ loggedIn: false, tryAlt: true });
          } else {
            resolve({ loggedIn: false });
          }
        });
      });
      req.on('error', (e) => resolve({ loggedIn: false, error: e.message }));
      req.setTimeout(3000, () => { req.destroy(); resolve({ loggedIn: false, error: 'timeout' }); });
    });

    // If rso-auth didn't work, try /entitlements/v1/token
    if (result.tryAlt) {
      const altUrl = `https://127.0.0.1:${lock.port}/entitlements/v1/token`;
      return await new Promise((resolve) => {
        const req = https.get(altUrl, {
          headers: { 'Authorization': `Basic ${auth}` },
          rejectUnauthorized: false
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const json = JSON.parse(data);
                resolve({ loggedIn: !!(json.accessToken || json.token) });
              } catch { resolve({ loggedIn: false }); }
            } else {
              resolve({ loggedIn: false });
            }
          });
        });
        req.on('error', () => resolve({ loggedIn: false }));
        req.setTimeout(3000, () => { req.destroy(); resolve({ loggedIn: false }); });
      });
    }

    return result;
  } catch (e) {
    return { loggedIn: false, error: e.message };
  }
}

ipcMain.handle('check-riot-login', async () => {
  return await checkRiotLogin();
});

ipcMain.handle('wait-riot-login', async (event, { timeout = 60000 } = {}) => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (abortFlag) return { loggedIn: false };
    const result = await checkRiotLogin();
    if (result.loggedIn) return { loggedIn: true };
    await sleep(2000);
  }
  return { loggedIn: false };
});

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
    console.log(`[Save] Saving session for: ${filename}`);

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
    console.log(`[Save] Session saved: ${sourcePath} -> ${destPath}`);
    return { success: true, message: 'Session sauvegardée' };
  } catch (error) {
    console.error('[Save] Error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-launch-status', (event, data) => {
  if (mainWindow) mainWindow.webContents.send('launch-status', data);
});

ipcMain.handle('load-session', async (event, { filename }) => {
  const send = (message) => {
    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'loading', message });
  };

  try {
    if (!filename) throw new Error('Filename requis');
    console.log(`[Load] Starting load-session for: ${filename}`);

    const sessionDir = getSessionDir(filename);
    const sourcePath = path.join(sessionDir, 'RiotGamesPrivateSettings.yaml');

    if (!fs.existsSync(sourcePath)) throw new Error('Aucune session sauvegardée pour ce compte');
    console.log(`[Load] Session file found: ${sourcePath}`);

    const possiblePaths = getAllPossibleRiotPaths();
    if (possiblePaths.length === 0) throw new Error('Aucune installation Riot trouvée');

    send('Fermeture de Riot...');
    console.log('[Load] Killing Riot/League processes...');
    await killRiotClient();
    console.log('[Load] Processes killed, waiting before inject...');
    await sleep(500);

    let restored = false;
    for (const p of possiblePaths) {
      const dataDir = p.data;
      if (fs.existsSync(dataDir)) {
        const yamlDest = path.join(dataDir, 'RiotGamesPrivateSettings.yaml');
        try { fs.rmSync(yamlDest, { force: true }); } catch (e) { }
        fs.copyFileSync(sourcePath, yamlDest);
        console.log(`[Load] Session injected: ${yamlDest}`);
        restored = true;
      }
    }

    if (!restored) throw new Error('Dossier Data Riot introuvable');

    send('Lancement de League...');
    console.log('[Load] Launching League...');
    await launchLeague();
    console.log('[Load] League launch command sent');

    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'idle' });
    return { success: true };

  } catch (error) {
    console.error('[Load] Error:', error.message);
    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'idle' });
    return { success: false, error: error.message };
  }
});

async function countRiotClientUi() {
  try {
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq Riot Client.exe" /NH');
    const count = (stdout.match(/Riot Client/gi) || []).length;
    if (count > 0) return count;
    // Fallback: check old process name
    const { stdout: stdout2 } = await execAsync('tasklist /FI "IMAGENAME eq RiotClientUxRender.exe" /NH');
    return (stdout2.match(/RiotClientUxRender/gi) || []).length;
  } catch {
    return 0;
  }
}

// Load session but only open Riot Client (not League) — for bulk save-all flow
ipcMain.handle('load-session-riot-only', async (event, { filename, timeout = 30000, label = '' }) => {
  const prefix = label ? `${label} — ` : '';
  const send = (message) => {
    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'loading', message: `${prefix}${message}` });
  };

  try {
    if (!filename) throw new Error('Filename requis');
    console.log(`[RiotOnly] Loading session: ${filename}`);

    send('Fermeture de Riot...');
    console.log('[RiotOnly] Killing processes...');
    await killRiotClient();
    await sleep(500);

    const sessionDir = getSessionDir(filename);
    const sourcePath = path.join(sessionDir, 'RiotGamesPrivateSettings.yaml');

    if (!fs.existsSync(sourcePath)) {
      console.log('[RiotOnly] No session file found');
      return { success: false, error: 'no-session' };
    }

    const possiblePaths = getAllPossibleRiotPaths();
    if (possiblePaths.length === 0) throw new Error('Aucune installation Riot trouvée');

    let restored = false;
    for (const p of possiblePaths) {
      const dataDir = p.data;
      if (fs.existsSync(dataDir)) {
        const yamlDest = path.join(dataDir, 'RiotGamesPrivateSettings.yaml');
        try { fs.rmSync(yamlDest, { force: true }); } catch (e) { }
        fs.copyFileSync(sourcePath, yamlDest);
        console.log(`[RiotOnly] Session injected: ${yamlDest}`);
        restored = true;
      }
    }

    if (!restored) throw new Error('Dossier Data Riot introuvable');

    send('Lancement Riot Client...');
    console.log('[RiotOnly] Launching Riot Client...');
    await launchRiotClientOnly();

    // Wait for Riot Client UI to appear
    const timeoutSec = Math.floor(timeout / 1000);
    const startTime = Date.now();
    let clientStarted = false;
    while (Date.now() - startTime < timeout) {
      if (abortFlag) {
        console.log('[RiotOnly] Aborted');
        return { success: false, error: 'aborted' };
      }
      const count = await countRiotClientUi();
      if (count >= 1) {
        console.log(`[RiotOnly] Riot Client detected (count=${count})`);
        clientStarted = true;
        break;
      }
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      send(`Attente Riot Client... ${elapsed}s / ${timeoutSec}s`);
      await sleep(1000);
    }
    if (!clientStarted) console.log('[RiotOnly] Timeout — Riot Client not detected');

    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'idle' });
    return { success: true, clientStarted };
  } catch (error) {
    console.error('[RiotOnly] Error:', error.message);
    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'idle' });
    return { success: false, error: error.message };
  }
});

// Launch just the Riot Client (no session injection, for manual login)
ipcMain.handle('launch-riot-only', async () => {
  try {
    console.log('[LaunchClean] Killing processes...');
    await killRiotClient();
    await sleep(1500);

    // Delete session YAML so user gets a fresh login screen
    const possiblePaths = getAllPossibleRiotPaths();
    for (const p of possiblePaths) {
      const yamlPath = path.join(p.data, 'RiotGamesPrivateSettings.yaml');
      try { fs.rmSync(yamlPath, { force: true }); } catch (e) { }
    }
    console.log('[LaunchClean] Session YAML deleted, launching Riot Client...');

    await launchRiotClientOnly();
    return { success: true };
  } catch (error) {
    console.error('[LaunchClean] Error:', error.message);
    return { success: false, error: error.message };
  }
});

// Wait for Riot Client to be connected
ipcMain.handle('wait-riot-client', async (event, { timeout = 60000, label = '' }) => {
  const prefix = label ? `${label} — ` : '';
  const send = (message) => {
    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'loading', message: `${prefix}${message}` });
  };
  const idle = () => {
    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'idle' });
  };

  const timeoutSec = Math.floor(timeout / 1000);
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (abortFlag) { idle(); return { connected: false }; }
    const count = await countRiotClientUi();
    if (count >= 1) { idle(); return { connected: true }; }
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    send(`Attente connexion... ${elapsed}s / ${timeoutSec}s`);
    await sleep(1000);
  }
  idle();
  return { connected: false };
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
    } catch (execErr) { }
    if (mainWindow) mainWindow.webContents.send('launch-status', { status: 'idle' });

    return { success: true, message: deleted ? 'Client réinitialisé' : 'Client relancé' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Backup current Riot session YAML to temp
ipcMain.handle('backup-riot-session', async () => {
  try {
    const possiblePaths = getAllPossibleRiotPaths();
    for (const p of possiblePaths) {
      const yamlPath = path.join(p.data, 'RiotGamesPrivateSettings.yaml');
      if (fs.existsSync(yamlPath)) {
        const backupDir = path.join(app.getPath('userData'), 'sessions', '_backup');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const backupPath = path.join(backupDir, 'RiotGamesPrivateSettings.yaml');
        fs.copyFileSync(yamlPath, backupPath);
        return { success: true };
      }
    }
    return { success: false, error: 'no session to backup' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Restore backed up session and relaunch Riot Client
ipcMain.handle('restore-riot-session', async () => {
  try {
    const backupDir = path.join(app.getPath('userData'), 'sessions', '_backup');
    const backupPath = path.join(backupDir, 'RiotGamesPrivateSettings.yaml');
    if (!fs.existsSync(backupPath)) return { success: false, error: 'no backup found' };

    await killRiotClient();
    await sleep(1500);

    // Restore YAML
    const possiblePaths = getAllPossibleRiotPaths();
    let restored = false;
    for (const p of possiblePaths) {
      const dataDir = p.data;
      if (fs.existsSync(dataDir)) {
        // Clear existing
        for (const file of fs.readdirSync(dataDir)) {
          try { fs.rmSync(path.join(dataDir, file), { recursive: true, force: true }); } catch (e) { }
        }
        fs.copyFileSync(backupPath, path.join(dataDir, 'RiotGamesPrivateSettings.yaml'));
        restored = true;
      }
    }

    if (!restored) return { success: false, error: 'no Riot data dir found' };

    // Clean up backup
    try { fs.rmSync(backupPath, { force: true }); } catch (e) { }

    // Relaunch Riot Client
    await launchRiotClientOnly();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  if (app.isPackaged) {
    autoUpdater.on('update-available', (info) => {
      if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloading', version: info?.version });
    });
    autoUpdater.on('download-progress', (p) => {
      if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloading', percent: Math.round(p?.percent || 0) });
    });
    autoUpdater.on('update-downloaded', (info) => {
      if (mainWindow) mainWindow.webContents.send('update-status', { status: 'ready', version: info?.version });
    });
    autoUpdater.on('error', (err) => {
      console.log('[AutoUpdater] Error:', err.message);
    });
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.log('[AutoUpdater] Pas de mise à jour disponible:', err.message);
    });
    // Re-check toutes les 4h tant que l'app tourne
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 4 * 60 * 60 * 1000);
  }
});

// Installe la mise à jour téléchargée (quitte et relance l'app)
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
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
