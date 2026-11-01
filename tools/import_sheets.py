"""Importe les sprites du fil « visuels » et produit les planches du jeu.

Usage : python3 tools/import_sheets.py [/mnt/project-files/kikou]
- copie kikou.py et etats.py (et reactions.py s'il existe) dans tools/vendor/
- écrit public/sprites/stadeN.png (une ligne par animation, une colonne par image)
- écrit public/sprites/manifest.json : géométrie des cellules et durée de chaque image
Contrat attendu : state_frames(stage_idx, state) -> [(PIL.Image, ticks)], 1 tick = 120 ms,
cellule = (w + 2*PADX) × (h + PADT + PADB), kikou posé en bas à x = PADX.
Optionnel : reaction_frames(stage_idx, name) avec le même contrat.
"""
import sys, os, shutil, json, importlib
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "/mnt/project-files/kikou"
HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(HERE, "vendor")
OUT = os.path.join(HERE, "..", "public", "sprites")
TICK_MS = 120
os.makedirs(VENDOR, exist_ok=True); os.makedirs(OUT, exist_ok=True)
for f in ("kikou.py", "etats.py", "reactions.py"):
    if os.path.exists(os.path.join(SRC, f)):
        shutil.copy(os.path.join(SRC, f), os.path.join(VENDOR, f))
sys.path.insert(0, VENDOR)
etats = importlib.import_module("etats")
try:
    reactions = importlib.import_module("reactions")
except ImportError:
    reactions = None

STATES = ["dort", "calme", "faim", "grognon", "colere", "content", "teuf"]
REACTIONS = ["mange", "refuse", "content", "sendort", "fete", "pascontent", "reveille", "dortsourit"]

def collect(si):
    anims = {}
    for st in STATES:
        anims[st] = etats.state_frames(si, st)
    fn = getattr(reactions, "reaction_frames", None) or getattr(etats, "reaction_frames", None)
    if fn:
        for r in REACTIONS:
            try:
                F = fn(si, r)
            except Exception:
                F = None
            if F: anims["r:" + r] = F
    return anims

manifest = {"tickMs": TICK_MS, "stages": {}}
for si in range(len(etats.STAGES)):
    anims = collect(si)
    cw, ch = anims["dort"][0][0].size
    cols = max(len(F) for F in anims.values())
    sheet = Image.new("RGBA", (cw * cols, ch * len(anims)), (0, 0, 0, 0))
    entry = {"src": f"sprites/stade{si}.png", "cellW": cw, "cellH": ch,
             "padX": etats.PADX, "padB": etats.PADB, "anims": {}}
    for row, (name, F) in enumerate(anims.items()):
        for c, (im, _) in enumerate(F):
            assert im.size == (cw, ch), (si, name, im.size)
            sheet.paste(im, (c * cw, row * ch), im)
        entry["anims"][name] = {"row": row, "ms": [t * TICK_MS for _, t in F]}
    sheet.save(os.path.join(OUT, f"stade{si}.png"))
    manifest["stages"][str(si)] = entry
json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
print("planches:", {k: list(v["anims"]) for k, v in manifest["stages"].items()})
