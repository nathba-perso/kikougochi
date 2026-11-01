import sys, os, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kikou import STAGES, PALETTES
from PIL import Image, ImageDraw, ImageFont

PAL = dict(list(PALETTES.values())[0])
PAL.update({
 "c": "#7a4a22",  # oeil fermé
 "r": "#e0603a",  # pelage rougi (colère)
 "R": "#d62828", "Y": "#f5c518", "B": "#3a86ff", "G": "#2a9d8f", "P": "#ff5fa2",  # confettis / chapeau
 "z": "#4a5a8a",  # Zzz
 "O": "#6b6b6b", "W": "#ffffff", "m": "#b5523b", "b": "#f1ead8",  # bulle repas
 "C": "#8d8d99", "D": "#55555f",  # nuage grognon
 "H": "#ff4d6d",  # coeur
 "V": "#e5383b",  # veine colère
 "S": "#d9d9d9",  # vapeur
 "d": "#7fc8f8",  # goutte de bave
 "h": "#f2c9a0", "q": "#a86b4a",  # main (peau, contour)
})

from PIL import ImageColor
RGB = {k: ImageColor.getrgb(v) + (255,) for k, v in PAL.items()}
PADX, PADT, PADB = 9, 11, 1

OV = {
 "Z": ["zzzz", "..z.", ".z..", "zzzz"],
 "z": ["zzz", "..z", "z..", "zzz"],
 "heart": [".H.H.", "HHHHH", ".HHH.", "..H.."],
 "hs": ["H.H", "HHH", ".H."],
 "hat": ["..Y..", ".RYR.", ".YRY.", "RYRYR"],
 "cloud": [".CCCC.", "CCDCDC", ".CCCC."],
 "cloud2": [".CCCC.", "CDCDCC", ".CCCC."],
 "bubble": [".OOOOOOO.", "OWWWWWWWO", "OWmmWWWWO", "OWmmmbbWO", "OWWmWWWWO", ".OOOWOOO.", "...O....."],
 "vein": ["V.V", ".V.", "V.V"],
 "steam": ["S.", ".S"],
 "steam2": [".S", "S."],
 "excl": ["V", "V", ".", "V"],
 "crumbs3": ["m.m", ".m."],
 "crumbs2": ["m..", "..m"],
 "crumbs1": [".m"],
 "dream1": ["S"],
 "dream2": [".SS", "SSS", ".S."],
 "no": ["V.V", ".V.", "V.V"],
}

# Accessoires des actions du joueur, animés à part dans la scène (mêmes caractères de palette)
PROPS = {
 "main_ouverte": [".qqqqq.", "qhhhhhq", "qhhhhhq", "qhhhhhq", "qhqhqhq", "qhqhqhq", ".q.q.q."],
 "main_pince":   [".qqqqq.", "qhhhhhq", "qhhhhhq", ".qhhhq.", "..qhq..", "..qhq..", "...q..."],
 "grain":        ["m"],
 "doigt":        ["....qqqq", ".qqqhhhh", "qhhhhhhh", ".qqqhhhh", "....qqqq"],
 "coeur_1":      ["H.H", "HHH", ".H."],
 "coeur_2":      [".H.H.", "HHHHH", ".HHH.", "..H.."],
 "coeur_3":      [".HH.HH.", "HHHHHHH", "HHHHHHH", ".HHHHH.", "..HHH..", "...H..."],
 "bouche_1":     [".RR.RR.", "RPPPPPR", ".RRRRR."],
 "bouche_2":     ["..RRR..", ".RPPPR.", "..RRR.."],
}

def info(g):
    pts = lambda chs: [(x, y) for y, r in enumerate(g) for x, c in enumerate(r) if c in chs]
    eyes = pts("ew") or pts("c"); nose = pts("n")
    xs = [x for y, r in enumerate(g) for x, c in enumerate(r) if c != "." and y <= (min(y for _, y in eyes) if eyes else 0)]
    w = max(len(r) for r in g)
    # tête : zone autour des yeux
    ex = [x for x, _ in eyes]
    hx0, hx1 = min(ex) - 2, max(ex) + 2
    return dict(eyes=eyes, nose=nose, w=w, h=len(g), hx0=max(0, hx0), hx1=min(w - 1, hx1),
                hcx=(min(ex) + max(ex)) // 2)

def edit(g, fn):
    g = [list(r) for r in g]; fn(g); return ["".join(r) for r in g]

def eyes_closed(g):
    def f(G):
        for y, r in enumerate(G):
            for x, c in enumerate(r):
                if c in "ew": G[y][x] = "c"
    return edit(g, f)

def no_highlight(g):
    return edit(g, lambda G: [G[y].__setitem__(x, "e") for y, r in enumerate(G) for x, c in enumerate(r) if c == "w"])

def brows(g, angry=False):
    I = info(g)
    def f(G):
        tops = {}
        for x, y in I["eyes"]:
            tops[x] = min(tops.get(x, 99), y)
        for x, y in tops.items():
            yy = y - 1
            if yy >= 0 and G[yy][x] not in ".o":
                G[yy][x] = "o"
        if angry:  # sourcils en V : pixel en plus vers le centre, un rang plus bas
            for x, y in tops.items():
                cx = x + (1 if x < I["hcx"] else -1)
                if 0 <= cx < len(G[y]) and G[y][cx] in "fgls" and (cx, y) not in I["eyes"]:
                    G[y][cx] = "o"
    return edit(g, f)

def tint(g):
    return edit(g, lambda G: [G[y].__setitem__(x, "r") for y, r in enumerate(G) for x, c in enumerate(r) if c == "f"])

def tongue(g, long=False):
    I = info(g)
    def f(G):
        if not I["nose"]: return
        xs = sorted({x for x, _ in I["nose"]}); y = max(y for _, y in I["nose"]) + 1
        x = xs[0]
        for dy in range(2 if long else 1):
            if y + dy < len(G): G[y + dy][x] = "p"
    return edit(g, f)

def squash(g):
    h = len(g); k = h // 2 + 1
    w = max(len(r) for r in g)
    return ["." * w] + g[:k] + g[k + 1:]

# Guépard ado couché (stade 5, pour dormir)
LYING5 = [
 ".oo.....oo..............",
 "opfooooofpo.............",
 "offfsfsfffo.............",
 "ofccfffccfo.............",
 "offkfffkffoooooooooooo..",
 "oflklnlklfffffffffffffo.",
 ".olllllllofffffffffffffo",
 "..oooooooofffffffffffffo",
 "ollllollllffffffffffffo.",
 "ooooooooooooooooooooooo.",
]
def _spots(g, rows, c0, c1):
    g = [list(r) for r in g]
    for r in rows:
        for c in range(c0, c1 + 1):
            if g[r][c] == "f" and (c + 2 * (r % 2)) % 4 == 0: g[r][c] = "s"
    return ["".join(r) for r in g]
LYING5 = _spots(LYING5, range(5, 9), 11, 21)

def _exhale(g):  # le dos s'abaisse d'un pixel : respiration couchée
    g = [list(r) for r in g]
    for c in range(13, 21):
        g[4][c] = "."; g[5][c] = "o"
    return ["".join(r) for r in g]
LYING5_EX = _exhale(LYING5)

def breathe(g):
    return LYING5_EX if g == LYING5 else squash(g)

def sleeping(stage_idx, closed):
    return LYING5 if stage_idx == 4 else closed

def blit(canvas, grid, ox, oy):
    for y, r in enumerate(grid):
        for x, c in enumerate(r):
            if c != ".":
                X, Y = ox + x, oy + y
                if 0 <= X < canvas.width and 0 <= Y < canvas.height:
                    canvas.putpixel((X, Y), RGB[c])

# Chaque état : liste de (frame_fn, durée en ticks). Total doit diviser 48.
def state_frames(stage_idx, state):
    name, g0 = STAGES[stage_idx]
    I = info(g0)
    W = I["w"] + 2 * PADX; H = I["h"] + PADT + PADB
    big = stage_idx >= 3
    def base(g, dx=0, dy=0, extra=()):
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        gy = H - PADB - len(g) + dy
        blit(im, g, PADX + dx, gy)
        top = H - PADB - len(g) + dy  # haut du sprite non écrasé
        for ov, ox, oy in extra:
            blit(im, OV[ov] if isinstance(ov, str) else ov, PADX + dx + ox, top + oy)
        return im
    hx = I["hcx"]; hr = I["hx1"]
    F = []
    if state == "dort":
        gc = sleeping(stage_idx, eyes_closed(no_highlight(g0))); gs = breathe(gc)
        zx = hr + 1
        F = [(base(gc, extra=[("z", zx, -3)]), 4), (base(gs, extra=[("z", zx + 1, -4)]), 4),
             (base(gs, extra=[("Z", zx + 1, -8), ("z", zx, -3)]), 4), (base(gc, extra=[("Z", zx + 2, -10), ("z", zx + 1, -5)]), 4)]
    elif state == "calme":
        gc = eyes_closed(no_highlight(g0)); gs = squash(g0)
        F = [(base(g0), 10), (base(gc), 2), (base(g0), 6), (base(gs), 4), (base(g0), 2)]
    elif state == "faim":
        gt = tongue(g0); gt2 = tongue(g0, True)
        bx = hr - 1
        F = [(base(g0, extra=[("bubble", bx, -8)]), 3), (base(gt, extra=[("bubble", bx, -9)]), 3),
             (base(gt2, extra=[("bubble", bx, -9)]), 3), (base(gt, extra=[("bubble", bx, -8)]), 3)]
    elif state == "grognon":
        gb = brows(no_highlight(g0)); cx = hx - 2
        F = [(base(gb, extra=[("cloud", cx, -5)]), 4), (base(gb, extra=[("cloud2", cx + 1, -5)]), 4),
             (base(squash(gb), extra=[("cloud", cx + 1, -5)]), 4), (base(gb, extra=[("cloud2", cx, -5)]), 4)]
    elif state == "colere":
        ga = tint(brows(no_highlight(g0), angry=True))
        sl, sr = I["hx0"] - 2, hr + 1
        F = [(base(ga, dx=0, extra=[("vein", hr - 1, -4), ("steam", sl, -3)]), 2),
             (base(ga, dx=1, extra=[("steam2", sr, -3)]), 2),
             (base(ga, dx=0, extra=[("vein", hr - 1, -4), ("steam2", sl, -4)]), 2),
             (base(ga, dx=-1, extra=[("steam", sr, -4)]), 2)]
    elif state == "content":
        gc = eyes_closed(no_highlight(g0))
        hs = "heart" if big else "hs"
        dys = [0, -1, -2, -1, 0, 0]
        F = []
        for i, dy in enumerate(dys):
            ex = [(hs, hr, -3 - i)] if i < 5 else []
            F.append((base(gc if i in (1, 2, 3) else g0, dy=dy, extra=ex), 2))
    elif state == "teuf":
        rnd = random.Random(7)
        conf = [(rnd.randrange(-PADX, I["w"] + PADX), rnd.randrange(-PADT, 0), rnd.choice("RYBGP")) for _ in range(14)]
        dys = [0, -2, -3, -2, 0, 0, -1, 0]; dxs = [0, 0, 1, 1, 0, -1, -1, 0]
        F = []
        for i, (dy, dx) in enumerate(zip(dys, dxs)):
            g = eyes_closed(no_highlight(tongue(g0))) if i % 4 in (1, 2) else tongue(g0)
            hat = (OV["hat"], hx - 2, -4)
            im = base(g, dx=dx, dy=dy, extra=[hat])
            for cx, cy, col in conf:
                y = (cy + i * 2) % (H - 2)
                X = PADX + cx
                if 0 <= X < W and im.getpixel((X, y))[3] == 0:
                    im.putpixel((X, y), RGB[col])
            F.append((im, 2))
    return F

REACTIONS = ["mange", "refuse", "content", "sendort", "fete", "pascontent", "reveille", "dortsourit"]

def reaction_frames(stage_idx, name):
    """Même contrat que state_frames : liste de (image RGBA, ticks de 120 ms), mêmes cellules."""
    if name == "content": return state_frames(stage_idx, "content")
    if name == "fete": return state_frames(stage_idx, "teuf")
    _, g0 = STAGES[stage_idx]
    I = info(g0)
    W = I["w"] + 2 * PADX; H = I["h"] + PADT + PADB
    def base(g, dx=0, dy=0, extra=()):
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        blit(im, g, PADX + dx, H - PADB - len(g) + dy)
        top = H - PADB - len(g) + dy
        for ov, ox, oy in extra:
            blit(im, OV[ov], PADX + dx + ox, top + oy)
        return im
    hx, hr, hl = I["hcx"], I["hx1"], I["hx0"]
    nx = min(x for x, _ in I["nose"]); ny = max(y for _, y in I["nose"])
    closed = eyes_closed(no_highlight(g0))
    lie = sleeping(stage_idx, closed)
    if name == "mange":
        gt = tongue(g0); gs = squash(g0)
        cx, cy = nx - 1, ny + 1  # miettes devant la bouche
        return [(base(gs, extra=[("crumbs3", cx, cy)]), 3), (base(gt, extra=[("crumbs3", cx, cy)]), 3),
                (base(gs, extra=[("crumbs2", cx, cy)]), 3), (base(gt, extra=[("crumbs2", cx, cy)]), 3),
                (base(gs, extra=[("crumbs1", cx, cy)]), 3), (base(tongue(closed), extra=[]), 3),
                (base(tongue(closed, True)), 3), (base(closed), 3)]
    if name == "refuse":
        gb = brows(closed)
        return [(base(gb, dx=-1, extra=[("no", hr + 1, -4)]), 2), (base(gb, dx=1, extra=[("no", hr + 1, -4)]), 2),
                (base(gb, dx=-1, extra=[("no", hr + 1, -4)]), 2), (base(gb, dx=1, extra=[("no", hr + 1, -4)]), 2),
                (base(gb), 4), (base(brows(no_highlight(g0))), 4)]
    if name == "sendort":
        half = no_highlight(g0)
        return [(base(g0), 4), (base(half), 4), (base(closed), 2), (base(half), 2),
                (base(lie), 4), (base(breathe(lie), extra=[("z", hr + 1, -3)]), 4),
                (base(lie, extra=[("z", hr + 2, -5)]), 4)]
    if name == "pascontent":
        gb = brows(no_highlight(g0))
        return [(base(g0), 2), (base(gb), 2), (base(gb, dx=1, extra=[("cloud", hx - 2, -5)]), 2),
                (base(gb, dx=-1, extra=[("cloud2", hx - 2, -5)]), 2), (base(squash(gb), extra=[("cloud", hx - 2, -5)]), 4),
                (base(gb, extra=[("cloud2", hx - 2, -5)]), 4)]
    if name == "reveille":
        half = no_highlight(g0)
        return [(base(lie), 4), (base(lie), 3), (base(closed), 2), (base(half), 2),
                (base(g0, dy=-1, extra=[("excl", hr + 1, -5)]), 3), (base(g0, extra=[("excl", hr + 1, -5)]), 3),
                (base(g0), 6)]
    if name == "dortsourit":
        gs = breathe(lie); dx0 = hr + 1
        return [(base(lie, extra=[("dream1", dx0, -1)]), 4), (base(gs, extra=[("dream1", dx0, -1), ("dream1", dx0 + 1, -3)]), 4),
                (base(lie, extra=[("dream1", dx0, -1), ("dream1", dx0 + 1, -3), ("dream2", dx0 + 1, -7)]), 4),
                (base(gs, extra=[("dream1", dx0, -1), ("dream1", dx0 + 1, -3), ("dream2", dx0 + 1, -7), ("hs", dx0 + 1, -11)]), 8)]
    raise KeyError(name)

STATES = [("dort", "Il dort"), ("calme", "Calme"), ("faim", "A faim"), ("grognon", "Grognon"),
          ("colere", "En colère"), ("content", "Content"), ("teuf", "Fait la teuf")]

if __name__ == "__main__":
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
    small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
    S = 6
    allF = {}
    for si in range(5):
        for st, _ in STATES:
            F = state_frames(si, st)
            assert 48 % sum(t for _, t in F) == 0, (si, st, sum(t for _, t in F))
            allF[si, st] = F
        # planche de sprites du stade (taille réelle, 1 ligne par état)
        cw = allF[si, "dort"][0][0].width; ch = allF[si, "dort"][0][0].height
        sheet = Image.new("RGBA", (cw * 8, ch * len(STATES)), (0, 0, 0, 0))
        for r, (st, _) in enumerate(STATES):
            for c, (im, _) in enumerate(allF[si, st]):
                sheet.paste(im, (c * cw, r * ch), im)
        sheet.save(f"{out}/stade{si+1}_etats_x1.png")
        sheet.resize((sheet.width * 8, sheet.height * 8), Image.NEAREST).save(f"{out}/stade{si+1}_etats_x8.png")
    # GIF : lignes = stades, colonnes = états
    cellw = max(allF[si, "dort"][0][0].width for si in range(5)) * S + 20
    cellh = max(allF[si, "dort"][0][0].height for si in range(5)) * S + 10
    LX, TY = 190, 50
    Wt, Ht = LX + cellw * 7 + 10, TY + cellh * 5 + 10
    frames = []
    for tick in range(48):
        fr = Image.new("RGB", (Wt, Ht), "#f4efe6"); d = ImageDraw.Draw(fr)
        for c, (st, lab) in enumerate(STATES):
            d.text((LX + c * cellw + cellw // 2 - d.textlength(lab, font=font) // 2, 15), lab, fill="#222", font=font)
        for si in range(5):
            d.text((15, TY + si * cellh + cellh // 2 - 10), STAGES[si][0], fill="#222", font=small)
            for c, (st, _) in enumerate(STATES):
                F = allF[si, st]; tot = sum(t for _, t in F); k = tick % tot
                for im, t in F:
                    if k < t: break
                    k -= t
                x0, y0 = LX + c * cellw, TY + si * cellh
                d.rounded_rectangle([x0 + 4, y0 + 4, x0 + cellw - 6, y0 + cellh - 4], 10, fill="#fffaf0")
                big = im.resize((im.width * S, im.height * S), Image.NEAREST)
                fr.paste(big, (x0 + (cellw - big.width) // 2, y0 + cellh - 8 - big.height), big)
        frames.append(fr)
    frames[0].save(f"{out}/apercu_etats.gif", save_all=True, append_images=frames[1:], duration=120, loop=0, optimize=True)
    frames[0].save(f"{out}/apercu_etats_image1.png")
    # aperçu des réactions
    RF = {(si, r): reaction_frames(si, r) for si in range(5) for r in REACTIONS}
    LAB = {"mange": "Mange", "refuse": "Refuse", "content": "Content", "sendort": "S'endort", "fete": "Fait la fête",
           "pascontent": "Pas content", "reveille": "Se réveille", "dortsourit": "Rêve (avant photos)"}
    Wr = LX + cellw * len(REACTIONS) + 10
    frames = []
    for tick in range(48):
        fr = Image.new("RGB", (Wr, Ht), "#f4efe6"); d = ImageDraw.Draw(fr)
        for c, r in enumerate(REACTIONS):
            d.text((LX + c * cellw + cellw // 2 - d.textlength(LAB[r], font=small) // 2, 18), LAB[r], fill="#222", font=small)
        for si in range(5):
            d.text((15, TY + si * cellh + cellh // 2 - 10), STAGES[si][0], fill="#222", font=small)
            for c, r in enumerate(REACTIONS):
                F = RF[si, r]; tot = sum(t for _, t in F); k = tick % tot
                for im, t in F:
                    if k < t: break
                    k -= t
                x0, y0 = LX + c * cellw, TY + si * cellh
                d.rounded_rectangle([x0 + 4, y0 + 4, x0 + cellw - 6, y0 + cellh - 4], 10, fill="#fffaf0")
                big = im.resize((im.width * S, im.height * S), Image.NEAREST)
                fr.paste(big, (x0 + (cellw - big.width) // 2, y0 + cellh - 8 - big.height), big)
        frames.append(fr)
    frames[0].save(f"{out}/apercu_reactions.gif", save_all=True, append_images=frames[1:], duration=120, loop=0, optimize=True)
    # planche des accessoires
    pw = 12 * 8; ps = Image.new("RGB", (pw * len(PROPS) + 20, 12 * 8 + 50), "#fffaf0"); d = ImageDraw.Draw(ps)
    for i, (k, g) in enumerate(PROPS.items()):
        im = Image.new("RGBA", (max(len(r) for r in g), len(g)), (0, 0, 0, 0)); blit(im, g, 0, 0)
        im = im.resize((im.width * 8, im.height * 8), Image.NEAREST)
        ps.paste(im, (10 + i * pw, 10), im); d.text((10 + i * pw, 12 * 8 + 20), k, fill="#333", font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11))
    ps.save(f"{out}/accessoires_actions.png")
    print("ok", Wt, Ht)
