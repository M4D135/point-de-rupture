#!/usr/bin/env python3
"""Point de rupture — extraction du plan d'une vraie ville pour le jeu.

Les données viennent d'OpenStreetMap (© les contributeurs d'OpenStreetMap, licence ODbL), par les tuiles vectorielles
d'OpenFreeMap (schéma OpenMapTiles) au zoom 14, téléchargées à part (voir LISEZMOI.md). L'outil :
  1. lit les tuiles d'une ville et décode le format Mapbox Vector Tile (protobuf, commandes de géométrie, zigzag) ;
  2. découpe chaque tuile à son emprise exacte dans le carré extrait (le plus grand carré de jeu, 1 100 m, et 60 m de
     marge), ce qui retire les doublons des zones tampon ; recolle les polygones et les lignes coupés au bord des
     tuiles ; scinde en ses vrais morceaux un polygone concave qui sort du carré et y rentre ;
  3. passe en mètres locaux : x vers l'est, z vers le sud, origine au centre choisi, échelle exacte au centre
     (rayons de courbure de l'ellipsoïde WGS 84) ;
  4. classe (ni tunnel, ni sous-sol, ni commerce, ni enseigne), simplifie (Douglas-Peucker à 0,4 m, sans toucher aux
     angles des façades), quantifie au décimètre ; replie les pointes, retire les éclats et les trous qui débordent ;
  5. écrit le module src/villes/<ville>.js : PDR.plans.<ville>, données compactes et leur décodeur.

    python3 Jeu/outils/plans/extraire.py marseille --tuiles DOSSIER_DES_TUILES
    python3 Jeu/outils/plans/extraire.py marseille --tuiles DOSSIER --apercu plan.svg
    python3 Jeu/outils/plans/extraire.py --liste

Bibliothèque standard seulement. Déterministe : mêmes tuiles, même module, à l'octet près.
"""
import argparse
import base64
import gzip
import json
import math
import pathlib
import struct
import sys
import textwrap
import time

# ---- Les villes. Une entrée par ville ; le centre est celui de tous les carrés de jeu. -------------------------------
# centre : (lat, lon), origine du repère du jeu. notes : ce que le cadre doit montrer.
# exclus : noms de repères écartés à la main (enseignes, personnalités réelles) que les règles générales laissent passer.
# aires : nom à donner à l'aire piétonne qui contient un repère OSM nommé, quand OpenMapTiles ne nomme pas l'aire
#         ({ nom du repère : (nom de l'aire, sorte) }) ; le point vient toujours des données, jamais d'une saisie.
VILLES = {
    'marseille': {
        'nom': 'Marseille',
        # Coin nord-est du Vieux-Port, à la jonction du quai du Port et du quai des Belges. Le carré de 660 m tient
        # l'Hôtel de Ville, le quai des Belges, le bas de la Canebière, le cours Belsunce et l'Opéra ; celui de 950 m
        # y ajoute les Accoules, la rue du Panier, le cours Saint-Louis et le cours d'Estienne-d'Orves ; celui de
        # 1 100 m, la Vieille Charité et le marché des Capucins. Le fort Saint-Jean, 850 m à l'ouest, reste dehors.
        'centre': (43.2962, 5.3734),
        'notes': 'Vieux-Port, Panier, Hôtel de Ville et quais, Canebière, Belsunce, Noailles, rive sud.',
        'exclus': ('Petit Train de Marseille', 'La Savonnerie Marseillaise', 'Le Musée du Savon',
                   "Monument à la mémoire de Frédéric Chevillon maire d'Allauch"),
        'aires': {"Le cours Honoré-d'Estienne-d'Orves": ("Cours Honoré-d'Estienne-d'Orves", 'place')},
        # Le lointain : ce que l'on voit des bords du carré sans pouvoir y aller. reperes : (nom du repère OSM, classe
        # de ce point d'intérêt, rayon en m, modèle) ; les bâtiments à moins du rayon de ce point gardent leur emprise
        # exacte et vont au modèle (le constructeur de la ville l'habille), les autres deviennent des boîtes. Le point
        # vient toujours des données, jamais d'une saisie. Le MuCEM (J4) est dans la tuile 14/8435/6001, à l'ouest : il
        # entre dans le plan dès que cette tuile est posée avec les autres. zone : (x0, z0, x1, z1) en m ; elle descend
        # au sud jusqu'à la colline de Notre-Dame de la Garde.
        'lointain': {'zone': (-1250, -1250, 1250, 1460), 'reperes': (
            ('Cathédrale de la Major', 'place_of_worship', 60, 'major'),
            ('Tour du Roi René', 'attraction', 170, 'fort-saint-jean'),
            ('Église Saint-Laurent', 'place_of_worship', 25, 'saint-laurent'),
            ('Fort Saint-Nicolas', 'attraction', 60, 'fort-saint-nicolas'),
            ('Basilique Saint-Victor', 'place_of_worship', 5, 'saint-victor'),
            ('Basilique Notre-Dame de la Garde', 'place_of_worship', 40, 'garde'),
            ('Grotte Cosquer', 'museum', 5, 'villa-mediterranee'),
            ('Mucem', 'museum', 5, 'mucem'), ('MuCEM', 'museum', 5, 'mucem'),
            ("Musée des Civilisations de l'Europe et de la Méditerranée", 'museum', 5, 'mucem'),
            ("Porte d'Aix", 'monument', 12, 'porte-aix'),
            ('Église Saint-Vincent-de-Paul-Les Réformés', 'place_of_worship', 30, 'reformes'),
        )},
    },
    'paris': {
        'nom': 'Paris',
        'centre': (48.8548, 2.3485),
        'notes': 'Île de la Cité, quais de Seine, Châtelet, Saint-Michel. Centre à revoir sur l\'aperçu.',
    },
    'new-york': {
        'nom': 'New York',
        'centre': (40.7575, -73.9850),
        'notes': 'Midtown, Times Square. Centre à revoir sur l\'aperçu.',
    },
}
ZOOM = 14
MODELE_TUILE = '{cle}-{z}-{x}-{y}.pbf'
URL_TUILES = 'https://tiles.openfreemap.org/planet'      # description du service (TileJSON) : modèle des tuiles
AGENT = 'osm-extract-client/1.0'

# Carrés de jeu : côté (m) selon les îlots par côté (PDR.regles.ilots), au plus 10 % de l'écart avec le damier de
# ville.js (mesuré sur 40 graines : 662 m de moyenne à 9 îlots ; 939 m à 13 et 1 078 m à 15 dans la version en cours).
CARRES = {9: 660, 13: 950, 15: 1100}
MARGE = 60.0                                   # m autour du plus grand carré
DEMI = max(CARRES.values()) / 2 + MARGE        # demi-côté de la zone extraite : 610 m
QUANTUM = 0.1                                  # m : les coordonnées sont entières en décimètres
TOLERANCE = 0.4                                # m : Douglas-Peucker
ATTRIBUTION = ("© les contributeurs d'OpenStreetMap — données sous licence ODbL "
               "(https://www.openstreetmap.org/copyright) · tuiles OpenFreeMap, schéma OpenMapTiles")

COUCHES = ('building', 'transportation', 'transportation_name', 'water', 'landcover', 'landuse', 'poi', 'place',
           'water_name', 'park', 'mountain_peak')


# ---- Protobuf et Mapbox Vector Tile ------------------------------------------------------------------------------
def _varint(b, i):
    r = b[i]
    i += 1
    if r < 0x80:
        return r, i
    r &= 0x7F
    s = 7
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        if c < 0x80:
            return r, i
        s += 7


def _champs(b, i=0, n=None):
    """Champs d'un message protobuf : (numéro, type filaire, valeur ou (début, fin) pour un bloc)."""
    n = len(b) if n is None else n
    while i < n:
        cle, i = _varint(b, i)
        typ = cle & 7
        if typ == 0:
            v, i = _varint(b, i)
            yield cle >> 3, 0, v
        elif typ == 2:
            l, i = _varint(b, i)
            yield cle >> 3, 2, (i, i + l)
            i += l
        elif typ == 1:
            yield cle >> 3, 1, (i, i + 8)
            i += 8
        elif typ == 5:
            yield cle >> 3, 5, (i, i + 4)
            i += 4
        else:
            raise ValueError(f'protobuf : type filaire {typ} inconnu')


def _paquet(b, debut, fin):
    """Entiers non signés d'un champ « packed »."""
    out = []
    i = debut
    while i < fin:
        v, i = _varint(b, i)
        out.append(v)
    return out


def _valeur(b, debut, fin):
    for num, typ, v in _champs(b, debut, fin):
        if num == 1:
            return bytes(b[v[0]:v[1]]).decode('utf-8')
        if num == 2:
            return struct.unpack_from('<f', b, v[0])[0]
        if num == 3:
            return struct.unpack_from('<d', b, v[0])[0]
        if num == 4:
            return v - (1 << 64) if v >= 1 << 63 else v
        if num == 5:
            return v
        if num == 6:
            return (v >> 1) ^ -(v & 1)
        if num == 7:
            return bool(v)
    return None


def lire_tuile(octets, couches=COUCHES):
    """Décode une tuile MVT : { couche: (extent, [(type, attributs, commandes)]) } ; type 1 point, 2 ligne, 3 polygone."""
    if octets[:2] == b'\x1f\x8b':
        octets = gzip.decompress(octets)
    b = memoryview(octets)
    resultat = {}
    for num, typ, (d, f) in _champs(b):
        if num != 3:
            continue
        nom, extent, cles, valeurs, objets = None, 4096, [], [], []
        for n2, t2, v2 in _champs(b, d, f):
            if n2 == 1:
                nom = bytes(b[v2[0]:v2[1]]).decode()
                if nom not in couches:
                    break
            elif n2 == 5:
                extent = v2
            elif n2 == 3:
                cles.append(bytes(b[v2[0]:v2[1]]).decode())
            elif n2 == 4:
                valeurs.append(v2)
            elif n2 == 2:
                objets.append(v2)
        if nom not in couches:
            continue
        valeurs = [_valeur(b, d2, f2) for d2, f2 in valeurs]
        liste = []
        for d3, f3 in objets:
            etiquettes, gtype, commandes = [], 0, []
            for n3, t3, v3 in _champs(b, d3, f3):
                if n3 == 2:
                    etiquettes = _paquet(b, *v3)
                elif n3 == 3:
                    gtype = v3
                elif n3 == 4:
                    commandes = _paquet(b, *v3)
            attributs = {cles[etiquettes[k]]: valeurs[etiquettes[k + 1]] for k in range(0, len(etiquettes) - 1, 2)}
            liste.append((gtype, attributs, commandes))
        resultat[nom] = (extent, liste)
    return resultat


def geometrie(commandes, gtype, ox, oy):
    """Commandes MVT → parties en coordonnées globales (unités de tuile, origine du monde) ; ox, oy : coin de la tuile.
    Points : [(x, y)] ; lignes : [[(x, y)…]] ; polygones : [[anneau extérieur, trous…]] (anneaux sans point répété)."""
    x = y = 0
    i, n = 0, len(commandes)
    parties, courant = [], None
    while i < n:
        c = commandes[i]
        i += 1
        cid, nb = c & 7, c >> 3
        if cid == 1 or cid == 2:
            if cid == 1 and courant is not None and gtype != 1:
                parties.append(courant)
            for _ in range(nb):
                dx, dy = commandes[i], commandes[i + 1]
                i += 2
                x += (dx >> 1) ^ -(dx & 1)
                y += (dy >> 1) ^ -(dy & 1)
                if gtype == 1:
                    parties.append((ox + x, oy + y))
                elif cid == 1:
                    courant = [(ox + x, oy + y)]
                else:
                    courant.append((ox + x, oy + y))
        elif cid == 7:
            if courant is not None:
                parties.append(courant)
                courant = None
    if courant is not None and gtype != 1:
        parties.append(courant)
    if gtype != 3:
        return parties
    # Anneaux : aire positive (au sens de la tuile, y vers le bas) pour un extérieur, négative pour un trou.
    polygones = []
    for anneau in parties:
        if len(anneau) > 1 and anneau[0] == anneau[-1]:
            anneau = anneau[:-1]
        a = aire(anneau)
        if a > 0:
            polygones.append([anneau])
        elif a < 0 and polygones:
            polygones[-1].append(anneau)
    return polygones


# ---- Géométrie plane ---------------------------------------------------------------------------------------------
def aire(anneau):
    """Aire signée (formule du géomètre) ; positive pour un anneau horaire vu sur la carte (y ou z vers le sud)."""
    s = 0.0
    n = len(anneau)
    if n < 3:
        return 0.0
    x0, y0 = anneau[-1]
    for x1, y1 in anneau:
        s += x0 * y1 - x1 * y0
        x0, y0 = x1, y1
    return s / 2


def boite(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def decouper_anneau(anneau, x0, y0, x1, y1):
    """Sutherland-Hodgman sur le rectangle [x0, x1] × [y0, y1]. Les points coupés sont exactement sur le bord."""
    bx0, by0, bx1, by1 = boite(anneau)
    if bx0 >= x0 and bx1 <= x1 and by0 >= y0 and by1 <= y1:
        return list(anneau)
    if bx1 < x0 or bx0 > x1 or by1 < y0 or by0 > y1:
        return []
    pts = anneau
    for bord in range(4):
        if not pts:
            break
        if bord == 0:
            dedans = lambda p: p[0] >= x0
            coupe = lambda p, q: (x0, p[1] + (q[1] - p[1]) * (x0 - p[0]) / (q[0] - p[0]))
        elif bord == 1:
            dedans = lambda p: p[0] <= x1
            coupe = lambda p, q: (x1, p[1] + (q[1] - p[1]) * (x1 - p[0]) / (q[0] - p[0]))
        elif bord == 2:
            dedans = lambda p: p[1] >= y0
            coupe = lambda p, q: (p[0] + (q[0] - p[0]) * (y0 - p[1]) / (q[1] - p[1]), y0)
        else:
            dedans = lambda p: p[1] <= y1
            coupe = lambda p, q: (p[0] + (q[0] - p[0]) * (y1 - p[1]) / (q[1] - p[1]), y1)
        sortie = []
        prec = pts[-1]
        prec_dedans = dedans(prec)
        for p in pts:
            p_dedans = dedans(p)
            if p_dedans:
                if not prec_dedans:
                    sortie.append(coupe(prec, p))
                sortie.append(p)
            elif prec_dedans:
                sortie.append(coupe(prec, p))
            prec, prec_dedans = p, p_dedans
        pts = sortie
    return sans_doublons(pts, ferme=True)


def sans_doublons(points, ferme=False):
    out = []
    for p in points:
        if not out or p != out[-1]:
            out.append(p)
    if ferme:
        while len(out) > 1 and out[0] == out[-1]:
            out.pop()
    return out


def decouper_ligne(ligne, x0, y0, x1, y1):
    """Liang-Barsky segment par segment : morceaux de la polyligne dans le rectangle, bouts exactement sur le bord."""
    bx0, by0, bx1, by1 = boite(ligne)
    if bx0 >= x0 and bx1 <= x1 and by0 >= y0 and by1 <= y1:
        return [list(ligne)]
    if bx1 < x0 or bx0 > x1 or by1 < y0 or by0 > y1:
        return []
    bords = (x0, x1, y0, y1)
    morceaux, courant = [], []
    for k in range(len(ligne) - 1):
        (ax, ay), (bx, by) = ligne[k], ligne[k + 1]
        dx, dy = bx - ax, by - ay
        t0, t1, b0, b1 = 0.0, 1.0, -1, -1
        ok = True
        for bord, p, q in ((0, -dx, ax - x0), (1, dx, x1 - ax), (2, -dy, ay - y0), (3, dy, y1 - ay)):
            if p == 0:
                if q < 0:
                    ok = False
                    break
                continue
            t = q / p
            if p < 0:
                if t > t1:
                    ok = False
                    break
                if t > t0:
                    t0, b0 = t, bord
            else:
                if t < t0:
                    ok = False
                    break
                if t < t1:
                    t1, b1 = t, bord
        if not ok:
            if courant:
                morceaux.append(courant)
                courant = []
            continue

        def point(t, bord, defaut):
            if bord < 0:
                return defaut
            px, py = ax + dx * t, ay + dy * t
            # Le point coupé est posé exactement sur le bord qu'il franchit.
            if bord < 2:
                px = bords[bord]
            else:
                py = bords[bord]
            return (px, py)
        a, b = point(t0, b0, (ax, ay)), point(t1, b1, (bx, by))
        if courant and courant[-1] == a:
            courant.append(b)
        else:
            if courant:
                morceaux.append(courant)
            courant = [a, b]
        if b1 >= 0:
            morceaux.append(courant)
            courant = []
    if courant:
        morceaux.append(courant)
    out = []
    for m in morceaux:
        m = sans_doublons(m)
        if len(m) >= 2:
            out.append(m)
    return out


def dans_anneau(x, y, anneau):
    """Point dans un anneau (règle pair-impair)."""
    dedans = False
    x0, y0 = anneau[-1]
    for x1, y1 in anneau:
        if (y1 > y) != (y0 > y) and x < x0 + (x1 - x0) * (y - y0) / (y1 - y0):
            dedans = not dedans
        x0, y0 = x1, y1
    return dedans


def separer_au_bord(anneau, x0, y0, x1, y1):
    """Sutherland-Hodgman laisse d'un seul tenant un anneau concave qui sort du carré et y rentre : les morceaux
    restent liés par des allers-retours le long du bord (des ponts de largeur nulle). On rend les vrais morceaux :
    chaque chaîne intérieure va d'une entrée à une sortie sur le bord, et chaque sortie rejoint l'entrée suivante en
    longeant le bord dans le sens de l'anneau (sens direct du carré pour un extérieur, inverse pour un trou)."""
    n = len(anneau)
    sur_bord = [(p[0] == q[0] and p[0] in (x0, x1)) or (p[1] == q[1] and p[1] in (y0, y1))
                for p, q in zip(anneau, anneau[1:] + anneau[:1])]
    if all(sur_bord) or not any(sur_bord):
        return [anneau]
    d = next(i for i in range(n) if sur_bord[i - 1] and not sur_bord[i])
    r, b = anneau[d:] + anneau[:d], sur_bord[d:] + sur_bord[:d]
    chaines = []
    for i in range(n):                     # r[0] ouvre une chaîne ; la dernière arête, sur le bord, la ferme
        if not b[i]:
            if i == 0 or b[i - 1]:
                chaines.append([r[i]])
            chaines[-1].append(r[(i + 1) % n])
    if len(chaines) < 2:
        return [anneau]
    # Abscisse curviligne le long du bord, dans le sens où l'aire du carré est positive.
    W, H = x1 - x0, y1 - y0
    P = 2 * (W + H)

    def s(p):
        if p[1] == y0:
            return p[0] - x0
        if p[0] == x1:
            return W + p[1] - y0
        if p[1] == y1:
            return W + H + x1 - p[0]
        return 2 * W + H + y1 - p[1]
    coins = [(0.0, (x0, y0)), (W, (x1, y0)), (W + H, (x1, y1)), (2 * W + H, (x0, y1))]
    sens = 1 if aire(anneau) > 0 else -1
    debuts = [s(c[0]) for c in chaines]
    suivante = []
    for c in chaines:
        se = s(c[-1])
        k = min(range(len(chaines)), key=lambda j: ((debuts[j] - se) * sens) % P)
        ecart = ((debuts[k] - se) * sens) % P
        passes = sorted((((sc - se) * sens) % P, p) for sc, p in coins if 0 < ((sc - se) * sens) % P < ecart)
        suivante.append((k, [p for _, p in passes]))
    morceaux, vu = [], [False] * len(chaines)
    for i0 in range(len(chaines)):
        if vu[i0]:
            continue
        m, i = [], i0
        while not vu[i]:
            vu[i] = True
            k, passes = suivante[i]
            m += chaines[i] + passes
            i = k
        if i != i0:
            return [anneau]                # chaînage incohérent : on garde l'anneau tel quel
        m = sans_doublons(m, ferme=True)
        if len(m) >= 3 and abs(aire(m)) > 1e-6:
            morceaux.append(m)
    if abs(sum(aire(m) for m in morceaux) - aire(anneau)) > 1e-6 * max(1.0, abs(aire(anneau))):
        return [anneau]
    return morceaux


def separer_polygone(poly, x0, y0, x1, y1):
    """Polygone [extérieur, trous…] découpé au carré → ses vrais morceaux ; chaque trou va au plus petit morceau qui
    le contient."""
    exts = separer_au_bord(poly[0], x0, y0, x1, y1)
    trous = [m for t in poly[1:] for m in separer_au_bord(t, x0, y0, x1, y1)]
    if len(exts) == 1:
        return [[exts[0]] + trous]
    morceaux = [[e] for e in sorted(exts, key=lambda e: abs(aire(e)))]
    for t in trous:
        px, py = next((p for p in t if p[0] not in (x0, x1) and p[1] not in (y0, y1)), t[0])
        hote = next((m for m in morceaux if dans_anneau(px, py, m[0])), None)
        if hote:
            hote.append(t)
    return morceaux


# ---- Recollage des tuiles ----------------------------------------------------------------------------------------
class Coupes:
    """Lignes de coupe intérieures : bords communs de deux tuiles chargées, dans le carré extrait."""

    def __init__(self, xs, ys):
        self.xs, self.ys = set(xs), set(ys)

    def arete(self, p, q):
        return (p[0] == q[0] and p[0] in self.xs) or (p[1] == q[1] and p[1] in self.ys)

    def cles(self, p):
        """Lignes qui portent le point p, avec la position du point le long de chacune."""
        out = []
        if p[0] in self.xs:
            out.append((('x', p[0]), p[1]))
        if p[1] in self.ys:
            out.append((('y', p[1]), p[0]))
        return out


def recoller_polygones(morceaux, coupes, tol):
    """Recolle les morceaux d'un même groupe d'attributs coupés aux bords des tuiles.
    morceaux : [(tuile, polygone)], chaque polygone déjà découpé à l'emprise exacte de sa tuile ; les morceaux ne se
    recouvrent donc pas. On coupe chaque anneau en chaînes aux arêtes posées sur une ligne de coupe, puis on raccorde le
    bout d'une chaîne au début d'une chaîne d'une autre tuile, au même point de la même ligne (à tol près). Une
    composante dont une chaîne ne se raccorde pas, ou dont l'aire change, garde ses morceaux tels quels.
    Rend (polygones, nombre de raccords réussis)."""
    if not coupes.xs and not coupes.ys:
        return [p for _, p in morceaux], 0
    anneaux = []            # (tuile, points, indice du morceau)
    libres = []             # morceaux sans arête de coupe : rendus tels quels
    for im, (tuile, poly) in enumerate(morceaux):
        touche = False
        for anneau in poly:
            n = len(anneau)
            if any(coupes.arete(anneau[i], anneau[(i + 1) % n]) for i in range(n)):
                touche = True
                break
        if not touche:
            libres.append(poly)
            continue
        for anneau in poly:
            anneaux.append((tuile, anneau, im))
    if not anneaux:
        return libres, 0

    # Chaînes : suites d'arêtes hors des lignes de coupe.
    chaines = []            # (indice de l'anneau, points)
    sans_chaine = set()     # anneaux sans arête de coupe (trous intérieurs, par exemple)
    for ia, (tuile, anneau, im) in enumerate(anneaux):
        n = len(anneau)
        coupe = [coupes.arete(anneau[i], anneau[(i + 1) % n]) for i in range(n)]
        if not any(coupe):
            sans_chaine.add(ia)
            continue
        i0 = coupe.index(True)
        ordre = anneau[i0 + 1:] + anneau[:i0 + 1]
        c = coupe[i0 + 1:] + coupe[:i0 + 1]
        courant = [ordre[0]]
        for j in range(n):
            suivant = ordre[(j + 1) % n]
            if c[j]:
                if len(courant) >= 2:
                    chaines.append((ia, courant))
                courant = [suivant]
            else:
                courant.append(suivant)

    # Raccords : bout d'une chaîne → début d'une chaîne d'une autre tuile.
    seau = lambda v: math.floor(v / tol)
    debuts = {}
    for ic, (ia, pts) in enumerate(chaines):
        for cle, pos in coupes.cles(pts[0]):
            debuts.setdefault((cle, seau(pos)), []).append(ic)
    suivant, precedent = [-1] * len(chaines), [-1] * len(chaines)
    parent = list(range(len(anneaux)))

    def racine(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for ic, (ia, pts) in enumerate(chaines):
        fin = pts[-1]
        tuile = anneaux[ia][0]
        meilleur, dmin = -1, tol
        for cle, pos in coupes.cles(fin):
            s = seau(pos)
            for k in (s - 1, s, s + 1):
                for jc in debuts.get((cle, k), ()):
                    if precedent[jc] >= 0 or anneaux[chaines[jc][0]][0] == tuile:
                        continue
                    q = chaines[jc][1][0]
                    d = math.hypot(q[0] - fin[0], q[1] - fin[1])
                    if d <= dmin and (meilleur < 0 or d < dmin or jc < meilleur):
                        meilleur, dmin = jc, d
        if meilleur >= 0:
            suivant[ic], precedent[meilleur] = meilleur, ic
            ra, rb = racine(ia), racine(chaines[meilleur][0])
            if ra != rb:
                parent[max(ra, rb)] = min(ra, rb)

    # Composantes : réussies si toutes leurs chaînes se referment et si l'aire totale se conserve.
    composantes = {}
    for ia in range(len(anneaux)):
        composantes.setdefault(racine(ia), []).append(ia)
    rate = set()
    for ic, (ia, _) in enumerate(chaines):
        if suivant[ic] < 0 or precedent[ic] < 0:
            rate.add(racine(ia))
    cycles = {}
    vu = [False] * len(chaines)
    for ic in range(len(chaines)):
        r = racine(chaines[ic][0])
        if vu[ic] or r in rate:
            continue
        pts, jc = [], ic
        while jc >= 0 and not vu[jc]:
            vu[jc] = True
            morceau = chaines[jc][1]
            pts.extend(morceau[1:] if pts and morceau[0] == pts[-1] else morceau)
            jc = suivant[jc]
        if jc != ic:
            rate.add(r)
            continue
        pts = sans_doublons(pts, ferme=True)
        if len(pts) >= 3:
            cycles.setdefault(r, []).append(pts)
    exterieurs, trous, raccords = [], [], 0
    for r, membres in composantes.items():
        avec_chaines = [ia for ia in membres if ia not in sans_chaine]
        if r not in rate and avec_chaines:
            avant = sum(aire(anneaux[ia][1]) for ia in avec_chaines)
            apres = sum(aire(c) for c in cycles.get(r, ()))
            if abs(apres - avant) > 1.0 + 1e-3 * abs(avant):
                rate.add(r)
        if r in rate or not avec_chaines:
            for ia in membres:
                (exterieurs if aire(anneaux[ia][1]) > 0 else trous).append(anneaux[ia][1])
            continue
        raccords += 1
        for ia in membres:
            if ia in sans_chaine:
                (exterieurs if aire(anneaux[ia][1]) > 0 else trous).append(anneaux[ia][1])
        for c in cycles.get(r, ()):
            (exterieurs if aire(c) > 0 else trous).append(c)
    # Chaque trou va au plus petit extérieur qui le contient.
    polys = [[e] for e in exterieurs]
    boites = [boite(e) for e in exterieurs]
    aires = [aire(e) for e in exterieurs]
    for t in trous:
        x, y = t[0]
        choix = -1
        for k, (bx0, by0, bx1, by1) in enumerate(boites):
            if bx0 <= x <= bx1 and by0 <= y <= by1 and dans_anneau(x, y, exterieurs[k]):
                if choix < 0 or aires[k] < aires[choix]:
                    choix = k
        if choix >= 0:
            polys[choix].append(t)
    return libres + polys, raccords


def raccorder_lignes(morceaux, coupes, tol, orientees):
    """Joint les morceaux de lignes d'un même groupe d'attributs qui se touchent sur une ligne de coupe, entre deux
    tuiles. orientees : on ne retourne pas une ligne (sens unique). morceaux : [(tuile, points)]. Rend [points]."""
    lignes = [list(p) for _, p in morceaux]
    if not coupes.xs and not coupes.ys:
        return lignes
    # Tuile de chaque bout : un raccord se fait toujours entre deux tuiles différentes.
    bouts = [[t, t] for t, _ in morceaux]
    vivant = [True] * len(lignes)
    seau = lambda v: math.floor(v / tol)
    index = {}

    def inscrire(i):
        for b in (0, -1):
            for cle, pos in coupes.cles(lignes[i][b]):
                index.setdefault((cle, seau(pos)), set()).add(i)

    def chercher(i, b):
        p, tuile = lignes[i][b], bouts[i][b]
        meilleur, dmin = None, tol
        for cle, pos in coupes.cles(p):
            s = seau(pos)
            for k in (s - 1, s, s + 1):
                for j in sorted(index.get((cle, k), ())):
                    if j == i or not vivant[j]:
                        continue
                    for bj in ((0,) if orientees else (0, -1)):
                        if bouts[j][bj] == tuile:
                            continue
                        q = lignes[j][bj]
                        d = math.hypot(q[0] - p[0], q[1] - p[1])
                        if d <= dmin and (meilleur is None or d < dmin):
                            meilleur, dmin = (j, bj), d
        return meilleur
    for i in range(len(lignes)):
        inscrire(i)
    for i in range(len(lignes)):
        while vivant[i]:
            trouve = chercher(i, -1)
            if trouve is None and not orientees:
                trouve = chercher(i, 0)
                if trouve is not None:
                    lignes[i].reverse()
                    bouts[i].reverse()
            if trouve is None:
                break
            j, bj = trouve
            autre = lignes[j] if bj == 0 else lignes[j][::-1]
            lignes[i] = lignes[i] + autre[1:]
            bouts[i][1] = bouts[j][1] if bj == 0 else bouts[j][0]
            vivant[j] = False
            inscrire(i)
    return [l for l, v in zip(lignes, vivant) if v]


# ---- Simplification ----------------------------------------------------------------------------------------------
def douglas_peucker(points, tol, garder=None):
    """Douglas-Peucker itératif sur une polyligne ; garder : indices imposés (angles de façade)."""
    n = len(points)
    if n <= 2:
        return list(points)
    garde = bytearray(n)
    garde[0] = garde[-1] = 1
    if garder:
        for k in garder:
            garde[k] = 1
    bornes = [k for k in range(n) if garde[k]]
    pile = [(bornes[k], bornes[k + 1]) for k in range(len(bornes) - 1)]
    t2 = tol * tol
    while pile:
        a, b = pile.pop()
        if b - a < 2:
            continue
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        pire, dpire = -1, t2
        for k in range(a + 1, b):
            px, py = points[k]
            if l2 == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / l2
                t = 0.0 if t < 0 else 1.0 if t > 1 else t
                d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d > dpire:
                pire, dpire = k, d
        if pire >= 0:
            garde[pire] = 1
            pile.append((a, pire))
            pile.append((pire, b))
    return [points[k] for k in range(n) if garde[k]]


def simplifier_anneau(anneau, tol, angle_min=28.0, cote_min=1.0):
    """Douglas-Peucker sur un anneau fermé. Un angle de façade (virage d'au moins angle_min degrés entre deux côtés
    d'au moins cote_min mètres) est toujours gardé ; le reste, souvent le bruit de la grille des tuiles, est lissé."""
    n = len(anneau)
    if n <= 3:
        return list(anneau)
    garder = []
    cmin = math.cos(math.radians(angle_min))
    for k in range(n):
        ax, ay = anneau[k - 1]
        bx, by = anneau[k]
        cx, cy = anneau[(k + 1) % n]
        ux, uy, vx, vy = bx - ax, by - ay, cx - bx, cy - by
        lu, lv = math.hypot(ux, uy), math.hypot(vx, vy)
        if lu >= cote_min and lv >= cote_min and (ux * vx + uy * vy) / (lu * lv) <= cmin:
            garder.append(k)
    # Départ : un angle gardé, sinon le point le plus à l'ouest (puis au nord) ; on referme sur lui.
    if garder:
        k0 = garder[0]
    else:
        k0 = min(range(n), key=lambda k: (anneau[k][0], anneau[k][1]))
    ordre = anneau[k0:] + anneau[:k0] + [anneau[k0]]
    imposes = sorted({(k - k0) % n for k in garder})
    if not garder:
        # Sans angle franc, le point le plus éloigné du départ sert de second appui.
        x0, y0 = ordre[0]
        imposes = [max(range(n), key=lambda k: (ordre[k][0] - x0) ** 2 + (ordre[k][1] - y0) ** 2)]
    out = douglas_peucker(ordre, tol, imposes)[:-1]
    return out if len(out) >= 3 else list(anneau)


# ---- Projection --------------------------------------------------------------------------------------------------
class Projection:
    """Unités globales des tuiles (relatives à une origine entière proche du centre) ↔ mètres locaux.
    x = (lon - lon0) · N0 cos φ0 · π/180, z = -(lat - lat0) · M0 · π/180 : échelle exacte au centre, sur l'ellipsoïde
    WGS 84 (N0, M0 : rayons de courbure au centre) ; l'écart d'échelle au bord du carré reste sous 1e-4."""

    def __init__(self, lat0, lon0, zoom=ZOOM, extent=4096):
        self.lat0, self.lon0, self.zoom, self.extent = lat0, lon0, zoom, extent
        a, f = 6378137.0, 1 / 298.257223563
        e2 = f * (2 - f)
        s = math.sin(math.radians(lat0))
        w = math.sqrt(1 - e2 * s * s)
        self.kx = a / w * math.cos(math.radians(lat0)) * math.pi / 180      # m par degré de longitude
        self.kz = a * (1 - e2) / w ** 3 * math.pi / 180                      # m par degré de latitude
        self.G = (1 << zoom) * extent                                        # unités sur le tour du monde
        X, Y = self.globales(lat0, lon0)
        self.ox, self.oy = math.floor(X), math.floor(Y)

    def globales(self, lat, lon):
        X = (lon + 180) / 360 * self.G
        Y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * self.G
        return X, Y

    def unites(self, x, z):
        """Mètres locaux → unités relatives à l'origine."""
        lat, lon = self.lat0 - z / self.kz, self.lon0 + x / self.kx
        X, Y = self.globales(lat, lon)
        return X - self.ox, Y - self.oy

    def metres(self, p):
        X, Y = p[0] + self.ox, p[1] + self.oy
        lon = X / self.G * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * Y / self.G))))
        return ((lon - self.lon0) * self.kx, -(lat - self.lat0) * self.kz)

    def latlon(self, x, z):
        return self.lat0 - z / self.kz, self.lon0 + x / self.kx


# ---- Lecture des tuiles d'une ville ------------------------------------------------------------------------------
# Attributs gardés par couche ; ils forment aussi la clé des groupes que l'on recolle.
ATTRIBUTS = {
    'building': ('render_height', 'render_min_height', 'colour', 'hide_3d'),
    'transportation': ('class', 'subclass', 'brunnel', 'layer', 'level', 'indoor', 'oneway', 'ramp', 'service',
                       'access', 'surface'),
    'transportation_name': ('name', 'class', 'subclass', 'layer', 'level', 'indoor', 'ref'),
    'water': ('class', 'brunnel', 'intermittent', 'id'),
    'landcover': ('class', 'subclass'),
    'landuse': ('class',),
    'park': ('class', 'name', 'rank'),
    'poi': ('name', 'class', 'subclass', 'rank', 'level', 'layer', 'indoor'),
    'place': ('name', 'class', 'rank', 'capital'),
    'water_name': ('name', 'class'),
    'mountain_peak': ('name', 'class', 'ele', 'rank'),
}
TOL_RACCORD = 1.5          # unités de tuile (≈ 0,65 m à Marseille) : écart admis entre deux bouts à raccorder


def tuiles_utiles(cle, centre, dossier, demi=DEMI, zone=None):
    """Tuiles qui couvrent le carré extrait (demi-côté demi, en m) ou le rectangle zone = (x0, z0, x1, z1) en m, et
    leurs fichiers."""
    proj = Projection(*centre)
    E = proj.extent
    x0, z0, x1, z1 = zone or (-demi, -demi, demi, demi)
    X0, _ = proj.unites(x0, 0)
    X1, _ = proj.unites(x1, 0)
    _, Y0 = proj.unites(0, z0)
    _, Y1 = proj.unites(0, z1)
    carre = (X0, Y0, X1, Y1)
    tx0, tx1 = math.floor((X0 + proj.ox) / E), math.floor((X1 + proj.ox) / E)
    ty0, ty1 = math.floor((Y0 + proj.oy) / E), math.floor((Y1 + proj.oy) / E)
    tuiles = []
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            nom = MODELE_TUILE.format(cle=cle, z=ZOOM, x=tx, y=ty)
            tuiles.append((tx, ty, pathlib.Path(dossier) / nom))
    return proj, carre, tuiles


def charger(cle, centre, dossier, demi=DEMI, journal=print, zone=None):
    """Lit les tuiles d'une ville et rend ses objets en mètres locaux, découpés au carré extrait (ou au rectangle
    zone = (x0, z0, x1, z1), en m) :
    { couche: [(attributs, géométrie)] } ; géométrie : point (x, z), ligne [(x, z)…] ou polygone [anneau, trous…].
    Les polygones de la couche transportation (aires piétonnes, ponts, jetées) sont rangés sous 'transportation_aire'."""
    proj, (X0, Y0, X1, Y1), tuiles = tuiles_utiles(cle, centre, dossier, demi, zone)
    manquantes = [t for t in tuiles if not t[2].exists()]
    if manquantes:
        lignes = '\n'.join(f'  {ZOOM}/{tx}/{ty} → {p}' for tx, ty, p in manquantes)
        raise SystemExit(f'Tuiles manquantes ({len(manquantes)}) :\n{lignes}\n'
                         f'Voir LISEZMOI.md : modèle des adresses dans {URL_TUILES}, agent « {AGENT} ».')
    E = proj.extent
    morceaux = {}          # (couche, genre, clé) → [(tuile, géométrie)]
    points = {}            # couche → [(attributs, (X, Y))]
    stats = {'tuiles': [p.name for _, _, p in tuiles], 'octets': 0}
    for tx, ty, chemin in tuiles:
        octets = chemin.read_bytes()
        stats['octets'] += len(octets)
        tuile = lire_tuile(octets)
        ox, oy = tx * E - proj.ox, ty * E - proj.oy
        # Emprise exacte de la tuile dans le carré : ce qui déborde (zone tampon) appartient à la voisine.
        rx0, ry0, rx1, ry1 = max(ox, X0), max(oy, Y0), min(ox + E, X1), min(oy + E, Y1)
        if rx0 >= rx1 or ry0 >= ry1:
            continue
        for couche, (extent, objets) in tuile.items():
            if extent != E:
                raise SystemExit(f'{chemin.name} : la couche {couche} a un extent de {extent}, {E} attendu')
            gardes = ATTRIBUTS[couche]
            for gtype, attributs, commandes in objets:
                attrs = tuple((k, attributs[k]) for k in gardes if k in attributs)
                parties = geometrie(commandes, gtype, ox, oy)
                if gtype == 1:
                    for (x, y) in parties:
                        # Emprise propre de la tuile, moitié ouverte : un point d'un bord commun ne compte qu'une fois.
                        if ox <= x < ox + E and oy <= y < oy + E and X0 <= x <= X1 and Y0 <= y <= Y1:
                            points.setdefault(couche, []).append((dict(attrs), (x, y)))
                elif gtype == 2:
                    for ligne in parties:
                        for m in decouper_ligne(ligne, rx0, ry0, rx1, ry1):
                            morceaux.setdefault((couche, 2, attrs), []).append(((tx, ty), m))
                elif gtype == 3:
                    for poly in parties:
                        ext = decouper_anneau(poly[0], rx0, ry0, rx1, ry1)
                        if len(ext) < 3 or abs(aire(ext)) < 1e-6:
                            continue
                        trous = []
                        for t in poly[1:]:
                            t = decouper_anneau(t, rx0, ry0, rx1, ry1)
                            if len(t) >= 3 and abs(aire(t)) >= 1e-6:
                                trous.append(t)
                        morceaux.setdefault((couche, 3, attrs), []).append(((tx, ty), [ext] + trous))
    # Lignes de coupe : bords communs de deux tuiles, strictement dans le carré.
    txs = sorted({tx for tx, _, _ in tuiles})
    tys = sorted({ty for _, ty, _ in tuiles})
    coupes = Coupes([tx * E - proj.ox for tx in txs[1:] if X0 < tx * E - proj.ox < X1],
                    [ty * E - proj.oy for ty in tys[1:] if Y0 < ty * E - proj.oy < Y1])
    resultat = {}
    raccords = avant = apres = scindes = 0
    for (couche, genre, attrs) in sorted(morceaux, key=lambda k: (k[0], k[1], repr(k[2]))):
        liste = morceaux[(couche, genre, attrs)]
        attributs = dict(attrs)
        if genre == 2:
            sens = bool(attributs.get('oneway')) and couche == 'transportation'
            lignes = raccorder_lignes(liste, coupes, TOL_RACCORD, sens)
            cible = resultat.setdefault(couche, [])
            for l in lignes:
                cible.append((attributs, [proj.metres(p) for p in l]))
        else:
            polys, n = recoller_polygones(liste, coupes, TOL_RACCORD)
            raccords += n
            avant += len(liste)
            apres += len(polys)
            nom = 'transportation_aire' if couche == 'transportation' else couche
            cible = resultat.setdefault(nom, [])
            for poly in polys:
                parts = separer_polygone(poly, X0, Y0, X1, Y1)
                scindes += len(parts) > 1
                for m in parts:
                    cible.append((attributs, [[proj.metres(p) for p in anneau] for anneau in m]))
    # Les points d'une couche de lignes ou de polygones (étiquettes d'échangeur, sites du calque park) ont leur liste.
    for couche, liste in sorted(points.items()):
        nom = couche if couche in ('poi', 'place', 'water_name') else couche + '_points'
        resultat.setdefault(nom, []).extend((a, proj.metres(p)) for a, p in liste)
    stats.update(coupes_x=len(coupes.xs), coupes_y=len(coupes.ys), recollages=raccords,
                 morceaux_avant=avant, morceaux_apres=apres, scindes_au_bord=scindes)
    journal(f'{cle} : {len(tuiles)} tuiles, {stats["octets"] / 1e6:.2f} Mo ; coupes {len(coupes.xs)} en x, '
            f'{len(coupes.ys)} en z ; {raccords} recollages ({avant} morceaux → {apres} polygones) ; '
            f'{scindes} polygones scindés au bord du carré')
    return proj, resultat, stats


# ---- Classement --------------------------------------------------------------------------------------------------
# Classes de transportation (OpenMapTiles) → classe des rues du jeu.
CLASSES_RUES = {
    'motorway': 'autoroute', 'trunk': 'voie-express', 'primary': 'primaire', 'secondary': 'secondaire',
    'tertiary': 'tertiaire', 'minor': 'rue', 'service': 'desserte', 'track': 'piste', 'path': 'chemin',
    'busway': 'voie-bus', 'bus_guideway': 'voie-bus', 'raceway': 'circuit', 'rail': 'rail', 'transit': 'rail',
    'pier': 'jetee',
}
# Sous-classes (subclass, ou service pour les dessertes) → sous-classe du jeu ; '' si rien de particulier.
SOUS_CLASSES_RUES = {
    'pedestrian': 'pietonne', 'footway': 'pieton', 'steps': 'escalier', 'cycleway': 'cyclable', 'path': 'sentier',
    'bridleway': 'cavaliere', 'rail': 'train', 'narrow_gauge': 'train', 'preserved': 'train', 'tram': 'tram',
    'light_rail': 'tram', 'funicular': 'funiculaire', 'monorail': 'monorail', 'alley': 'ruelle', 'driveway': 'acces',
    'parking_aisle': 'parking', 'drive-through': 'acces', 'emergency_access': 'acces', 'siding': 'train',
    'spur': 'train', 'yard': 'train', 'crossover': 'train', 'busway': 'bus',
}
# Ce qui ne va pas dans les rues : sous terre, à l'intérieur, sur l'eau, ou les bords des quais d'arrêt.
SOUS_CLASSES_EXCLUES = {'corridor', 'platform', 'subway', 'elevator'}

# Couverture du sol → sorte d'espace. Les zones administratives ou d'usage (quartier, résidentiel, école…) n'en sont
# pas : elles couvrent la ville entière ou des enceintes bâties.
SORTES_LANDCOVER = {
    'park': 'parc', 'recreation_ground': 'parc', 'garden': 'jardin', 'flowerbed': 'jardin', 'allotments': 'jardin',
    'plant_nursery': 'jardin', 'grass': 'pelouse', 'grassland': 'pelouse', 'meadow': 'pelouse',
    'village_green': 'pelouse', 'wood': 'bois', 'forest': 'bois', 'scrub': 'bois', 'heath': 'bois',
    'bare_rock': 'roche', 'scree': 'roche', 'sand': 'sable', 'beach': 'plage', 'wetland': 'marais',
    'golf_course': 'pelouse', 'farmland': 'champ', 'orchard': 'jardin', 'vineyard': 'champ',
}
SORTES_LANDUSE = {
    'pitch': 'terrain', 'track': 'piste', 'playground': 'jeux', 'cemetery': 'cimetiere', 'railway': 'voies',
    'stadium': 'terrain', 'bus_station': 'gare-routiere', 'construction': 'chantier', 'brownfield': 'chantier',
    'dam': 'digue',
}
# Eau.
SORTES_EAU = {'ocean': 'mer', 'dock': 'port', 'river': 'riviere', 'lake': 'bassin', 'pond': 'bassin',
              'swimming_pool': 'piscine'}

# Repères : sous-classe de poi (OpenMapTiles), sinon sa classe → sorte ; None écarte. Les commerces, cafés, bureaux,
# administrations, écoles, soins, œuvres d'art (souvent des personnalités) et postes n'en sont pas : le jeu ne montre
# aucune enseigne, aucun sigle ni aucune personnalité réels.
SORTES_POI = {
    'townhall': 'mairie', 'police': 'police', 'courthouse': 'justice',
    'place_of_worship': 'culte', 'museum': 'musee', 'monument': 'monument', 'memorial': 'monument',
    'castle': 'monument', 'ruins': 'monument', 'fort': 'monument', 'archaeological_site': 'monument',
    'attraction': 'curiosite', 'fountain': 'fontaine', 'marketplace': 'marche', 'theatre': 'theatre',
    'library': 'bibliotheque', 'books': None, 'ferry_terminal': 'embarcadere', 'harbor': 'port',
    'marina': 'port', 'station': 'gare', 'halt': 'gare', 'tram_stop': 'tram', 'subway_entrance': 'metro',
    'park': 'parc', 'garden': 'jardin', 'playground': 'jeux', 'viewpoint': 'point-de-vue', 'stadium': 'stade',
    'community_centre': None,
}
# Mobilier de rue et terrasses : points sans nom (aucune enseigne), par sous-classe de poi, sinon par classe.
SORTES_MOBILIER = {
    'restaurant': 'terrasse', 'cafe': 'terrasse', 'bar': 'terrasse', 'pub': 'terrasse', 'ice_cream': 'terrasse',
    'nightclub': None, 'food_court': None,
    'bollard': 'potelet', 'waste_basket': 'corbeille', 'recycling': 'conteneur', 'bicycle_parking': 'velos',
    'bicycle_rental': 'velos-partage', 'motorcycle_parking': 'motos', 'bus_stop': 'arret-bus', 'shelter': 'abri',
    'post_box': 'boite-lettres', 'drinking_water': 'fontaine-a-boire', 'toilets': 'toilettes', 'kiosk': 'kiosque',
    'artwork': 'oeuvre', 'board': 'panneau', 'map': 'panneau', 'guidepost': 'panneau',
}
# Une bibliothèque n'est retenue que si son nom le dit (OpenMapTiles y range aussi des librairies).
PREFIXES_BIBLIOTHEQUES = ('Bibliothèque', 'Médiathèque', 'Library')
# Lignes nommées qui ne nomment pas une aire : entrées de parking, tunnels, bretelles.
MOTS_TECHNIQUES = ('Parking', 'Tunnel', 'Entrée', 'Sortie', 'Bretelle', 'Accès', 'Trémie')
# Rangs : OpenMapTiles classe chaque poi (1 : le plus en vue) ; on garde ce rang tel quel.
PREFIXES_PLACES = ('Place ', 'Parvis ', 'Esplanade ', 'Placette ', 'Square ', 'Plaza ', 'Piazza ')


def sorte_poi(attrs):
    sous, classe = attrs.get('subclass'), attrs.get('class')
    sorte = SORTES_POI[sous] if sous in SORTES_POI else SORTES_POI.get(classe)
    if sorte == 'bibliotheque' and not (attrs.get('name') or '').startswith(PREFIXES_BIBLIOTHEQUES):
        return None
    return sorte

COULEURS_CSS = {
    'white': 'ffffff', 'blanc': 'ffffff', 'blanche': 'ffffff', 'black': '000000', 'noir': '000000',
    'grey': '808080', 'gray': '808080', 'gris': '808080', 'lightgrey': 'd3d3d3', 'lightgray': 'd3d3d3',
    'darkgrey': 'a9a9a9', 'darkgray': 'a9a9a9', 'silver': 'c0c0c0', 'beige': 'f5f5dc', 'tan': 'd2b48c',
    'yellow': 'ffff00', 'jaune': 'ffff00', 'lightyellow': 'ffffe0', 'ivory': 'fffff0', 'cream': 'fffdd0',
    'wheat': 'f5deb3', 'khaki': 'f0e68c', 'salmon': 'fa8072', 'pink': 'ffc0cb', 'rose': 'ffc0cb',
    'red': 'ff0000', 'rouge': 'ff0000', 'darkred': '8b0000', 'maroon': '800000', 'brown': 'a52a2a',
    'marron': 'a52a2a', 'sienna': 'a0522d', 'orange': 'ffa500', 'gold': 'ffd700', 'aqua': '00ffff',
    'cyan': '00ffff', 'blue': '0000ff', 'bleu': '0000ff', 'lightblue': 'add8e6', 'navy': '000080',
    'green': '008000', 'vert': '008000', 'olive': '808000', 'terracotta': 'e2725b', 'sandybrown': 'f4a460',
    'peru': 'cd853f', 'burlywood': 'deb887', 'linen': 'faf0e6', 'antiquewhite': 'faebd7', 'gainsboro': 'dcdcdc',
}


def couleur(v):
    """Couleur OSM (#rgb, #rrggbb ou nom CSS) → entier 0xRRGGBB, ou None."""
    if not isinstance(v, str):
        return None
    v = v.strip().lower()
    if v.startswith('#'):
        h = v[1:]
        if len(h) == 3:
            h = ''.join(c * 2 for c in h)
        if len(h) == 6 and all(c in '0123456789abcdef' for c in h):
            return int(h, 16)
        return None
    h = COULEURS_CSS.get(v.replace(' ', '').replace('_', ''))
    return int(h, 16) if h else None


def longueur(ligne):
    return sum(math.hypot(ligne[k + 1][0] - ligne[k][0], ligne[k + 1][1] - ligne[k][1]) for k in range(len(ligne) - 1))


class Grille:
    """Index spatial de segments (cases de `case` mètres)."""

    def __init__(self, case=8.0):
        self.case, self.cases = case, {}

    def ajouter(self, a, b, valeur):
        c = self.case
        i0, i1 = sorted((math.floor(a[0] / c), math.floor(b[0] / c)))
        j0, j1 = sorted((math.floor(a[1] / c), math.floor(b[1] / c)))
        for i in range(i0, i1 + 1):
            for j in range(j0, j1 + 1):
                self.cases.setdefault((i, j), []).append((a, b, valeur))

    def autour(self, p, rayon):
        c = self.case
        vus = set()
        for i in range(math.floor((p[0] - rayon) / c), math.floor((p[0] + rayon) / c) + 1):
            for j in range(math.floor((p[1] - rayon) / c), math.floor((p[1] + rayon) / c) + 1):
                for s in self.cases.get((i, j), ()):
                    if id(s) not in vus:
                        vus.add(id(s))
                        yield s


def distance_segment(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def nommer_rues(rues, noms):
    """Donne à chaque tronçon de rue le nom de la ligne de transportation_name qu'il suit : même tracé (milieu du
    segment à moins de 1,5 m, direction à moins de 20°). Une rue qui change de nom en chemin est coupée là."""
    grille = Grille(8.0)
    for attrs, ligne in noms:
        nom = attrs.get('name')
        if not nom:
            continue
        for k in range(len(ligne) - 1):
            grille.ajouter(ligne[k], ligne[k + 1], (nom, attrs.get('class')))
    sin_max = math.sin(math.radians(20))
    sortie = []
    for attrs, ligne in rues:
        etiquettes = []
        for k in range(len(ligne) - 1):
            a, b = ligne[k], ligne[k + 1]
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            ux, uy = b[0] - a[0], b[1] - a[1]
            lu = math.hypot(ux, uy) or 1e-9
            choix, dmin = '', 1.5
            for c, d, (nom, classe) in grille.autour(m, 1.5):
                vx, vy = d[0] - c[0], d[1] - c[1]
                lv = math.hypot(vx, vy) or 1e-9
                if abs(ux * vy - uy * vx) / (lu * lv) > sin_max:
                    continue
                dist = distance_segment(m, c, d)
                # À distance égale, un nom de la même classe l'emporte.
                if classe != attrs.get('class'):
                    dist += 0.25
                if dist < dmin or (dist == dmin and nom < choix):
                    choix, dmin = nom, dist
            etiquettes.append(choix)
        # Un segment sans nom pris entre deux segments du même nom reçoit ce nom (carrefours).
        for k in range(1, len(etiquettes) - 1):
            if not etiquettes[k] and etiquettes[k - 1] and etiquettes[k - 1] == etiquettes[k + 1]:
                etiquettes[k] = etiquettes[k - 1]
        debut = 0
        for k in range(1, len(etiquettes) + 1):
            if k == len(etiquettes) or etiquettes[k] != etiquettes[debut]:
                sortie.append((attrs, etiquettes[debut], ligne[debut:k + 1]))
                debut = k
    return sortie


def centre_polygone(poly):
    """Centre de gravité de l'anneau extérieur (ou le point de l'anneau le plus proche s'il tombe dehors)."""
    anneau = poly[0]
    a = aire(anneau)
    if abs(a) < 1e-9:
        return anneau[0]
    cx = cy = 0.0
    x0, y0 = anneau[-1]
    for x1, y1 in anneau:
        f = x0 * y1 - x1 * y0
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
        x0, y0 = x1, y1
    cx, cy = cx / (6 * a), cy / (6 * a)
    if dans_poly(cx, cy, poly):
        return (cx, cy)
    return min(anneau, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)


def dans_poly(x, y, poly):
    return dans_anneau(x, y, poly[0]) and not any(dans_anneau(x, y, t) for t in poly[1:])


def classer(r, ville=None, journal=print):
    """Objets en mètres (sortie de charger) → plan du jeu, encore en flottants :
    { rues, batiments, eau, espaces, reperes } (voir le format en tête du module écrit).
    ville : l'entrée de VILLES (noms exclus, noms d'aires)."""
    ville = ville or {}
    exclus = set(ville.get('exclus', ()))
    plan = {'rues': [], 'batiments': [], 'eau': [], 'espaces': [], 'reperes': [], 'mobilier': []}
    ecartes = {}

    def ecarter(raison):
        ecartes[raison] = ecartes.get(raison, 0) + 1

    # Rues : ni tunnel, ni sous-sol, ni intérieur ; escaliers et voies piétonnes gardés.
    rues = []
    for attrs, ligne in r.get('transportation', ()):
        classe, sous = attrs.get('class'), attrs.get('subclass')
        couche, niveau = attrs.get('layer') or 0, attrs.get('level') or 0
        if attrs.get('brunnel') == 'tunnel':
            ecarter('rue en tunnel')
        elif couche < 0 or niveau < 0:
            ecarter('rue en sous-sol')
        elif attrs.get('indoor'):
            ecarter('rue intérieure')
        elif classe not in CLASSES_RUES:
            ecarter(f'rue de classe {classe}')
        elif sous in SOUS_CLASSES_EXCLUES:
            ecarter(f'rue de sous-classe {sous}')
        else:
            if attrs.get('oneway') == -1:
                ligne = ligne[::-1]
            rues.append((attrs, ligne))
    for attrs, nom, ligne in nommer_rues(rues, r.get('transportation_name', ())):
        sous = attrs.get('subclass') or attrs.get('service') or ''
        plan['rues'].append({
            'classe': CLASSES_RUES[attrs['class']], 'sousClasse': SOUS_CLASSES_RUES.get(sous, ''), 'nom': nom,
            'pont': attrs.get('brunnel') == 'bridge', 'niveau': max(0, attrs.get('layer') or 0),
            'sens': 1 if attrs.get('oneway') in (1, -1) else 0, 'points': ligne})

    # Bâtiments. Seul compte ce qui dépasse du sol : une base négative (partie enterrée) est ramenée à 0, et un
    # bâtiment sans volume au-dessus du sol (OSM dit 0 m : ouvrage enterré, dalle) n'en est pas un pour le jeu.
    for attrs, poly in r.get('building', ()):
        h, b = attrs.get('render_height', 5), max(0, attrs.get('render_min_height', 0))
        if round(h / QUANTUM) <= round(b / QUANTUM):
            ecarter('bâtiment sans volume')
            continue
        plan['batiments'].append({
            'points': poly[0], 'trous': poly[1:], 'hauteur': float(h), 'base': float(b),
            'connue': not (h == 5 and b == 0), 'couleur': couleur(attrs.get('colour')),
            'contour': bool(attrs.get('hide_3d'))})

    plan['eau'] = eaux_de(r, ecarter)

    # Espaces : couverture du sol, usages au sol, aires piétonnes, quais d'arrêt, jetées et ponts.
    espaces = []
    for attrs, poly in r.get('landcover', ()):
        sorte = SORTES_LANDCOVER.get(attrs.get('subclass')) or SORTES_LANDCOVER.get(attrs.get('class'))
        if sorte:
            espaces.append((sorte, poly, attrs))
        else:
            ecarter(f'couverture {attrs.get("subclass")}')
    for attrs, poly in r.get('landuse', ()):
        sorte = SORTES_LANDUSE.get(attrs.get('class'))
        if sorte:
            espaces.append((sorte, poly, attrs))
        else:
            ecarter(f'usage {attrs.get("class")}')
    for attrs, poly in r.get('transportation_aire', ()):
        classe, sous = attrs.get('class'), attrs.get('subclass')
        if attrs.get('brunnel') == 'tunnel' or (attrs.get('layer') or 0) < 0 or attrs.get('indoor'):
            ecarter('aire en sous-sol')
        elif classe == 'pier':
            espaces.append(('jetee', poly, attrs))
        elif classe == 'bridge' or (attrs.get('brunnel') == 'bridge' and classe != 'path'):
            espaces.append(('pont', poly, attrs))
        elif sous == 'platform':
            espaces.append(('arret', poly, attrs))
        elif classe in ('path', 'minor', 'service', 'track'):
            espaces.append(('pietonne', poly, attrs))
        else:
            ecarter(f'aire {classe}/{sous}')
    # Noms : un repère de parc ou de jardin dans l'espace, un site du calque park ; pour une aire piétonne, le nom
    # que la ville lui donne par un repère OSM qu'elle contient (VILLES[…]['aires']), sinon la ligne nommée qui la
    # parcourt le plus (au moins 8 m dedans ou à moins de 2 m de son bord).
    noms_points = [(a.get('name'), p, sorte_poi(a)) for a, p in r.get('poi', ()) if a.get('name')]
    sites = list(r.get('park', ())) + list(r.get('park_points', ()))     # polygones, puis points
    noms_points += [(a.get('name'), p if isinstance(p, tuple) else centre_polygone(p), 'site')
                    for a, p in sites if a.get('name')]
    ancres = [(ville['aires'][a['name']], p) for a, p in r.get('poi', ()) if a.get('name') in ville.get('aires', {})]
    lignes_nommees = [(a.get('name'), l) for a, l in r.get('transportation_name', ())
                      if a.get('name') and not any(m in a['name'] for m in MOTS_TECHNIQUES)]
    for sorte, poly, attrs in espaces:
        bx0, by0, bx1, by1 = boite(poly[0])
        nom = ''
        if sorte == 'pietonne':
            for (n, s), p in ancres:
                if bx0 <= p[0] <= bx1 and by0 <= p[1] <= by1 and dans_poly(p[0], p[1], poly):
                    nom, sorte = n, s
                    break
        if nom:
            pass
        elif sorte in ('parc', 'jardin', 'pelouse', 'jeux', 'terrain', 'bois', 'cimetiere'):
            for n, p, s in noms_points:
                if s in ('parc', 'jardin', 'jeux', 'site', 'stade') and bx0 <= p[0] <= bx1 and by0 <= p[1] <= by1 \
                        and dans_poly(p[0], p[1], poly):
                    nom = n
                    break
        elif sorte == 'pietonne':
            meilleur = 0.0
            for n, l in lignes_nommees:
                lx0, ly0, lx1, ly1 = boite(l)
                if lx1 < bx0 - 2 or lx0 > bx1 + 2 or ly1 < by0 - 2 or ly0 > by1 + 2:
                    continue
                dedans = 0.0
                for k in range(len(l) - 1):
                    a, b = l[k], l[k + 1]
                    m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                    if dans_poly(m[0], m[1], poly) or min(
                            distance_segment(m, poly[0][i - 1], poly[0][i]) for i in range(len(poly[0]))) < 2.0:
                        dedans += math.hypot(b[0] - a[0], b[1] - a[1])
                if dedans >= 8.0 and dedans > meilleur:
                    nom, meilleur = n, dedans
            if nom.startswith(PREFIXES_PLACES):
                sorte = 'place'
            elif nom.startswith('Quai '):
                sorte = 'quai'
        plan['espaces'].append({'sorte': sorte, 'nom': nom, 'points': poly[0], 'trous': poly[1:]})

    # Repères : poi retenus (doublons de même nom à moins de 60 m fondus, le mieux classé reste), quartiers, noms
    # d'eau, sites, et une place par nom de place (au centre de son aire piétonne, sinon au milieu de ses rues).
    reperes = []
    for attrs, p in r.get('poi', ()):
        sorte = sorte_poi(attrs)
        if not sorte or not attrs.get('name'):
            ecarter('poi hors liste ou sans nom')
            continue
        if attrs['name'] in exclus:
            ecarter('poi exclu par la ville')
            continue
        if (attrs.get('level') or 0) < 0 or (attrs.get('layer') or 0) < 0 or attrs.get('indoor'):
            if sorte not in ('metro',):
                ecarter('poi en sous-sol')
                continue
        reperes.append({'nom': attrs['name'], 'sorte': sorte, 'classe': attrs.get('class') or '',
                        'sousClasse': attrs.get('subclass') or '', 'rang': int(attrs.get('rank') or 0),
                        'x': p[0], 'z': p[1]})
    for attrs, p in r.get('place', ()):
        if attrs.get('name'):
            sorte = 'ville' if attrs.get('class') in ('city', 'town', 'village') else 'quartier'
            reperes.append({'nom': attrs['name'], 'sorte': sorte, 'classe': attrs.get('class') or '',
                            'sousClasse': '', 'rang': int(attrs.get('rank') or 0), 'x': p[0], 'z': p[1]})
    for attrs, p in r.get('water_name', ()):
        if attrs.get('name'):
            reperes.append({'nom': attrs['name'], 'sorte': 'eau', 'classe': attrs.get('class') or '',
                            'sousClasse': '', 'rang': 0, 'x': p[0], 'z': p[1]})
    for attrs, p in sites:
        if attrs.get('name'):
            q = p if isinstance(p, tuple) else centre_polygone(p)
            reperes.append({'nom': attrs['name'], 'sorte': 'site', 'classe': attrs.get('class') or '',
                            'sousClasse': '', 'rang': int(attrs.get('rank') or 0), 'x': q[0], 'z': q[1]})
    places = {}
    for n, l in lignes_nommees:
        if n.startswith(PREFIXES_PLACES):
            places.setdefault(n, []).append(l)
    aires_nommees = {}
    for e in plan['espaces']:
        if e['sorte'] == 'place' and e['nom']:
            aires_nommees.setdefault(e['nom'], []).append(e)
    for n in sorted(set(places) | set(aires_nommees)):
        if n in aires_nommees:
            e = max(aires_nommees[n], key=lambda e: aire(e['points']))
            q = centre_polygone([e['points']] + e['trous'])
        else:
            # Centre de gravité des lignes qui portent ce nom (pondéré par la longueur), ramené sur la plus proche.
            sx = sz = sl = 0.0
            for l in places[n]:
                for k in range(len(l) - 1):
                    s = math.hypot(l[k + 1][0] - l[k][0], l[k + 1][1] - l[k][1])
                    sx += s * (l[k][0] + l[k + 1][0]) / 2
                    sz += s * (l[k][1] + l[k + 1][1]) / 2
                    sl += s
            g = (sx / sl, sz / sl) if sl > 0 else places[n][0][0]
            q, dmin = g, float('inf')
            for l in places[n]:
                for k in range(len(l) - 1):
                    a, b = l[k], l[k + 1]
                    dx, dz = b[0] - a[0], b[1] - a[1]
                    l2 = dx * dx + dz * dz
                    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((g[0] - a[0]) * dx + (g[1] - a[1]) * dz) / l2))
                    p = (a[0] + t * dx, a[1] + t * dz)
                    d = math.hypot(p[0] - g[0], p[1] - g[1])
                    if d < dmin:
                        q, dmin = p, d
        reperes.append({'nom': n, 'sorte': 'place', 'classe': 'square', 'sousClasse': '', 'rang': 0,
                        'x': q[0], 'z': q[1]})
    reperes.sort(key=lambda d: (d['rang'] if d['rang'] > 0 else 10 ** 6, d['nom'], d['sorte'], d['x'], d['z']))
    for d in reperes:
        if any(g['nom'] == d['nom'] and g['sorte'] == d['sorte'] and math.hypot(g['x'] - d['x'], g['z'] - d['z']) < 60
               for g in plan['reperes']):
            ecarter('repère en double')
            continue
        plan['reperes'].append(d)
    # Mobilier : points sans nom, au sol et dehors ; deux points de même sorte à moins de 0,6 m n'en font qu'un.
    vus = set()
    for attrs, p in r.get('poi', ()):
        sous, classe = attrs.get('subclass'), attrs.get('class')
        sorte = SORTES_MOBILIER[sous] if sous in SORTES_MOBILIER else SORTES_MOBILIER.get(classe)
        if not sorte:
            continue
        if (attrs.get('level') or 0) != 0 or (attrs.get('layer') or 0) != 0 or attrs.get('indoor'):
            ecarter('mobilier hors du sol')
            continue
        cle = (sorte, round(p[0] / 0.6), round(p[1] / 0.6))
        if cle in vus:
            ecarter('mobilier en double')
            continue
        vus.add(cle)
        plan['mobilier'].append({'sorte': sorte, 'x': p[0], 'z': p[1]})
    journal('écartés : ' + ', '.join(f'{k} {v}' for k, v in sorted(ecartes.items())))
    return plan, ecartes


def eaux_de(r, ecarter=lambda raison: None):
    """Eaux d'un chargement : un port est une eau qui porte un nom de port ou un repère de port ; deux polygones
    identiques (la mer et le bassin du Vieux-Port, par exemple) n'en font qu'un."""
    nommes = [(a.get('name'), p) for a, p in r.get('water_name', ())]
    nommes += [(a.get('name'), p) for a, p in r.get('poi', ()) if a.get('class') == 'harbor' and a.get('name')]
    eaux = []
    for attrs, poly in r.get('water', ()):
        if attrs.get('brunnel') == 'tunnel':
            ecarter('eau en tunnel')
            continue
        sorte = SORTES_EAU.get(attrs.get('class'), 'bassin')
        nom = next((n for n, p in nommes if n and dans_poly(p[0], p[1], poly)), '')
        if nom and sorte in ('mer', 'bassin') and any(w in nom.lower() for w in ('port', 'bassin', 'darse', 'harbo')):
            sorte = 'port'
        eaux.append({'sorte': sorte, 'nom': nom, 'points': poly[0], 'trous': poly[1:]})
    rang_eau = {'port': 0, 'riviere': 1, 'bassin': 2, 'piscine': 3, 'mer': 4}
    eaux.sort(key=lambda e: rang_eau.get(e['sorte'], 5))
    gardees = []
    for e in eaux:
        sig = (round(aire(e['points'])), tuple(round(v) for v in boite(e['points'])))
        if any(g[0] == sig for g in gardees):
            ecarter('eau en double')
            continue
        gardees.append((sig, e))
    return [e for _, e in gardees]


# ---- Le lointain : ce que l'on voit des bords du carré de jeu sans pouvoir y aller --------------------------------
DEMI_LOIN = 1250.0                             # m : demi-côté de la zone lointaine, réduite là où une tuile manque
TOL_LOIN = 2.5                                 # m : Douglas-Peucker de l'eau et des voies du lointain
TOL_ESPACES_LOIN = 4.0
AIRE_MIN_LOIN = {'eau': 150.0, 'espaces': 1500.0, 'trou': 100.0}
CLASSES_VOIES_LOIN = ('motorway', 'trunk', 'primary', 'secondary', 'tertiary')
SORTES_ESPACES_LOIN = ('parc', 'jardin', 'pelouse', 'bois', 'cimetiere', 'terrain', 'roche', 'sable', 'plage')
PAS_BOITE = 1.0                                # m : centre et demi-côtés d'une boîte du lointain
PAS_ANGLE = 120                                # une boîte tourne par 120es de demi-tour (1,5°)


def zone_lointaine(cle, centre, dossier, zone=None):
    """Le rectangle du lointain (x0, z0, x1, z1), en mètres entiers : la zone voulue (±DEMI_LOIN autour du centre par
    défaut), rognée du côté où une tuile manque (le carré du plan, lui, exige toutes les siennes). Rend aussi les
    tuiles absentes."""
    proj = Projection(*centre)
    E = proj.extent
    x0, z0, x1, z1 = zone or (-DEMI_LOIN, -DEMI_LOIN, DEMI_LOIN, DEMI_LOIN)
    absentes = []
    while True:
        _, _, tuiles = tuiles_utiles(cle, centre, dossier, zone=(x0, z0, x1, z1))
        manque = [(tx, ty) for tx, ty, p in tuiles if not p.exists()]
        if not manque:
            break
        tx, ty = manque[0]
        absentes.append(f'{ZOOM}/{tx}/{ty}')
        ax, az = proj.metres((tx * E - proj.ox, ty * E - proj.oy))
        bx, bz = proj.metres(((tx + 1) * E - proj.ox, (ty + 1) * E - proj.oy))
        if bx <= -DEMI:
            x0 = max(x0, bx)
        elif ax >= DEMI:
            x1 = min(x1, ax)
        elif bz <= -DEMI:
            z0 = max(z0, bz)
        elif az >= DEMI:
            z1 = min(z1, az)
        else:
            raise SystemExit(f'tuile {ZOOM}/{tx}/{ty} manquante dans le carré du plan')
    return (math.ceil(x0), math.ceil(z0), math.floor(x1), math.floor(z1)), absentes


def enveloppe(points):
    """Enveloppe convexe (chaîne monotone)."""
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    bas, haut = [], []
    for p in pts:
        while len(bas) >= 2 and cr(bas[-2], bas[-1], p) <= 0:
            bas.pop()
        bas.append(p)
    for p in reversed(pts):
        while len(haut) >= 2 and cr(haut[-2], haut[-1], p) <= 0:
            haut.pop()
        haut.append(p)
    return bas[:-1] + haut[:-1]


def rectangle_minimal(points):
    """Rectangle d'aire minimale autour des points : (cx, cz, a, b, angle), demi-côtés a ≥ b, angle de l'axe de a
    dans [0, π) (direction (cos, sin) dans le plan x, z)."""
    h = enveloppe(points)
    n, meilleur = len(h), None
    for i in range(n):
        (x0, z0), (x1, z1) = h[i], h[(i + 1) % n]
        l = math.hypot(x1 - x0, z1 - z0)
        if l < 1e-9:
            continue
        ux, uz = (x1 - x0) / l, (z1 - z0) / l
        us = [x * ux + z * uz for x, z in h]
        vs = [z * ux - x * uz for x, z in h]
        u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
        A = (u1 - u0) * (v1 - v0)
        if meilleur is None or A < meilleur[0] - 1e-9:
            meilleur = (A, ux, uz, u0, u1, v0, v1)
    if meilleur is None:
        return None
    _, ux, uz, u0, u1, v0, v1 = meilleur
    a, b, cu, cv = (u1 - u0) / 2, (v1 - v0) / 2, (u0 + u1) / 2, (v0 + v1) / 2
    cx, cz = cu * ux - cv * uz, cu * uz + cv * ux
    if b > a:
        a, b, ux, uz = b, a, -uz, ux
    return cx, cz, a, b, math.atan2(uz, ux) % math.pi


def _coins(q):
    ux, uz = math.cos(q['ang']), math.sin(q['ang'])
    return [(q['cx'] + su * q['a'] * ux - sv * q['b'] * uz, q['cz'] + su * q['a'] * uz + sv * q['b'] * ux)
            for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def fusionner_boites(boites, angle_max=10.0, ecart_h=5.0, plein_min=0.66, cote_max=110.0, fond_max=46.0, jeu=2.5):
    """Regroupe les emprises voisines en boîtes orientées : deux boîtes de même orientation (à angle_max degrés près,
    modulo le quart de tour), de hauteurs proches et qui se touchent (à `jeu` mètres près) n'en font qu'une si le bâti
    remplit au moins plein_min de leur rectangle commun. Une rangée de maisons devient une barre, un îlot quelques
    boîtes ; les rues, plus larges que `jeu`, restent ouvertes. boites : [{cx, cz, a, b, ang, A, h, Ah}] (A : aire
    bâtie ; h : hauteur moyenne connue ou None ; Ah : aire dont la hauteur est connue). Rend les boîtes restantes."""
    C = 64.0
    grille = {}
    cle = lambda q: (math.floor(q['cx'] / C), math.floor(q['cz'] / C))
    for i, q in enumerate(boites):
        q['coins'], q['vivant'], q['r'] = _coins(q), True, math.hypot(q['a'], q['b'])
        grille.setdefault(cle(q), set()).add(i)
    quart = math.pi / 2
    amax = math.radians(angle_max)

    def essai(p, q):
        if math.hypot(p['cx'] - q['cx'], p['cz'] - q['cz']) > p['r'] + q['r'] + jeu:
            return None
        d = abs(p['ang'] - q['ang']) % quart
        if min(d, quart - d) > amax:
            return None
        if p['h'] is not None and q['h'] is not None and abs(p['h'] - q['h']) > ecart_h:
            return None
        g = p if p['A'] >= q['A'] else q
        ux, uz = math.cos(g['ang']), math.sin(g['ang'])
        bornes = []
        for c in (p['coins'], q['coins']):
            us = [x * ux + z * uz for x, z in c]
            vs = [z * ux - x * uz for x, z in c]
            bornes.append((min(us), max(us), min(vs), max(vs)))
        (pu0, pu1, pv0, pv1), (qu0, qu1, qv0, qv1) = bornes
        if max(pu0, qu0) - min(pu1, qu1) > jeu or max(pv0, qv0) - min(pv1, qv1) > jeu:
            return None
        u0, u1, v0, v1 = min(pu0, qu0), max(pu1, qu1), min(pv0, qv0), max(pv1, qv1)
        a, b = (u1 - u0) / 2, (v1 - v0) / 2
        if 2 * max(a, b) > cote_max or 2 * min(a, b) > fond_max:
            return None
        A = p['A'] + q['A']
        plein = A / (4 * a * b)
        if plein < plein_min:
            return None
        cu, cv, ang = (u0 + u1) / 2, (v0 + v1) / 2, g['ang']
        if b > a:
            a, b, ang = b, a, (ang + quart) % math.pi
        Ah = p['Ah'] + q['Ah']
        h = ((p['h'] or 0) * p['Ah'] + (q['h'] or 0) * q['Ah']) / Ah if Ah > 0 else None
        return {'cx': cu * ux - cv * uz, 'cz': cu * uz + cv * ux, 'a': a, 'b': b, 'ang': ang, 'A': A, 'h': h, 'Ah': Ah,
                'plein': plein}
    change = True
    while change:
        change = False
        for i in sorted((i for i, q in enumerate(boites) if q['vivant']), key=lambda i: (-boites[i]['A'], i)):
            p = boites[i]
            if not p['vivant']:
                continue
            ci, cj = cle(p)
            choix, plein, autre = None, 0.0, -1
            for I in range(ci - 2, ci + 3):
                for J in range(cj - 2, cj + 3):
                    for j in sorted(grille.get((I, J), ())):
                        if j != i:
                            m = essai(p, boites[j])
                            if m and m['plein'] > plein:
                                choix, plein, autre = m, m['plein'], j
            if choix:
                grille[cle(p)].discard(i)
                grille[cle(boites[autre])].discard(autre)
                boites[autre]['vivant'] = False
                p.update(choix)
                p['coins'], p['r'] = _coins(p), math.hypot(p['a'], p['b'])
                grille.setdefault(cle(p), set()).add(i)
                change = True
    return [q for q in boites if q['vivant']]


def hors_du_carre(ligne, d):
    """Morceaux d'une polyligne hors du carré [-d, d]² (Liang-Barsky segment par segment)."""
    morceaux, courant = [], []
    for k in range(len(ligne) - 1):
        (ax, az), (bx, bz) = ligne[k], ligne[k + 1]
        dx, dz = bx - ax, bz - az
        t0, t1, coupe = 0.0, 1.0, True
        for p, q in ((-dx, ax + d), (dx, d - ax), (-dz, az + d), (dz, d - az)):
            if p == 0:
                if q < 0:
                    coupe = False
                    break
                continue
            t = q / p
            if p < 0:
                if t > t1:
                    coupe = False
                    break
                t0 = max(t0, t)
            else:
                if t < t0:
                    coupe = False
                    break
                t1 = min(t1, t)
        if not coupe:                              # tout le segment est dehors
            if not courant:
                courant.append((ax, az))
            courant.append((bx, bz))
            continue
        if t0 > 1e-9:                              # [0, t0] dehors, puis le segment entre dans le carré
            if not courant:
                courant.append((ax, az))
            courant.append((ax + dx * t0, az + dz * t0))
        if len(courant) >= 2:
            morceaux.append(courant)
        courant = []
        if t1 < 1 - 1e-9:                          # il en ressort : [t1, 1] dehors
            courant = [(ax + dx * t1, az + dz * t1), (bx, bz)]
    if len(courant) >= 2:
        morceaux.append(courant)
    return morceaux


def classer_lointain(r, ville, zone, journal=print):
    """Objets en mètres de la zone lointaine (sortie de charger) → le lointain du plan, encore en flottants :
    { zone, reperes, sommets, batiments, boites, eau, espaces, voies } (voir l'en-tête du module écrit). Rien de ce qui
    touche le carré du plan n'y entre deux fois : ni bâtiment à cheval, ni voie dans le carré."""
    cfg = ville.get('lointain') or {}
    proche = lambda x, z: abs(x) <= DEMI and abs(z) <= DEMI
    loin = {'zone': zone, 'reperes': [], 'sommets': [], 'batiments': [], 'boites': [], 'eau': [], 'espaces': [],
            'voies': []}
    pois = [(a.get('name'), a.get('class'), p) for a, p in r.get('poi', ()) if a.get('name')]
    for nom, classe, rayon, modele in cfg.get('reperes', ()):
        points = [p for n, c, p in pois if n == nom and c == classe and not proche(*p)]
        if not points:
            continue
        p = min(points, key=lambda p: (math.hypot(*p), p))
        loin['reperes'].append({'nom': nom, 'modele': modele, 'x': p[0], 'z': p[1], 'rayon': float(rayon)})
    absents = sorted({m for _, _, _, m in cfg.get('reperes', ())} - {d['modele'] for d in loin['reperes']})
    if absents:
        journal('lointain : repères absents des tuiles : ' + ', '.join(absents))
    for attrs, p in r.get('mountain_peak_points', ()):
        if attrs.get('name') and attrs.get('ele') is not None:
            loin['sommets'].append({'nom': attrs['name'], 'x': p[0], 'z': p[1], 'altitude': float(attrs['ele'])})
    loin['sommets'].sort(key=lambda s: (-s['altitude'], s['nom']))

    boites, a_cheval = [], 0
    for attrs, poly in r.get('building', ()):
        ext = poly[0]
        bx0, bz0, bx1, bz1 = boite(ext)
        if bx0 <= DEMI and bx1 >= -DEMI and bz0 <= DEMI and bz1 >= -DEMI:
            a_cheval += not (bx0 >= -DEMI and bx1 <= DEMI and bz0 >= -DEMI and bz1 <= DEMI)
            continue                               # dans le carré du plan, ou à cheval : il est dans ses bâtiments
        h, b = attrs.get('render_height', 5), max(0, attrs.get('render_min_height', 0))
        if round(h / QUANTUM) <= round(b / QUANTUM):
            continue
        connue, contour = not (h == 5 and b == 0), bool(attrs.get('hide_3d'))
        choix, dmin = -1, float('inf')
        for k, d in enumerate(loin['reperes']):
            x, z, ray = d['x'], d['z'], d['rayon']
            if bx1 < x - ray or bx0 > x + ray or bz1 < z - ray or bz0 > z + ray:
                continue
            e = 0.0 if dans_anneau(x, z, ext) else min(
                distance_segment((x, z), ext[i - 1], ext[i]) for i in range(len(ext)))
            if e <= ray and e < dmin:
                choix, dmin = k, e
        if choix >= 0:
            loin['batiments'].append({'points': ext, 'trous': poly[1:], 'hauteur': float(h), 'base': float(b),
                                      'connue': connue, 'couleur': couleur(attrs.get('colour')), 'contour': contour,
                                      'repere': choix})
            continue
        if contour or b >= 3:
            continue
        A = abs(aire(ext)) - sum(abs(aire(tr)) for tr in poly[1:])
        m = rectangle_minimal(ext) if A >= 12 else None
        if m and m[3] >= 1.0:
            boites.append({'cx': m[0], 'cz': m[1], 'a': m[2], 'b': m[3], 'ang': m[4], 'A': A,
                           'h': float(h) if connue else None, 'Ah': A if connue else 0.0})
    avant = len(boites)
    for q in fusionner_boites(boites):
        # La boîte garde l'aire bâtie : elle rétrécit de ce que le bâti ne remplit pas (pas plus de 14 % par côté).
        k = max(0.86, min(1.0, math.sqrt(q['A'] / (4 * q['a'] * q['b']))))
        if q['A'] >= 45:
            loin['boites'].append({'x': q['cx'], 'z': q['cz'], 'a': q['a'] * k, 'b': q['b'] * k, 'ang': q['ang'],
                                   'h': q['h']})
    journal(f'lointain : {len(loin["batiments"])} bâtiments de repères, {avant} emprises → {len(loin["boites"])} '
            f'boîtes ; {a_cheval} bâtiments à cheval sur le carré laissés au plan')

    loin['eau'] = [e for e in eaux_de(r) if e['sorte'] != 'piscine' and abs(aire(e['points'])) >= AIRE_MIN_LOIN['eau']]
    espaces = [(SORTES_LANDCOVER.get(a.get('subclass')) or SORTES_LANDCOVER.get(a.get('class')), p)
               for a, p in r.get('landcover', ())]
    espaces += [(SORTES_LANDUSE.get(a.get('class')), p) for a, p in r.get('landuse', ())]
    for sorte, poly in espaces:
        if sorte in SORTES_ESPACES_LOIN and abs(aire(poly[0])) >= AIRE_MIN_LOIN['espaces'] \
                and not proche(*centre_polygone(poly)):
            loin['espaces'].append({'sorte': sorte, 'nom': '', 'points': poly[0], 'trous': poly[1:]})
    for attrs, ligne in r.get('transportation', ()):
        if attrs.get('class') not in CLASSES_VOIES_LOIN or attrs.get('brunnel') == 'tunnel' \
                or (attrs.get('layer') or 0) < 0 or (attrs.get('level') or 0) < 0:
            continue
        for m in hors_du_carre(ligne, DEMI):
            if longueur(m) >= 12:
                loin['voies'].append({'classe': CLASSES_RUES[attrs['class']], 'points': m})
    return loin


# ---- Aperçu SVG --------------------------------------------------------------------------------------------------
LARGEURS_RUES = {'autoroute': 16, 'voie-express': 14, 'primaire': 13, 'secondaire': 11, 'tertiaire': 9, 'rue': 6.5,
                 'desserte': 4, 'voie-bus': 6, 'piste': 3, 'chemin': 2.6, 'jetee': 2.5, 'circuit': 6, 'rail': 1.6}
TEINTES_ESPACES = {'parc': '#9fca86', 'jardin': '#b3d69a', 'pelouse': '#c2deaa', 'bois': '#86b276', 'roche': '#cfc6b8',
                   'sable': '#efe2b9', 'plage': '#efe2b9', 'marais': '#b5d3c4', 'champ': '#e3e6b0',
                   'terrain': '#a9d4a0', 'piste': '#d9a98d', 'jeux': '#cfe4b3', 'cimetiere': '#b8cbb0',
                   'voies': '#d8d0d4', 'gare-routiere': '#d9d4d0', 'chantier': '#d9c9a3', 'digue': '#c8c3bb',
                   'pietonne': '#ece4d4', 'place': '#e9dcc2', 'quai': '#e3d7bf', 'arret': '#c9c3bf',
                   'jetee': '#b9a58c', 'pont': '#c8c2bb'}
TEINTES_EAU = {'mer': '#8fbfe0', 'port': '#82b6dc', 'riviere': '#8fbfe0', 'bassin': '#9cc8e6', 'piscine': '#a6dcef'}


def _echapper(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def _chemin(anneaux):
    d = []
    for a in anneaux:
        if len(a) >= 2:
            d.append('M' + ' L'.join(f'{x:.1f} {z:.1f}' for x, z in a) + ' Z')
    return ' '.join(d)


def apercu_svg(plan, ville, demi, taille=2400):
    """Plan à plat : eau, espaces, rues par classe, bâtiments par hauteur, repères nommés, carrés de jeu."""
    s = []
    s.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{taille}" height="{taille}" '
             f'viewBox="{-demi:.1f} {-demi:.1f} {2 * demi:.1f} {2 * demi:.1f}" font-family="Helvetica, Arial, sans-serif">')
    s.append(f'<rect x="{-demi}" y="{-demi}" width="{2 * demi}" height="{2 * demi}" fill="#f3efe6"/>')
    for e in plan['eau']:
        s.append(f'<path d="{_chemin([e["points"]] + e["trous"])}" fill="{TEINTES_EAU.get(e["sorte"], "#8fbfe0")}" '
                 f'fill-rule="evenodd"/>')
    ordre = ['pelouse', 'bois', 'parc', 'jardin', 'terrain', 'jeux', 'piste', 'cimetiere', 'roche', 'pietonne',
             'quai', 'place', 'arret', 'pont', 'jetee']
    for e in sorted(plan['espaces'], key=lambda e: ordre.index(e['sorte']) if e['sorte'] in ordre else 99):
        s.append(f'<path d="{_chemin([e["points"]] + e["trous"])}" fill="{TEINTES_ESPACES.get(e["sorte"], "#ddd")}" '
                 f'fill-rule="evenodd" stroke="#0002" stroke-width="0.3"/>')
    # Rues : bordure sombre puis chaussée claire, des petites aux grandes.
    rang = ['chemin', 'piste', 'jetee', 'desserte', 'voie-bus', 'rue', 'tertiaire', 'secondaire', 'primaire',
            'voie-express', 'autoroute', 'circuit']
    rues = sorted([r for r in plan['rues'] if r['classe'] != 'rail'],
                  key=lambda r: (r['niveau'], rang.index(r['classe']) if r['classe'] in rang else 0))
    for passe in (0, 1):
        for r in rues:
            w = LARGEURS_RUES.get(r['classe'], 4)
            pts = ' '.join(f'{x:.1f},{z:.1f}' for x, z in r['points'])
            if r['sousClasse'] == 'escalier':
                if passe == 1:
                    s.append(f'<polyline points="{pts}" fill="none" stroke="#8a6d55" stroke-width="2.4" '
                             f'stroke-dasharray="0.6 0.6"/>')
                continue
            if passe == 0:
                s.append(f'<polyline points="{pts}" fill="none" stroke="{"#6d6157" if r["pont"] else "#a8a096"}" '
                         f'stroke-width="{w + 1.4:.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
            else:
                teinte = '#ffffff' if r['classe'] in ('rue', 'desserte', 'tertiaire') else '#fde9a9' \
                    if r['classe'] in ('secondaire', 'primaire', 'voie-express', 'autoroute') else '#f6f1e7'
                if r['classe'] == 'voie-bus':
                    teinte = '#f1d0cf'
                s.append(f'<polyline points="{pts}" fill="none" stroke="{teinte}" stroke-width="{w:.1f}" '
                         f'stroke-linecap="round" stroke-linejoin="round"/>')
    for r in plan['rues']:
        if r['classe'] == 'rail':
            pts = ' '.join(f'{x:.1f},{z:.1f}' for x, z in r['points'])
            s.append(f'<polyline points="{pts}" fill="none" stroke="#5b5f6a" stroke-width="1.2" '
                     f'stroke-dasharray="3 2"/>')
    # Bâtiments : gris pâle si la hauteur est inconnue, du beige au brun selon la hauteur sinon.
    for b in plan['batiments']:
        if b['contour']:
            s.append(f'<path d="{_chemin([b["points"]] + b["trous"])}" fill="none" stroke="#7a3a2a" '
                     f'stroke-width="0.6" stroke-dasharray="2 1"/>')
            continue
        if b['couleur'] is not None:
            teinte = f'#{b["couleur"]:06x}'
        elif not b['connue']:
            teinte = '#d2ccc4'
        else:
            t = max(0.0, min(1.0, (b['hauteur'] - 4) / 36))
            teinte = '#%02x%02x%02x' % (int(222 - 110 * t), int(196 - 120 * t), int(160 - 105 * t))
        s.append(f'<path d="{_chemin([b["points"]] + b["trous"])}" fill="{teinte}" fill-rule="evenodd" '
                 f'stroke="#5a4f45" stroke-width="0.25"/>')
    # Noms des grandes rues, le long de leur plus long tronçon.
    vus = {}
    for r in plan['rues']:
        if r['nom'] and r['classe'] in ('primaire', 'secondaire', 'tertiaire', 'rue', 'voie-bus', 'chemin'):
            l = longueur(r['points'])
            if l > vus.get(r['nom'], (0, None))[0]:
                vus[r['nom']] = (l, r)
    for k, (nom, (l, r)) in enumerate(sorted(vus.items())):
        if l < 70:
            continue
        pts = r['points']
        if pts[-1][0] < pts[0][0]:
            pts = pts[::-1]
        d = 'M' + ' L'.join(f'{x:.1f} {z:.1f}' for x, z in pts)
        s.append(f'<path id="r{k}" d="{d}" fill="none"/>')
        s.append(f'<text font-size="5.5" fill="#3a3530" stroke="#fffc" stroke-width="1.4" paint-order="stroke">'
                 f'<textPath href="#r{k}" startOffset="50%" text-anchor="middle">{_echapper(nom)}</textPath></text>')
    # Repères.
    teintes = {'mairie': '#b0122b', 'police': '#1f4fb4', 'culte': '#6c3a8c', 'musee': '#b46a00', 'monument': '#8a5a00',
               'marche': '#1d7a3a', 'place': '#7a5230', 'gare': '#333', 'metro': '#333', 'tram': '#333',
               'fontaine': '#1b6fae', 'theatre': '#a0306a', 'curiosite': '#8a5a00', 'port': '#1b6fae',
               'embarcadere': '#1b6fae', 'site': '#2d6a2d', 'justice': '#1f4fb4', 'parc': '#2d6a2d'}
    for d in plan['reperes']:
        if d['sorte'] in ('quartier', 'ville'):
            continue
        if d['sorte'] in ('tram', 'metro', 'bibliotheque') or (d['rang'] > 60 and d['sorte'] not in ('place', 'fontaine')):
            continue
        c = teintes.get(d['sorte'], '#444')
        s.append(f'<circle cx="{d["x"]:.1f}" cy="{d["z"]:.1f}" r="2.6" fill="{c}" stroke="#fff" stroke-width="0.8"/>')
        s.append(f'<text x="{d["x"] + 3.5:.1f}" y="{d["z"] + 2:.1f}" font-size="6.5" fill="{c}" stroke="#fffd" '
                 f'stroke-width="1.6" paint-order="stroke" font-weight="bold">{_echapper(d["nom"])}</text>')
    for d in plan['reperes']:
        if d['sorte'] == 'quartier':
            s.append(f'<text x="{d["x"]:.1f}" y="{d["z"]:.1f}" font-size="17" fill="#5b3d8c" fill-opacity="0.75" '
                     f'text-anchor="middle" font-style="italic" font-weight="bold" stroke="#fff9" stroke-width="2.5" '
                     f'paint-order="stroke">{_echapper(d["nom"])}</text>')
    # Carrés de jeu.
    for ilots, cote in sorted(CARRES.items()):
        h = cote / 2
        s.append(f'<rect x="{-h}" y="{-h}" width="{cote}" height="{cote}" fill="none" stroke="#d0301f" '
                 f'stroke-width="2" stroke-dasharray="10 5"/>')
        s.append(f'<text x="{-h + 4}" y="{-h - 4}" font-size="11" fill="#d0301f" font-weight="bold">'
                 f'{cote} m · {ilots} îlots</text>')
    s.append(f'<line x1="-12" y1="0" x2="12" y2="0" stroke="#d0301f" stroke-width="1.5"/>'
             f'<line x1="0" y1="-12" x2="0" y2="12" stroke="#d0301f" stroke-width="1.5"/>')
    lat, lon = ville['centre']
    s.append(f'<text x="{-demi + 8}" y="{demi - 22}" font-size="15" font-weight="bold" fill="#222">'
             f'{_echapper(ville["nom"])} — centre {lat:.5f} N, {lon:.5f} E — nord en haut, 100 m = '
             f'<tspan fill="#d0301f">▬</tspan></text>')
    s.append(f'<rect x="{demi - 118}" y="{demi - 30}" width="100" height="6" fill="#d0301f"/>'
             f'<text x="{demi - 68}" y="{demi - 34}" font-size="10" text-anchor="middle">100 m</text>')
    s.append(f'<text x="{-demi + 8}" y="{demi - 8}" font-size="10" fill="#333">{_echapper(ATTRIBUTION)}</text>')
    s.append('</svg>')
    return '\n'.join(s)


# ---- Simplification, quantification, ordre -----------------------------------------------------------------------
AIRE_MIN = {'batiments': 1.5, 'eau': 1.0, 'espaces': 2.0}     # m² : en dessous, un polygone est un éclat
AIRE_MIN_TROU = 0.5


def quantifier(points):
    return [(round(x / QUANTUM), round(z / QUANTUM)) for x, z in points]


def anneau_fini(anneau, exterieur, aire_min, simplifier=True, tol=TOLERANCE):
    """Simplifie (Douglas-Peucker à tol mètres), quantifie (décimètres entiers) et oriente un anneau ; None s'il
    dégénère. Orientation rendue : aire signée positive pour un extérieur, négative pour un trou (x est, z sud)."""
    q = sans_doublons(quantifier(simplifier_anneau(anneau, tol) if simplifier else anneau), ferme=True)
    # Une pointe (l'anneau revient sur ses pas le long d'une même droite), laissée par la quantification ou par la
    # coupe au bord du carré, se replie : son sommet ne borde aucune aire.
    k = 0
    while len(q) >= 3 and k < len(q):
        a, b, c = q[k - 1], q[k], q[(k + 1) % len(q)]
        if _signe(a, b, c) == 0 and (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0:
            del q[k]
            q = sans_doublons(q, ferme=True)
            k = 0
        else:
            k += 1
    if len(q) < 3:
        return None
    a = aire(q) * QUANTUM * QUANTUM
    if abs(a) < aire_min:
        return None
    if (a > 0) != exterieur:
        q.reverse()
    return q


def _signe(a, b, c):
    v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    return (v > 0) - (v < 0)


def _position(anneau, p):
    """1 si p est dans l'anneau, 0 sur son bord, -1 dehors ; calcul exact sur des entiers."""
    x, z = p
    dedans = False
    for a, b in zip(anneau, anneau[1:] + anneau[:1]):
        if _signe(a, b, p) == 0 and min(a[0], b[0]) <= x <= max(a[0], b[0]) and min(a[1], b[1]) <= z <= max(a[1], b[1]):
            return 0
        if (a[1] > z) != (b[1] > z):
            g = (x - a[0]) * (b[1] - a[1]) - (z - a[1]) * (b[0] - a[0])
            if (g < 0) == (b[1] > a[1]):
                dedans = not dedans
    return 1 if dedans else -1


def trou_loge(trou, ext):
    """Le trou tient-il dans l'extérieur : aucun sommet dehors, aucune arête qui en croise franchement le bord ?"""
    if any(_position(ext, p) < 0 for p in trou):
        return False
    aretes = list(zip(ext, ext[1:] + ext[:1]))
    for a, b in zip(trou, trou[1:] + trou[:1]):
        for c, d in aretes:
            if _signe(a, b, c) * _signe(a, b, d) < 0 and _signe(c, d, a) * _signe(c, d, b) < 0:
                return False
    return True


def finir(plan):
    """Plan en flottants → plan en décimètres entiers, simplifié, sans éclats, rangé dans un ordre spatial stable.
    Un trou que la simplification fait sortir de son extérieur est repris sans simplification ; s'il déborde encore
    (donnée source incohérente), il est retiré."""
    fini = {'rues': [], 'batiments': [], 'eau': [], 'espaces': [], 'reperes': [], 'mobilier': []}
    eclats = {}
    for r in plan['rues']:
        q = sans_doublons(quantifier(douglas_peucker(r['points'], TOLERANCE)))
        if len(q) < 2 or longueur(q) * QUANTUM < 0.5:
            eclats['rues'] = eclats.get('rues', 0) + 1
            continue
        fini['rues'].append(dict(r, points=q))
    for genre in ('batiments', 'eau', 'espaces'):
        for o in plan[genre]:
            ext = anneau_fini(o['points'], True, AIRE_MIN[genre])
            if ext is None:
                eclats[genre] = eclats.get(genre, 0) + 1
                continue
            trous = []
            for t in o['trous']:
                q = anneau_fini(t, False, AIRE_MIN_TROU)
                if q is not None and not trou_loge(q, ext):
                    q = anneau_fini(t, False, AIRE_MIN_TROU, simplifier=False)
                    if q is not None and not trou_loge(q, ext):
                        eclats['trous débordants'] = eclats.get('trous débordants', 0) + 1
                        q = None
                if q is not None:
                    trous.append(q)
            fini[genre].append(dict(o, points=ext, trous=trous))
    for d in plan['reperes']:
        fini['reperes'].append(dict(d, x=round(d['x'] / QUANTUM), z=round(d['z'] / QUANTUM)))
    vus = set()
    for d in plan.get('mobilier', ()):
        q = dict(d, x=round(d['x'] / QUANTUM), z=round(d['z'] / QUANTUM))
        if (q['sorte'], q['x'], q['z']) not in vus:
            vus.add((q['sorte'], q['x'], q['z']))
            fini['mobilier'].append(q)

    for genre in ('rues', 'batiments', 'eau', 'espaces'):
        fini[genre].sort(key=lambda o: (morton(*o['points'][0]), o['points'][0], len(o['points'])))
    fini['reperes'].sort(key=lambda d: (morton(d['x'], d['z']), d['x'], d['z'], d['nom']))
    fini['mobilier'].sort(key=lambda d: (morton(d['x'], d['z']), d['x'], d['z'], d['sorte']))
    return fini, eclats


def morton(x, z):
    """Ordre de Morton par cases de 64 m (coordonnées en décimètres) : les écarts d'un objet au suivant restent petits."""
    i, j = (x + 100000) // 640, (z + 100000) // 640
    m = 0
    for b in range(12):
        m |= ((i >> b) & 1) << (2 * b) | ((j >> b) & 1) << (2 * b + 1)
    return m


def finir_lointain(loin):
    """Lointain en flottants → décimètres entiers (boîtes : demi-mètres et 120es de demi-tour), simplifié, rangé."""
    fini = {'zone': [int(v) for v in loin['zone']], 'batiments': [], 'boites': [], 'eau': [], 'espaces': [], 'voies': [],
            'reperes': [dict(d, x=round(d['x'] / QUANTUM), z=round(d['z'] / QUANTUM)) for d in loin['reperes']],
            'sommets': [dict(d, x=round(d['x'] / QUANTUM), z=round(d['z'] / QUANTUM)) for d in loin['sommets']]}
    for genre, tol, aire_min, aire_trou in (('batiments', TOLERANCE, AIRE_MIN['batiments'], AIRE_MIN_TROU),
                                            ('eau', TOL_LOIN, AIRE_MIN_LOIN['eau'], AIRE_MIN_LOIN['trou']),
                                            ('espaces', TOL_ESPACES_LOIN, AIRE_MIN_LOIN['espaces'], AIRE_MIN_LOIN['trou'])):
        for o in loin[genre]:
            ext = anneau_fini(o['points'], True, aire_min, tol=tol)
            if ext is None:
                continue
            trous = [q for q in (anneau_fini(tr, False, aire_trou, tol=tol) for tr in o['trous'])
                     if q is not None and trou_loge(q, ext)]
            fini[genre].append(dict(o, points=ext, trous=trous))
        fini[genre].sort(key=lambda o: (morton(*o['points'][0]), o['points'][0], len(o['points'])))
    for v in loin['voies']:
        q = sans_doublons(quantifier(douglas_peucker(v['points'], TOL_LOIN)))
        if len(q) >= 2 and longueur(q) * QUANTUM >= 12:
            fini['voies'].append(dict(v, points=q))
    fini['voies'].sort(key=lambda o: (morton(*o['points'][0]), o['points'][0], len(o['points']), o['classe']))
    for b in loin['boites']:
        fini['boites'].append({'x': round(b['x'] / PAS_BOITE), 'z': round(b['z'] / PAS_BOITE),
                               'a': max(1, round(b['a'] / PAS_BOITE)), 'b': max(1, round(b['b'] / PAS_BOITE)),
                               'ang': round(b['ang'] / math.pi * PAS_ANGLE) % PAS_ANGLE,
                               'h': 0 if b['h'] is None else max(1, min(255, round(b['h'])))})
    k = round(PAS_BOITE / QUANTUM)
    fini['boites'].sort(key=lambda b: (morton(b['x'] * k, b['z'] * k), b['x'], b['z'], b['a'], b['b'], b['ang'], b['h']))
    return fini


# ---- Codage : entiers en varint, écarts en zigzag, le tout en base64 --------------------------------------------
class Flux:
    """Suite d'entiers non signés codés en varint ; empreinte FNV-1a 32 bits des valeurs, octet par octet."""

    def __init__(self):
        self.octets = bytearray()
        self.valeurs = 0

    def u(self, v):
        if v < 0 or v >= 1 << 32:
            raise ValueError(f'valeur hors des 32 bits : {v}')
        self.valeurs += 1
        while v >= 0x80:
            self.octets.append((v & 0x7F) | 0x80)
            v >>= 7
        self.octets.append(v)

    def z(self, v):
        self.u((v << 1) if v >= 0 else ((-v) << 1) - 1)


def empreinte(flux):
    """FNV-1a 32 bits sur les valeurs décodées (4 octets petit-boutiens chacune), flux après flux."""
    h = 0x811C9DC5
    for f in flux:
        b, i, n = f.octets, 0, len(f.octets)
        while i < n:
            v, i = _varint(b, i)
            for k in range(4):
                h ^= (v >> (8 * k)) & 0xFF
                h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def coder(fini):
    """Plan fini → (textes, { genre: (nombre d'objets, nombre de points, Flux) })."""
    textes, index = [''], {'': 0}

    def t(s):
        s = s or ''
        if s not in index:
            index[s] = len(textes)
            textes.append(s)
        return index[s]
    sortie = {}
    for genre in ('rues', 'batiments', 'eau', 'espaces', 'reperes', 'mobilier'):
        f, n, curseur = Flux(), 0, [0, 0]

        def points(pts):
            f.u(len(pts))
            for x, z in pts:
                f.z(x - curseur[0])
                f.z(z - curseur[1])
                curseur[0], curseur[1] = x, z
            return len(pts)
        for o in fini[genre]:
            if genre == 'rues':
                f.u(t(o['classe'])); f.u(t(o['sousClasse'])); f.u(t(o['nom']))
                f.u((1 if o['pont'] else 0) | (2 if o['sens'] else 0)); f.u(o['niveau'])
                n += points(o['points'])
            elif genre == 'batiments':
                f.u(round(o['hauteur'] / QUANTUM)); f.u(round(o['base'] / QUANTUM))
                drapeaux = (1 if o['connue'] else 0) | (2 if o['contour'] else 0) | (4 if o['couleur'] is not None else 0)
                f.u(drapeaux)
                if o['couleur'] is not None:
                    f.u(o['couleur'])
                f.u(len(o['trous']))
                n += points(o['points'])
                for tr in o['trous']:
                    n += points(tr)
            elif genre in ('eau', 'espaces'):
                f.u(t(o['sorte'])); f.u(t(o['nom'])); f.u(len(o['trous']))
                n += points(o['points'])
                for tr in o['trous']:
                    n += points(tr)
            elif genre == 'mobilier':
                f.u(t(o['sorte']))
                f.z(o['x'] - curseur[0]); f.z(o['z'] - curseur[1])
                curseur[0], curseur[1] = o['x'], o['z']
            else:
                f.u(t(o['nom'])); f.u(t(o['sorte'])); f.u(t(o['classe'])); f.u(t(o['sousClasse'])); f.u(o['rang'])
                f.z(o['x'] - curseur[0]); f.z(o['z'] - curseur[1])
                curseur[0], curseur[1] = o['x'], o['z']
        sortie[genre] = (len(fini[genre]), n, f)
    return textes, sortie, t


def coder_lointain(loin, t):
    """Lointain fini → { genre: (nombre d'objets, nombre de points, Flux) } ; t : l'index des textes du module."""
    sortie = {}
    for genre in ('batiments', 'boites', 'eau', 'espaces', 'voies'):
        f, n, curseur = Flux(), 0, [0, 0]

        def points(pts):
            f.u(len(pts))
            for x, z in pts:
                f.z(x - curseur[0])
                f.z(z - curseur[1])
                curseur[0], curseur[1] = x, z
            return len(pts)
        for o in loin[genre]:
            if genre == 'batiments':
                f.u(round(o['hauteur'] / QUANTUM)); f.u(round(o['base'] / QUANTUM))
                f.u((1 if o['connue'] else 0) | (2 if o['contour'] else 0) | (4 if o['couleur'] is not None else 0))
                if o['couleur'] is not None:
                    f.u(o['couleur'])
                f.u(o['repere']); f.u(len(o['trous']))
                n += points(o['points'])
                for tr in o['trous']:
                    n += points(tr)
            elif genre == 'boites':
                f.z(o['x'] - curseur[0]); f.z(o['z'] - curseur[1])
                curseur[0], curseur[1] = o['x'], o['z']
                f.u(o['a']); f.u(o['b']); f.u(o['ang']); f.u(o['h'])
            elif genre == 'voies':
                f.u(t(o['classe']))
                n += points(o['points'])
            else:
                f.u(t(o['sorte'])); f.u(len(o['trous']))
                n += points(o['points'])
                for tr in o['trous']:
                    n += points(tr)
        sortie[genre] = (len(loin[genre]), n, f)
    return sortie


# ---- Module JavaScript -------------------------------------------------------------------------------------------
DECODEUR = r'''
  /** base64 → octets, sans atob ni Buffer : le même code dans la page, le travailleur et Node. */
  function octets(texte) {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', T = new Uint8Array(128);
    for (let k = 0; k < 64; k++) T[A.charCodeAt(k)] = k;
    let n = texte.length;
    while (n > 0 && texte.charCodeAt(n - 1) === 61) n--;
    const out = new Uint8Array((n * 3) >> 2);
    let i = 0, j = 0;
    for (; i + 4 <= n; i += 4) {
      const v = (T[texte.charCodeAt(i)] << 18) | (T[texte.charCodeAt(i + 1)] << 12) | (T[texte.charCodeAt(i + 2)] << 6) |
        T[texte.charCodeAt(i + 3)];
      out[j++] = v >>> 16; out[j++] = (v >>> 8) & 255; out[j++] = v & 255;
    }
    if (n - i >= 2) {
      const v = (T[texte.charCodeAt(i)] << 18) | (T[texte.charCodeAt(i + 1)] << 12) | (n - i === 3 ? T[texte.charCodeAt(i + 2)] << 6 : 0);
      out[j++] = v >>> 16;
      if (n - i === 3) out[j++] = (v >>> 8) & 255;
    }
    return out;
  }

  /** Données codées → plan : tableaux typés en mètres. Vérifie que chaque flux est lu jusqu'au bout et que
   *  l'empreinte FNV-1a des valeurs lues est celle qu'a calculée l'outil. */
  function decoder(D) {
    // Math.imul en variable locale : dans un contexte vm de Node, chaque lecture d'un global coûte cher (10× plus lent).
    const U = D.unite, T = D.textes, imul = Math.imul;
    let h = 0x811c9dc5 | 0;
    const flux = (S, g) => {
      const b = octets(S.octets), mal = () => { throw new Error(`plan ${D.cle} : flux ${g} mal formé`); };
      let i = 0;
      /** Un entier (varint). Lire au-delà du flux est une erreur : des données altérées ne font jamais boucler. */
      const u = () => {
        let v = 0, p = 1, c;
        do { if (i >= b.length) mal(); c = b[i++]; v += (c & 127) * p; p *= 128; } while (c & 128);
        h = imul(h ^ (v & 255), 16777619); h = imul(h ^ ((v >>> 8) & 255), 16777619);
        h = imul(h ^ ((v >>> 16) & 255), 16777619); h = imul(h ^ (v >>> 24), 16777619);
        return v;
      };
      const z = () => { const v = u(); return (v >>> 1) ^ -(v & 1); };
      const tout = new Float32Array(S.points * 2);
      let o = 0, cx = 0, cz = 0;
      /** Une suite de points : sous-tableau [x0, z0, x1, z1, …] d'un seul Float32Array par genre. */
      const points = () => {
        const n = u(), debut = o;
        for (let k = 0; k < n; k++) { cx += z(); cz += z(); tout[o++] = cx / U; tout[o++] = cz / U; }
        return tout.subarray(debut, o);
      };
      const repere = () => { cx += z(); cz += z(); return [cx / U, cz / U]; };
      const fin = () => { if (i !== b.length || o !== tout.length) mal(); };
      return { u, z, points, repere, fin, tout };
    };
    const couleur = c => (c < 0 ? null : [((c >>> 16) & 255) / 255, ((c >>> 8) & 255) / 255, (c & 255) / 255]);
    /** Polygones { sorte, nom, points, trous } ; sans nom dans le lointain. */
    const polygones = (S, g, nomme) => {
      const liste = [], f = flux(S, g);
      for (let k = 0; k < S.n; k++) {
        const sorte = T[f.u()], nom = nomme ? T[f.u()] : '', nt = f.u(), points = f.points(), trous = [];
        for (let t = 0; t < nt; t++) trous.push(f.points());
        liste.push({ sorte, nom, points, trous });
      }
      f.fin();
      return liste;
    };
    const rues = [], batiments = [], reperes = [], mobilier = [];
    let f = flux(D.rues, 'rues');
    for (let k = 0; k < D.rues.n; k++) {
      const classe = T[f.u()], sousClasse = T[f.u()], nom = T[f.u()], dr = f.u(), niveau = f.u();
      rues.push({ classe, sousClasse, nom, pont: !!(dr & 1), sens: dr & 2 ? 1 : 0, niveau, points: f.points() });
    }
    f.fin();
    f = flux(D.batiments, 'batiments');
    for (let k = 0; k < D.batiments.n; k++) {
      const hauteur = f.u() / U, base = f.u() / U, dr = f.u(), c = dr & 4 ? f.u() : -1, nt = f.u();
      const points = f.points(), trous = [];
      for (let t = 0; t < nt; t++) trous.push(f.points());
      batiments.push({ points, trous, hauteur, base, connue: !!(dr & 1), contour: !!(dr & 2), couleur: couleur(c) });
    }
    f.fin();
    const eau = polygones(D.eau, 'eau', true), espaces = polygones(D.espaces, 'espaces', true);
    f = flux(D.reperes, 'reperes');
    for (let k = 0; k < D.reperes.n; k++) {
      const nom = T[f.u()], sorte = T[f.u()], classe = T[f.u()], sousClasse = T[f.u()], rang = f.u(), [x, z] = f.repere();
      reperes.push({ nom, sorte, classe, sousClasse, rang, x, z });
    }
    f.fin();
    f = flux(D.mobilier, 'mobilier');
    for (let k = 0; k < D.mobilier.n; k++) { const sorte = T[f.u()], [x, z] = f.repere(); mobilier.push({ sorte, x, z }); }
    f.fin();
    let lointain = null;
    if (D.lointain) {
      const L = D.lointain, bl = [], voies = [];
      f = flux(L.batiments, 'lointain.batiments');
      for (let k = 0; k < L.batiments.n; k++) {
        const hauteur = f.u() / U, base = f.u() / U, dr = f.u(), c = dr & 4 ? f.u() : -1, repere = f.u(), nt = f.u();
        const points = f.points(), trous = [];
        for (let t = 0; t < nt; t++) trous.push(f.points());
        bl.push({ points, trous, hauteur, base, connue: !!(dr & 1), contour: !!(dr & 2), couleur: couleur(c), repere });
      }
      f.fin();
      f = flux(L.boites, 'lointain.boites');
      const boites = new Float32Array(L.boites.n * 6), pas = L.pas, tour = Math.PI / L.angles;
      for (let k = 0, x = 0, z = 0, o = 0; k < L.boites.n; k++) {
        x += f.z(); z += f.z();
        boites[o++] = x * pas; boites[o++] = z * pas; boites[o++] = f.u() * pas; boites[o++] = f.u() * pas;
        boites[o++] = f.u() * tour; boites[o++] = f.u();
      }
      f.fin();
      const eauL = polygones(L.eau, 'lointain.eau', false), espacesL = polygones(L.espaces, 'lointain.espaces', false);
      f = flux(L.voies, 'lointain.voies');
      for (let k = 0; k < L.voies.n; k++) { const classe = T[f.u()]; voies.push({ classe, points: f.points() }); }
      f.fin();
      lointain = Object.freeze({
        zone: Object.freeze({ x0: L.zone[0], z0: L.zone[1], x1: L.zone[2], z1: L.zone[3] }), tuilesAbsentes: L.tuilesAbsentes,
        reperes: L.reperes.map(([nom, modele, x, z, rayon]) => ({ nom, modele, x: x / U, z: z / U, rayon })),
        sommets: L.sommets.map(([nom, x, z, altitude]) => ({ nom, x: x / U, z: z / U, altitude })),
        batiments: bl, boites, eau: eauL, espaces: espacesL, voies,
      });
    }
    if ((h >>> 0) !== D.empreinte) throw new Error(`plan ${D.cle} : empreinte ${(h >>> 0).toString(16)} au lieu de ${D.empreinte.toString(16)}`);
    const carres = Object.freeze({ ...D.carres });
    const demi = D.demi;
    return Object.freeze({
      cle: D.cle, nom: D.nom, centre: Object.freeze({ ...D.centre }), cote: D.cote, marge: D.marge, carres,
      etendue: Object.freeze({ x0: -demi, z0: -demi, x1: demi, z1: demi }),
      attribution: D.attribution, licence: D.licence, source: D.source, empreinte: D.empreinte, comptes: D.comptes,
      rues, batiments, eau, espaces, reperes, mobilier, lointain,
      /** Carré de jeu centré sur l'origine pour un nombre d'îlots par côté (PDR.regles.ilots). */
      carre(ilots) {
        const cote = carres[ilots] || Math.min(D.cote, Math.round(ilots * D.cote / 15));
        return { cote, x0: -cote / 2, z0: -cote / 2, x1: cote / 2, z1: cote / 2 };
      },
    });
  }
'''


def _valeurs(*tables):
    """Valeurs des tables de classement, sans doublon ni None, dans l'ordre où elles y paraissent."""
    vues = []
    for t in tables:
        for v in (t.values() if isinstance(t, dict) else t):
            if v and v not in vues:
                vues.append(v)
    return vues


def _paragraphe(texte):
    """Paragraphe de l'en-tête replié à 118 colonnes : première ligne en retrait de 3, les suivantes de 5."""
    return textwrap.fill(texte, 118, initial_indent='   ', subsequent_indent='     ', break_long_words=False,
                         break_on_hyphens=False)


def entete(ville, cle, fini, comptes, taille_donnees, loin=None):
    """En-tête du module : le contrat avec le constructeur de la ville. Les listes de sortes viennent des tables de
    classement, pour qu'elles disent exactement ce que les données peuvent contenir."""
    lat, lon = ville['centre']
    nb = {g: len(fini[g]) for g in fini}
    mobilier = ', '.join(_valeurs(SORTES_MOBILIER))
    p_mobilier = _paragraphe(
        'mobilier — points sans nom, au sol et dehors, tirés des points d\'intérêt d\'OpenStreetMap. sorte : ' + mobilier
        + '. Une terrasse marque un restaurant, un café, un bar ou un glacier : jamais son nom ni son enseigne.')
    if loin is None:
        p_loin = "   lointain — null : ce plan n'a pas de lointain."
    else:
        z = loin['zone']
        modeles = ', '.join(_valeurs([d['modele'] for d in loin['reperes']])) or 'aucun'
        p_loin = '\n'.join([_paragraphe(
            f"lointain — ce que l'on voit des bords du carré sans pouvoir y aller : zone {{ x0: {z[0]}, z0: {z[1]}, x1: "
            f"{z[2]}, z1: {z[3]} }} (m ; rognée là où une tuile manquait : tuilesAbsentes). Rien de ce "
            "qui touche le carré du plan n'y est répété, sauf l'eau, reprise en entier à gros traits."),
            _paragraphe(
            "lointain.reperes [ { nom, modele, x, z, rayon } ] : points nommés d'OpenStreetMap autour desquels les bâtiments gardent "
            f"leur emprise (modèles présents : {modeles}) ; sommets [ {{ nom, x, z, altitude }} ] (m). batiments : comme "
            "ceux du plan, plus repere (indice dans reperes). boites : Float32Array [x, z, a, b, angle, hauteur] × n, les "
            "autres bâtiments regroupés en boîtes orientées (centre, demi-côtés a ≥ b en m, angle de l'axe de a en "
            "radians : direction (cos, sin) dans le plan x, z ; hauteur en m, 0 si OSM ne la dit pas). eau et espaces "
            f"[ {{ sorte, nom: '', points, trous }} ] simplifiés à {TOL_LOIN:g} et {TOL_ESPACES_LOIN:g} m (espaces : "
            + ', '.join(SORTES_ESPACES_LOIN) + f", de {AIRE_MIN_LOIN['espaces']:g} m² au moins). voies [ {{ classe, points }} ] "
            "(autoroute à tertiaire), hors du carré.")])
    notes = {'jetee': "pier : pontons du port, sur l'eau"}
    classes = ', '.join(f'{v} ({notes.get(v, ", ".join(k for k, w in CLASSES_RUES.items() if w == v))})'
                        for v in _valeurs(CLASSES_RUES))
    notes = {'pietonne': 'rue piétonne', 'pieton': 'allée, trottoir'}
    sous = ', '.join(f'{v} ({notes[v]})' if v in notes else v for v in _valeurs(SOUS_CLASSES_RUES))
    eaux = ', '.join(_valeurs(["port (bassin d'un port, nommé)"],
                              [{'bassin': "bassin (plan d'eau, fontaine)"}.get(v, v) for v in _valeurs(SORTES_EAU)
                               if v != 'port']))
    notes = {'terrain': 'terrain (de sport)', 'voies': 'voies (ferrées)'}
    espaces = ', '.join(_valeurs(['place (aire piétonne nommée « Place … »)', 'quai (aire nommée « Quai … »)',
                                  'pietonne (autre aire piétonne)', "arret (quai d'arrêt de tram ou de bus)",
                                  'jetee (ponton ou jetée)', 'pont (tablier)'],
                                 [notes.get(v, v) for v in _valeurs(SORTES_LANDCOVER, SORTES_LANDUSE)]))
    reperes = ', '.join(_valeurs(['place', 'quartier', 'ville', "eau (nom d'un plan d'eau)",
                                  "site (aire protégée ou site historique nommé, calque park d'OpenMapTiles)"],
                                 _valeurs(SORTES_POI)))
    p_rues = _paragraphe(
        'rues — ni tunnel ni souterrain ni intérieur. classe (et ses classes OpenMapTiles) : ' + classes
        + '. sousClasse : ' + sous + ", ou ''. nom : nom de la voie ('' s'il n'est pas connu). pont : sur un pont ; "
        'niveau : couche OSM (0 au sol, 1, 2… au-dessus). sens : 1 si la circulation ne va que dans le sens des '
        'points, 0 sinon.')
    p_eau = _paragraphe('eau — sorte : ' + eaux + ". L'eau est à plat ; un polygone en double (mer et bassin du "
                        "port, par exemple) n'est gardé qu'une fois.")
    p_espaces = _paragraphe(
        'espaces — au sol, sans hauteur. sorte : ' + espaces + ". nom : '' si aucun ; OpenMapTiles ne nomme pas les "
        'aires piétonnes, leur nom vient de la rue nommée qui les parcourt quand il y en a une.')
    p_reperes = _paragraphe(
        'reperes — points nommés. sorte : ' + reperes + ". classe, sousClasse : celles d'OpenMapTiles (poi, place) ; "
        'rang : importance (1 la plus grande ; 0 sans rang). Aucun commerce, café, bureau, école, lieu de soins ni '
        "œuvre d'art. Un lieu de culte n'est qu'un repère du décor : jamais un lieu à prendre ni une cible.")
    return f'''/* Point de rupture — plan de {ville["nom"]} : rues, bâtiments, eau, espaces et repères, au décimètre.
   {ATTRIBUTION}
   Écrit par outils/plans/extraire.py ({cle}), à ne pas modifier à la main : voir outils/plans/LISEZMOI.md.
   Les mentions ci-dessus doivent rester visibles dans le jeu (licence ODbL) : PDR.plans.{cle}.attribution.

   PDR.plans.{cle} — décodé au chargement, identique dans la page, le travailleur et Node :
   {{
     cle: '{cle}', nom: '{ville["nom"]}', centre: {{ lat: {lat}, lon: {lon} }}   origine du repère
     cote: {int(max(CARRES.values()))}, marge: {int(MARGE)}, etendue: {{ x0: {-DEMI:g}, z0: {-DEMI:g}, x1: {DEMI:g}, z1: {DEMI:g} }}   m : plus grand carré de jeu,
                                    marge autour, et zone couverte par les données (le carré plus la marge)
     carres: {json.dumps({str(k): v for k, v in CARRES.items()})}   côté du carré de jeu (m) selon PDR.regles.ilots ;
     carre(ilots) → {{ cote, x0, z0, x1, z1 }}   le carré de jeu, centré sur l'origine
     attribution, licence, source, empreinte (FNV-1a des données), comptes (par genre et par sorte)
     rues:      [ {{ classe, sousClasse, nom, pont, niveau, sens, points }} ]                       × {nb["rues"]}
     batiments: [ {{ points, trous, hauteur, base, connue, contour, couleur }} ]                    × {nb["batiments"]}
     eau:       [ {{ sorte, nom, points, trous }} ]                                                  × {nb["eau"]}
     espaces:   [ {{ sorte, nom, points, trous }} ]                                                  × {nb["espaces"]}
     reperes:   [ {{ nom, sorte, classe, sousClasse, rang, x, z }} ]                                × {nb["reperes"]}
     mobilier:  [ {{ sorte, x, z }} ]                                                               × {nb["mobilier"]}
     lointain:  null ou {{ zone, tuilesAbsentes, reperes, sommets, batiments, boites, eau, espaces, voies }}
   }}
   Repère : mètres, x vers l'est, z vers le sud (y vers le haut dans le jeu), origine au centre ; échelle exacte au
   centre (ellipsoïde WGS 84), moins de 1e-4 d'écart au bord. Coordonnées au décimètre près.
   points : Float32Array [x0, z0, x1, z1, …] (sous-tableau d'un seul tampon par genre). Polyligne pour une rue ;
   anneau fermé implicitement (le premier point n'est pas répété) pour un polygone, au moins 3 points. Aire signée
   A = ½ Σ (x_i z_i+1 − x_i+1 z_i) : positive pour un anneau extérieur (sens horaire sur une carte nord en haut),
   négative pour un trou ; trous : [Float32Array]. Les objets sont découpés à l'étendue ; rien n'en dépasse.

{p_rues}
   batiments — hauteur = render_height et base = render_min_height d'OpenMapTiles (m), base ramenée à 0 si elle est
     négative : le bâtiment occupe y ∈ [base, hauteur], toujours 0 ≤ base < hauteur (rien d'enterré ni de plat).
     connue : faux quand OSM ne dit rien (OpenMapTiles met alors 5 m et 0) ; le constructeur choisit une hauteur
     vraisemblable. contour : emprise d'un bâtiment décrit aussi par ses parties (hide_3d) ; ne pas l'élever, ses
     parties sont dans la liste. couleur : [r, g, b] sRGB 0..1 si OSM en donne une, sinon null. Pas de toit ni de
     forme de toit dans les données.
{p_eau}
{p_espaces}
{p_reperes}
{p_mobilier}
{p_loin}
   Taille des données codées : {taille_donnees} octets (base64).
*/'''


def ecrire_module(ville, cle, fini, source, loin=None):
    textes, codes, t = coder(fini)
    comptes = {g: n for g, (n, _, _) in codes.items()}
    comptes['points'] = {g: p for g, (_, p, _) in codes.items() if g not in ('reperes', 'mobilier')}
    for g, champ in (('rues', 'classe'), ('eau', 'sorte'), ('espaces', 'sorte'), ('reperes', 'sorte'), ('mobilier', 'sorte')):
        par = {}
        for o in fini[g]:
            par[o[champ]] = par.get(o[champ], 0) + 1
        comptes[g + 'Par' + champ.capitalize()] = dict(sorted(par.items()))
    comptes['batimentsHauteurConnue'] = sum(1 for b in fini['batiments'] if b['connue'])
    comptes['batimentsContour'] = sum(1 for b in fini['batiments'] if b['contour'])
    comptes['ruesNommees'] = sum(1 for r in fini['rues'] if r['nom'])
    genres = ['rues', 'batiments', 'eau', 'espaces', 'reperes', 'mobilier']
    flux = [codes[g][2] for g in genres]
    codes_loin = None
    if loin is not None:
        codes_loin = coder_lointain(loin, t)
        flux += [codes_loin[g][2] for g in ('batiments', 'boites', 'eau', 'espaces', 'voies')]
        comptes['lointain'] = {g: n for g, (n, _, _) in codes_loin.items()}
        comptes['lointain']['reperes'] = len(loin['reperes'])
        comptes['lointain']['sommets'] = len(loin['sommets'])
    h = empreinte(flux)
    lat, lon = ville['centre']
    D = {
        'version': 2, 'cle': cle, 'nom': ville['nom'], 'centre': {'lat': lat, 'lon': lon},
        'cote': int(max(CARRES.values())), 'marge': int(MARGE), 'demi': DEMI,
        'carres': {str(k): v for k, v in CARRES.items()}, 'unite': round(1 / QUANTUM),
        'attribution': ATTRIBUTION, 'licence': 'ODbL 1.0 — https://opendatacommons.org/licenses/odbl/1-0/',
        'source': source, 'empreinte': h, 'comptes': comptes, 'textes': textes,
    }
    taille = 0
    for g in genres:
        n, p, f = codes[g]
        b64 = base64.b64encode(bytes(f.octets)).decode('ascii')
        taille += len(b64)
        D[g] = {'n': n, 'points': p, 'octets': b64}
    D['lointain'] = None
    if loin is not None:
        L = {'zone': loin['zone'], 'tuilesAbsentes': loin['tuilesAbsentes'], 'pas': PAS_BOITE, 'angles': PAS_ANGLE,
             'reperes': [[d['nom'], d['modele'], d['x'], d['z'], d['rayon']] for d in loin['reperes']],
             'sommets': [[d['nom'], d['x'], d['z'], d['altitude']] for d in loin['sommets']]}
        for g in ('batiments', 'boites', 'eau', 'espaces', 'voies'):
            n, p, f = codes_loin[g]
            b64 = base64.b64encode(bytes(f.octets)).decode('ascii')
            taille += len(b64)
            L[g] = {'n': n, 'points': p, 'octets': b64}
        D['lointain'] = L
    corps = json.dumps(D, ensure_ascii=False, separators=(',', ':'))
    texte = (entete(ville, cle, fini, comptes, taille, loin) + '\n(function (PDR) {\n  \'use strict\';\n'
             + DECODEUR + f'\n  const plans = PDR.plans = PDR.plans || {{}};\n'
             f'  plans[{json.dumps(cle)}] = decoder({corps});\n'
             '})(globalThis.PDR = globalThis.PDR || {});\n')
    return texte, comptes, h, taille


# ---- Commande ----------------------------------------------------------------------------------------------------
def version_tuiles(dossier):
    """Version du jeu de tuiles OpenFreeMap, lue dans un tilejson.json posé à côté des tuiles (sinon '')."""
    for p in (pathlib.Path(dossier) / 'tilejson.json', pathlib.Path(dossier).parent / 'tilejson.json'):
        if p.exists():
            try:
                url = json.loads(p.read_text())['tiles'][0]
                return url.split('/planet/')[1].split('/')[0] if '/planet/' in url else url
            except (ValueError, KeyError, IndexError):
                return ''
    return ''


def main(argv=None):
    ici = pathlib.Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description="Plan d'une vraie ville pour Point de rupture (données OpenStreetMap).")
    ap.add_argument('ville', nargs='?', help='clé de la ville : ' + ', '.join(VILLES))
    ap.add_argument('--tuiles', default=str(ici / 'tuiles'), help='dossier des tuiles {cle}-{z}-{x}-{y}.pbf')
    ap.add_argument('--sortie', help='module écrit (défaut : Jeu/src/villes/<ville>.js)')
    ap.add_argument('--centre', help='LAT,LON : remplace le centre du tableau VILLES (essais de cadrage)')
    ap.add_argument('--apercu', help='écrit aussi un aperçu SVG du plan')
    ap.add_argument('--liste', action='store_true', help='liste les villes et les tuiles qu\'il leur faut')
    a = ap.parse_args(argv)
    if a.liste or not a.ville:
        for cle, v in VILLES.items():
            _, _, tuiles = tuiles_utiles(cle, v['centre'], a.tuiles)
            print(f'{cle:10s} {v["nom"]:10s} centre {v["centre"][0]:.5f}, {v["centre"][1]:.5f} — {v["notes"]}')
            for tx, ty, p in tuiles:
                print(f'    {ZOOM}/{tx}/{ty}  {"présente" if p.exists() else "absente"}  {p.name}')
            if v.get('lointain'):
                # Le lointain se contente des tuiles présentes : une tuile absente rogne sa zone de ce côté.
                d = DEMI_LOIN
                _, _, loin = tuiles_utiles(cle, v['centre'], a.tuiles, zone=v['lointain'].get('zone') or (-d, -d, d, d))
                for tx, ty, p in loin:
                    if (tx, ty) not in {(x, y) for x, y, _ in tuiles}:
                        print(f'    {ZOOM}/{tx}/{ty}  {"présente" if p.exists() else "absente"}  {p.name}  (lointain, facultative)')
        return 0
    if a.ville not in VILLES:
        raise SystemExit(f'ville inconnue : {a.ville} (connues : {", ".join(VILLES)})')
    ville = dict(VILLES[a.ville])
    if a.centre:
        lat, lon = (float(v) for v in a.centre.split(','))
        ville['centre'] = (lat, lon)
    t0 = time.perf_counter()
    proj, r, stats = charger(a.ville, ville['centre'], a.tuiles)
    plan, ecartes = classer(r, ville)
    fini, eclats = finir(plan)
    source = {'donnees': 'OpenStreetMap', 'tuiles': 'OpenFreeMap ' + (version_tuiles(a.tuiles) or '(version inconnue)'),
              'schema': 'OpenMapTiles', 'zoom': ZOOM, 'fichiers': stats['tuiles']}
    loin = None
    if ville.get('lointain'):
        zone, absentes = zone_lointaine(a.ville, ville['centre'], a.tuiles, ville['lointain'].get('zone'))
        if absentes:
            print('lointain : tuiles absentes, zone rognée de leur côté : ' + ', '.join(absentes))
        _, r_loin, stats_loin = charger(a.ville, ville['centre'], a.tuiles, zone=zone)
        loin = finir_lointain(classer_lointain(r_loin, ville, zone))
        loin['tuilesAbsentes'] = absentes
        source['fichiersLointain'] = stats_loin['tuiles']
    texte, comptes, h, taille = ecrire_module(ville, a.ville, fini, source, loin)
    sortie = pathlib.Path(a.sortie) if a.sortie else ici.parent.parent / 'src' / 'villes' / f'{a.ville}.js'
    sortie.parent.mkdir(parents=True, exist_ok=True)
    sortie.write_text(texte, encoding='utf-8')
    duree = time.perf_counter() - t0
    print(f'éclats retirés : {eclats}')
    print(f'{sortie} : {len(texte.encode("utf-8"))} octets (données {taille}), empreinte {h:08x}, {duree:.2f} s')
    print('comptes : ' + json.dumps(comptes, ensure_ascii=False))
    if a.apercu:
        # L'aperçu montre ce que contient le module : coordonnées repassées en mètres.
        m = {g: [] for g in fini if g != 'mobilier'}
        for g, liste in fini.items():
            if g == 'mobilier':
                continue
            for o in liste:
                o = dict(o)
                if 'points' in o:
                    o['points'] = [(x * QUANTUM, z * QUANTUM) for x, z in o['points']]
                    o['trous'] = [[(x * QUANTUM, z * QUANTUM) for x, z in t] for t in o.get('trous', ())]
                else:
                    o['x'], o['z'] = o['x'] * QUANTUM, o['z'] * QUANTUM
                m[g].append(o)
        pathlib.Path(a.apercu).write_text(apercu_svg(m, ville, DEMI, taille=round(4 * DEMI)), encoding='utf-8')
        print(f'aperçu : {a.apercu}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
