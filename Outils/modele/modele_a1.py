#!/usr/bin/env python3
"""Modele independant de l'etape A1 de Point de rupture.

Il reecrit en Python, a partir des regles et non du code C++, la simulation, la sauvegarde,
l'enregistreur, le generateur de parties et le texte des relectures. Il sert a deux choses :

  valeurs                       affiche les valeurs de reference recopiees dans Source/PdrOutils/Private/PdrTests.cpp
  condense N G1 G2              affiche le condense attendu de « -relectures » pour les graines G1 a G2, N iterations
  comparer DOSSIER N G1 G2      compare, caractere par caractere, les parties ecrites par « -relectures -dossier= »

Limite a connaitre : le modele et le code C++ ont le meme auteur. Leur accord ecarte les erreurs de
realisation (largeur des entiers, arrondis, tri, disposition des octets, texte), pas une regle mal concue.
"""
import bisect
import math
import struct
import sys

LIM = 10**9
VMAX = 100000
EMAX = 4096
ITMAX = 2000000000
FILE_MAX = 1000000
MAXI32 = 2**31 - 1
MINI32 = -2**31
M64 = (1 << 64) - 1
VERSION = 1
CREER, DEPLACER, ARRETER, RETIRER = 1, 2, 3, 4
JOUEURS = (0, 1, 2, 255)
RAYON = 200000
INTERVALLE = 100


def borner(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def tdiv(a, b):
    """Division entiere tronquee vers zero, comme en C++."""
    q = abs(a) // abs(b)
    return -q if (a < 0) != (b < 0) else q


def fnv(data):
    h = 0xcbf29ce484222325
    for o in data:
        h ^= o
        h = (h * 0x100000001b3) & M64
    return h


class Alea:
    """SplitMix64."""

    def __init__(self, graine):
        self.etat = graine & M64

    def suivant(self):
        self.etat = (self.etat + 0x9E3779B97F4A7C15) & M64
        z = self.etat
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & M64
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & M64
        return z ^ (z >> 31)

    def entre(self, mn, mx):
        if mx <= mn:
            return mn
        return mn + self.suivant() % (mx - mn + 1)


class Lecteur:
    """Lit des entiers, octet de poids faible en premier. Leve EOFError au-dela de la fin."""

    def __init__(self, octets):
        self.octets = bytes(octets)
        self.place = 0

    def lire(self, forme):
        taille = struct.calcsize(forme)
        if self.place + taille > len(self.octets):
            raise EOFError
        valeurs = struct.unpack_from(forme, self.octets, self.place)
        self.place += taille
        return valeurs

    def fini(self):
        return self.place == len(self.octets)


class Sim:
    def __init__(self, graine=0):
        self.graine = graine
        self.it = 0
        self.alea = graine
        self.pid = 1
        self.app = 0
        self.ign = 0
        self.esc = []
        self.att = []

    def soumettre(self, c):
        """Rend 'acceptee', 'invalide', 'tardive' ou 'pleine'."""
        if not (1 <= c[3] <= 4) or c[0] < 0 or c[0] >= ITMAX:
            return 'invalide'
        if c[0] < self.it:
            return 'tardive'
        if len(self.att) >= FILE_MAX:
            return 'pleine'
        bisect.insort_right(self.att, c)
        return 'acceptee'

    def sequence_libre(self, joueur):
        rangs = [c[2] for c in self.att if c[1] == joueur]
        if not rangs:
            return 0
        return min(max(rangs) + 1, 0xFFFFFFFF)

    def trouver(self, ident):
        for e in self.esc:
            if e['id'] == ident:
                return e
        return None

    def appliquer(self, c):
        it, joueur, seq, typ, a, b, cc = c
        ok = False
        if typ == CREER:
            if len(self.esc) < EMAX and self.pid < MAXI32:
                x = borner(a, -LIM, LIM)
                y = borner(b, -LIM, LIM)
                self.esc.append({'id': self.pid, 'j': joueur, 'x': x, 'y': y, 'cx': x, 'cy': y, 'v': borner(cc, 0, VMAX), 'mv': False})
                self.pid += 1
                ok = True
        elif typ == DEPLACER:
            e = self.trouver(a)
            if e is not None and e['j'] == joueur:
                e['cx'] = borner(b, -LIM, LIM)
                e['cy'] = borner(cc, -LIM, LIM)
                e['mv'] = e['v'] > 0 and (e['cx'], e['cy']) != (e['x'], e['y'])
                ok = True
        elif typ == ARRETER:
            e = self.trouver(a)
            if e is not None and e['j'] == joueur:
                e['cx'], e['cy'] = e['x'], e['y']
                e['mv'] = False
                ok = True
        elif typ == RETIRER:
            e = self.trouver(a)
            if e is not None and e['j'] == joueur:
                self.esc.remove(e)
                ok = True
        if ok:
            self.app = (self.app + 1) & 0xFFFFFFFF
        else:
            self.ign = (self.ign + 1) & 0xFFFFFFFF

    def avancer(self):
        if self.it >= ITMAX:
            return
        n = 0
        while n < len(self.att) and self.att[n][0] == self.it:
            self.appliquer(self.att[n])
            n += 1
        del self.att[:n]
        for e in self.esc:
            if not e['mv']:
                continue
            dx = e['cx'] - e['x']
            dy = e['cy'] - e['y']
            d = math.isqrt(dx * dx + dy * dy)
            pas = e['v']
            if d <= pas:
                e['x'], e['y'] = e['cx'], e['cy']
                e['mv'] = False
                continue
            sx = tdiv(dx * pas, d)
            sy = tdiv(dy * pas, d)
            if sx == 0 and sy == 0 and pas > 0:
                if abs(dx) >= abs(dy):
                    sx = 1 if dx > 0 else -1
                else:
                    sy = 1 if dy > 0 else -1
            e['x'] += sx
            e['y'] += sy
        self.it += 1

    def avancer_jusqua(self, cible):
        cible = min(cible, ITMAX)
        while self.it < cible:
            self.avancer()

    def octets_etat(self):
        parts = [struct.pack('<iiQiIIi', VERSION, self.it, self.alea, self.pid, self.app, self.ign, len(self.esc))]
        for e in self.esc:
            parts.append(struct.pack('<iBiiiiiB', e['id'], e['j'], e['x'], e['y'], e['cx'], e['cy'], e['v'], 1 if e['mv'] else 0))
        return b''.join(parts)

    def empreinte(self):
        return fnv(self.octets_etat())

    def serialiser(self):
        parts = [struct.pack('<Q', self.graine), self.octets_etat(), struct.pack('<i', len(self.att))]
        for c in self.att:
            parts.append(struct.pack('<iBIBiii', *c))
        return b''.join(parts)

    @staticmethod
    def deserialiser(octets):
        """Rend la simulation sauvegardee, ou None si la sauvegarde est refusee."""
        lecteur = Lecteur(octets)
        s = Sim(0)
        try:
            (s.graine,) = lecteur.lire('<Q')
            version, s.it, s.alea, s.pid, s.app, s.ign, nombre = lecteur.lire('<iiQiIIi')
            if version != VERSION or not (0 <= s.it <= ITMAX) or s.pid < 1 or not (0 <= nombre <= EMAX):
                return None
            precedent = 0
            for _ in range(nombre):
                ident, j, x, y, cx, cy, v, mv = lecteur.lire('<iBiiiiiB')
                if ident <= precedent or ident >= s.pid:
                    return None
                if any(abs(k) > LIM for k in (x, y, cx, cy)) or not (0 <= v <= VMAX) or mv > 1:
                    return None
                # La marche se deduit du reste de l'etat.
                if (mv == 1) != (v > 0 and (cx, cy) != (x, y)):
                    return None
                precedent = ident
                s.esc.append({'id': ident, 'j': j, 'x': x, 'y': y, 'cx': cx, 'cy': cy, 'v': v, 'mv': mv == 1})
            (attente,) = lecteur.lire('<i')
            if not (0 <= attente <= FILE_MAX):
                return None
            for _ in range(attente):
                c = lecteur.lire('<iBIBiii')
                if not (1 <= c[3] <= 4) or c[0] < s.it or c[0] >= ITMAX:
                    return None
                if s.att and c < s.att[-1]:
                    return None
                s.att.append(c)
        except EOFError:
            return None
        return s if lecteur.fini() else None


class Enregistreur:
    def __init__(self, graine):
        self.sim = Sim(graine)
        self.cmds = []
        self.empreintes = [(0, self.sim.empreinte())]

    def soumettre(self, c):
        verdict = self.sim.soumettre(c)
        if verdict == 'acceptee':
            bisect.insort_right(self.cmds, c)
        return verdict

    def avancer(self):
        avant = self.sim.it
        self.sim.avancer()
        if self.sim.it != avant and self.sim.it % INTERVALLE == 0:
            self.empreintes.append((self.sim.it, self.sim.empreinte()))

    def extraire(self):
        """Rend (iterations, commandes jouees, empreintes)."""
        fin = self.sim.it
        commandes = [c for c in self.cmds if c[0] < fin]
        empreintes = list(self.empreintes)
        if empreintes[-1][0] != fin:
            empreintes.append((fin, self.sim.empreinte()))
        return fin, commandes, empreintes

    def texte(self):
        fin, commandes, empreintes = self.extraire()
        lignes = ['pdr-relecture %d' % VERSION, 'graine %d' % self.sim.graine, 'iterations %d' % fin]
        lignes.extend('cmd %d %d %d %d %d %d %d' % c for c in commandes)
        lignes.extend('empreinte %d %016x' % e for e in empreintes)
        lignes.append('fin')
        return '\n'.join(lignes) + '\n'


def generer(graine, iterations):
    """Joue une partie de commandes tirees au sort. Rend l'enregistreur."""
    enr = Enregistreur(graine)
    alea = Alea(graine ^ 0xA5A5A5A55A5A5A5A)
    seqs = [0] * len(JOUEURS)

    def emettre(it, rang, seq, typ, a, b, c):
        enr.soumettre((it, JOUEURS[rang], seq, typ, a, b, c))

    def tirer_vitesse():
        cas = alea.entre(0, 99)
        if cas < 3:
            return 0
        if cas < 6:
            return 1
        if cas < 8:
            return VMAX
        if cas == 8:
            return -1
        if cas == 9:
            return VMAX + 1
        return alea.entre(20, 400)

    def tirer_coordonnee():
        cas = alea.entre(0, 199)
        if cas == 0:
            return LIM
        if cas == 1:
            return -LIM
        if cas == 2:
            return MAXI32
        if cas == 3:
            return MINI32
        if cas == 4:
            return -LIM - 1
        if cas == 5:
            return LIM + 1
        return alea.entre(-RAYON, RAYON)

    for rang in range(len(JOUEURS)):
        for _ in range(4):
            x = tirer_coordonnee()
            y = tirer_coordonnee()
            v = tirer_vitesse()
            emettre(0, rang, seqs[rang], CREER, x, y, v)
            seqs[rang] += 1

    duree = max(0, min(iterations, ITMAX))
    for it in range(duree):
        while alea.entre(0, 3) == 0:
            rang = alea.entre(0, len(JOUEURS) - 1)
            retard = alea.entre(0, 5)
            cas = alea.entre(0, 99)
            x = tirer_coordonnee()
            y = tirer_coordonnee()
            v = tirer_vitesse()
            jumelle = alea.entre(0, 99)
            x2 = tirer_coordonnee()
            y2 = tirer_coordonnee()
            esc = enr.sim.esc
            total = len(esc)
            ident = alea.entre(1, enr.sim.pid + 1)
            if total > 0 and cas < 95:
                depart = alea.entre(0, total - 1)
                for dec in range(total):
                    cand = esc[(depart + dec) % total]
                    if cand['j'] == JOUEURS[rang]:
                        ident = cand['id']
                        break
            quand = it + retard
            seq = seqs[rang]
            seqs[rang] += 1
            if cas < 55:
                emettre(quand, rang, seq, DEPLACER, ident, x, y)
            elif cas < 70:
                emettre(quand, rang, seq, ARRETER, ident, 0, 0)
            elif cas < 85:
                emettre(quand, rang, seq, CREER, x, y, v)
            elif cas < 95:
                emettre(quand, rang, seq, RETIRER, ident, 0, 0)
            else:
                emettre(quand, rang, seq, DEPLACER, ident, x, y)
            if jumelle == 0:
                # Meme iteration, meme joueur, meme rang, autre contenu : seul le contenu departage.
                emettre(quand, rang, seq, DEPLACER, ident, x2, y2)
        enr.avancer()
    return enr


def condense_partie(graine, iterations):
    """La part d'une partie dans le condense de l'executeur, et son empreinte finale."""
    fin, commandes, empreintes = generer(graine, iterations).extraire()
    parts = [struct.pack('<Qiii', graine, fin, len(commandes), len(empreintes))]
    parts.extend(struct.pack('<iQ', it, h) for it, h in empreintes)
    return b''.join(parts), len(commandes), empreintes[-1][1]


def condense(iterations, premiere, derniere):
    tampon = []
    commandes = 0
    finales = set()
    for graine in range(premiere, derniere + 1):
        part, nombre, finale = condense_partie(graine, iterations)
        tampon.append(part)
        commandes += nombre
        finales.add(finale)
    return fnv(b''.join(tampon)), commandes, len(finales)


def empreintes_de_chaque_iteration(graine, commandes, iterations):
    """FNV-1a 64 de la suite des empreintes apres 0, 1, ..., N iterations, chacune ecrite sur 8 octets."""
    sim = Sim(graine)
    suivante = 0
    parts = [struct.pack('<Q', sim.empreinte())]
    for it in range(iterations):
        while suivante < len(commandes) and commandes[suivante][0] == it:
            assert sim.soumettre(commandes[suivante]) == 'acceptee'
            suivante += 1
        sim.avancer()
        parts.append(struct.pack('<Q', sim.empreinte()))
    assert suivante == len(commandes)
    return fnv(b''.join(parts))


def lot_de_commandes(graine, creations, autres, derniere):
    """Le lot de commandes des tests (LotDeCommandes)."""
    cmds = []
    alea = Alea(graine)
    seqs = [0, 0, 0]
    for rang in range(creations):
        j = rang % 3
        x = alea.entre(-50000, 50000)
        y = alea.entre(-50000, 50000)
        v = alea.entre(0, 300)
        cmds.append((0, j, seqs[j], CREER, x, y, v))
        seqs[j] += 1
    for _ in range(autres):
        it = alea.entre(0, derniere)
        j = alea.entre(0, 2)
        ident = alea.entre(1, creations + 3)
        x = alea.entre(-50000, 50000)
        y = alea.entre(-50000, 50000)
        cas = alea.entre(0, 9)
        seq = seqs[j]
        seqs[j] += 1
        if cas < 6:
            cmds.append((it, j, seq, DEPLACER, ident, x, y))
        elif cas < 8:
            cmds.append((it, j, seq, ARRETER, ident, 0, 0))
        elif cas == 8:
            cmds.append((it, j, seq, RETIRER, ident, 0, 0))
        else:
            cmds.append((it, j, seq, CREER, x, y, 120))
    return cmds


def sauvegarde_des_tests():
    """La partie en cours que les tests sauvegardent : graine 77, 92 commandes, 20 iterations jouees."""
    sim = Sim(77)
    for c in lot_de_commandes(77, 12, 80, 40):
        assert sim.soumettre(c) == 'acceptee'
    sim.avancer_jusqua(20)
    return sim


def alterations_acceptees(octets, essais=4000, graine=99):
    """Le test des alterations au hasard : nombre de sauvegardes alterees encore acceptees."""
    alea = Alea(graine)
    acceptees = 0
    for _ in range(essais):
        mutee = bytearray(octets)
        for _ in range(alea.entre(1, 3)):
            place = alea.entre(0, len(mutee) - 1)
            valeur = alea.entre(0, 255)
            mutee[place] = valeur
        sim = Sim.deserialiser(bytes(mutee))
        if sim is not None:
            acceptees += 1
            assert sim.serialiser() == bytes(mutee)
            sim.avancer_jusqua(sim.it + 5)
    return acceptees


def sauvegarde_de_reference():
    """Une sauvegarde dont tous les champs different : elle fige la disposition des octets."""
    sim = Sim(0x0102030405060708)
    sim.it = 3
    sim.alea = 0x1112131415161718
    sim.pid = 6
    sim.app = 1
    sim.ign = 0
    sim.esc = [{'id': 5, 'j': 2, 'x': 100, 'y': -200, 'cx': 100, 'cy': -200, 'v': 40, 'mv': False}]
    sim.att = [(3, 2, 0x01020304, DEPLACER, 5, 1100, -200), (7, 9, 0x0A0B0C0D, CREER, -11, 22, 33)]
    return sim


def afficher_valeurs():
    print('== generateur aleatoire')
    a = Alea(0)
    print('graine 0, trois tirages : %s' % ', '.join('%016X' % a.suivant() for _ in range(3)))
    print('graine 42, premier tirage : %016X' % Alea(42).suivant())
    a = Alea(0)
    print('graine 0, Entre(0, 99) x3 : %s' % [a.entre(0, 99) for _ in range(3)])
    a = Alea(7)
    print('graine 7, Entre(-3, 3) x5 : %s' % [a.entre(-3, 3) for _ in range(5)])
    print('graine 0, Entre(MIN_int32, MAX_int32) : %d' % Alea(0).entre(MINI32, MAXI32))

    print('== empreinte FNV-1a 64')
    for nom, octets in (('vide', b''), ('a', b'a'), ('pdr', b'pdr')):
        print('%s : %016x' % (nom, fnv(octets)))

    print('== racine entiere')
    valeurs = (0, 1, 2, 3, 4, 15, 16, 17, 10**12, 10**12 - 1, 8 * 10**18, 2**63 - 1)
    print('references : %s' % [math.isqrt(v) for v in valeurs])
    for k in (67108865, 94906267, 2147483649, 2828427125, 3037000499):
        assert k * k < 2**63 and math.isqrt(k * k) == k and math.isqrt(k * k - 1) == k - 1
        flottante = int(math.sqrt(float(k * k - 1)))
        print('k = %d : racine(k*k - 1) = %d, racine(k*k) = %d ; en flottant : %d' % (k, k - 1, k, flottante))
    print('racine(999610257982111970) = %d' % math.isqrt(999610257982111970))

    print('== etat initial')
    for g in (0, 42):
        print('graine %d : %016x' % (g, Sim(g).empreinte()))

    print('== partie de reference (treize commandes, graine 0x1234)')
    scenario = [
        (0, 0, 0, CREER, 0, 0, 150), (0, 1, 0, CREER, 10000, -5000, 100), (0, 0, 1, DEPLACER, 1, 3000, 4000),
        (0, 2, 0, CREER, -7, 9, 1), (1, 2, 1, DEPLACER, 3, -2, 4), (5, 1, 1, DEPLACER, 2, -1000000000, 1000000000),
        (5, 1, 2, DEPLACER, 1, 0, 0), (10, 0, 2, ARRETER, 1, 0, 0), (12, 0, 3, DEPLACER, 1, -333, 777),
        (20, 1, 3, RETIRER, 2, 0, 0), (20, 1, 4, CREER, 2000000000, -2000000000, 999999),
        (21, 1, 5, DEPLACER, 4, -1000000000, 1000000000), (30, 0, 4, RETIRER, 99, 0, 0),
    ]
    s = Sim(0x1234)
    for c in reversed(scenario):
        assert s.soumettre(c) == 'acceptee'
    for cible in (0, 1, 2, 10, 11, 20, 21, 22, 34, 60):
        s.avancer_jusqua(cible)
        print('iteration %d : %016x' % (cible, s.empreinte()))
    print('etat final : %s, prochain id %d, appliquees %d, ignorees %d' % (
        [(e['id'], e['x'], e['y'], e['mv']) for e in s.esc], s.pid, s.app, s.ign))

    print('== deplacements')
    t = Sim(0)
    t.soumettre((0, 0, 0, CREER, 0, 0, 150))
    t.soumettre((0, 0, 1, DEPLACER, 1, 3000, 4000))
    for k in (1, 33, 34):
        t.avancer_jusqua(k)
        print('3-4-5 apres %d : (%d, %d) en marche %s' % (k, t.esc[0]['x'], t.esc[0]['y'], t.esc[0]['mv']))
    t = Sim(0)
    t.soumettre((0, 0, 0, CREER, 0, 0, 1))
    t.soumettre((0, 0, 1, DEPLACER, 1, 5, 5))
    t.avancer()
    while t.esc[0]['mv']:
        t.avancer()
    print('vitesse 1 en biais vers (5, 5) : arrivee apres %d iterations' % t.it)
    t = Sim(0)
    t.soumettre((0, 0, 0, CREER, -LIM, -LIM, VMAX))
    t.soumettre((0, 0, 1, DEPLACER, 1, LIM, LIM))
    t.avancer()
    print('diagonale du monde, premier pas : (%d, %d)' % (t.esc[0]['x'], t.esc[0]['y']))
    t = Sim(0)
    t.soumettre((0, 0, 0, CREER, 0, 0, 7))
    t.soumettre((0, 0, 1, DEPLACER, 1, -100, 33))
    t.avancer_jusqua(3)
    print('troncature apres 3 : (%d, %d)' % (t.esc[0]['x'], t.esc[0]['y']))

    print('== duree des trajets : iterations <= distance / (vitesse - 2) + 2 des la vitesse 3')
    a = Alea(31)
    pire = 0.0
    for essai in range(200):
        x0 = a.entre(-5000, 5000)
        y0 = a.entre(-5000, 5000)
        x1 = a.entre(-5000, 5000)
        y1 = a.entre(-5000, 5000)
        v = a.entre(1, 60)
        t = Sim(0)
        t.soumettre((0, 0, 0, CREER, x0, y0, v))
        t.soumettre((0, 0, 1, DEPLACER, 1, x1, y1))
        t.avancer()
        while t.esc[0]['mv']:
            t.avancer()
        if v >= 3:
            borne = math.isqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) // (v - 2) + 2
            assert t.it <= borne, (essai, t.it, borne)
            pire = max(pire, t.it / borne)
    print('200 trajets des tests : borne tenue, au pire %.3f de la borne' % pire)

    print('== sauvegarde des tests et alterations au hasard')
    octets = sauvegarde_des_tests().serialiser()
    print('sauvegarde : %d octets, FNV %016x' % (len(octets), fnv(octets)))
    print('alterations acceptees sur 4000 : %d' % alterations_acceptees(octets))

    print('== sauvegarde de reference')
    r = sauvegarde_de_reference()
    octets = r.serialiser()
    print('%d octets :' % len(octets))
    for debut in range(0, len(octets), 16):
        print('    ' + ' '.join('0x%02X,' % o for o in octets[debut:debut + 16]))
    relue = Sim.deserialiser(octets)
    assert relue is not None and relue.serialiser() == octets
    relue.avancer()
    print('apres 1 iteration : empreinte %016x, escouade %s, en attente %d' % (
        relue.empreinte(), [(e['id'], e['x'], e['y'], e['cx'], e['cy'], e['mv']) for e in relue.esc], len(relue.att)))
    relue.avancer_jusqua(8)
    print('a l\'iteration 8 : empreinte %016x, escouades %s' % (
        relue.empreinte(), [(e['id'], e['j'], e['x'], e['y'], e['v'], e['mv']) for e in relue.esc]))

    print('== parties temoins')
    for graine, duree in ((1, 1000), (2, 250), (M64, 500)):
        enr = generer(graine, duree)
        fin, commandes, empreintes = enr.extraire()
        texte = enr.texte()
        jumelles = sum(1 for i in range(1, len(commandes)) if commandes[i][:3] == commandes[i - 1][:3])
        print('graine %d, %d iterations : %d commandes (%d de meme cle que la precedente), %d empreintes, finale %016x' % (
            graine, duree, len(commandes), jumelles, len(empreintes), empreintes[-1][1]))
        print('    texte : %d caracteres, FNV %016x ; empreintes de chaque iteration : FNV %016x' % (
            len(texte), fnv(texte.encode('ascii')), empreintes_de_chaque_iteration(graine, commandes, fin)))


def comparer(dossier, iterations, premiere, derniere):
    identiques = 0
    total = derniere - premiere + 1
    for graine in range(premiere, derniere + 1):
        attendu = generer(graine, iterations).texte()
        with open('%s/partie-%05d.pdr' % (dossier, graine), 'rb') as f:
            obtenu = f.read().decode('ascii')
        if attendu == obtenu:
            identiques += 1
        else:
            la = attendu.split('\n')
            lo = obtenu.split('\n')
            rang = next((i for i in range(min(len(la), len(lo))) if la[i] != lo[i]), min(len(la), len(lo)))
            print('graine %d : DIFFERENT a la ligne %d' % (graine, rang + 1))
            print('  modele : %s' % (la[rang] if rang < len(la) else '<fin>'))
            print('  projet : %s' % (lo[rang] if rang < len(lo) else '<fin>'))
    print('MODELE identiques=%d sur=%d' % (identiques, total))
    return identiques == total


def principal(arguments):
    if len(arguments) == 1 and arguments[0] == 'valeurs':
        afficher_valeurs()
        return 0
    if len(arguments) == 4 and arguments[0] == 'condense':
        valeur, commandes, distinctes = condense(int(arguments[1]), int(arguments[2]), int(arguments[3]))
        print('MODELE condense=%016x commandes=%d distinctes=%d' % (valeur, commandes, distinctes))
        return 0
    if len(arguments) == 5 and arguments[0] == 'comparer':
        return 0 if comparer(arguments[1], int(arguments[2]), int(arguments[3]), int(arguments[4])) else 1
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(principal(sys.argv[1:]))
