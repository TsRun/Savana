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

  // === Riot Client ===
  // Lancer le Riot Client avec auto-login
  launchRiotClient: (username, password) => {
    return ipcRenderer.invoke('launch-riot-client', { username, password });
  },

  // Instant login avec tokens (sans mot de passe)
  instantLogin: (tokens) => {
    return ipcRenderer.invoke('instant-login', { tokens });
  },

  // Extraire automatiquement les tokens depuis Riot Client
  extractRiotTokens: () => {
    return ipcRenderer.invoke('extract-riot-tokens');
  },

  // Injecter des tokens Riot
  injectRiotTokens: (smurfId, tokens) => {
    return ipcRenderer.invoke('inject-riot-tokens', { smurfId, tokens });
  },

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

  // Réinitialiser Riot Client (Kill + Delete session)
  resetRiotClient: () => {
    return ipcRenderer.invoke('reset-riot-client');
  },

  // Vérifier si on est dans Electron
  isElectron: true,

  // Obtenir l'OS
  platform: process.platform
});

