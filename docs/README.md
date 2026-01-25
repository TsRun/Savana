# Savana

**Savana** est une application desktop moderne pour gérer et suivre vos comptes League of Legends avec statistiques automatiques via l'API Riot.

![Electron](https://img.shields.io/badge/Electron-47848F?style=flat&logo=electron&logoColor=white)
![Vue.js](https://img.shields.io/badge/Vue.js-4FC08D?style=flat&logo=vue.js&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)

## Fonctionnalités

- **Multi-comptes** : Gérez tous vos comptes LoL en un seul endroit
- **Stats automatiques** : Ranks, KDA, Winrate, Champions préférés
- **Filtres avancés** : 30 jours / Saison, Ranked / All games
- **Interface moderne** : Design sombre, animations fluides
- **Cross-platform** : Windows, Linux, macOS

## Installation

### Prérequis

- Node.js 18+
- Clé API Riot Games ([developer.riotgames.com](https://developer.riotgames.com))

### Démarrage rapide

```bash
# Cloner le repo
git clone https://github.com/TsRun/Savana.git
cd Savana

# Configurer l'environnement
cp .env.example .env
# Éditer .env avec votre clé API Riot

# Installer les dépendances
cd frontend
npm install

# Lancer l'application
npm run start
```

## Scripts disponibles

| Commande | Description |
|----------|-------------|
| `npm run start` | Lance l'app Electron complète |
| `npm run dev:fullstack` | Lance backend + frontend (sans Electron) |
| `npm run dev` | Frontend uniquement (Vite) |
| `npm run server` | Backend uniquement (Node.js) |
| `npm run electron:build` | Build pour production |

## Stack technique

- **Frontend** : Vue.js 3 + Vite
- **Backend** : Node.js + Express
- **Database** : SQLite (better-sqlite3)
- **Desktop** : Electron
- **API** : Riot Games API
- **Style** : Tailwind CSS

## Configuration

Créer un fichier `.env` à la racine du projet :

```env
RIOT_API_KEY=RGAPI-votre-cle-ici
SECRET_KEY=votre-secret-session
```

## Structure du projet

```
Savana/
├── frontend/
│   ├── src/           # Vue.js components
│   ├── server/        # Express backend
│   ├── electron/      # Electron main process
│   └── public/        # Assets statiques
├── .env               # Configuration (non versionné)
└── README.md
```

## Licence

MIT License - Voir [LICENSE](LICENSE)

---

**Développé par TsRun**
