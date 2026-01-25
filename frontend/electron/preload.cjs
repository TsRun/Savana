const { contextBridge, ipcRenderer } = require('electron');

// Expose les API Electron au renderer de manière sécurisée
contextBridge.exposeInMainWorld('electronAPI', {
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
  
  // Vérifier si on est dans Electron
  isElectron: true,
  
  // Obtenir l'OS
  platform: process.platform
});
