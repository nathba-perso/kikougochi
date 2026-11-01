from PIL import Image, ImageDraw, ImageFont
import sys

# Legende : . vide, o contour, f pelage, l clair (ventre/museau), s tache,
# g duvet gris (bébé), e oeil, w reflet, n truffe, k larme noire, p rose
STAGES = [
 ("1 · Boule", [
  ".ooo.",
  "ogggo",
  "oefeo",
  "ofnfo",
  ".ooo.",
 ]),
 ("2 · Boule à oreilles", [
  ".oo..oo.",
  "opgoogpo",
  "oggggggo",
  "ofeffefo",
  "oflnnlfo",
  "offllffo",
  ".offffo.",
  "..oooo..",
 ]),
 ("3 · Bébé touffu", [
  ".oo.gg.oo.",
  "opgoggogpo",
  "oggggggggo",
  "ofeffffefo",
  "ofkfnnfkfo",
  "offkllkffo",
  ".ofllllfo.",
  "ogsfllfsgo",
  "ofsfllfsfo",
  ".olo..olo.",
 ]),
 ("4 · Petit guépard", [
  "..oo..g.g..oo..",
  "..opoogggoopo..",
  "..ofgggggggfo..",
  "..offsgggsffo..",
  "..ofewfffwefo..",
  "..offkfffkffo..",
  "..offklnlkffo..",
  "...oflllllfo...",
  "....oollloo....",
  "...osfflffso...",
  "..offsflfsffo.o",
  "..osffflfffso.f",
  "..offsflfsffo.s",
  "..olllfsflllof.",
  "..ooooooooooo..",
 ]),
 ("5 · Guépard ado", [
  ".oo.....oo..............",
  "opfooooofpo.............",
  "offfsfsfffo.............",
  "ofwefffewfo.............",
  "offkfffkffoooooooooo....",
  "oflklnlklfsfffsfffsfo...",
  ".ollllllloffsfffsfffsof.",
  "..ooooooofsfffsfffsffo.s",
  "..offlllffffsfffsfffso.f",
  "...offllffsfffsfffsffo.o",
  "...offlffoooooofsfffo..l",
  "...ofo.ofo....ofo.ofo...",
  "...ofo.ofo....ofo.ofo...",
  "...olo.olo....olo.olo...",
  "...ooo.ooo....ooo.ooo...",
 ]),
]

PALETTES = {
 "A · Classique chaud (contour sombre)": {
  "o": "#3b2414", "f": "#e8a33c", "l": "#fbe6b8", "s": "#4a2c17", "g": "#b9b3a6",
  "e": "#1b1b1b", "w": "#ffffff", "n": "#5a2e22", "k": "#1b1b1b", "p": "#f2a3a3",
 },
 "B · Pastel doux (contour coloré)": {
  "o": "#a8673a", "f": "#f6c779", "l": "#fff4dc", "s": "#b97a4a", "g": "#dcd6cc",
  "e": "#4b3a52", "w": "#ffffff", "n": "#d97c7c", "k": "#8a5a3e", "p": "#ffb8c6",
 },
 "C · Rétro console (4 verts)": {
  "o": "#0f380f", "f": "#8bac0f", "l": "#c8dc6a", "s": "#306230", "g": "#c8dc6a",
  "e": "#0f380f", "w": "#e8f4b0", "n": "#0f380f", "k": "#0f380f", "p": "#306230",
 },
}

def sprite(grid, pal, scale):
    h = len(grid); w = max(len(r) for r in grid)
    im = Image.new("RGBA", (w*scale, h*scale), (0,0,0,0))
    d = ImageDraw.Draw(im)
    for y, row in enumerate(grid):
        for x, c in enumerate(row):
            if c != "." and c in pal:
                d.rectangle([x*scale, y*scale, (x+1)*scale-1, (y+1)*scale-1], fill=pal[c])
    return im

def check():
    for name, g in STAGES:
        ws = {len(r) for r in g}
        print(name, "w", ws, "h", len(g))

if __name__ == "__main__":
    check()
    S = 14  # 1 pixel du jeu = 14 px
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
    fontb = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26)
    small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
    colw = 25*S + 40
    W = 40 + colw*5; rowh = 15*S + 110
    NPAL = int(sys.argv[2]) if len(sys.argv) > 2 else len(PALETTES)
    H = 30 + rowh*NPAL
    sheet = Image.new("RGB", (W, H), "#f4efe6")
    d = ImageDraw.Draw(sheet)
    y0 = 20
    for pname, pal in list(PALETTES.items())[:NPAL]:
        bg = "#c4cfa1" if "Rétro" in pname else "#fffaf0"
        d.text((30, y0), pname, fill="#222", font=fontb)
        for i, (sname, g) in enumerate(STAGES):
            x0 = 30 + i*colw
            d.rounded_rectangle([x0, y0+45, x0+colw-20, y0+45+15*S+20], 12, fill=bg)
            im = sprite(g, pal, S)
            px = x0 + (colw-20-im.width)//2
            py = y0+55 + (15*S - im.height)  # posés au sol
            sheet.paste(im, (px, py), im)
            # taille réelle (x1) et x3
            r1 = sprite(g, pal, 1); r3 = sprite(g, pal, 3)
            sheet.paste(r1, (x0+colw-20-r1.width-10, y0+45+15*S+10-r1.height), r1); d.text((x0+colw-20-r1.width-18-d.textlength("taille réelle :", font=small), y0+45+15*S-8), "taille réelle :", fill="#999", font=small)
            w = max(len(r) for r in g); h = len(g)
            d.text((x0, y0+45+15*S+26), f"{sname}  ({w}×{h} px)", fill="#333", font=font)
        y0 += rowh
    out = sys.argv[1] if len(sys.argv) > 1 else "planche.png"
    sheet.save(out)
    print(out, sheet.size)
