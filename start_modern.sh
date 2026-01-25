#!/bin/bash

# Smurf Manager 2.0 - Start Script
# Démarre l'application en mode fullstack (backend + frontend)

echo "🚀 Smurf Manager 2.0 - Starting..."
echo ""

cd "$(dirname "$0")/frontend"

# Vérifier que les dépendances sont installées
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo ""
echo "🎮 Starting Smurf Manager..."
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:3000"
echo ""

# Lancer le fullstack
npm run dev:fullstack
