const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const { extractRiotTokens } = require('./riotTokens.cjs');

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
    title: 'Smurf Manager',
    show: false,
    paintWhenInitiallyHidden: true,
    autoHideMenuBar: true,
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
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

    // Lancer le client
    let command;
    if (platform === 'win32') {
      command = `"${actualClientPath}" --launch-product=league_of_legends --launch-patchline=live`;
    } else if (platform === 'darwin') {
      command = `open "${actualClientPath}" --args --launch-product=league_of_legends`;
    } else if (platform === 'linux') {
      if (actualClientPath.startsWith('/mnt/c/')) {
        const windowsPath = actualClientPath.replace('/mnt/c/', 'C:\\').replace(/\//g, '\\');
        command = `cmd.exe /c start "" "${windowsPath}" --launch-product=league_of_legends --launch-patchline=live`;
      } else {
        command = `wine "${actualClientPath}" --launch-product=league_of_legends --launch-patchline=live`;
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

// =====================================================
// INSTANT LOGIN (Token-based, no password needed)
// =====================================================

ipcMain.handle('instant-login', async (event, { tokens }) => {
  const platform = process.platform;
  const riotPath = RIOT_PATHS[platform];

  if (!riotPath) {
    throw new Error('Plateforme non supportee');
  }

  try {
    console.log('[Instant Login] Injection des tokens...');
    
    // Inject tokens into Riot Client config files
    const success = await injectTokensForInstantLogin(riotPath, tokens);
    
    if (!success) {
      throw new Error('Impossible d\'injecter les tokens');
    }

    // Find and launch Riot Client
    let clientPath = riotPath.client;
    let clientExists = fs.existsSync(clientPath);

    // Check alternate paths for Linux/WSL
    if (!clientExists && platform === 'linux') {
      const altPaths = [
        '/mnt/c/Riot Games/Riot Client/RiotClientServices.exe',
        path.join(getHomeDir(), '.wine/drive_c/Riot Games/Riot Client/RiotClientServices.exe')
      ];
      for (const p of altPaths) {
        if (fs.existsSync(p)) {
          clientPath = p;
          clientExists = true;
          break;
        }
      }
    }

    if (!clientExists) {
      throw new Error('Riot Client non trouve');
    }

    // Launch client
    let command;
    if (platform === 'win32') {
      command = `"${clientPath}" --launch-product=league_of_legends --launch-patchline=live`;
    } else if (platform === 'darwin') {
      command = `open "${clientPath}" --args --launch-product=league_of_legends`;
    } else if (platform === 'linux' && clientPath.startsWith('/mnt/c/')) {
      const windowsPath = clientPath.replace('/mnt/c/', 'C:\\').replace(/\//g, '\\');
      command = `cmd.exe /c start "" "${windowsPath}" --launch-product=league_of_legends --launch-patchline=live`;
    }

    if (command) {
      await execAsync(command);
      console.log('[Instant Login] Client lance avec tokens injectes');
    }

    return { success: true, message: 'Instant login reussi' };
  } catch (error) {
    console.error('[Instant Login] Erreur:', error);
    return { success: false, error: error.message };
  }
});

// Inject tokens for instant login
async function injectTokensForInstantLogin(riotPath, tokens) {
  try {
    const dataPath = riotPath.data;
    
    // Ensure data directory exists
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }

    // Write tokens to a session file that Riot Client can use
    const sessionFile = path.join(dataPath, 'RiotGamesPrivateSettings.yaml');
    
    let yamlContent = '';
    
    // Build YAML content with tokens
    if (tokens.accessToken) {
      yamlContent += `riot-login:\n`;
      yamlContent += `    persist:\n`;
      yamlContent += `        region: EUW\n`;
      yamlContent += `        session:\n`;
      yamlContent += `            cookies:\n`;
      if (tokens.ssid) {
        yamlContent += `                ssid: "${tokens.ssid}"\n`;
      }
      if (tokens.sub) {
        yamlContent += `                sub: "${tokens.sub}"\n`;
      }
    }
    
    if (yamlContent) {
      fs.writeFileSync(sessionFile, yamlContent, 'utf8');
      console.log('[Instant Login] Session file cree:', sessionFile);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[Instant Login] Erreur injection tokens:', error);
    return false;
  }
}

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
// TOKEN EXTRACTION
// =====================================================

ipcMain.handle('extract-riot-tokens', async () => {
  try {
    console.log('[Tokens] Extraction automatique...');
    const tokens = await extractRiotTokens();
    
    if (!tokens || Object.keys(tokens).length === 0) {
      throw new Error('Aucun token trouve dans Riot Client');
    }
    
    console.log('[Tokens] Extraits:', Object.keys(tokens).join(', '));
    
    return {
      success: true,
      tokens: tokens,
      message: `${Object.keys(tokens).length} tokens extraits`
    };
  } catch (error) {
    console.error('[Tokens] Erreur:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('inject-riot-tokens', async (event, { smurfId, tokens }) => {
  try {
    console.log('[Tokens] Injection pour smurf:', smurfId);
    return { success: true, message: 'Tokens sauvegardes' };
  } catch (error) {
    console.error('[Tokens] Erreur injection:', error);
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
