/* Point de rupture — navigation de la simulation (CONCEPTION.md §2). Ni window ni document : le fichier tourne dans le
   travailleur, sur le fil principal et dans Node.

   Deux grilles alignées sur la même origine, en millimètres :
   - la grille fine de 2 m (masque2) dit où une unité peut se tenir : 0 mur, 1 praticable, 2 chaussée (les motards y
     filent). Elle sert aux déplacements et au champ de densité de la foule ;
   - la grille de navigation de 4 m : une case est praticable si ses quatre cases fines le sont, et si aucun obstacle
     dynamique (barricade, avant-poste) ne la couvre. Les champs de direction s'y calculent.

   Champs de direction : algorithme de Dial (files par coût, coûts entiers 10 et 14), 8 directions, sans couper d'angle
   à travers un obstacle. Le champ est mis en cache par but et par version des obstacles ; chaque ordre de groupe en
   partage un. Une case du champ vaut 0..127 (cap = code × 2 sur 256 directions, voir PDR.nav.DX), BUT ou AUCUN.
   Les directions sont lissées sur trois pas tant que le chemin ne tourne pas de plus de 45°.

   Caps : 256 directions ; 0 regarde +z, 64 regarde +x (la face regarde (sin cap, cos cap), comme le protocole).
   DX[c], DZ[c] : le vecteur unité × 1024, calculé une fois par une série entière (aucun Math.sin). cap(dx, dz) : le cap
   le plus proche d'un vecteur, en entiers. */
(function (PDR) {
  'use strict';

  const CELLULE = 4000, FIN = 2000;            // mm
  const ORTHO = 10, DIAG = 14;
  const BUT = 254, AUCUN = 255;
  const INFINI = 0xFFFFFFFF;

  // ---- Tables d'angles. sin(k π / 128) pour k = 0..64 par la série de Taylor (opérations IEEE exactes et partout
  // identiques), puis arrondi à 1/1024. ----
  const QUART = new Int32Array(65);
  for (let k = 0; k <= 64; k++) {
    const t = k * Math.PI / 128;
    let terme = t, somme = t;
    for (let n = 1; n < 14; n++) { terme *= -t * t / ((2 * n) * (2 * n + 1)); somme += terme; }
    QUART[k] = Math.round(somme * 1024);
  }
  const sinCap = h => { h &= 255; return h < 64 ? QUART[h] : h < 128 ? QUART[128 - h] : h < 192 ? -QUART[h - 128] : -QUART[256 - h]; };
  const DX = new Int16Array(256), DZ = new Int16Array(256);
  for (let h = 0; h < 256; h++) { DX[h] = sinCap(h); DZ[h] = sinCap(h + 64); }
  // ATAN[q] : le cap (0..32) dont la tangente est la plus proche de q / 256, pour q = 0..256.
  const ATAN = new Uint8Array(257);
  for (let q = 0, k = 0; q <= 256; q++) {
    while (k < 32 && Math.abs(q * DZ[k + 1] - 256 * DX[k + 1]) <= Math.abs(q * DZ[k] - 256 * DX[k])) k++;
    ATAN[q] = k;
  }
  /** Cap 0..255 du vecteur (dx, dz) ; garde est rendu pour le vecteur nul. */
  function cap(dx, dz, garde = 0) {
    const ax = dx < 0 ? -dx : dx, az = dz < 0 ? -dz : dz;
    if (ax === 0 && az === 0) return garde;
    const k = ax <= az ? ATAN[Math.trunc(ax * 256 / az)] : 64 - ATAN[Math.trunc(az * 256 / ax)];
    if (dz >= 0) return dx >= 0 ? k : (256 - k) & 255;
    return dx >= 0 ? 128 - k : 128 + k;
  }
  /** Le cap en radians, pour le tampon de rendu (la face regarde (sin, cos)). */
  const RADIANS = new Float32Array(256);
  for (let h = 0; h < 256; h++) RADIANS[h] = h < 128 ? h * Math.PI / 128 : (h - 256) * Math.PI / 128;

  /**
   * creer(ville, { capaciteChamps }) : la navigation d'une ville.
   * Toutes les positions sont en millimètres ; les cases sont des indices i + j × nx.
   */
  function creer(ville, options = {}) {
    const e = ville.etendue;
    const x0m = Math.floor((e.x0 - 8) / 4) * 4, z0m = Math.floor((e.z0 - 8) / 4) * 4;
    const nx = Math.ceil((e.x1 + 8 - x0m) / 4), nz = Math.ceil((e.z1 + 8 - z0m) / 4), n = nx * nz;
    const X0 = x0m * 1000, Z0 = z0m * 1000;
    const nx2 = nx * 2, nz2 = nz * 2, n2 = nx2 * nz2;

    // Grille fine : le centre de chaque case de 2 m est-il praticable, et sur une chaussée ?
    const masque2 = new Uint8Array(n2);
    for (let j = 1; j < nz2 - 1; j++) {
      const z = z0m + j * 2 + 1;
      for (let i = 1; i < nx2 - 1; i++) {
        const x = x0m + i * 2 + 1;
        if (ville.praticable(x, z)) masque2[i + j * nx2] = ville.surChaussee(x, z) ? 2 : 1;
      }
    }
    // Grille de navigation : praticable si ses quatre cases fines le sont ; le bord reste fermé.
    const statique = new Uint8Array(n), bloque = new Uint8Array(n), libre = new Uint8Array(n);
    for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const f = 2 * i + 2 * j * nx2;
      if (masque2[f] && masque2[f + 1] && masque2[f + nx2] && masque2[f + nx2 + 1]) statique[i + j * nx] = libre[i + j * nx] = 1;
    }
    // Sortie des cases fermées proches d'une case ouverte (bords de trottoir) : un parcours en largeur, trois cases.
    const sortie = new Uint8Array(n).fill(AUCUN);
    {
      let front = [];
      for (let c = 0; c < n; c++) if (statique[c]) front.push(c);
      const vu = Uint8Array.from(statique);
      for (let profondeur = 0; profondeur < 3 && front.length; profondeur++) {
        const suivant = [];
        for (const c of front) {
          const i = c % nx, j = (c / nx) | 0;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const a = i + di, b = j + dj;
            if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
            const v = a + b * nx;
            if (vu[v]) continue;
            vu[v] = 1;
            sortie[v] = cap(-di, -dj) >> 1;
            suivant.push(v);
          }
        }
        front = suivant;
      }
    }

    const nav = {
      CELLULE, FIN, X0, Z0, nx, nz, n, nx2, nz2, n2, masque2, statique, bloque, libre, sortie, version: 0,
      carte: { nx, nz, x0: x0m, z0: z0m, cellule: 4 },
    };

    /** Case de 4 m sous un point (bornée à la grille). */
    nav.caseDe = (x, z) => {
      let i = Math.trunc((x - X0) / CELLULE), j = Math.trunc((z - Z0) / CELLULE);
      if (i < 0) i = 0; else if (i >= nx) i = nx - 1;
      if (j < 0) j = 0; else if (j >= nz) j = nz - 1;
      return i + j * nx;
    };
    /** Case de 2 m sous un point (bornée). */
    nav.fineDe = (x, z) => {
      let i = Math.trunc((x - X0) / FIN), j = Math.trunc((z - Z0) / FIN);
      if (i < 0) i = 0; else if (i >= nx2) i = nx2 - 1;
      if (j < 0) j = 0; else if (j >= nz2) j = nz2 - 1;
      return i + j * nx2;
    };
    nav.centreX = c => X0 + (c % nx) * CELLULE + CELLULE / 2;
    nav.centreZ = c => Z0 + ((c / nx) | 0) * CELLULE + CELLULE / 2;
    nav.fineX = f => X0 + (f % nx2) * FIN + FIN / 2;
    nav.fineZ = f => Z0 + ((f / nx2) | 0) * FIN + FIN / 2;
    /** Une case fine est-elle praticable maintenant (mur, ou case de 4 m couverte par un obstacle) ? */
    nav.fineLibre = f => masque2[f] !== 0 && bloque[((f % nx2) >> 1) + (((f / nx2) | 0) >> 1) * nx] === 0;

    /** La case de 4 m praticable la plus proche du point, ou -1 dans un rayon de rmax cases. */
    nav.caseProche = (x, z, rmax = 24) => {
      const c = nav.caseDe(x, z);
      if (libre[c]) return c;
      const ci = c % nx, cj = (c / nx) | 0;
      let meilleure = -1, d2 = Infinity;
      for (let r = 1; r <= rmax; r++) {
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          if (Math.max(di < 0 ? -di : di, dj < 0 ? -dj : dj) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= nx || j >= nz || !libre[i + j * nx]) continue;
          const ex = X0 + i * CELLULE + CELLULE / 2 - x, ez = Z0 + j * CELLULE + CELLULE / 2 - z, d = ex * ex + ez * ez;
          if (d < d2) { d2 = d; meilleure = i + j * nx; }
        }
        // Une case de l'anneau suivant est au moins à (r + 0,5) cases du point.
        const e = (r + 0.5) * CELLULE;
        if (meilleure >= 0 && d2 <= e * e) break;
      }
      return meilleure;
    };
    /** La case fine praticable la plus proche du point, ou -1. */
    nav.fineProche = (x, z, rmax = 12) => {
      const f = nav.fineDe(x, z);
      if (nav.fineLibre(f)) return f;
      const fi = f % nx2, fj = (f / nx2) | 0;
      let meilleure = -1, d2 = Infinity;
      for (let r = 1; r <= rmax; r++) {
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          if (Math.max(di < 0 ? -di : di, dj < 0 ? -dj : dj) !== r) continue;
          const i = fi + di, j = fj + dj;
          if (i < 0 || j < 0 || i >= nx2 || j >= nz2 || !nav.fineLibre(i + j * nx2)) continue;
          const ex = X0 + i * FIN + FIN / 2 - x, ez = Z0 + j * FIN + FIN / 2 - z, d = ex * ex + ez * ez;
          if (d < d2) { d2 = d; meilleure = i + j * nx2; }
        }
        const e = (r + 0.5) * FIN;
        if (meilleure >= 0 && d2 <= e * e) break;
      }
      return meilleure;
    };

    /**
     * Les cases de 4 m que traverse le segment (a → b), sans trou en diagonale (tracé « supercouverture ») ; rend leur
     * nombre, rangé dans sortieCases (Int32Array assez grand : longueur en cases × 2 + 2).
     */
    nav.segment = (xa, za, xb, zb, sortieCases) => {
      const dx = xb - xa, dz = zb - za;
      const pas = Math.max(1, Math.ceil(Math.max(dx < 0 ? -dx : dx, dz < 0 ? -dz : dz) / 500));
      let k = 0, pi = -1, pj = -1;
      for (let s = 0; s <= pas; s++) {
        const x = xa + Math.trunc(dx * s / pas), z = za + Math.trunc(dz * s / pas);
        const c = nav.caseDe(x, z), i = c % nx, j = (c / nx) | 0;
        if (i === pi && j === pj) continue;
        if (pi >= 0 && i !== pi && j !== pj) sortieCases[k++] = i + pj * nx;    // coin : la ligne reste 4-connexe
        sortieCases[k++] = c;
        pi = i; pj = j;
      }
      return k;
    };

    /** Pose (k = 1) ou retire (k = -1) un obstacle dynamique sur des cases ; la version des obstacles change. */
    nav.obstacle = (cases, nombre, k) => {
      for (let q = 0; q < nombre; q++) {
        const c = cases[q];
        bloque[c] = Math.max(0, bloque[c] + k);
        libre[c] = statique[c] && !bloque[c] ? 1 : 0;
      }
      nav.version++;
    };

    // ---- Remplissage en largeur sur la grille fine : les places d'une formation ou d'une sortie de production. ----
    const marque = new Uint32Array(n2), file = new Int32Array(n2);
    let tampon = 1;
    /**
     * Range dans sortieFines jusqu'à max cases fines praticables, de proche en proche à partir du point, et rend leur
     * nombre. accepter(f), facultatif, écarte des cases (sans couper le parcours).
     */
    nav.remplir = (x, z, max, sortieFines, accepter = null) => {
      const depart = nav.fineProche(x, z);
      if (depart < 0 || max <= 0) return 0;
      if (++tampon === 0xFFFFFFFF) { marque.fill(0); tampon = 1; }
      let tete = 0, queue = 0, k = 0;
      file[queue++] = depart; marque[depart] = tampon;
      while (tete < queue && k < max) {
        const f = file[tete++];
        if (!accepter || accepter(f)) sortieFines[k++] = f;
        const i = f % nx2, j = (f / nx2) | 0;
        for (let d = 0; d < 8; d++) {
          const a = i + VOISINS_I[d], b = j + VOISINS_J[d];
          if (a < 0 || b < 0 || a >= nx2 || b >= nz2) continue;
          const v = a + b * nx2;
          if (marque[v] === tampon || !nav.fineLibre(v)) continue;
          if (d >= 4 && (!nav.fineLibre(i + VOISINS_I[d] + j * nx2) || !nav.fineLibre(i + (j + VOISINS_J[d]) * nx2))) continue;
          marque[v] = tampon;
          file[queue++] = v;
        }
      }
      return k;
    };

    // ---- Champs de direction. ----
    const dist = new Uint32Array(n), suivant = new Int32Array(n);
    const FILES = 15;
    const files = Array.from({ length: FILES }, () => new Int32Array(1024)), tailles = new Int32Array(FILES);
    const empiler = (b, c) => {
      if (tailles[b] === files[b].length) { const plus = new Int32Array(files[b].length * 2); plus.set(files[b]); files[b] = plus; }
      files[b][tailles[b]++] = c;
    };
    const VOISIN = [1, -1, nx, -nx, nx + 1, nx - 1, -nx + 1, -nx - 1];
    const COUT = [ORTHO, ORTHO, ORTHO, ORTHO, DIAG, DIAG, DIAG, DIAG];
    const PAS_I = [1, -1, 0, 0, 1, -1, 1, -1], PAS_J = [0, 0, 1, -1, 1, 1, -1, -1];

    /**
     * Calcule le champ vers les sources (cases de 4 m) et l'écrit dans dir (Uint8Array(n)) ; rend le tableau des coûts
     * (tampon interne, valable jusqu'au calcul suivant). Coût : 10 par pas droit, 14 en diagonale.
     */
    nav.calculer = (sources, nombre, dir) => {
      dist.fill(INFINI);
      tailles.fill(0);
      let enAttente = 0;
      for (let q = 0; q < nombre; q++) {
        const s = sources[q];
        if (s < 0 || s >= n || !libre[s] || dist[s] === 0) continue;
        dist[s] = 0; empiler(0, s); enAttente++;
      }
      for (let d = 0; enAttente > 0; d++) {
        const b = d % FILES;
        // Les relâchements vont dans d'autres files (coûts 10 et 14 < 15) : files[b] ne grandit pas pendant la boucle.
        while (tailles[b] > 0) {
          const c = files[b][--tailles[b]];
          enAttente--;
          if (dist[c] !== d) continue;
          for (let k = 0; k < 8; k++) {
            const v = c + VOISIN[k];
            if (!libre[v]) continue;
            if (k >= 4 && (!libre[c + PAS_I[k]] || !libre[c + PAS_J[k] * nx])) continue;
            const nd = d + COUT[k];
            if (nd < dist[v]) { dist[v] = nd; empiler(nd % FILES, v); enAttente++; }
          }
        }
      }
      // Pas suivant de chaque case : le voisin atteignable le moins coûteux (à égalité, le premier dans l'ordre fixe).
      for (let c = 0; c < n; c++) {
        suivant[c] = -1;
        const dc = dist[c];
        if (dc === INFINI || dc === 0) continue;
        let meilleur = -1, md = dc;
        for (let k = 0; k < 8; k++) {
          const v = c + VOISIN[k];
          if (!libre[v] || dist[v] >= md) continue;
          if (k >= 4 && (!libre[c + PAS_I[k]] || !libre[c + PAS_J[k] * nx])) continue;
          md = dist[v]; meilleur = k;
        }
        suivant[c] = meilleur;
      }
      // Direction lissée : la somme des trois pas suivants, tant que le chemin ne tourne pas de plus de 45°.
      for (let c = 0; c < n; c++) {
        const dc = dist[c];
        if (dc === INFINI) { dir[c] = AUCUN; continue; }
        if (dc === 0) { dir[c] = BUT; continue; }
        let k = suivant[c];
        if (k < 0) { dir[c] = AUCUN; continue; }
        let sx = PAS_I[k], sz = PAS_J[k], v = c + VOISIN[k];
        for (let pas = 1; pas < 3; pas++) {
          const k2 = suivant[v];
          if (k2 < 0) break;
          const px = PAS_I[k2], pz = PAS_J[k2];
          if (px * PAS_I[k] + pz * PAS_J[k] <= 0) break;            // virage de 90° ou plus : on s'arrête
          sx += px; sz += pz; v += VOISIN[k2]; k = k2;
        }
        dir[c] = cap(sx, sz) >> 1;
      }
      return dist;
    };

    // ---- Cache des champs : par clé (case du but, ou clé spéciale ≥ n) et par version des obstacles. ----
    const capacite = options.capaciteChamps || 160;
    const champs = [];                     // { cle, dir, version, ref, utilise, pret }
    const parCle = new Map();
    const enCours = [];                    // indices des champs à calculer, dans l'ordre des demandes
    const sourcesTampon = new Int32Array(n);
    let sourcesSpeciales = null;           // (cle, sortie) → nombre de sources, pour les clés ≥ n
    nav.sourcesSpeciales = f => { sourcesSpeciales = f; };
    nav.champs = champs;

    /** Le champ de la clé (créé et mis en attente de calcul s'il n'existe pas) ; rend son indice. iteration : pour l'âge. */
    nav.demander = (cle, iteration) => {
      let k = parCle.get(cle);
      if (k !== undefined) { champs[k].utilise = iteration; return k; }
      if (champs.length < capacite) {
        k = champs.length;
        champs.push({ cle, dir: new Uint8Array(n).fill(AUCUN), version: -1, ref: 0, utilise: iteration, pret: false });
      } else {
        // On recycle le champ libre le plus anciennement servi ; s'il n'y en a pas, le cache grandit.
        k = -1;
        for (let q = 0; q < champs.length; q++) {
          const ch = champs[q];
          if (ch.ref === 0 && (k < 0 || ch.utilise < champs[k].utilise)) k = q;
        }
        if (k < 0) {
          k = champs.length;
          champs.push({ cle, dir: new Uint8Array(n).fill(AUCUN), version: -1, ref: 0, utilise: iteration, pret: false });
        } else {
          const ch = champs[k];
          parCle.delete(ch.cle);
          const p = enCours.indexOf(k);
          if (p >= 0) enCours.splice(p, 1);
          ch.cle = cle; ch.version = -1; ch.ref = 0; ch.utilise = iteration; ch.pret = false;
          ch.dir.fill(AUCUN);
        }
      }
      parCle.set(cle, k);
      enCours.push(k);
      return k;
    };
    nav.prendre = k => { champs[k].ref++; };
    nav.lacher = k => { if (k >= 0 && champs[k].ref > 0) champs[k].ref--; };
    /** Rend la clé d'un but : la case de 4 m praticable la plus proche du point. */
    nav.cleDe = (x, z) => { const c = nav.caseProche(x, z); return c < 0 ? nav.caseDe(x, z) : c; };
    /** Les champs des clés spéciales doivent être recalculés (les structures ont changé). */
    nav.perimerSpeciaux = () => { for (const ch of champs) if (ch.cle >= n) ch.version = -1; };

    function calculerChamp(k) {
      const ch = champs[k];
      let nombre;
      if (ch.cle < n) { sourcesTampon[0] = ch.cle; nombre = 1; } else nombre = sourcesSpeciales ? sourcesSpeciales(ch.cle, sourcesTampon) : 0;
      nav.calculer(sourcesTampon, nombre, ch.dir);
      ch.version = nav.version;
      ch.pret = true;
    }
    /**
     * Calcule au plus budget champs : d'abord ceux qu'on vient de demander, puis ceux que la version des obstacles a
     * périmés et qui servent encore (par nombre d'unités, puis par indice). Rend le nombre de champs calculés.
     */
    nav.avancer = (budget) => {
      let fait = 0;
      while (fait < budget && enCours.length) { calculerChamp(enCours.shift()); fait++; }
      while (fait < budget) {
        let k = -1;
        for (let q = 0; q < champs.length; q++) {
          const ch = champs[q];
          if (ch.ref > 0 && ch.version !== nav.version && (k < 0 || ch.ref > champs[k].ref)) k = q;
        }
        if (k < 0) break;
        calculerChamp(k);
        fait++;
      }
      return fait;
    };
    nav.enAttente = () => enCours.length;

    return nav;
  }

  const VOISINS_I = [1, -1, 0, 0, 1, -1, 1, -1], VOISINS_J = [0, 0, 1, -1, 1, 1, -1, -1];

  PDR.nav = Object.freeze({ creer, cap, DX, DZ, RADIANS, BUT, AUCUN, CELLULE, FIN, ORTHO, DIAG });
})(globalThis.PDR = globalThis.PDR || {});

// Stable FERRO API; legacy namespace remains an alias of the same implementation.
globalThis.FNavigation=globalThis.PDR.nav;
