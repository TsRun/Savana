// Script to wait for servers and launch Electron
import { spawn } from 'child_process';

const VITE_URL = 'http://localhost:5173';
const SERVER_URL = 'http://localhost:3000';
const TIMEOUT = 60000;
const CHECK_INTERVAL = 500;

async function checkUrl(url) {
    try {
        const response = await fetch(url);
        return response.ok || response.status < 500;
    } catch {
        return false;
    }
}

async function waitForServers() {
    const startTime = Date.now();
    console.log('[Wait] Waiting for servers...');

    while (Date.now() - startTime < TIMEOUT) {
        const [viteOk, serverOk] = await Promise.all([
            checkUrl(VITE_URL),
            checkUrl(SERVER_URL + '/api/health')
        ]);

        if (viteOk && serverOk) {
            console.log('[Wait] Servers ready!');
            return true;
        }
        if ((Date.now() - startTime) % 2000 < CHECK_INTERVAL * 2) {
            console.log(`[Wait] Vite: ${viteOk ? 'OK' : 'Waiting...'}, Server: ${serverOk ? 'OK' : 'Waiting...'}`);
        }

        await new Promise(r => setTimeout(r, CHECK_INTERVAL));
    }

    console.log('[Wait] Timeout waiting for servers');
    return false;
}

async function main() {
    const ready = await waitForServers();

    if (ready) {
        console.log('[Wait] Launching Electron...');
        const electron = spawn('npx', ['electron', '.'], {
            stdio: 'inherit',
            shell: true,
            env: {
                ...process.env,
                SKIP_BACKEND_SERVER: '1',
                NODE_ENV: 'development'
            }
        });

        electron.on('close', (code) => {
            process.exit(code || 0);
        });
    } else {
        process.exit(1);
    }
}

main();
