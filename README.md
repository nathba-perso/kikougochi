# Kikougochi

Petit jeu façon tamagotchi : on fait grandir un bébé guépard (le kikou) en pixel art, en 3 à 4 semaines.
Application web installable (PWA) pour iPhone et Android, sans store, qui fonctionne hors ligne.

## Lancer

```bash
npm install
npm run dev        # serveur de développement (ajouter ?debug à l'URL pour le panneau de test)
npm run build      # build de production dans dist/
npm run simulate   # vérifie l'équilibrage du moteur (200 parties par profil de joueur)
```

## Organisation

| Dossier | Rôle |
|---|---|
| `src/engine/` | Moteur : variables cachées, pas de 5 min, rattrapage hors ligne, actions, rêves. Port fidèle de `regles/simulation.py` ; constantes dans `params.ts`. |
| `src/render/` | Scène canvas 48×40 agrandie sans lissage, planches de sprites, séquences (actions, réactions, arrivée, évolution, départ). |
| `src/main.ts` | Boucle de jeu, sauvegarde, écrans (victoire, départ, rêve, album, code de sauvegarde, installation). |
| `public/sprites/` | Planches PNG + `manifest.json`, générées par `tools/import_sheets.py` depuis les fichiers du fil visuels (`kikou/kikou.py`, `kikou/etats.py`). |
| `public/reves/` | Images des rêves. Remplacer par de vraies photos de bébés guépards et lister leurs noms dans `reves.json`. |
| `tools/` | Scripts Python : import des sprites, accessoires, icônes et rêves provisoires. |

## Mettre à jour les sprites

```bash
python3 tools/import_sheets.py /chemin/vers/kikou   # planches d'états et de réactions
python3 tools/make_sprites.py                       # sprites de base + accessoires
python3 tools/make_assets.py                        # icônes de l'app + rêves provisoires
```

## Soins et propreté

| Action | Rôle |
|---|---|
| Nourrir | Remplit la satiété. 2 à 4 h après chaque repas, le kikou fait un caca (seulement réveillé, 3 au plus). |
| Pip | Jouer : bonheur, mais ça l'**excite** et le fatigue un peu. Trop excité, il ne s'endort pas et s'agace. Réaction : étoiles. |
| Câlin | Calmer : fait baisser la colère et l'excitation, peut l'endormir le soir, marche même quand il est fâché. Réaction : il se blottit. |
| Bisou | Aimer : bonheur, et il pardonne un peu (la rancune baisse). 3 par jour au plus, ensuite « beurk ». Réaction : il rend le bisou. |
| Nettoyer | Enlève les cacas (ne le réveille pas). Tant qu'il en reste, il perd du bonheur et s'agace doucement. |

### Envies

De temps en temps (3,5 s toutes les 12 s), une bulle au-dessus du kikou montre le soin qu'il veut (`envie` dans
`src/engine/kikou.ts`) :

| Bulle | Quand |
|---|---|
| Cœur (câlin) | Excitation ≥ 55, agacement ≥ 30, ou dans l'heure avant de dormir (sans câlin depuis 1 h) |
| Lèvres (bisou) | Il boude (rancune), vient de se réveiller, ou le joueur revient après plus de 6 h ; pas après 3 bisous dans la journée |
| Balle (pip) | En forme (énergie ≥ 50), calme (excitation < 35), pas joué depuis 3 h, pas juste avant de dormir |

Le bon soin donne ×1,5 de bonheur et la réaction « C'est exactement ce qu'il voulait ! ». Un autre soin pendant
une envie ne donne que la moitié, l'agace un peu et répond « Bof… ». Le rendement décroissant est commun à pip,
câlin et bisou : appuyer sur les trois à l'aveugle rapporte autant qu'un seul soin bien choisi. Pas de bulle :
effet normal.

L'excitation (X) est une variable cachée qui revient seule vers 20 quand il est réveillé et tombe pendant le sommeil.

## Mode test

Ajouter `?debug` à l'URL : affiche les variables cachées et permet d'avancer le temps (+1 h, +6 h, +1 j, +5 j).
Le décalage est mémorisé dans le navigateur ; « heure réelle » le remet à zéro.

## Cartes postales

Menu › Cartes postales : le joueur choisit un pseudo, un décor et une phrase, et le jeu partage une image de
la carte avec un lien `…#carte=<code>` (partage natif du téléphone, sinon lien copié). Il n'y a pas de serveur :
toute la carte tient dans le lien (`src/social.ts`, dessin dans `src/render/postcard.ts`).

En ouvrant le lien, la carte est rangée dans la boîte aux lettres et le kikou de l'ami vient en visite dans la
scène pendant une heure (les visites reçues avant ce changement s'arrêtent aussi au bout d'une heure). C'est purement décoratif : aucune variable du kikou ne change. Sur iPhone, le lien s'ouvre
dans Safari et non dans l'app installée : la carte propose alors « Copier la carte », à coller dans
Menu › Cartes postales. Pseudo, cartes et visite sont stockés à part (`kikougochi.social`), hors de la sauvegarde
du kikou : ils restent après une nouvelle partie.

## Sauvegarde

L'état du kikou est stocké dans IndexedDB (copie dans localStorage). À chaque ouverture, le jeu rejoue
les pas de 5 minutes écoulés depuis la dernière visite. Le menu propose un code de sauvegarde à copier
pour restaurer le kikou sur un autre téléphone.

La sauvegarde est versionnée (`v` dans `KikouSave`). Une ancienne sauvegarde ou un ancien code est mis à
niveau au chargement par `migrate()` (`src/engine/kikou.ts`) : le kikou garde son stade et sa croissance,
les nouvelles variables démarrent à leur valeur de repos. `npm run simulate` vérifie cette migration.

Plusieurs copies du jeu peuvent être ouvertes en même temps (l'app installée et un onglet ouvert par une carte
postale, par exemple). Chaque écriture note l'heure réelle (`w`) : avant de rattraper le temps ou d'écrire, une
copie reprend la sauvegarde si une autre l'a écrite après elle, au lieu de rejouer des heures sans les soins faits
ailleurs. Sur iPhone, une carte ouverte dans Safari avec une vieille sauvegarde laisse le kikou en lecture seule
(Safari ne voit pas la sauvegarde de l'app installée). La migration v2 → v3 fait revenir les kikous partis à
cause de ce bug, avec leur stade.
