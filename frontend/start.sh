#!/bin/bash
# Smurf Manager - Script de lancement

cd "$(dirname "$0")"

# Tuer les processus existants
pkill -f "node server" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "electron" 2>/dev/null

echo "[START] Lancement de Smurf Manager..."

# Lancer tout
npm run start
