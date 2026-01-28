
import { initDb, resetAllSmurfData, closeDb } from '../models/database.js';

async function run() {
    console.log('--- Cleaning up Ranks ---');
    await initDb();
    resetAllSmurfData();
    closeDb();
    console.log('--- Done ---');
}

run();
