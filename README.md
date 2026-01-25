# Smurf Manager - League of Legends

Application pour gérer et suivre plusieurs comptes LoL (smurfs) avec statistiques automatiques via l'API Riot.

## 🚀 Démarrage Rapide

```bash
chmod +x start_node.sh
./start_node.sh
```

Puis ouvrir : **http://localhost:5173**

Login par défaut : `admin` / `admin123`

## 📁 Structure

```
├── frontend/
│   ├── server/              # Backend Node.js/Express
│   │   ├── config.js        # Configuration
│   │   ├── server.js        # Serveur principal
│   │   ├── models/          # Database SQLite
│   │   ├── routes/          # API routes (auth, smurfs, etc.)
│   │   └── utils/           # Riot API calls
│   ├── src/                 # Frontend Vue.js
│   └── package.json
├── .env                     # Variables d'environnement
└── Smurfs.json              # Backup JSON (optionnel)
```

## 🛠️ Stack Technique

- **Frontend** : Vue.js 3 + Vite
- **Backend** : Node.js + Express
- **Database** : SQLite (better-sqlite3)
- **API** : Riot Games API (EUW1)
- **Sessions** : express-session

## ⚙️ Configuration

Créer/modifier `.env` à la racine :

```env
RIOT_API_KEY=RGAPI-votre-clé-ici
SECRET_KEY=votre-secret-session
PORT=3000
```

## 📦 Installation Manuelle

```bash
cd frontend
npm install
```

## 🎮 Scripts Disponibles

```bash
npm run dev           # Frontend uniquement (Vite)
npm run server        # Backend uniquement (Node.js)
npm run dev:fullstack # Frontend + Backend ensemble
```

## 🔑 Fonctionnalités

- ✅ Multi-utilisateurs avec authentification
- ✅ Gestion de plusieurs smurfs par utilisateur
- ✅ Mise à jour automatique des ranks (SoloQ/Flex)
- ✅ Statistiques de jeu (KDA, Winrate, Champions)
- ✅ Filtres : 30 jours / Saison complète
- ✅ Filtres : Ranked uniquement / Tous les modes
- ✅ Stockage persistant en SQLite

## 🌐 Endpoints API

- `POST /api/auth/register` - Inscription
- `POST /api/auth/login` - Connexion
- `POST /api/auth/logout` - Déconnexion
- `GET /api/auth/me` - Utilisateur actuel
- `GET /api/smurfs` - Liste des smurfs
- `POST /api/smurfs` - Ajouter un smurf
- `DELETE /api/smurfs/:id` - Supprimer un smurf
- `POST /api/smurfs/refresh` - Actualiser les données
- `PUT /api/preferences` - Mettre à jour les préférences

## 📊 Base de Données

**Tables** :
- `users` - Utilisateurs avec mots de passe hashés (SHA256)
- `smurfs` - Comptes LoL liés aux utilisateurs
- `user_preferences` - Filtres sauvegardés (période, queue)

**Localisation** : `frontend/smurfs.db`

## 🔧 Développement

Le frontend utilise un **proxy Vite** pour `/api` → `http://localhost:3000`, évitant les problèmes CORS.

Configuration dans `vite.config.js` :
```javascript
server: {
  proxy: {
    '/api': 'http://localhost:3000'
  }
}
```

## 📝 Notes

- La clé API Riot doit être renouvelée toutes les 24h (mode développement)
- Les données sont mises à jour à la demande via le bouton "Actualiser"
- La base SQLite se crée automatiquement au premier lancement

## 🐛 Dépannage

**Backend ne démarre pas** :
```bash
cd frontend
npm install
node server/server.js
```

**Frontend ne démarre pas** :
```bash
cd frontend
npm run dev
```

**Erreur API Riot** :
- Vérifier que `RIOT_API_KEY` est dans `.env`
- Vérifier que la clé n'a pas expiré
- Vérifier les logs : console backend

---

**Développé avec** ❤️ pour les joueurs de League of Legends
