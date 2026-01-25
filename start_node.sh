#!/bin/bash

echo "🧹 Nettoyage des processus existants..."
pkill -f "node.*server.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1

echo "📦 Installation des dépendances Node.js..."
cd "$(dirname "$0")/frontend"
npm install

echo ""
echo "� Initialisation de la base de données..."
npm run init-db

echo ""
echo "�🚀 Démarrage du serveur fullstack..."
echo "   - Backend Node.js : http://localhost:3000"
echo "   - Frontend Vite   : http://localhost:5173"
echo ""

npm run dev:fullstack
