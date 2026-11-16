/* BITUME — carènes et tubes : volumes courbes et lisses, construits en triangles pour les formes libres du moteur
   (window.FRender.forme). Module pur, sans dépendance au navigateur : il tourne aussi dans Node pour les tests.
   Un triangle s'écrit [p0, p1, p2, n0, n1, n2] : trois sommets puis leurs normales unitaires, tournées vers dehors.
   Repère : x vers l'avant (sens du balayage d'une carène), y vers le haut, z vers la droite. */
(function (B) {
  'use strict';

  const sous = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const plus = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const fois = (a, f) => [a[0] * f, a[1] * f, a[2] * f];
  const scal = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const croix = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const longueur = a => Math.hypot(a[0], a[1], a[2]);
  const unitaire = a => { const l = longueur(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const puiss = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e);

  // Interpolation cubique monotone (Fritsch et Carlson) de valeurs données aux indices 0, 1, … : ni bosse ni creux
  // entre deux sections, la peau passe exactement par chacune.
  function monotone(v) {
    const n = v.length, d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push(v[i + 1] - v[i]);
    if (n === 2) { m[0] = m[1] = d[0]; }
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i]);
    if (n > 2) { m[0] = d[0]; m[n - 1] = d[n - 2]; }
    return t => {
      const i = Math.min(n - 2, Math.max(0, Math.floor(t))), s = t - i, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * v[i] + (s3 - 2 * s2 + s) * m[i] + (-2 * s3 + 3 * s2) * v[i + 1] + (s3 - s2) * m[i + 1];
    };
  }

  // Normales lisses : pour chaque coin, moyenne (pondérée par l'aire) des faces qui partagent ce sommet, soudé à
  // 1e-6 près, sauf celles qui font plus de `vif` degrés avec la face du coin : l'arête reste vive.
  // Entrée : triangles [p0, p1, p2] déjà orientés vers dehors ; les triangles dégénérés sont retirés.
  function lisser(faces, vif = 50) {
    const seuil = Math.cos(vif * Math.PI / 180), cle = p => p.map(v => Math.round(v * 1e6)).join(',');
    const garde = [], normalesFace = [], aires = [], parSommet = new Map();
    for (const f of faces) {
      const c = croix(sous(f[1], f[0]), sous(f[2], f[0])), a = longueur(c);
      if (!(a > 1e-14)) continue;
      const i = garde.length;
      garde.push(f); normalesFace.push(fois(c, 1 / a)); aires.push(a);
      for (const p of f) { const k = cle(p); if (!parSommet.has(k)) parSommet.set(k, []); parSommet.get(k).push(i); }
    }
    return garde.map((f, i) => {
      const nf = normalesFace[i];
      const normales = f.map(p => {
        let s = [0, 0, 0];
        for (const j of parSommet.get(cle(p))) if (scal(normalesFace[j], nf) >= seuil) s = plus(s, fois(normalesFace[j], aires[j]));
        return unitaire(s);
      });
      return [f[0], f[1], f[2], normales[0], normales[1], normales[2]];
    });
  }

  // Oriente un triangle vers dehors : `dedans` est un point intérieur de référence (axe de la section ou du tube).
  function orienter(a, b, c, dedans) {
    const n = croix(sous(b, a), sous(c, a)), centre = fois(plus(plus(a, b), c), 1 / 3);
    return scal(n, sous(centre, dedans)) < 0 ? [a, c, b] : [a, b, c];
  }

  // ------------------------------------------------------------------ carène
  // Peau tendue entre des sections en superellipse, dans l'ordre du balayage. Une section :
  // { x, y0, y1, l, n, z = 0 } — abscisse, bas, haut, demi-largeur, exposant (2 : ellipse ; 4 à 6 : coins ronds).
  // Point d'angle a : z + l·sgn(cos a)·|cos a|^(2/n), (y0 + y1)/2 + (y1 − y0)/2·sgn(sin a)·|sin a|^(2/n).
  // Options : cotes (points par section), pas (subdivisions entre deux sections), bouts (fermer les deux extrémités),
  // ouverture { de, a, angle } : entre les abscisses de et a, le haut reste ouvert sur l'arc `angle` (radians),
  // centré sur le sommet ; interieur : double la peau de l'ouverture vers dedans pour qu'elle se voie de l'intérieur
  // ('tout' : toute la peau) ; vif : angle des arêtes vives, en degrés (50).
  function carene(sections, options = {}) {
    const cotes = options.cotes || 20, pas = options.pas || 4, bouts = options.bouts !== false, ouv = options.ouverture;
    if (!Array.isArray(sections) || sections.length < 2) throw new Error('carene : deux sections au moins');
    const champ = k => monotone(sections.map(s => k === 'z' ? (s.z || 0) : s[k]));
    const X = champ('x'), Y0 = champ('y0'), Y1 = champ('y1'), L = champ('l'), N = champ('n'), Z = champ('z');
    const fin = sections.length - 1;
    // abscisses des anneaux : `pas` par intervalle, plus les bords exacts de l'ouverture
    const ts = [];
    for (let i = 0; i < fin; i++) for (let j = 0; j < pas; j++) ts.push(i + j / pas);
    ts.push(fin);
    let xmin = Infinity, xmax = -Infinity;
    if (ouv) {
      xmin = Math.min(ouv.de, ouv.a); xmax = Math.max(ouv.de, ouv.a);
      for (const cible of [xmin, xmax]) {
        for (let i = 0; i < fin; i++) {
          const a = X(i), b = X(i + 1);
          if ((cible - a) * (cible - b) > 0) continue;
          let lo = i, hi = i + 1;
          for (let k = 0; k < 50; k++) { const mi = (lo + hi) / 2; if ((X(mi) - cible) * (a - cible) > 0) lo = mi; else hi = mi; }
          const t = (lo + hi) / 2;
          if (!ts.some(u => Math.abs(u - t) < 1e-9)) ts.push(t);
          break;
        }
      }
      ts.sort((a, b) => a - b);
    }
    // angles d'un anneau : avec une ouverture, l'arc du haut est découpé à part pour que son bord soit net
    const angles = [];
    if (ouv) {
      const w = ouv.angle / 2, q = Math.max(2, Math.round(cotes * ouv.angle / (2 * Math.PI))), m = cotes - q;
      for (let j = 0; j < m; j++) angles.push(Math.PI / 2 + w + (2 * Math.PI - 2 * w) * j / m);
      for (let j = 0; j < q; j++) angles.push(Math.PI / 2 - w + 2 * w * j / q);
    } else for (let j = 0; j < cotes; j++) angles.push(Math.PI / 2 + 2 * Math.PI * j / cotes);
    const ouvert = j => ouv && j >= angles.length - Math.max(2, Math.round(cotes * ouv.angle / (2 * Math.PI)));
    const anneaux = ts.map(t => {
      const x = X(t), y0 = Y0(t), y1 = Y1(t), l = Math.max(0, L(t)), e = 2 / Math.max(.5, N(t)), z = Z(t);
      const yc = (y0 + y1) / 2, h = Math.max(0, (y1 - y0) / 2);
      return { x, axe: [x, yc, z], points: angles.map(a => [x, yc + h * puiss(Math.sin(a), e), z + l * puiss(Math.cos(a), e)]) };
    });
    const faces = [], doublure = [], dansOuverture = x => x >= xmin - 1e-9 && x <= xmax + 1e-9;
    for (let i = 0; i < anneaux.length - 1; i++) {
      const A = anneaux[i], Bn = anneaux[i + 1], dedans = fois(plus(A.axe, Bn.axe), .5);
      const trou = ouv && dansOuverture(A.x) && dansOuverture(Bn.x);
      for (let j = 0; j < angles.length; j++) {
        const k = (j + 1) % angles.length;
        if (trou && ouvert(j)) continue;
        const t1 = orienter(A.points[j], A.points[k], Bn.points[k], dedans), t2 = orienter(A.points[j], Bn.points[k], Bn.points[j], dedans);
        faces.push(t1, t2);
        if (options.interieur === 'tout' || (options.interieur && trou)) doublure.push([t1[0], t1[2], t1[1]], [t2[0], t2[2], t2[1]]);
      }
    }
    // carene-2 : par l'ouverture on voit aussi l'envers de la peau au-delà des bords, éliminé en simple face ;
    // deux cloisons en éventail sur les anneaux de xmin et xmax, tournées vers l'ouverture, bouchent la cavité
    if (ouv && options.interieur && options.interieur !== 'tout') {
      for (const [cible, sens] of [[xmax, 1], [xmin, -1]]) {
        const A = anneaux.find(a => Math.abs(a.x - cible) < 1e-9);
        if (!A) continue;
        const c = A.axe, dedans = [c[0] + sens, c[1], c[2]];
        for (let j = 0; j < angles.length; j++) doublure.push(orienter(c, A.points[j], A.points[(j + 1) % angles.length], dedans));
      }
    }
    if (bouts) for (const [A, sens] of [[anneaux[0], Math.sign(anneaux[0].x - anneaux[1].x) || -1], [anneaux[anneaux.length - 1], Math.sign(anneaux[anneaux.length - 1].x - anneaux[anneaux.length - 2].x) || 1]]) {
      const c = A.axe, dedans = [c[0] - sens, c[1], c[2]];
      for (let j = 0; j < angles.length; j++) faces.push(orienter(c, A.points[j], A.points[(j + 1) % angles.length], dedans));
    }
    return lisser(faces, options.vif).concat(lisser(doublure, options.vif));
  }

  // Profil d'une carène : rend x → section interpolée { x, y0, y1, l, n, z } (la même que celle de la peau), pour poser
  // un filet, un numéro ou un jonc sur la surface. Hors des sections, la section du bout le plus proche.
  function profil(sections) {
    const champ = k => monotone(sections.map(s => k === 'z' ? (s.z || 0) : s[k]));
    const X = champ('x'), Y0 = champ('y0'), Y1 = champ('y1'), L = champ('l'), N = champ('n'), Z = champ('z'), fin = sections.length - 1;
    const sens = Math.sign(X(fin) - X(0)) || 1;
    return x => {
      let lo = 0, hi = fin;
      if ((x - X(0)) * sens <= 0) hi = 0; else if ((x - X(fin)) * sens >= 0) lo = fin;
      else for (let k = 0; k < 60; k++) { const mi = (lo + hi) / 2; if ((X(mi) - x) * sens < 0) lo = mi; else hi = mi; }
      const t = (lo + hi) / 2;
      return { x: X(t), y0: Y0(t), y1: Y1(t), l: Math.max(0, L(t)), n: N(t), z: Z(t) };
    };
  }
  // Point d'angle a d'une section (a = π/2 : le sommet ; a = 0 : le flanc droit).
  function pointSection(s, a) {
    const e = 2 / Math.max(.5, s.n), h = Math.max(0, (s.y1 - s.y0) / 2);
    return [s.x, (s.y0 + s.y1) / 2 + h * puiss(Math.sin(a), e), (s.z || 0) + s.l * puiss(Math.cos(a), e)];
  }

  // ------------------------------------------------------------------ tube
  // Cercle balayé le long d'une ligne brisée lissée (Catmull-Rom), rayon donné à chaque point (un nombre : rayon
  // constant), bouts en demi-sphère. Le repère du cercle suit la ligne sans vriller (transport parallèle).
  // Options : cotes, pas (subdivisions entre deux points), bouts (false : bouts ouverts), ferme (boucle fermée).
  function tube(points, rayons, options = {}) {
    const cotes = options.cotes || 10, ferme = !!options.ferme, pas = options.pas || (points.length > 2 ? 4 : 1);
    const bouts = options.bouts !== false && !ferme;
    const rs = typeof rayons === 'number' ? points.map(() => rayons) : rayons;
    const n = points.length, P = i => ferme ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))];
    const R = i => ferme ? rs[(i + n) % n] : rs[Math.max(0, Math.min(n - 1, i))];
    // échantillons de la ligne lissée
    const ligne = [], ray = [], segs = ferme ? n : n - 1;
    for (let i = 0; i < segs; i++) for (let j = 0; j < pas; j++) {
      const s = j / pas, p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), s2 = s * s, s3 = s2 * s;
      ligne.push([0, 1, 2].map(k => .5 * (2 * p1[k] + (-p0[k] + p2[k]) * s + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * s2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * s3)));
      ray.push(R(i) + (R(i + 1) - R(i)) * s);
    }
    if (!ferme) { ligne.push(points[n - 1]); ray.push(rs[n - 1]); }
    const m = ligne.length, T = [];
    for (let i = 0; i < m; i++) {
      const a = ferme ? ligne[(i - 1 + m) % m] : ligne[Math.max(0, i - 1)], b = ferme ? ligne[(i + 1) % m] : ligne[Math.min(m - 1, i + 1)];
      T.push(unitaire(sous(b, a)));
    }
    // transport parallèle du premier repère
    let u = Math.abs(T[0][1]) < .9 ? unitaire(croix(T[0], [0, 1, 0])) : unitaire(croix(T[0], [1, 0, 0]));
    const U = [u];
    for (let i = 1; i < m; i++) { u = unitaire(sous(u, fois(T[i], scal(u, T[i])))); U.push(u); }
    if (ferme) {
      // répartir l'écart de torsion de la boucle sur tout le tour
      const uf = unitaire(sous(U[m - 1], fois(T[0], scal(U[m - 1], T[0])))), v0 = croix(T[0], U[0]);
      const ecart = Math.atan2(scal(uf, v0), scal(uf, U[0]));
      for (let i = 0; i < m; i++) {
        const a = -ecart * i / m, v = croix(T[i], U[i]);
        U[i] = plus(fois(U[i], Math.cos(a)), fois(v, Math.sin(a)));
      }
    }
    const cercle = (i, r) => { const v = croix(T[i], U[i]); return Array.from({ length: cotes }, (_, j) => { const a = 2 * Math.PI * j / cotes; return plus(ligne[i], plus(fois(U[i], r * Math.cos(a)), fois(v, r * Math.sin(a)))); }); };
    const anneaux = ligne.map((_, i) => cercle(i, ray[i]));
    const faces = [];
    for (let i = 0; i < (ferme ? m : m - 1); i++) {
      const i2 = (i + 1) % m, A = anneaux[i], Bn = anneaux[i2], dedans = fois(plus(ligne[i], ligne[i2]), .5);
      for (let j = 0; j < cotes; j++) {
        const k = (j + 1) % cotes;
        faces.push(orienter(A[j], A[k], Bn[k], dedans), orienter(A[j], Bn[k], Bn[j], dedans));
      }
    }
    if (bouts) for (const [i, sens] of [[0, -1], [m - 1, 1]]) {
      // demi-sphère : anneaux de latitude du bord du tube jusqu'au pôle
      const c = ligne[i], t = fois(T[i], sens), r = ray[i], lat = Math.max(2, Math.round(cotes / 4));
      const v = croix(T[i], U[i]);
      let avant = anneaux[i];
      for (let q = 1; q <= lat; q++) {
        const b = q / lat * Math.PI / 2, rr = r * Math.cos(b), h = r * Math.sin(b);
        const ici = q === lat ? null : Array.from({ length: cotes }, (_, j) => { const a = 2 * Math.PI * j / cotes; return plus(c, plus(fois(t, h), plus(fois(U[i], rr * Math.cos(a)), fois(v, rr * Math.sin(a))))); });
        const pole = plus(c, fois(t, r));
        for (let j = 0; j < cotes; j++) {
          const k = (j + 1) % cotes;
          if (ici) faces.push(orienter(avant[j], avant[k], ici[k], c), orienter(avant[j], ici[k], ici[j], c));
          else faces.push(orienter(avant[j], avant[k], pole, c));
        }
        avant = ici;
      }
    }
    // peu de côtés : deux faces voisines du tour dépassent le vif de 50° et chaque génératrice resterait vive ;
    // on adapte le seuil pour que le cercle balayé reste lisse (75° pour 6 côtés)
    return lisser(faces, options.vif ?? Math.max(50, 360 / cotes + 15));
  }

  // ------------------------------------------------------------------ outils
  // Boîte englobante de triangles.
  function boite(triangles) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const t of triangles) for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], t[i][k]); hi[k] = Math.max(hi[k], t[i][k]); }
    return { lo, hi };
  }
  // Ramène des triangles dans le cube unité (−0,5 à 0,5) : rend { triangles, centre, taille }. L'instance se pose avec
  // p = centre (dans le repère de construction) et s = taille. Les normales sont multipliées par la taille puis
  // renormalisées (inverse transposée de la mise à l'échelle) : le nuanceur, qui les divise par s, retrouve celles du
  // volume à sa vraie taille.
  function normaliser(triangles) {
    const { lo, hi } = boite(triangles), centre = [0, 1, 2].map(k => (lo[k] + hi[k]) / 2), taille = [0, 1, 2].map(k => Math.max(1e-4, hi[k] - lo[k]));
    const p = q => [0, 1, 2].map(k => (q[k] - centre[k]) / taille[k]), n = q => unitaire([0, 1, 2].map(k => q[k] * taille[k]));
    return { triangles: triangles.map(t => [p(t[0]), p(t[1]), p(t[2]), n(t[3]), n(t[4]), n(t[5])]), centre, taille };
  }
  // Applique une rotation (matrice 3×3 orthonormée en colonnes m), puis une translation o, à des triangles.
  function transformer(triangles, m, o = [0, 0, 0]) {
    const mul = v => [m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2], m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2], m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2]];
    return triangles.map(t => [plus(mul(t[0]), o), plus(mul(t[1]), o), plus(mul(t[2]), o), unitaire(mul(t[3])), unitaire(mul(t[4])), unitaire(mul(t[5]))]);
  }
  // Miroir gauche-droite (z → −z) : sommets et normales ; l'ordre des sommets est inversé pour garder l'orientation.
  function miroir(triangles) {
    const z = v => [v[0], v[1], -v[2]];
    return triangles.map(t => [z(t[0]), z(t[2]), z(t[1]), z(t[3]), z(t[5]), z(t[4])]);
  }

  B.carene = { carene, tube, normaliser, lisser, boite, transformer, miroir, monotone, profil, pointSection };
})(globalThis.BITUME = globalThis.BITUME || {});

// Stable FERRO API; legacy namespace remains an alias of the same implementation.
globalThis.FGeometry=globalThis.BITUME.carene;
