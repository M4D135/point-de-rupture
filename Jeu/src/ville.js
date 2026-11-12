// Ville procédurale de l'essai, tirée d'une graine : un quadrillage d'îlots, de rues et de boulevards, une place
// centrale, des parcs, la Préfecture et les deux quartiers généraux. Aucun fichier : tout sort du code ci-dessous.
// Le décor est décrit dans le format de scène du moteur FERRO : { shape, p, s, r, mat, color, outdoor, surface },
// primitives centrées sur p, rotation r = [x, y, z] appliquée dans l'ordre du moteur (Rz · Ry · Rx).
// Unités : le mètre ; x vers l'est, z vers le sud, y vers le haut. Les escouades du noyau comptent en millimètres.
(function (PDR) {
  'use strict';

  /** Hasard rapide et reproductible (mulberry32) pour le décor ; le noyau garde son propre tirage. */
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
  const FACTIONS = [
    { nom: 'La Convergence', court: 'Convergence', couleur: [0.90, 0.27, 0.19], cellule: [1, 4] },
    { nom: 'Le Bastion', court: 'Bastion', couleur: [0.93, 0.64, 0.15], cellule: [7, 4] },
    { nom: 'La Préfecture', court: 'Préfecture', couleur: [0.22, 0.45, 0.90], cellule: [4, 3] },
  ];

  const N = 9;                                   // îlots par côté
  const RUE = { w: 15, ch: 9, tp: 0 };           // couloir de façade à façade, chaussée, terre-plein
  const BOULEVARD = { w: 28, ch: 19, tp: 4 };
  const BOULEVARDS = [2, 7];
  const TROTTOIR_H = 0.12, MARGE = 2.2;

  const PALETTE = [[0.80, 0.74, 0.63], [0.86, 0.81, 0.71], [0.66, 0.40, 0.31], [0.62, 0.62, 0.60], [0.88, 0.86, 0.81],
    [0.76, 0.60, 0.43], [0.55, 0.59, 0.63], [0.72, 0.66, 0.58], [0.58, 0.35, 0.29], [0.82, 0.77, 0.66]];
  const VOITURES = [[0.75, 0.75, 0.76], [0.12, 0.13, 0.15], [0.55, 0.08, 0.08], [0.16, 0.25, 0.45], [0.85, 0.85, 0.83],
    [0.35, 0.37, 0.38], [0.62, 0.55, 0.40], [0.20, 0.35, 0.25]];
  const VERTS = [[0.27, 0.45, 0.20], [0.33, 0.50, 0.22], [0.24, 0.40, 0.22], [0.40, 0.52, 0.24], [0.30, 0.42, 0.18]];

  const borner = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const nuance = (r, c, e) => c.map(v => borner(v + r.entre(-e, e), 0, 1));
  const fois = (c, k) => c.map(v => borner(v * k, 0, 1));

  function creerVille(graine = 1) {
    const r = hasard(graine * 2654435761);
    const objets = [];
    /**
     * Une pièce du décor, posée par sa base : primitive, (x, y, z) au pied, tailles, couleur sRGB, matière, lacet.
     * Un « plan » est une dalle de 3 cm dont le dessus est à y ; un « cone » est la moitié haute d'un octaèdre.
     */
    const poser = (g, x, y, z, sx, sy, sz, c, m = MAT.MAT, lacet = 0, objet = false) => {
      let py = y + sy / 2, hy = sy;
      if (g === 'plan') { hy = 0.03; py = y - 0.015; } else if (g === 'cone') { hy = sy * 2; py = y; }
      const mesh = { shape: FORMES[g], p: [x, py, z], s: [sx, hy, sz], r: [0, lacet, 0], mat: m, outdoor: true };
      if (c) mesh.color = c;
      if (objet) mesh.surface = 'object';
      objets.push(mesh);
      return mesh;
    };
    const facade = () => MAT.FACADE - 0.45 + r() * 0.9;

    // Lignes de rues : positions des axes, du nord-ouest au sud-est, centrées sur l'origine.
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

    // Types des îlots.
    const types = Array.from({ length: N }, () => new Array(N).fill('bati'));
    types[4][4] = 'place';
    FACTIONS.forEach((f, k) => { types[f.cellule[0]][f.cellule[1]] = ['qg0', 'qg1', 'prefecture'][k]; });
    for (let n = 0; n < 9;) {
      const i = r.entier(0, N - 1), j = r.entier(0, N - 1);
      if (types[i][j] !== 'bati' || Math.abs(i - 4) + Math.abs(j - 4) <= 1) continue;
      types[i][j] = 'parc';
      n++;
    }

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
    const banniere = (x, y, z, couleur, haut = 7) => poser('boite', x, y - haut, z, 2.2, haut, 0.12, couleur, MAT.TISSU);

    /** Un immeuble sur l'emprise donnée ; rend la hauteur du toit. */
    const immeuble = (x0, z0, x1, z1, h, couleur, details = true) => {
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
      }
    };

    const centre = Math.hypot(etendue.x1, etendue.z1);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x0 = debut(LX, i), x1 = fin(LX, i), z0 = debut(LZ, j), z1 = fin(LZ, j);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, lx = x1 - x0, lz = z1 - z0;
        const hauteur = 30 - 22 * Math.min(1, Math.hypot(cx, cz) / (centre * 0.72));
        const t = types[i][j];
        if (t === 'bati') lotir(x0, z0, x1, z1, hauteur, PALETTE);
        else if (t === 'parc') {
          poser('boite', cx, 0, cz, lx, 0.16, lz, [0.36, 0.50, 0.26], MAT.HERBE);
          poser('plan', cx, 0.165, cz, lx, 1, 3, [0.80, 0.73, 0.60], MAT.PAVE);
          poser('plan', cx, 0.165, cz, 3, 1, lz, [0.80, 0.73, 0.60], MAT.PAVE);
          if (r() < 0.5) {
            poser('cylindre', cx, 0, cz, 14, 0.25, 14, [0.95, 0.93, 0.88], MAT.BETON);
            poser('plan', cx, 0.2, cz, 12.5, 1, 12.5, null, MAT.EAU);
          }
          for (let k = r.entier(12, 20); k > 0; k--) {
            const x = r.entre(x0 + 3, x1 - 3), z = r.entre(z0 + 3, z1 - 3);
            if (Math.abs(x - cx) < 3.5 || Math.abs(z - cz) < 3.5 || Math.hypot(x - cx, z - cz) < 10) continue;
            arbre(x, z, 0.16, r.entre(0.85, 1.25));
          }
        } else if (t === 'place') {
          poser('plan', cx, TROTTOIR_H + 0.005, cz, lx, 1, lz, [0.78, 0.74, 0.66], MAT.PAVE);
          poser('boite', cx, TROTTOIR_H, cz, 7, 1.6, 7, [0.66, 0.64, 0.60], MAT.ROCHE);
          poser('boite', cx, TROTTOIR_H + 1.6, cz, 4.2, 1.2, 4.2, [0.70, 0.68, 0.64], MAT.ROCHE);
          poser('cylindre', cx, TROTTOIR_H + 2.8, cz, 1.7, 15, 1.7, [1.0, 0.97, 0.9], MAT.BETON);
          poser('biseau', cx, TROTTOIR_H + 17.8, cz, 1.6, 2.8, 1.6, [0.85, 0.62, 0.35], MAT.METAL, 0, true);
          for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const fx = cx + dx * lx * 0.27, fz = cz + dz * lz * 0.27;
            poser('cylindre', fx, TROTTOIR_H, fz, 7, 0.6, 7, [0.95, 0.93, 0.88], MAT.BETON);
            poser('plan', fx, TROTTOIR_H + 0.62, fz, 6.2, 1, 6.2, null, MAT.EAU);
          }
          for (let k = 0; k < 6; k++) {
            const u = -0.42 + k * 0.168;
            arbre(cx + u * lx, z0 + 3, TROTTOIR_H, 0.9); arbre(cx + u * lx, z1 - 3, TROTTOIR_H, 0.9);
            arbre(x0 + 3, cz + u * lz, TROTTOIR_H, 0.9); arbre(x1 - 3, cz + u * lz, TROTTOIR_H, 0.9);
          }
        } else if (t === 'prefecture') {
          // Le bâtiment regarde la place, au sud.
          const pierre = [0.88, 0.85, 0.78], clair = [1.0, 0.98, 0.92];
          poser('plan', cx, TROTTOIR_H + 0.005, cz, lx, 1, lz, [0.74, 0.72, 0.68], MAT.PAVE);
          immeuble(x0 + 5, z0 + 6, x1 - 5, z1 - 13, 17.6, pierre, false);
          poser('boite', cx, 0, z1 - 9.5, lx * 0.55, 0.9, 7, clair, MAT.BETON);
          const nb = 8;
          for (let k = 0; k < nb; k++) poser('cylindre', cx - lx * 0.24 + (k * lx * 0.48) / (nb - 1), 0.9, z1 - 8, 1.1, 12, 1.1, clair, MAT.BETON);
          poser('boite', cx, 12.9, z1 - 9.5, lx * 0.55, 1.8, 7.6, clair, MAT.BETON);
          poser('cylindre', cx, 19, cz - 4, 0.2, 9, 0.2, [0.45, 0.46, 0.48], MAT.METAL, 0, true);
          poser('boite', cx, 25.2, cz - 2.5, 0.1, 1.9, 3, FACTIONS[2].couleur, MAT.TISSU);
          for (let k = 0; k < 4; k++) {
            const vx = x0 + 6 + k * 6.5;
            poser('boite', vx, 0.25, z1 - 2.5, 2.1, 1.7, 5.2, [0.13, 0.20, 0.42], MAT.LAQUE);
            poser('boite', vx, 0, z1 - 2.5, 1.9, 0.35, 4.4, [0.08, 0.08, 0.09], MAT.MAT, 0, true);
          }
        } else {
          // Quartier général d'une des deux factions : un îlot loti, des bannières et un mât à ses couleurs.
          const f = FACTIONS[t === 'qg0' ? 0 : 1];
          const pal = t === 'qg0' ? [[0.66, 0.40, 0.31], [0.58, 0.35, 0.29], [0.70, 0.48, 0.38]] : [[0.62, 0.62, 0.60], [0.55, 0.59, 0.63], [0.70, 0.68, 0.62]];
          lotir(x0, z0, x1, z1, 16, pal);
          for (let k = 0; k < 4; k++) {
            const u = x0 + 6 + k * (lx - 12) / 3;
            banniere(u, 15, z0 - 0.2, f.couleur);
            banniere(u, 15, z1 + 0.2, f.couleur);
          }
          poser('cylindre', cx, 0, cz, 0.22, 26, 0.22, [0.45, 0.46, 0.48], MAT.METAL, 0, true);
          poser('boite', cx, 22.6, cz + 2.2, 0.12, 2.8, 4.4, f.couleur, MAT.TISSU);
        }
      }
    }

    // Rues : marquages, passages piétons, réverbères, voitures garées et terre-pleins plantés.
    const blanc = [0.86, 0.86, 0.84];
    const troncon = (axe, k, a0, a1) => {
      // axe 'x' : rue horizontale (ligne k de LZ), de x = a0 à x = a1 ; axe 'z' : rue verticale (ligne k de LX).
      // u court le long de la rue, v en travers ; su et sv sont les tailles le long et en travers.
      const l = axe === 'x' ? LZ[k] : LX[k];
      const pose = (g, u, v, y, su, sy, sv, c, m, objet = true) =>
        axe === 'x' ? poser(g, u, y, l.c + v, su, sy, sv, c, m, 0, objet) : poser(g, l.c + v, y, u, sv, sy, su, c, m, 0, objet);
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
            pose('boite', u + 2.1, v, 0, 3.6, 0.32, 1.6, [0.07, 0.07, 0.08], MAT.MAT);
            pose('boite', u + 2.1, v, 0.3, 4.2, 0.72, 1.8, c, MAT.LAQUE);
            pose('boite', u + 1.9, v, 1.02, 2.2, 0.55, 1.6, fois(c, 0.45), MAT.LAQUE);
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
    };
    for (let k = 0; k <= N; k++) {
      for (let s = 0; s < N; s++) {
        troncon('x', k, LX[s].c + LX[s].w / 2, LX[s + 1].c - LX[s + 1].w / 2);
        troncon('z', k, LZ[s].c + LZ[s].w / 2, LZ[s + 1].c - LZ[s + 1].w / 2);
      }
    }
    // Une lisière d'arbres autour de la ville.
    for (let k = 0; k < 160; k++) {
      const a = r() * Math.PI * 2, d = r.entre(1.05, 1.5);
      const x = Math.cos(a) * (etendue.x1 + 30) * d, z = Math.sin(a) * (etendue.z1 + 30) * d;
      if (Math.abs(x) < etendue.x1 + 12 && Math.abs(z) < etendue.z1 + 12) continue;
      arbre(x, z, 0, r.entre(1.1, 1.6));
    }

    // Barricades en feu à six carrefours : carcasse couchée sur le flanc, palettes, pneus, poubelle renversée.
    // Tirage à part, pour que le reste de la ville ne bouge pas. Le feu et la fumée sont des effets du jeu.
    const rb = hasard(graine * 7919 + 13);
    const barricades = carrefours(rb, 6);
    for (const [x, z] of barricades) {
      const a = rb() * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
      const ici = (u, v) => [x + u * ca + v * sa, z - u * sa + v * ca];
      const piece = (shape, u, v, y, s, rx, lacet, mat, color) => {
        const [px, pz] = ici(u, v);
        objets.push({ shape, p: [px, y, pz], s, r: [rx, a + lacet, 0], mat, color, outdoor: true, surface: 'object' });
      };
      const calcine = [0.10, 0.09, 0.085];
      piece('box', 0, 0, 0.9, [4.2, 1.2, 1.8], Math.PI / 2, 0, MAT.LAQUE, calcine);
      piece('box', -0.2, 0.88, 0.9, [2.2, 0.55, 1.6], Math.PI / 2, 0, MAT.LAQUE, [0.07, 0.065, 0.06]);
      for (let k = 0; k < 3; k++) piece('box', 0.3, -2.1, 0.07 + k * 0.14, [1.2, 0.13, 1.0], 0, rb.entre(-0.3, 0.3), MAT.MAT, k === 2 ? [0.2, 0.15, 0.1] : [0.4, 0.3, 0.19]);
      for (let k = 0; k < 3; k++) piece('cylinder', 2.7, -1.0, 0.13 + k * 0.26, [0.78, 0.25, 0.78], 0, 0, MAT.MAT, [0.045, 0.045, 0.05]);
      piece('cylinder', -2.6, -1.4, 0.33, [0.66, 1.05, 0.66], Math.PI / 2, 0.8, MAT.METAL, [0.3, 0.38, 0.33]);
      poser('plan', x, 0.02, z, 10, 1, 8, [0.06, 0.06, 0.06], MAT.MAT, a);
    }

    // ---- Circulation : où une escouade peut se tenir, et par où elle passe. ----
    const couloir = (L, v) => { for (let k = 0; k <= N; k++) if (Math.abs(v - L[k].c) <= L[k].w / 2) return k; return -1; };
    const bande = (L, v) => { let k = 0; while (k < N - 1 && v >= L[k + 1].c) k++; return k; };
    const chaussee = (L, v) => { for (let k = 0; k <= N; k++) if (Math.abs(v - L[k].c) <= L[k].ch / 2) return k; return -1; };
    const ouverte = (i, j) => types[i][j] === 'place' || types[i][j] === 'parc';
    const serrer = (v, l) => borner(v, l.c - l.ch / 2 + MARGE, l.c + l.ch / 2 - MARGE);

    /** Le point praticable le plus proche : sur une chaussée, une place ou un parc. */
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
      if (ouverte(bi, bj)) return [borner(x, x0 + MARGE, x1 - MARGE), borner(z, z0 + MARGE, z1 - MARGE)];
      const d = [x - x0, x1 - x, z - z0, z1 - z];
      const k = d.indexOf(Math.min(...d));
      if (k === 0) x = LX[bi].c + LX[bi].ch / 2 - MARGE;
      else if (k === 1) x = LX[bi + 1].c - LX[bi + 1].ch / 2 + MARGE;
      else if (k === 2) z = LZ[bj].c + LZ[bj].ch / 2 - MARGE;
      else z = LZ[bj + 1].c - LZ[bj + 1].ch / 2 + MARGE;
      return [x, z];
    }

    /** Vrai si le point est sur une chaussée, une place ou un parc (le trottoir compte avec sa chaussée). */
    function praticable(x, z) {
      if (couloir(LX, x) >= 0 || couloir(LZ, z) >= 0) {
        return x >= etendue.x0 && x <= etendue.x1 && z >= etendue.z0 && z <= etendue.z1;
      }
      return ouverte(bande(LX, x), bande(LZ, z));
    }

    /** Hauteur du sol sous un point : chaussée, trottoir, place ou pelouse. */
    function sol(x, z) {
      if (chaussee(LX, x) >= 0 || chaussee(LZ, z) >= 0) return 0;
      if (x < etendue.x0 || x > etendue.x1 || z < etendue.z0 || z > etendue.z1) return 0;
      const t = types[bande(LX, x)][bande(LZ, z)];
      return t === 'parc' && couloir(LX, x) < 0 && couloir(LZ, z) < 0 ? 0.16 : TROTTOIR_H;
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
    // Graphe des carrefours : rues entre carrefours voisins, diagonales à travers places et parcs.
    const aretes = Array.from({ length: NB }, () => []);
    const relier = (a, b) => {
      const [ax, az] = position(a), [bx, bz] = position(b), d = Math.hypot(ax - bx, az - bz);
      aretes[a].push([b, d]); aretes[b].push([a, d]);
    };
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      if (i < N) relier(noeud(i, j), noeud(i + 1, j));
      if (j < N) relier(noeud(i, j), noeud(i, j + 1));
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (!ouverte(i, j)) continue;
      relier(noeud(i, j), noeud(i + 1, j + 1));
      relier(noeud(i + 1, j), noeud(i, j + 1));
    }

    /** Étapes d'un trajet praticable de (x0, z0) à (x1, z1), arrivée comprise ; les deux points sont accrochés. */
    function itineraire(x0, z0, x1, z1) {
      [x0, z0] = accrocher(x0, z0);
      [x1, z1] = accrocher(x1, z1);
      const ra = raccords(x0, z0), rb = raccords(x1, z1);
      if (ra.length === rb.length && ra.every((n, k) => n === rb[k])) return [[x1, z1]];
      const dist = new Float64Array(NB).fill(Infinity), prec = new Int32Array(NB).fill(-1), vu = new Uint8Array(NB);
      for (const n of ra) { const [nx, nz] = position(n); dist[n] = Math.hypot(nx - x0, nz - z0); }
      const sortie = new Map(rb.map(n => { const [nx, nz] = position(n); return [n, Math.hypot(nx - x1, nz - z1)]; }));
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
      const [ci, cj] = FACTIONS[faction].cellule;
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

    /** Carrefours tirés au hasard pour les barricades en feu, loin des quartiers et de la place. */
    function carrefours(rd, n) {
      const choix = [];
      for (let essai = 0; choix.length < n && essai < 500; essai++) {
        const i = 1 + Math.floor(rd() * (N - 1)), j = 1 + Math.floor(rd() * (N - 1));
        if (Math.abs(i - 4.5) + Math.abs(j - 4) < 2 || choix.some(([a, b]) => Math.abs(a - i) + Math.abs(b - j) < 3)) continue;
        choix.push([i, j]);
      }
      return choix.map(([i, j]) => [LX[i].c, LZ[j].c]);
    }

    const centreCellule = (i, j) => [(debut(LX, i) + fin(LX, i)) / 2, (debut(LZ, j) + fin(LZ, j)) / 2];
    return {
      graine, N, LX, LZ, types, etendue, objets, MAT, FACTIONS, barricades,
      accrocher, praticable, sol, itineraire, departs, pointAuHasard, carrefours, centreCellule, hasard,
      place: centreCellule(4, 4),
    };
  }

  PDR.ville = { creerVille, hasard, MAT, FACTIONS };
})(globalThis.PDR = globalThis.PDR || {});
