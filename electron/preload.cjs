const { contextBridge, ipcRenderer, clipboard } = require('electron');

// Expose les API Electron au renderer de manière sécurisée
contextBridge.exposeInMainWorld('electronAPI', {
  // === Utils ===
  writeToClipboard: (text) => ipcRenderer.invoke('write-clipboard', text),
  getApiConfig: () => ipcRenderer.invoke('get-api-config'),

  // === Events ===
  onLaunchStatus: (callback) => ipcRenderer.on('launch-status', (event, ...args) => callback(...args)),

  // === Window Controls ===
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),

  // === Session Management ===
  // Sauvegarder la session actuelle pour le smurf
  saveSession: (filename) => {
    return ipcRenderer.invoke('save-session', { filename });
  },

  // Charger la session pour le smurf
  loadSession: (filename, options = {}) => {
    return ipcRenderer.invoke('load-session', { filename, ...options });
  },

  // Mettre à jour le statut de l'overlay depuis le renderer
  updateLaunchStatus: (data) => ipcRenderer.invoke('update-launch-status', data),

  // Lister les sessions sauvegardées
  getSavedSessions: () => {
    return ipcRenderer.invoke('get-saved-sessions');
  },

  // Supprimer la session sauvegardée d'un compte
  deleteSession: (filename) => {
    return ipcRenderer.invoke('delete-session', { filename });
  },

  // Load session but only launch Riot Client (not League) — for save-all flow
  loadSessionRiotOnly: (filename, options = {}) => {
    return ipcRenderer.invoke('load-session-riot-only', { filename, ...options });
  },

  // Launch Riot Client with clean session (for manual login)
  launchRiotOnly: () => {
    return ipcRenderer.invoke('launch-riot-only');
  },

  // Wait for Riot Client to connect
  waitRiotClient: (options = {}) => {
    return ipcRenderer.invoke('wait-riot-client', options);
  },

  // Check if Riot Client is logged in (via lockfile + local API)
  checkRiotLogin: () => {
    return ipcRenderer.invoke('check-riot-login');
  },

  // Poll until Riot Client is logged in (or timeout)
  waitRiotLogin: (options = {}) => {
    return ipcRenderer.invoke('wait-riot-login', options);
  },

  // Abort all long-running Riot operations (loops exit immediately)
  abortRiotOperations: () => {
    return ipcRenderer.invoke('abort-riot-operations');
  },

  // Reset the abort flag (call before starting a new flow)
  resetAbortFlag: () => {
    return ipcRenderer.invoke('reset-abort-flag');
  },

  // Backup current Riot session YAML
  backupRiotSession: () => {
    return ipcRenderer.invoke('backup-riot-session');
  },

  // Restore backed up session and relaunch Riot Client
  restoreRiotSession: () => {
    return ipcRenderer.invoke('restore-riot-session');
  },

  // Réinitialiser Riot Client (Kill + Delete session)
  resetRiotClient: () => {
    return ipcRenderer.invoke('reset-riot-client');
  },

  // Vérifier si on est dans Electron
  isElectron: true,

  // Obtenir l'OS
  platform: process.platform
});

