"""Génère src/sprites/sprites.json, la planche de sprites du jeu.

Format (à respecter pour brancher les vrais sprites) :
{
  "palette": {"o": "#3b2414", ...},            # un caractère -> une couleur ; "." = transparent
  "kikou": {                                   # par stade 0..4
     "0": {"base": {"fps": 1, "frames": [[ "rang", ... ]]},
           "dort": {...}, "calme": {...}, ...  # optionnel : états et réactions
     }, ...
  },
  "props": {"main": {...}, "bol": {...}, ...}  # accessoires, même format
}
Toute animation absente d'un stade est remplacée en jeu par une animation
procédurale construite à partir de "base" (rebond, clignement, secousse...).
Noms reconnus pour le kikou : base, dort, calme, faim, grognon, colere, content, teuf,
mange, refuse, sendort, fete, pascontent, reveille, dortsourit.
Les sprites du kikou regardent vers la gauche ; leur bas repose sur le sol.
"""
import json, os

PALETTE = {
  # palette A · Classique chaud (kikou)
  "o": "#3b2414", "f": "#e8a33c", "l": "#fbe6b8", "s": "#4a2c17", "g": "#b9b3a6",
  "e": "#1b1b1b", "w": "#ffffff", "n": "#5a2e22", "k": "#1b1b1b", "p": "#f2a3a3",
  # accessoires
  "h": "#f1c7a0", "H": "#9a6a4a", "r": "#e0443e", "R": "#8e1f1f", "c": "#cf9a5c",
  "C": "#8c6239", "d": "#5b3a1e", "b": "#5a8fd0", "B": "#2f5a94", "y": "#f5d742",
  "x": "#ffffff", "z": "#6f7fb5", "m": "#7a7a8a", "M": "#4a4a58", "q": "#9be08a",
}

# Stades : reprise de kikou/sprites_stades.py (palette A). À remplacer par les sprites finaux.
STAGES_OLD = [
 [".ooo.", "ogggo", "oefeo", "ofnfo", ".ooo."],
 [".oo..oo.", "opgoogpo", "oggggggo", "ofeffefo", "oflnnlfo", "offllffo", ".offffo.", "..oooo.."],
 [".oo.gg.oo.", "opgoggogpo", "oggggggggo", "ofeffffefo", "ofkfnnfkfo", "offkllkffo", ".ofllllfo.",
  "ogsfllfsgo", "ofsfllfsfo", ".olo..olo."],
 ["..oo..g.g..oo..", "..opoogggoopo..", "..ofgggggggfo..", "..offsgggsffo..", "..ofewfffwefo..",
  "..offkfffkffo..", "..offklnlkffo..", "...oflllllfo...", "....oollloo....", "...osfflffso...",
  "..offsflfsffo.o", "..osffflfffso.f", "..offsflfsffo.s", "..olllfsflllof.", "..ooooooooooo.."],
 ["....o.o.................", "...opopo................", ".oofffffo...............",
  "offewffffooooooooooo....", "nlfkffffsfffsfffsfffo...", "ollkffsfffsfffsfffsffof.",
  ".olllfffsfffsfffsfffsos.", "..ollllfffsfffsfffsffo.f", "...olllllllooooosfffso.s",
  "....olllllo....offsffo.f", "....ofo.ofo....ofo.ofo.o", "....ofo.ofo....ofo.ofo.l",
  "....ofo.ofo....ofo.ofo..", "....olo.olo....olo.olo..", "....ooo.ooo....ooo.ooo.."],
]

def a(*frames, fps=4):
    return {"fps": fps, "frames": [list(f) for f in frames]}

PROPS = {
  # main qui saupoudre (vient d'en haut à droite)
  "main": a([
    "..HHHH...",
    ".Hhhhhh..",
    "Hhhhhhhh.",
    "Hhhhhhhhh",
    ".Hhhhhhh.",
    "..HhhH.H.",
    "...HH....",
  ]),
  # doigt qui touche le nez (vient de la gauche)
  "doigt": a([
    "HHHH......",
    "hhhhHHHHH.",
    "hhhhhhhhhH",
    "hhhhHHHHH.",
    "HHHH......",
  ]),
  "bol": a([
    "y.y.y.y",
    "BbbbbbB",
    ".BbbbB.",
  ], [
    ".......",
    "BbbbbbB",
    ".BbbbB.",
  ]),
  "miette": a(["y"]),
  "bouche": a([
    ".rr.rr.",
    "rRrrrRr",
    ".rRRRr.",
    "..rrr..",
  ], [
    "..r.r..",
    ".rRrRr.",
    "..rRr..",
    "...r...",
  ]),
  "coeur": a([".r.r.", "rrrrr", "rrrrr", ".rrr.", "..r.."]),
  "z": a(["zzz", "..z", ".z.", "z..", "zzz"]),
  "nuage": a([".MMM..", "MmmmMM", "MmmmmM", ".MMMM."], [".MMM..", "MmmmMM", "MmmmmM", ".MMMM.", "..z..z"]),
  "colere": a(["r.r", ".r.", "r.r"], ["rr.", "..r", "rr."]),
  "exclam": a(["r", "r", "r", ".", "r"]),
  "croix": a(["R...R", ".R.R.", "..R..", ".R.R.", "R...R"]),
  "bulle": a([".oooooooo.", "oxxxxxxxxo", "oxxxxxxxxo", "oxxxxxxxxo", "oxxxxxxxxo",
              "oxxxxxxxxo", ".oooooooo.", "...oxo....", "....o....."]),
  # carton couché sur le côté (ouverture à droite)
  "carton": a([
    "CCCCCCCCCCCCCC..",
    "CccccccccccccC..",
    "CcdddddddddddCC.",
    "CcdddddddddddcCC",
    "CcdddddddddddccC",
    "CcdddddddddddccC",
    "CcdddddddddddccC",
    "CcdddddddddddccC",
    "CcdddddddddddcCC",
    "CccccccccccccCC.",
    "CCCCCCCCCCCCCC..",
  ]),
}

import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor"))
try:
    from kikou import STAGES as _ST   # sprites de base du fil visuels (prioritaires)
    STAGES = [g for _, g in _ST]
except ImportError:
    STAGES = STAGES_OLD

data = {"palette": PALETTE,
        "kikou": {str(i): {"base": a(g, fps=1)} for i, g in enumerate(STAGES)},
        "props": PROPS}
# Accessoires du fil visuels (prioritaires), avec leur propre palette
try:
    import etats as _E
    VP, VPAL = _E.PROPS, _E.PAL
    def va(*names, fps=6):
        fr = [list(VP[n]) for n in names]
        used = {c for f in fr for r in f for c in r if c != "."}
        return {"fps": fps, "frames": fr, "pal": {c: VPAL[c] for c in used if c in VPAL}}
    PROPS.update({"main": va("main_ouverte", "main_pince"), "miette": va("grain"),
                  "doigt": va("doigt"), "bouche": va("bouche_1", "bouche_2", fps=4)})
except (ImportError, KeyError) as e:
    print("accessoires du fil visuels non trouvés :", e)
for i, g in enumerate(STAGES):
    assert len({len(r) for r in g}) == 1, i
out = os.path.join(os.path.dirname(__file__), "..", "src", "sprites", "sprites.json")
json.dump(data, open(out, "w"), ensure_ascii=False, indent=1)
print("ok", out)
