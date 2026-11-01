"""Génère les icônes de l'app et les images de rêve provisoires (à remplacer par de vraies photos)."""
import os, sys, json, random
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "vendor"))
from kikou import STAGES
import etats
PAL = etats.PAL
PUB = os.path.join(HERE, "..", "public")

def sprite(g, s):
    w = max(len(r) for r in g); im = Image.new("RGBA", (w * s, len(g) * s), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for y, r in enumerate(g):
        for x, c in enumerate(r):
            if c != "." and c in PAL: d.rectangle([x*s, y*s, (x+1)*s-1, (y+1)*s-1], fill=PAL[c])
    return im

def icon(size, pad=0.18, bg="#f4c46a"):
    im = Image.new("RGBA", (size, size), bg)
    g = STAGES[2][1]; inner = int(size * (1 - 2 * pad)); s = inner // max(len(g), len(g[0]))
    sp = sprite(g, s); im.paste(sp, ((size - sp.width) // 2, (size - sp.height) // 2 + s // 2), sp)
    return im

os.makedirs(f"{PUB}/icons", exist_ok=True)
icon(192).save(f"{PUB}/icons/icon-192.png"); icon(512).save(f"{PUB}/icons/icon-512.png")
icon(512, pad=0.26).save(f"{PUB}/icons/icon-512-maskable.png")
icon(180, pad=0.14).convert("RGB").save(f"{PUB}/icons/apple-touch-icon.png")

# Rêves provisoires : bébés guépards pixel dans des décors de rêve (64×64).
SCENES = [("savane", "#f7d27c", "#c9a24a"), ("nuit étoilée", "#1d2452", "#2e3a6e"), ("nuages", "#bfe6ff", "#ffffff"),
          ("coucher de soleil", "#f59e6b", "#b4566b"), ("prairie", "#a6e3a1", "#5fae5a"), ("pluie de cœurs", "#ffd6e4", "#f7a1c0"),
          ("arbre", "#cfe9ff", "#7bbf6a"), ("plage", "#9fd8f0", "#f3dca0")]
os.makedirs(f"{PUB}/reves", exist_ok=True)
names = []
for i, (nom, sky, ground) in enumerate(SCENES):
    rnd = random.Random(i); im = Image.new("RGB", (64, 64), sky); d = ImageDraw.Draw(im)
    d.rectangle([0, 44, 63, 63], fill=ground)
    for _ in range(14):
        x, y = rnd.randrange(64), rnd.randrange(40)
        d.point((x, y), fill="#ffffff" if i != 5 else "#e0443e")
    g = STAGES[rnd.choice([1, 2, 3])][1]
    sp = sprite(g, 2); im.paste(sp, (32 - sp.width // 2, 50 - sp.height), sp)
    if i % 2: sp2 = sprite(STAGES[2][1], 1); im.paste(sp2, (8, 50 - sp2.height), sp2)
    n = f"reve-{i+1:02d}.png"; im.resize((256, 256), Image.NEAREST).save(f"{PUB}/reves/{n}"); names.append(n)
json.dump({"photos": names, "note": "Remplacer par de vraies photos de bébés guépards : déposer les fichiers dans ce dossier et lister leurs noms ici."},
          open(f"{PUB}/reves/reves.json", "w"), ensure_ascii=False, indent=1)
print("ok", names)
