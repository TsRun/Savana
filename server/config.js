import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// Charger .env depuis la racine du projet
const isProd = process.env.ELECTRON_MODE === 'true';
const envPath = isProd
  ? path.join(_dirname, '../.env') // resources/.env (backend is in resources/backend)
  : path.join(_dirname, '../.env'); // project root/.env

console.log('[CONFIG] Loading .env from:', envPath);
console.log('[CONFIG] Current working directory:', process.cwd());
import fs from 'fs';
if (fs.existsSync(envPath)) {
  console.log('[CONFIG] .env file FOUND');
} else {
  console.log('[CONFIG] .env file NOT FOUND');
}

dotenv.config({ path: envPath });

export const config = {
  port: process.env.PORT || 3000,
  riotApiKey: process.env.RIOT_API_KEY,
  regionHost: 'euw1.api.riotgames.com',
  routingValue: 'europe',
  sessionSecret: process.env.SECRET_KEY || 'dev-secret-key-change-in-production',
  dbPath: process.env.USER_DATA_PATH
    ? path.join(process.env.USER_DATA_PATH, 'smurfs.db')
    : path.join(_dirname, '../smurfs.db'),
  matchHistoryCount: 100
};
