# Savana - League of Legends Account Manager

Savana is a modern, secure, and efficient desktop application for managing multiple League of Legends accounts. It allows instant switching between accounts (smurfs) without entering passwords, tracks ranked statistics, and manages Riot Client sessions seamlessly.

## 🚀 Features

*   **Instant Login**: Switch accounts in 1 click (Session Injection + Riot Client automation).
*   **Session Persistence**: Sessions are saved by Account Name (Pseudo) locally. First launch requires password, subsequent launches are automatic.
*   **Rank Tracking**: 
    *   Automatic fetching of SoloQ/Flex ranks via Riot API.
    *   **"Last Season" Memory**: If an account is currently Unranked, Savana remembers and displays its last known rank from the database.
    *   No more "Estimated" fake ranks.
*   **Secure Storage**: Credentials and sessions are stored locally on your machine.
*   **Unified Architecture**: A single Express backend serves the Vue frontend, packaged neatly within Electron.
*   **Production Ready**: DevTools disabled in production, auto-updates supported.

## 🛠 Tech Stack

*   **Frontend**: Vue 3 + Vite + TailwindCSS
*   **Backend**: Node.js (Express) + SQLite (sql.js)
*   **Desktop**: Electron (with secure Preload scripts)
*   **Build**: Electron Builder

## 📦 Installation & Setup

### Prerequisites
*   Node.js (v18+)
*   npm

### Development

1.  **Install dependencies**:
    ```bash
    cd frontend
    npm install
    ```

2.  **Environment Variables**:
    Create a `.env` file in the root (or `frontend/.env`) with:
    ```env
    RIOT_API_KEY=RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    SECRET_KEY=your-secret-key
    ```

3.  **Run in Dev Mode**:
    ```bash
    npm run electron:dev
    ```
    This launches the backend, frontend (Vite), and Electron window with Hot Module Replacement.

### Production Build

To create the `.exe` installer:

```bash
cd frontend
npm run electron:build
```
The output file (`Savana Setup 2.0.0.exe`) will be in `frontend/release`.

## 📂 Project Structure

*   `frontend/src`: Vue frontend code.
*   `frontend/server`: Express backend code (API, Database, Riot Utils).
*   `frontend/electron`: Electron main and preload scripts.
*   `frontend/release`: Output directory for builds.

## 🧹 Maintenance

*   **Reset Ranks**: To wipe all local rank data (set everyone to Unranked):
    ```bash
    node frontend/server/scripts/cleanup_ranks.js
    ```
*   **Clean Build**: Delete `dist`, `release`, and `backend-dist` folders.

## 📝 Notes

*   **Sessions**: Stored in `%AppData%\Savana\sessions`.
*   **Database**: Stored in `%AppData%\Savana\smurfs.db` (Production) or local folder (Dev).
