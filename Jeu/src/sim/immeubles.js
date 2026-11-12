/* Point de rupture — immeubles de la simulation (CONCEPTION.md §4). Logique pure sur tableaux typés, sans DOM,
   déterministe : ni Math.random, ni Date.now, parcours dans l’ordre des indices. Les nombres viennent de
   PDR.regles.CONSTANTES.IMMEUBLES, lu à l’appel de creer (pas au chargement). */
(function (PDR) {
  'use strict';

  const TAILLE = 16;
  const MARGE = 20;

  // Distance d’un point à une boîte orientée (rectangle |u|≤dlx, |v|≤dlz dans le repère de la boîte).
  function distBoite(cx, cz, dlx, dlz, cos, sin, px, pz) {
    const dx = px - cx, dz = pz - cz;
    const u = dx * cos + dz * sin;
    const v = -dx * sin + dz * cos;
    const du = Math.abs(u) - dlx;
    const dv = Math.abs(v) - dlz;
    if (du <= 0 && dv <= 0) return 0;
    const eu = du > 0 ? du : 0;
    const ev = dv > 0 ? dv : 0;
    return Math.sqrt(eu * eu + ev * ev);
  }

  // Les 5 points d’une boîte (4 coins + centre) dans le repère monde.
  function pointsBoite(cx, cz, dlx, dlz, cos, sin, pts, off) {
    pts[off] = cx + dlx * cos - dlz * sin; pts[off + 1] = cz + dlx * sin + dlz * cos;
    pts[off + 2] = cx + dlx * cos + dlz * sin; pts[off + 3] = cz + dlx * sin - dlz * cos;
    pts[off + 4] = cx - dlx * cos - dlz * sin; pts[off + 5] = cz - dlx * sin + dlz * cos;
    pts[off + 6] = cx - dlx * cos + dlz * sin; pts[off + 7] = cz - dlx * sin - dlz * cos;
    pts[off + 8] = cx; pts[off + 9] = cz;
  }

  // Vrai si la distance approchée entre deux boîtes est < seuil.
  function boitesProches(B, i1, i2, seuil) {
    const pts = boitesProches._pts;
    const c1 = i1 * 6, c2 = i2 * 6;
    pointsBoite(B[c1], B[c1 + 1], B[c1 + 2], B[c1 + 3], B[c1 + 4], B[c1 + 5], pts, 0);
    pointsBoite(B[c2], B[c2 + 1], B[c2 + 2], B[c2 + 3], B[c2 + 4], B[c2 + 5], pts, 10);
    // Coins/centre de boîte 1 vers boîte 2
    for (let p = 0; p < 10; p += 2) {
      if (distBoite(B[c2], B[c2 + 1], B[c2 + 2], B[c2 + 3], B[c2 + 4], B[c2 + 5],
        pts[p], pts[p + 1]) < seuil) return true;
    }
    // Coins/centre de boîte 2 vers boîte 1
    for (let p = 10; p < 20; p += 2) {
      if (distBoite(B[c1], B[c1 + 1], B[c1 + 2], B[c1 + 3], B[c1 + 4], B[c1 + 5],
        pts[p], pts[p + 1]) < seuil) return true;
    }
    return false;
  }
  boitesProches._pts = new Float64Array(20);

  function creer(liste) {
    const R = PDR.regles.CONSTANTES.IMMEUBLES;
    const n = liste.length;
    const I = { n: n, enFeu: 0 };
    I.id = new Int32Array(n);
    I.x = new Float32Array(n);
    I.z = new Float32Array(n);
    I.rayon = new Float32Array(n);
    I.chaleur = new Float32Array(n);
    I.intensite = new Float32Array(n);
    I.avancee = new Float32Array(n);
    I.fumee = new Float32Array(n);
    I.etat = new Uint8Array(n);
    I.origine = new Int8Array(n).fill(-1);
    I.chauffe = new Uint8Array(n);
    // Boîtes à plat : cx, cz, demi-lx, demi-lz, cos, sin (6 par boîte)
    let nb = 0;
    for (let k = 0; k < n; k++) nb += liste[k].boites.length;
    I.B = new Float32Array(nb * 6);
    I.debutB = new Uint32Array(n + 1);
    let off = 0;
    for (let k = 0; k < n; k++) {
      I.debutB[k] = off;
      I.id[k] = liste[k].id;
      I.x[k] = liste[k].x;
      I.z[k] = liste[k].z;
      I.rayon[k] = liste[k].rayon;
      const boites = liste[k].boites;
      for (let b = 0; b < boites.length; b++) {
        const bo = boites[b];
        const c = Math.cos(bo.lacet), s = Math.sin(bo.lacet);
        const o6 = off * 6;
        I.B[o6] = bo.x; I.B[o6 + 1] = bo.z;
        I.B[o6 + 2] = bo.lx * 0.5; I.B[o6 + 3] = bo.lz * 0.5;
        I.B[o6 + 4] = c; I.B[o6 + 5] = s;
        off++;
      }
    }
    I.debutB[n] = off;
    // AABB de chaque immeuble (pour la grille et brulants)
    const aMinX = new Float32Array(n), aMaxX = new Float32Array(n);
    const aMinZ = new Float32Array(n), aMaxZ = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (let b = I.debutB[k]; b < I.debutB[k + 1]; b++) {
        const o6 = b * 6;
        const cx = I.B[o6], cz = I.B[o6 + 1];
        const dlx = I.B[o6 + 2], dlz = I.B[o6 + 3];
        const c = I.B[o6 + 4], s = I.B[o6 + 5];
        const ex = dlx * Math.abs(c) + dlz * Math.abs(s);
        const ez = dlx * Math.abs(s) + dlz * Math.abs(c);
        if (cx - ex < mnx) mnx = cx - ex;
        if (cx + ex > mxx) mxx = cx + ex;
        if (cz - ez < mnz) mnz = cz - ez;
        if (cz + ez > mxz) mxz = cz + ez;
      }
      aMinX[k] = mnx; aMaxX[k] = mxx;
      aMinZ[k] = mnz; aMaxZ[k] = mxz;
    }
    // Grille de cases TAILLE m sur l’emprise élargie de MARGE
    let gMinX = Infinity, gMaxX = -Infinity, gMinZ = Infinity, gMaxZ = -Infinity;
    for (let k = 0; k < n; k++) {
      if (aMinX[k] < gMinX) gMinX = aMinX[k];
      if (aMaxX[k] > gMaxX) gMaxX = aMaxX[k];
      if (aMinZ[k] < gMinZ) gMinZ = aMinZ[k];
      if (aMaxZ[k] > gMaxZ) gMaxZ = aMaxZ[k];
    }
    if (n === 0) { gMinX = 0; gMaxX = 0; gMinZ = 0; gMaxZ = 0; }
    gMinX -= MARGE; gMaxX += MARGE; gMinZ -= MARGE; gMaxZ += MARGE;
    I.gx0 = Math.floor(gMinX / TAILLE);
    I.gz0 = Math.floor(gMinZ / TAILLE);
    I.gnx = Math.floor(gMaxX / TAILLE) - I.gx0 + 1;
    I.gnz = Math.floor(gMaxZ / TAILLE) - I.gz0 + 1;
    if (I.gnx < 1) I.gnx = 1;
    if (I.gnz < 1) I.gnz = 1;
    const ncell = I.gnx * I.gnz;
    // Compter les présences par case
    const compte = new Uint32Array(ncell);
    for (let k = 0; k < n; k++) {
      const rx = aMinX[k] - R.recul, Rx = aMaxX[k] + R.recul;
      const rz = aMinZ[k] - R.recul, Rz = aMaxZ[k] + R.recul;
      const gx1 = Math.max(0, Math.floor(rx / TAILLE) - I.gx0);
      const gx2 = Math.min(I.gnx - 1, Math.floor(Rx / TAILLE) - I.gx0);
      const gz1 = Math.max(0, Math.floor(rz / TAILLE) - I.gz0);
      const gz2 = Math.min(I.gnz - 1, Math.floor(Rz / TAILLE) - I.gz0);
      for (let gz = gz1; gz <= gz2; gz++) {
        for (let gx = gx1; gx <= gx2; gx++) {
          compte[gz * I.gnx + gx]++;
        }
      }
    }
    I.debutG = new Uint32Array(ncell + 1);
    for (let c = 0; c < ncell; c++) I.debutG[c + 1] = I.debutG[c] + compte[c];
    I.G = new Uint32Array(I.debutG[ncell]);
    const pos = new Uint32Array(ncell);
    for (let k = 0; k < n; k++) {
      const rx = aMinX[k] - R.recul, Rx = aMaxX[k] + R.recul;
      const rz = aMinZ[k] - R.recul, Rz = aMaxZ[k] + R.recul;
      const gx1 = Math.max(0, Math.floor(rx / TAILLE) - I.gx0);
      const gx2 = Math.min(I.gnx - 1, Math.floor(Rx / TAILLE) - I.gx0);
      const gz1 = Math.max(0, Math.floor(rz / TAILLE) - I.gz0);
      const gz2 = Math.min(I.gnz - 1, Math.floor(Rz / TAILLE) - I.gz0);
      for (let gz = gz1; gz <= gz2; gz++) {
        for (let gx = gx1; gx <= gx2; gx++) {
          const c = gz * I.gnx + gx;
          I.G[I.debutG[c] + pos[c]] = k;
          pos[c]++;
        }
      }
    }
    I.brulants = new Uint16Array(ncell);
    // Voisins : pairs détectés via la grille
    const paires = new Set();
    for (let c = 0; c < ncell; c++) {
      const d = I.debutG[c], f = I.debutG[c + 1];
      for (let a = d; a < f; a++) {
        for (let b = a + 1; b < f; b++) {
          const j = I.G[a], k = I.G[b];
          if (j === k) continue;
          const cle = j < k ? j * n + k : k * n + j;
          if (paires.has(cle)) continue;
          // Vérifier si une boîte de j est à moins de R.voisinage d’une boîte de k
          let proche = false;
          for (let bi = I.debutB[j]; bi < I.debutB[j + 1] && !proche; bi++) {
            for (let bk = I.debutB[k]; bk < I.debutB[k + 1]; bk++) {
              if (boitesProches(I.B, bi, bk, R.voisinage)) { proche = true; break; }
            }
          }
          if (proche) paires.add(cle);
        }
      }
    }
    // Construire les listes compactes de voisins
    const nbVoisins = new Uint32Array(n);
    paires.forEach(function (cle) {
      const j = Math.floor(cle / n), k = cle % n;
      nbVoisins[j]++; nbVoisins[k]++;
    });
    I.debutV = new Uint32Array(n + 1);
    for (let k = 0; k < n; k++) I.debutV[k + 1] = I.debutV[k] + nbVoisins[k];
    I.V = new Uint32Array(I.debutV[n]);
    const vpos = new Uint32Array(n);
    paires.forEach(function (cle) {
      const j = Math.floor(cle / n), k = cle % n;
      I.V[I.debutV[j] + vpos[j]] = k; vpos[j]++;
      I.V[I.debutV[k] + vpos[k]] = j; vpos[k]++;
    });
    // Trier chaque liste de voisins par indice croissant (tri par insertion, listes courtes)
    for (let k = 0; k < n; k++) {
      const d = I.debutV[k], f = I.debutV[k + 1];
      for (let a = d + 1; a < f; a++) {
        const val = I.V[a];
        let b = a - 1;
        while (b >= d && I.V[b] > val) { I.V[b + 1] = I.V[b]; b--; }
        I.V[b + 1] = val;
      }
    }
    // Stocker les AABB pour retrouver les cases d’un immeuble
    I._aMinX = aMinX; I._aMaxX = aMaxX;
    I._aMinZ = aMinZ; I._aMaxZ = aMaxZ;
    return I;
  }

  // Plus petite distance du point (x, z) aux boîtes de l’immeuble k (0 si dedans).
  function distFacade(I, k, x, z) {
    let min = Infinity;
    for (let b = I.debutB[k]; b < I.debutB[k + 1]; b++) {
      const o6 = b * 6;
      const d = distBoite(I.B[o6], I.B[o6 + 1], I.B[o6 + 2], I.B[o6 + 3],
        I.B[o6 + 4], I.B[o6 + 5], x, z);
      if (d < min) min = d;
    }
    return min;
  }

  // Chauffer les immeubles de la case de (x, z) dont la façade est à ≤ R.chauffe.
  function chauffer(I, x, z, force, dt, camp, evts) {
    const R = PDR.regles.CONSTANTES.IMMEUBLES;
    const gx = Math.floor(x / TAILLE) - I.gx0;
    const gz = Math.floor(z / TAILLE) - I.gz0;
    if (gx < 0 || gx >= I.gnx || gz < 0 || gz >= I.gnz) return;
    const c = gz * I.gnx + gx;
    for (let i = I.debutG[c]; i < I.debutG[c + 1]; i++) {
      const k = I.G[i];
      if (I.etat[k] !== 0 && I.etat[k] !== 2) continue;
      if (distFacade(I, k, x, z) > R.chauffe) continue;
      I.chaleur[k] += force * dt;
      I.chauffe[k] = 1;
      if (I.chaleur[k] >= R.prise) allumer(I, k, camp, evts);
    }
  }

  // Allumer l’immeuble k. Rien si déjà en feu ou calciné.
  function allumer(I, k, camp, evts) {
    const R = PDR.regles.CONSTANTES.IMMEUBLES;
    if (I.etat[k] === 1 || I.etat[k] === 3) return;
    if (I.enFeu >= R.max) { I.chaleur[k] = R.prise; return; }
    I.etat[k] = 1;
    I.intensite[k] = 0.05;
    I.origine[k] = camp;
    I.enFeu++;
    // Incrémenter brulants sur les cases de k
    const gx1 = Math.max(0, Math.floor((I._aMinX[k] - R.recul) / TAILLE) - I.gx0);
    const gx2 = Math.min(I.gnx - 1, Math.floor((I._aMaxX[k] + R.recul) / TAILLE) - I.gx0);
    const gz1 = Math.max(0, Math.floor((I._aMinZ[k] - R.recul) / TAILLE) - I.gz0);
    const gz2 = Math.min(I.gnz - 1, Math.floor((I._aMaxZ[k] + R.recul) / TAILLE) - I.gz0);
    for (let gz = gz1; gz <= gz2; gz++) {
      for (let gx = gx1; gx <= gx2; gx++) {
        I.brulants[gz * I.gnx + gx]++;
      }
    }
    evts.push({ type: 38, a: I.id[k], b: camp });
  }

  // Cocktail Molotov : allumer l’immeuble le plus proche si tirage % 3 === 0.
  function cocktail(I, x, z, camp, tirage, evts) {
    const R = PDR.regles.CONSTANTES.IMMEUBLES;
    const gx = Math.floor(x / TAILLE) - I.gx0;
    const gz = Math.floor(z / TAILLE) - I.gz0;
    if (gx < 0 || gx >= I.gnx || gz < 0 || gz >= I.gnz) return false;
    const c = gz * I.gnx + gx;
    let meilleur = -1, dMin = R.cocktail + 1;
    for (let i = I.debutG[c]; i < I.debutG[c + 1]; i++) {
      const k = I.G[i];
      if (I.etat[k] !== 0 && I.etat[k] !== 2) continue;
      const d = distFacade(I, k, x, z);
      if (d <= R.cocktail && d < dMin) { dMin = d; meilleur = k; }
    }
    if (meilleur < 0) return false;
    if (tirage % 3 === 0) allumer(I, meilleur, camp, evts);
    return I.etat[meilleur] === 1;
  }

  // Avancer la simulation d’un pas dt.
  function avancer(I, dt, evts) {
    const R = PDR.regles.CONSTANTES.IMMEUBLES;
    const n = I.n;
    for (let k = 0; k < n; k++) {
      const e = I.etat[k];
      if (e === 1) {
        I.intensite[k] = Math.min(1, I.intensite[k] + dt / R.montee);
        if (I.intensite[k] >= 1) {
          I.avancee[k] += dt / R.consume;
          if (I.avancee[k] >= 1) {
            I.etat[k] = 3;
            I.intensite[k] = 0;
            I.fumee[k] = R.fumee;
            I.enFeu--;
            // Décrémenter brulants
            const gx1 = Math.max(0,
              Math.floor((I._aMinX[k] - R.recul) / TAILLE) - I.gx0);
            const gx2 = Math.min(I.gnx - 1,
              Math.floor((I._aMaxX[k] + R.recul) / TAILLE) - I.gx0);
            const gz1 = Math.max(0,
              Math.floor((I._aMinZ[k] - R.recul) / TAILLE) - I.gz0);
            const gz2 = Math.min(I.gnz - 1,
              Math.floor((I._aMaxZ[k] + R.recul) / TAILLE) - I.gz0);
            for (let gz = gz1; gz <= gz2; gz++) {
              for (let gx = gx1; gx <= gx2; gx++) {
                I.brulants[gz * I.gnx + gx]--;
              }
            }
            evts.push({ type: 39, a: I.id[k], b: 1 });
          }
        }
        // Propagation aux voisins
        if (I.etat[k] === 1 && I.intensite[k] > R.propage) {
          const apport = dt * R.prise / R.voisinPrise;
          for (let v = I.debutV[k]; v < I.debutV[k + 1]; v++) {
            const j = I.V[v];
            if (I.etat[j] !== 0 && I.etat[j] !== 2) continue;
            I.chaleur[j] += apport;
            I.chauffe[j] = 1;
            if (I.chaleur[j] >= R.prise) allumer(I, j, I.origine[k], evts);
          }
        }
      } else if (e === 0 || e === 2) {
        if (I.chauffe[k] === 0) {
          I.chaleur[k] = Math.max(0, I.chaleur[k] - R.refroidit * dt);
        }
      } else if (e === 3) {
        I.fumee[k] = Math.max(0, I.fumee[k] - dt);
      }
    }
    // Réinitialiser chauffe
    I.chauffe.fill(0);
  }

  PDR.immeubles = Object.freeze({ creer, distFacade, chauffer, allumer, cocktail, avancer });
})(globalThis.PDR = globalThis.PDR || {});
