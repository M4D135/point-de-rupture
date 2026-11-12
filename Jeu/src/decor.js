/* Point de rupture — le décor du jeu (CONCEPTION.md §1.6, §3.1) : ce que la ville ne porte pas elle-même.

   Lots stables pour le moteur (fx.lots, au format de pack de FERRO ; un lot ne repart au GPU que s'il change) :
   - les cassables de ville.sites, intacts ou cassés (etat.cassables) ;
   - les tas des gisements, qui baissent avec leur stock (etat.gisements) ;
   - les structures (etat.structures) : avant-postes (Relais : kiosque, tente et banderoles ; Cantonnement : palissade et
     guérite ; Poste mobile : fourgon et rampe lumineuse) et barricades (palettes, pneus, morceaux de voiture, barrières),
     en chantier par étapes ou finies, noircies quand elles brûlent. Celles d'un camp ni joueur ni allié sont dans un lot à
     part, sans celles qui sont hors de vue quand le brouillard est actif ;
   - les marques : bannières des lieux (couleur et motif du camp qui tient), anneau de prise, occupation des QG.
   Effets de chaque image (maillages dynamiques de FERRO, translucides ou pleins, et lampes) : poussière d'une unité mise
   hors jeu, éclats d'une casse, cercle annoncé puis impact d'une salve, jet du canon à eau, feu et fumée des barricades
   qui brûlent (le feu est un décor : il ne touche jamais une unité), rampe lumineuse des postes mobiles, prise d'un lieu,
   marques d'ordre, sélection et fanions de ralliement des structures. Aucun insigne réel : couleur et motif seulement
   (rond, carré, chevron).

   API :
     const decor = PDR.decor.creerDecor(ville, { carte, joueur, allie, brouillard, effectifs })
       ville : PDR.ville.creerVille(...) (sites, sol) ; carte : CARTE du message « pret » (minicarte), facultative ;
       effectifs : OPTIONS.effectifs, pour le stock de départ des gisements (sinon le premier stock reçu).
     decor.etat(etat)              à chaque message « etat » : structures, cassables, gisements, lieux, minicarte,
                                   evenements, alliance. Ce qui sert est copié : les tampons peuvent repartir.
     decor.regler({ joueur, allie, brouillard })
     decor.voile(u8, geometrie)    ETAT.voile et CARTE.voile { nx, nz, x0, z0, cellule } ; null efface.
     decor.selectionner(ids, n)    structures sélectionnées (id) : anneau, et fanion de ralliement pour celles du joueur.
     decor.ordre(x, z, sorte)      marque d'un ordre au sol : 'deplacer', 'attaquer', 'capacite', 'ralliement', 'refus'.
     decor.cadre(vue, temps)       à chaque image, avant renderer.draw ; vue = camera.vue(dt), temps en s. Rend
                                   { lots, dynamique, lumieres } : fx.lots = lots ; dynamique : maillages à passer à draw
                                   avec ceux du jeu ; fx.lights = lumieres. Tableaux et objets réutilisés d'une image à
                                   l'autre : ne pas les garder.
     decor.structure(id)           dernière STRUCTURE reçue pour cet id, ou null.
     decor.mesure                  { instances, effets, particules, solides, lumieres, reconstructions, msEtat, msCadre }
   Pour les tests (sans WebGL) : PDR.decor.construireStructure(structure, sol, puits, options),
     construireCassable(cassable, casse, puits), construireTas(gisement, part, sol, puits), construireLieu(lieu, marque,
     sol, puits), creerLot(nom), creerCollecteur(). Un puits reçoit
     mettre(forme, px, py, pz, sx, sy, sz, rx, ry, rz, mat, r, g, b, emission) ; forme : indice dans NOMS ; r < 0 : sans
     couleur d'instance. */
(function (PDR) {
  'use strict';

  const NOMS = Object.freeze(['box', 'sphere', 'cylinder', 'octa', 'ring', 'bevel', 'foliage']);
  const BOITE = 0, SPHERE = 1, CYL = 2, OCTA = 3, ANNEAU = 4;
  const MAT = Object.freeze({ METAL: 0, BETON: 3, MAT: 7, ECORCE: 10, ASPHALTE: 14, PAVE: 15, LAQUE: 17, TISSU: 18 });
  const DRAPEAUX_OBJET = 6;                       // pack de FERRO : dehors (2) + objet (4)
  const PI = Math.PI;
  const P = PDR.protocole, RG = PDR.regles;
  const EV = (P && P.EV) || Object.freeze({ HORS_JEU: 1, CASSE: 2, BARRICADE_POSEE: 3, BARRICADE_FINIE: 4, BARRICADE_LEVEE: 5,
    STRUCTURE_FINIE: 6, STRUCTURE_DETRUITE: 7, LIEU_PRIS: 8, LIEU_NEUTRALISE: 9, SALVE_ANNONCE: 10, SALVE: 11, JET: 12,
    PRODUCTION: 13, QG_OCCUPE: 22, QG_REPRIS: 23, SOIN: 25 });
  const EV_TAILLE = (P && P.EV_TAILLE) || 6;
  const SORTES_CASSABLES = (P && P.SORTES_CASSABLES) || ['voiture', 'abribus', 'vitrine', 'poubelle', 'banc', 'barriere'];
  const COULEURS = Object.freeze([0, 1, 2].map(f => Object.freeze(RG && RG.FACTIONS && RG.FACTIONS[f]
    ? RG.FACTIONS[f].couleur.slice() : [[0.9, 0.27, 0.19], [0.93, 0.64, 0.15], [0.22, 0.45, 0.9]][f])));
  const NEUTRE = Object.freeze([0.8, 0.79, 0.75]), BLANC = Object.freeze([0.93, 0.92, 0.88]);
  const SEUIL_VU = 90;                            // comme la foule : 0,35 du voile
  const borner = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fois = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const melanger = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const fini = v => typeof v === 'number' && Number.isFinite(v);
  const couleurCamp = f => (f >= 0 && f < 3 ? COULEURS[f] : NEUTRE);

  /** Tirage reproductible (mulberry32). */
  function alea(graine) {
    let a = graine >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Lots et puits.
  // ---------------------------------------------------------------------------------------------------------------

  /** Lot au format de pack : { values (16 nombres par instance), groups [{ name, offset (octets), count }], version }. */
  function creerLot(nom) {
    const parForme = NOMS.map(() => ({ f: new Float32Array(16 * 64), n: 0 }));
    const place = (t, n) => {
      if ((t.n + n) * 16 <= t.f.length) return;
      let taille = t.f.length * 2;
      while (taille < (t.n + n) * 16) taille *= 2;
      const g = new Float32Array(taille); g.set(t.f.subarray(0, t.n * 16)); t.f = g;
    };
    const lot = {
      nom, version: 0, values: new Float32Array(0), groups: [], instances: 0,
      debut() { for (const t of parForme) t.n = 0; return lot; },
      mettre(forme, px, py, pz, sx, sy, sz, rx, ry, rz, mat, r, g, b, emission) {
        const t = parForme[forme];
        place(t, 1);
        const f = t.f, o = t.n * 16, avec = r >= 0;
        f[o] = px; f[o + 1] = py; f[o + 2] = pz; f[o + 3] = mat; f[o + 4] = sx; f[o + 5] = sy; f[o + 6] = sz; f[o + 7] = emission;
        f[o + 8] = rx; f[o + 9] = ry; f[o + 10] = rz; f[o + 11] = DRAPEAUX_OBJET;
        f[o + 12] = avec ? r : 0; f[o + 13] = avec ? g : 0; f[o + 14] = avec ? b : 0; f[o + 15] = avec ? 1 : 0;
        t.n++;
      },
      /** Recopie n lignes déjà empaquetées (source : Float32Array, à partir de la ligne debut). */
      copier(forme, source, debut, n) {
        if (n <= 0) return;
        const t = parForme[forme];
        place(t, n);
        t.f.set(source.subarray(debut * 16, (debut + n) * 16), t.n * 16);
        t.n += n;
      },
      fin() {
        let total = 0;
        for (const t of parForme) total += t.n;
        const values = new Float32Array(total * 16), groups = [];
        let o = 0;
        for (let i = 0; i < NOMS.length; i++) {
          const t = parForme[i];
          if (!t.n) continue;
          values.set(t.f.subarray(0, t.n * 16), o * 16);
          groups.push({ name: NOMS[i], offset: o * 64, count: t.n });
          o += t.n;
        }
        lot.values = values; lot.groups = groups; lot.instances = total; lot.version++;
        return lot;
      },
    };
    return lot;
  }

  /** Puits qui garde des maillages au format de scène de FERRO (tests, outillage). */
  function creerCollecteur() {
    const maillages = [];
    return {
      maillages,
      mettre(forme, px, py, pz, sx, sy, sz, rx, ry, rz, mat, r, g, b, emission) {
        const m = { shape: NOMS[forme], p: [px, py, pz], s: [sx, sy, sz], r: [rx, ry, rz], mat, emissive: emission,
          outdoor: true, surface: 'object' };
        if (r >= 0) m.color = [r, g, b];
        maillages.push(m);
      },
    };
  }

  /** Repère d'un objet posé en (x, y, z), tourné de lacet : u le long, v en travers, comme ville.js. */
  function repere(puits, x, y, z, lacet) {
    const ca = Math.cos(lacet), sa = Math.sin(lacet);
    const R = {
      x, y, z, lacet,
      wx: (u, v) => x + u * ca + v * sa,
      wz: (u, v) => z - u * sa + v * ca,
      /** Pièce centrée en (u, h, v) ; rx : roulis autour de son propre axe u ; dl : son lacet en plus de celui du repère. */
      p(forme, u, h, v, su, sy, sv, mat, c, rx = 0, dl = 0, em = 0) {
        puits.mettre(forme, x + u * ca + v * sa, y + h, z - u * sa + v * ca, su, sy, sv, rx, lacet + dl, 0, mat, c[0], c[1], c[2], em);
      },
      /** Boîte posée : son bas à la hauteur h. */
      b(u, h, v, su, sy, sv, mat, c, rx = 0, dl = 0, em = 0) { R.p(BOITE, u, h + sy / 2, v, su, sy, sv, mat, c, rx, dl, em); },
    };
    return R;
  }
  /** Point (a, b) d'un sous-repère tourné de dl, posé en (u, v) du repère. */
  const sous = (u, v, dl, a, b) => [u + a * Math.cos(dl) + b * Math.sin(dl), v - a * Math.sin(dl) + b * Math.cos(dl)];

  // ---------------------------------------------------------------------------------------------------------------
  // Pièces de barricade et de structure.
  // ---------------------------------------------------------------------------------------------------------------

  function palette(R, u, h, v, dl, bois) {
    R.p(BOITE, u, h + 0.125, v, 1.2, 0.03, 0.8, MAT.ECORCE, bois, 0, dl);
    for (const w of [-0.34, 0, 0.34]) {
      const [a, b] = sous(u, v, dl, 0, w);
      R.p(BOITE, a, h + 0.055, b, 1.2, 0.11, 0.1, MAT.ECORCE, fois(bois, 0.78), 0, dl);
    }
  }
  function pneu(R, u, h, v) {
    R.p(CYL, u, h + 0.12, v, 0.72, 0.24, 0.72, MAT.MAT, [0.075, 0.075, 0.08]);
    R.p(CYL, u, h + 0.245, v, 0.34, 0.012, 0.34, MAT.MAT, [0.015, 0.015, 0.016]);
  }
  function barriereMetal(R, u, h, v, dl, penche, gris) {
    // Barrière de foule : deux lisses, deux montants, cinq barreaux ; penchée d'un roulis autour de son axe.
    const c = Math.cos(penche), s = Math.sin(penche);
    const en = (a, y, b2) => { const yy = y * c - b2 * s, bb = y * s + b2 * c; const [x, z] = sous(u, v, dl, a, bb); return [x, h + yy, z]; };
    const mettre = (a, y, sa, sy) => { const [x, yy, z] = en(a, y, 0); R.p(BOITE, x, yy, z, sa, sy, 0.05, MAT.METAL, gris, penche, dl); };
    mettre(0, 1.0, 2.2, 0.06); mettre(0, 0.2, 2.2, 0.05);
    mettre(-1.05, 0.53, 0.06, 1.06); mettre(1.05, 0.53, 0.06, 1.06);
    for (let k = -2; k <= 2; k++) mettre(k * 0.38, 0.6, 0.035, 0.8);
  }
  function porte(R, u, h, v, dl, c, penche) {
    const s = Math.sin(penche), cc = Math.cos(penche);
    const [x, z] = sous(u, v, dl, 0, 0.45 * s);
    R.p(BOITE, x, h + 0.45 * cc + 0.04, z, 1.1, 0.9, 0.07, MAT.LAQUE, c, penche, dl);
    const [x2, z2] = sous(u, v, dl, 0.05, 0.72 * s + 0.04 * cc);
    R.p(BOITE, x2, h + 0.72 * cc + 0.04, z2, 0.8, 0.3, 0.02, MAT.LAQUE, [0.05, 0.06, 0.07], penche, dl);
  }
  function conteneur(R, u, h, v, dl, c) {
    R.b(u, h, v, 0.72, 1.0, 0.78, MAT.LAQUE, c, 0, dl);
    R.b(u, h + 1.0, v, 0.76, 0.06, 0.82, MAT.MAT, fois(c, 0.6), 0, dl);
  }
  /** Carcasse de voiture couchée sur le flanc, le long du repère. */
  function carcasse(R, u, h, v, c) {
    R.b(u, h, v, 4.1, 1.72, 0.74, MAT.LAQUE, c);
    R.b(u - 0.2, h + 0.1, v + 0.62, 2.2, 1.5, 0.52, MAT.LAQUE, fois(c, 0.5));
    for (const a of [-1.35, 1.35]) for (const y of [0.13, 1.6]) R.p(CYL, u + a, h + y, v - 0.48, 0.68, 0.24, 0.68, MAT.MAT, [0.06, 0.06, 0.065]);
  }

  const BOIS = [[0.62, 0.48, 0.3], [0.55, 0.42, 0.27], [0.68, 0.55, 0.36], [0.5, 0.37, 0.24]];
  const TOLES = [[0.62, 0.62, 0.64], [0.12, 0.13, 0.15], [0.5, 0.1, 0.09], [0.16, 0.25, 0.45], [0.82, 0.82, 0.8], [0.2, 0.33, 0.24]];
  const CONTENEURS = [[0.2, 0.36, 0.24], [0.36, 0.38, 0.4], [0.22, 0.3, 0.5]];

  /** Avancement d'une structure, 0..1 (pv / pvMax), par 48es : le décor ne repart au GPU que si un cran change. */
  function progression(s) {
    const pv = fini(s.pv) ? s.pv : 0, max = fini(s.pvMax) && s.pvMax > 0 ? s.pvMax : 0;
    return max ? Math.floor(borner(pv / max, 0, 1) * 48) / 48 : 1;
  }

  /** Barricade : éléments tirés de son id le long du segment ; en chantier ou entamée, une part seulement. */
  function barricade(puits, s, sol) {
    const x1 = fini(s.x) ? s.x : 0, z1 = fini(s.z) ? s.z : 0;
    const x2 = fini(s.x2) ? s.x2 : x1, z2 = fini(s.z2) ? s.z2 : z1;
    let L = Math.hypot(x2 - x1, z2 - z1);
    const lacet = L > 0.01 ? Math.atan2(-(z2 - z1), x2 - x1) : 0;
    L = borner(L < 0.5 ? 4 : L, 2, 24);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, y = sol(cx, cz);
    const R = repere(puits, cx, y, cz, lacet), rd = alea(0x2545F491 ^ Math.imul((s.id | 0) + 1, 0x9E3779B1));
    const k = progression(s), brule = !!s.feu, ternir = brule ? 0.4 : 1;
    // Tracé au sol, toujours : le ruban du chantier, puis la trace de la barricade.
    R.b(0, 0.005, 0, L, 0.012, 0.16, MAT.MAT, s.chantier ? fois(couleurCamp(s.faction), 0.9) : [0.12, 0.12, 0.12], 0, 0, s.chantier ? 0.35 : 0);
    const items = [];
    let u = -L / 2 + 0.25, voiture = false;
    while (u < L / 2 - 0.45) {
      const reste = L / 2 - u, t = rd();
      let sorte, w;
      if (!voiture && reste > 4.7 && L >= 8 && t < 0.24) { sorte = 0; w = 4.3; voiture = true; }
      else if (t < 0.46) { sorte = 1; w = 1.3; }
      else if (t < 0.6) { sorte = 2; w = 0.85; }
      else if (t < 0.74 && reste > 2.5) { sorte = 3; w = 2.3; }
      else if (t < 0.87) { sorte = 4; w = 1.2; }
      else { sorte = 5; w = 0.8; }
      items.push([sorte, u + w / 2, (rd() - 0.5) * 0.5, (rd() - 0.5) * 0.5, rd(), rd()]);
      u += w + 0.06 + rd() * 0.22;
    }
    for (let n = Math.max(1, Math.round(L / 4)); n > 0; n--) items.push([6, (rd() - 0.5) * (L - 2), (rd() - 0.5) * 0.4, (rd() - 0.5) * 1.1, 0.5 + rd() * 0.5, rd()]);
    for (const [sorte, iu, iv, dl, rang, g] of items) {
      if (k < 1 && rang >= k) continue;
      // Tirage propre à l'élément : il ne bouge pas quand les autres apparaissent.
      const ri = alea(Math.floor(g * 4294967295));
      const bois = fois(BOIS[(g * 4) | 0], ternir), tole = fois(TOLES[(g * 6) | 0], ternir * 0.85);
      if (sorte === 0) carcasse(R, iu, 0, iv, tole);
      else if (sorte === 1) {
        const n = 2 + ((g * 3) | 0);
        for (let j = 0; j < n; j++) palette(R, iu + (ri() - 0.5) * 0.1, j * 0.145, iv, dl + (ri() - 0.5) * 0.15, bois);
        if (g > 0.45) R.p(BOITE, iu + 0.05, n * 0.145 + 0.55, iv - 0.18, 1.2, 0.8, 0.14, MAT.ECORCE, fois(bois, 0.9), 0.32, dl);
      } else if (sorte === 2) {
        const n = 2 + ((g * 2.99) | 0);
        for (let j = 0; j < n; j++) pneu(R, iu + (ri() - 0.5) * 0.12, j * 0.245, iv + (ri() - 0.5) * 0.12);
      } else if (sorte === 3) barriereMetal(R, iu, 0, iv, dl * 0.4, (g - 0.5) * 0.5, fois([0.72, 0.74, 0.76], ternir));
      else if (sorte === 4) { porte(R, iu, 0, iv, dl, tole, -0.3 - g * 0.3); if (g > 0.5) pneu(R, iu + 0.3, 0, iv + 0.45); }
      else if (sorte === 5) conteneur(R, iu, 0, iv, dl, fois(CONTENEURS[(g * 3) | 0], ternir));
      else R.p(BOITE, iu, 0.95 + g * 0.35, iv, 2.6, 0.05, 0.22, MAT.ECORCE, fois(bois, 1.05), (g - 0.5) * 0.6, dl);
    }
    return { cx, cz, y, L, lacet };
  }

  /** Banderole sur hampe, à la couleur du camp, motif blanc sur les deux faces (rond, carré ou chevron). */
  function banniere(R, u, v, hauteur, c, motif, largeur = 0.95, haut = 2.2) {
    R.p(CYL, u, hauteur / 2, v, 0.09, hauteur, 0.09, MAT.METAL, [0.55, 0.56, 0.58]);
    R.p(SPHERE, u, hauteur + 0.06, v, 0.16, 0.16, 0.16, MAT.METAL, [0.7, 0.66, 0.5]);
    const bu = u + largeur / 2 + 0.05, by = hauteur - haut / 2 - 0.15;
    R.p(BOITE, bu, by, v, largeur, haut, 0.04, MAT.TISSU, c);
    if (motif < 0) return;
    for (const dv of [-0.026, 0.026]) {
      const t = Math.min(largeur, haut) * 0.6;
      if (motif === 0) R.p(CYL, bu, by + haut * 0.12, v + dv, t, 0.012, t, MAT.TISSU, BLANC, PI / 2);
      else if (motif === 1) R.p(BOITE, bu, by + haut * 0.12, v + dv, t * 0.86, t * 0.86, 0.012, MAT.TISSU, BLANC);
      else {
        for (const [a, th] of [[-0.19, -0.7], [0.19, 0.7]]) R.p(BOITE, bu + a * t * 1.4, by + haut * 0.12, v + dv, 0.012, t * 0.22, t * 0.72, MAT.TISSU, BLANC, th, PI / 2);
      }
    }
  }

  /** Relais (Convergence) : kiosque à lambrequin et toit en pointe, tente à deux pans, banderoles. */
  function relais(R, rd, k, c, chantier) {
    const metal = [0.6, 0.62, 0.64], bois = [0.55, 0.42, 0.28];
    R.b(0, 0, 0, 8.6, 0.06, 7.4, MAT.PAVE, [0.62, 0.6, 0.56]);
    const hk = 2.5 * Math.min(1, k / 0.45);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) R.p(CYL, -2 + a * 1.45, 0.06 + hk / 2, -0.4 + b * 1.45, 0.1, hk, 0.1, MAT.METAL, metal);
    if (k > 0.45) {
      R.b(-2, 0.06, 1.0, 3.0, 1.0, 0.5, MAT.TISSU, c);
      R.b(-2, 1.06, 1.0, 3.04, 0.06, 0.56, MAT.ECORCE, bois);
      R.b(-2.6, 1.12, 1.0, 0.5, 0.3, 0.36, MAT.ECORCE, BOIS[2]);
    }
    if (k > 0.7) {
      for (const [du, dv, su, sv] of [[0, -1.5, 3.1, 0.04], [0, 1.5, 3.1, 0.04], [-1.5, 0, 0.04, 3.1], [1.5, 0, 0.04, 3.1]]) {
        R.b(-2 + du, 2.0, -0.4 + dv, su, 0.55, sv, MAT.TISSU, c);
      }
      R.p(OCTA, -2, 2.55, -0.4, 4.45, 1.5, 4.45, MAT.TISSU, melanger(c, BLANC, 0.18), 0, PI / 4);
    }
    // Tente à deux pans, faîtage le long de u.
    const ht = 2.3 * Math.min(1, k / 0.6);
    for (const a of [-1.6, 1.6]) R.p(CYL, 2.2 + a, 0.06 + ht / 2, -0.3, 0.07, ht, 0.07, MAT.METAL, metal);
    if (k > 0.6) {
      R.p(BOITE, 2.2, 1.8, -0.3 + 0.72, 3.5, 0.04, 1.86, MAT.TISSU, BLANC, 0.63);
      R.p(BOITE, 2.2, 1.8, -0.3 - 0.72, 3.5, 0.04, 1.86, MAT.TISSU, c, -0.63);
      R.p(CYL, 2.2, 2.33, -0.3, 0.06, 3.6, 0.06, MAT.METAL, metal, PI / 2, PI / 2);
    }
    // Caisses et matériel, toujours là (chantier compris).
    for (let j = 0; j < 4; j++) R.b(-3.4 + j * 0.7, 0.06, -3.0 + (rd() - 0.5) * 0.3, 0.6, 0.42 + rd() * 0.2, 0.45, MAT.ECORCE, BOIS[j & 3], 0, (rd() - 0.5) * 0.4);
    if (k >= 1 && !chantier) { banniere(R, -3.9, 3.3, 5.2, c, 0); banniere(R, 3.0, 3.3, 5.2, c, 0); }
  }

  /** Cantonnement (Bastion) : palissade de planches, guérite, abri bâché, banderole. */
  function cantonnement(R, rd, k, c, chantier) {
    const bois = [0.52, 0.4, 0.26];
    R.b(0, 0, 0, 9.8, 0.05, 9.8, MAT.BETON, [0.6, 0.58, 0.55]);
    const pas = 8.8 / 28;
    for (let cote = 0; cote < 4; cote++) for (let i = 0; i < 28; i++) {
      const t = -4.4 + (i + 0.5) * pas, h0 = rd(), rang = rd();
      if (cote === 0 && Math.abs(t) < 1.3) continue;
      if (k < 1 && rang >= k) continue;
      const h = 1.85 + h0 * 0.4;
      const [u, v, dl] = cote === 0 ? [t, 4.5, 0] : cote === 1 ? [4.5, t, PI / 2] : cote === 2 ? [t, -4.5, 0] : [-4.5, t, PI / 2];
      R.b(u, 0.05, v, 0.29, h, 0.09, MAT.ECORCE, fois(bois, 0.82 + h0 * 0.32), 0, dl);
    }
    if (k > 0.5) {
      for (const y of [0.55, 1.6]) {
        R.b(0, y, -4.42, 8.8, 0.12, 0.08, MAT.ECORCE, fois(bois, 0.7));
        R.b(4.42, y, 0, 0.08, 0.12, 8.8, MAT.ECORCE, fois(bois, 0.7));
        R.b(-4.42, y, 0, 0.08, 0.12, 8.8, MAT.ECORCE, fois(bois, 0.7));
        for (const a of [-2.85, 2.85]) R.b(a, y, 4.42, 3.1, 0.12, 0.08, MAT.ECORCE, fois(bois, 0.7));
      }
    }
    if (k > 0.75) {
      // Guérite, toit en pente, fenêtre.
      R.b(-3.1, 0.05, -3.1, 1.4, 2.3, 1.4, MAT.LAQUE, melanger(c, BLANC, 0.35));
      R.p(BOITE, -3.1, 2.42, -3.1, 1.75, 0.1, 1.75, MAT.LAQUE, fois(c, 0.55), 0.12);
      R.b(-3.1, 1.3, -2.39, 1.0, 0.55, 0.02, MAT.LAQUE, [0.07, 0.09, 0.12]);
      // Abri bâché.
      R.p(BOITE, 1.8, 1.7, -2.6 + 0.62, 3.2, 0.04, 1.6, MAT.TISSU, fois(c, 0.85), 0.68);
      R.p(BOITE, 1.8, 1.7, -2.6 - 0.62, 3.2, 0.04, 1.6, MAT.TISSU, fois(c, 0.7), -0.68);
      for (const a of [-1.5, 1.5]) R.p(CYL, 1.8 + a, 1.1, -2.6, 0.07, 2.2, 0.07, MAT.METAL, [0.5, 0.5, 0.5]);
    }
    for (let j = 0; j < 3; j++) palette(R, -1.2 + j * 1.3, 0.05, 1.6, (rd() - 0.5) * 0.4, BOIS[j & 3]);
    if (k >= 1 && !chantier) banniere(R, 3.6, 3.6, 5.0, c, 1);
  }

  /** Poste mobile (Préfecture) : fourgon sans insigne, bande et rampe lumineuse aux couleurs du camp, barrières. */
  function posteMobile(R, rd, k, c, chantier) {
    const blanc = [0.88, 0.88, 0.86], sombre = [0.07, 0.07, 0.08], vitre = [0.09, 0.12, 0.16];
    R.b(0, 0, 0, 9.4, 0.03, 7.4, MAT.ASPHALTE, [0.3, 0.3, 0.31]);
    for (const v of [-3.5, 3.5]) R.b(0, 0.03, v, 9.4, 0.01, 0.12, MAT.MAT, [0.85, 0.85, 0.82]);
    const lampes = [];
    if (k >= 0.25) {
      for (const [a, b] of [[-1.75, -1.0], [-1.75, 1.0], [1.65, -1.0], [1.65, 1.0]]) R.p(CYL, a, 0.36, b - 1.0, 0.72, 0.26, 0.72, MAT.MAT, sombre, PI / 2);
      R.b(-0.7, 0.42, -1.0, 3.6, 2.0, 2.0, MAT.LAQUE, blanc);
      R.b(-0.7, 1.05, -1.0, 3.62, 0.28, 2.02, MAT.LAQUE, c);
      R.b(1.85, 0.42, -1.0, 1.5, 1.55, 1.96, MAT.LAQUE, fois(c, 0.55));
      R.p(BOITE, 2.58, 1.62, -1.0, 1.7, 0.6, 0.05, MAT.LAQUE, vitre, -0.38, PI / 2);
      for (const sv of [-1, 1]) R.b(1.85, 1.2, -1.0 + sv * 0.985, 0.9, 0.5, 0.02, MAT.LAQUE, vitre);
      R.b(1.85, 1.97, -1.0, 0.32, 0.08, 1.5, MAT.METAL, [0.3, 0.3, 0.32]);
      for (const sv of [-1, 1]) for (const [du, th] of [[-0.2, -0.7], [0.2, 0.7]]) {
        R.p(BOITE, -0.7 + du, 1.72, -1.0 + sv * 1.012, 0.02, 0.13, 0.52, MAT.LAQUE, blanc, th, PI / 2);
      }
      for (const sv of [-1, 1]) lampes.push([R.wx(1.85, -1.0 + sv * 0.38), R.y + 2.11, R.wz(1.85, -1.0 + sv * 0.38)]);
    }
    for (let j = 0; j < 3; j++) {
      if (k < 1 && rd() >= k) continue;
      barriereMetal(R, -2.6 + j * 2.4, 0.03, 2.6, 0, 0, [0.72, 0.74, 0.76]);
    }
    if (k > 0.6) {
      R.b(-3.2, 0.03, -2.9, 1.2, 0.74, 0.7, MAT.METAL, [0.55, 0.56, 0.58]);
      R.b(-3.2, 0.77, -2.9, 1.3, 0.04, 0.8, MAT.LAQUE, blanc);
    }
    if (k >= 1 && !chantier) banniere(R, 3.9, 3.0, 4.6, c, 2, 0.8, 1.8);
    return lampes;
  }

  /** Une structure ; rend { lampes, feux : [x, y, z, L, lacet] ou null, cx, cz, y, rayon }. */
  function construireStructure(s, sol, puits, options = {}) {
    sol = typeof sol === 'function' ? sol : () => 0;
    if (!s || s.sorte === 'qg') return { lampes: [], feu: null, cx: s ? s.x : 0, cz: s ? s.z : 0, y: 0, rayon: 0 };
    if (s.sorte === 'barricade') {
      const b = barricade(puits, s, sol);
      return { lampes: [], feu: s.feu ? [b.cx, b.y, b.cz, b.L, b.lacet] : null, cx: b.cx, cz: b.cz, y: b.y, rayon: b.L / 2 + 1, L: b.L, lacet: b.lacet };
    }
    const x = fini(s.x) ? s.x : 0, z = fini(s.z) ? s.z : 0, y = sol(x, z);
    const lacet = (((s.id | 0) % 4) + 4) % 4 * (PI / 2) + (options.lacet || 0);
    const R = repere(puits, x, y, z, lacet), rd = alea(0x51ED27 ^ Math.imul((s.id | 0) + 7, 0x85EBCA6B));
    const k = s.chantier ? Math.max(0.04, progression(s)) : 1, f = s.faction, c = couleurCamp(f);
    let lampes = [];
    if (f === 0) relais(R, rd, k, c, !!s.chantier);
    else if (f === 1) cantonnement(R, rd, k, c, !!s.chantier);
    else lampes = posteMobile(R, rd, k, c, !!s.chantier);
    if (s.chantier) {
      // Piquets et ruban de chantier aux coins.
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) R.p(CYL, a * 4.9, 0.6, b * 4.9, 0.06, 1.2, 0.06, MAT.LAQUE, c);
      for (const [a, b, su, sv] of [[0, -4.9, 9.8, 0.03], [0, 4.9, 9.8, 0.03], [-4.9, 0, 0.03, 9.8], [4.9, 0, 0.03, 9.8]]) R.b(a, 0.95, b, su, 0.08, sv, MAT.TISSU, BLANC, 0, 0, 0.2);
    }
    return { lampes: s.chantier ? [] : lampes, feu: null, cx: x, cz: z, y, rayon: 6.5 };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Cassables : intacts tels que ville.js les décrit, ou cassés.
  // ---------------------------------------------------------------------------------------------------------------

  function matrice(r) {
    const ca = Math.cos(r[0]), sa = Math.sin(r[0]), cb = Math.cos(r[1]), sb = Math.sin(r[1]), cc = Math.cos(r[2]), sc = Math.sin(r[2]);
    // Rz · Ry · Rx du moteur, rangée par lignes.
    return [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa,
      sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa,
      -sb, cb * sa, cb * ca];
  }
  function euler(M) {
    const sb = borner(-M[6], -1, 1), b = Math.asin(sb), cb = Math.cos(b);
    if (Math.abs(cb) > 1e-5) return [Math.atan2(M[7], M[8]), b, Math.atan2(M[3], M[0])];
    return [Math.atan2(-M[5], M[4]), b, 0];
  }
  function produit(A, B) {
    const C = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    return C;
  }
  /** Rotation d'angle a autour de l'axe unitaire (x, y, z). */
  function rodrigues(x, y, z, a) {
    const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  }
  const estVerre = m => m.mat === MAT.LAQUE && m.color && m.color[2] > m.color[0] + 0.05 && Math.min(m.s[0], m.s[1], m.s[2]) < 0.12;

  function formeIndex(shape) { const i = NOMS.indexOf(shape || 'box'); return i < 0 ? BOITE : i; }
  function mettreMaillage(puits, m, couleur) {
    const p = m.p || [0, 0, 0], s = m.s || [1, 1, 1], r = m.r || [0, 0, 0], c = couleur || m.color;
    puits.mettre(formeIndex(m.shape), p[0], p[1], p[2], s[0], s[1], s[2], r[0], r[1], r[2], m.mat || 0, c ? c[0] : -1, c ? c[1] : 0, c ? c[2] : 0, m.emissive || 0);
  }

  /** Un cassable, intact (casse faux) ou cassé : renversé, vitres en éclats au sol, tôles cabossées. */
  function construireCassable(cas, casse, puits) {
    const pieces = (cas && cas.pieces) || [];
    if (!casse) { for (const m of pieces) mettreMaillage(puits, m); return; }
    const lacet = fini(cas.lacet) ? cas.lacet : 0, ca = Math.cos(lacet), sa = Math.sin(lacet);
    const x = fini(cas.x) ? cas.x : 0, z = fini(cas.z) ? cas.z : 0;
    let base = Infinity;
    for (const m of pieces) base = Math.min(base, (m.p ? m.p[1] : 0) - (m.s ? m.s[1] : 1) / 2);
    if (!fini(base)) base = 0;
    const rd = alea(0xCA55E ^ Math.imul((cas.id | 0) + 3, 0x27D4EB2F));
    // Axe u de l'objet dans le monde, et réglages par sorte : angle, appui en travers (v0), teinte.
    const reglage = { voiture: [1.45, 0.92, 0.72], poubelle: [1.48, 0.3, 0.95], banc: [-1.5, -0.25, 0.9], barriere: [1.5, 0.32, 0.92],
      abribus: [0, 0, 0.92], vitrine: [0, 0, 0.9] }[cas.sorte] || [0.6, 0.3, 0.85];
    const [angle, v0, teinte] = reglage;
    const Q = rodrigues(ca, 0, -sa, angle), pivot = [x + v0 * sa, base, z + v0 * ca];
    const eclats = [];
    for (let i = 0; i < pieces.length; i++) {
      const m = pieces[i];
      if (estVerre(m)) { eclats.push(m); continue; }
      const p = m.p || [0, 0, 0], s = m.s || [1, 1, 1], r = m.r || [0, 0, 0];
      let np = p, nr = r;
      if (angle) {
        const d = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
        np = [pivot[0] + Q[0] * d[0] + Q[1] * d[1] + Q[2] * d[2], pivot[1] + Q[3] * d[0] + Q[4] * d[1] + Q[5] * d[2], pivot[2] + Q[6] * d[0] + Q[7] * d[1] + Q[8] * d[2]];
        nr = euler(produit(Q, matrice(r)));
      } else if (cas.sorte === 'abribus' && i === 0) {
        np = [p[0], p[1] - 0.35, p[2]]; nr = [r[0] + 0.22, r[1], r[2]];
      } else if (cas.sorte === 'vitrine' && m.mat === MAT.TISSU) {
        np = [p[0], p[1] - 0.25, p[2]]; nr = [r[0] * 2.6, r[1], r[2]];
      }
      const c = m.color ? fois(m.color, teinte) : null;
      puits.mettre(formeIndex(m.shape), np[0], np[1], np[2], s[0], s[1], s[2], nr[0], nr[1], nr[2], m.mat || 0,
        c ? c[0] : -1, c ? c[1] : 0, c ? c[2] : 0, m.emissive || 0);
    }
    // Éclats : ceux des vitres, et ceux d'une voiture (pare-brise).
    const sources = eclats.length ? eclats : cas.sorte === 'voiture' ? [{ p: [x, base + 1, z], s: [1.6, 0.5, 1.6], color: [0.3, 0.38, 0.42] }] : [];
    for (const m of sources) {
      const n = Math.min(14, 5 + Math.round(Math.max(m.s[0], m.s[2]) * 2));
      const c = melanger(m.color || [0.3, 0.38, 0.42], [0.75, 0.82, 0.86], 0.35);
      for (let j = 0; j < n; j++) {
        const a = rd() * PI * 2, d = 0.3 + rd() * 1.6, t = 0.12 + rd() * 0.22;
        puits.mettre(BOITE, m.p[0] + Math.cos(a) * d + (rd() - 0.5) * m.s[0] * 0.6, base + 0.012, m.p[2] + Math.sin(a) * d + (rd() - 0.5) * m.s[2] * 0.6,
          t, 0.014, t * (0.5 + rd() * 0.6), (rd() - 0.5) * 0.12, rd() * PI * 2, 0, MAT.LAQUE, c[0], c[1], c[2], 0.05);
      }
    }
    // Ce qui roule d'une poubelle renversée.
    if (cas.sorte === 'poubelle') for (let j = 0; j < 4; j++) {
      const a = rd() * PI * 2, d = 0.6 + rd() * 0.9, t = 0.18 + rd() * 0.2;
      puits.mettre(j & 1 ? SPHERE : BOITE, x + Math.cos(a) * d, base + t * 0.35, z + Math.sin(a) * d, t, t * 0.7, t * 1.2, 0, rd() * PI, 0,
        MAT.MAT, 0.32 + rd() * 0.2, 0.3 + rd() * 0.15, 0.26, 0);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Tas des gisements, marques des lieux et des QG.
  // ---------------------------------------------------------------------------------------------------------------

  const PRIMEURS = [[0.78, 0.16, 0.1], [0.92, 0.55, 0.12], [0.36, 0.6, 0.18], [0.9, 0.8, 0.22], [0.45, 0.2, 0.42], [0.62, 0.44, 0.24]];

  /** Tas d'un gisement : cagettes du marché ou matériaux du chantier ; part : 0..1 du stock de départ. */
  function construireTas(g, part, sol, puits) {
    sol = typeof sol === 'function' ? sol : () => 0;
    part = borner(fini(part) ? part : 1, 0, 1);
    const x = fini(g.x) ? g.x : 0, z = fini(g.z) ? g.z : 0, y = sol(x, z), rayon = fini(g.rayon) ? g.rayon : 9;
    const rd = alea(0x7A5 ^ Math.imul((g.id | 0) + 11, 0x165667B1));
    const R = repere(puits, x, y, z, ((g.id | 0) & 1) * PI / 2);
    const place = (n, i) => { const a = i * 2.39996 + 0.6, d = rayon * 0.62 * Math.sqrt((i + 0.5) / n); return [Math.cos(a) * d, Math.sin(a) * d]; };
    if (g.sorte === 'materiaux') {
      const N = 18, n = Math.round(part * N);
      for (let i = 0; i < n; i++) {
        const [u, v] = place(N, i), t = rd(), dl = (rd() - 0.5) * 0.8;
        if (t < 0.3) {
          for (let j = 0; j < 4; j++) R.p(BOITE, u, 0.06 + j * 0.13, v, 2.8, 0.12, 0.9, MAT.ECORCE, BOIS[(j + i) & 3], 0, dl + (rd() - 0.5) * 0.06);
        } else if (t < 0.55) {
          palette(R, u, 0, v, dl, BOIS[i & 3]);
          R.b(u, 0.15, v, 1.0, 0.7, 0.75, MAT.PAVE, [0.62, 0.32, 0.24], 0, dl);
        } else if (t < 0.75) {
          for (let j = 0; j < 3; j++) { const [a, b] = sous(u, v, dl, (j - 1) * 0.32, 0); R.p(CYL, a, 0.16, b, 0.3, 2.8, 0.3, MAT.METAL, [0.45, 0.47, 0.5], PI / 2, dl); }
          R.p(CYL, u, 0.42, v, 0.3, 2.8, 0.3, MAT.METAL, [0.5, 0.52, 0.55], PI / 2, dl);
        } else if (t < 0.9) {
          for (let j = 0; j < 5; j++) { const [a, b] = sous(u, v, dl, (j % 3 - 1) * 0.62, j > 2 ? 0.2 : -0.2); R.p(SPHERE, a, 0.14 + (j > 2 ? 0.2 : 0), b, 0.62, 0.28, 0.42, MAT.TISSU, [0.74, 0.68, 0.55], 0, dl); }
        } else {
          for (let j = 0; j < 6; j++) R.b(u + (j % 3 - 1) * 0.42, ((j / 3) | 0) * 0.2, v, 0.4, 0.2, 0.2, MAT.BETON, [0.6, 0.6, 0.58], 0, dl);
        }
      }
    } else {
      const N = 32, n = Math.round(part * N);
      for (let i = 0; i < n; i++) {
        const [u, v] = place(N, i), etages = 1 + ((rd() * 3) | 0), dl = (rd() - 0.5) * 0.5;
        for (let j = 0; j < etages; j++) {
          R.b(u, j * 0.3, v, 0.62, 0.28, 0.42, MAT.ECORCE, BOIS[(i + j) & 3], 0, dl);
          R.b(u, j * 0.3 + 0.22, v, 0.54, 0.1, 0.34, MAT.TISSU, PRIMEURS[((rd() * PRIMEURS.length) | 0)], 0, dl);
        }
      }
      // Étals : deux tréteaux et une bâche, toujours là.
      for (const [u, v] of [[-rayon * 0.5, rayon * 0.62], [rayon * 0.5, -rayon * 0.62]]) {
        R.b(u, 0, v, 2.4, 0.85, 0.9, MAT.ECORCE, BOIS[1]);
        R.p(BOITE, u, 2.3, v, 2.8, 0.04, 1.6, MAT.TISSU, PRIMEURS[(g.id | 0) % PRIMEURS.length], 0.12);
        for (const a of [-1.3, 1.3]) R.p(CYL, u + a, 1.15, v - 0.7, 0.05, 2.3, 0.05, MAT.METAL, [0.5, 0.5, 0.52]);
      }
    }
  }

  /** Marque d'un lieu : quatre mâts à bannière (couleur et motif du camp qui tient), anneau de prise au sol. marque :
   *  { proprietaire, progression (-1..1), conteste, preneur } ; preneur : camp qui prend (-1 : inconnu). */
  function construireLieu(l, marque, sol, puits) {
    sol = typeof sol === 'function' ? sol : () => 0;
    const x = fini(l.x) ? l.x : 0, z = fini(l.z) ? l.z : 0, y = sol(x, z), rayon = borner(fini(l.rayon) ? l.rayon : 12, 4, 60);
    const pr = marque && marque.proprietaire >= 0 && marque.proprietaire < 3 ? marque.proprietaire : -1;
    const c = couleurCamp(pr);
    for (let k = 0; k < 4; k++) {
      const a = PI / 4 + k * PI / 2, mx = x + Math.cos(a) * (rayon + 1.6), mz = z + Math.sin(a) * (rayon + 1.6);
      banniere(repere(puits, mx, sol(mx, mz), mz, Math.atan2(Math.cos(a), Math.sin(a))), 0, 0, 6.6, c, pr, 1.25, 2.6);
    }
    const SEG = 36, prog = marque && fini(marque.progression) ? borner(Math.abs(marque.progression), 0, 1) : 0;
    const preneur = marque && marque.preneur >= 0 && marque.preneur < 3 ? marque.preneur : -1;
    const allumes = Math.round(prog * SEG), cPrise = marque && marque.conteste ? [0.9, 0.9, 0.88] : preneur >= 0 ? COULEURS[preneur] : BLANC;
    const longueur = (2 * PI * rayon / SEG) * 0.82;
    for (let k = 0; k < SEG; k++) {
      const t = 2 * PI * (k + 0.5) / SEG, sx = x + rayon * Math.cos(t), sz = z + rayon * Math.sin(t);
      const lit = k < allumes, teinte = lit ? cPrise : pr >= 0 ? fois(c, 0.75) : [0.42, 0.42, 0.4];
      puits.mettre(BOITE, sx, sol(sx, sz) + 0.03, sz, longueur, 0.05, 0.5, 0, Math.atan2(-Math.cos(t), -Math.sin(t)), 0, MAT.MAT,
        teinte[0], teinte[1], teinte[2], lit ? 1.1 : pr >= 0 ? 0.25 : 0);
    }
  }

  /** Occupation d'un QG : anneau du parvis qui se remplit (couleur de l'occupant s'il est connu). */
  function construireOccupation(qg, part, occupant, sol, puits) {
    if (!(part > 0.004)) return;
    const x = qg.x, z = qg.z, rayon = borner(fini(qg.rayon) ? qg.rayon : 16, 6, 60), SEG = 40;
    const c = occupant >= 0 && occupant < 3 ? COULEURS[occupant] : [0.95, 0.95, 0.92], allumes = Math.round(borner(part, 0, 1) * SEG);
    const longueur = (2 * PI * rayon / SEG) * 0.8;
    for (let k = 0; k < SEG; k++) {
      const t = 2 * PI * (k + 0.5) / SEG, sx = x + rayon * Math.cos(t), sz = z + rayon * Math.sin(t), lit = k < allumes;
      const teinte = lit ? c : [0.3, 0.3, 0.3];
      puits.mettre(BOITE, sx, sol(sx, sz) + 0.04, sz, longueur, 0.06, 0.7, 0, Math.atan2(-Math.cos(t), -Math.sin(t)), 0, MAT.MAT,
        teinte[0], teinte[1], teinte[2], lit ? 1.3 : 0);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Le décor.
  // ---------------------------------------------------------------------------------------------------------------

  const E = Object.freeze({ POUSSIERE: 1, ECLATS: 2, ANNONCE: 3, SALVE: 4, JET: 5, ORDRE: 6, PRISE: 7, LEVEE: 8, FINI: 9, SOIN: 10,
    PRODUCTION: 11 });
  const PLAFONDS = Object.freeze({ 1: 64, 2: 24, 3: 24, 4: 16, 5: 24, 6: 8, 7: 12, 8: 16, 9: 16, 10: 24, 11: 12 });
  const ORDRES = Object.freeze({ deplacer: [0.45, 1, 0.55], attaquer: [1, 0.36, 0.3], capacite: [1, 0.86, 0.4], ralliement: [1, 0.9, 0.4],
    refus: [0.95, 0.95, 0.95] });

  function creerDecor(ville, options = {}) {
    ville = ville || {};
    const sites = ville.sites || {};
    const solVille = typeof ville.sol === 'function' ? ville.sol : null;
    const sol = (x, z) => { const h = solVille ? solVille(x, z) : 0; return fini(h) ? h : 0; };
    let joueur = options.joueur === undefined ? -1 : options.joueur | 0;
    let allie = options.allie === undefined || options.allie === null ? -1 : options.allie | 0;
    let brouillard = !!options.brouillard, alliance = null;
    const carte = options.carte || null;

    const lotCassables = creerLot('cassables'), lotTas = creerLot('tas'), lotStructures = creerLot('structures'),
      lotAutres = creerLot('structures hors alliance'), lotMarques = creerLot('marques');
    const lots = [lotCassables, lotTas, lotStructures, lotAutres, lotMarques];
    const dynamique = [], lumieres = [];
    const sortie = { lots, dynamique, lumieres };
    const mesure = { instances: 0, effets: 0, particules: 0, solides: 0, lumieres: 0, reconstructions: 0, msEtat: 0, msCadre: 0 };
    let horloge = 0;

    // ---- Cassables : lignes empaquetées d'avance, intactes et cassées, recopiées à chaque changement. ----
    const cassables = Array.isArray(sites.cassables) ? sites.cassables : [];
    const nC = cassables.length, etatC = new Uint8Array(nC);
    const stock = [creerLot('intacts'), creerLot('casses')];
    const index = [new Int32Array(nC * NOMS.length * 2), new Int32Array(nC * NOMS.length * 2)];
    for (let v = 0; v < 2; v++) {
      const lot = stock[v].debut();
      const compter = { mettre(forme, ...reste) { lot.mettre(forme, ...reste); compteur[forme]++; } };
      const compteur = new Int32Array(NOMS.length), avant = new Int32Array(NOMS.length);
      for (let i = 0; i < nC; i++) {
        avant.set(compteur);
        construireCassable(cassables[i], v === 1, compter);
        for (let f = 0; f < NOMS.length; f++) { index[v][(i * NOMS.length + f) * 2] = avant[f]; index[v][(i * NOMS.length + f) * 2 + 1] = compteur[f] - avant[f]; }
      }
      stock[v].fin();
    }
    // Lignes de chaque forme dans le stock : la forme f commence à la ligne debutForme[v][f].
    const debutForme = stock.map(l => { const d = new Int32Array(NOMS.length).fill(0); for (const g of l.groups) d[NOMS.indexOf(g.name)] = g.offset / 64; return d; });
    function refaireCassables() {
      lotCassables.debut();
      for (let f = 0; f < NOMS.length; f++) for (let i = 0; i < nC; i++) {
        const v = etatC[i] ? 1 : 0, o = (i * NOMS.length + f) * 2, n = index[v][o + 1];
        if (n) lotCassables.copier(f, stock[v].values, debutForme[v][f] + index[v][o], n);
      }
      lotCassables.fin(); mesure.reconstructions++;
    }
    if (nC) refaireCassables();

    // ---- Tas des gisements. ----
    const gisements = Array.isArray(sites.gisements) ? sites.gisements : [];
    const stockDepart = new Float64Array(gisements.length), parts = new Float32Array(gisements.length).fill(1), crans = new Int16Array(gisements.length).fill(-1);
    // Stock de départ : celui de la ville à l'échelle des effectifs (le monde le multiplie), sinon le premier reçu.
    if (fini(options.effectifs) && options.effectifs > 0) for (let i = 0; i < gisements.length; i++) {
      if (fini(gisements[i].stock)) stockDepart[i] = gisements[i].stock * options.effectifs / 20000;
    }
    function refaireTas() {
      lotTas.debut();
      for (let i = 0; i < gisements.length; i++) construireTas(gisements[i], parts[i], sol, lotTas);
      lotTas.fin(); mesure.reconstructions++;
    }
    if (gisements.length) { for (let i = 0; i < gisements.length; i++) crans[i] = 24; refaireTas(); }

    // ---- Structures. ----
    let structures = [], parId = new Map(), visibles = 0, infos = [], voileChange = false;
    const ami = f => joueur < 0 || f === joueur || f === allie;
    let voileCpu = null, voileGeo = null;
    function vu(x, z) {
      if (!brouillard || !voileCpu || joueur < 0) return true;
      const g = voileGeo, cx = Math.floor((x - g.x0) / g.cellule), cz = Math.floor((z - g.z0) / g.cellule);
      if (cx < 0 || cz < 0 || cx >= g.nx || cz >= g.nz) return false;
      return voileCpu[cx + cz * g.nx] >= SEUIL_VU;
    }
    const structureVue = s => ami(s.faction) || vu(s.x, s.z) || (s.sorte === 'barricade' && (vu(s.x2, s.z2) || vu((s.x + s.x2) / 2, (s.z + s.z2) / 2)));
    function signatureVisibles() {
      let h = 0x811C9DC5, n = 0;
      for (const s of structures) if (!ami(s.faction) && s.sorte !== 'qg' && structureVue(s)) { h = Math.imul(h ^ ((s.id | 0) + 1), 0x01000193); n++; }
      return (h ^ n) >>> 0;
    }
    // Ce que le décor dessine d'une structure : sorte, camp, tracé, chantier, feu, cran d'avancement.
    let signatureStructures = -1;
    function signerStructures(liste) {
      let h = 0x811C9DC5;
      const m = v => { h = Math.imul(h ^ (fini(v) ? Math.round(v) | 0 : -7), 0x01000193); };
      for (const s of liste) {
        m(s.id); m(s.sorte === 'qg' ? 1 : s.sorte === 'avant-poste' ? 2 : 3); m(s.faction); m(s.x * 100); m(s.z * 100); m(s.x2 * 100); m(s.z2 * 100);
        m(s.chantier ? 1 : 0); m(s.feu ? 1 : 0); m(s.sorte === 'barricade' || s.chantier ? progression(s) * 48 : 48);
      }
      return (h ^ liste.length) >>> 0;
    }
    function refaireStructures(autresSeulement) {
      if (!autresSeulement) {
        lotStructures.debut(); infos = [];
        for (const s of structures) {
          if (!ami(s.faction)) continue;
          const r = construireStructure(s, sol, lotStructures);
          if (s.sorte !== 'qg') infos.push({ s, r, ami: true });
        }
        lotStructures.fin();
      } else infos = infos.filter(i => i.ami);
      lotAutres.debut();
      for (const s of structures) {
        if (ami(s.faction) || s.sorte === 'qg' || !structureVue(s)) continue;
        infos.push({ s, r: construireStructure(s, sol, lotAutres), ami: false });
      }
      lotAutres.fin();
      visibles = signatureVisibles();
      mesure.reconstructions++;
    }

    // ---- Marques : lieux et QG. ----
    const lieux = Array.isArray(sites.lieux) ? sites.lieux : [], qgs = Array.isArray(sites.qg) ? sites.qg : [];
    const marques = lieux.map(() => ({ proprietaire: -1, progression: 0, conteste: false, preneur: -1 }));
    const occupation = [0, 0, 0], occupant = [-1, -1, -1];
    let signatureMarques = null, mini = null, miniGeo = null;
    function geometrieGrille(g, taille) {
      // CARTE.minicarte / combats : « cote » est soit la case, soit le côté entier ; on reconnaît l'un de l'autre.
      if (g && fini(g.cote) && fini(g.x0) && fini(g.z0)) return { x0: g.x0, z0: g.z0, cellule: g.cote * taille > 20000 ? g.cote / taille : g.cote };
      const e = ville.etendue;
      return e ? { x0: e.x0, z0: e.z0, cellule: Math.max(e.x1 - e.x0, e.z1 - e.z0) / taille } : null;
    }
    function preneurPres(l, proprietaire) {
      if (!mini || !miniGeo) return -1;
      const t = miniGeo.taille, g = miniGeo.g, r = (l.rayon || 12) + g.cellule;
      const c0 = Math.max(0, Math.floor((l.x - r - g.x0) / g.cellule)), c1 = Math.min(t - 1, Math.floor((l.x + r - g.x0) / g.cellule));
      const r0 = Math.max(0, Math.floor((l.z - r - g.z0) / g.cellule)), r1 = Math.min(t - 1, Math.floor((l.z + r - g.z0) / g.cellule));
      const n = [0, 0, 0];
      for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) for (let f = 0; f < 3; f++) n[f] += mini[(j * t + i) * 3 + f];
      let best = -1, max = 0;
      for (let f = 0; f < 3; f++) if (f !== proprietaire && n[f] > max) { max = n[f]; best = f; }
      return best;
    }
    function refaireMarques() {
      lotMarques.debut();
      for (let i = 0; i < lieux.length; i++) construireLieu(lieux[i], marques[i], sol, lotMarques);
      for (let f = 0; f < qgs.length && f < 3; f++) construireOccupation(qgs[f], occupation[f], occupant[f], sol, lotMarques);
      lotMarques.fin(); mesure.reconstructions++;
    }
    refaireMarques();

    // ---- Effets : tableau fixe, sans allocation ; maillages pris dans deux réserves. ----
    const MAX_EFFETS = 320, effets = [];
    for (let i = 0; i < MAX_EFFETS; i++) effets.push({ actif: false, sorte: 0, t0: 0, duree: 1, x: 0, y: 0, z: 0, a: 0, b: 0, f: -1, g: 0 });
    const actifs = new Int32Array(16);
    function lancer(sorte, x, z, f, a, b, duree, y) {
      if (!fini(x) || !fini(z) || actifs[sorte] >= PLAFONDS[sorte]) return null;
      let libre = null, ancien = null;
      for (const e of effets) {
        if (!e.actif) { libre = e; break; }
        if (!ancien || e.t0 < ancien.t0) ancien = e;
      }
      const e = libre || ancien;
      if (e.actif) actifs[e.sorte]--;
      e.actif = true; e.sorte = sorte; e.t0 = horloge; e.duree = duree; e.x = x; e.z = z; e.y = fini(y) ? y : sol(x, z);
      e.a = fini(a) ? a : 0; e.b = fini(b) ? b : 0; e.f = fini(f) ? f | 0 : -1; e.g = Math.random();
      actifs[sorte]++;
      return e;
    }
    function reserve(fx) {
      const objets = [];
      let n = 0;
      return {
        prendre() {
          let m = objets[n];
          if (!m) {
            m = { shape: 'sphere', p: [0, 0, 0], s: [1, 1, 1], r: [0, 0, 0], mat: MAT.MAT, color: [1, 1, 1], emissive: 0, alpha: 1, fx,
              fxFire: false, fxPriority: '', innerRatio: NaN, outdoor: true, surface: 'object' };
            objets.push(m);
          }
          n++;
          return m;
        },
        vider() { n = 0; },
        get n() { return n; },
      };
    }
    const reserveP = reserve(true), reserveS = reserve(false), reserveL = [];
    for (let i = 0; i < 8; i++) reserveL.push({ p: [0, 0, 0], color: [1, 1, 1], power: 1, range: 10 });
    /** Particule translucide (fumée, poussière, eau, anneau au sol, feu). */
    function particule(shape, x, y, z, sx, sy, sz, c, alpha, em, quoi = '', interieur = NaN, rx = 0, ry = 0) {
      const m = reserveP.prendre();
      m.shape = shape; m.p[0] = x; m.p[1] = y; m.p[2] = z; m.s[0] = sx; m.s[1] = sy; m.s[2] = sz; m.r[0] = rx; m.r[1] = ry; m.r[2] = 0;
      m.color[0] = c[0]; m.color[1] = c[1]; m.color[2] = c[2]; m.alpha = alpha; m.emissive = em;
      m.fxFire = quoi === 'feu'; m.fxPriority = quoi === 'danger' ? 'hazard' : ''; m.innerRatio = interieur;
      dynamique.push(m);
      return m;
    }
    function solide(shape, x, y, z, sx, sy, sz, rx, ry, rz, mat, c, em) {
      const m = reserveS.prendre();
      m.shape = shape; m.p[0] = x; m.p[1] = y; m.p[2] = z; m.s[0] = sx; m.s[1] = sy; m.s[2] = sz; m.r[0] = rx; m.r[1] = ry; m.r[2] = rz;
      m.mat = mat; m.color[0] = c[0]; m.color[1] = c[1]; m.color[2] = c[2]; m.emissive = em;
      dynamique.push(m);
      return m;
    }
    function lampe(x, y, z, c, power, range) {
      if (lumieres.length >= reserveL.length) return;
      const l = reserveL[lumieres.length];
      l.p[0] = x; l.p[1] = y; l.p[2] = z; l.color[0] = c[0]; l.color[1] = c[1]; l.color[2] = c[2]; l.power = power; l.range = range;
      lumieres.push(l);
    }

    // ---- Vue : un test au cône de la caméra, large. ----
    let oeil = null, avant = null, droite = null, haut = null, tanV = 0.4, tanH = 0.8;
    function dansVue(x, y, z, r) {
      if (!oeil) return true;
      const dx = x - oeil[0], dy = y - oeil[1], dz = z - oeil[2];
      const p = dx * avant[0] + dy * avant[1] + dz * avant[2];
      if (p < -r) return false;
      return Math.abs(dx * droite[0] + dy * droite[1] + dz * droite[2]) <= p * tanH + r
        && Math.abs(dx * haut[0] + dy * haut[1] + dz * haut[2]) <= p * tanV + r;
    }
    const distanceOeil = (x, y, z) => (oeil ? Math.hypot(x - oeil[0], y - oeil[1], z - oeil[2]) : 0);

    // ---- État reçu. ----
    function etat(e) {
      if (!e) return;
      const t0 = performance.now();
      if (e.alliance !== undefined) {
        alliance = Array.isArray(e.alliance) ? e.alliance.slice(0, 2) : null;
        const avant2 = allie;
        allie = alliance && joueur >= 0 && alliance.includes(joueur) ? alliance[0] === joueur ? alliance[1] : alliance[0] : -1;
        if (allie !== avant2 && structures.length) refaireStructures(false);
      }
      if (Array.isArray(e.structures)) {
        structures = e.structures.filter(s => s && fini(s.x) && fini(s.z));
        parId = new Map(structures.map(s => [s.id, s]));
        for (const s of structures) if (s.sorte === 'qg' && s.faction >= 0 && s.faction < 3) occupation[s.faction] = fini(s.occupation) ? s.occupation : 0;
        // La liste repart du travailleur quand une file de production avance : rien à refaire si rien de dessiné ne change.
        const sig = signerStructures(structures);
        if (sig !== signatureStructures) { signatureStructures = sig; refaireStructures(false); }
        else for (const info of infos) info.s = parId.get(info.s.id) || info.s;
      }
      if (e.cassables && e.cassables.length && nC) {
        let change = false;
        const n = Math.min(nC, e.cassables.length);
        for (let i = 0; i < n; i++) { const v = e.cassables[i] ? 1 : 0; if (v !== etatC[i]) { etatC[i] = v; change = true; } }
        if (change) refaireCassables();
      }
      if (e.gisements && e.gisements.length && gisements.length) {
        let change = false;
        for (let i = 0; i < gisements.length && i < e.gisements.length; i++) {
          const s = e.gisements[i];
          if (!fini(s)) continue;
          if (stockDepart[i] <= 0 || s > stockDepart[i]) stockDepart[i] = Math.max(1, s);
          parts[i] = borner(s / stockDepart[i], 0, 1);
          const cran = Math.ceil(parts[i] * 24);
          if (cran !== crans[i]) { crans[i] = cran; change = true; }
        }
        if (change) refaireTas();
      }
      if (e.minicarte && e.minicarte.length) {
        const g = carte && carte.minicarte, taille = g && g.taille ? g.taille | 0 : Math.round(Math.sqrt(e.minicarte.length / 3));
        if (!mini || mini.length !== e.minicarte.length) mini = new Uint16Array(e.minicarte.length);
        mini.set(e.minicarte);
        miniGeo = { taille, g: geometrieGrille(g, taille) };
        if (!miniGeo.g) mini = null;
      }
      if (Array.isArray(e.lieux)) {
        for (let i = 0; i < marques.length && i < e.lieux.length; i++) {
          const l = e.lieux[i] || {}, m = marques[i];
          m.proprietaire = fini(l.proprietaire) ? l.proprietaire : -1;
          m.progression = fini(l.progression) ? l.progression : 0;
          m.conteste = !!l.conteste;
          m.preneur = fini(l.preneur) ? l.preneur : Math.abs(m.progression) > 0.004 ? preneurPres(lieux[i], m.proprietaire) : -1;
        }
      }
      if (Array.isArray(e.eco)) for (let f = 0; f < 3; f++) if (e.eco[f] && fini(e.eco[f].qgOccupe) && !parId.has(f)) occupation[f] = e.eco[f].qgOccupe;
      if (e.evenements && e.evenements.length) evenements(e.evenements);
      // Les marques ne repartent au GPU que si ce qu'elles montrent change.
      let sig = '';
      for (const m of marques) sig += m.proprietaire + ':' + Math.round(Math.abs(m.progression) * 36) + ':' + (m.conteste ? 1 : 0) + ':' + m.preneur + ';';
      for (let f = 0; f < 3; f++) sig += Math.round(occupation[f] * 40) + ':' + occupant[f] + ';';
      if (sig !== signatureMarques) { signatureMarques = sig; refaireMarques(); }
      mesure.msEtat = performance.now() - t0;
    }

    function evenements(ev) {
      const n = (ev.length / EV_TAILLE) | 0;
      for (let k = 0; k < n; k++) {
        const o = k * EV_TAILLE, t = ev[o], x = ev[o + 1], z = ev[o + 2], f = ev[o + 3], a = ev[o + 4], b = ev[o + 5];
        // Loin de la caméra, les petits effets ne servent à rien.
        const loin = oeil && fini(x) && fini(z) && distanceOeil(x, 0, z) > 650;
        switch (t) {
          case EV.HORS_JEU: if (!loin) lancer(E.POUSSIERE, x, z, f, a, b, 1.3); break;
          case EV.CASSE: if (!loin) { lancer(E.ECLATS, x, z, f, a, b, 1.2); lancer(E.POUSSIERE, x, z, f, 0, 0, 1.4); } break;
          case EV.SALVE_ANNONCE: lancer(E.ANNONCE, x, z, f, a, b, Math.max(0.3, fini(b) ? b : 1.5)); break;
          case EV.SALVE: lancer(E.SALVE, x, z, f, a, b, 1.3); break;
          case EV.JET: lancer(E.JET, x, z, f, a, b, 0.65); break;
          case EV.LIEU_PRIS: case EV.LIEU_NEUTRALISE: {
            const l = lieux[a | 0];
            lancer(E.PRISE, l ? l.x : x, l ? l.z : z, t === EV.LIEU_PRIS ? f : -1, l ? l.rayon : 12, 0, 1.6);
            break;
          }
          case EV.BARRICADE_LEVEE: case EV.STRUCTURE_DETRUITE: lancer(E.LEVEE, x, z, f, a, b, 1.6); break;
          case EV.BARRICADE_FINIE: case EV.STRUCTURE_FINIE: lancer(E.FINI, x, z, f, a, b, 1.0); break;
          case EV.SOIN: if (!loin) lancer(E.SOIN, x, z, f, a, b, 1.2); break;
          case EV.PRODUCTION: if (!loin) lancer(E.PRODUCTION, x, z, f, a, b, 0.9); break;
          case EV.QG_OCCUPE: if (f >= 0 && f < 3) occupant[f | 0] = fini(a) ? a | 0 : -1; lancer(E.PRISE, x, z, a, (qgs[f | 0] && qgs[f | 0].rayon) || 16, 0, 1.8); break;
          case EV.QG_REPRIS: if (f >= 0 && f < 3) occupant[f | 0] = -1; lancer(E.PRISE, x, z, f, (qgs[f | 0] && qgs[f | 0].rayon) || 16, 0, 1.8); break;
          default: break;
        }
      }
    }

    // ---- Image. ----
    // Teintes des effets, partagées d'une image à l'autre (rien n'est alloué par image).
    const T_POUSSIERE = [0.6, 0.56, 0.49];
    const T_VERRE = [0.55, 0.66, 0.74];
    const T_BOIS_ECLAT = [0.55, 0.42, 0.28];
    const T_METAL_ECLAT = [0.5, 0.52, 0.55];
    const T_ONDE = [0.88, 0.92, 1];
    const T_NUAGE = [0.84, 0.86, 0.88];
    const T_LUEUR = [0.85, 0.9, 1];
    const T_EAU = [0.8, 0.88, 0.97];
    const T_ECUME = [0.86, 0.9, 0.96];
    const T_GRAVATS = [0.58, 0.54, 0.48];
    const T_SOIN = [1, 0.86, 0.5];
    const T_FLAMME = [1, 0.5, 0.16];
    const T_BRAISE = [1, 0.45, 0.12];
    const T_FUMEE = [0.17, 0.17, 0.18];
    const T_LAMPE_FEU = [1, 0.52, 0.2];
    const T_MAT_FANION = [0.7, 0.7, 0.72];
    const FEUX_MAX = 16, FEUX_VUS = new Int32Array(FEUX_MAX), DISTANCES_FEUX = new Float64Array(FEUX_MAX);
    function dessinerEffet(e, age) {
      const k = borner(age / e.duree, 0, 1), y = e.y, c = couleurCamp(e.f);
      switch (e.sorte) {
        case E.POUSSIERE: {
          for (let j = 0; j < 3; j++) {
            const a = e.g * 6.28 + j * 2.1, d = 0.35 + k * 0.9;
            particule('sphere', e.x + Math.cos(a) * d, y + 0.35 + k * 0.8 + j * 0.12, e.z + Math.sin(a) * d,
              0.9 + 1.7 * k, 0.7 + 1.2 * k, 0.9 + 1.7 * k, T_POUSSIERE, 0.34 * Math.pow(1 - k, 1.4), 0);
          }
          break;
        }
        case E.ECLATS: {
          const verre = e.b === 1 || e.b === 2 || e.b === 0;
          const teinte = verre ? T_VERRE : e.b === 4 ? T_BOIS_ECLAT : T_METAL_ECLAT;
          for (let j = 0; j < 9; j++) {
            const a = e.g * 6.28 + j * 0.698, v = 2.4 + ((j * 7 + 3) % 5) * 0.55, vy = 2.2 + ((j * 3) % 4) * 0.6, t = Math.min(age, 1.1);
            let h = 0.6 + vy * t - 4.9 * t * t;
            if (h < 0.02) h = 0.02;
            const d = v * Math.min(t, 0.9);
            solide('box', e.x + Math.cos(a) * d, y + h, e.z + Math.sin(a) * d, 0.22, 0.03, 0.14, t * 9 + j, a, t * 5, MAT.LAQUE, teinte, verre ? 0.15 : 0);
          }
          break;
        }
        case E.ANNONCE: {
          const r = Math.max(1, e.a), pouls = 0.5 + 0.5 * Math.sin(age * 12);
          particule('ring', e.x, y + 0.06, e.z, 2 * r, 0.12, 2 * r, c, 0.5 + 0.35 * pouls, 0.9, 'danger', 0.9);
          particule('cylinder', e.x, y + 0.04, e.z, 2 * r * k, 0.02, 2 * r * k, c, 0.2, 0.4, 'danger');
          break;
        }
        case E.SALVE: {
          const r = Math.max(1, e.a);
          particule('ring', e.x, y + 0.08, e.z, 2 * r * (0.55 + 0.75 * k), 0.15, 2 * r * (0.55 + 0.75 * k), T_ONDE, 0.85 * (1 - k), 1.2, 'danger', 0.78);
          for (let j = 0; j < 6; j++) {
            const a = e.g * 6.28 + j * 1.047, d = r * (0.25 + 0.4 * ((j * 5) % 3) / 2) * (0.6 + 0.5 * k);
            particule('sphere', e.x + Math.cos(a) * d, y + 0.6 + k * 1.4, e.z + Math.sin(a) * d, 1.6 + 3 * k, 1.2 + 2 * k, 1.6 + 3 * k,
              T_NUAGE, 0.42 * (1 - k), 0.1);
          }
          if (k < 0.5) lampe(e.x, y + 2.5, e.z, T_LUEUR, 3 * (1 - 2 * k) * (1 - 2 * k), r * 2.6);
          break;
        }
        case E.JET: {
          const dx = Math.sin(e.a), dz = Math.cos(e.a), portee = borner(e.b || 18, 4, 40), fondu = Math.min(1, (e.duree - age) / 0.2, age / 0.08);
          const y0 = y + 3.9, n = 12;
          for (let j = 0; j < n; j++) {
            const t = (j + ((age * 4) % 1)) / n, d = 1.2 + portee * t;
            const h = y0 + 3.2 * t * (1 - t) - (y0 - y) * t * t;
            particule('sphere', e.x + dx * d, Math.max(y + 0.2, h), e.z + dz * d, 0.45 + 1.5 * t, 0.4 + 1.1 * t, 0.45 + 1.5 * t,
              T_EAU, 0.55 * (1 - 0.45 * t) * fondu, 0.25, '', NaN, 0, e.a);
          }
          for (let j = 0; j < 3; j++) {
            const a = e.g * 6.28 + j * 2.1, d = 1.2 + portee + Math.cos(a) * 1.2;
            particule('sphere', e.x + dx * d + Math.sin(a) * 1.4, y + 0.5, e.z + dz * d + Math.cos(a) * 1.4, 2.2, 1.0, 2.2, T_ECUME, 0.4 * fondu, 0.2);
          }
          break;
        }
        case E.ORDRE: {
          const teinte = ORDRES[['', 'deplacer', 'attaquer', 'capacite', 'ralliement', 'refus'][e.f | 0] || 'deplacer'] || ORDRES.deplacer;
          const r = 2.2 - 1.4 * k;
          particule('ring', e.x, y + 0.07, e.z, 2 * r, 0.1, 2 * r, teinte, 0.9 * (1 - k), 1.2, 'danger', 0.82);
          particule('cylinder', e.x, y + 0.05, e.z, 0.5, 0.02, 0.5, teinte, 0.8 * (1 - k), 1.2, 'danger');
          break;
        }
        case E.PRISE: {
          const r = Math.max(3, e.a) * (1 + 0.18 * k);
          particule('ring', e.x, y + 0.1, e.z, 2 * r, 0.2, 2 * r, c, 0.75 * (1 - k), 1.5, 'danger', 0.9);
          if (k < 0.6) lampe(e.x, y + 4, e.z, c, 2 * (1 - k / 0.6), r * 1.6);
          break;
        }
        case E.LEVEE: {
          for (let j = 0; j < 6; j++) {
            const a = e.g * 6.28 + j * 1.047, d = 0.8 + k * 2.6;
            particule('sphere', e.x + Math.cos(a) * d, y + 0.6 + k * 1.6, e.z + Math.sin(a) * d, 1.6 + 2.8 * k, 1.2 + 1.6 * k, 1.6 + 2.8 * k,
              T_GRAVATS, 0.4 * (1 - k), 0);
          }
          const t = Math.min(age, 1);
          for (let j = 0; j < 6; j++) {
            const a = e.g * 6.28 + j * 1.2, d = (2 + j % 3) * Math.min(t, 0.8), h = Math.max(0.05, 0.8 + 3 * t - 4.9 * t * t);
            solide('box', e.x + Math.cos(a) * d, y + h, e.z + Math.sin(a) * d, 0.7, 0.06, 0.18, t * 6, a, t * 3, MAT.ECORCE, BOIS[j & 3], 0);
          }
          break;
        }
        case E.FINI: case E.PRODUCTION: {
          const r = e.sorte === E.FINI ? 5 + 3 * k : 3 + 2.5 * k;
          particule('ring', e.x, y + 0.08, e.z, 2 * r, 0.12, 2 * r, c, 0.7 * (1 - k), 1.3, 'danger', 0.88);
          break;
        }
        case E.SOIN: {
          for (let j = 0; j < 3; j++) {
            const a = e.g * 6.28 + j * 2.1 + age * 2;
            particule('sphere', e.x + Math.cos(a) * 0.8, y + 1.8 + k * 1.6 + j * 0.2, e.z + Math.sin(a) * 0.8, 0.28, 0.28, 0.28,
              T_SOIN, 0.7 * (1 - k), 1.6);
          }
          break;
        }
        default: break;
      }
    }

    function cadre(vue, temps) {
      const t0 = performance.now();
      horloge = fini(temps) ? temps : horloge;
      dynamique.length = 0; lumieres.length = 0; reserveP.vider(); reserveS.vider();
      if (vue && vue.pos && vue.axes) {
        oeil = vue.pos; avant = vue.axes.forward; droite = vue.axes.right; haut = vue.axes.up;
        tanV = Math.tan(((vue.fov || 42) * PI) / 360) * 1.08; tanH = tanV * (vue.aspect || 1.8);
      }
      // Le voile a pu changer depuis la dernière image : les structures ennemies qui entrent en vue ou en sortent.
      if (voileChange && brouillard && joueur >= 0 && structures.length) {
        const sig = signatureVisibles();
        if (sig !== visibles) refaireStructures(true);
      }
      voileChange = false;
      let n = 0;
      for (const e of effets) {
        if (!e.actif) continue;
        const age = horloge - e.t0;
        if (age >= e.duree || age < -1) { e.actif = false; actifs[e.sorte]--; continue; }
        n++;
        if (e.sorte !== E.ORDRE && !vu(e.x, e.z)) continue;
        if (!dansVue(e.x, e.y + 2, e.z, e.sorte === E.JET ? 40 : Math.max(8, e.a + 4))) continue;
        dessinerEffet(e, Math.max(0, age));
      }
      // Feux des barricades en vue, du plus proche au plus loin de la caméra : 16 au plus, les 3 plus proches éclairent.
      let feux = 0;
      for (let i = 0; i < infos.length; i++) {
        const f = infos[i].r.feu;
        if (!f || !dansVue(f[0], f[1] + 3, f[2], f[3] / 2 + 6) || (!infos[i].ami && !vu(f[0], f[2]))) continue;
        const d = distanceOeil(f[0], f[1], f[2]);
        if (feux === FEUX_MAX && d >= DISTANCES_FEUX[FEUX_MAX - 1]) continue;
        let j = feux < FEUX_MAX ? feux++ : FEUX_MAX - 1;
        while (j > 0 && DISTANCES_FEUX[j - 1] > d) { DISTANCES_FEUX[j] = DISTANCES_FEUX[j - 1]; FEUX_VUS[j] = FEUX_VUS[j - 1]; j--; }
        DISTANCES_FEUX[j] = d; FEUX_VUS[j] = i;
      }
      for (let k = 0; k < feux; k++) {
        const info = infos[FEUX_VUS[k]], cx = info.r.feu[0], cy = info.r.feu[1], cz = info.r.feu[2], L = info.r.feu[3], lacet = info.r.feu[4];
        const ca = Math.cos(lacet), sa = Math.sin(lacet), nf = borner(Math.round(L / 2.2), 2, 7), graine = (info.s.id | 0) * 1.37;
        for (let j = 0; j < nf; j++) {
          const u = -L / 2 + (j + 0.5) * L / nf + Math.sin(horloge * 1.7 + j * 2.3 + graine) * 0.25;
          const x = cx + u * ca, z = cz - u * sa, h = 1.7 + 0.55 * Math.sin(horloge * 7.3 + j * 1.9 + graine);
          particule('octa', x, cy + 0.9 + h / 2, z, 1.05, h, 1.05, T_FLAMME, 0.85, 1, 'feu', NaN, 0, horloge * 0.7 + j);
          particule('sphere', x, cy + 0.75, z, 1.25, 0.8, 1.25, T_BRAISE, 0.75, 1, 'feu');
        }
        for (let j = 0; j < 3; j++) {
          const ph = (horloge * 0.22 + j / 3 + graine * 0.13) % 1, d = ph * 8;
          particule('sphere', cx + 0.62 * d, cy + 2.6 + ph * 12, cz + 0.31 * d, 1.5 + ph * 5, 1.3 + ph * 4, 1.5 + ph * 5,
            T_FUMEE, 0.4 * (1 - ph) * Math.min(1, ph * 6), 0);
        }
        if (k < 3) lampe(cx, cy + 2.4, cz, T_LAMPE_FEU, 2.2 + 0.5 * Math.sin(horloge * 11 + graine), 16);
      }
      // Rampes lumineuses des postes mobiles, en alternance.
      const phase = Math.floor(horloge * 4.8) & 1;
      for (const info of infos) {
        const lampes = info.r.lampes;
        if (!lampes || !lampes.length || (!info.ami && !vu(info.r.cx, info.r.cz))) continue;
        if (!dansVue(info.r.cx, info.r.y + 2, info.r.cz, 8)) continue;
        const c = melanger(couleurCamp(info.s.faction), BLANC, 0.35);
        for (let j = 0; j < lampes.length; j++) {
          const p = lampes[j];
          solide('box', p[0], p[1], p[2], 0.28, 0.13, 0.28, 0, 0, 0, MAT.LAQUE, c, (j & 1) === phase ? 3 : 0.15);
        }
      }
      // Sélection des structures et fanions de ralliement.
      for (let i = 0; i < nSel; i++) {
        const s = parId.get(sel[i]);
        if (!s) continue;
        let x = s.x, z = s.z, r = 6.5;
        if (s.sorte === 'barricade') { x = (s.x + s.x2) / 2; z = (s.z + s.z2) / 2; r = Math.hypot(s.x2 - s.x, s.z2 - s.z) / 2 + 1.5; }
        else if (s.sorte === 'qg') r = (qgs[s.faction] && qgs[s.faction].rayon) || 16;
        const y = sol(x, z), c = melanger(couleurCamp(s.faction), BLANC, 0.5);
        particule('ring', x, y + 0.1, z, 2 * r, 0.14, 2 * r, c, 0.65 + 0.15 * Math.sin(horloge * 5), 1.1, 'danger', 0.9);
        const rl = s.ralliement;
        if (rl && fini(rl[0]) && fini(rl[1]) && (joueur < 0 || s.faction === joueur)) {
          const ry = sol(rl[0], rl[1]), cc = couleurCamp(s.faction);
          solide('cylinder', rl[0], ry + 1.3, rl[1], 0.07, 2.6, 0.07, 0, 0, 0, MAT.METAL, T_MAT_FANION, 0);
          solide('box', rl[0] + 0.42, ry + 2.3, rl[1], 0.8, 0.5, 0.03, 0.12 * Math.sin(horloge * 3), 0, 0.08 * Math.sin(horloge * 2.3), MAT.TISSU, cc, 0.45);
          particule('ring', rl[0], ry + 0.08, rl[1], 1.6, 0.1, 1.6, cc, 0.7, 1, 'danger', 0.8);
        }
      }
      mesure.effets = n; mesure.particules = reserveP.n; mesure.solides = reserveS.n; mesure.lumieres = lumieres.length;
      mesure.instances = lots.reduce((a, l) => a + l.instances, 0);
      mesure.msCadre = performance.now() - t0;
      return sortie;
    }

    // ---- Réglages, voile, sélection, ordres. ----
    const sel = new Int32Array(64);
    let nSel = 0;
    function selectionner(ids, n) {
      nSel = 0;
      if (!ids) return;
      n = n === undefined ? ids.length : Math.min(n, ids.length);
      for (let i = 0; i < n && nSel < sel.length; i++) if (fini(ids[i])) sel[nSel++] = ids[i] | 0;
    }
    function ordre(x, z, sorte = 'deplacer') {
      const code = ['', 'deplacer', 'attaquer', 'capacite', 'ralliement', 'refus'].indexOf(sorte);
      lancer(E.ORDRE, x, z, code > 0 ? code : 1, 0, 0, 0.7);
    }
    function regler(o = {}) {
      let refaire = false;
      if (o.joueur !== undefined && (o.joueur | 0) !== joueur) { joueur = o.joueur | 0; refaire = true; }
      if (o.allie !== undefined) { const a = o.allie === null ? -1 : o.allie | 0; if (a !== allie) { allie = a; refaire = true; } }
      if (o.brouillard !== undefined && !!o.brouillard !== brouillard) { brouillard = !!o.brouillard; refaire = true; }
      if (refaire && structures.length) refaireStructures(false);
    }
    function voile(u8, geo) {
      if (!u8 || !geo) { voileCpu = null; voileGeo = null; return; }
      if (!voileCpu || voileCpu.length !== u8.length) voileCpu = new Uint8Array(u8.length);
      voileCpu.set(u8);
      voileGeo = { nx: geo.nx | 0, nz: geo.nz | 0, x0: +geo.x0, z0: +geo.z0, cellule: +geo.cellule || 8 };
      voileChange = true;
    }

    return {
      etat, regler, voile, selectionner, ordre, cadre, lots, dynamique, lumieres, mesure,
      structure: id => parId.get(id) || null,
      get structures() { return structures; },
      liberer() { structures = []; infos = []; parId = new Map(); signatureStructures = -1; for (const l of lots) { l.debut(); l.fin(); } },
    };
  }

  PDR.decor = Object.freeze({ creerDecor, construireStructure, construireCassable, construireTas, construireLieu, construireOccupation,
    creerLot, creerCollecteur, alea, NOMS, MAT, E, COULEURS });
})(globalThis.PDR = globalThis.PDR || {});
