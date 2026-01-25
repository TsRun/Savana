import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger .env depuis la racine du projet
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  port: process.env.PORT || 3000,
  riotApiKey: process.env.RIOT_API_KEY,
  regionHost: 'euw1.api.riotgames.com',
  routingValue: 'europe',
  sessionSecret: process.env.SECRET_KEY || 'dev-secret-key-change-in-production',
  dbPath: path.join(__dirname, '../smurfs.db'), // Dans frontend/
  matchHistoryCount: 100
};
