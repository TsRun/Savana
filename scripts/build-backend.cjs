const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function build() {
    console.log('📦 Bundling backend with esbuild...');

    if (!fs.existsSync('backend-dist')) {
        fs.mkdirSync('backend-dist');
    }

    try {
        await esbuild.build({
            entryPoints: ['server/server.js'],
            bundle: true,
            platform: 'node',
            target: 'node18',
            outfile: 'backend-dist/server.mjs',
            external: ['electron', 'better-sqlite3'],
            format: 'esm',
            banner: {
                js: `
import { createRequire as topLevelCreateRequire } from "module";
import { fileURLToPath as topLevelFileURLToPath } from "url";
import { dirname as topLevelDirname } from "path";
const require = topLevelCreateRequire(import.meta.url);
const __filename = topLevelFileURLToPath(import.meta.url);
const __dirname = topLevelDirname(__filename);
        `,
            },
        });
        console.log('✅ Bundle created at backend-dist/server.mjs');
    } catch (e) {
        console.error('Bundle failed:', e);
        process.exit(1);
    }

    try {
        const wasmSource = path.join('node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
        const wasmDest = path.join('backend-dist', 'sql-wasm.wasm');
        fs.copyFileSync(wasmSource, wasmDest);
        console.log('✅ Copied sql-wasm.wasm');
    } catch (e) {
        console.warn('⚠️ Could not copy sql-wasm.wasm:', e.message);
    }
}

build();
