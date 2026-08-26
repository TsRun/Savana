# Savana — Système de design (éditorial sombre)

Adapté du brand spec NotiChess (`NotiChess/design/mockups-v2/brand-spec.md`) :
même système exactement — direction éditoriale, posture magazine, typographie,
radii, hairlines, interactions — transposé en **variante sombre** avec les
couleurs du logo Savana (encre navy, teal/vert/bleu). Ce fichier est le
contrat : **toute UI doit le respecter.** Les tokens vivent dans
`src/style.css`.

## Direction

Éditorial, sombre, magazine-grade. Sérieux, concentré, élégant par la
structure et non la décoration. Codes print-magazine plutôt que web-app :
hiérarchie impitoyable, mono uppercase comme « mobilier de magazine »,
bordures hairline, un seul flourish par écran.

## Palette — encre navy + accent teal (du logo)

Jamais de noir pur ni de blanc pur. Le « noir » est une encre navy froide,
le « blanc » un papier cassé.

### Surfaces (fond → élevé)
| Token | Valeur | Usage |
|---|---|---|
| `--bg-primary` (canvas) | `#0e1116` | Fond de page |
| `--bg-card` | `#12161d` | Cartes au repos |
| `--bg-secondary` (surface) | `#14181f` | Sidebar, headers, modals |
| `--bg-tertiary` | `#1b212a` | Inputs, contrôles neutres, hovers |
| `--bg-card-hover` | `#1a2029` | Cartes/lignes au hover, tooltips |

### Encre (texte sur sombre)
| Token | Valeur | Usage |
|---|---|---|
| `--text-primary` (papier) | `#f2f4f1` | Titres, valeurs, boutons inversés |
| `--text-secondary` | `#aeb6bd` | Corps de texte |
| `--text-muted` | `#6d7681` | Eyebrows, hints, méta |

### Accent — LA couleur principale du projet
| Token | Valeur | Usage |
|---|---|---|
| `--accent-primary` | `#45c39c` | Teal-vert du logo : actifs, focus, liens |
| `--accent-secondary` | `#2f7cd8` | Bleu du logo : fin du dégradé de marque |
| `--accent-gradient` | teal → bleu 135° | RARE : badges de marque uniquement (LVL, YOU) |
| `--accent-soft` | teal 12 % | Fonds teintés d'éléments actifs |
| `--accent-glow` | teal 35 % | Réservé — pas d'usage décoratif |

L'accent est utilisé **avec parcimonie** : état actif, focus, une donnée clé.
Les CTA n'utilisent PAS l'accent — voir Boutons (inversion encre↔papier).

### Statuts (désaturés, tirés du logo quand possible)
| Token | Valeur | Usage |
|---|---|---|
| `--success` | `#4ec07a` | Vert du logo : succès, session valide, WR ≥ 50 % |
| `--warning` | `#d9a441` | Ambre mat : données 7 j+, session vieille |
| `--error` | `#d16868` | Rouge mat : erreurs, suppression, 14 j+ |
| `--info` | `#3b82d8` | Bleu du logo : information |
| `--gold` | `#d4af6a` | Or mat : excellence (WR ≥ 60 %, KDA ≥ 4) |

Convention pour les fonds teintés d'un statut : fond 10–12 %, bordure 35–40 %,
texte 100 %.

### Bordures — hairlines
| Token | Valeur | Usage |
|---|---|---|
| `--border-subtle` | papier 6 % | Séparateurs, cartes au repos |
| `--border-color` | papier 13 % | Hairline standard : inputs, boutons, tuiles |
| `--border-strong` | papier 24 % | Bordure appuyée, hover de hairline |
| `--border-active` | teal 45 % | Élément sélectionné |

### Rangs LoL
`--rank-*` inchangés + classes `.text-rank-*` (FriendsView) — exception
documentée au monochrome, comme les cases d'échiquier chez NotiChess.

## Typographie — le quatuor Savana

Structure héritée de NotiChess (quatre rôles stricts), mais avec des polices
propres à Savana — ne pas réutiliser celles de NotiChess.

| Rôle | Police | Token |
|---|---|---|
| Display (titres) | **Space Grotesk** (300–700) | `--font-display` |
| Accent (mot italique des titres) | **Instrument Serif** italique | `--font-script` |
| Body (corps) | **Instrument Sans** | `--font-body` |
| Mono (mobilier) | **IBM Plex Mono** | `--font-mono` |

- **Règle headline** : duo `mot display bold + mot accent serif italique` — ex.
  `My <em class="script">Accounts</em>`. Le mot accent est ~1.08× la taille du
  mot display (le serif italique paraît plus petit à corps égal). Un duo par
  écran maximum.
- **Eyebrows mono** : 9–11 px, uppercase, tracking 0.14–0.22 em,
  `--text-muted`. C'est le style de TOUS les labels, sous-titres, compteurs,
  en-têtes de tableau, labels de champ.
- Display : tracking serré (−0.01 à −0.02 em), line-height 0.95–1.1.
- Chiffres et données (LP, KDA, stats) : mono.
- Hiérarchie impitoyable : display 20–32 px côtoie mono 9–11 px — rien entre
  les deux ne rivalise.

## Radii (échelle NotiChess)

`--radius-xs: 3px` · `--radius-sm: 6px` (contrôles, boutons, inputs) ·
`--radius-md: 10px` (tuiles, popovers) · `--radius-lg: 14px` (cartes, modals)
· `--radius-xl: 20px` · `--radius-full` (pills, avatars). Aucun autre rayon.

## Élévation et z-index

Ombres douces réservées aux surfaces flottantes (modals, popovers, toasts) :
`0 28px 70px -24px rgba(0,0,0,0.6)`. Pas de glow coloré, pas d'ombre au repos
sur les cartes. Échelle z-index inchangée (tokens `--z-*`) : sticky 10 →
dropdown 100 → status 150 → titlebar 500 → modal 1000 → dialog 2000 →
toast 4000 → tour 5000.

## États interactifs

- **Transitions** : coupes sèches — 80–160 ms ease-out, background/couleur/
  bordure seulement. Pas de fondu lent, pas de translation > 1 px.
- **Hover** : le hairline se renforce (`--border-color` → `--border-strong`
  ou papier), le fond passe à la surface supérieure. Pas de lift, pas de glow.
- **Focus** : `border-color: var(--accent-primary)` +
  `box-shadow: var(--focus-ring)` (ring inset 1 px, pas de halo).
- **Active** : `translateY(1px)` (pression), pas de scale.
- **Disabled** : `opacity: 0.4`, `cursor: not-allowed`.

## Composants

### Boutons — inversion encre↔papier (règle NotiChess)
Base `.btn` : hauteur 36 px, padding 0 16 px, `--radius-sm`, **mono uppercase
11 px / tracking 0.1 em / 500**.
- `.btn-primary` — **inversé** : fond papier (`--text-primary`), texte encre
  (`--bg-primary`). Hover : papier légèrement éteint. C'est LE bouton d'action.
- `.btn-secondary` / `.btn-ghost` — transparent, hairline `--border-color`,
  texte papier ; hover : bordure papier + fond surface.
- `.btn-danger` — fond `--error`, texte papier.
- `.btn-danger-outline` — hairline `--error`, texte `--error`.
- `.btn-success-soft` — hairline `--success` 40 %, texte `--success`, fond 10 %.

Jamais de dégradé sur un bouton. Un bouton primaire visible par zone.

### Inputs et selects
Hauteur 38–40 px, fond `--bg-tertiary`, hairline `--border-color`,
`--radius-sm`, texte body 13 px. Label au-dessus en **eyebrow mono**. Focus :
bordure accent + ring inset. Placeholders `--text-muted`.

### Modals
Scrim `rgba(9, 11, 14, 0.6)` + `blur(3px)`. Carte : `--bg-secondary`,
bordure `--border-strong`, `--radius-lg`, ombre douce profonde, entrée
`translateY(8px) scale(0.985) → none` en 200 ms. Titre display 16 px,
sous-titre eyebrow mono. ConfirmDialog idem à `--z-dialog`.

### Cartes de compte (SmurfCard)
Fond `--bg-card`, hairline `--border-subtle` ; hover : bordure
`--border-strong`, fond `--bg-card-hover`. Pas de glow, pas de lift.
- Nom du compte : display 600, 20 px, tracking −0.01 em ; tag `#EUW` mono.
- Badge LVL : seule utilisation du `--accent-gradient` (tuile de marque).
- Tier : display 600 ; LP / KDA / stats : mono.
- Labels (WR, GAMES, USER, PASS…) : eyebrow mono 9 px.
- Boutons d'action : tuiles hairline, icône + label mono ; « Load » =
  inversion papier (primaire) ; états session teintés par statut.

### Badges et pills
Eyebrow mono 8.5–9 px 700, pill (`--radius-full`) ou `--radius-xs`, hairline
de la couleur de statut (convention 10/40/100). Badge de marque (YOU) :
`--accent-gradient`, texte encre.

### Toasts
Pill **inversée** : fond papier, texte encre, mono 11 px / tracking 0.06 em,
bottom-center, point de statut coloré à gauche, ombre douce, `--z-toast`.
Entrée : translateY 12 px → 0 en 160 ms.

### Tableaux (FriendsView)
En-têtes : eyebrow mono 9.5 px / 0.18 em, sticky, fond canvas, hairline en
dessous. Lignes : hairline `--border-subtle`, hover `--bg-card-hover`.
Valeurs numériques en mono.

### Titlebar / sidebar
Titlebar : mono 9.5 px uppercase 0.22 em. Nav sidebar : mono uppercase 11 px
/ 0.18 em ; état actif = texte papier + filet accent (pas de pill dégradée).

## Anti-tropes (hérités de NotiChess, adaptés)

- ❌ Couleur hex/rgba en dur hors tokens (exceptions : `.text-rank-*`).
- ❌ Dégradés colorés décoratifs — `--accent-gradient` réservé aux 2 badges
  de marque.
- ❌ Glows, halos, lifts au hover, scale, fondus lents.
- ❌ Emoji dans l'UI ; icône devant chaque titre.
- ❌ `#000` / `#fff` purs.
- ❌ Inter/Roboto en display — body uniquement.
- ❌ `confirm()` / `alert()` natifs → ConfirmDialog.
- ❌ Redéfinir `.btn`, `.select-input`, modals, toasts dans un composant.
- ❌ z-index en dur, nouveau rayon hors échelle, second style de focus.
