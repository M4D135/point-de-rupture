// Noyau de simulation de l'étape A1, en JavaScript. Mêmes règles et mêmes résultats que le C++ (Source/PdrSim)
// et que le modèle Python (Outils/modele/modele_a1.py) : verifications/noyau.test.mjs rejoue les cent parties de test
// et retrouve leur condensé, 9565f56e1f910d8d.
//
// Entiers seulement, et chaque calcul reste exact. Un nombre JavaScript représente exactement tout entier jusqu'à 2^53 :
// positions, cibles et vitesses y tiennent largement. Les deux calculs qui en sortiraient ont leur propre voie :
//  - la racine de dx² + dy², en BigInt quand l'écart dépasse 33 km sur un axe ;
//  - l'empreinte FNV-1a sur 64 bits, calculée en deux moitiés de 32 bits.
// Le quotient tronqué du pas, (dx × vitesse) / distance, est exact : le produit reste sous 2^48, le quotient sous la
// vitesse, et l'erreur d'arrondi de la division (moins de 10^-11) n'atteint jamais l'écart à l'entier voisin (au moins
// 1 / distance, soit plus de 3 × 10^-10).
(function (PDR) {
  'use strict';

  const LIM = 1000000000, VMAX = 100000, EMAX = 4096, ITMAX = 2000000000, FILE_MAX = 1000000;
  const MAXI32 = 2147483647, MINI32 = -2147483648;
  const VERSION = 1, INTERVALLE = 100, PAR_SECONDE = 20;
  const CREER = 1, DEPLACER = 2, ARRETER = 3, RETIRER = 4;
  const DEUX32 = 4294967296;
  const ECART_EXACT = 33554432;

  const borner = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /** Partie entière de la racine de dx² + dy². */
  function racine(dx, dy) {
    if (Math.abs(dx) <= ECART_EXACT && Math.abs(dy) <= ECART_EXACT) {
      const n = dx * dx + dy * dy;
      let r = Math.floor(Math.sqrt(n));
      while (r * r > n) r--;
      while ((r + 1) * (r + 1) <= n) r++;
      return r;
    }
    const n = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy);
    let r = BigInt(Math.floor(Math.sqrt(Number(n))));
    while (r * r > n) r--;
    while ((r + 1n) * (r + 1n) <= n) r++;
    return Number(r);
  }

  /** (a × pas) / d tronqué vers zéro, pour |a| ≤ d : le résultat ne dépasse pas pas, donc | 0 ne coupe rien. */
  const quotient = (a, pas, d) => (a * pas / d) | 0;

  const hex8 = v => (v >>> 0).toString(16).padStart(8, '0');

  /** FNV-1a sur 64 bits des longueur premiers octets, rendu en seize chiffres hexadécimaux. */
  function fnv(octets, longueur) {
    let hi = 0xcbf29ce4, lo = 0x84222325;
    for (let i = 0; i < longueur; i++) {
      lo = (lo ^ octets[i]) >>> 0;
      // h × (2^40 + 435) modulo 2^64, moitié par moitié : aucun produit ne dépasse 2^42.
      const produit = lo * 435;
      const bas = produit % DEUX32;
      hi = (hi * 435 + lo * 256 + (produit - bas) / DEUX32) % DEUX32;
      lo = bas;
    }
    return hex8(hi) + hex8(lo);
  }

  /** Octets en petit-boutiste, comme Pdr::FEcrivain. */
  class Ecrivain {
    constructor(taille = 256) { this.octets = new Uint8Array(taille); this.vue = new DataView(this.octets.buffer); this.n = 0; }
    place(k) {
      if (this.n + k <= this.octets.length) return;
      const plus = new Uint8Array(Math.max(this.octets.length * 2, this.n + k));
      plus.set(this.octets.subarray(0, this.n));
      this.octets = plus; this.vue = new DataView(plus.buffer);
    }
    u8(v) { this.place(1); this.octets[this.n++] = v & 255; }
    i32(v) { this.place(4); this.vue.setInt32(this.n, v, true); this.n += 4; }
    u32(v) { this.place(4); this.vue.setUint32(this.n, v >>> 0, true); this.n += 4; }
    u64(v) { this.place(8); this.vue.setBigUint64(this.n, BigInt.asUintN(64, BigInt(v)), true); this.n += 8; }
    empreinte() { return fnv(this.octets, this.n); }
  }

  /** Ordre canonique : itération, joueur, rang, type, puis A, B, C. */
  function comparer(p, q) {
    for (let k = 0; k < 7; k++) if (p[k] !== q[k]) return p[k] < q[k] ? -1 : 1;
    return 0;
  }
  /** Insère après les commandes égales, comme bisect.insort_right. */
  function inserer(liste, c) {
    let bas = 0, haut = liste.length;
    while (bas < haut) { const m = (bas + haut) >> 1; if (comparer(c, liste[m]) < 0) haut = m; else bas = m + 1; }
    liste.splice(bas, 0, c);
  }

  const estEntier = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  /** Une commande que le C++ pourrait représenter : sept entiers aux largeurs de Pdr::FCommande. */
  function commandeBienFormee(c) {
    return Array.isArray(c) && c.length === 7 && estEntier(c[0], MINI32, MAXI32) && estEntier(c[1], 0, 255)
      && estEntier(c[2], 0, DEUX32 - 1) && estEntier(c[3], 0, 255)
      && estEntier(c[4], MINI32, MAXI32) && estEntier(c[5], MINI32, MAXI32) && estEntier(c[6], MINI32, MAXI32);
  }

  class Simulation {
    constructor(graine = 0) {
      this.graine = BigInt.asUintN(64, BigInt(graine));
      this.it = 0;
      this.alea = this.graine;
      this.pid = 1;
      this.app = 0;
      this.ign = 0;
      this.esc = [];
      this.att = [];
      this.ecrivain = new Ecrivain(1024);
    }

    /** Rend 'acceptee', 'invalide', 'tardive' ou 'pleine'. */
    soumettre(c) {
      if (!commandeBienFormee(c)) throw new Error('commande mal formée : ' + JSON.stringify(c));
      if (!(c[3] >= 1 && c[3] <= 4) || c[0] < 0 || c[0] >= ITMAX) return 'invalide';
      if (c[0] < this.it) return 'tardive';
      if (this.att.length >= FILE_MAX) return 'pleine';
      inserer(this.att, c);
      return 'acceptee';
    }

    /** Un de plus que le plus grand rang en attente de ce joueur, sans dépasser 2^32 - 1. */
    sequenceLibre(joueur) {
      let plus = -1;
      for (const c of this.att) if (c[1] === joueur && c[2] > plus) plus = c[2];
      return plus < 0 ? 0 : Math.min(plus + 1, DEUX32 - 1);
    }

    trouver(ident) {
      for (const e of this.esc) if (e.id === ident) return e;
      return null;
    }

    appliquer(c) {
      const [, joueur, , type, a, b, cc] = c;
      let fait = false;
      if (type === CREER) {
        if (this.esc.length < EMAX && this.pid < MAXI32) {
          const x = borner(a, -LIM, LIM), y = borner(b, -LIM, LIM);
          this.esc.push({ id: this.pid, j: joueur, x, y, cx: x, cy: y, v: borner(cc, 0, VMAX), mv: false });
          this.pid += 1;
          fait = true;
        }
      } else {
        const e = this.trouver(a);
        if (e !== null && e.j === joueur) {
          if (type === DEPLACER) {
            e.cx = borner(b, -LIM, LIM);
            e.cy = borner(cc, -LIM, LIM);
            e.mv = e.v > 0 && (e.cx !== e.x || e.cy !== e.y);
          } else if (type === ARRETER) {
            e.cx = e.x; e.cy = e.y; e.mv = false;
          } else {
            this.esc.splice(this.esc.indexOf(e), 1);
          }
          fait = true;
        }
      }
      if (fait) this.app = (this.app + 1) >>> 0;
      else this.ign = (this.ign + 1) >>> 0;
    }

    avancer() {
      if (this.it >= ITMAX) return;
      let n = 0;
      while (n < this.att.length && this.att[n][0] === this.it) { this.appliquer(this.att[n]); n++; }
      if (n > 0) this.att.splice(0, n);
      for (const e of this.esc) {
        if (!e.mv) continue;
        const dx = e.cx - e.x, dy = e.cy - e.y;
        const d = racine(dx, dy), pas = e.v;
        if (d <= pas) { e.x = e.cx; e.y = e.cy; e.mv = false; continue; }
        let sx = quotient(dx, pas, d), sy = quotient(dy, pas, d);
        if (sx === 0 && sy === 0 && pas > 0) {
          if (Math.abs(dx) >= Math.abs(dy)) sx = dx > 0 ? 1 : -1;
          else sy = dy > 0 ? 1 : -1;
        }
        e.x += sx; e.y += sy;
      }
      this.it += 1;
    }

    avancerJusqua(cible) {
      const fin = Math.min(cible, ITMAX);
      while (this.it < fin) this.avancer();
    }

    /** L'état sans la file d'attente, tel que le condense l'empreinte. */
    ecrireEtat(w) {
      w.i32(VERSION); w.i32(this.it); w.u64(this.alea); w.i32(this.pid); w.u32(this.app); w.u32(this.ign); w.i32(this.esc.length);
      for (const e of this.esc) { w.i32(e.id); w.u8(e.j); w.i32(e.x); w.i32(e.y); w.i32(e.cx); w.i32(e.cy); w.i32(e.v); w.u8(e.mv ? 1 : 0); }
    }

    empreinte() {
      const w = this.ecrivain;
      w.n = 0;
      this.ecrireEtat(w);
      return w.empreinte();
    }
  }

  /** La simulation, plus le journal des commandes acceptées et une empreinte toutes les cent itérations. */
  class Enregistreur {
    constructor(graine) {
      this.sim = new Simulation(graine);
      this.cmds = [];
      this.empreintes = [[0, this.sim.empreinte()]];
    }
    soumettre(c) {
      const verdict = this.sim.soumettre(c);
      if (verdict === 'acceptee') inserer(this.cmds, c);
      return verdict;
    }
    avancer() {
      const avant = this.sim.it;
      this.sim.avancer();
      if (this.sim.it !== avant && this.sim.it % INTERVALLE === 0) this.empreintes.push([this.sim.it, this.sim.empreinte()]);
    }
    extraire() {
      const fin = this.sim.it;
      const commandes = this.cmds.filter(c => c[0] < fin);
      const empreintes = this.empreintes.slice();
      if (empreintes[empreintes.length - 1][0] !== fin) empreintes.push([fin, this.sim.empreinte()]);
      return { fin, commandes, empreintes };
    }
    /** Le texte d'une relecture, au caractère près celui qu'écrit le C++. */
    texte() {
      const { fin, commandes, empreintes } = this.extraire();
      const lignes = ['pdr-relecture ' + VERSION, 'graine ' + this.sim.graine, 'iterations ' + fin];
      for (const c of commandes) lignes.push('cmd ' + c.join(' '));
      for (const [i, h] of empreintes) lignes.push('empreinte ' + i + ' ' + h);
      lignes.push('fin');
      return lignes.join('\n') + '\n';
    }
  }

  /** SplitMix64, comme Pdr::FAlea. */
  class Alea {
    constructor(graine) { this.etat = BigInt.asUintN(64, BigInt(graine)); }
    suivant() {
      this.etat = BigInt.asUintN(64, this.etat + 0x9E3779B97F4A7C15n);
      let z = this.etat;
      z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n);
      z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94D049BB133111EBn);
      return z ^ (z >> 31n);
    }
    entre(mn, mx) {
      if (mx <= mn) return mn;
      return mn + Number(this.suivant() % BigInt(mx - mn + 1));
    }
  }

  /** Une partie de test : des ordres tirés au sort, valeurs limites comprises (Pdr::GenererPartie). */
  function generer(graine, iterations) {
    const JOUEURS = [0, 1, 2, 255], RAYON = 200000;
    const enr = new Enregistreur(graine);
    const alea = new Alea(BigInt.asUintN(64, BigInt(graine)) ^ 0xA5A5A5A55A5A5A5An);
    const seqs = [0, 0, 0, 0];
    const emettre = (it, rang, seq, type, a, b, c) => enr.soumettre([it, JOUEURS[rang], seq, type, a, b, c]);
    const tirerVitesse = () => {
      const cas = alea.entre(0, 99);
      if (cas < 3) return 0;
      if (cas < 6) return 1;
      if (cas < 8) return VMAX;
      if (cas === 8) return -1;
      if (cas === 9) return VMAX + 1;
      return alea.entre(20, 400);
    };
    const tirerCoordonnee = () => {
      const cas = alea.entre(0, 199);
      if (cas === 0) return LIM;
      if (cas === 1) return -LIM;
      if (cas === 2) return MAXI32;
      if (cas === 3) return MINI32;
      if (cas === 4) return -LIM - 1;
      if (cas === 5) return LIM + 1;
      return alea.entre(-RAYON, RAYON);
    };
    for (let rang = 0; rang < JOUEURS.length; rang++) {
      for (let k = 0; k < 4; k++) {
        const x = tirerCoordonnee(), y = tirerCoordonnee(), v = tirerVitesse();
        emettre(0, rang, seqs[rang], CREER, x, y, v);
        seqs[rang] += 1;
      }
    }
    const duree = Math.max(0, Math.min(iterations, ITMAX));
    for (let it = 0; it < duree; it++) {
      while (alea.entre(0, 3) === 0) {
        const rang = alea.entre(0, JOUEURS.length - 1);
        const retard = alea.entre(0, 5);
        const cas = alea.entre(0, 99);
        const x = tirerCoordonnee(), y = tirerCoordonnee(), v = tirerVitesse();
        const jumelle = alea.entre(0, 99);
        const x2 = tirerCoordonnee(), y2 = tirerCoordonnee();
        const esc = enr.sim.esc, total = esc.length;
        let ident = alea.entre(1, enr.sim.pid + 1);
        if (total > 0 && cas < 95) {
          const depart = alea.entre(0, total - 1);
          for (let dec = 0; dec < total; dec++) {
            const candidate = esc[(depart + dec) % total];
            if (candidate.j === JOUEURS[rang]) { ident = candidate.id; break; }
          }
        }
        const quand = it + retard, seq = seqs[rang];
        seqs[rang] += 1;
        if (cas < 55) emettre(quand, rang, seq, DEPLACER, ident, x, y);
        else if (cas < 70) emettre(quand, rang, seq, ARRETER, ident, 0, 0);
        else if (cas < 85) emettre(quand, rang, seq, CREER, x, y, v);
        else if (cas < 95) emettre(quand, rang, seq, RETIRER, ident, 0, 0);
        else emettre(quand, rang, seq, DEPLACER, ident, x, y);
        // Même itération, même joueur, même rang, autre contenu : seul le contenu départage.
        if (jumelle === 0) emettre(quand, rang, seq, DEPLACER, ident, x2, y2);
      }
      enr.avancer();
    }
    return enr;
  }

  /** Condensé de l'exécuteur pour les graines premiere à derniere (PdrOutils::Condenser). */
  function condense(iterations, premiere, derniere) {
    const w = new Ecrivain(1 << 16);
    const finales = new Set();
    let commandes = 0;
    for (let graine = premiere; graine <= derniere; graine++) {
      const { fin, commandes: jouees, empreintes } = generer(graine, iterations).extraire();
      w.u64(graine); w.i32(fin); w.i32(jouees.length); w.i32(empreintes.length);
      for (const [i, h] of empreintes) { w.i32(i); w.u64(BigInt('0x' + h)); }
      commandes += jouees.length;
      finales.add(empreintes[empreintes.length - 1][1]);
    }
    return { condense: w.empreinte(), commandes, distinctes: finales.size };
  }

  PDR.noyau = {
    LIM, VMAX, EMAX, ITMAX, FILE_MAX, VERSION, INTERVALLE, PAR_SECONDE, CREER, DEPLACER, ARRETER, RETIRER,
    racine, quotient, fnv, Ecrivain, Simulation, Enregistreur, Alea, generer, condense, commandeBienFormee,
  };
})(globalThis.PDR = globalThis.PDR || {});
