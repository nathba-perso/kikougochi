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

## Mode test

Ajouter `?debug` à l'URL : affiche les variables cachées et permet d'avancer le temps (+1 h, +6 h, +1 j, +5 j).
Le décalage est mémorisé dans le navigateur ; « heure réelle » le remet à zéro.

## Sauvegarde

L'état du kikou est stocké dans IndexedDB (copie dans localStorage). À chaque ouverture, le jeu rejoue
les pas de 5 minutes écoulés depuis la dernière visite. Le menu propose un code de sauvegarde à copier
pour restaurer le kikou sur un autre téléphone.
