import express from 'express';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import cors from 'cors';
import { config } from './config.js';
import { initDb } from './models/database.js';
import authRoutes from './routes/auth.js';
import smurfsRoutes from './routes/smurfs.js';
import preferencesRoutes from './routes/preferences.js';
import tokensRoutes from './routes/tokens.js';
import riotClientRoutes from './routes/riotClient.js';
import friendsRoutes from './routes/friends.js';
import path from 'path';
import { fileURLToPath } from 'url';

const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = path.dirname(currentFilename);

const app = express();

// Middleware
app.use(express.json());

// CORS - permettre les cookies
app.use(cors({
  origin: true, // Reflète l'origine de la requête (permet file:// et autres)
  credentials: true
}));
// Session Debugging Middleware
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  console.log('  - Cookie:', req.headers.cookie ? 'Present' : 'Missing');
  console.log('  - SessionID:', req.sessionID);
  console.log('  - User:', req.session ? req.session.userId : 'No Session');
  next();
});

// File-based Session Store for persistence across restarts
const FileStore = FileStoreFactory(session);
const sessionsPath = path.join(currentDirname, '../sessions');

app.use(session({
  store: new FileStore({
    path: sessionsPath,
    ttl: 7 * 24 * 60 * 60, // 7 days in seconds
    retries: 0,
    logFn: () => { } // Silence logs
  }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: false,
    secure: false,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Routes
// Routes
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/smurfs', smurfsRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/tokens', tokensRoutes);
app.use('/api/riot-client', riotClientRoutes);
app.use('/api/friends', friendsRoutes);

// Servir le Frontend en Production (Unified Server)

if (process.env.ELECTRON_MODE) {
  // En prod (packagé): le backend est dans resources/backend/, le frontend dans resources/frontend/
  // En dev: jamais utilisé (Vite sert le frontend)
  const frontendPath = path.join(currentDirname, '../frontend');
  console.log('[SERVER] Static Frontend Path:', frontendPath);

  if (config.port) { // Basic check, but valid: process.env.ELECTRON_MODE is set
    app.use(express.static(frontendPath));
    // Fallback SPA (doit être après les routes API)
    app.get('*', (req, res) => {
      if (req.url.startsWith('/api')) return res.status(404).json({ error: 'Not Found' });
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }
}

// Route /api/refresh (non nested)
import { refreshSmurfs } from './routes/smurfs.js';
app.post('/api/refresh', refreshSmurfs);

// Route de test
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Démarrer le serveur après initialisation de la base de données
async function startServer() {
  // Initialiser la base de données (async avec sql.js)
  await initDb();

  const PORT = process.env.ELECTRON_MODE ? 0 : (config.port || 3000);
  const server = app.listen(PORT, 'localhost', () => {
    const assignedPort = server.address().port;
    console.log(`\n[SERVER] Backend Node.js demarre sur http://localhost:${assignedPort}`);
    if (process.send) {
      process.send({ type: 'PORT', port: assignedPort });
    }
    console.log(`[DB] Base de donnees: ${config.dbPath}`);
    console.log(`[API] Riot API Key: ${config.riotApiKey ? 'Configuree [OK]' : 'Manquante [!]'}\n`);
  });

  return server;
}

// Démarrer le serveur
const serverPromise = startServer();
let server = null;
serverPromise.then(s => { server = s; });

// Graceful Shutdown
let isShuttingDown = false;

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('\n[SERVER] Arrêt en cours...');

  // Force exit after 3 seconds if server.close() hangs
  const forceExitTimeout = setTimeout(() => {
    console.log('[SERVER] Force exit (timeout)');
    process.exit(0);
  }, 3000);

  if (server) {
    server.close(() => {
      clearTimeout(forceExitTimeout);
      console.log('[SERVER] Serveur HTTP fermé.');
      process.exit(0);
    });
  } else {
    clearTimeout(forceExitTimeout);
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
