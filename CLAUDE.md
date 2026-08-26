# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Savana

Savana is a desktop League of Legends account manager built with Electron + Vue 3 + Express + SQLite. It enables 1-click account switching via Riot Client session injection, tracks ranked stats via Riot API, and stores credentials locally.

## Commands

```bash
npm run electron:dev     # Main dev command: starts backend (3000) + Vite (5173) + Electron
npm run server           # Backend only
npm run dev              # Vite frontend only
npm run electron:build   # Full production build: esbuild backend + vite build + electron-builder
npm run build            # Vite build only (outputs to dist/)
npm run build:backend    # Bundle server with esbuild (outputs to backend-dist/)
```

## Architecture

Three processes work together:

1. **Electron main** (`electron/main.cjs`) -- Forks the backend as a child process, creates a frameless BrowserWindow, handles IPC for window controls, clipboard, and all Riot Client operations (session save/load/delete, credential injection).

2. **Express backend** (`server/server.js`) -- Runs on port 3000 (dev) or a dynamic port (prod). Uses sql.js for SQLite with file persistence. In production, sends its port to Electron via `process.send({ type: 'PORT', port })` and serves the Vue frontend as static files. Routes: `auth`, `smurfs`, `friends`, `preferences`, `tokens`, `riotClient`.

3. **Vue 3 frontend** (`src/`) -- Served by Vite in dev (port 5173, proxies `/api` to backend) or by Express in production. Uses `src/composables/useApi.js` to resolve the API base URL: if loaded over HTTP it uses relative `/api`, otherwise fetches the port from Electron IPC.

### Data flow

- Frontend calls `/api/*` endpoints
- Backend queries Riot API (rate-limited at 1.25s/request in `server/utils/riotApi.js`) and persists to SQLite
- Smurf rank/stat updates are processed via a FIFO scheduler queue in `server/routes/smurfs.js`
- Riot Client sessions are YAML files (`RiotGamesPrivateSettings.yaml`) saved to `{userData}/sessions/{pseudo}/`

### IPC bridge

`electron/preload.cjs` exposes `window.electronAPI` with: window controls, clipboard, session management (save/load/delete/getSavedSessions), resetRiotClient, getApiConfig, and a `launch-status` event listener for loading overlays.

## Database

SQLite via sql.js (`server/models/database.js`). Tables:
- `users` -- id, username, password_hash
- `smurfs` -- puuid, pseudo, username, password, soloq/flex rank fields, stats_json, session_saved_at, level
- `user_preferences` -- stats_period (30/season), stats_queue (soloq/flex/all), tour_completed
- `friends` -- puuid, pseudo, stats_json, last_updated

Migrations are inline in `initDb()`. The DB file lives at project root (`smurfs.db`) in dev, `%AppData%/Savana/smurfs.db` in production.

## Environment

Requires a `.env` file (see `.env.example`):
- `RIOT_API_KEY` -- Riot Games developer API key
- `SECRET_KEY` -- Express session secret
- `ENV` -- `development` or `production`

## Design system

L'UI suit le système de design documenté dans `docs/DESIGN.md` (tokens dans `src/style.css`). Toute modification visuelle doit le respecter : pas de couleurs/z-index en dur, styles partagés (`.btn`, `.select-input`, modals, toasts) dans `style.css` uniquement, un seul style de focus (`--focus-ring`).

## Key patterns

- **Rank memory**: If Riot API returns unranked but DB has a previous rank, the old rank is kept and displayed as "Last Season"
- **PUUID correction**: If API returns 404, the app re-resolves PUUID from Riot ID and updates the DB
- **Session age tracking**: `session_saved_at` column tracks when a Riot session was saved; UI warns if >7 days old
- **Stats caching**: Stats are stored per combination key (`stats_{period}_{queue}`) in `stats_json` JSON column
- **Frameless window**: Custom titlebar is rendered in Vue (`src/App.vue`), window controls go through IPC

## Build output

- `dist/` -- Vite frontend build
- `backend-dist/` -- esbuild backend bundle (ESM, server.mjs)
- `release/` -- Electron Builder output (NSIS installer)

Production bundles `backend-dist`, `dist`, and `.env` as extraResources.
