"""Cherche des photos libres de bébés guépards sur Wikimedia Commons et télécharge des candidates.
Lancé par .github/workflows/reves.yml (le serveur de développement n'a pas accès à Commons).
Sortie : candidats/ (images 640 px) + candidats/credits.json (auteur, licence, page source)."""
import json, os, re, urllib.parse, urllib.request, html

UA = {"User-Agent": "Kikougochi/1.0 (https://github.com/nathba-perso/kikougochi)"}
API = "https://commons.wikimedia.org/w/api.php"
OK = re.compile(r"^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+)", re.I)
OUT = "candidats"; os.makedirs(OUT, exist_ok=True)

def get(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)

def strip(s): return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()

seen, res = set(), []
for q in ["cheetah cub", "cheetah cubs", "baby cheetah", "Acinonyx jubatus cub", "cheetah kitten"]:
    d = get({"action": "query", "generator": "search", "gsrsearch": f"{q} filetype:bitmap", "gsrnamespace": 6,
             "gsrlimit": 40, "prop": "imageinfo", "iiprop": "url|size|extmetadata|mime", "iiurlwidth": 640})
    for p in d.get("query", {}).get("pages", {}).values():
        t = p["title"]
        if t in seen or "imageinfo" not in p: continue
        seen.add(t); ii = p["imageinfo"][0]; m = ii.get("extmetadata", {})
        lic = strip(m.get("LicenseShortName", {}).get("value"))
        desc = strip(m.get("ImageDescription", {}).get("value")).lower()
        name = t.lower()
        if not OK.match(lic) or ii.get("mime") != "image/jpeg" or ii["width"] < 600: continue
        if not any(w in name + " " + desc for w in ("cub", "baby", "kitten", "young", "juvenile", "bébé", "petit")): continue
        res.append({"title": t, "license": lic, "artist": strip(m.get("Artist", {}).get("value"))[:120],
                    "page": ii["descriptionurl"], "thumb": ii["thumburl"]})
res = res[:40]
for i, r in enumerate(res):
    fn = f"c{i:02d}.jpg"
    try:
        with urllib.request.urlopen(urllib.request.Request(r["thumb"], headers=UA), timeout=60) as f, open(f"{OUT}/{fn}", "wb") as o:
            o.write(f.read())
        r["file"] = fn
    except Exception as e:
        r["error"] = str(e)
json.dump(res, open(f"{OUT}/credits.json", "w"), ensure_ascii=False, indent=1)
print(len(res), "candidates")
