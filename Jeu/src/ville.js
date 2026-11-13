// Ville procédurale de Point de rupture, tirée d'une graine : un quadrillage d'îlots, de rues et de boulevards, une
// place centrale, des parcs et des squares, les trois quartiers généraux, des marchés et des chantiers. Aucun fichier :
// tout sort du code ci-dessous. La ville grandit avec les effectifs : 9, 13 ou 15 îlots par côté (PDR.regles.ilots).
// Le décor est décrit dans le format de scène du moteur FERRO : { shape, p, s, r, mat, color, outdoor, surface },
// primitives centrées sur p, rotation r = [x, y, z] appliquée dans l'ordre du moteur (Rz · Ry · Rx).
// Unités : le mètre ; x vers l'est, z vers le sud, y vers le haut. La simulation compte en millimètres.
// La ville est la même, à l'octet près, dans la page et dans le travailleur de simulation (ni window ni document) ;
// les lieux de jeu (ville.sites) et la circulation (praticable, accrocher) ne font aucun calcul trigonométrique.
//
// creerVille(graine, { ilots }) rend, en plus du décor (objets) et de la circulation, ville.sites (CONCEPTION.md §3.1) :
//   qg        [ { faction, nom, x, z, rayon, sortie: [x, z], emprise: [x0, z0, x1, z1] } × 3 ]   rayon : le parvis
//   lieux     [ { id, nom, sorte, x, z, rayon } ]                                              7, 9 ou 11
//   gisements [ { id, sorte: 'moyens' | 'materiaux', nom, x, z, rayon, stock } ]               stock pour 20 000 unités
//   cassables [ { id, sorte, x, z, lacet, pv, rendement, pieces } ]                            pièces hors d'« objets »
(function (PDR) {
  'use strict';

  /** Hasard rapide et reproductible (mulberry32) pour le décor ; la simulation garde son propre tirage. */
  function hasard(graine) {
    let a = graine >>> 0;
    const r = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.entre = (a, b) => a + (b - a) * r();
    r.entier = (a, b) => a + Math.floor(r() * (b - a + 1));
    r.choix = liste => liste[Math.floor(r() * liste.length)];
    return r;
  }

  // Matières du moteur FERRO (0 à 12) et matières urbaines ajoutées pour Point de rupture (13 à 18).
  // Les matières 0 à 3 assombrissent leur teinte (× 0,65) : leurs couleurs sont données plus claires.
  const MAT = { METAL: 0, BETON: 3, MAT: 7, HERBE: 8, ROCHE: 9, ECORCE: 10, FEUILLAGE: 11, EAU: 12,
    FACADE: 13, ASPHALTE: 14, PAVE: 15, LAQUE: 17, TISSU: 18 };
  const FORMES = { boite: 'box', biseau: 'bevel', cylindre: 'cylinder', sphere: 'sphere', cone: 'octa', plan: 'box', anneau: 'ring' };
  // Cellules des quartiers pour 9 îlots (l'essai 0.1) ; chaque ville rend les siennes dans ville.FACTIONS.
  const FACTIONS = [
    { nom: 'La Convergence', court: 'Convergence', couleur: [0.90, 0.27, 0.19], cellule: [1, 4] },
    { nom: 'Le Bastion', court: 'Bastion', couleur: [0.93, 0.64, 0.15], cellule: [7, 4] },
    { nom: 'La Préfecture', court: 'Préfecture', couleur: [0.22, 0.45, 0.90], cellule: [4, 3] },
  ];

  const RUE = { w: 15, ch: 9, tp: 0 };           // couloir de façade à façade, chaussée, terre-plein
  const BOULEVARD = { w: 28, ch: 19, tp: 4 };
  const TROTTOIR_H = 0.12, MARGE = 2.2;

  const PALETTE = [[0.80, 0.74, 0.63], [0.86, 0.81, 0.71], [0.66, 0.40, 0.31], [0.62, 0.62, 0.60], [0.88, 0.86, 0.81],
    [0.76, 0.60, 0.43], [0.55, 0.59, 0.63], [0.72, 0.66, 0.58], [0.58, 0.35, 0.29], [0.82, 0.77, 0.66]];
  const VOITURES = [[0.75, 0.75, 0.76], [0.12, 0.13, 0.15], [0.55, 0.08, 0.08], [0.16, 0.25, 0.45], [0.85, 0.85, 0.83],
    [0.35, 0.37, 0.38], [0.62, 0.55, 0.40], [0.20, 0.35, 0.25]];
  const VERTS = [[0.27, 0.45, 0.20], [0.33, 0.50, 0.22], [0.24, 0.40, 0.22], [0.40, 0.52, 0.24], [0.30, 0.42, 0.18]];
  const AUVENTS = [[0.80, 0.22, 0.18], [0.18, 0.42, 0.66], [0.92, 0.70, 0.20], [0.24, 0.55, 0.30], [0.86, 0.86, 0.82], [0.55, 0.30, 0.55]];

  /** Points de structure et Matériaux rendus à la Convergence par sorte de cassable, pour 20 000 unités. */
  const CASSABLES = Object.freeze({
    voiture: Object.freeze({ pv: 300, rendement: 20 }), abribus: Object.freeze({ pv: 200, rendement: 12 }),
    vitrine: Object.freeze({ pv: 80, rendement: 6 }), poubelle: Object.freeze({ pv: 40, rendement: 3 }),
    banc: Object.freeze({ pv: 60, rendement: 4 }), barriere: Object.freeze({ pv: 50, rendement: 5 }),
  });
  /** Stock d'un gisement pour 20 000 unités ; le monde le multiplie par son échelle. Quarante récolteurs vident un
   *  marché en une dizaine de minutes environ. */
  const STOCK = Object.freeze({ moyens: 20000, materiaux: 12000 });
  const RAYON_GISEMENT = 9;

  const NOMS = {
    colonne: ['Place de la Colonne'],
    fontaine: ['Place de la Fontaine', 'Place du Jet d’Eau', 'Place des Bassins', 'Place de la Source'],
    kiosque: ['Square du Kiosque', 'Square de la Musique', 'Square des Orchestres'],
    jardin: ['Jardin des Tilleuls', 'Jardin des Plantes', 'Jardin des Marronniers', 'Square des Platanes'],
    esplanade: ['Esplanade des Arts', 'Parvis de la Médiathèque', 'Parvis de la Halle', 'Esplanade du Lavoir', 'Parvis du Conservatoire'],
    arche: ['Place de l’Arche', 'Place du Cadran', 'Place de l’Horloge'],
    marche: ['Marché des Halles', 'Marché aux Fleurs', 'Marché du Canal', 'Marché aux Puces', 'Marché Couvert',
      'Marché du Soir', 'Marché des Quais', 'Marché de la Gare', 'Marché du Faubourg'],
    chantier: ['Chantier de la Médiathèque', 'Chantier du Gymnase', 'Chantier de l’École', 'Chantier des Docks',
      'Chantier de la Tour', 'Chantier du Tramway', 'Chantier de la Piscine', 'Chantier du Parking', 'Chantier du Musée'],
  };
  const NOMS_QG = ['La Rotonde', 'Le Fort', 'L’Hôtel de Préfecture'];
  const VARIANTES = ['fontaine', 'kiosque', 'jardin', 'esplanade', 'arche'];

  const borner = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const nuance = (r, c, e) => c.map(v => borner(v + r.entre(-e, e), 0, 1));
  const fois = (c, k) => c.map(v => borner(v * k, 0, 1));

  /**
   * Disposition des îlots pour N îlots par côté (N impair) : cellules des trois QG, des lieux, des marchés et des
   * chantiers. Pour 9 îlots, les quartiers sont ceux de l'essai 0.1 ; pour 13 et 15, ils s'écartent avec la ville.
   */
  function disposer(N) {
    const c = (N - 1) / 2, d = Math.round(N / 3), a = Math.round(N / 4.5), b = c - 1;
    const qg = [[c - d, c], [c + d, c], [c, c - 1]];
    const lieux = [[c, c], [c, c - b], [c, c + b], [c - a, c - a], [c + a, c - a], [c - a, c + a], [c + a, c + a]];
    if (N >= 13) lieux.push([c - d - 1, c], [c + d + 1, c]);
    if (N >= 15) lieux.push([c - a, c + b], [c + a, c + b]);
    // Deux gisements de chaque sorte près de chaque QG (une cellule en porte deux), d'autres au milieu.
    const marches = [[c - d, c - 1], [c + d, c - 1], [c - 1, c - 2], [c - 1, c + 2]];
    const chantiers = [[c - d, c + 1], [c + d, c + 1], [c + 1, c - 2], [c + 1, c + 2]];
    if (N >= 13) { marches.push([c + 2, c - 3]); chantiers.push([c - 2, c - 3]); }
    if (N >= 15) { marches.push([c - a - 1, c + a + 1]); chantiers.push([c + a + 1, c + a + 1]); }
    return { c, d, qg, lieux, marches, chantiers };
  }

  function creerVille(graine = 1, options = {}) {
    const N = options.ilots === undefined ? 9 : options.ilots;
    if (!Number.isInteger(N) || N < 7 || N > 21 || N % 2 === 0) throw new Error('ilots : un entier impair de 7 à 21');
    const r = hasard(graine * 2654435761);
    const rc = hasard(graine * 104729 + 7);     // cassables : tirage à part, le reste de la ville ne bouge pas
    const rl = hasard(graine * 6151 + 3);       // variantes et noms des lieux, des marchés et des chantiers
    const objets = [];
    /**
     * Une pièce du décor, posée par sa base : primitive, (x, y, z) au pied, tailles, couleur sRGB, matière, lacet.
     * Un « plan » est une dalle de 3 cm dont le dessus est à y ; un « cone » est la moitié haute d'un octaèdre.
     * piece() la rend sans la ranger ; poser() la range dans le décor.
     */
    const piece = (g, x, y, z, sx, sy, sz, c, m = MAT.MAT, lacet = 0, objet = false) => {
      let py = y + sy / 2, hy = sy;
      if (g === 'plan') { hy = 0.03; py = y - 0.015; } else if (g === 'cone') { hy = sy * 2; py = y; }
      const mesh = { shape: FORMES[g], p: [x, py, z], s: [sx, hy, sz], r: [0, lacet, 0], mat: m, outdoor: true };
      if (c) mesh.color = c;
      if (objet) mesh.surface = 'object';
      return mesh;
    };
    const poser = (...args) => { const mesh = piece(...args); objets.push(mesh); return mesh; };
    const facade = () => MAT.FACADE - 0.45 + r() * 0.9;

    // Lignes de rues : positions des axes, du nord-ouest au sud-est, centrées sur l'origine.
    const BOULEVARDS = [Math.round(N * 2 / 9), N - Math.round(N * 2 / 9)];
    const lignes = () => {
      const L = [];
      let curseur = 0;
      for (let k = 0; k <= N; k++) {
        const t = BOULEVARDS.includes(k) ? BOULEVARD : RUE;
        L.push({ c: curseur + t.w / 2, w: t.w, ch: t.ch, tp: t.tp, boulevard: t === BOULEVARD });
        curseur += t.w;
        if (k < N) curseur += Math.round(r.entre(48, 60));
      }
      for (const l of L) l.c -= curseur / 2;
      return L;
    };
    const LX = lignes(), LZ = lignes();
    const debut = (L, k) => L[k].c + L[k].w / 2;
    const fin = (L, k) => L[k + 1].c - L[k + 1].w / 2;
    const etendue = { x0: LX[0].c - LX[0].w / 2, x1: LX[N].c + LX[N].w / 2, z0: LZ[0].c - LZ[0].w / 2, z1: LZ[N].c + LZ[N].w / 2 };
    const centreCellule = (i, j) => [(debut(LX, i) + fin(LX, i)) / 2, (debut(LZ, j) + fin(LZ, j)) / 2];

    // Types des îlots : place, quartiers généraux, lieux à prendre, marchés et chantiers, puis parcs au hasard.
    const plan = disposer(N), C = plan.c;
    const types = Array.from({ length: N }, () => new Array(N).fill('bati'));
    const libreProche = (i, j) => {
      for (let rayon = 0; rayon < N; rayon++) {
        for (let di = -rayon; di <= rayon; di++) for (let dj = -rayon; dj <= rayon; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== rayon) continue;
          const a = i + di, b = j + dj;
          if (a >= 1 && b >= 1 && a < N - 1 && b < N - 1 && types[a][b] === 'bati') return [a, b];
        }
      }
      throw new Error('ville : plus d’îlot libre');
    };
    const reserver = ([i, j], t) => { const [a, b] = types[i][j] === 'bati' ? [i, j] : libreProche(i, j); types[a][b] = t; return [a, b]; };
    types[C][C] = 'place';
    const cellulesQG = plan.qg.map((q, f) => reserver(q, 'qg' + f));
    const cellulesLieux = [[C, C], ...plan.lieux.slice(1).map(q => reserver(q, 'square'))];
    const cellulesMarches = plan.marches.map(q => reserver(q, 'marche'));
    const cellulesChantiers = plan.chantiers.map(q => reserver(q, 'chantier'));
    const nbParcs = Math.round(N * N / 27);
    for (let n = 0; n < nbParcs;) {
      const i = r.entier(0, N - 1), j = r.entier(0, N - 1);
      if (types[i][j] !== 'bati' || Math.abs(i - C) + Math.abs(j - C) <= 1) continue;
      types[i][j] = 'parc';
      n++;
    }
    const ouvert = t => t !== 'bati';
    const factions = FACTIONS.map((f, k) => ({ nom: f.nom, court: f.court, couleur: f.couleur, cellule: cellulesQG[k].slice() }));

    // Obstacles des îlots ouverts (emprise des QG, socles, bassins, kiosques) : ils ne sont pas praticables.
    const obstacles = Array.from({ length: N }, () => Array.from({ length: N }, () => []));
    const disque = (i, j, x, z, rayon) => obstacles[i][j].push({ disque: true, x, z, r: rayon });
    const rectangle = (i, j, x0, z0, x1, z1) => obstacles[i][j].push({ disque: false, x0, z0, x1, z1 });
    const dansObstacle = (o, x, z) => (o.disque ? (x - o.x) * (x - o.x) + (z - o.z) * (z - o.z) < o.r * o.r
      : x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1);

    // Sol : la campagne autour, l'asphalte de la ville, puis le trottoir de béton de chaque îlot.
    poser('plan', 0, -0.03, 0, 6000, 1, 6000, [0.42, 0.45, 0.30], MAT.HERBE);
    poser('plan', (etendue.x0 + etendue.x1) / 2, 0, (etendue.z0 + etendue.z1) / 2, etendue.x1 - etendue.x0, 1, etendue.z1 - etendue.z0,
      [0.21, 0.21, 0.22], MAT.ASPHALTE);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x0 = LX[i].c + LX[i].ch / 2, x1 = LX[i + 1].c - LX[i + 1].ch / 2;
        const z0 = LZ[j].c + LZ[j].ch / 2, z1 = LZ[j + 1].c - LZ[j + 1].ch / 2;
        poser('boite', (x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, TROTTOIR_H, z1 - z0, [0.96, 0.94, 0.89], MAT.BETON);
      }
    }

    // Arbre à la manière de FERRO (polishTrees) : tronc coudé en deux segments d'écorce, branches, houppiers « foliage ».
    const segment = (a, b, diametre, couleur) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      objets.push({ shape: 'cylinder', p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], s: [diametre, Math.hypot(dx, dy, dz), diametre],
        r: [Math.atan2(dz, Math.hypot(dx, dy)), 0, Math.atan2(-dx, dy)], mat: MAT.ECORCE, color: couleur, outdoor: true });
    };
    const houppier = (x, y, z, t, vert) => objets.push({ shape: 'foliage', p: [x, y, z], s: [t * 1.25, t, t * 1.2],
      r: [0, r() * Math.PI * 2, 0], mat: MAT.FEUILLAGE, color: nuance(r, vert, 0.035), outdoor: true });
    const arbre = (x, z, y0 = 0, taille = 1) => {
      const h = r.entre(4.2, 6) * taille, tronc = r.entre(0.28, 0.4) * taille, bois = nuance(r, [0.34, 0.27, 0.19], 0.03);
      const a = r() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const coude = [x + ca * 0.25 * taille, y0 + h * 0.5, z + sa * 0.25 * taille], sommet = [x + ca * 0.1 * taille, y0 + h, z + sa * 0.1 * taille];
      segment([x, y0, z], coude, tronc, bois);
      segment(coude, sommet, tronc * 0.65, bois);
      const vert = r.choix(VERTS);
      for (let k = r.entier(2, 3); k > 0; k--) {
        const q = a + k * 2.399 + r.entre(-0.3, 0.3), portee = r.entre(1.3, 2.1) * taille, y = y0 + h * r.entre(0.62, 0.86);
        const bout = [x + Math.cos(q) * portee, y, z + Math.sin(q) * portee];
        segment([coude[0], y - 0.7 * taille, coude[2]], bout, tronc * 0.32, bois);
        houppier(bout[0], bout[1] + 0.5 * taille, bout[2], r.entre(2.2, 3.1) * taille, vert);
      }
      houppier(sommet[0], sommet[1] + 0.3 * taille, sommet[2], r.entre(2.8, 3.5) * taille, vert);
    };
    const banniere = (x, y, z, couleur, haut = 7, lacet = 0) => poser('boite', x, y - haut, z, 2.2, haut, 0.12, couleur, MAT.TISSU, lacet);

    // ---- Cassables : chaque objet garde ses pièces hors du décor ; decor.js les dessine intacts ou cassés. ----
    const cassables = [];
    const casser = (sorte, x, z, lacet, pieces) => {
      const v = CASSABLES[sorte];
      cassables.push({ id: cassables.length, sorte, x, z, lacet, pv: v.pv, rendement: v.rendement, pieces });
    };
    /** Pièces posées dans le repère d'un objet : (u, v) le long et en travers, lacet de l'objet ; x, z au centre. */
    const repere = (x, z, lacet) => {
      const ca = Math.cos(lacet), sa = Math.sin(lacet);
      return (g, u, v, y, su, sy, sv, c, m, rot = null) => {
        const p = piece(g, x + u * ca + v * sa, y, z - u * sa + v * ca, su, sy, sv, c, m, lacet, true);
        if (rot) { p.r[0] = rot[0]; p.r[2] = rot[2]; }
        return p;
      };
    };
    const banc = (x, z, lacet) => {
      const p = repere(x, z, lacet), bois = nuance(rc, [0.52, 0.36, 0.22], 0.04), fer = [0.25, 0.27, 0.28];
      casser('banc', x, z, lacet, [p('boite', 0, 0, 0.42, 1.8, 0.08, 0.46, bois, MAT.ECORCE), p('boite', 0, -0.22, 0.5, 1.8, 0.42, 0.06, bois, MAT.ECORCE),
        p('boite', -0.75, 0, 0, 0.08, 0.42, 0.42, fer, MAT.METAL), p('boite', 0.75, 0, 0, 0.08, 0.42, 0.42, fer, MAT.METAL)]);
    };
    const poubelle = (x, z) => {
      const c = rc() < 0.5 ? [0.20, 0.36, 0.24] : [0.36, 0.38, 0.40];
      casser('poubelle', x, z, 0, [piece('cylindre', x, TROTTOIR_H, z, 0.55, 0.9, 0.55, c, MAT.LAQUE, 0, true),
        piece('cylindre', x, TROTTOIR_H + 0.9, z, 0.62, 0.06, 0.62, [0.12, 0.12, 0.13], MAT.MAT, 0, true)]);
    };
    const barriere = (x, z, lacet) => {
      const p = repere(x, z, lacet), fer = [0.72, 0.74, 0.76], y = TROTTOIR_H;
      const pieces = [p('boite', 0, 0, y + 1.0, 2.2, 0.06, 0.05, fer, MAT.METAL), p('boite', 0, 0, y + 0.18, 2.2, 0.05, 0.05, fer, MAT.METAL),
        p('boite', -1.05, 0, y, 0.06, 1.06, 0.06, fer, MAT.METAL), p('boite', 1.05, 0, y, 0.06, 1.06, 0.06, fer, MAT.METAL),
        p('boite', -1.05, 0, y, 0.06, 0.04, 0.6, fer, MAT.METAL), p('boite', 1.05, 0, y, 0.06, 0.04, 0.6, fer, MAT.METAL)];
      for (let k = -3; k <= 3; k++) pieces.push(p('boite', k * 0.28, 0, y + 0.2, 0.03, 0.8, 0.03, fer, MAT.METAL));
      casser('barriere', x, z, lacet, pieces);
    };
    const rangeeBarrieres = (x, z, axeX, n) => {
      for (let k = 0; k < n; k++) {
        const u = (k - (n - 1) / 2) * 2.3;
        barriere(axeX ? x + u : x, axeX ? z : z + u, axeX ? 0 : Math.PI / 2);
      }
    };

    /** Liste des immeubles brûlables pour la simulation. */
    const immeubles = [];
    const immeuble = (x0, z0, x1, z1, h, couleur, details = true) => {
      const debut = objets.length;
      const toit = immeubleSeul(x0, z0, x1, z1, h, couleur, details);
      if (details) {
        immeubles.push({
          id: immeubles.length,
          x: (x0 + x1) / 2,
          z: (z0 + z1) / 2,
          rayon: Math.hypot(x1 - x0, z1 - z0) / 2,
          h: toit,
          boites: [{ x: (x0 + x1) / 2, z: (z0 + z1) / 2, lx: x1 - x0, lz: z1 - z0, lacet: 0 }],
          pieces: [debut, objets.length]
        });
      }
      return toit;
    };
    /** Un immeuble sur l'emprise donnée ; rend la hauteur du toit. */
    const immeubleSeul = (x0, z0, x1, z1, h, couleur, details = true) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, lx = x1 - x0, lz = z1 - z0;
      poser('boite', cx, 0, cz, lx, h, lz, couleur, facade());
      poser('boite', cx, h, cz, lx + 0.3, 0.55, lz + 0.3, fois(couleur, 0.82), MAT.MAT, 0, true);
      let toit = h + 0.55;
      if (h > 12 && r() < 0.22) {
        const k = r.entre(0.62, 0.8), dh = 3.2 * r.entier(1, 2);
        poser('boite', cx, toit, cz, lx * k, dh, lz * k, fois(couleur, 0.96), facade());
        poser('boite', cx, toit + dh, cz, lx * k + 0.3, 0.45, lz * k + 0.3, fois(couleur, 0.8), MAT.MAT, 0, true);
        toit += dh + 0.45;
      }
      if (!details) return toit;
      const place = (m) => [cx + r.entre(-1, 1) * Math.max(0, lx / 2 - m), cz + r.entre(-1, 1) * Math.max(0, lz / 2 - m)];
      if (r() < 0.55) {
        for (let k = r.entier(1, 3); k > 0; k--) {
          const [x, z] = place(2);
          poser('boite', x, toit, z, 1.6, 1.0, 1.2, [0.95, 0.95, 0.97], MAT.METAL, r() < 0.5 ? 0 : Math.PI / 2, true);
        }
      }
      if (r() < 0.3) {
        const [x, z] = place(3);
        poser('boite', x, toit, z, 3, 2.6, 3.4, fois(couleur, 1.1), MAT.BETON);
      }
      if (lx > 9 && lz > 9 && r() < 0.13) {
        const [x, z] = place(3);
        poser('boite', x, toit, z, 2.1, 1.0, 2.1, [0.45, 0.43, 0.40], MAT.METAL, 0, true);
        poser('cylindre', x, toit + 1.0, z, 2.6, 2.4, 2.6, [0.52, 0.38, 0.26], MAT.ECORCE);
        poser('cone', x, toit + 3.4, z, 2.9, 0.9, 2.9, [0.42, 0.31, 0.22], MAT.ECORCE);
      }
      if (r() < 0.1) {
        const [x, z] = place(1.5);
        poser('cylindre', x, toit, z, 0.14, r.entre(3, 6.5), 0.14, [0.5, 0.52, 0.54], MAT.METAL, 0, true);
      }
      return toit;
    };

    /** Vitrine d'un rez-de-chaussée sur la façade donnée : côté 0 ouest, 1 est, 2 nord, 3 sud ; a0..a1 le long. */
    const vitrine = (cote, plan, a0, a1) => {
      const long = a1 - a0;
      if (long < 6) return;
      const w = Math.min(5.2, long - 2), u = a0 + 1 + rc() * (long - 2 - w) + w / 2;
      const dehors = cote === 0 || cote === 2 ? -0.06 : 0.06;
      const x = cote < 2 ? plan + dehors : u, z = cote < 2 ? u : plan + dehors, lacet = cote < 2 ? Math.PI / 2 : 0;
      const verre = nuance(rc, [0.20, 0.27, 0.32], 0.03), toile = rc.choix(AUVENTS);
      const sens = dehors > 0 ? 1 : -1, p = repere(x, z, lacet);
      casser('vitrine', x, z, lacet, [p('boite', 0, 0, 0.35, w, 2.5, 0.08, verre, MAT.LAQUE),
        p('boite', 0, 0, 2.85, w + 0.2, 0.16, 0.14, [0.16, 0.16, 0.17], MAT.MAT),
        p('boite', 0, sens * 0.55, 2.95, w + 0.3, 0.06, 1.1, toile, MAT.TISSU, [sens * 0.22, 0, 0])]);
    };

    /** Découpe un îlot en parcelles ; celles qui touchent la rue reçoivent un immeuble, les autres sont des cours. */
    const lotir = (x0, z0, x1, z1, hauteur, palette) => {
      const parcelles = [];
      const couper = (a0, b0, a1, b1, p) => {
        const la = a1 - a0, lb = b1 - b0;
        if ((la < 25 && lb < 25) || p > 7) { parcelles.push([a0, b0, a1, b1]); return; }
        if (la >= lb) { const s = a0 + la * r.entre(0.36, 0.64); couper(a0, b0, s, b1, p + 1); couper(s, b0, a1, b1, p + 1); }
        else { const s = b0 + lb * r.entre(0.36, 0.64); couper(a0, b0, a1, s, p + 1); couper(a0, s, a1, b1, p + 1); }
      };
      couper(x0, z0, x1, z1, 0);
      for (const [a0, b0, a1, b1] of parcelles) {
        const bord = a0 - x0 < 0.01 || x1 - a1 < 0.01 || b0 - z0 < 0.01 || z1 - b1 < 0.01;
        if (!bord) {
          if (r() < 0.45) arbre((a0 + a1) / 2 + r.entre(-2, 2), (b0 + b1) / 2 + r.entre(-2, 2), TROTTOIR_H, 0.8);
          continue;
        }
        const h = borner(Math.round(hauteur * r.entre(0.6, 1.35) / 3.2) * 3.2 + 0.8, 6.4, 40);
        // Les immeubles d'angle et de rive vont jusqu'à la façade ; vers la cour, ils s'arrêtent à 11–16 m de profondeur.
        let e0 = a0, e1 = a1, f0 = b0, f1 = b1;
        const prof = r.entre(11, 16);
        if (a0 - x0 >= 0.01 && x1 - a1 >= 0.01) {
          if (b0 - z0 < 0.01) f1 = Math.min(b1, b0 + prof); else f0 = Math.max(b0, b1 - prof);
        } else if (b0 - z0 >= 0.01 && z1 - b1 >= 0.01) {
          if (a0 - x0 < 0.01) e1 = Math.min(a1, a0 + prof); else e0 = Math.max(a0, a1 - prof);
        }
        immeuble(e0 + 0.15, f0 + 0.15, e1 - 0.15, f1 - 0.15, h, nuance(r, r.choix(palette), 0.035));
        if (rc() < 0.34) {
          if (b0 - z0 < 0.01) vitrine(2, f0 + 0.15, e0 + 0.15, e1 - 0.15);
          else if (z1 - b1 < 0.01) vitrine(3, f1 - 0.15, e0 + 0.15, e1 - 0.15);
          else if (a0 - x0 < 0.01) vitrine(0, e0 + 0.15, f0 + 0.15, f1 - 0.15);
          else vitrine(1, e1 - 0.15, f0 + 0.15, f1 - 0.15);
        }
      }
    };

    // ---- Les trois quartiers généraux : un bâtiment par camp sur un parvis dallé. Aucun insigne réel : un motif. ----
    const qg = [];
    /** La Convergence : la Rotonde, halle ronde sous coupole, anneaux rouges (motif : rond). Elle regarde l'est. */
    const rotonde = (i, j, x0, z0, x1, z1, f) => {
      const [cx, cz] = centreCellule(i, j), R = 0.27 * Math.min(x1 - x0, z1 - z0), h = 10.4, y = TROTTOIR_H;
      const brique = [0.70, 0.45, 0.35], rouge = f.couleur;
      poser('cylindre', cx, y, cz, 2 * R, h, 2 * R, brique, facade());
      poser('cylindre', cx, y + h, cz, 2 * R + 0.7, 0.8, 2 * R + 0.7, fois(brique, 0.7), MAT.MAT, 0, true);
      poser('sphere', cx, y + h + 0.8 - 6.2, cz, 2 * R - 1.4, 12.4, 2 * R - 1.4, [0.42, 0.55, 0.50], MAT.METAL, 0, true);
      poser('cylindre', cx, y + h + 6.6, cz, 2.6, 2.2, 2.6, [0.92, 0.9, 0.86], MAT.BETON);
      poser('cone', cx, y + h + 8.8, cz, 1.8, 1.2, 1.8, [0.42, 0.55, 0.50], MAT.METAL);
      // Portique d'entrée à l'est, sous un grand anneau rouge.
      poser('boite', cx + R + 1.6, y, cz, 3.4, 0.5, 9, [0.85, 0.83, 0.78], MAT.BETON);
      for (const dz of [-3.6, -1.2, 1.2, 3.6]) poser('cylindre', cx + R + 2.6, y + 0.5, cz + dz, 0.7, 6.2, 0.7, [0.92, 0.9, 0.86], MAT.BETON);
      poser('boite', cx + R + 1.8, y + 6.7, cz, 3.8, 0.8, 9.4, fois(brique, 0.8), MAT.MAT, 0, true);
      objets.push({ shape: 'ring', p: [cx + R + 2.2, y + 10.6, cz], s: [6.2, 6.2, 6.2], r: [Math.PI / 2, Math.PI / 2, 0], mat: MAT.LAQUE,
        color: rouge, outdoor: true, surface: 'object' });
      // Petits anneaux tout autour du tambour, tournés vers le dehors.
      for (let k = 0; k < 10; k++) {
        const a = (k + 0.5) * Math.PI / 5;
        objets.push({ shape: 'ring', p: [cx + Math.sin(a) * (R + 0.15), y + 7.2, cz + Math.cos(a) * (R + 0.15)], s: [2.2, 2.2, 2.2],
          r: [Math.PI / 2, a, 0], mat: MAT.LAQUE, color: rouge, outdoor: true, surface: 'object' });
        banniere(cx + Math.sin(a) * (R + 0.12), y + 5.6, cz + Math.cos(a) * (R + 0.12), rouge, 3.6, a);
      }
      disque(i, j, cx, cz, R + 0.4);
      rectangle(i, j, cx + R - 1, cz - 5, cx + R + 3.6, cz + 5);
      return { nom: NOMS_QG[0], x: cx, z: cz, sortie: [cx + R + 8, cz], emprise: [cx - R, cz - R, cx + R + 3.6, cz + R] };
    };
    /** Le Bastion : le Fort, donjon carré flanqué de quatre tours crénelées, panneaux carrés ambrés. Il regarde l'ouest. */
    const fort = (i, j, x0, z0, x1, z1, f) => {
      const [cx, cz] = centreCellule(i, j), a = 0.26 * Math.min(x1 - x0, z1 - z0), h = 12.8, y = TROTTOIR_H, t = 3.4;
      const gris = [0.64, 0.63, 0.60], sombre = [0.50, 0.49, 0.47], ambre = f.couleur;
      poser('boite', cx, y, cz, 2 * a, h, 2 * a, gris, facade());
      poser('boite', cx, y + h, cz, 2 * a + 0.3, 0.6, 2 * a + 0.3, sombre, MAT.MAT, 0, true);
      const merlons = (x, z, cote, haut) => {
        for (let u = -cote / 2 + 0.8; u <= cote / 2 - 0.8 + 1e-6; u += 3.2) {
          poser('boite', x + u, haut, z - cote / 2 + 0.6, 1.6, 1.3, 1.2, sombre, MAT.BETON);
          poser('boite', x + u, haut, z + cote / 2 - 0.6, 1.6, 1.3, 1.2, sombre, MAT.BETON);
          poser('boite', x - cote / 2 + 0.6, haut, z + u, 1.2, 1.3, 1.6, sombre, MAT.BETON);
          poser('boite', x + cote / 2 - 0.6, haut, z + u, 1.2, 1.3, 1.6, sombre, MAT.BETON);
        }
      };
      merlons(cx, cz, 2 * a, y + h + 0.6);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const tx = cx + sx * a, tz = cz + sz * a;
        poser('boite', tx, y, tz, 2 * t, h + 4.6, 2 * t, fois(gris, 0.94), facade());
        poser('boite', tx, y + h + 4.6, tz, 2 * t + 0.3, 0.5, 2 * t + 0.3, sombre, MAT.MAT, 0, true);
        merlons(tx, tz, 2 * t, y + h + 5.1);
        // Le motif : un carré ambré sur chaque face extérieure de la tour.
        poser('boite', tx + sx * (t + 0.08), y + h - 1, tz, 0.12, 2.6, 2.6, ambre, MAT.LAQUE, 0, true);
        poser('boite', tx, y + h - 1, tz + sz * (t + 0.08), 2.6, 2.6, 0.12, ambre, MAT.LAQUE, 0, true);
      }
      // Grande porte carrée à l'ouest dans un cadre ambré, et un carré ambré au-dessus.
      poser('boite', cx - a - 0.2, y, cz, 0.6, 6, 6, [0.10, 0.10, 0.11], MAT.MAT, 0, true);
      for (const [dz, dy, sy, sz] of [[0, 6.4, 0.7, 7.6], [-3.45, 0, 7.1, 0.7], [3.45, 0, 7.1, 0.7]]) {
        poser('boite', cx - a - 0.4, y + dy, cz + dz, 0.25, sy, sz, ambre, MAT.LAQUE, 0, true);
      }
      poser('boite', cx - a - 0.12, y + 8.4, cz, 0.12, 3, 3, ambre, MAT.LAQUE, 0, true);
      for (let k = 0; k < 3; k++) {
        const u = cz - a * 0.55 + k * a * 0.55;
        banniere(cx + a + 0.08, y + h - 1.5, u, ambre, 6, Math.PI / 2);
      }
      rectangle(i, j, cx - a - t, cz - a - t, cx + a + t, cz + a + t);
      return { nom: NOMS_QG[1], x: cx, z: cz, sortie: [cx - a - t - 5, cz], emprise: [cx - a - t, cz - a - t, cx + a + t, cz + a + t] };
    };
    /** La Préfecture : l'Hôtel, colonnade et fronton en chevron, chevrons bleus (motif : chevron). Il regarde la place, au sud. */
    const hotel = (i, j, x0, z0, x1, z1, f) => {
      const [cx] = centreCellule(i, j), y = TROTTOIR_H, lx = x1 - x0;
      const pierre = [0.88, 0.85, 0.78], clair = [1.0, 0.98, 0.92], bleu = f.couleur;
      const bx0 = x0 + 9, bx1 = x1 - 9, bz0 = z0 + 8, bz1 = z1 - 19, pz = bz1 + 6;   // corps, puis portique jusqu'à pz
      immeuble(bx0, bz0, bx1, bz1, 17.6, pierre, false);
      const large = (bx1 - bx0) * 0.72;
      poser('boite', cx, 0, bz1 + 3, large + 2, 0.9, 6, clair, MAT.BETON);
      const nb = 8;
      for (let k = 0; k < nb; k++) poser('cylindre', cx - large / 2 + 0.8 + (k * (large - 1.6)) / (nb - 1), 0.9, pz - 1.2, 1.1, 11.4, 1.1, clair, MAT.BETON);
      poser('boite', cx, 12.3, bz1 + 3, large + 1.2, 1.6, 6.4, clair, MAT.BETON);
      // Fronton en chevron : deux rampants de pierre au-dessus de la colonnade ; un chevron bleu sur la façade derrière.
      const pente = 0.3, demi = (large + 1.2) / 2, angle = Math.atan(pente);
      for (const s of [-1, 1]) {
        objets.push({ shape: 'box', p: [cx + s * demi / 2, 13.9 + demi * pente / 2 + 0.2, pz - 0.6], s: [demi / Math.cos(angle) + 0.6, 0.7, 1.2],
          r: [0, 0, -s * angle], mat: MAT.BETON, color: clair, outdoor: true, surface: 'object' });
        objets.push({ shape: 'box', p: [cx + s * 1.6, 15.1, bz1 + 0.1], s: [3.6, 0.45, 0.12], r: [0, 0, -s * 0.6], mat: MAT.LAQUE,
          color: bleu, outdoor: true, surface: 'object' });
        objets.push({ shape: 'box', p: [cx + s * 1.6, 9.6, bz1 + 0.16], s: [3.6, 0.45, 0.12], r: [0, 0, -s * 0.6], mat: MAT.LAQUE,
          color: bleu, outdoor: true, surface: 'object' });
      }
      // Chevrons bleus sur l'acrotère, de part et d'autre.
      for (const u of [-0.36, 0.36]) {
        for (const s of [-1, 1]) {
          objets.push({ shape: 'box', p: [cx + u * (bx1 - bx0) + s * 1.2, 19.0, bz1 + 0.1], s: [2.8, 0.4, 0.14], r: [0, 0, -s * 0.6],
            mat: MAT.LAQUE, color: bleu, outdoor: true, surface: 'object' });
        }
      }
      for (let k = 0; k < 2; k++) {
        const vx = bx0 - 5 + k * (bx1 - bx0 + 10);
        poser('boite', vx, 0.25, pz - 6, 2.1, 1.7, 5.2, [0.13, 0.20, 0.42], MAT.LAQUE);
        poser('boite', vx, 0, pz - 6, 1.9, 0.35, 4.4, [0.08, 0.08, 0.09], MAT.MAT, 0, true);
      }
      rectangle(i, j, bx0, bz0, bx1, bz1);
      rectangle(i, j, cx - large / 2 - 1, bz1 - 0.5, cx + large / 2 + 1, pz);
      rectangle(i, j, bx0 - 6.1, pz - 8.8, bx0 - 3.9, pz - 3.2);
      rectangle(i, j, bx1 + 3.9, pz - 8.8, bx1 + 6.1, pz - 3.2);
      return { nom: NOMS_QG[2], x: cx, z: (bz0 + pz) / 2, sortie: [cx, pz + 6], emprise: [bx0, bz0, bx1, pz] };
    };

    // ---- Lieux à prendre : la place centrale et des squares, chacun avec son décor et son nom. ----
    const lieux = [];
    const nomsPris = new Set();
    const nommer = sorte => {
      const liste = NOMS[sorte].filter(n => !nomsPris.has(n));
      const nom = liste.length ? liste[Math.floor(rl() * liste.length)] : NOMS[sorte][0] + ' ' + (nomsPris.size + 1);
      nomsPris.add(nom);
      return nom;
    };
    const variantes = [];
    for (let k = 1; k < cellulesLieux.length; k++) variantes.push(VARIANTES[(k - 1 + Math.floor(rl() * VARIANTES.length)) % VARIANTES.length]);
    const square = (i, j, x0, z0, x1, z1, variante) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, lx = x1 - x0, lz = z1 - z0, y = TROTTOIR_H;
      const dalle = [0.80, 0.76, 0.68];
      poser('plan', cx, y + 0.005, cz, lx, 1, lz, dalle, MAT.PAVE);
      if (variante === 'fontaine') {
        poser('cylindre', cx, y, cz, 17, 0.55, 17, [0.93, 0.91, 0.86], MAT.BETON);
        poser('plan', cx, y + 0.5, cz, 15.6, 1, 15.6, null, MAT.EAU);
        poser('cylindre', cx, y, cz, 3.2, 1.6, 3.2, [0.85, 0.83, 0.78], MAT.BETON);
        poser('cylindre', cx, y + 1.6, cz, 5.2, 0.4, 5.2, [0.9, 0.88, 0.83], MAT.BETON);
        poser('cylindre', cx, y + 2.0, cz, 1.2, 1.6, 1.2, [0.85, 0.83, 0.78], MAT.BETON);
        poser('plan', cx, y + 1.98, cz, 4.6, 1, 4.6, null, MAT.EAU);
        disque(i, j, cx, cz, 8.8);
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) arbre(cx + dx * (lx / 2 - 5), cz + dz * (lz / 2 - 5), y, 1.0);
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4 + Math.PI / 8;
          banc(cx + Math.sin(a) * 11.5, cz + Math.cos(a) * 11.5, a);
        }
      } else if (variante === 'kiosque') {
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          poser('plan', cx + dx * lx / 4, y + 0.012, cz + dz * lz / 4, lx / 2 - 4, 1, lz / 2 - 4, [0.36, 0.52, 0.26], MAT.HERBE);
          arbre(cx + dx * lx / 4, cz + dz * lz / 4, y, 1.05);
        }
        poser('cylindre', cx, y, cz, 9.5, 0.9, 9.5, [0.86, 0.84, 0.80], MAT.BETON);
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4;
          poser('cylindre', cx + Math.sin(a) * 4.2, y + 0.9, cz + Math.cos(a) * 4.2, 0.22, 3.4, 0.22, [0.30, 0.42, 0.36], MAT.METAL, 0, true);
        }
        poser('cylindre', cx, y + 4.3, cz, 10, 0.35, 10, [0.30, 0.42, 0.36], MAT.METAL, 0, true);
        // Le cône est une moitié d'octaèdre : sa moitié basse se cache dans le lanternon carré.
        poser('boite', cx, y + 4.65, cz, 6.4, 0.9, 6.4, [0.30, 0.42, 0.36], MAT.METAL, 0, true);
        poser('cone', cx, y + 5.55, cz, 6.4, 0.9, 6.4, [0.34, 0.50, 0.44], MAT.METAL);
        disque(i, j, cx, cz, 5);
        for (const [dx, dz, a] of [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]]) banc(cx + dx * 9, cz + dz * 9, a);
      } else if (variante === 'jardin') {
        poser('plan', cx, y + 0.012, cz, lx - 6, 1, lz - 6, [0.35, 0.50, 0.25], MAT.HERBE);
        poser('plan', cx, y + 0.02, cz, lx - 6, 1, 3.4, dalle, MAT.PAVE);
        poser('plan', cx, y + 0.02, cz, 3.4, 1, lz - 6, dalle, MAT.PAVE);
        for (let k = 0; k < 5; k++) {
          const u = -0.4 + k * 0.2;
          arbre(cx + u * lx, cz - lz * 0.3, y, 1.0); arbre(cx + u * lx, cz + lz * 0.3, y, 1.0);
        }
        for (const s of [-1, 1]) { banc(cx + s * 6, cz - 2.6, 0); banc(cx + s * 6, cz + 2.6, Math.PI); banc(cx - 2.6, cz + s * 6, Math.PI / 2); }
      } else if (variante === 'esplanade') {
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          if (!a && !b) continue;
          const x = cx + a * lx * 0.3, z = cz + b * lz * 0.3;
          poser('boite', x, y, z, 2.4, 0.5, 2.4, [0.70, 0.68, 0.64], MAT.BETON);
          arbre(x, z, y + 0.5, 0.85);
          banc(x + 2.4, z, Math.PI / 2);
        }
        for (const s of [-1, 1]) {
          poser('cylindre', cx + s * 4, y, cz + s * 4, 0.16, 5.2, 0.16, [0.36, 0.37, 0.39], MAT.METAL, 0, true);
          poser('sphere', cx + s * 4, y + 5.2, cz + s * 4, 0.6, 0.6, 0.6, [0.95, 0.93, 0.85], MAT.BETON);
        }
      } else {
        // Une arche abstraite de béton : deux piles et un linteau, sans figure ni inscription.
        for (const s of [-1, 1]) {
          poser('boite', cx + s * 3.6, y, cz, 1.6, 8, 1.6, [0.82, 0.80, 0.76], MAT.BETON);
          rectangle(i, j, cx + s * 3.6 - 1.2, cz - 1.2, cx + s * 3.6 + 1.2, cz + 1.2);
        }
        poser('boite', cx, y + 8, cz, 9, 1.4, 1.8, [0.86, 0.84, 0.80], MAT.BETON);
        poser('plan', cx, y + 0.012, cz, 18, 1, 18, [0.70, 0.66, 0.58], MAT.PAVE);
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          arbre(cx + dx * (lx / 2 - 6), cz + dz * (lz / 2 - 6), y, 0.95);
          banc(cx + dx * 9.5, cz + dz * 9.5, dz > 0 ? Math.PI : 0);
        }
      }
      return { x: cx, z: cz, rayon: Math.min(lx, lz) / 2 - 3 };
    };

    // ---- Gisements : deux par cellule. Marchés (étals et auvents), chantiers (clôtures, grue, baraque). ----
    const gisements = [];
    const marche = (i, j, x0, z0, x1, z1) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, lx = x1 - x0, lz = z1 - z0, y = TROTTOIR_H;
      poser('plan', cx, y + 0.005, cz, lx, 1, lz, [0.74, 0.70, 0.62], MAT.PAVE);
      const base = nommer('marche'), centres = [[cx, cz - lz / 4, 'côté nord'], [cx, cz + lz / 4, 'côté sud']];
      for (const [gx, gz, cote] of centres) {
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4 + Math.PI / 8, sx = gx + Math.sin(a) * 7.4, sz = gz + Math.cos(a) * 7.4, lacet = a + Math.PI;
          const p = repere(sx, sz, lacet), toile = rl.choix(AUVENTS);
          objets.push(p('boite', 0, 0, y, 2.4, 0.85, 1.1, [0.55, 0.40, 0.26], MAT.ECORCE));
          for (const [u, v] of [[-1.25, -0.6], [1.25, -0.6], [-1.25, 0.6], [1.25, 0.6]]) objets.push(p('cylindre', u, v, y, 0.07, 2.35, 0.07, [0.35, 0.36, 0.38], MAT.METAL));
          objets.push(p('boite', 0, 0, y + 2.35, 2.9, 0.07, 1.8, toile, MAT.TISSU, [0.16, 0, 0]));
          objets.push(p('boite', 0, 0.3, y + 2.42, 2.9, 0.05, 0.5, [0.93, 0.92, 0.88], MAT.TISSU, [0.16, 0, 0]));
        }
        gisements.push({ id: gisements.length, sorte: 'moyens', nom: base + ', ' + cote, x: gx, z: gz, rayon: RAYON_GISEMENT, stock: STOCK.moyens });
      }
      for (const s of [-1, 1]) arbre(cx + s * (lx / 2 - 4), cz, y, 0.9);
    };
    const chantier = (i, j, x0, z0, x1, z1) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, lx = x1 - x0, lz = z1 - z0, y = TROTTOIR_H;
      poser('plan', cx, y + 0.005, cz, lx, 1, lz, [0.60, 0.54, 0.43], MAT.ROCHE);
      // Clôture de chantier autour de la cellule, ouverte au milieu de chaque côté.
      const panneau = [0.86, 0.87, 0.85];
      for (let u = -lx / 2 + 1.5; u < lx / 2 - 1; u += 3.1) {
        if (Math.abs(u) < 5) continue;
        poser('boite', cx + u, y, z0 + 0.6, 3.0, 2.0, 0.06, panneau, MAT.METAL, 0, true);
        poser('boite', cx + u, y, z1 - 0.6, 3.0, 2.0, 0.06, panneau, MAT.METAL, 0, true);
      }
      for (let v = -lz / 2 + 1.5; v < lz / 2 - 1; v += 3.1) {
        if (Math.abs(v) < 5) continue;
        poser('boite', x0 + 0.6, y, cz + v, 0.06, 2.0, 3.0, panneau, MAT.METAL, 0, true);
        poser('boite', x1 - 0.6, y, cz + v, 0.06, 2.0, 3.0, panneau, MAT.METAL, 0, true);
      }
      // Grue à tour entre les deux gisements, et une baraque de chantier.
      const jaune = [0.92, 0.72, 0.16];
      poser('boite', cx + lx / 4, y, cz, 1.6, 26, 1.6, jaune, MAT.METAL, 0, true);
      poser('boite', cx + lx / 4 - 6, y + 26, cz, 26, 1.1, 1.1, jaune, MAT.METAL, 0, true);
      poser('boite', cx + lx / 4 + 8.4, y + 24.6, cz, 2.6, 1.4, 1.8, [0.42, 0.42, 0.42], MAT.BETON);
      poser('boite', cx + lx / 4, y + 27.1, cz, 0.6, 3.2, 0.6, jaune, MAT.METAL, 0, true);
      rectangle(i, j, cx + lx / 4 - 1.2, cz - 1.2, cx + lx / 4 + 1.2, cz + 1.2);
      poser('boite', x0 + 5, y, z0 + 4, 6, 2.6, 2.4, [0.86, 0.86, 0.82], MAT.METAL, 0, true);
      rectangle(i, j, x0 + 1.8, z0 + 2.6, x0 + 8.2, z0 + 5.4);
      const base = nommer('chantier');
      for (const [gz, cote] of [[cz - lz / 4, 'côté nord'], [cz + lz / 4, 'côté sud']]) {
        gisements.push({ id: gisements.length, sorte: 'materiaux', nom: base + ', ' + cote, x: cx - 3, z: gz, rayon: RAYON_GISEMENT, stock: STOCK.materiaux });
      }
    };

    const hauteurSol = Array.from({ length: N }, () => new Array(N).fill(TROTTOIR_H));
    const centre = Math.hypot(etendue.x1, etendue.z1);
    let iLieu = 1;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x0 = debut(LX, i), x1 = fin(LX, i), z0 = debut(LZ, j), z1 = fin(LZ, j);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, lx = x1 - x0, lz = z1 - z0;
        const hauteur = 30 - 22 * Math.min(1, Math.hypot(cx, cz) / (centre * 0.72));
        const t = types[i][j];
        if (t === 'bati') lotir(x0, z0, x1, z1, hauteur, PALETTE);
        else if (t === 'parc') {
          hauteurSol[i][j] = 0.16;
          poser('boite', cx, 0, cz, lx, 0.16, lz, [0.36, 0.50, 0.26], MAT.HERBE);
          poser('plan', cx, 0.165, cz, lx, 1, 3, [0.80, 0.73, 0.60], MAT.PAVE);
          poser('plan', cx, 0.165, cz, 3, 1, lz, [0.80, 0.73, 0.60], MAT.PAVE);
          if (r() < 0.5) {
            poser('cylindre', cx, 0, cz, 14, 0.25, 14, [0.95, 0.93, 0.88], MAT.BETON);
            poser('plan', cx, 0.2, cz, 12.5, 1, 12.5, null, MAT.EAU);
            disque(i, j, cx, cz, 7);
          }
          for (let k = r.entier(12, 20); k > 0; k--) {
            const x = r.entre(x0 + 3, x1 - 3), z = r.entre(z0 + 3, z1 - 3);
            if (Math.abs(x - cx) < 3.5 || Math.abs(z - cz) < 3.5 || Math.hypot(x - cx, z - cz) < 10) continue;
            arbre(x, z, 0.16, r.entre(0.85, 1.25));
          }
          for (const s of [-1, 1]) { banc(cx + s * 4.2, cz + lz * 0.3, Math.PI / 2); banc(cx + lx * 0.3, cz + s * 4.2, 0); }
        } else if (t === 'place') {
          poser('plan', cx, TROTTOIR_H + 0.005, cz, lx, 1, lz, [0.78, 0.74, 0.66], MAT.PAVE);
          poser('boite', cx, TROTTOIR_H, cz, 7, 1.6, 7, [0.66, 0.64, 0.60], MAT.ROCHE);
          poser('boite', cx, TROTTOIR_H + 1.6, cz, 4.2, 1.2, 4.2, [0.70, 0.68, 0.64], MAT.ROCHE);
          poser('cylindre', cx, TROTTOIR_H + 2.8, cz, 1.7, 15, 1.7, [1.0, 0.97, 0.9], MAT.BETON);
          poser('biseau', cx, TROTTOIR_H + 17.8, cz, 1.6, 2.8, 1.6, [0.85, 0.62, 0.35], MAT.METAL, 0, true);
          rectangle(i, j, cx - 3.9, cz - 3.9, cx + 3.9, cz + 3.9);
          for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const fx = cx + dx * lx * 0.27, fz = cz + dz * lz * 0.27;
            poser('cylindre', fx, TROTTOIR_H, fz, 7, 0.6, 7, [0.95, 0.93, 0.88], MAT.BETON);
            poser('plan', fx, TROTTOIR_H + 0.62, fz, 6.2, 1, 6.2, null, MAT.EAU);
            disque(i, j, fx, fz, 3.7);
          }
          for (let k = 0; k < 6; k++) {
            const u = -0.42 + k * 0.168;
            arbre(cx + u * lx, z0 + 3, TROTTOIR_H, 0.9); arbre(cx + u * lx, z1 - 3, TROTTOIR_H, 0.9);
            arbre(x0 + 3, cz + u * lz, TROTTOIR_H, 0.9); arbre(x1 - 3, cz + u * lz, TROTTOIR_H, 0.9);
          }
          for (const s of [-1, 1]) {
            rangeeBarrieres(cx + s * lx * 0.12, z0 + 6, true, 3); rangeeBarrieres(cx + s * lx * 0.12, z1 - 6, true, 3);
            banc(cx + s * 7, cz, s > 0 ? Math.PI / 2 : -Math.PI / 2);
          }
          lieux.push({ id: 0, nom: NOMS.colonne[0], sorte: 'colonne', x: cx, z: cz, rayon: Math.min(lx, lz) / 2 - 3 });
        } else if (t === 'square') {
          const variante = variantes[iLieu - 1];
          const l = square(i, j, x0, z0, x1, z1, variante);
          lieux.push({ id: -1, nom: nommer(variante), sorte: variante, x: l.x, z: l.z, rayon: l.rayon, ordre: cellulesLieux.findIndex(([a, b]) => a === i && b === j) });
          iLieu++;
        } else if (t === 'marche') marche(i, j, x0, z0, x1, z1);
        else if (t === 'chantier') chantier(i, j, x0, z0, x1, z1);
        else {
          // Quartier général : un parvis dallé autour du bâtiment du camp.
          const f = Number(t.slice(2));
          poser('plan', cx, TROTTOIR_H + 0.005, cz, lx, 1, lz, f === 2 ? [0.74, 0.72, 0.68] : [0.76, 0.73, 0.67], MAT.PAVE);
          const q = [rotonde, fort, hotel][f](i, j, x0, z0, x1, z1, FACTIONS[f]);
          for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) arbre(cx + dx * (lx / 2 - 3.2), cz + dz * (lz / 2 - 3.2), TROTTOIR_H, 0.8);
          const [sx, sz] = q.sortie;
          rangeeBarrieres(f === 2 ? sx - 9 : sx, f === 2 ? sz : sz - 9, f === 2, 2);
          rangeeBarrieres(f === 2 ? sx + 9 : sx, f === 2 ? sz : sz + 9, f === 2, 2);
          qg[f] = { faction: f, nom: q.nom, x: q.x, z: q.z, rayon: Math.min(lx, lz) / 2 + 6, sortie: q.sortie, emprise: q.emprise };
        }
      }
    }
    // Les lieux gardent l'ordre de la disposition : la place d'abord, puis les squares.
    lieux.sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    lieux.forEach((l, k) => { l.id = k; delete l.ordre; });

    // Rues : marquages, passages piétons, réverbères, voitures garées, abribus, poubelles et terre-pleins plantés.
    const blanc = [0.86, 0.86, 0.84];
    const troncon = (axe, k, a0, a1) => {
      // axe 'x' : rue horizontale (ligne k de LZ), de x = a0 à x = a1 ; axe 'z' : rue verticale (ligne k de LX).
      // u court le long de la rue, v en travers ; su et sv sont les tailles le long et en travers.
      const l = axe === 'x' ? LZ[k] : LX[k];
      const mesh = (g, u, v, y, su, sy, sv, c, m, objet = true) =>
        (axe === 'x' ? piece(g, u, y, l.c + v, su, sy, sv, c, m, 0, objet) : piece(g, l.c + v, y, u, sv, sy, su, c, m, 0, objet));
      const pose = (...args) => { const m = mesh(...args); objets.push(m); return m; };
      const ici = (u, v) => (axe === 'x' ? [u, l.c + v] : [l.c + v, u]);
      const long = a1 - a0;
      const bandes = (v0, v1) => {
        for (let v = v0 + 0.6; v < v1 - 0.4; v += 1.1) {
          pose('plan', a0 + 2.0, v + 0.25, 0.012, 2.6, 1, 0.5, blanc, MAT.MAT);
          pose('plan', a1 - 2.0, v + 0.25, 0.012, 2.6, 1, 0.5, blanc, MAT.MAT);
        }
      };
      if (l.boulevard) {
        bandes(-l.ch / 2, -l.tp / 2); bandes(l.tp / 2, l.ch / 2);
        pose('boite', (a0 + a1) / 2, 0, 0, long - 7, 0.2, l.tp, [0.38, 0.50, 0.28], MAT.HERBE, false);
        for (let u = a0 + 7; u < a1 - 6; u += 10) arbre(axe === 'x' ? u : l.c, axe === 'x' ? l.c : u, 0.2, 1.05);
        const voie = (l.tp / 2 + l.ch / 2) / 2;
        for (let u = a0 + 6; u < a1 - 6; u += 7) {
          pose('plan', u + 1.5, -voie, 0.012, 3, 1, 0.15, blanc, MAT.MAT);
          pose('plan', u + 1.5, voie, 0.012, 3, 1, 0.15, blanc, MAT.MAT);
        }
      } else {
        bandes(-l.ch / 2, l.ch / 2);
        for (let u = a0 + 5; u < a1 - 7; u += 6) pose('plan', u + 1.5, 0, 0.012, 3, 1, 0.15, blanc, MAT.MAT);
        for (const cote of [-1, 1]) {
          if (r() > 0.45) continue;
          let u = a0 + 6 + r.entre(0, 4);
          while (u < a1 - 9) {
            const c = nuance(r, r.choix(VOITURES), 0.03), v = cote * (l.ch / 2 - 1.15);
            const [x, z] = ici(u + 2.1, v);
            casser('voiture', x, z, axe === 'x' ? 0 : Math.PI / 2, [mesh('boite', u + 2.1, v, 0, 3.6, 0.32, 1.6, [0.07, 0.07, 0.08], MAT.MAT),
              mesh('boite', u + 2.1, v, 0.3, 4.2, 0.72, 1.8, c, MAT.LAQUE), mesh('boite', u + 1.9, v, 1.02, 2.2, 0.55, 1.6, fois(c, 0.45), MAT.LAQUE)]);
            u += 4.2 + r.entre(0.8, 3.5);
            if (r() < 0.18) u += r.entre(5, 12);
          }
        }
      }
      // Réverbères, en quinconce sur les deux trottoirs.
      let cote = 1;
      for (let u = a0 + 8; u < a1 - 4; u += 22, cote = -cote) {
        const v = cote * (l.ch / 2 + 0.7);
        pose('cylindre', u, v, 0, 0.16, 6.6, 0.16, [0.36, 0.37, 0.39], MAT.METAL);
        pose('boite', u, v - cote * 0.75, 6.4, 0.3, 0.16, 1.7, [0.36, 0.37, 0.39], MAT.METAL);
      }
      // Mobilier cassable, tiré à part : poubelles sur les trottoirs, abribus sur les boulevards et quelques rues.
      const trottoir = (l.w - l.ch) / 2;
      for (const s of [-1, 1]) {
        if (rc() < 0.7 && long > 20) {
          const u = a0 + 5 + rc() * (long - 10), [x, z] = ici(u, s * (l.ch / 2 + trottoir * 0.55));
          poubelle(x, z);
        }
      }
      if ((l.boulevard ? rc() < 0.6 : rc() < 0.1) && long > 30) {
        const s = rc() < 0.5 ? -1 : 1, u = a0 + long * (0.3 + rc() * 0.4), v = s * (l.ch / 2 + trottoir * 0.62);
        const [x, z] = ici(u, v), lacet = (axe === 'x' ? 0 : Math.PI / 2) + (s > 0 ? 0 : Math.PI);
        const p = repere(x, z, lacet), y = TROTTOIR_H, verre = [0.30, 0.38, 0.42], fer = [0.34, 0.35, 0.37];
        casser('abribus', x, z, lacet, [p('boite', 0, 0, y + 2.45, 4.4, 0.1, 1.8, fer, MAT.METAL), p('boite', 0, 0.75, y + 0.2, 4.2, 2.2, 0.06, verre, MAT.LAQUE),
          p('boite', -2.1, 0.1, y + 0.2, 0.06, 2.2, 1.3, verre, MAT.LAQUE), p('cylindre', -2.15, 0.8, y, 0.1, 2.45, 0.1, fer, MAT.METAL),
          p('cylindre', 2.15, 0.8, y, 0.1, 2.45, 0.1, fer, MAT.METAL), p('boite', 0.3, 0.45, y + 0.45, 2.6, 0.08, 0.42, fer, MAT.METAL)]);
      }
    };
    for (let k = 0; k <= N; k++) {
      for (let s = 0; s < N; s++) {
        troncon('x', k, LX[s].c + LX[s].w / 2, LX[s + 1].c - LX[s + 1].w / 2);
        troncon('z', k, LZ[s].c + LZ[s].w / 2, LZ[s + 1].c - LZ[s + 1].w / 2);
      }
    }
    // Une lisière d'arbres autour de la ville.
    for (let k = 0; k < 160 * N / 9; k++) {
      const a = r() * Math.PI * 2, d = r.entre(1.05, 1.5);
      const x = Math.cos(a) * (etendue.x1 + 30) * d, z = Math.sin(a) * (etendue.z1 + 30) * d;
      if (Math.abs(x) < etendue.x1 + 12 && Math.abs(z) < etendue.z1 + 12) continue;
      arbre(x, z, 0, r.entre(1.1, 1.6));
    }

    // ---- Circulation : où une unité peut se tenir, et par où elle passe. ----
    const couloir = (L, v) => { for (let k = 0; k <= N; k++) if (Math.abs(v - L[k].c) <= L[k].w / 2) return k; return -1; };
    const bande = (L, v) => { let k = 0; while (k < N - 1 && v >= L[k + 1].c) k++; return k; };
    const chaussee = (L, v) => { for (let k = 0; k <= N; k++) if (Math.abs(v - L[k].c) <= L[k].ch / 2) return k; return -1; };
    const ouverte = (i, j) => ouvert(types[i][j]);
    const serrer = (v, l) => borner(v, l.c - l.ch / 2 + MARGE, l.c + l.ch / 2 - MARGE);
    const libreDansIlot = (i, j, x, z) => { for (const o of obstacles[i][j]) if (dansObstacle(o, x, z)) return false; return true; };

    /** Sort un point d'un obstacle par le bord le plus proche, avec une marge. */
    const sortir = (o, x, z) => {
      if (o.disque) {
        const dx = x - o.x, dz = z - o.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d < 1e-6) return [o.x + o.r + MARGE, o.z];
        return [o.x + dx / d * (o.r + MARGE), o.z + dz / d * (o.r + MARGE)];
      }
      const d = [x - o.x0, o.x1 - x, z - o.z0, o.z1 - z], k = d.indexOf(Math.min(...d));
      return k === 0 ? [o.x0 - MARGE, z] : k === 1 ? [o.x1 + MARGE, z] : k === 2 ? [x, o.z0 - MARGE] : [x, o.z1 + MARGE];
    };

    /** Le point praticable le plus proche : sur une chaussée, une place, un parc ou un parvis, hors des obstacles. */
    function accrocher(x, z) {
      x = borner(x, LX[0].c - LX[0].ch / 2 + MARGE, LX[N].c + LX[N].ch / 2 - MARGE);
      z = borner(z, LZ[0].c - LZ[0].ch / 2 + MARGE, LZ[N].c + LZ[N].ch / 2 - MARGE);
      const i = couloir(LX, x), j = couloir(LZ, z);
      if (i >= 0 || j >= 0) {
        if (i >= 0 && j < 0) x = serrer(x, LX[i]);
        else if (j >= 0 && i < 0) z = serrer(z, LZ[j]);
        else { x = serrer(x, LX[i]); z = serrer(z, LZ[j]); }
        return [x, z];
      }
      const bi = bande(LX, x), bj = bande(LZ, z);
      const x0 = debut(LX, bi), x1 = fin(LX, bi), z0 = debut(LZ, bj), z1 = fin(LZ, bj);
      if (ouverte(bi, bj)) {
        let p = [borner(x, x0 + MARGE, x1 - MARGE), borner(z, z0 + MARGE, z1 - MARGE)];
        for (let essai = 0; essai < 4; essai++) {
          const o = obstacles[bi][bj].find(ob => dansObstacle(ob, p[0], p[1]));
          if (!o) return p;
          p = sortir(o, p[0], p[1]);
        }
        if (praticable(p[0], p[1])) return p;
      }
      const d = [x - x0, x1 - x, z - z0, z1 - z];
      const k = d.indexOf(Math.min(...d));
      if (k === 0) x = LX[bi].c + LX[bi].ch / 2 - MARGE;
      else if (k === 1) x = LX[bi + 1].c - LX[bi + 1].ch / 2 + MARGE;
      else if (k === 2) z = LZ[bj].c + LZ[bj].ch / 2 - MARGE;
      else z = LZ[bj + 1].c - LZ[bj + 1].ch / 2 + MARGE;
      return [x, z];
    }

    /** Vrai si le point est sur une chaussée, une place, un parc ou un parvis (le trottoir compte avec sa chaussée). */
    function praticable(x, z) {
      if (couloir(LX, x) >= 0 || couloir(LZ, z) >= 0) {
        return x >= etendue.x0 && x <= etendue.x1 && z >= etendue.z0 && z <= etendue.z1;
      }
      if (x < etendue.x0 || x > etendue.x1 || z < etendue.z0 || z > etendue.z1) return false;
      const i = bande(LX, x), j = bande(LZ, z);
      return ouverte(i, j) && libreDansIlot(i, j, x, z);
    }

    /** Vrai si le point est sur une chaussée (pas un trottoir, une place ni un parc) : les motards y filent. */
    function surChaussee(x, z) {
      if (x < etendue.x0 || x > etendue.x1 || z < etendue.z0 || z > etendue.z1) return false;
      return chaussee(LX, x) >= 0 || chaussee(LZ, z) >= 0;
    }

    /** Hauteur du sol sous un point : chaussée, trottoir, place ou pelouse. */
    function sol(x, z) {
      if (chaussee(LX, x) >= 0 || chaussee(LZ, z) >= 0) return 0;
      if (x < etendue.x0 || x > etendue.x1 || z < etendue.z0 || z > etendue.z1) return 0;
      const i = bande(LX, x), j = bande(LZ, z);
      return couloir(LX, x) < 0 && couloir(LZ, z) < 0 ? hauteurSol[i][j] : TROTTOIR_H;
    }

    const M = N + 1, NB = M * M;
    const noeud = (i, j) => i + j * M;
    const position = n => [LX[n % M].c, LZ[(n / M) | 0].c];
    /** Carrefours auxquels un point se raccorde en ligne droite. */
    function raccords(x, z) {
      const i = couloir(LX, x), j = couloir(LZ, z);
      if (i >= 0 && j >= 0) return [noeud(i, j)];
      if (i >= 0) { const b = bande(LZ, z); return [noeud(i, b), noeud(i, b + 1)]; }
      if (j >= 0) { const b = bande(LX, x); return [noeud(b, j), noeud(b + 1, j)]; }
      const bi = bande(LX, x), bj = bande(LZ, z);
      return [noeud(bi, bj), noeud(bi + 1, bj), noeud(bi, bj + 1), noeud(bi + 1, bj + 1)];
    }
    // Graphe des carrefours : rues entre carrefours voisins, diagonales à travers les îlots ouverts sans obstacle.
    const aretes = Array.from({ length: NB }, () => []);
    const relier = (a, b) => {
      const [ax, az] = position(a), [bx, bz] = position(b), d = Math.hypot(ax - bx, az - bz);
      aretes[a].push([b, d]); aretes[b].push([a, d]);
    };
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      if (i < N) relier(noeud(i, j), noeud(i + 1, j));
      if (j < N) relier(noeud(i, j), noeud(i, j + 1));
    }
    const traversable = (i, j) => ouverte(i, j) && obstacles[i][j].length === 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (!traversable(i, j)) continue;
      relier(noeud(i, j), noeud(i + 1, j + 1));
      relier(noeud(i + 1, j), noeud(i, j + 1));
    }

    /** Étapes d'un trajet praticable de (x0, z0) à (x1, z1), arrivée comprise ; les deux points sont accrochés. */
    function itineraire(x0, z0, x1, z1) {
      [x0, z0] = accrocher(x0, z0);
      [x1, z1] = accrocher(x1, z1);
      const ra = raccords(x0, z0), rb = raccords(x1, z1);
      if (ra.length === rb.length && ra.every((n, k) => n === rb[k]) && (ra.length < 4 || traversable(bande(LX, x0), bande(LZ, z0)))) return [[x1, z1]];
      const dist = new Float64Array(NB).fill(Infinity), prec = new Int32Array(NB).fill(-1), vu = new Uint8Array(NB);
      // Depuis un îlot ouvert encombré, on gagne d'abord le carrefour le plus proche que l'on voit en ligne droite,
      // sans traverser l'obstacle central (à défaut, le plus proche).
      const degage = (ax, az, bx, bz) => {
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
        for (let k = 0; k <= n; k++) if (!praticable(ax + (bx - ax) * k / n, az + (bz - az) * k / n)) return false;
        return true;
      };
      const dehors = (rs, x, z) => {
        if (rs.length !== 4 || traversable(bande(LX, x), bande(LZ, z))) return rs;
        const proche = liste => liste.reduce((m, n) => { const [nx, nz] = position(n), [mx, mz] = position(m); return Math.hypot(nx - x, nz - z) < Math.hypot(mx - x, mz - z) ? n : m; });
        const vus = rs.filter(n => { const [nx, nz] = position(n); return degage(x, z, nx, nz); });
        return [proche(vus.length ? vus : rs)];
      };
      for (const n of dehors(ra, x0, z0)) { const [nx, nz] = position(n); dist[n] = Math.hypot(nx - x0, nz - z0); }
      const sortie = new Map(dehors(rb, x1, z1).map(n => { const [nx, nz] = position(n); return [n, Math.hypot(nx - x1, nz - z1)]; }));
      let meilleur = Infinity, dernier = -1;
      for (;;) {
        let u = -1;
        for (let n = 0; n < NB; n++) if (!vu[n] && dist[n] < Infinity && (u < 0 || dist[n] < dist[u])) u = n;
        if (u < 0 || dist[u] >= meilleur) break;
        vu[u] = 1;
        if (sortie.has(u) && dist[u] + sortie.get(u) < meilleur) { meilleur = dist[u] + sortie.get(u); dernier = u; }
        for (const [v, d] of aretes[u]) if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prec[v] = u; }
      }
      const noeuds = [];
      for (let n = dernier; n >= 0; n = prec[n]) noeuds.unshift(n);
      // Les carrefours franchis tout droit ne sont pas des étapes.
      const etapes = [];
      for (let k = 0; k < noeuds.length; k++) {
        const p = position(noeuds[k]);
        if (k > 0 && k < noeuds.length - 1) {
          const a = position(noeuds[k - 1]), b = position(noeuds[k + 1]);
          if ((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1])) continue;
        }
        etapes.push(p);
      }
      etapes.push([x1, z1]);
      return etapes;
    }

    /** n points de départ pour une faction, sur les rues autour de son quartier. */
    function departs(faction, n, graineDeparts) {
      const rd = hasard(graineDeparts * 40503 + faction * 977);
      const [ci, cj] = factions[faction].cellule;
      const ax = (debut(LX, ci) + fin(LX, ci)) / 2, az = (debut(LZ, cj) + fin(LZ, cj)) / 2;
      const rayon = 70 + Math.sqrt(n) * 11;
      const points = [];
      while (points.length < n) {
        const a = rd() * Math.PI * 2, d = Math.sqrt(rd()) * rayon;
        const p = accrocher(ax + Math.cos(a) * d, az + Math.sin(a) * d);
        if (couloir(LX, p[0]) < 0 && couloir(LZ, p[1]) < 0) continue;
        points.push(p);
      }
      return points;
    }

    /** Un point praticable tiré au hasard, près de (x, z) dans un rayon donné. */
    function pointAuHasard(rd, x, z, rayon) {
      for (;;) {
        const a = rd() * Math.PI * 2, d = Math.sqrt(rd()) * rayon;
        const p = accrocher(x + Math.cos(a) * d, z + Math.sin(a) * d);
        if (praticable(p[0], p[1])) return p;
      }
    }

    /** Carrefours tirés au hasard, loin des quartiers et de la place (l'essai 0.1 y mettait des barricades en feu). */
    function carrefours(rd, n) {
      const choix = [];
      for (let essai = 0; choix.length < n && essai < 500; essai++) {
        const i = 1 + Math.floor(rd() * (N - 1)), j = 1 + Math.floor(rd() * (N - 1));
        if (Math.abs(i - C - 0.5) + Math.abs(j - C) < 2 || choix.some(([a, b]) => Math.abs(a - i) + Math.abs(b - j) < 3)) continue;
        choix.push([i, j]);
      }
      return choix.map(([i, j]) => [LX[i].c, LZ[j].c]);
    }

    const sites = { qg, lieux, gisements, cassables, immeubles };
    return {
      graine, N, ilots: N, LX, LZ, types, etendue, objets, MAT, FACTIONS: factions, barricades: [], sites, obstacles,
      accrocher, praticable, surChaussee, sol, itineraire, departs, pointAuHasard, carrefours, centreCellule, hasard,
      place: centreCellule(C, C),
    };
  }

  PDR.ville = { creerVille, disposer, hasard, MAT, FACTIONS, CASSABLES, STOCK };
})(globalThis.PDR = globalThis.PDR || {});
