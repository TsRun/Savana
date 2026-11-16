# Décisions produit

## 2026-11-15 : police de l'interface

- **Question** : par quelle police remplacer Inter, jugée pas satisfaisante (un essai Space Grotesk / Instrument Serif / Instrument Sans / IBM Plex Mono avait déjà été abandonné au profit d'Inter).
- **Options envisagées** :
  - Geist : sans-serif nette et technique, plus de caractère qu'Inter, chiffres bien alignés.
  - Manrope : plus ronde et chaleureuse, très lisible en petit, rendu moins technique.
  - Chakra Petch pour les titres et pseudos, Geist pour le texte : rendu le plus « esport ».
- **Choix** : Geist partout, une seule famille.
- **Pourquoi** : l'utilisateur garde une interface sobre et lisible comme avec Inter, avec plus de personnalité, et des LP / winrates qui s'alignent en colonne (chiffres tabulaires). La police est embarquée dans l'app : elle s'affiche aussi hors ligne, sans dépendre de Google Fonts.

## 2026-11-15 : rangement et protection des sessions Riot sauvegardées

- **Question** : les sessions Riot (jetons de connexion) étaient rangées d'après le pseudo et stockées en clair. Un changement de Riot ID détachait la session du compte, et deux pseudos proches pouvaient partager le même dossier, donc charger le mauvais compte.
- **Options envisagées** : garder le pseudo comme nom ; utiliser l'id du compte ; utiliser une clé aléatoire propre au compte. Pour le chiffrement : rien, ou le coffre Windows (DPAPI).
- **Choix** : clé aléatoire par compte (l'id ne suffit pas, car en dev la base diffère mais le dossier de sessions est le même), sessions chiffrées avec DPAPI. Les anciens dossiers sont migrés et chiffrés automatiquement au premier lancement de la nouvelle version.
- **Effets pour l'utilisateur** : renommer un compte ne lui fait plus perdre sa session ; supprimer un compte supprime aussi sa session ; ajouter deux fois le même compte est refusé. Contrepartie : les sessions ne sont lisibles que depuis la même session Windows (il faudra les ressauvegarder après une réinstallation de Windows).

## 2026-11-15 : protection de la clé de chiffrement et des données de comptes

- **Question** : la clé qui chiffre les identifiants (`.savana_key`) était en clair à côté de la base, et la base était réécrite sans protection contre un crash.
- **Options envisagées** : laisser la clé en clair ; la sceller avec le coffre Windows (DPAPI). Pour la base : écriture directe ou écriture atomique.
- **Choix** : clé scellée par DPAPI dans l'app installée (`.savana_key.sealed`, l'ancienne clé en clair est supprimée après vérification) ; écriture atomique de `smurfs.db` ; suppression des colonnes et de la route `/api/tokens` qui ne servaient plus.
- **Effets pour l'utilisateur** : copier le dossier `%AppData%/Savana` ne suffit plus à lire les mots de passe, et un crash pendant une sauvegarde ne corrompt plus la base. Contrepartie : après une réinstallation de Windows, les mots de passe ne sont récupérables que via un export fait avant.

## 2026-11-15 : clé API Riot chiffrée sur disque

- **Question** : la clé API Riot saisie dans l'app (`.riot_api_key`) restait en clair dans `%AppData%/Savana`.
- **Choix** : la chiffrer avec la clé de la base, elle-même scellée par DPAPI. L'ancienne clé en clair est rechiffrée automatiquement au premier lancement.
- **Effets pour l'utilisateur** : rien ne change à l'usage. Après une réinstallation de Windows, il faudra ressaisir la clé API.

## 2026-11-15 : export protégé par mot de passe

- **Question** : l'export JSON contenait les identifiants Riot de tous les comptes en clair.
- **Options envisagées** : export en clair ; export sans identifiants ; identifiants chiffrés avec un mot de passe choisi à l'export.
- **Choix** : mot de passe obligatoire à l'export (saisi deux fois), redemandé à l'import, avec une nouvelle tentative possible en cas d'erreur. Le reste du fichier (rangs, stats, amis, préférences) reste lisible. Les anciens exports sans mot de passe s'importent toujours.
- **Effets pour l'utilisateur** : un fichier d'export perdu ou partagé ne révèle plus les identifiants, et il reste utilisable sur une autre machine ou après une réinstallation de Windows. Contrepartie : un mot de passe oublié rend le fichier inimportable.

## 2026-11-15 : découpage des données Riot (rang, stats par mode, cache des parties)

- **Question** : les stats étaient découpées par période (toujours « 30 jours » en dur) et par queue, avec un filtre « All » qui mélangeait ARAM, Arena et normales, un plafond de 20 parties qui faisait de « 30 jours » en réalité « 20 dernières parties », et un modèle différent pour les amis. Chaque actualisation retéléchargeait les mêmes parties.
- **Besoin exprimé** : voir le rang, et des infos propres au mode choisi, sans mélange.
- **Options envisagées** :
  - Rang + KDA / rôle / champions du mode choisi, calculés sur ses dernières parties, avec un cache des parties.
  - Rang seul : une requête par compte, mais plus de KDA, de rôle ni de champions.
  - Rang + plus de modes (ARAM, Arena, normales), chacun avec ses stats.
- **Choix** : rang + KDA / rôle / champions du mode choisi. Le filtre ne propose plus que SoloQ et Flex ; la notion de période disparaît ; les stats portent sur les 20 dernières parties du mode (indiqué au survol de la carte). Les deux modes sont calculés à chaque actualisation, donc changer de filtre est instantané. Les amis suivent exactement le même modèle (mémoire du rang, Riot ID suivi, winrate de la saison comme sur les cartes de comptes).
- **Effets pour l'utilisateur** : plus de chiffres mélangés entre modes ; une actualisation de 10 comptes passe d'environ 5 minutes à environ 1 minute, car seules les nouvelles parties sont téléchargées ; une erreur de l'API (clé expirée) n'efface plus ni le rang ni les stats. Contrepartie : la première actualisation après la mise à jour télécharge jusqu'à 40 parties par compte (quelques minutes), et les stats ARAM / Arena / normales ne sont plus disponibles.

## 2026-11-16 : Ctrl+U / Ctrl+P hors focus

- **Question** : pendant la connexion manuelle, le focus est sur le Riot Client, donc les raccourcis de copie de l'username et du mot de passe ne marchaient pas sans revenir cliquer dans Savana.
- **Options envisagées** : raccourcis globaux en permanence ; raccourcis globaux seulement pendant que le dialogue d'identifiants est ouvert ; autre combinaison de touches (Ctrl+Alt+U...).
- **Choix** : Ctrl+U / Ctrl+P globaux, actifs uniquement tant que le dialogue d'identifiants est ouvert.
- **Pourquoi** : l'utilisateur garde les mêmes touches qu'il connaît, utilisables depuis le Riot Client. Le reste du temps, Ctrl+P (imprimer) et Ctrl+U restent libres pour les autres applications.
