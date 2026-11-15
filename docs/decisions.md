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
