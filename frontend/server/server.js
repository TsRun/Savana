import express from 'express';
import passport from './config/passport-config.js';
import session from 'express-session';
import cors from 'cors';
import { config } from './config.js';
import { initDb } from './models/database.js';
import authRoutes from './routes/auth.js';
import smurfsRoutes from './routes/smurfs.js';
import preferencesRoutes from './routes/preferences.js';
import tokensRoutes from './routes/tokens.js';
import riotClientRoutes from './routes/riotClient.js';

const app = express();

// Initialiser la base de données
initDb();

// Middleware
app.use(express.json());

// CORS - permettre les cookies
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174'
  ],
  credentials: true
}));



// Sessions
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: false,
    secure: false,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Sessions (already defined above)
// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/smurfs', smurfsRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/tokens', tokensRoutes);
app.use('/api/riot-client', riotClientRoutes);

// Route /api/refresh (non nested)
import { refreshSmurfs } from './routes/smurfs.js';
app.post('/api/refresh', refreshSmurfs);

// Route de test
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Démarrer le serveur
const PORT = config.port;
const server = app.listen(PORT, 'localhost', () => {
  console.log(`\n[SERVER] Backend Node.js demarre sur http://localhost:${PORT}`);
  console.log(`[DB] Base de donnees: ${config.dbPath}`);
  console.log(`[API] Riot API Key: ${config.riotApiKey ? 'Configuree [OK]' : 'Manquante [!]'}\n`);
});

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

  server.close(() => {
    clearTimeout(forceExitTimeout);
    console.log('[SERVER] Serveur HTTP fermé.');

    // Close database connection
    try {
      const { closeDb } = require('./models/database.js');
      closeDb();
    } catch (e) {
      // DB module might already be closed or not imported
    }

    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
