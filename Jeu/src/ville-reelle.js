/* Point de rupture — la ville réelle : le plan d'une vraie ville, tiré d'OpenStreetMap (src/villes/<ville>.js,
   PDR.plans.<ville>), mis en scène pour le jeu avec la même interface que la ville en damier (src/ville.js).
   © les contributeurs d'OpenStreetMap — données sous licence ODbL (https://www.openstreetmap.org/copyright) · tuiles
   OpenFreeMap, schéma OpenMapTiles. La mention (ville.attribution) doit rester visible quand on joue dans la ville.

   PDR.villeReelle.creerVille(nom = 'marseille', { ilots = 9 }) → la ville ; ilots : 9, 13 ou 15 (PDR.regles.ilots),
   qui choisit le carré de jeu du plan (660, 950 ou 1 100 m de côté, centré sur le coin nord-est du Vieux-Port).
   PDR.villeReelle.villes() → les villes réelles chargées et aménagées (['marseille']).
   Charger d'abord src/villes/<ville>.js ; sim/regles.js et ville.js sont facultatifs (FACTIONS, CASSABLES, STOCK).

   La ville rend tout ce que rend la ville en damier :
     type: 'reelle', nom, ilots, N (= ilots), attribution, etendue { x0, z0, x1, z1 } (le carré de jeu)
     objets      pièces FERRO du décor { shape, p, s, r, mat, color, outdoor, surface }, r = [x, y, z] (Rz · Ry · Rx)
     MAT, FACTIONS [{ nom, court, couleur, qg: [x, z] }], barricades: [], hasard(graine)
     sites       { qg ×3, lieux 7/9/11, gisements, cassables } — même forme que ville.js (CONCEPTION.md §3.1)
     sol(x, z) → 0 (la ville est plate) ; praticable(x, z), surChaussee(x, z), accrocher(x, z) → [x, z]
     pointAuHasard(rd, x, z, rayon), departs(faction, n, graine), itineraire(x0, z0, x1, z1), carrefours(rd, n)
     place [x, z] : le quai des Belges
   et, en plus :
     grillePraticable(cellule = 4) → { nx, nz, x0, z0, cellule, cases, chaussee } : Uint8Array, 1 si le centre de
       la case est praticable (cases), sur une chaussée (chaussee)
     rues      { noeuds: [[x, z]], aretes: [{ a, b, largeur, sorte, nom, points: [x, z, …] }] }   le graphe des voies
     eau       [Float32Array]   anneaux des plans d'eau (le Vieux-Port ; les bassins de moins de 400 m² sont des vasques)
     places    [{ nom, sorte, polygone }]   parcs [{ nom, sorte, polygone }]
     emprises  [{ x, z, lx, lz, lacet, h }]   boîtes des bâtiments qui bloquent (après élargissement des ruelles)
     mesures   { ms, comptes }   temps de construction (hors déterminisme) et comptes

   Praticable : chaussées, trottoirs, places, quais, parcs, escaliers ; ni bâtiment, ni cour fermée, ni eau, ni
   ponton. Les ruelles de moins de 9 m de façade à façade sont élargies : les boîtes des bâtiments sont retaillées
   à 4,5 m de l'axe de la voie, et le dessin suit. Puis une ouverture de 4 m retire les passages trop étroits, et
   l'on garde la plus grande pièce telle que la grille de navigation de 4 m la voit (sim/nav.js : une case est libre
   si ses quatre points de 2 m le sont) : la ville praticable est d'un seul tenant pour la simulation.

   Tout est déterministe, sans Math.sin, Math.cos, Math.atan2 ni Math.hypot : les mêmes octets dans la page, le
   travailleur et Node. Unités : le mètre ; x vers l'est, z vers le sud, y vers le haut. */
(function (PDR) {
  'use strict';
  // Les globales des boucles, lues une fois : dans un contexte vm de Node (les vérifications), chaque lecture d'une
  // globale passe par un intercepteur et coûte cent fois plus cher que celle d'une variable.
  const { Math, Infinity, Uint8Array, Int32Array, Float32Array, Float64Array, Map, Set } = globalThis;

  // ---- Trigonométrie sans Math.sin, Math.cos ni Math.atan2 : mêmes octets dans la page, le travailleur et Node. ----
  const PI = Math.PI, DEUX_PI = 2 * Math.PI, DEMI_PI = Math.PI / 2, RAC3 = Math.sqrt(3), TAN15 = 2 - Math.sqrt(3);
  /** sin(a) par la série de Taylor après réduction à [-π/2, π/2] (écart < 1e-11). */
  function sinus(a) {
    a -= DEUX_PI * Math.round(a / DEUX_PI);
    if (a > DEMI_PI) a = PI - a; else if (a < -DEMI_PI) a = -PI - a;
    const c = a * a;
    return a * (1 - c / 6 * (1 - c / 20 * (1 - c / 42 * (1 - c / 72 * (1 - c / 110 * (1 - c / 156 * (1 - c / 210)))))));
  }
  const cosinus = a => sinus(a + DEMI_PI);
  /** atan2(y, x) : réduction à [0, tan 15°], puis la série de l'arc tangente (écart < 1e-12). */
  function angle(y, x) {
    const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
    if (ax === 0 && ay === 0) return 0;
    let t = ax >= ay ? ay / ax : ax / ay, d = 0;
    if (t > TAN15) { t = (t * RAC3 - 1) / (t + RAC3); d = PI / 6; }
    const c = t * t;
    let s = d + t * (1 - c * (1 / 3 - c * (1 / 5 - c * (1 / 7 - c * (1 / 9 - c * (1 / 11 - c * (1 / 13 - c * (1 / 15 - c / 17))))))));
    if (ay > ax) s = DEMI_PI - s;
    if (x < 0) s = PI - s;
    return y < 0 ? -s : s;
  }
  /** Lacet du moteur (rotation Ry) qui couche l'axe x local d'une pièce sur la direction (ux, uz) du sol. */
  const lacetDe = (ux, uz) => angle(-uz, ux);
  const longueur = (x, z) => Math.sqrt(x * x + z * z);
  const borner = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /** Hasard rapide et reproductible (mulberry32), le même que celui de la ville en damier. */
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
  /** Un nombre de [0, 1) tiré de deux entiers, toujours le même : la variété d'un bâtiment ne dépend que de lui. */
  function hacher(a, b = 0) {
    let t = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA77)) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x2C1B3C6D);
    t = Math.imul(t ^ (t >>> 12), 0x297A2D39);
    t ^= t >>> 15;
    return (t >>> 0) / 4294967296;
  }
  const nuance = (r, c, e) => c.map(v => borner(v + r.entre(-e, e), 0, 1));
  const fois = (c, k) => c.map(v => borner(v * k, 0, 1));

  // ---- Polygones : tableaux plats [x0, z0, x1, z1, …], anneau fermé implicitement. ----
  function aire(p) {
    let A = 0;
    const n = p.length;
    for (let i = 0; i < n; i += 2) {
      const j = i + 2 < n ? i + 2 : 0;
      A += p[i] * p[j + 1] - p[j] * p[i + 1];
    }
    return A / 2;
  }
  function dansAnneau(p, x, z) {
    let dedans = false;
    const n = p.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const zi = p[i + 1], zj = p[j + 1];
      if ((zi > z) !== (zj > z) && x < p[i] + (z - zi) * (p[j] - p[i]) / (zj - zi)) dedans = !dedans;
    }
    return dedans;
  }
  function centre(p) {
    let x = 0, z = 0;
    const n = p.length / 2;
    for (let k = 0; k < p.length; k += 2) { x += p[k]; z += p[k + 1]; }
    return [x / n, z / n];
  }
  /** Enveloppe convexe (chaîne monotone). */
  function enveloppe(p) {
    const n = p.length / 2, idx = [];
    for (let k = 0; k < n; k++) idx.push(k);
    idx.sort((a, b) => p[2 * a] - p[2 * b] || p[2 * a + 1] - p[2 * b + 1]);
    const cr = (o, a, b) => (p[2 * a] - p[2 * o]) * (p[2 * b + 1] - p[2 * o + 1]) - (p[2 * a + 1] - p[2 * o + 1]) * (p[2 * b] - p[2 * o]);
    const bas = [], haut = [];
    for (const k of idx) { while (bas.length >= 2 && cr(bas[bas.length - 2], bas[bas.length - 1], k) <= 0) bas.pop(); bas.push(k); }
    for (let q = idx.length - 1; q >= 0; q--) {
      const k = idx[q];
      while (haut.length >= 2 && cr(haut[haut.length - 2], haut[haut.length - 1], k) <= 0) haut.pop();
      haut.push(k);
    }
    bas.pop(); haut.pop();
    const h = [];
    for (const k of bas.concat(haut)) h.push(p[2 * k], p[2 * k + 1]);
    return h;
  }
  /** Rectangle d'aire minimale qui contient le polygone : axe u (unitaire) et bornes en coordonnées locales u, v,
   *  avec v = (-uz, ux). Les arêtes de l'enveloppe donnent les orientations candidates. */
  function rectangleMinimal(p) {
    const h = enveloppe(p), n = h.length / 2;
    let m = null;
    for (let i = 0; i < n; i++) {
      const j = i + 1 < n ? i + 1 : 0;
      let ux = h[2 * j] - h[2 * i], uz = h[2 * j + 1] - h[2 * i + 1];
      const L = longueur(ux, uz);
      if (L < 1e-9) continue;
      ux /= L; uz /= L;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let k = 0; k < n; k++) {
        const x = h[2 * k], z = h[2 * k + 1], u = x * ux + z * uz, v = z * ux - x * uz;
        if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
      const A = (u1 - u0) * (v1 - v0);
      if (!m || A < m.A - 1e-9) m = { A, ux, uz, u0, u1, v0, v1 };
    }
    return m || { A: 0, ux: 1, uz: 0, u0: 0, u1: 0, v0: 0, v1: 0 };
  }
  /** La boîte (centre, axe, demi-côtés a ≥ b) du rectangle minimal. */
  function boiteMinimale(p) {
    const r = rectangleMinimal(p);
    let a = (r.u1 - r.u0) / 2, b = (r.v1 - r.v0) / 2, ux = r.ux, uz = r.uz;
    const cu = (r.u0 + r.u1) / 2, cv = (r.v0 + r.v1) / 2;
    const x = cu * ux - cv * uz, z = cu * uz + cv * ux;
    if (b > a) { const t = a; a = b; b = t; const vx = -uz; uz = ux; ux = vx; }
    return { x, z, ux, uz, a, b };
  }
  /** Aire, centre de gravité et moments centrés du polygone dans le repère (u, v). */
  function moments(p, ux, uz) {
    let A = 0, Su = 0, Sv = 0, Suu = 0, Svv = 0;
    const n = p.length;
    for (let i = 0; i < n; i += 2) {
      const j = i + 2 < n ? i + 2 : 0;
      const u1 = p[i] * ux + p[i + 1] * uz, v1 = p[i + 1] * ux - p[i] * uz;
      const u2 = p[j] * ux + p[j + 1] * uz, v2 = p[j + 1] * ux - p[j] * uz;
      const c = u1 * v2 - u2 * v1;
      A += c; Su += (u1 + u2) * c; Sv += (v1 + v2) * c;
      Suu += (u1 * u1 + u1 * u2 + u2 * u2) * c; Svv += (v1 * v1 + v1 * v2 + v2 * v2) * c;
    }
    A /= 2;
    if (Math.abs(A) < 1e-9) return null;
    const cu = Su / (6 * A), cv = Sv / (6 * A);
    return { A, cu, cv, Juu: Suu / 12 - A * cu * cu, Jvv: Svv / 12 - A * cv * cv };
  }

  // ---- Découpe d'une emprise en boîtes orientées. ----
  const SEUIL_PLEIN = 0.85;
  function morceau(p) {
    const A = aire(p), r = rectangleMinimal(p);
    return { p, A, r, plein: r.A > 0 ? A / r.A : 1, gaspi: r.A - A, fige: false };
  }
  /** Coupe le polygone par le rayon issu du sommet i dans la direction (dx, dz), jusqu'au premier bord touché. */
  function couperAuSommet(p, i, dx, dz) {
    const n = p.length / 2, x = p[2 * i], z = p[2 * i + 1];
    let tMin = Infinity, kMin = -1;
    for (let k = 0; k < n; k++) {
      const k2 = k + 1 < n ? k + 1 : 0;
      if (k === i || k2 === i) continue;
      const ax = p[2 * k], az = p[2 * k + 1], ex = p[2 * k2] - ax, ez = p[2 * k2 + 1] - az;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-12) continue;
      const wx = ax - x, wz = az - z, t = (wx * ez - wz * ex) / den, s = (wx * dz - wz * dx) / den;
      if (t > 1e-6 && s >= -1e-9 && s <= 1 + 1e-9 && t < tMin) { tMin = t; kMin = k; }
    }
    if (kMin < 0) return null;
    const qx = x + dx * tMin, qz = z + dz * tMin, A = [], B = [];
    const pousser = (liste, px, pz) => {
      const m = liste.length;
      if (m >= 2 && Math.abs(liste[m - 2] - px) < 1e-4 && Math.abs(liste[m - 1] - pz) < 1e-4) return;
      liste.push(px, pz);
    };
    for (let k = i; ; k = k + 1 < n ? k + 1 : 0) { pousser(A, p[2 * k], p[2 * k + 1]); if (k === kMin) break; }
    pousser(A, qx, qz);
    pousser(B, qx, qz);
    for (let k = kMin + 1 < n ? kMin + 1 : 0; ; k = k + 1 < n ? k + 1 : 0) { pousser(B, p[2 * k], p[2 * k + 1]); if (k === i) break; }
    const nettoyer = q => {
      if (q.length >= 4 && Math.abs(q[0] - q[q.length - 2]) < 1e-4 && Math.abs(q[1] - q[q.length - 1]) < 1e-4) q.length -= 2;
      return q.length >= 6 && aire(q) > 0.05 ? q : null;
    };
    const a = nettoyer(A), b = nettoyer(B);
    return a && b ? [a, b] : null;
  }
  /** La coupe par un sommet rentrant qui laisse le moins de vide dans les deux rectangles minimaux. */
  function meilleureCoupe(p) {
    const n = p.length / 2;
    let meilleure = null;
    for (let i = 0; i < n; i++) {
      const h = (i + n - 1) % n, j = (i + 1) % n;
      const ex = p[2 * i] - p[2 * h], ez = p[2 * i + 1] - p[2 * h + 1], fx = p[2 * j] - p[2 * i], fz = p[2 * j + 1] - p[2 * i + 1];
      if (ex * fz - ez * fx >= -1e-9) continue;                  // sommet saillant (l'anneau tourne dans le sens positif)
      const le = longueur(ex, ez), lf = longueur(fx, fz);
      if (le < 1e-6 || lf < 1e-6) continue;
      for (const [dx, dz] of [[ex / le, ez / le], [-fx / lf, -fz / lf]]) {
        const parts = couperAuSommet(p, i, dx, dz);
        if (!parts) continue;
        const a = morceau(parts[0]), b = morceau(parts[1]);
        const gaspi = a.gaspi + b.gaspi;
        if (!meilleure || gaspi < meilleure.gaspi - 1e-9) meilleure = { gaspi, a, b };
      }
    }
    return meilleure;
  }
  /** Morceaux d'un polygone simple : on coupe tant qu'un morceau remplit moins de 85 % de son rectangle minimal. */
  function decomposer(p, maxBoites) {
    const pieces = [morceau(p)];
    while (pieces.length < maxBoites) {
      let k = -1;
      for (let q = 0; q < pieces.length; q++) {
        const m = pieces[q];
        if (!m.fige && m.plein < SEUIL_PLEIN && (k < 0 || m.gaspi > pieces[k].gaspi)) k = q;
      }
      if (k < 0) break;
      const c = meilleureCoupe(pieces[k].p);
      if (!c || c.gaspi > pieces[k].gaspi * 0.85) { pieces[k].fige = true; continue; }
      pieces.splice(k, 1, c.a, c.b);
    }
    return pieces;
  }
  /** Boîte d'un morceau : rectangle de mêmes aire, centre et moments que le polygone, dans l'axe du rectangle minimal
   *  et jamais plus grand que lui (il déborde aussi peu qu'il laisse de vide). Demi-côtés a ≥ b, axe u le long de a.
   *  Un morceau presque plein garde son rectangle minimal, exact. */
  function boiteDe(m) {
    if (m.plein > 0.97) return boiteMinimale(m.p);
    const r = m.r, M = moments(m.p, r.ux, r.uz);
    if (!M || M.A <= 0) return null;
    let a = Math.min((r.u1 - r.u0) / 2, Math.sqrt(Math.max(0, 3 * M.Juu / M.A)));
    let b = Math.min((r.v1 - r.v0) / 2, Math.sqrt(Math.max(0, 3 * M.Jvv / M.A)));
    let ux = r.ux, uz = r.uz;
    const x = M.cu * ux - M.cv * uz, z = M.cu * uz + M.cv * ux;
    if (b > a) { const t = a; a = b; b = t; const vx = -uz; uz = ux; ux = vx; }
    return { x, z, ux, uz, a, b };
  }
  /** Découpe en trame pour une emprise à cour : grille dans l'axe du rectangle minimal, puis les plus grands
   *  rectangles pleins, un à un, jusqu'à couvrir 92 % de l'emprise ou six boîtes. */
  function decomposerTrame(p, trous, maxBoites = 6) {
    const r = rectangleMinimal(p), ux = r.ux, uz = r.uz;
    const s = Math.max(0.5, Math.max(r.u1 - r.u0, r.v1 - r.v0) / 160);
    const nu = Math.max(1, Math.ceil((r.u1 - r.u0) / s)), nv = Math.max(1, Math.ceil((r.v1 - r.v0) / s));
    const g = new Uint8Array(nu * nv);
    const anneaux = [p, ...trous].map(q => {
      const l = [];
      for (let k = 0; k < q.length; k += 2) l.push(q[k] * ux + q[k + 1] * uz, q[k + 1] * ux - q[k] * uz);
      return l;
    });
    let plein = 0;
    for (let j = 0; j < nv; j++) {
      const v = r.v0 + (j + 0.5) * s;
      for (let i = 0; i < nu; i++) {
        const u = r.u0 + (i + 0.5) * s;
        let dedans = dansAnneau(anneaux[0], u, v);
        for (let t = 1; dedans && t < anneaux.length; t++) if (dansAnneau(anneaux[t], u, v)) dedans = false;
        if (dedans) { g[i + j * nu] = 1; plein++; }
      }
    }
    const boites = [], hauteurs = new Int32Array(nu), pile = new Int32Array(nu + 1);
    let couvert = 0;
    while (boites.length < maxBoites && couvert < 0.92 * plein) {
      hauteurs.fill(0);
      let best = 0, bi0 = 0, bi1 = 0, bj0 = 0, bj1 = 0;
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) hauteurs[i] = g[i + j * nu] ? hauteurs[i] + 1 : 0;
        let sommet = 0;
        for (let i = 0; i <= nu; i++) {
          const hh = i < nu ? hauteurs[i] : 0;
          while (sommet > 0 && hauteurs[pile[sommet - 1]] >= hh) {
            const hk = hauteurs[pile[--sommet]], gauche = sommet > 0 ? pile[sommet - 1] + 1 : 0, A = hk * (i - gauche);
            if (A > best) { best = A; bi0 = gauche; bi1 = i - 1; bj1 = j; bj0 = j - hk + 1; }
          }
          pile[sommet++] = i;
        }
      }
      if (best < Math.max(4, 0.04 * plein)) break;
      for (let j = bj0; j <= bj1; j++) for (let i = bi0; i <= bi1; i++) g[i + j * nu] = 0;
      couvert += best;
      const cu = r.u0 + (bi0 + bi1 + 1) * s / 2, cv = r.v0 + (bj0 + bj1 + 1) * s / 2;
      let a = (bi1 - bi0 + 1) * s / 2, b = (bj1 - bj0 + 1) * s / 2, ax = ux, az = uz;
      if (b > a) { const t = a; a = b; b = t; ax = -uz; az = ux; }
      boites.push({ x: cu * ux - cv * uz, z: cu * uz + cv * ux, ux: ax, uz: az, a, b });
    }
    return boites;
  }

  // ---- Distances entre un segment et une boîte orientée, pour retailler les bâtiments le long des voies. ----
  function distPointRect(u, v, a, b) {
    const eu = (u < 0 ? -u : u) - a, ev = (v < 0 ? -v : v) - b;
    const x = eu > 0 ? eu : 0, y = ev > 0 ? ev : 0;
    return Math.sqrt(x * x + y * y);
  }
  function distPointSeg(x, z, ax, az, bx, bz) {
    const ex = bx - ax, ez = bz - az, L = ex * ex + ez * ez;
    let t = L > 0 ? ((x - ax) * ex + (z - az) * ez) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = ax + ex * t - x, dz = az + ez * t - z;
    return Math.sqrt(dx * dx + dz * dz);
  }
  /** Distance d'un segment (repère local de la boîte) au rectangle [-a, a] × [-b, b] ; 0 s'ils se coupent. */
  function distSegRect(pu, pv, qu, qv, a, b) {
    let t0 = 0, t1 = 1;
    const du = qu - pu, dv = qv - pv;
    const borne = (pp, q) => {
      if (pp === 0) return q >= 0;
      const t = q / pp;
      if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
      return true;
    };
    if (borne(-du, pu + a) && borne(du, a - pu) && borne(-dv, pv + b) && borne(dv, b - pv)) return 0;
    let d = Math.min(distPointRect(pu, pv, a, b), distPointRect(qu, qv, a, b));
    for (const [cu, cv] of [[-a, -b], [a, -b], [a, b], [-a, b]]) {
      const e = distPointSeg(cu, cv, pu, pv, qu, qv);
      if (e < d) d = e;
    }
    return d;
  }
  function distSegBoite(pu, pv, qu, qv, u0, u1, v0, v1) {
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    return distSegRect(pu - cu, pv - cv, qu - cu, qv - cv, (u1 - u0) / 2, (v1 - v0) / 2);
  }
  /** Ce qui reste du rectangle local [u0, u1] × [v0, v1] hors de la capsule (segment, rayon R) : d'un côté, de l'autre
   *  ou des deux, coupé en travers de u ou de v ; on garde la découpe qui laisse le plus d'aire. Parts plus minces que
   *  ep écartées. Rend une liste de rectangles [u0, u1, v0, v1]. */
  function retailler(pu, pv, qu, qv, u0, u1, v0, v1, R, ep) {
    let meilleur = [], aireMax = -1;
    for (let axe = 0; axe < 2; axe++) {
      const a0 = axe ? v0 : u0, a1 = axe ? v1 : u1, travers = axe ? u1 - u0 : v1 - v0;
      const dist = (s0, s1) => (axe ? distSegBoite(pu, pv, qu, qv, u0, u1, s0, s1) : distSegBoite(pu, pv, qu, qv, s0, s1, v0, v1));
      let bas = a0, haut = a1;
      if (dist(a0, a0) >= R) {
        let lo = a0, hi = a1;
        for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (dist(a0, m) >= R) lo = m; else hi = m; }
        bas = lo;
      }
      if (dist(a1, a1) >= R) {
        let lo = a0, hi = a1;
        for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (dist(m, a1) >= R) hi = m; else lo = m; }
        haut = hi;
      }
      const parts = [];
      if (bas - a0 >= ep) parts.push([a0, bas]);
      if (a1 - haut >= ep && haut > bas) parts.push([haut, a1]);
      let A = 0;
      for (const [s, t] of parts) A += (t - s) * travers;
      if (A > aireMax) { aireMax = A; meilleur = parts.map(([s, t]) => (axe ? [u0, u1, s, t] : [s, t, v0, v1])); }
    }
    return meilleur;
  }

  // ---- Trames d'un mètre : cases centrées sur les entiers, de -L à L sur chaque axe. ----
  function trame(demiCote) { const L = Math.ceil(demiCote), n = 2 * L + 1; return { L, n, N: n * n }; }
  const caseDe = (T, x, z) => {
    const i = Math.floor(x + T.L + 0.5), j = Math.floor(z + T.L + 0.5);
    return i < 0 || j < 0 || i >= T.n || j >= T.n ? -1 : i + j * T.n;
  };
  /** Met v dans les cases dont le centre est dans les anneaux (règle pair-impair : les trous restent hors). */
  function remplirAnneaux(T, g, anneaux, v) {
    let zmin = Infinity, zmax = -Infinity;
    for (const p of anneaux) for (let k = 1; k < p.length; k += 2) { if (p[k] < zmin) zmin = p[k]; if (p[k] > zmax) zmax = p[k]; }
    const n = T.n, L = T.L, j0 = Math.max(0, Math.ceil(zmin + L)), j1 = Math.min(n - 1, Math.floor(zmax + L));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const z = j - L;
      xs.length = 0;
      for (const p of anneaux) {
        const m = p.length;
        for (let i = 0, k = m - 2; i < m; k = i, i += 2) {
          const za = p[k + 1], zb = p[i + 1];
          if ((za > z) !== (zb > z)) xs.push(p[k] + (z - za) * (p[i] - p[k]) / (zb - za));
        }
      }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const i0 = Math.max(0, Math.ceil(xs[q] + L)), i1 = Math.min(n - 1, Math.floor(xs[q + 1] + L));
        if (i1 >= i0) g.fill(v, i0 + j * n, i1 + 1 + j * n);
      }
    }
  }
  /** Met v dans les cases dont le centre est dans la boîte orientée (centre x, z ; axe ux, uz ; demi-côtés a, b). */
  function remplirBoite(T, g, x, z, ux, uz, a, b, v) {
    const n = T.n, L = T.L, ax = ux < 0 ? -ux : ux, az = uz < 0 ? -uz : uz;
    const ez = az * a + ax * b, ex = ax * a + az * b;
    const j0 = Math.max(0, Math.ceil(z - ez + L)), j1 = Math.min(n - 1, Math.floor(z + ez + L));
    for (let j = j0; j <= j1; j++) {
      const dz = j - L - z;
      let lo = -ex, hi = ex;
      if (ax > 1e-12) {
        const t0 = (-a - dz * uz) / ux, t1 = (a - dz * uz) / ux;
        lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
      } else if (Math.abs(dz * uz) > a) continue;
      if (az > 1e-12) {
        const t0 = (dz * ux - b) / uz, t1 = (dz * ux + b) / uz;
        lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
      } else if (Math.abs(dz * ux) > b) continue;
      if (lo > hi) continue;
      const i0 = Math.max(0, Math.ceil(x + lo + L)), i1 = Math.min(n - 1, Math.floor(x + hi + L));
      if (i1 >= i0) g.fill(v, i0 + j * n, i1 + 1 + j * n);
    }
  }
  function remplirDisque(T, g, x, z, rayon, v) {
    const n = T.n, L = T.L, r2 = rayon * rayon;
    const j0 = Math.max(0, Math.ceil(z - rayon + L)), j1 = Math.min(n - 1, Math.floor(z + rayon + L));
    for (let j = j0; j <= j1; j++) {
      const dz = j - L - z, e = Math.sqrt(Math.max(0, r2 - dz * dz));
      const i0 = Math.max(0, Math.ceil(x - e + L)), i1 = Math.min(n - 1, Math.floor(x + e + L));
      if (i1 >= i0) g.fill(v, i0 + j * n, i1 + 1 + j * n);
    }
  }
  /** Distance euclidienne au carré (en cases) à la case source la plus proche (Felzenszwalb et Huttenlocher). */
  function distance2(sources, n) {
    const INF = 1e20, f = new Float32Array(n * n);
    for (let k = 0; k < n * n; k++) f[k] = sources[k] ? 0 : INF;
    const g = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), zz = new Float64Array(n + 1);
    const ligne = () => {
      let k = 0;
      v[0] = 0; zz[0] = -INF; zz[1] = INF;
      for (let q = 1; q < n; q++) {
        let s;
        for (;;) {
          const p = v[k];
          s = ((g[q] + q * q) - (g[p] + p * p)) / (2 * q - 2 * p);
          if (s <= zz[k] && k > 0) k--; else break;
        }
        if (s <= zz[k]) { v[k] = q; zz[k] = -INF; zz[k + 1] = INF; continue; }
        k++; v[k] = q; zz[k] = s; zz[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < n; q++) { while (zz[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + g[p]; }
    };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) g[j] = f[i + j * n];
      ligne();
      for (let j = 0; j < n; j++) f[i + j * n] = d[j];
    }
    for (let j = 0; j < n; j++) {
      const o = j * n;
      for (let i = 0; i < n; i++) g[i] = f[o + i];
      ligne();
      for (let i = 0; i < n; i++) f[o + i] = d[i];
    }
    return f;
  }
  /** La plus grande pièce 4-connexe d'un masque (nx × nz) : rend le masque de cette pièce et sa taille. */
  function plusGrandePiece(masque, nx, nz) {
    const etiquette = new Int32Array(nx * nz), file = new Int32Array(nx * nz);
    let meilleure = 0, taille = 0, num = 0;
    for (let s = 0; s < nx * nz; s++) {
      if (!masque[s] || etiquette[s]) continue;
      num++;
      let tete = 0, queue = 0;
      file[queue++] = s; etiquette[s] = num;
      while (tete < queue) {
        const c = file[tete++], i = c % nx, j = (c / nx) | 0;
        if (i > 0 && masque[c - 1] && !etiquette[c - 1]) { etiquette[c - 1] = num; file[queue++] = c - 1; }
        if (i < nx - 1 && masque[c + 1] && !etiquette[c + 1]) { etiquette[c + 1] = num; file[queue++] = c + 1; }
        if (j > 0 && masque[c - nx] && !etiquette[c - nx]) { etiquette[c - nx] = num; file[queue++] = c - nx; }
        if (j < nz - 1 && masque[c + nx] && !etiquette[c + nx]) { etiquette[c + nx] = num; file[queue++] = c + nx; }
      }
      if (queue > taille) { taille = queue; meilleure = num; }
    }
    const sortie = new Uint8Array(nx * nz);
    for (let s = 0; s < nx * nz; s++) if (etiquette[s] === meilleure && meilleure) sortie[s] = 1;
    return { masque: sortie, taille };
  }
  /** Le masque inverse (0 ↔ 1). */
  function inverse(m) { const s = new Uint8Array(m.length); for (let k = 0; k < m.length; k++) s[k] = m[k] ^ 1; return s; }
  /** 1 là où la valeur atteint le seuil. */
  function seuil(d, s) { const o = new Uint8Array(d.length); for (let k = 0; k < d.length; k++) o[k] = d[k] >= s ? 1 : 0; return o; }
  /** Rectangles qui couvrent les cases à 1 d'un masque (lignes en tronçons de `bloc` cases, fusionnés d'une ligne à l'autre). */
  function rectangles(masque, n, i0, i1, j0, j1, bloc = 40) {
    const sortie = [], ouverts = new Map();
    for (let j = j0; j <= j1 + 1; j++) {
      const ici = new Map();
      if (j <= j1) {
        for (let i = i0; i <= i1;) {
          if (!masque[i + j * n]) { i++; continue; }
          let k = i;
          while (k + 1 <= i1 && masque[k + 1 + j * n] && Math.floor((k + 1 - i0) / bloc) === Math.floor((i - i0) / bloc)) k++;
          ici.set(i * 65536 + k, true);
          i = k + 1;
        }
      }
      for (const [cle, r] of ouverts) {
        if (ici.has(cle)) { r.j1 = j; ici.set(cle, r); } else sortie.push(r);
      }
      ouverts.clear();
      for (const [cle, r] of ici) ouverts.set(cle, r === true ? { i0: Math.floor(cle / 65536), i1: cle % 65536, j0: j, j1: j } : r);
    }
    return sortie;
  }

  // ---- Constantes partagées avec la ville en damier (src/ville.js), aux mêmes valeurs. ----
  const MAT = Object.freeze({ METAL: 0, BETON: 3, MAT: 7, HERBE: 8, ROCHE: 9, ECORCE: 10, FEUILLAGE: 11, EAU: 12,
    FACADE: 13, ASPHALTE: 14, PAVE: 15, LAQUE: 17, TISSU: 18 });
  const CASSABLES = Object.freeze({
    voiture: Object.freeze({ pv: 300, rendement: 20 }), abribus: Object.freeze({ pv: 200, rendement: 12 }),
    vitrine: Object.freeze({ pv: 80, rendement: 6 }), poubelle: Object.freeze({ pv: 40, rendement: 3 }),
    banc: Object.freeze({ pv: 60, rendement: 4 }), barriere: Object.freeze({ pv: 50, rendement: 5 }),
    // Sortes propres à la ville réelle (0.3), tirées du mobilier d'OpenStreetMap et des rues : même format. La
    // simulation ne les connaît pas par leur nom (indice -1 dans SORTES_CASSABLES) : leur feu vient de leurs points de
    // structure (regles.feuObjet). Le décor les dessine par leurs pièces.
    'deux-roues': Object.freeze({ pv: 120, rendement: 8 }), conteneur: Object.freeze({ pv: 90, rendement: 6 }),
    terrasse: Object.freeze({ pv: 50, rendement: 4 }), kiosque: Object.freeze({ pv: 160, rendement: 10 }),
  });
  /** Toutes les sortes de cassables de la ville réelle : celles du protocole d'abord, dans son ordre, puis les nouvelles. */
  const SORTES_CASSABLES = Object.freeze(Object.keys(CASSABLES));
  const STOCK = Object.freeze({ moyens: 20000, materiaux: 12000 });
  const RAYON_GISEMENT = 9;
  const FACTIONS_DEFAUT = [
    { nom: 'La Convergence', court: 'Convergence', couleur: [0.90, 0.27, 0.19] },
    { nom: 'Le Bastion', court: 'Bastion', couleur: [0.93, 0.64, 0.15] },
    { nom: 'La Préfecture', court: 'Préfecture', couleur: [0.22, 0.45, 0.90] },
  ];
  const NOMS_QG = ['La Rotonde', 'Le Fort', 'L’Hôtel de Préfecture'];

  const RAYON_RUELLE = 4.5;       // les voies sont dégagées à 4,5 m de leur axe : 9 m de façade à façade
  const OUVERTURE = 4;            // rayon de l'ouverture (m) : rien de praticable de moins de 7 à 8 m de large
  const MARGE_DECOR = 150;        // le décor déborde du carré de jeu (dans la limite des données)
  const GONFLE = 0.15;            // les boîtes débordent un peu de l'emprise : pas de fente entre deux maisons
  const PENTE = 0.2967;           // 17° : tuiles canal
  const SIN_P = sinus(PENTE), COS_P = cosinus(PENTE), TAN_P = SIN_P / COS_P;
  const NIVEAU_EAU = -1.25;
  const Y_QUAI = 0.03, Y_PLACE = 0.05, Y_VOIE = 0.07;   // étages du sol : terre à 0, quais, places et parcs, voies

  // Voies dessinées : largeur maximale et minimale de la bande (m), matière.
  const VOIES = {
    'voie-express': [13, 7, 'asphalte'], primaire: [12, 7, 'asphalte'], secondaire: [11, 6, 'asphalte'],
    tertiaire: [8.5, 5, 'asphalte'], rue: [7, 4, 'asphalte'], 'voie-bus': [7, 4, 'asphalte'], desserte: [5, 3.2, 'asphalte'],
    piste: [4, 3, 'asphalte'], pietonne: [9, 3, 'pierre'], escalier: [4.5, 2.6, 'marches'], sentier: [2.6, 1.6, 'gravier'],
  };
  const sorteVoie = r => (r.classe === 'chemin' ? (r.sousClasse === 'pietonne' || r.sousClasse === 'escalier' || r.sousClasse === 'sentier' ? r.sousClasse : null)
    : r.classe === 'desserte' && (r.sousClasse === 'parking' || r.sousClasse === 'acces') ? null : VOIES[r.classe] ? r.classe : null);
  /** Voies dégagées à 9 m : les rues, et les ruelles, venelles et escaliers qui ont un nom. */
  const aDegager = r => {
    if (r.pont || r.niveau > 0) return false;
    if (['voie-express', 'primaire', 'secondaire', 'tertiaire', 'rue', 'voie-bus'].includes(r.classe)) return true;
    if (!r.nom) return false;
    return (r.classe === 'chemin' && (r.sousClasse === 'pietonne' || r.sousClasse === 'escalier'))
      || (r.classe === 'desserte' && (r.sousClasse === '' || r.sousClasse === 'ruelle'));
  };

  // Palettes de Marseille : enduits crème, ocre, rose pâle, sable ; pierre de taille ; tuiles canal ; zinc.
  const ENDUITS = [[0.91, 0.85, 0.71], [0.88, 0.72, 0.48], [0.91, 0.76, 0.66], [0.85, 0.77, 0.60], [0.93, 0.83, 0.60],
    [0.90, 0.88, 0.82], [0.89, 0.66, 0.53], [0.86, 0.80, 0.66], [0.80, 0.62, 0.45], [0.92, 0.80, 0.70]];
  const ENDUITS_PANIER = [[0.90, 0.70, 0.45], [0.88, 0.62, 0.48], [0.93, 0.80, 0.58], [0.85, 0.55, 0.40], [0.92, 0.84, 0.70],
    [0.80, 0.66, 0.52], [0.90, 0.74, 0.62], [0.78, 0.70, 0.56]];
  const PIERRE = [[0.87, 0.83, 0.73], [0.84, 0.80, 0.70], [0.89, 0.86, 0.78]];
  const PIERRE_ROSE = [0.91, 0.78, 0.68], PIERRE_BLONDE = [0.90, 0.83, 0.68], PIERRE_FORT = [0.85, 0.74, 0.62];
  // Tuiles canal : du rouge neuf à l'ocre et au brun des vieux toits.
  const TUILES = [[0.72, 0.37, 0.23], [0.77, 0.43, 0.27], [0.66, 0.34, 0.22], [0.80, 0.49, 0.31], [0.70, 0.46, 0.34],
    [0.82, 0.56, 0.36], [0.60, 0.36, 0.26], [0.78, 0.52, 0.40], [0.74, 0.40, 0.28], [0.68, 0.42, 0.27]];
  const ZINC = [0.46, 0.49, 0.53], ARDOISE = [0.30, 0.32, 0.36], VERRE = [0.34, 0.45, 0.52];
  const TERRASSES = [[0.55, 0.54, 0.52], [0.72, 0.70, 0.66], [0.62, 0.60, 0.56], [0.70, 0.50, 0.40], [0.48, 0.48, 0.48]];
  const VOITURES = [[0.75, 0.75, 0.76], [0.12, 0.13, 0.15], [0.55, 0.08, 0.08], [0.16, 0.25, 0.45], [0.85, 0.85, 0.83],
    [0.35, 0.37, 0.38], [0.62, 0.55, 0.40], [0.20, 0.35, 0.25]];
  const AUVENTS = [[0.80, 0.22, 0.18], [0.18, 0.42, 0.66], [0.92, 0.70, 0.20], [0.24, 0.55, 0.30], [0.86, 0.86, 0.82], [0.55, 0.30, 0.55]];
  const COQUES = [[0.95, 0.95, 0.93], [0.93, 0.93, 0.90], [0.14, 0.22, 0.40], [0.72, 0.16, 0.14], [0.90, 0.88, 0.80], [0.20, 0.45, 0.62], [0.55, 0.38, 0.22]];
  const BANDES_BARQUE = [[0.16, 0.36, 0.62], [0.72, 0.18, 0.14], [0.20, 0.50, 0.32], [0.92, 0.70, 0.18]];
  const VERTS = [[0.30, 0.45, 0.20], [0.34, 0.50, 0.22], [0.27, 0.42, 0.22], [0.38, 0.52, 0.24]];

  /* Aménagement de chaque ville : ce que le plan ne dit pas (où le jeu pose ses quartiers généraux, ses lieux et ses
     gisements). Coordonnées du plan (m). Un QG : centre, direction de sa sortie. Lieux, marchés et chantiers : le
     plus petit nombre d'îlots où ils entrent (des). Un chantier dégage le terrain dans son rayon (terrain vague). */
  const AMENAGEMENTS = {
    marseille: {
      // Le quai des Belges, au fond du Vieux-Port : la grande place (ville.place).
      place: [62, 60],
      // [x, z, sortie x, sortie z] : la Convergence au nord du port (quartier de l'Hôtel de Ville), le Bastion sur la
      // rive sud (Rive-Neuve), la Préfecture au cœur, entre la Canebière et le quai des Belges. Mêmes places aux trois
      // tailles : les marches Convergence–Préfecture et Bastion–Préfecture sont égales à 15 % près (vérifié).
      qg: {
        9: [[-150, -48, 0, 1], [-50, 300, 0, -1], [140, 70, -1, 0]],
        13: [[-150, -48, 0, 1], [-50, 300, 0, -1], [140, 70, -1, 0]],
        15: [[-150, -48, 0, 1], [-50, 300, 0, -1], [140, 70, -1, 0]],
      },
      lieux: [
        { nom: 'Quai des Belges', sorte: 'quai', x: 60, z: 40, des: 9 },
        { nom: 'Place de l’Hôtel-de-Ville', sorte: 'place', x: -285, z: 5, des: 9 },
        { nom: 'Place des Prêcheurs', sorte: 'place', x: -52, z: -221, des: 9 },
        { nom: 'Cours Belsunce', sorte: 'cours', x: 285, z: -170, des: 9 },
        { nom: 'La Canebière', sorte: 'cours', x: 250, z: 5, des: 9 },
        { nom: 'Parvis de l’Opéra', sorte: 'place', x: 195, z: 300, des: 9 },
        { nom: 'Cours Jean-Ballard', sorte: 'cours', x: 60, z: 290, des: 9 },
        { nom: 'Place aux Huiles', sorte: 'place', x: -123, z: 378, des: 13 },
        { nom: 'Cours Honoré-d’Estienne-d’Orves', sorte: 'cours', x: 15, z: 379, des: 13 },
        { nom: 'Place Sadi-Carnot', sorte: 'place', x: -132, z: -350, des: 15 },
        { nom: 'Jardin des Vestiges', sorte: 'jardin', x: 110, z: -150, des: 15 },
      ],
      marches: [
        { nom: 'Marché aux Poissons', x: 42, z: 112, des: 9, poissons: true },
        { nom: 'Marché du Quai du Port', x: -110, z: 2, des: 9 },
        { nom: 'Marché de la Place Victor-Gélu', x: -185, z: -105, des: 9 },
        { nom: 'Marché du Quai de Rive-Neuve', x: -5, z: 262, des: 9 },
        { nom: 'Marché du Cours Jean-Ballard', x: 45, z: 280, des: 9 },
        { nom: 'Marché de la Place du Général-de-Gaulle', x: 190, z: 140, des: 9 },
        { nom: 'Marché du Cours Belsunce', x: 285, z: -120, des: 9 },
        { nom: 'Marché de la Place de l’Hôtel-des-Postes', x: 59, z: -300, des: 9 },
        { nom: 'Marché de la Place aux Huiles', x: -125, z: 365, des: 13 },
        { nom: 'Marché aux Fleurs du Cours Saint-Louis', x: 380, z: 25, des: 13 },
        { nom: 'Marché des Capucins', x: 537, z: -28, des: 15 },
        { nom: 'Marché de la Place de Lorette', x: -338, z: -412, des: 15 },
      ],
      // Repères bâtis : le point d'un repère du plan (ou, faute de repère nommé, un point de son emprise) désigne le
      // bâtiment ; le modèle l'habille. rayon : les bâtiments voisins suivent le même style (parties d'un ensemble).
      // La mer ouverte au-delà de la zone du lointain (x0, z0, x1, z1) : à l'ouest, et au nord-ouest les bassins du port.
      merLoin: [[-9000, -9000, -1250, 9000], [-9000, -9000, -740, -1250]],
      monuments: [
        { repere: 'Hôtel de ville', sorte: 'mairie', modele: 'hotel-de-ville', rayon: 30, face: [-289, 20] },
        { repere: 'Église Saint-Ferréol', modele: 'eglise', clocher: 0.9 },
        // Le palais de la Bourse n'a pas de repère nommé dans les tuiles : un point de son emprise (127..197 × -33..45).
        { point: [160, 2], nom: 'Palais de la Bourse', modele: 'palais', face: [150, 60] },
        { repere: 'Opéra de Marseille', modele: 'palais', face: [195, 285], scene: true },
        { repere: 'Chapelle de la Vieille Charité', modele: 'charite', rayon: 64 },
        { repere: 'Clocher des Accoules', modele: 'clocher' },
        { repere: 'Halle Puget', modele: 'halle' },
      ],
      // Terrains de chantier : des dents creuses ouvertes sur la rue (le chantier dégage le bâti dans son rayon).
      chantiers: [
        { nom: 'Chantier de la Rue du Chevalier-Roze', x: -96, z: -119, rayon: 14, des: 9 },
        { nom: 'Chantier de la Rue de la Loge', x: -205, z: -26, rayon: 13, des: 9 },
        { nom: 'Chantier de la Rue Fortia', x: -10, z: 300, rayon: 13, des: 9 },
        { nom: 'Chantier du Quai de Rive-Neuve', x: -114, z: 312, rayon: 13, des: 9 },
        { nom: 'Chantier de la Rue du Bailli-de-Suffren', x: 122, z: 140, rayon: 13, des: 9 },
        { nom: 'Chantier de la Rue Vacon', x: 251, z: 185, rayon: 13, des: 9 },
        { nom: 'Chantier de la Rue Reine-Élisabeth', x: 60, z: -62, rayon: 13, des: 9 },
        { nom: 'Chantier du Cours Belsunce', x: 230, z: -240, rayon: 13, des: 9 },
        { nom: 'Chantier de la Montée du Saint-Esprit', x: -330, z: -260, rayon: 13, des: 13 },
        { nom: 'Chantier de Noailles', x: 408, z: 130, rayon: 13, des: 13 },
        { nom: 'Chantier de la Rue Rouvière', x: 470, z: 210, rayon: 13, des: 15 },
        { nom: 'Chantier de la Rue du Petit-Puits', x: -368, z: -428, rayon: 13, des: 15 },
      ],
    },
  };

  const maintenant = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  function creerVille(nom = 'marseille', options = {}) {
    const ms = {}, t00 = maintenant();
    let t0 = t00;
    const chrono = cle => { const t = maintenant(); ms[cle] = Math.round((t - t0) * 10) / 10; t0 = t; };
    const ilots = options.ilots === undefined ? 9 : options.ilots;
    if (!Number.isInteger(ilots) || ilots < 7 || ilots > 21 || ilots % 2 === 0) throw new Error('ilots : un entier impair de 7 à 21');
    const P = PDR.plans && PDR.plans[nom];
    if (!P) throw new Error('ville réelle inconnue : « ' + nom + ' » (charger src/villes/' + nom + '.js avant)');
    const AM = AMENAGEMENTS[nom];
    if (!AM) throw new Error('ville réelle sans aménagement : ' + nom);
    const carre = P.carre(ilots), demi = carre.cote / 2;
    const etendue = { x0: carre.x0, z0: carre.z0, x1: carre.x1, z1: carre.z1 };
    const LIMITE = P.etendue.x1;
    const D = Math.min(LIMITE, demi + MARGE_DECOR);       // le décor s'étend jusque-là
    const DETAIL = demi + 30;                              // tout le détail jusque-là
    const dedans = (x, z, m = 0) => x >= etendue.x0 - m && x <= etendue.x1 + m && z >= etendue.z0 - m && z <= etendue.z1 + m;
    const enDetail = (x, z) => x >= -DETAIL && x <= DETAIL && z >= -DETAIL && z <= DETAIL;
    const enDecor = (x, z) => x >= -D && x <= D && z >= -D && z <= D;
    const r = hasard(0x5EED0 + ilots * 7919);              // décor
    const rc = hasard(0xCA55E + ilots * 104729);           // cassables : tirage à part
    const R = PDR.regles;
    const factions = FACTIONS_DEFAUT.map((f, k) => {
      const g = R && R.FACTIONS && R.FACTIONS[k];
      return { nom: (g && g.nom) || f.nom, court: (g && g.court) || f.court, couleur: ((g && g.couleur) || f.couleur).slice(), qg: [0, 0] };
    });

    // ---- 1. Terre et eau. Les petits bassins (moins de 400 m²) sont des vasques posées sur la terre. ----
    const TD = trame(D + 3), terre = new Uint8Array(TD.N).fill(1);
    const eaux = [], fontaines = [];
    for (const e of P.eau) {
      if (e.sorte === 'piscine') continue;
      if (e.sorte === 'bassin' && Math.abs(aire(e.points)) < 400) { fontaines.push(boiteMinimale(e.points)); continue; }
      eaux.push(e);
    }
    for (const e of eaux) remplirAnneaux(TD, terre, [e.points, ...e.trous], 0);
    const surTerre = (x, z) => { const k = caseDe(TD, x, z); return k < 0 ? true : terre[k] === 1; };
    const surEau = (x, z) => { const k = caseDe(TD, x, z); return k >= 0 && terre[k] === 0; };

    // ---- 2. Bâtiments : emprises découpées en boîtes orientées. ----
    const axes = [];          // segments des grands axes (pour la hauteur des immeubles et la pierre de taille)
    const GRANDS = /^(La Canebière|Rue de la République|Quai du Port|Quai de Rive-Neuve|Quai des Belges|Rue de Rome|Rue Paradis|Rue Saint-Ferréol|Cours Belsunce|Boulevard d'Athènes|Rue Colbert|Cours Saint-Louis|Rue Henri Barbusse|Rue de la Canebière)$/;
    for (const rue of P.rues) {
      const pierre = GRANDS.test(rue.nom);
      if (!pierre && !['primaire', 'secondaire', 'voie-express'].includes(rue.classe)) continue;
      const p = rue.points;
      for (let k = 2; k < p.length; k += 2) axes.push([p[k - 2], p[k - 1], p[k], p[k + 1], pierre]);
    }
    const grilleAxes = new Map();
    const CA = 40;
    axes.forEach((s, q) => {
      const i0 = Math.floor((Math.min(s[0], s[2]) - 25) / CA), i1 = Math.floor((Math.max(s[0], s[2]) + 25) / CA);
      const j0 = Math.floor((Math.min(s[1], s[3]) - 25) / CA), j1 = Math.floor((Math.max(s[1], s[3]) + 25) / CA);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = i * 4096 + j; if (!grilleAxes.has(c)) grilleAxes.set(c, []); grilleAxes.get(c).push(q); }
    });
    const pres = (x, z) => {
      const l = grilleAxes.get(Math.floor(x / CA) * 4096 + Math.floor(z / CA));
      let d = Infinity, pierre = false;
      if (l) for (const q of l) { const s = axes[q], e = distPointSeg(x, z, s[0], s[1], s[2], s[3]); if (e < d) { d = e; pierre = s[4]; } }
      return [d, pierre];
    };
    const panier = P.reperes.find(q => q.nom === 'Le Panier') || { x: -437, z: -351 };
    /** Le Panier : la butte au nord du Vieux-Port, maisons basses aux enduits vifs, ruelles pavées. */
    const auPanierEn = (x, z) => longueur(x - panier.x, z - panier.z) < 300 && z < -60 && x < -170;
    const repOmbriere = P.reperes.find(q => /^Ombrière/.test(q.nom));

    // Gabarit des îlots : un bruit lent (trame de 64 m), pour que les voisins montent à peu près au même étage.
    const gabarit = (x, z) => {
      const i = Math.floor(x / 64), j = Math.floor(z / 64), fx = x / 64 - i, fz = z / 64 - j;
      const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
      const c00 = hacher(i, j * 7 + 3), c10 = hacher(i + 1, j * 7 + 3), c01 = hacher(i, j * 7 + 10), c11 = hacher(i + 1, j * 7 + 10);
      return c00 + (c10 - c00) * sx + (c01 - c00) * sz + (c00 - c10 - c01 + c11) * sx * sz;
    };
    // Repères bâtis : l'hôte de chaque repère est le plus grand bâtiment qui contient son point.
    const monuments = [];
    for (const m of AM.monuments || []) {
      const q = m.point ? { x: m.point[0], z: m.point[1] } : P.reperes.find(d => d.nom === m.repere && (!m.sorte || d.sorte === m.sorte));
      if (q && enDecor(q.x, q.z)) monuments.push({ ...m, x: q.x, z: q.z, hote: -1, aire: 0 });
    }
    for (const d of P.reperes) {
      if (d.sorte !== 'culte' || !/^(Église|Notre-Dame|Basilique|Chapelle)/.test(d.nom) || !enDecor(d.x, d.z)) continue;
      if (!monuments.some(m => m.repere === d.nom)) monuments.push({ repere: d.nom, modele: 'eglise', x: d.x, z: d.z, hote: -1, aire: 0 });
    }
    const STYLES = {
      'hotel-de-ville': { couleur: PIERRE_ROSE, toit: 'tuiles', hauteur: 17, mat: MAT.FACADE + 0.1 },
      eglise: { couleur: PIERRE_BLONDE, toit: 'tuiles', hauteur: 16, mat: MAT.PAVE, plein: true },
      clocher: { couleur: PIERRE_BLONDE, toit: 'terrasse', hauteur: 27, mat: MAT.PAVE, plein: true },
      halle: { couleur: [0.92, 0.89, 0.82], toit: 'tuiles', hauteur: 7, mat: MAT.PAVE, plein: true },
      palais: { couleur: [0.88, 0.84, 0.75], toit: 'terrasse', hauteur: 22, mat: MAT.FACADE + 0.02 },
      charite: { couleur: PIERRE_ROSE, toit: 'tuiles', hauteur: 12, mat: MAT.FACADE - 0.3 },
    };
    const bats = [], boites = [];
    let ombriere = null;
    // Les boucles lourdes vivent dans de petites fonctions : V8 n'optimise pas une fonction aussi longue que creerVille.
    (() => {
      const NB = P.batiments.length, bb = new Float32Array(NB * 4), aires = new Float32Array(NB);
      for (let k = 0; k < NB; k++) {
        const p = P.batiments[k].points;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let q = 0; q < p.length; q += 2) {
          if (p[q] < x0) x0 = p[q]; if (p[q] > x1) x1 = p[q]; if (p[q + 1] < z0) z0 = p[q + 1]; if (p[q + 1] > z1) z1 = p[q + 1];
        }
        bb[4 * k] = x0; bb[4 * k + 1] = z0; bb[4 * k + 2] = x1; bb[4 * k + 3] = z1;
        aires[k] = aire(p);
        for (const m of monuments) {
          if (m.x >= x0 && m.x <= x1 && m.z >= z0 && m.z <= z1 && aires[k] > m.aire && dansAnneau(p, m.x, m.z)) { m.aire = aires[k]; m.hote = k; }
        }
      }
      const hotes = new Map();
      monuments.forEach((m, q) => { if (m.hote >= 0 && !hotes.has(m.hote)) hotes.set(m.hote, q); });
      /** Le repère dont ce bâtiment suit le style : son hôte, une partie logée dans un hôte plein, ou un voisin. */
      const reperDe = (k, cx, cz) => {
        if (hotes.has(k)) return hotes.get(k);
        for (let q = 0; q < monuments.length; q++) {
          const m = monuments[q];
          if (m.hote < 0) continue;
          if (m.rayon && longueur(cx - m.x, cz - m.z) <= m.rayon) return q;
          const h4 = 4 * m.hote;
          if (cx >= bb[h4] && cx <= bb[h4 + 2] && cz >= bb[h4 + 1] && cz <= bb[h4 + 3] && dansAnneau(P.batiments[m.hote].points, cx, cz)) return q;
        }
        return -1;
      };
      for (let k = 0; k < NB; k++) {
        const b = P.batiments[k], p = b.points, x0 = bb[4 * k], z0 = bb[4 * k + 1], x1 = bb[4 * k + 2], z1 = bb[4 * k + 3];
        if (x1 < -D || x0 > D || z1 < -D || z0 > D) continue;
        const A = aires[k];
        if (A < 3) continue;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        if (repOmbriere && !ombriere && dansAnneau(p, repOmbriere.x, repOmbriere.z)) { ombriere = boiteMinimale(p); continue; }
        const im = reperDe(k, cx, cz), mon = im >= 0 ? monuments[im] : null, style = mon ? STYLES[mon.modele] : null;
        const hote = mon !== null && mon.hote === k;
        // L'emprise d'un bâtiment décrit par ses parties ne s'élève pas, sauf si elle porte un modèle plein (une église) ;
        // les parties logées dans un hôte plein lui laissent la place.
        if (b.contour && !(hote && style.plein)) continue;
        if (mon && style.plein && !hote) continue;
        const detail = enDetail(cx, cz);
        let liste;
        if (b.trous.length && A > 60) liste = decomposerTrame(p, b.trous, detail ? 6 : 3);
        else if (!detail || A < 40) { const m = morceau(p); const bx = m.plein > 0.97 ? boiteMinimale(p) : boiteDe(m); liste = bx ? [bx] : []; }
        else liste = decomposer(p, A > 1500 ? 6 : 4).map(boiteDe).filter(Boolean);
        const [dAxe, pierre] = pres(cx, cz);
        const axe = dAxe < 24, t = hacher(k, 11);
        const auPanier = auPanierEn(cx, cz);
        // Au bord de l'eau, un bâtiment sans hauteur connue est un kiosque ou un abri du quai.
        const kiosque = !b.connue && !style && A < 400 && (surEau(cx + 9, cz) || surEau(cx - 9, cz) || surEau(cx, cz + 9) || surEau(cx, cz - 9));
        let h;
        if (b.connue && !(hote && style.plein)) h = Math.max(b.hauteur, b.base + 2.5);
        else if (style) h = style.hauteur + (hote ? 0 : 2 * t - 1);
        else if (kiosque) h = 3.3 + 0.9 * t;
        else if (A < 18) h = 3 + 1.5 * t;
        else if (A < 45) h = 5 + 4 * t;
        else {
          // Étages : le gabarit de l'îlot, un immeuble sur trois qui dépasse ou qui manque d'un étage, des corniches
          // jamais tout à fait alignées.
          const g = gabarit(cx, cz), e = hacher(k, 13);
          let et = axe ? 6 + (g > 0.5 ? 1 : 0) : auPanier ? 3 + Math.floor(g * 2.5) : 4 + Math.floor(g * 2.7);
          if (e < 0.16) et--; else if (e > 0.84) et++;
          if (A > 1500) et = Math.min(et, 5);
          h = 4.4 + (et - 1) * 3.15 + (hacher(k, 17) - 0.5) * 0.9;
        }
        const base = b.base >= 2.5 ? b.base : 0;
        // Une partie mince posée haut (OSM décrit ainsi les toits et les corniches) est un morceau de toit.
        const toiture = base >= 6 && h - base <= 4.6;
        const t2 = hacher(k, 23);
        let couleur = b.couleur ? b.couleur.slice() : style ? style.couleur : axe && pierre ? PIERRE[Math.floor(t2 * PIERRE.length)]
          : auPanier ? ENDUITS_PANIER[Math.floor(t2 * ENDUITS_PANIER.length)] : ENDUITS[Math.floor(t2 * ENDUITS.length)];
        couleur = couleur.map((v, q) => borner(v + (hacher(k, 31 + q) - 0.5) * (style ? 0.025 : 0.05), 0, 1));
        let toit;
        if ((base > 0 && !toiture) || A < 30 || kiosque) toit = 'terrasse';
        else if (style) toit = style.toit;
        else if (hacher(k, 41) < (auPanier ? 0.06 : 0.11)) toit = 'terrasse';
        else if (axe && pierre && hacher(k, 43) < 0.6) toit = 'zinc';
        else if (!auPanier && A > 120 && hacher(k, 43) > 0.94) toit = 'zinc';
        else toit = 'tuiles';
        const bat = { k, A, h, base, couleur, toit, toiture, detail, souleve: base > 0, tuile: TUILES[Math.floor(hacher(k, 47) * TUILES.length)],
          mat: style ? style.mat : MAT.FACADE - 0.45 + hacher(k, 53) * 0.9, monument: im, hote, boites: [] };
        for (const bx of liste) {
          if (bx.a < 0.5 || bx.b < 0.5) continue;
          if (bx.a > 1 && bx.b > 1) { bx.a += GONFLE; bx.b += GONFLE; }
          bx.bat = bat;
          bat.boites.push(bx);
        }
        if (bat.boites.length) { bats.push(bat); if (hote) mon.bat = bat; }
      }
    })();
    chrono('batiments');

    const immeubles = [];
    for (const bat of bats) {
      if (bat.detail && !(bat.monument >= 0) && !bat.hote && bat.A >= 30) {
        const boites = [];
        let sumX = 0, sumZ = 0, sumAire = 0;
        for (const bx of bat.boites) {
          const aire = bx.a * bx.b;
          sumX += bx.x * aire;
          sumZ += bx.z * aire;
          sumAire += aire;
          const lacet = bx.uz >= 0 ? Math.acos(bx.ux) : -Math.acos(bx.ux);
          boites.push({ x: bx.x, z: bx.z, lx: 2 * bx.a, lz: 2 * bx.b, lacet });
        }
        const x = sumAire > 0 ? sumX / sumAire : 0;
        const z = sumAire > 0 ? sumZ / sumAire : 0;
        let rayon = 0;
        for (const bx of bat.boites) {
          const dx = bx.x - x, dz = bx.z - z;
          const d = Math.sqrt(dx * dx + dz * dz) + Math.sqrt(bx.a * bx.a + bx.b * bx.b);
          if (d > rayon) rayon = d;
        }
        const id = immeubles.length;
        immeubles.push({ id, x, z, rayon, h: bat.h, boites, pieces: [] });
        bat.immeuble = id;
      } else {
        bat.immeuble = -1;
      }
    }

    // ---- 3. Dégagements : ruelles élargies, terrains des QG et des chantiers. ----
    const capsules = [];     // [ax, az, bx, bz, R]
    for (const rue of P.rues) {
      if (!aDegager(rue)) continue;
      const p = rue.points;
      for (let k = 2; k < p.length; k += 2) {
        const ax = p[k - 2], az = p[k - 1], bx = p[k], bz = p[k + 1];
        if (!dedans(Math.min(ax, bx), Math.min(az, bz), 20) && !dedans(Math.max(ax, bx), Math.max(az, bz), 20)) continue;
        capsules.push([ax, az, bx, bz, RAYON_RUELLE]);
      }
    }
    // Les quartiers généraux du carré : chacun prend son terrain, à la place des immeubles qui s'y trouvaient.
    const tableQG = AM.qg[ilots] || AM.qg[ilots <= 9 ? 9 : ilots <= 13 ? 13 : 15];
    const MODELES_QG = [
      { avant: 17, arriere: 12, large: 13 },   // la Rotonde : tambour de 11 m, portique devant
      { avant: 17, arriere: 16, large: 16 },   // le Fort : donjon et tours
      { avant: 13, arriere: 15, large: 20 },   // l'Hôtel : corps et colonnade
    ];
    const qgPlan = tableQG.map(([x, z, vx, vz], f) => {
      const L = longueur(vx, vz), ux = vx / L, uz = vz / L, M = MODELES_QG[f];
      return { f, x, z, ux, uz, ...M };
    });
    for (const q of qgPlan) {
      capsules.push([q.x - q.ux * q.arriere, q.z - q.uz * q.arriere, q.x + q.ux * (q.avant + 6), q.z + q.uz * (q.avant + 6), q.large + 4]);
    }
    const chantiersPlan = AM.chantiers.filter(c => c.des <= ilots && dedans(c.x, c.z, -12));
    for (const c of chantiersPlan) capsules.push([c.x, c.z, c.x, c.z, c.rayon]);

    const CC = 24, grilleCaps = new Map();
    capsules.forEach((c, q) => {
      const R2 = c[4] + 1;
      const i0 = Math.floor((Math.min(c[0], c[2]) - R2) / CC), i1 = Math.floor((Math.max(c[0], c[2]) + R2) / CC);
      const j0 = Math.floor((Math.min(c[1], c[3]) - R2) / CC), j1 = Math.floor((Math.max(c[1], c[3]) + R2) / CC);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const cle = i * 4096 + j; if (!grilleCaps.has(cle)) grilleCaps.set(cle, []); grilleCaps.get(cle).push(q); }
    });
    let retaillees = 0, otees = 0;
    (() => { for (const bat of bats) {
      if (bat.souleve) continue;
      const file = bat.boites.slice(), gardees = [];
      let tours = 0;
      while (file.length) {
        const bx = file.shift();
        if (!dedans(bx.x, bx.z, 20) || ++tours > 40) { gardees.push(bx); continue; }
        const ray = Math.sqrt(bx.a * bx.a + bx.b * bx.b);
        const vues = new Set();
        let coupee = false;
        for (let j = Math.floor((bx.z - ray) / CC); j <= Math.floor((bx.z + ray) / CC) && !coupee; j++) {
          for (let i = Math.floor((bx.x - ray) / CC); i <= Math.floor((bx.x + ray) / CC) && !coupee; i++) {
            const l = grilleCaps.get(i * 4096 + j);
            if (!l) continue;
            for (const q of l) {
              if (vues.has(q)) continue;
              vues.add(q);
              const c = capsules[q];
              const vx = -bx.uz, vz = bx.ux;
              const pu = (c[0] - bx.x) * bx.ux + (c[1] - bx.z) * bx.uz, pv = (c[0] - bx.x) * vx + (c[1] - bx.z) * vz;
              const qu = (c[2] - bx.x) * bx.ux + (c[3] - bx.z) * bx.uz, qv = (c[2] - bx.x) * vx + (c[3] - bx.z) * vz;
              if (distSegRect(pu, pv, qu, qv, bx.a, bx.b) >= c[4] - 1e-6) continue;
              const parts = retailler(pu, pv, qu, qv, -bx.a, bx.a, -bx.b, bx.b, c[4], 2.2);
              coupee = true;
              retaillees++;
              if (!parts.length) otees++;
              for (const [u0, u1, v0, v1] of parts) {
                const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
                file.push({ x: bx.x + cu * bx.ux + cv * vx, z: bx.z + cu * bx.uz + cv * vz, ux: bx.ux, uz: bx.uz, a: (u1 - u0) / 2, b: (v1 - v0) / 2, bat, taillee: true });
              }
              break;
            }
          }
        }
        if (!coupee) gardees.push(bx);
      }
      bat.boites = gardees.filter(bx => bx.a * bx.b * 4 >= 5);
    } })();
    for (const bx of [].concat(...bats.map(b => b.boites))) boites.push(bx);
    chrono('degagements');

    // ---- 4. Ce qui bloque le passage : le bâti (trame du décor), l'eau, les quartiers généraux, les vasques. ----
    const bati = new Uint8Array(TD.N);
    for (const bx of boites) if (!bx.bat.souleve) remplirBoite(TD, bati, bx.x, bx.z, bx.ux, bx.uz, bx.a, bx.b, 1);
    chrono('trame-bati');
    const W = Math.ceil(demi) + 10, TP = trame(W), NP = TP.N, n = TP.n, dec = TD.L - W;
    if (dec < 0) throw new Error('ville réelle : le décor ne couvre pas le carré de jeu');
    const libre = new Uint8Array(NP);
    (() => {
      let i = 0, o = dec * TD.n + dec;
      for (let k = 0; k < NP; k++) { libre[k] = terre[o] & (bati[o] ^ 1); o++; if (++i === n) { i = 0; o += TD.n - n; } }
    })();
    const obstacles = [];      // le décor qui bloque, hors bâti : { disque: true, x, z, r } ou { disque: false, x, z, ux, uz, a, b }
    const bloquerDisque = (x, z, rayon) => { obstacles.push({ disque: true, x, z, r: rayon }); remplirDisque(TP, libre, x, z, rayon, 0); };
    const bloquerBoite = (x, z, ux, uz, a, b) => { obstacles.push({ disque: false, x, z, ux, uz, a, b }); remplirBoite(TP, libre, x, z, ux, uz, a, b, 0); };
    for (const q of qgPlan) {
      const vx = -q.uz, vz = q.ux, en = (u, v) => [q.x + u * q.ux + v * vx, q.z + u * q.uz + v * vz];
      if (q.f === 0) { bloquerDisque(q.x, q.z, 11.4); const [px, pz] = en(13.2, 0); bloquerBoite(px, pz, q.ux, q.uz, 2.4, 5); }
      else if (q.f === 1) bloquerBoite(q.x, q.z, q.ux, q.uz, 15.4, 15.4);
      else { const [bx, bz] = en(-3.5, 0); bloquerBoite(bx, bz, q.ux, q.uz, 11, 18); const [px, pz] = en(10.5, 0); bloquerBoite(px, pz, q.ux, q.uz, 3.2, 13.5); }
    }
    for (const f of fontaines) if (dedans(f.x, f.z, 10)) bloquerBoite(f.x, f.z, f.ux, f.uz, f.a + 0.4, f.b + 0.4);
    chrono('obstacles');

    // ---- 5. Le praticable : ouverture de 4 m, plus grande pièce, puis la grille de navigation de 4 m. ----
    const d2 = distance2(inverse(libre), n);                 // distance au carré (m²) au premier obstacle
    const R2O = OUVERTURE * OUVERTURE, d2n = distance2(seuil(d2, R2O), n), ouvert = new Uint8Array(NP);
    const ix0 = Math.ceil(etendue.x0 + 1 + W), ix1 = Math.floor(etendue.x1 - 1 + W), jz0 = Math.ceil(etendue.z0 + 1 + W), jz1 = Math.floor(etendue.z1 - 1 + W);
    (() => {
      for (let k = 0, i = 0, j = 0; k < NP; k++) {
        ouvert[k] = j >= jz0 && j <= jz1 && i >= ix0 && i <= ix1 && libre[k] && d2n[k] < R2O ? 1 : 0;
        if (++i === n) { i = 0; j++; }
      }
    })();
    const piece1 = plusGrandePiece(ouvert, n, n).masque;
    // Grille de navigation (sim/nav.js) : une case de 4 m est libre si ses quatre points de 2 m sont praticables. On la
    // simule ici, on garde sa plus grande pièce, et le praticable final est la bande d'1 m qui la borde : la simulation
    // voit alors une seule pièce, exactement.
    const navX0 = Math.floor((etendue.x0 - 8) / 4) * 4, navZ0 = Math.floor((etendue.z0 - 8) / 4) * 4;
    const nnx = Math.ceil((etendue.x1 + 8 - navX0) / 4), nnz = Math.ceil((etendue.z1 + 8 - navZ0) / 4);
    const ok = (x, z) => { const k = caseDe(TP, x, z); return k >= 0 && piece1[k] === 1; };
    const navLibre = new Uint8Array(nnx * nnz);
    (() => {
      for (let c = 0; c < nnx * nnz; c++) {
        const i = c % nnx, j = (c - i) / nnx;
        if (i === 0 || j === 0 || i === nnx - 1 || j === nnz - 1) continue;
        const x = navX0 + 4 * i + 1, z = navZ0 + 4 * j + 1;
        if (ok(x, z) && ok(x + 2, z) && ok(x, z + 2) && ok(x + 2, z + 2)) navLibre[c] = 1;
      }
    })();
    const navPiece = plusGrandePiece(navLibre, nnx, nnz);
    const coeur = new Uint8Array(NP);
    (() => {
      for (let c = 0; c < nnx * nnz; c++) {
        if (!navPiece.masque[c]) continue;
        const i = c % nnx, j = (c - i) / nnx, o = navX0 + 4 * i + W + (navZ0 + 4 * j + W) * n;
        coeur.fill(1, o, o + 5); coeur.fill(1, o + n, o + n + 5); coeur.fill(1, o + 2 * n, o + 2 * n + 5);
        coeur.fill(1, o + 3 * n, o + 3 * n + 5); coeur.fill(1, o + 4 * n, o + 4 * n + 5);
      }
    })();
    const d2c = distance2(coeur, n), prat = new Uint8Array(NP);
    (() => { for (let k = 0; k < NP; k++) prat[k] = piece1[k] && d2c[k] <= 4 ? 1 : 0; })();
    const praticable = (x, z) => { const k = caseDe(TP, x, z); return k >= 0 && prat[k] === 1; };
    const d2b = distance2(inverse(prat), n);                 // distance au bord du praticable (accrocher loin des murs)
    chrono('praticable');

    // ---- 6. Les voies : bandes de chaussée, de pierre ou de gravier ; le graphe des rues. ----
    const objets = [], parSection = {};
    let dejaCompte = 0;
    const marquer = nomSection => { parSection[nomSection] = (parSection[nomSection] || 0) + objets.length - dejaCompte; dejaCompte = objets.length; };
    const mesh = (shape, x, y, z, sx, sy, sz, rx, ry, rz, mat, color, objet) => {
      const m = { shape, p: [x, y, z], s: [sx, sy, sz], r: [rx, ry, rz], mat, outdoor: true };
      if (color) m.color = color;
      if (objet) m.surface = 'object';
      return m;
    };
    const poser = (...a) => { const m = mesh(...a); objets.push(m); return m; };
    /** Pièce posée par sa base (comme ville.js) : 'plan' est une dalle de 3 cm dont le dessus est à y ; 'cone' la moitié
     *  haute d'un octaèdre. */
    const piece = (g, x, y, z, sx, sy, sz, c, m, lacet = 0, objet = false) => {
      let py = y + sy / 2, hy = sy, shape = g;
      if (g === 'plan') { shape = 'box'; hy = 0.03; py = y - 0.015; } else if (g === 'cone') { shape = 'octa'; hy = sy * 2; py = y; }
      return mesh(shape, x, py, z, sx, hy, sz, 0, lacet, 0, m, c, objet);
    };
    const pose = (...a) => { const m = piece(...a); objets.push(m); return m; };
    /** Repère d'un objet : u le long (lacet), v en travers ; (x, z) au centre. */
    const repere = (x, z, lacet) => {
      const ca = cosinus(lacet), sa = sinus(lacet);
      return (g, u, v, y, su, sy, sv, c, m, rot = null, objet = true) => {
        const p = piece(g, x + u * ca + v * sa, y, z - u * sa + v * ca, su, sy, sv, c, m, lacet, objet);
        if (rot) { p.r[0] = rot[0]; p.r[2] = rot[2]; }
        return p;
      };
    };

    // Les nœuds : extrémités et points partagés par plusieurs voies.
    const cleP = (x, z) => Math.round(x * 10) * 100000 + Math.round(z * 10);
    const vus = new Map();
    const rues = P.rues.filter(rue => rue.classe !== 'rail' && rue.classe !== 'jetee' && rue.classe !== 'circuit');
    for (const rue of rues) {
      const p = rue.points, m = p.length / 2;
      for (let k = 0; k < m; k++) { const c = cleP(p[2 * k], p[2 * k + 1]); vus.set(c, (vus.get(c) || 0) + (k === 0 || k === m - 1 ? 2 : 1)); }
    }
    const chaussee = new Uint8Array(NP);
    const noeuds = [], idNoeud = new Map(), aretes = [];
    const noeudDe = (x, z) => {
      const c = cleP(x, z);
      if (!idNoeud.has(c)) { idNoeud.set(c, noeuds.length); noeuds.push([x, z]); }
      return idNoeud.get(c);
    };
    const segmentsVoies = [];     // [ax, az, bx, bz, largeur, sorte, rue, loin] : pour le mobilier
    const ecartEn = (x, z) => { const k = caseDe(TP, x, z); return k < 0 ? null : Math.sqrt(d2[k]); };
    (() => { for (const rue of rues) {
      const sorte = sorteVoie(rue);
      const p = rue.points, m = p.length / 2;
      let dansDecor = false;
      for (let k = 0; k < m; k++) if (enDecor(p[2 * k], p[2 * k + 1])) { dansDecor = true; break; }
      if (!dansDecor) continue;
      const def = sorte ? VOIES[sorte] : null;
      // Largeur de chaque segment : la place entre les façades (moins les trottoirs), bornée par la classe.
      const larg = [];
      for (let k = 1; k < m; k++) {
        const ax = p[2 * k - 2], az = p[2 * k - 1], bx = p[2 * k], bz = p[2 * k + 1];
        let w = def ? (def[0] + def[1]) / 2 : 3;
        if (def) {
          let dmin = Infinity;
          for (const t of [0.15, 0.5, 0.85]) { const d = ecartEn(ax + (bx - ax) * t, az + (bz - az) * t); if (d !== null && d < dmin) dmin = d; }
          if (dmin < Infinity) w = borner(2 * (dmin - (def[2] === 'asphalte' ? 1.6 : 0.5)), def[1], def[0]);
        }
        larg.push(w);
      }
      // Arêtes du graphe : coupées aux nœuds.
      if (dedans(p[0], p[1], 40) || dedans(p[p.length - 2], p[p.length - 1], 40)) {
        let debut = 0;
        for (let k = 1; k < m; k++) {
          const c = cleP(p[2 * k], p[2 * k + 1]);
          if (k === m - 1 || vus.get(c) > 1) {
            const pts = [];
            for (let q = debut; q <= k; q++) pts.push(p[2 * q], p[2 * q + 1]);
            let lmin = Infinity;
            for (let q = debut; q < k; q++) lmin = Math.min(lmin, larg[q]);
            aretes.push({ a: noeudDe(p[2 * debut], p[2 * debut + 1]), b: noeudDe(p[2 * k], p[2 * k + 1]), largeur: Math.round(lmin * 10) / 10,
              sorte: rue.classe === 'chemin' ? rue.sousClasse || 'chemin' : rue.classe, nom: rue.nom, points: pts });
            debut = k;
          }
        }
      }
      if (!def) continue;
      // Les rues et dessertes du Panier sont pavées (elles restent des chaussées pour la simulation).
      const pavee = (sorte === 'rue' || sorte === 'desserte') && auPanierEn((p[0] + p[p.length - 2]) / 2, (p[1] + p[p.length - 1]) / 2);
      const mat = pavee ? MAT.PAVE : def[2] === 'asphalte' ? MAT.ASPHALTE : def[2] === 'gravier' ? MAT.ROCHE : MAT.PAVE;
      const teinte = pavee ? [0.66, 0.62, 0.56] : def[2] === 'asphalte' ? [0.24, 0.24, 0.25] : def[2] === 'gravier' ? [0.72, 0.66, 0.54] : def[2] === 'marches' ? [0.86, 0.83, 0.76] : [0.84, 0.80, 0.71];
      const yv = def[2] === 'asphalte' ? Y_VOIE : Y_VOIE - 0.006;
      const loin = !enDetail((p[0] + p[p.length - 2]) / 2, (p[1] + p[p.length - 1]) / 2);
      for (let k = 1; k < m; k++) {
        const ax = p[2 * k - 2], az = p[2 * k - 1], bx = p[2 * k], bz = p[2 * k + 1];
        if (!enDecor(ax, az) && !enDecor(bx, bz)) continue;
        const L = longueur(bx - ax, bz - az);
        if (L < 0.05) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L, w = larg[k - 1];
        // Prolongement aux coudes doux ; disque aux coudes francs et aux carrefours.
        const prolonge = q => {
          if (q <= 0 || q >= m - 1) return 0;
          const cx = p[2 * q + 2] - p[2 * q], cz = p[2 * q + 3] - p[2 * q + 1], ex = p[2 * q] - p[2 * q - 2], ez = p[2 * q + 1] - p[2 * q - 1];
          const lc = longueur(cx, cz), le = longueur(ex, ez);
          if (lc < 1e-6 || le < 1e-6) return 0;
          const cosT = (cx * ex + cz * ez) / (lc * le);
          if (cosT < 0.9) return 0;
          return Math.min(w / 2, (w / 2) * Math.sqrt(Math.max(0, (1 - cosT) / (1 + cosT))) + 0.05);
        };
        const e0 = prolonge(k - 1), e1 = prolonge(k);
        const cx = (ax + bx) / 2 + ux * (e1 - e0) / 2, cz = (az + bz) / 2 + uz * (e1 - e0) / 2, Lt = L + e0 + e1;
        const lacet = lacetDe(ux, uz);
        poser('box', cx, yv - 0.015, cz, Lt, 0.03, w, 0, lacet, 0, mat, teinte);
        if (def[2] === 'asphalte') remplirBoite(TP, chaussee, cx, cz, ux, uz, Lt / 2, w / 2, 1);
        segmentsVoies.push([ax, az, bx, bz, w, sorte, rue, loin]);
        if (def[2] === 'marches' && !loin) {
          for (let s = 0.9; s < L - 0.4; s += 1.4) poser('box', ax + ux * s, yv + 0.008, az + uz * s, 0.12, 0.03, w * 0.92, 0, lacet, 0, MAT.MAT, [0.62, 0.60, 0.55], true);
        }
      }
      // Disques : coudes francs et extrémités partagées.
      for (let q = 0; q < m; q++) {
        const x = p[2 * q], z = p[2 * q + 1];
        if (!enDecor(x, z)) continue;
        let franc;
        if (q === 0 || q === m - 1) franc = vus.get(cleP(x, z)) > 2;
        else {
          const cx = p[2 * q + 2] - x, cz = p[2 * q + 3] - z, ex = x - p[2 * q - 2], ez = z - p[2 * q - 1];
          const lc = longueur(cx, cz), le = longueur(ex, ez);
          franc = lc > 1e-6 && le > 1e-6 && (cx * ex + cz * ez) / (lc * le) < 0.9;
        }
        if (!franc) continue;
        const w = larg[Math.min(q, m - 2)];
        poser('cylinder', x, yv - 0.015, z, w, 0.03, w, 0, 0, 0, mat, teinte);
        if (def[2] === 'asphalte') remplirDisque(TP, chaussee, x, z, w / 2, 1);
      }
    } })();
    // Rails du tram : deux files d'acier.
    for (const rue of P.rues) {
      if (rue.classe !== 'rail' || rue.sousClasse !== 'tram') continue;
      const p = rue.points;
      for (let k = 2; k < p.length; k += 2) {
        const ax = p[k - 2], az = p[k - 1], bx = p[k], bz = p[k + 1];
        if (!enDetail(ax, az) && !enDetail(bx, bz)) continue;
        const L = longueur(bx - ax, bz - az);
        if (L < 0.2) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L, lacet = lacetDe(ux, uz);
        for (const s of [-0.72, 0.72]) poser('box', (ax + bx) / 2 - uz * s, Y_VOIE + 0.01, (az + bz) / 2 + ux * s, L + 0.1, 0.03, 0.09, 0, lacet, 0, MAT.METAL, [0.62, 0.62, 0.63], true);
      }
    }
    const surChaussee = (x, z) => { const k = caseDe(TP, x, z); return k >= 0 && prat[k] === 1 && chaussee[k] === 1; };
    marquer('voies');
    chrono('voies');

    // ---- 7. Les sites du jeu : quartiers généraux, lieux à prendre, gisements. ----
    /** Le point praticable le plus proche, à au moins `marge` m du bord du praticable si possible. */
    function accrocher(x, z, marge = 2.2) {
      x = borner(x, etendue.x0 + 1, etendue.x1 - 1);
      z = borner(z, etendue.z0 + 1, etendue.z1 - 1);
      const k0 = caseDe(TP, x, z), m2 = marge * marge;
      if (k0 >= 0 && prat[k0] && d2b[k0] >= m2) return [x, z];
      const i0 = k0 % n, j0 = (k0 / n) | 0;
      let secours = -1;
      for (let rayon = 1; rayon < n; rayon++) {
        let trouve = -1, dmin = Infinity;
        for (let dj = -rayon; dj <= rayon; dj++) {
          const j = j0 + dj;
          if (j < 0 || j >= n) continue;
          const pas = dj === -rayon || dj === rayon ? 1 : 2 * rayon;
          for (let di = -rayon; di <= rayon; di += pas) {
            const i = i0 + di;
            if (i < 0 || i >= n) continue;
            const k = i + j * n;
            if (!prat[k]) continue;
            const dd = di * di + dj * dj;
            if (d2b[k] >= m2) { if (dd < dmin) { dmin = dd; trouve = k; } } else if (secours < 0) secours = k;
          }
        }
        if (trouve >= 0) return [(trouve % n) - W, ((trouve / n) | 0) - W];
        if (rayon > 80 && secours >= 0) return [(secours % n) - W, ((secours / n) | 0) - W];
      }
      return [x, z];
    }
    const largeurLibre = (x, z) => { const k = caseDe(TP, x, z); return k < 0 ? 0 : Math.sqrt(d2b[k]); };

    const qg = [];
    for (const q of qgPlan) {
      const sortie = accrocher(q.x + q.ux * (q.avant + 7), q.z + q.uz * (q.avant + 7), 3);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [u, v] of [[-q.arriere, -q.large], [q.avant, -q.large], [q.avant, q.large], [-q.arriere, q.large]]) {
        const x = q.x + u * q.ux - v * q.uz, z = q.z + u * q.uz + v * q.ux;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      qg[q.f] = { faction: q.f, nom: NOMS_QG[q.f], x: q.x, z: q.z, rayon: q.large + 12, sortie,
        emprise: [Math.round(x0 * 10) / 10, Math.round(z0 * 10) / 10, Math.round(x1 * 10) / 10, Math.round(z1 * 10) / 10] };
      factions[q.f].qg = [q.x, q.z];
    }
    const lieux = [], maxLieux = ilots <= 9 ? 7 : ilots <= 13 ? 9 : 11;
    for (const l of AM.lieux) {
      if (l.des > ilots || lieux.length >= maxLieux || !dedans(l.x, l.z, -8)) continue;
      const [x, z] = accrocher(l.x, l.z, 6);
      const rayon = borner(Math.floor(largeurLibre(x, z)) - 1, 8, 22);
      lieux.push({ id: lieux.length, nom: l.nom, sorte: l.sorte, x, z, rayon });
    }
    const gisements = [], lots = [];
    for (const g of AM.marches) {
      if (g.des > ilots || !dedans(g.x, g.z, -10)) continue;
      const [x, z] = accrocher(g.x, g.z, 4);
      gisements.push({ id: gisements.length, sorte: 'moyens', nom: g.nom, x, z, rayon: RAYON_GISEMENT, stock: STOCK.moyens });
      lots.push(g);
    }
    for (const c of chantiersPlan) {
      const [x, z] = accrocher(c.x, c.z, 4);
      gisements.push({ id: gisements.length, sorte: 'materiaux', nom: c.nom, x, z, rayon: RAYON_GISEMENT, stock: STOCK.materiaux });
      lots.push(c);
    }
    chrono('sites');

    // ---- 8. Le sol : la mer sous la ville, la terre en grandes dalles, des quais de pierre larges et plats. ----
    // Étages : la terre à 0, les quais à Y_QUAI, les places et les parcs à Y_PLACE, les voies à Y_VOIE.
    poser('box', 0, NIVEAU_EAU - 0.015, 0, 8000, 0.03, 8000, 0, 0, 0, MAT.EAU, null);
    const SOL = [0.70, 0.66, 0.59], PIERRE_QUAI = [0.82, 0.78, 0.70];
    const Dc = Math.floor(D);
    (() => {
      // Mailles de 8 m entièrement en terre, à 2 m près ; les bords de l'eau, eux, sont couverts par les quais.
      const C8 = 8, nc = Math.ceil(2 * Dc / C8), plein = new Uint8Array(nc * nc), L = TD.L, m1 = TD.n + 1;
      const S = new Int32Array(m1 * m1);                 // S[i, j] : cases d'eau de [0, i) × [0, j)
      for (let k = 0, i = 0, j = 0; k < TD.N; k++) {
        const o = (j + 1) * m1 + i + 1;
        S[o] = (terre[k] ^ 1) + S[o - 1] + S[o - m1] - S[o - m1 - 1];
        if (++i === TD.n) { i = 0; j++; }
      }
      const eauDans = (xa, za, xb, zb) => {              // cases d'eau de [xa, xb] × [za, zb] (m, bornes comprises)
        const i0 = borner(xa + L, 0, TD.n), i1 = borner(xb + L + 1, 0, TD.n), j0 = borner(za + L, 0, TD.n), j1 = borner(zb + L + 1, 0, TD.n);
        return S[j1 * m1 + i1] - S[j0 * m1 + i1] - S[j1 * m1 + i0] + S[j0 * m1 + i0];
      };
      for (let c = 0; c < nc * nc; c++) {
        const I = c % nc, J = (c - I) / nc;
        const x0 = -Dc + I * C8, z0 = -Dc + J * C8, x1 = Math.min(Dc, x0 + C8), z1 = Math.min(Dc, z0 + C8);
        plein[c] = eauDans(x0 - 2, z0 - 2, x1 + 2, z1 + 2) === 0 ? 1 : 0;
      }
      for (const q of rectangles(plein, nc, 0, nc - 1, 0, nc - 1, 1 << 15)) {
        const x0 = -Dc + q.i0 * C8, x1 = Math.min(Dc, -Dc + (q.i1 + 1) * C8), z0 = -Dc + q.j0 * C8, z1 = Math.min(Dc, -Dc + (q.j1 + 1) * C8);
        poser('box', (x0 + x1) / 2, -0.015, (z0 + z1) / 2, x1 - x0, 0.03, z1 - z0, 0, 0, 0, MAT.PAVE, SOL);
      }
      // Au-delà du décor : le sol du lointain (section 14).
    })();
    // Quais : une dalle de pierre de 14 m le long de chaque bord d'eau, posée du fond jusqu'au-dessus de la terre. Le
    // bord côté eau est exact ; aux coins rentrants de la terre, la dalle se prolonge pour fermer l'angle.
    const QUAI = 14;
    for (const e of eaux) {
      for (const p of [e.points, ...e.trous]) {
        const m = p.length / 2;
        // sens = 1 si la terre est à droite du parcours (contour extérieur direct, ou trou indirect), -1 sinon.
        const sens = (aire(p) > 0) === (p === e.points) ? 1 : -1;
        for (let k = 0; k < m; k++) {
          const h = (k + m - 1) % m, q = (k + 1) % m, s = (k + 2) % m;
          const ax = p[2 * k], az = p[2 * k + 1], bx = p[2 * q], bz = p[2 * q + 1];
          if (!enDecor(ax, az) && !enDecor(bx, bz)) continue;
          // Les coupes du plan au bord de l'étendue ne sont pas des quais.
          if ((Math.abs(ax) > LIMITE - 0.5 && Math.abs(bx) > LIMITE - 0.5 && Math.abs(ax - bx) < 0.5) || (Math.abs(az) > LIMITE - 0.5 && Math.abs(bz) > LIMITE - 0.5 && Math.abs(az - bz) < 0.5)) continue;
          const L = longueur(bx - ax, bz - az);
          if (L < 0.1) continue;
          const ux = (bx - ax) / L, uz = (bz - az) / L, tx = sens * uz, tz = -sens * ux;   // vers la terre
          // Coin saillant de l'eau (rentrant pour la terre) : la dalle se prolonge pour fermer l'angle.
          const saillant = (px, pz, cx, cz, dx, dz) => sens * ((cx - px) * (dz - cz) - (cz - pz) * (dx - cx)) > 0;
          const e0 = saillant(p[2 * h], p[2 * h + 1], ax, az, bx, bz) ? QUAI : 0, e1 = saillant(ax, az, bx, bz, p[2 * s], p[2 * s + 1]) ? QUAI : 0;
          const cu = (L + e1 - e0) / 2, hq = Y_QUAI - NIVEAU_EAU + 0.3;
          poser('box', ax + ux * cu + tx * QUAI / 2, NIVEAU_EAU - 0.3 + hq / 2, az + uz * cu + tz * QUAI / 2, L + e0 + e1, hq, QUAI,
            0, lacetDe(ux, uz), 0, MAT.PAVE, PIERRE_QUAI);
        }
      }
    }
    // Vasques : les petits bassins du plan, une margelle de pierre et une eau claire.
    for (const f of fontaines) {
      if (!enDecor(f.x, f.z)) continue;
      const lacet = lacetDe(f.ux, f.uz);
      poser('box', f.x, Y_PLACE + 0.3, f.z, 2 * f.a + 0.8, 0.6, 2 * f.b + 0.8, 0, lacet, 0, MAT.BETON, [0.88, 0.85, 0.78]);
      poser('box', f.x, Y_PLACE + 0.58, f.z, 2 * f.a, 0.06, 2 * f.b, 0, lacet, 0, MAT.EAU, null);
    }
    marquer('sol');
    // Places, quais et parcs : des dalles (découpées comme les bâtiments).
    const places = [], parcs = [];
    const SORTES_PLACES = { place: [0.80, 0.76, 0.68], quai: [0.82, 0.78, 0.69], pietonne: [0.78, 0.74, 0.66], arret: [0.74, 0.74, 0.72], pont: [0.70, 0.68, 0.64] };
    const SORTES_PARCS = { parc: [0.36, 0.50, 0.25], jardin: [0.38, 0.52, 0.26], pelouse: [0.42, 0.55, 0.28], bois: [0.30, 0.42, 0.22],
      terrain: [0.42, 0.56, 0.32], jeux: [0.74, 0.52, 0.40], cimetiere: [0.46, 0.50, 0.36] };
    const arrets = [];
    for (const e of P.espaces) {
      const [cx, cz] = centre(e.points);
      if (!enDecor(cx, cz)) continue;
      const cPlace = SORTES_PLACES[e.sorte], cParc = SORTES_PARCS[e.sorte];
      if (e.sorte === 'jetee') {
        const bx = boiteMinimale(e.points);
        poser('box', bx.x, NIVEAU_EAU + 0.75, bx.z, 2 * bx.a, 0.3, 2 * bx.b, 0, lacetDe(bx.ux, bx.uz), 0, MAT.ECORCE, [0.55, 0.46, 0.36], true);
        continue;
      }
      if (!cPlace && !cParc) continue;
      if (cPlace) places.push({ nom: e.nom, sorte: e.sorte, polygone: e.points });
      else parcs.push({ nom: e.nom, sorte: e.sorte, polygone: e.points });
      if (e.sorte === 'arret') arrets.push(boiteMinimale(e.points));
      const A = aire(e.points);
      if (A < 20) continue;
      const liste = e.trous.length ? decomposerTrame(e.points, e.trous, 6) : decomposer(e.points, A > 3000 ? 6 : 4).map(boiteDe).filter(Boolean);
      const y = cParc ? Y_PLACE + 0.004 : Y_PLACE;
      for (const bx of liste) poser('box', bx.x, y - 0.015, bx.z, 2 * bx.a, 0.03, 2 * bx.b, 0, lacetDe(bx.ux, bx.uz), 0, cParc ? MAT.HERBE : MAT.PAVE, cParc || cPlace);
    }
    marquer('places');
    // Pontons du port : des passerelles de bois sur l'eau.
    const pontons = [];
    for (const rue of P.rues) {
      if (rue.classe !== 'jetee') continue;
      const p = rue.points;
      for (let k = 2; k < p.length; k += 2) {
        const ax = p[k - 2], az = p[k - 1], bx = p[k], bz = p[k + 1];
        if (!enDecor(ax, az) && !enDecor(bx, bz)) continue;
        const L = longueur(bx - ax, bz - az);
        if (L < 0.5) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L;
        poser('box', (ax + bx) / 2, NIVEAU_EAU + 0.7, (az + bz) / 2, L + 2.2, 0.28, 2.2, 0, lacetDe(ux, uz), 0, MAT.ECORCE, [0.58, 0.49, 0.38], true);
        pontons.push([ax, az, bx, bz, L, ux, uz]);
      }
    }
    marquer('pontons');
    chrono('sol');

    // ---- 9. Les bâtiments : corps, toits de tuiles canal à deux pans, génoises ; terrasses ; zinc sur les grands axes. ----
    // Pignons et génoises ne sont posés que là où on les voit : pas contre un mur mitoyen.
    const ouvertEn = (x, z) => { const k = caseDe(TD, x, z); return k >= 0 && bati[k] === 0; };
    let nbCorps = 0, nbPans = 0, nbPignons = 0, nbGenoises = 0, nbAcroteres = 0;
    const GENOISE = [0.93, 0.89, 0.79];
    (() => { for (const bat of bats) {
      for (const bx of bat.boites) {
        let { a, b, ux, uz } = bx;
        if (b > a) { const t = a; a = b; b = t; const wx = -uz; uz = ux; ux = wx; }
        const lacet = lacetDe(ux, uz), y0 = bat.base, h = bat.h, vx = -uz, vz = ux;
        poser('box', bx.x, (y0 + h) / 2, bx.z, 2 * a, h - y0, 2 * b, 0, lacet, 0, bat.mat, bat.couleur);
        nbCorps++;
        const detail = enDetail(bx.x, bx.z);
        if (bat.toit === 'terrasse' || b < 1.6) {
          if (detail && a * b > 30) { poser('box', bx.x, h + 0.25, bx.z, 2 * a + 0.12, 0.5, 2 * b + 0.12, 0, lacet, 0, MAT.MAT, fois(bat.couleur, 0.86), true); nbAcroteres++; }
          continue;
        }
        const zinc = bat.toit === 'zinc', th = zinc ? 0.42 : PENTE, st = zinc ? sinus(th) : SIN_P, ct = zinc ? cosinus(th) : COS_P, tt = st / ct;
        const e = detail ? 0.35 : 0.25, ep = 0.16, couleur = zinc ? ZINC : bat.tuile;
        const vu = (px, pz, dx, dz, ex, ez) => ouvertEn(px + dx, pz + dz) || ouvertEn(px + dx + ex, pz + dz + ez) || ouvertEn(px + dx - ex, pz + dz - ez);
        for (const s of [-1, 1]) {
          const vm = s * (b + e) / 2 - s * st * ep / 2, ym = h + (b - e) / 2 * tt - ct * ep / 2;
          poser('box', bx.x + vm * vx, ym, bx.z + vm * vz, 2 * a + (detail ? 0.5 : 0.3), ep, (b + e) / ct, s * th, lacet, 0, MAT.MAT, couleur, true);
          nbPans++;
          if (detail && !zinc && a > 2.5 && vu(bx.x, bx.z, s * (b + 1.3) * vx, s * (b + 1.3) * vz, ux * a * 0.6, uz * a * 0.6)) {
            poser('box', bx.x + s * (b + 0.1) * vx, h - 0.17, bx.z + s * (b + 0.1) * vz, 2 * a, 0.34, 0.34, 0, lacet, 0, MAT.MAT, GENOISE, true);
            nbGenoises++;
          }
        }
        // Pignons : la moitié haute d'un octaèdre mince ferme le triangle sous les pans.
        if (!detail) continue;
        for (const s of [-1, 1]) {
          if (!vu(bx.x, bx.z, s * (a + 1.3) * ux, s * (a + 1.3) * uz, vx * b * 0.5, vz * b * 0.5)) continue;
          poser('octa', bx.x + s * (a - 0.16) * ux, h, bx.z + s * (a - 0.16) * uz, 0.3, 2 * Math.max(0.05, b * tt - 0.03), 2 * b, 0, lacet, 0, MAT.MAT, fois(bat.couleur, 0.96), true);
          nbPignons++;
        }
      }
    } })();
    // L'Ombrière du quai des Belges : un miroir sur de fins poteaux.
    if (ombriere && enDecor(ombriere.x, ombriere.z)) {
      const o = ombriere, lacet = lacetDe(o.ux, o.uz), vx = -o.uz, vz = o.ux;
      poser('box', o.x, 6.1, o.z, 2 * o.a, 0.3, 2 * o.b, 0, lacet, 0, MAT.METAL, [1.0, 1.0, 1.0]);
      for (const su of [-0.82, -0.27, 0.27, 0.82]) for (const sv of [-0.6, 0.6]) {
        poser('box', o.x + su * o.a * o.ux + sv * o.b * vx, 3.0, o.z + su * o.a * o.uz + sv * o.b * vz, 0.22, 6.0, 0.22, 0, lacet, 0, MAT.METAL, [0.9, 0.9, 0.92], true);
      }
    }
    // ---- 9 bis. Les monuments du carré : chaque modèle de STYLES habille son bâtiment hôte (la plus grande boîte). ----
    let nbMonuments = 0;
    for (const m of monuments) {
      const bat = m.bat;
      if (!bat || !bat.boites.length || !enDecor(m.x, m.z)) continue;
      let bx = bat.boites[0];
      for (const c of bat.boites) if (c.a * c.b > bx.a * bx.b) bx = c;
      let { a, b, ux, uz } = bx;
      if (b > a) { const t = a; a = b; b = t; const wx = -uz; uz = ux; ux = wx; }
      const vx = -uz, vz = ux, h = bat.h, lacet = lacetDe(ux, uz), p = repere(bx.x, bx.z, lacet), st = STYLES[m.modele];
      const clair = fois(st.couleur, 1.06), sombre = fois(st.couleur, 0.82);
      // Le côté qui regarde « face » (ou la rue la plus proche) : su, sv ∈ {-1, 0, 1}, demi-largeur de ce côté.
      const f = m.face || accrocher(bx.x, bx.z, 1);
      const du = (f[0] - bx.x) * ux + (f[1] - bx.z) * uz, dv = (f[0] - bx.x) * vx + (f[1] - bx.z) * vz;
      const longSide = Math.abs(dv) / b >= Math.abs(du) / a;           // la façade est un grand côté
      const sgn = longSide ? (dv >= 0 ? 1 : -1) : (du >= 0 ? 1 : -1);
      const enFace = (t, d) => (longSide ? [t, sgn * (b + d)] : [sgn * (a + d), t]);   // (u, v) d'un point devant la façade
      const largeurFace = longSide ? a : b;
      if (m.modele === 'hotel-de-ville') {
        // Rez-de-chaussée à refends, corniche, balustrade, avant-corps central couronné d'un fronton.
        objets.push(p('box', 0, 0, 0, 2 * a + 0.3, 4.6, 2 * b + 0.3, sombre, MAT.BETON, null, false));
        objets.push(p('box', 0, 0, h - 1.4, 2 * a + 0.6, 0.5, 2 * b + 0.6, clair, MAT.BETON, null, false));
        objets.push(p('box', 0, 0, h, 2 * a - 0.4, 0.9, 2 * b - 0.4, clair, MAT.BETON, null, false));
        const [cu, cv] = enFace(0, -0.3);
        objets.push(p('box', cu, cv, 0, longSide ? largeurFace * 0.36 : 1.4, h + 1.2, longSide ? 1.4 : largeurFace * 0.36, st.couleur, MAT.FACADE + 0.1, null, false));
        objets.push(p('cone', cu, cv, h + 1.2, longSide ? largeurFace * 0.38 : 1.2, 1.6, longSide ? 1.2 : largeurFace * 0.38, clair, MAT.BETON));
        nbMonuments++;
      } else if (m.modele === 'eglise') {
        // Le clocher : une tour carrée sur la façade, une flèche de pierre.
        const cote = Math.min(2 * b, 7.5), hc = h * (1 + (m.clocher || 0.75)), [cu, cv] = enFace(0, -cote / 2);
        objets.push(p('box', cu, cv, 0, cote, hc, cote, st.couleur, MAT.PAVE, null, false));
        objets.push(p('box', cu, cv, hc, cote + 0.5, 0.5, cote + 0.5, sombre, MAT.BETON, null, false));
        objets.push(p('cone', cu, cv, hc + 0.5, cote * 0.92, cote * 1.3, cote * 0.92, sombre, MAT.BETON));
        // La nef : un toit plus sombre, une rosace.
        const [ru, rv] = enFace(0, 0.08);
        objets.push(p('cylinder', ru, rv, h * 0.55, 2.4, 0.15, 2.4, [0.20, 0.24, 0.34], MAT.LAQUE, longSide ? [DEMI_PI, 0, 0] : [0, 0, DEMI_PI]));
        nbMonuments++;
      } else if (m.modele === 'clocher') {
        // Le clocher des Accoules : une flèche de pierre sur la tour, à pans, et sa galerie.
        objets.push(p('box', 0, 0, h, 2 * a + 0.6, 0.7, 2 * b + 0.6, sombre, MAT.BETON, null, false));
        objets.push(p('cone', 0, 0, h + 0.7, 2 * a * 0.95, 2 * Math.max(a, b) * 1.9, 2 * b * 0.95, st.couleur, MAT.BETON));
        nbMonuments++;
      } else if (m.modele === 'halle') {
        // La halle Puget : un lanternon le long du faîtage.
        objets.push(p('box', 0, 0, h + b * TAN_P - 0.2, 2 * a * 0.7, 1.4, Math.min(2 * b * 0.3, 3), [0.82, 0.80, 0.74], MAT.FACADE, null, false));
        objets.push(p('box', 0, 0, h + b * TAN_P + 1.2, 2 * a * 0.72, 0.18, Math.min(2 * b * 0.36, 3.6), bat.tuile, MAT.MAT));
        nbMonuments++;
      } else if (m.modele === 'palais') {
        // Colonnade sur la façade (le palais de la Bourse : fronton ; l'Opéra : cage de scène derrière).
        const nb = Math.max(4, Math.min(12, Math.floor(largeurFace * 1.4 / 3.2))), pas = largeurFace * 1.4 / nb, hc = Math.min(h * 0.72, 15);
        for (let k = 0; k < nb; k++) {
          const [cu, cv] = enFace((k - (nb - 1) / 2) * pas, 1.8);
          objets.push(p('cylinder', cu, cv, 1.2, 1.05, hc, 1.05, clair, MAT.BETON, null, false));
        }
        const [eu, ev] = enFace(0, 1.8), lf = largeurFace * 1.4 + 2.4;
        objets.push(p('box', eu, ev, 0, longSide ? lf : 4.6, 1.2, longSide ? 4.6 : lf, sombre, MAT.BETON, null, false));
        objets.push(p('box', eu, ev, 1.2 + hc, longSide ? lf : 4.4, 1.8, longSide ? 4.4 : lf, clair, MAT.BETON, null, false));
        if (m.scene) {
          const [su, sv] = enFace(0, -(longSide ? b : a) * 1.25);
          objets.push(p('box', su, sv, 0, longSide ? a * 1.1 : b * 0.9, h + 7, longSide ? b * 0.9 : a * 1.1, st.couleur, MAT.FACADE, null, false));
        } else objets.push(p('cone', eu, ev, 3 + hc, longSide ? lf * 0.6 : 4.4, 2.6, longSide ? 4.4 : lf * 0.6, clair, MAT.BETON));
        nbMonuments++;
      } else if (m.modele === 'charite') {
        // La chapelle de la Vieille Charité : coupole ovale sur un tambour, lanterne.
        const r0 = Math.min(a, b) * 0.85;
        objets.push(p('cylinder', 0, 0, h, 2 * r0, 3.2, 2 * r0 * 1.3, st.couleur, MAT.FACADE - 0.3, null, false));
        objets.push(p('sphere', 0, 0, h + 3.2 - r0 * 0.15, 2 * r0, 2 * r0 * 0.9, 2 * r0 * 1.3, fois(st.couleur, 0.95), MAT.BETON, null, false));
        objets.push(p('cylinder', 0, 0, h + 3.2 + r0 * 0.7, 2.2, 3.2, 2.2, clair, MAT.BETON, null, false));
        nbMonuments++;
      }
    }
    marquer('batis');
    chrono('batis');

    // ---- Arbres (platanes) : tronc clair et deux houppiers. ----
    let nbArbres = 0;
    function arbre(x, z, taille = 1, platane = true) {
      const h = r.entre(4.6, 6.2) * taille, tronc = r.entre(0.3, 0.42) * taille;
      const bois = platane ? nuance(r, [0.62, 0.58, 0.48], 0.03) : nuance(r, [0.36, 0.29, 0.20], 0.03);
      objets.push(mesh('cylinder', x, h * 0.36, z, tronc, h * 0.72, tronc, 0, 0, 0, MAT.ECORCE, bois));
      const vert = r.choix(VERTS), a = r() * DEUX_PI;
      objets.push(mesh('foliage', x + cosinus(a) * 0.7 * taille, h * 0.78, z + sinus(a) * 0.7 * taille, 4.25 * taille, 3.4 * taille, 4.08 * taille,
        0, r() * DEUX_PI, 0, MAT.FEUILLAGE, nuance(r, vert, 0.035)));
      objets.push(mesh('foliage', x - cosinus(a) * 0.5 * taille, h * 0.98, z - sinus(a) * 0.5 * taille, 3.75 * taille, 3.0 * taille, 3.6 * taille,
        0, r() * DEUX_PI, 0, MAT.FEUILLAGE, nuance(r, vert, 0.035)));
      nbArbres++;
    }

    // ---- 10. Les quartiers généraux : un bâtiment par camp sur son parvis. Aucun insigne réel : un motif. ----
    const banniere = (p, u, v, y, couleur, haut = 7) => objets.push(p('box', u, v, y - haut, 0.12, haut, 2.2, couleur, MAT.TISSU));
    for (const q of qgPlan) {
      const lacet = lacetDe(q.ux, q.uz), p = repere(q.x, q.z, lacet), f = factions[q.f], couleur = f.couleur;
      const vx = -q.uz, vz = q.ux, en = (u, v) => [q.x + u * q.ux + v * vx, q.z + u * q.uz + v * vz];
      const dalle = q.f === 2 ? [0.76, 0.74, 0.70] : [0.78, 0.75, 0.69];
      const lp = q.avant + q.arriere + 10, cp = (q.avant - q.arriere) / 2;
      objets.push(p('plan', cp, 0, Y_PLACE + 0.006, lp, 1, 2 * q.large + 8, dalle, MAT.PAVE, null, false));
      const met = (...a) => objets.push(p(...a));
      if (q.f === 0) {
        // La Rotonde : halle ronde sous coupole, anneaux rouges (motif : rond). Le portique regarde la sortie.
        const Rr = 11, h = 10.4, brique = [0.70, 0.45, 0.35];
        objets.push(mesh('cylinder', q.x, h / 2, q.z, 2 * Rr, h, 2 * Rr, 0, 0, 0, MAT.FACADE, brique));
        objets.push(mesh('cylinder', q.x, h + 0.4, q.z, 2 * Rr + 0.7, 0.8, 2 * Rr + 0.7, 0, 0, 0, MAT.MAT, fois(brique, 0.7), true));
        objets.push(mesh('sphere', q.x, h + 0.8, q.z, 2 * Rr - 1.4, 12.4, 2 * Rr - 1.4, 0, 0, 0, MAT.METAL, [0.42, 0.55, 0.50], true));
        objets.push(mesh('cylinder', q.x, h + 7.7, q.z, 2.6, 2.2, 2.6, 0, 0, 0, MAT.BETON, [0.92, 0.9, 0.86]));
        objets.push(mesh('octa', q.x, h + 8.8, q.z, 1.8, 2.4, 1.8, 0, 0, 0, MAT.METAL, [0.42, 0.55, 0.50]));
        met('box', Rr + 1.6, 0, 0, 3.4, 0.5, 9, [0.85, 0.83, 0.78], MAT.BETON);
        for (const dv of [-3.6, -1.2, 1.2, 3.6]) met('cylinder', Rr + 2.6, dv, 0.5, 0.7, 6.2, 0.7, [0.92, 0.9, 0.86], MAT.BETON);
        met('box', Rr + 1.8, 0, 6.7, 3.8, 0.8, 9.4, fois(brique, 0.8), MAT.MAT);
        const [ax, az] = en(Rr + 2.2, 0);
        objets.push(mesh('ring', ax, 10.6, az, 6.2, 6.2, 6.2, DEMI_PI, lacet + DEMI_PI, 0, MAT.LAQUE, couleur, true));
        for (let k = 0; k < 10; k++) {
          const a = (k + 0.5) * PI / 5, du = cosinus(a), dv = sinus(a);
          const [rx, rz] = en(du * (Rr + 0.15), dv * (Rr + 0.15));
          const dx = du * q.ux + dv * vx, dz = du * q.uz + dv * vz;
          objets.push(mesh('ring', rx, 7.2, rz, 2.2, 2.2, 2.2, DEMI_PI, lacetDe(dx, dz) + DEMI_PI, 0, MAT.LAQUE, couleur, true));
          const [bxx, bzz] = en(du * (Rr + 0.12), dv * (Rr + 0.12));
          objets.push(mesh('box', bxx, 5.6 - 1.8, bzz, 2.2, 3.6, 0.12, 0, lacetDe(-dz, dx), 0, MAT.TISSU, couleur));
        }
      } else if (q.f === 1) {
        // Le Fort : donjon carré flanqué de quatre tours crénelées, carrés ambrés (motif : carré). La porte regarde la sortie.
        const a = 12, h = 12.8, t = 3.4, gris = [0.64, 0.63, 0.60], sombre = [0.50, 0.49, 0.47];
        met('box', 0, 0, 0, 2 * a, h, 2 * a, gris, MAT.FACADE - 0.2, null, false);
        met('box', 0, 0, h, 2 * a + 0.3, 0.6, 2 * a + 0.3, sombre, MAT.MAT);
        const merlons = (cu, cv, cote, haut) => {
          for (let u = -cote / 2 + 0.8; u <= cote / 2 - 0.8 + 1e-6; u += 3.2) {
            met('box', cu + u, cv - cote / 2 + 0.6, haut, 1.6, 1.3, 1.2, sombre, MAT.BETON);
            met('box', cu + u, cv + cote / 2 - 0.6, haut, 1.6, 1.3, 1.2, sombre, MAT.BETON);
            met('box', cu - cote / 2 + 0.6, cv + u, haut, 1.2, 1.3, 1.6, sombre, MAT.BETON);
            met('box', cu + cote / 2 - 0.6, cv + u, haut, 1.2, 1.3, 1.6, sombre, MAT.BETON);
          }
        };
        merlons(0, 0, 2 * a, h + 0.6);
        for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const tu = su * a, tv = sv * a;
          met('box', tu, tv, 0, 2 * t, h + 4.6, 2 * t, fois(gris, 0.94), MAT.FACADE + 0.2, null, false);
          met('box', tu, tv, h + 4.6, 2 * t + 0.3, 0.5, 2 * t + 0.3, sombre, MAT.MAT);
          merlons(tu, tv, 2 * t, h + 5.1);
          met('box', tu + su * (t + 0.08), tv, h - 1, 0.12, 2.6, 2.6, couleur, MAT.LAQUE);
          met('box', tu, tv + sv * (t + 0.08), h - 1, 2.6, 2.6, 0.12, couleur, MAT.LAQUE);
        }
        met('box', a + 0.2, 0, 0, 0.6, 6, 6, [0.10, 0.10, 0.11], MAT.MAT);
        for (const [dv, dy, sy, sv] of [[0, 6.4, 0.7, 7.6], [-3.45, 0, 7.1, 0.7], [3.45, 0, 7.1, 0.7]]) met('box', a + 0.4, dv, dy, 0.25, sy, sv, couleur, MAT.LAQUE);
        met('box', a + 0.12, 0, 8.4, 0.12, 3, 3, couleur, MAT.LAQUE);
        for (let k = 0; k < 3; k++) banniere(p, -a - 0.08, -a * 0.55 + k * a * 0.55, h - 1.5, couleur, 6);
      } else {
        // L'Hôtel de Préfecture : colonnade et fronton en chevron, chevrons bleus (motif : chevron). Il regarde la sortie.
        const pierre = [0.88, 0.85, 0.78], clair = [1.0, 0.98, 0.92];
        met('box', -3.5, 0, 0, 22, 17.6, 36, pierre, MAT.FACADE + 0.1, null, false);
        met('box', -3.5, 0, 17.6, 22.6, 0.55, 36.6, fois(pierre, 0.82), MAT.MAT);
        const large = 26;
        met('box', 10.5, 0, 0, 6, 0.9, large + 2, clair, MAT.BETON);
        for (let k = 0; k < 8; k++) met('cylinder', 12.3, -large / 2 + 0.8 + (k * (large - 1.6)) / 7, 0.9, 1.1, 11.4, 1.1, clair, MAT.BETON);
        met('box', 10.5, 0, 12.3, 6.4, 1.6, large + 1.2, clair, MAT.BETON);
        const pente = 0.3, demiF = (large + 1.2) / 2, ang = angle(pente, 1), ca = cosinus(ang);
        for (const s of [-1, 1]) {
          met('box', 12.9, s * demiF / 2, 13.9 + demiF * pente / 2 + 0.2 - 0.35, 1.2, 0.7, demiF / ca + 0.6, clair, MAT.BETON, [s * ang, 0, 0]);
          met('box', 7.6, s * 1.6, 15.1 - 0.225, 0.12, 0.45, 3.6, couleur, MAT.LAQUE, [s * 0.6, 0, 0]);
          met('box', 7.56, s * 1.6, 9.6 - 0.225, 0.12, 0.45, 3.6, couleur, MAT.LAQUE, [s * 0.6, 0, 0]);
        }
        for (const v0 of [-12.5, 12.5]) for (const s of [-1, 1]) met('box', 7.6, v0 + s * 1.2, 19.0 - 0.2, 0.14, 0.4, 2.8, couleur, MAT.LAQUE, [s * 0.6, 0, 0]);
        for (const sv of [-1, 1]) {
          met('box', 7, sv * 22, 0.25, 5.2, 1.7, 2.1, [0.13, 0.20, 0.42], MAT.LAQUE);
          met('box', 7, sv * 22, 0, 4.4, 0.35, 1.9, [0.08, 0.08, 0.09], MAT.MAT);
        }
      }
      // Quatre arbres aux coins du parvis.
      for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const [x, z] = en(su > 0 ? q.avant + 2 : -q.arriere - 2, sv * (q.large + 1));
        if (largeurLibre(x, z) > 1.2) arbre(x, z, 0.8);
      }
    }
    marquer('qg');
    chrono('qg');

    // ---- 11. Lieux, marchés et chantiers : leur décor ; les cassables. ----
    const cassables = [];
    const casser = (sorte, x, z, lacet, pieces) => {
      const v = CASSABLES[sorte];
      cassables.push({ id: cassables.length, sorte, x, z, lacet, pv: v.pv, rendement: v.rendement, pieces });
    };
    const banc = (x, z, lacet) => {
      const p = repere(x, z, lacet), bois = nuance(rc, [0.52, 0.36, 0.22], 0.04), fer = [0.25, 0.27, 0.28];
      casser('banc', x, z, lacet, [p('box', 0, 0, 0.42, 1.8, 0.08, 0.46, bois, MAT.ECORCE), p('box', 0, -0.22, 0.5, 1.8, 0.42, 0.06, bois, MAT.ECORCE),
        p('box', -0.75, 0, 0, 0.08, 0.42, 0.42, fer, MAT.METAL), p('box', 0.75, 0, 0, 0.08, 0.42, 0.42, fer, MAT.METAL)]);
    };
    const poubelle = (x, z) => {
      const c = rc() < 0.5 ? [0.20, 0.36, 0.24] : [0.36, 0.38, 0.40];
      casser('poubelle', x, z, 0, [piece('cylinder', x, 0, z, 0.55, 0.9, 0.55, c, MAT.LAQUE, 0, true),
        piece('cylinder', x, 0.9, z, 0.62, 0.06, 0.62, [0.12, 0.12, 0.13], MAT.MAT, 0, true)]);
    };
    const barriere = (x, z, lacet) => {
      const p = repere(x, z, lacet), fer = [0.72, 0.74, 0.76];
      const pieces = [p('box', 0, 0, 1.0, 2.2, 0.06, 0.05, fer, MAT.METAL), p('box', 0, 0, 0.18, 2.2, 0.05, 0.05, fer, MAT.METAL),
        p('box', -1.05, 0, 0, 0.06, 1.06, 0.06, fer, MAT.METAL), p('box', 1.05, 0, 0, 0.06, 1.06, 0.06, fer, MAT.METAL),
        p('box', -1.05, 0, 0, 0.06, 0.04, 0.6, fer, MAT.METAL), p('box', 1.05, 0, 0, 0.06, 0.04, 0.6, fer, MAT.METAL)];
      for (let k = -3; k <= 3; k++) pieces.push(p('box', k * 0.28, 0, 0.2, 0.03, 0.8, 0.03, fer, MAT.METAL));
      casser('barriere', x, z, lacet, pieces);
    };
    const reverbere = (x, z, dx, dz) => {
      // Un fût et une lanterne, penchée vers la chaussée (dx, dz).
      poser('box', x, 3.1, z, 0.16, 6.2, 0.16, 0, 0, 0, MAT.METAL, [0.30, 0.31, 0.33], true);
      poser('octa', x + dx * 0.55, 6.0, z + dz * 0.55, 0.55, 0.8, 0.55, 0, 0, 0, MAT.LAQUE, [0.95, 0.92, 0.80], true);
    };
    // Barrières de part et d'autre de la sortie de chaque QG : deux rangs de deux.
    qgPlan.forEach((q, f) => {
      const [sx, sz] = qg[f].sortie, vx = -q.uz, vz = q.ux, lacet = lacetDe(q.ux, q.uz);
      for (const s of [-1, 1]) for (const k of [0, 1]) for (const rang of [0, 1]) {
        const x = sx + vx * s * (8.5 + k * 2.3) - q.ux * rang * 3.2, z = sz + vz * s * (8.5 + k * 2.3) - q.uz * rang * 3.2;
        if (praticable(x, z)) barriere(x, z, lacet + DEMI_PI);
      }
    });
    // Lieux : un dallage clair, des bancs tournés vers le centre, deux réverbères.
    for (const l of lieux) {
      poser('cylinder', l.x, Y_PLACE + 0.012, l.z, 2 * l.rayon, 0.03, 2 * l.rayon, 0, 0, 0, MAT.PAVE, [0.86, 0.82, 0.73]);
      poser('cylinder', l.x, Y_PLACE + 0.018, l.z, 4.2, 0.03, 4.2, 0, 0, 0, MAT.PAVE, [0.66, 0.60, 0.52]);
      for (let k = 0; k < 6; k++) {
        const a = k * PI / 3 + 0.3, d = l.rayon * 0.62, x = l.x + cosinus(a) * d, z = l.z + sinus(a) * d;
        if (largeurLibre(x, z) > 1.5) banc(x, z, lacetDe(-sinus(a), cosinus(a)));
      }
      for (const s of [-1, 1]) {
        const x = l.x + s * l.rayon * 0.35, z = l.z + s * l.rayon * 0.2;
        if (largeurLibre(x, z) > 1) reverbere(x, z, 0, 0);
      }
    }
    // Marchés : un sol de pierre, des étals sous auvents en couronne (bâches bleues et caisses de glace au marché aux poissons).
    gisements.forEach((g, k) => {
      if (g.sorte !== 'moyens') return;
      const poissons = !!lots[k].poissons;
      poser('cylinder', g.x, Y_PLACE + 0.012, g.z, 2 * g.rayon + 4, 0.03, 2 * g.rayon + 4, 0, 0, 0, MAT.PAVE, [0.76, 0.72, 0.64]);
      for (let e = 0; e < 8; e++) {
        const a = e * PI / 4 + PI / 8, sx = g.x + sinus(a) * 7.4, sz = g.z + cosinus(a) * 7.4;
        if (largeurLibre(sx, sz) < 0.8) continue;
        const p = repere(sx, sz, a + PI), toile = poissons ? (e % 2 ? [0.18, 0.42, 0.66] : [0.90, 0.90, 0.88]) : r.choix(AUVENTS);
        objets.push(p('box', 0, 0, 0, 2.4, 0.85, 1.1, poissons ? [0.80, 0.80, 0.78] : [0.55, 0.40, 0.26], poissons ? MAT.METAL : MAT.ECORCE));
        for (const [u, v] of [[-1.25, -0.6], [1.25, -0.6], [-1.25, 0.6], [1.25, 0.6]]) objets.push(p('cylinder', u, v, 0, 0.07, 2.35, 0.07, [0.35, 0.36, 0.38], MAT.METAL));
        objets.push(p('box', 0, 0, 2.35, 2.9, 0.07, 1.8, toile, MAT.TISSU, [0.16, 0, 0]));
        if (poissons) for (const u of [-0.7, 0, 0.7]) objets.push(p('box', u, 0.1, 0.85, 0.6, 0.18, 0.45, [0.70, 0.78, 0.82], MAT.LAQUE));
      }
    });
    // Chantiers : terrain vague clos de palissades, tas de sable, palettes, une grue un chantier sur deux.
    let nbGrues = 0;
    gisements.forEach((g, k) => {
      if (g.sorte !== 'materiaux') return;
      const c = lots[k], R0 = c.rayon - 1;
      poser('box', c.x, Y_PLACE + 0.012 - 0.015, c.z, 2 * R0, 0.03, 2 * R0, 0, 0, 0, MAT.ROCHE, [0.62, 0.56, 0.45]);
      const panneau = [0.86, 0.87, 0.85];
      for (let q = 0; q < 4; q++) {
        const ax = [[1, 0], [0, 1], [-1, 0], [0, -1]][q];
        for (let u = -R0 + 1.6; u <= R0 - 1.6; u += 3.1) {
          if (Math.abs(u) < 4.5) continue;                 // l'entrée du chantier
          const x = c.x + ax[0] * R0 - ax[1] * u, z = c.z + ax[1] * R0 + ax[0] * u;
          if (!surTerre(x, z) || !ouvertEn(x, z)) continue;
          pose('box', x, 0, z, 0.06, 2.0, 3.0, panneau, MAT.METAL, lacetDe(ax[0], ax[1]), true);
        }
      }
      for (let q = 0; q < 3; q++) {
        const a = q * 2.1 + 0.4, x = c.x + cosinus(a) * R0 * 0.55, z = c.z + sinus(a) * R0 * 0.55;
        pose('cone', x, Y_PLACE, z, 3.4, 1.3, 3.4, [0.84, 0.74, 0.52], MAT.ROCHE);
        pose('box', x + 2.6, Y_PLACE, z, 1.2, 0.5, 1.0, [0.62, 0.50, 0.34], MAT.ECORCE, a, true);
      }
      if (nbGrues++ % 2 === 0) {
        const jaune = [0.92, 0.72, 0.16], gx = c.x + R0 * 0.5, gz = c.z - R0 * 0.5;
        pose('box', gx, 0, gz, 1.6, 26, 1.6, jaune, MAT.METAL, 0, true);
        pose('box', gx - 6, 26, gz, 26, 1.1, 1.1, jaune, MAT.METAL, 0, true);
        pose('box', gx + 8.4, 24.6, gz, 2.6, 1.4, 1.8, [0.42, 0.42, 0.42], MAT.BETON);
        pose('box', gx, 27.1, gz, 0.6, 3.2, 0.6, jaune, MAT.METAL, 0, true);
      }
    });
    marquer('sites');
    chrono('sites-decor');

    // ---- 12. Le port : des bateaux amarrés en rangs le long des pontons (coque, cabine, mât, voile ferlée). ----
    const occupe = new Uint8Array(TD.N);
    const libreEau = (x, z, ux, uz, a, b) => {
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [1, 0], [-1, 0]]) {
        const px = x + su * a * ux - sv * b * uz, pz = z + su * a * uz + sv * b * ux, k = caseDe(TD, px, pz);
        if (k < 0 || terre[k] || occupe[k]) return false;
      }
      return true;
    };
    let nbBateaux = 0;
    const maxBateaux = ilots <= 9 ? 420 : ilots <= 13 ? 620 : 760;
    for (const [ax, az, , , L, ux, uz] of pontons) {
      const vx = -uz, vz = ux;
      for (const s of [-1, 1]) {
        let t = 1.5 + r() * 2;
        while (t < L - 1.5 && nbBateaux < maxBateaux) {
          // Un bateau sur cinq est une barque (le pointu marseillais) : courte, peinte, sans cabine ni mât.
          const barque = r() < 0.2, lb = barque ? r.entre(4.5, 6) : r.entre(6.5, 11.5), bb = lb * (barque ? 0.36 : r.entre(0.30, 0.36)), voile = !barque && r() < 0.6;
          const d = 1.3 + lb / 2 + 0.3, x = ax + ux * t + s * vx * d, z = az + uz * t + s * vz * d;
          if (!enDecor(x, z) || !libreEau(x, z, vx * s, vz * s, lb / 2, bb / 2)) { t += 2; continue; }
          if (r() < 0.12) { t += bb + 1; continue; }
          remplirBoite(TD, occupe, x, z, vx, vz, lb / 2 + 0.2, bb / 2 + 0.2, 1);
          const lacet = lacetDe(vx * s, vz * s), coque = r.choix(COQUES), loin = !enDetail(x, z);
          poser('bevel', x, NIVEAU_EAU + 0.3, z, lb, 1.1, bb, 0, lacet, 0, MAT.LAQUE, nuance(r, coque, 0.03), true);
          if (barque) {
            if (!loin) poser('box', x, NIVEAU_EAU + 0.88, z, lb * 0.9, 0.12, bb * 1.02, 0, lacet, 0, MAT.LAQUE, r.choix(BANDES_BARQUE), true);
            nbBateaux++;
            t += bb + r.entre(0.5, 1.2);
            continue;
          }
          if (!loin || r() < 0.5) poser('box', x + s * vx * lb * 0.08, NIVEAU_EAU + 1.05, z + s * vz * lb * 0.08, lb * 0.38, 0.75, bb * 0.62, 0, lacet, 0, MAT.MAT, [0.94, 0.94, 0.92], true);
          if (voile) {
            const hm = lb * 1.35;
            poser('box', x - s * vx * lb * 0.05, NIVEAU_EAU + 0.8 + hm / 2, z - s * vz * lb * 0.05, 0.12, hm, 0.12, 0, lacet, 0, MAT.METAL, [0.85, 0.86, 0.88], true);
            if (!loin) poser('box', x - s * vx * lb * 0.25, NIVEAU_EAU + 2.1, z - s * vz * lb * 0.25, lb * 0.42, 0.26, 0.26, 0, lacet, 0, MAT.TISSU, r() < 0.5 ? [0.16, 0.30, 0.55] : [0.92, 0.92, 0.90], true);
          }
          nbBateaux++;
          t += bb + r.entre(0.5, 1.2);
        }
      }
    }
    marquer('port');
    chrono('port');

    // ---- 13. Les rues : réverbères, platanes des cours, voitures garées, poubelles, vitrines, abribus. ----
    const rv = hasard(0xB0A7 + ilots);
    let nbReverberes = 0;
    const COURS = /^(Cours |Allées? |Boulevard |La Canebière|Place du Général de Gaulle|Quai du Port|Quai de Rive-Neuve|Quai des Belges)/;
    (() => { for (const [ax, az, bx, bz, w, sorte, rue, loin] of segmentsVoies) {
      if (loin) continue;
      const L = longueur(bx - ax, bz - az);
      if (L < 6) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, vx = -uz, vz = ux, lacet = lacetDe(ux, uz);
      const route = VOIES[sorte][2] === 'asphalte';
      // Réverbères en quinconce sur les voies nommées.
      if ((route && sorte !== 'desserte') || rue.nom) {
        for (let t = 8 + rv() * 6, cote = 1; t < L - 4; t += 28, cote = -cote) {
          const d = w / 2 + 0.8, x = ax + ux * t + cote * vx * d, z = az + uz * t + cote * vz * d;
          if (!surTerre(x, z) || largeurLibre(x, z) < 0.6) continue;
          reverbere(x, z, -cote * vx, -cote * vz);
          nbReverberes++;
        }
      }
      // Platanes le long des cours et des quais.
      if (COURS.test(rue.nom || '')) {
        for (let t = 5 + rv() * 3; t < L - 3; t += 9.5) {
          for (const cote of [-1, 1]) {
            const d = w / 2 + 2.2, x = ax + ux * t + cote * vx * d, z = az + uz * t + cote * vz * d;
            if (!surTerre(x, z) || largeurLibre(x, z) < 1.8) continue;
            arbre(x, z, rv.entre(0.95, 1.2));
          }
        }
      }
      // Voitures garées le long des rues (cassables).
      if (route && w >= 5.8 && sorte !== 'voie-express' && sorte !== 'voie-bus') {
        for (const cote of [-1, 1]) {
          if (rc() > (sorte === 'rue' || sorte === 'tertiaire' ? 0.8 : 0.55)) continue;
          let t = 7 + rc() * 4;
          while (t < L - 8) {
            const v = cote * (w / 2 - 1.1), x = ax + ux * (t + 2.1) + vx * v, z = az + uz * (t + 2.1) + vz * v;
            let place = true;
            for (const [du, dv] of [[-2.2, -0.95], [2.2, -0.95], [2.2, 0.95], [-2.2, 0.95]]) {
              if (!praticable(x + ux * du + vx * dv, z + uz * du + vz * dv)) { place = false; break; }
            }
            if (place) {
              const c = nuance(rc, rc.choix(VOITURES), 0.03), p = repere(x, z, lacet);
              casser('voiture', x, z, lacet, [p('box', 0, 0, 0, 3.6, 0.32, 1.6, [0.07, 0.07, 0.08], MAT.MAT),
                p('box', 0, 0, 0.3, 4.2, 0.72, 1.8, c, MAT.LAQUE), p('box', -0.2, 0, 1.02, 2.2, 0.55, 1.6, fois(c, 0.45), MAT.LAQUE)]);
            }
            t += 4.2 + rc.entre(0.8, 3.5);
            if (rc() < 0.18) t += rc.entre(5, 12);
          }
        }
      }
      // Poubelles sur les trottoirs, une tous les 40 m environ.
      for (let t = 6 + rc() * 20; t < L - 4; t += 32 + rc() * 16) {
        const cote = rc() < 0.5 ? -1 : 1, d = w / 2 + 0.9;
        const x = ax + ux * t + cote * vx * d, z = az + uz * t + cote * vz * d;
        if (praticable(x, z) && largeurLibre(x, z) > 0.5) poubelle(x, z);
      }
      // Vitrines des rues commerçantes : un rez-de-chaussée vitré sous un store, contre la façade.
      if (GRANDS.test(rue.nom || '') || sorte === 'pietonne' || (sorte === 'rue' && rc() < 0.35)) {
        for (let t = 4 + rc() * 6; t < L - 4; t += 9 + rc() * 9) {
          const cote = rc() < 0.5 ? -1 : 1;
          let x = ax + ux * t, z = az + uz * t, d = 0, trouve = false;
          for (let s = w / 2; s < w / 2 + 9; s += 0.5) {
            const k = caseDe(TP, x + cote * vx * s, z + cote * vz * s);
            if (k < 0) break;
            if (!libre[k]) { d = s - 0.6; trouve = true; break; }
          }
          if (!trouve) continue;
          x += cote * vx * d; z += cote * vz * d;
          if (!praticable(x - cote * vx * 0.8, z - cote * vz * 0.8)) continue;
          const wv = rc.entre(3, 5), p = repere(x, z, lacet), verre = nuance(rc, [0.20, 0.27, 0.32], 0.03), toile = rc.choix(AUVENTS), sens = cote > 0 ? -1 : 1;
          casser('vitrine', x, z, lacet, [p('box', 0, 0, 0.35, wv, 2.5, 0.08, verre, MAT.LAQUE),
            p('box', 0, 0, 2.85, wv + 0.2, 0.16, 0.14, [0.16, 0.16, 0.17], MAT.MAT),
            p('box', 0, sens * 0.55, 2.95, wv + 0.3, 0.06, 1.1, toile, MAT.TISSU, [sens * 0.22, 0, 0])]);
        }
      }
    } })();
    // Abribus aux arrêts de bus et de tram du plan.
    const abribus = (x, z, lacet) => {
      const p = repere(x, z, lacet), verre = [0.30, 0.38, 0.42], fer2 = [0.34, 0.35, 0.37];
      casser('abribus', x, z, lacet, [p('box', 0, 0, 2.45, 4.4, 0.1, 1.8, fer2, MAT.METAL), p('box', 0, 0.75, 0.2, 4.2, 2.2, 0.06, verre, MAT.LAQUE),
        p('box', -2.1, 0.1, 0.2, 0.06, 2.2, 1.3, verre, MAT.LAQUE), p('cylinder', -2.15, 0.8, 0, 0.1, 2.45, 0.1, fer2, MAT.METAL),
        p('cylinder', 2.15, 0.8, 0, 0.1, 2.45, 0.1, fer2, MAT.METAL), p('box', 0.3, 0.45, 0.45, 2.6, 0.08, 0.42, fer2, MAT.METAL)]);
    };
    const abris = [];
    for (const a of arrets) {
      if (!dedans(a.x, a.z, -3)) continue;
      const lacet = lacetDe(a.ux, a.uz);
      for (const s of a.a > 9 ? [-0.5, 0.5] : [0]) {
        const x = a.x + a.ux * a.a * s, z = a.z + a.uz * a.a * s;
        if (!praticable(x, z) || abris.some(([u, w]) => longueur(u - x, w - z) < 8)) continue;
        abribus(x, z, lacet);
        abris.push([x, z]);
      }
    }
    for (const q of P.reperes) {
      if ((q.sorte !== 'tram' && q.sorte !== 'metro') || !dedans(q.x, q.z, -5)) continue;
      const [x, z] = accrocher(q.x + 3, q.z, 1.5);
      if (abris.some(([u, w]) => longueur(u - x, w - z) < 15)) continue;
      abribus(x, z, 0);
      abris.push([x, z]);
    }
    // Bancs le long des quais, face à l'eau.
    for (const e of eaux) {
      if (e.sorte !== 'port') continue;
      const p = e.points, m = p.length / 2;
      for (let k = 0; k < m; k++) {
        const q = (k + 1) % m, ax = p[2 * k], az = p[2 * k + 1], bx = p[2 * q], bz = p[2 * q + 1], L = longueur(bx - ax, bz - az);
        if (L < 10) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L, tx = uz, tz = -ux;
        for (let t = 6; t < L - 4; t += 22) {
          const x = ax + ux * t + tx * 4, z = az + uz * t + tz * 4;
          if (praticable(x, z) && largeurLibre(x, z) > 1.5) banc(x, z, lacetDe(ux, uz) + PI);
        }
      }
    }
    // Le mobilier d'OpenStreetMap (P.mobilier) : chaque point est ramené sur le praticable le plus proche (12 m au plus).
    // Dans le carré de jeu, ce qui brûle est cassable (terrasses, corbeilles, conteneurs, abris, kiosques, deux-roues) ;
    // le reste est un décor fixe, posé seulement dans la zone de détail.
    const conteneur = (x, z, lacet) => {
      const p = repere(x, z, lacet), c = rc() < 0.6 ? [0.22, 0.36, 0.26] : rc() < 0.5 ? [0.40, 0.42, 0.44] : [0.62, 0.50, 0.20];
      casser('conteneur', x, z, lacet, [p('box', 0, 0, 0.12, 1.36, 1.05, 1.0, c, MAT.LAQUE), p('box', 0, 0, 1.17, 1.42, 0.08, 1.06, fois(c, 0.7), MAT.MAT),
        p('box', 0, 0, 0, 1.2, 0.12, 0.9, [0.12, 0.12, 0.13], MAT.MAT)]);
    };
    const kiosque = (x, z, lacet) => {
      const p = repere(x, z, lacet), vert = [0.16, 0.32, 0.24];
      casser('kiosque', x, z, lacet, [p('box', 0, 0, 0, 3.0, 2.5, 2.1, vert, MAT.LAQUE), p('box', 0, 0, 2.5, 3.6, 0.22, 2.7, fois(vert, 0.8), MAT.LAQUE),
        p('box', 0, 1.15, 0.9, 2.6, 0.9, 0.3, [0.86, 0.80, 0.62], MAT.TISSU), p('box', 0, 0, 2.72, 1.6, 0.5, 0.12, [0.90, 0.88, 0.80], MAT.LAQUE)]);
    };
    const TOILES = [[0.92, 0.90, 0.84], [0.80, 0.22, 0.18], [0.20, 0.30, 0.42], [0.86, 0.76, 0.52], [0.30, 0.42, 0.30]];
    const terrasse = (x, z, lacet) => {
      const p = repere(x, z, lacet), bois = rc() < 0.5 ? [0.40, 0.30, 0.20] : [0.30, 0.31, 0.33], toile = rc.choix(TOILES), pieces = [];
      // Trois guéridons en ligne le long de la façade, deux chaises chacun, deux parasols.
      for (const u of [-1.9, 0, 1.9]) {
        pieces.push(p('cylinder', u, 0, 0.72, 0.75, 0.04, 0.75, [0.86, 0.85, 0.82], MAT.LAQUE), p('cylinder', u, 0, 0, 0.07, 0.72, 0.07, [0.2, 0.2, 0.21], MAT.METAL));
        for (const v of [-0.62, 0.62]) pieces.push(p('box', u, v, 0, 0.42, 0.88, 0.40, bois, MAT.ECORCE));
      }
      for (const u of [-1.0, 1.0]) pieces.push(p('cylinder', u, 0, 0, 0.07, 2.35, 0.07, [0.85, 0.85, 0.82], MAT.METAL), p('cone', u, 0, 2.05, 2.6, 0.5, 2.4, toile, MAT.TISSU));
      casser('terrasse', x, z, lacet, pieces);
    };
    const COULEURS_2R = [[0.12, 0.12, 0.13], [0.85, 0.85, 0.83], [0.55, 0.08, 0.08], [0.18, 0.28, 0.48], [0.62, 0.62, 0.64], [0.80, 0.62, 0.18]];
    const deuxRoues = (x, z, lacet) => {
      const p = repere(x, z, lacet), c = rc.choix(COULEURS_2R), noir = [0.08, 0.08, 0.09];
      casser('deux-roues', x, z, lacet, [p('box', 0, 0, 0.3, 1.25, 0.42, 0.42, c, MAT.LAQUE), p('box', -0.62, 0, 0, 0.5, 0.5, 0.12, noir, MAT.MAT),
        p('box', 0.66, 0, 0, 0.5, 0.5, 0.12, noir, MAT.MAT), p('box', 0.42, 0, 0.75, 0.12, 0.42, 0.62, fois(c, 0.6), MAT.METAL)]);
    };
    const corbeilles = [], places2R = [];
    const ancrer = (x, z, marge) => {
      const q = accrocher(x, z, marge);
      return longueur(q[0] - x, q[1] - z) <= 12 ? q : null;
    };
    /** Lacet d'un objet posé le long de la façade la plus proche (8 directions, 10 m au plus) ; sinon, celui donné. */
    const leLongDeLaFacade = (x, z, sinon) => {
      let best = 11, lacet = sinon;
      for (let d = 0; d < 8; d++) {
        const a = d * PI / 4, cx = cosinus(a), sz = sinus(a);
        for (let t = 1; t < best; t += 1) if (!ouvertEn(x + cx * t, z + sz * t)) { best = t; lacet = lacetDe(-sz, cx); break; }
      }
      return lacet;
    };
    let nbMobilier = 0;
    (() => { for (let k = 0; k < P.mobilier.length; k++) {
      const m = P.mobilier[k], dans = dedans(m.x, m.z, -2);
      if (!dans && !enDetail(m.x, m.z)) continue;
      const lacet = hacher(k, 71) * PI, s = m.sorte;
      if (dans && (s === 'terrasse' || s === 'conteneur' || s === 'kiosque' || s === 'corbeille' || s === 'abri' || s === 'motos')) {
        const q = ancrer(m.x, m.z, s === 'terrasse' || s === 'kiosque' ? 2.2 : 1.2);
        if (!q || !praticable(q[0], q[1])) continue;
        const [x, z] = q;
        if (s === 'terrasse') terrasse(x, z, leLongDeLaFacade(x, z, lacet));
        else if (s === 'conteneur') conteneur(x, z, lacet);
        else if (s === 'kiosque') kiosque(x, z, lacet);
        else if (s === 'corbeille') { if (corbeilles.some(([u, w]) => longueur(u - x, w - z) < 3)) continue; corbeilles.push([x, z]); poubelle(x, z); }
        else if (s === 'abri') { if (abris.some(([u, w]) => longueur(u - x, w - z) < 8)) continue; abribus(x, z, lacet); abris.push([x, z]); }
        else for (let j = -1; j <= 1; j++) {
          const ca = cosinus(lacet), sa = sinus(lacet), px = x - j * 0.95 * sa, pz = z - j * 0.95 * ca;
          if (praticable(px, pz)) deuxRoues(px, pz, lacet + DEMI_PI);
        }
        nbMobilier++;
        continue;
      }
      if (!enDetail(m.x, m.z)) continue;
      const q = ancrer(m.x, m.z, 0.8);
      if (!q) continue;
      const [x, z] = q, gris = [0.24, 0.25, 0.26];
      if (s === 'potelet') pose('cylinder', x, Y_VOIE, z, 0.13, 0.9, 0.13, gris, MAT.METAL, 0, true);
      else if (s === 'boite-lettres') { pose('box', x, Y_VOIE, z, 0.08, 0.9, 0.08, gris, MAT.METAL, lacet, true); pose('box', x, 0.9, z, 0.46, 0.62, 0.34, [0.95, 0.78, 0.12], MAT.LAQUE, lacet, true); }
      else if (s === 'fontaine-a-boire') pose('cylinder', x, Y_VOIE, z, 0.4, 1.05, 0.4, [0.18, 0.30, 0.24], MAT.LAQUE, 0, true);
      else if (s === 'toilettes') pose('box', x, Y_VOIE, z, 2.6, 2.6, 1.7, [0.70, 0.70, 0.66], MAT.LAQUE, lacet, true);
      else if (s === 'oeuvre') { pose('box', x, Y_VOIE, z, 1.3, 1.5, 1.3, [0.86, 0.83, 0.76], MAT.BETON, lacet, true); pose('cone', x, 1.5, z, 0.8, 1.3, 0.8, [0.32, 0.30, 0.24], MAT.METAL, lacet); }
      else if (s === 'panneau') { pose('box', x, Y_VOIE, z, 0.1, 2.2, 0.1, gris, MAT.METAL, lacet, true); pose('box', x, 1.1, z, 1.2, 1.6, 0.1, [0.20, 0.30, 0.40], MAT.LAQUE, lacet, true); }
      else if (s === 'arret-bus') { pose('box', x, Y_VOIE, z, 0.1, 2.7, 0.1, gris, MAT.METAL, lacet, true); pose('box', x, 2.3, z, 0.6, 0.45, 0.08, [0.12, 0.40, 0.62], MAT.LAQUE, lacet, true); }
      else if (s === 'velos' || s === 'velos-partage') {
        const ca = cosinus(lacet), sa = sinus(lacet), n = s === 'velos' ? 3 : 4;
        for (let j = 0; j < n; j++) {
          const u = (j - (n - 1) / 2) * 0.8, px = x + u * ca, pz = z - u * sa;
          pose('box', px, Y_VOIE, pz, 0.06, 0.8, 0.7, gris, MAT.METAL, lacet, true);
          if (s === 'velos-partage' || hacher(k, 80 + j) < 0.5) pose('box', px + 0.1 * ca, 0.3, pz - 0.1 * sa, 0.06, 0.55, 1.7, s === 'velos-partage' ? [0.85, 0.85, 0.82] : r.choix(COULEURS_2R), MAT.LAQUE, lacet, true);
        }
        if (s === 'velos-partage') pose('box', x - ((n + 1) / 2) * 0.8 * ca, Y_VOIE, z + ((n + 1) / 2) * 0.8 * sa, 0.35, 1.6, 0.3, [0.85, 0.85, 0.82], MAT.LAQUE, lacet, true);
      } else continue;
      nbMobilier++;
    } })();
    // Deux-roues garés en épi au bord des trottoirs, par petits groupes : Marseille en est pleine.
    (() => { for (const [ax, az, bx, bz, w, sorte, , loin] of segmentsVoies) {
      if (loin || VOIES[sorte][2] !== 'asphalte' || w < 5 || sorte === 'voie-express') continue;
      const L = longueur(bx - ax, bz - az);
      if (L < 14) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, vx = -uz, vz = ux, lacet = lacetDe(vx, vz);
      for (const cote of [-1, 1]) {
        if (rc() > 0.16) continue;
        const t0 = 4 + rc() * (L - 10), n = 2 + Math.floor(rc() * 4), d = w / 2 + 0.75;
        for (let j = 0; j < n; j++) {
          const t = t0 + j * 0.95, x = ax + ux * t + cote * vx * d, z = az + uz * t + cote * vz * d;
          if (!dedans(x, z, -2) || !praticable(x, z) || largeurLibre(x, z) < 0.9) continue;
          if (places2R.length && places2R.some(([u, q]) => longueur(u - x, q - z) < 0.8)) continue;
          places2R.push([x, z]);
          deuxRoues(x, z, lacet);
        }
      }
    } })();
    marquer('mobilier-osm');
    // Parcs et jardins : des arbres.
    for (const pq of parcs) {
      const p = pq.polygone, A = aire(p);
      if (A < 150) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let q = 0; q < p.length; q += 2) { x0 = Math.min(x0, p[q]); x1 = Math.max(x1, p[q]); z0 = Math.min(z0, p[q + 1]); z1 = Math.max(z1, p[q + 1]); }
      const nb = Math.min(30, Math.floor(A / 140));
      for (let k = 0, essais = 0; k < nb && essais < nb * 4; essais++) {
        const x = r.entre(x0, x1), z = r.entre(z0, z1);
        if (!dansAnneau(p, x, z) || !enDetail(x, z) || !surTerre(x, z) || !ouvertEn(x, z)) continue;
        arbre(x, z, r.entre(0.9, 1.3), r() < 0.7);
        k++;
      }
    }
    marquer('mobilier');
    chrono('mobilier');

    // ---- 14. Le lointain : ce que l'on voit des bords du carré sans pouvoir y aller (P.lointain). ----
    // Le sol au-delà du décor, troué par la mer et les bassins ; le bâti du plan entre le décor et le bord des données
    // (9 îlots) ; les boîtes du bâti lointain avec un toit de tuiles ; les grands espaces verts et les grandes voies ;
    // la colline de la Garde et les monuments nommés, habillés selon leur modèle.
    let nbLointain = 0;
    (() => {
      const LZ = P.lointain, zone = LZ ? LZ.zone : P.etendue;
      // Hauteur de la colline de la Garde (demi-ellipsoïde posé sur le sommet du plan) : le lointain s'y pose.
      const som = LZ && LZ.sommets.length ? LZ.sommets[0] : null;
      const HA = 430, HB = 380;   // demi-axes de la colline (m) : est-ouest, nord-sud ; ses pentes portent le bâti
      const colline = (x, z) => {
        if (!som) return 0;
        const u = (x - som.x) / HA, w = (z - som.z) / HB, q = 1 - u * u - w * w;
        return q > 0 ? som.altitude * Math.sqrt(q) : 0;
      };
      // Le sol : cases de 5 m de -R à R, alignées sur le bord du décor ; l'eau du lointain (et du plan) les troue.
      const R = 1500, C = 5, nG = (2 * R) / C, eauG = new Uint8Array(nG * nG);
      const remplir = anneaux => {
        // Balayage par rangée : une case est d'eau si son centre est dedans (pair-impair sur les anneaux du polygone).
        let z0 = Infinity, z1 = -Infinity;
        for (const a of anneaux) for (let k = 1; k < a.length; k += 2) { if (a[k] < z0) z0 = a[k]; if (a[k] > z1) z1 = a[k]; }
        const j0 = Math.max(0, Math.floor((z0 + R) / C)), j1 = Math.min(nG - 1, Math.floor((z1 + R) / C));
        const xs = [];
        for (let j = j0; j <= j1; j++) {
          const zc = -R + (j + 0.5) * C;
          xs.length = 0;
          for (const a of anneaux) {
            const m = a.length / 2;
            for (let k = 0; k < m; k++) {
              const q = (k + 1) % m, az = a[2 * k + 1], bz = a[2 * q + 1];
              if ((az <= zc) !== (bz <= zc)) xs.push(a[2 * k] + (zc - az) * (a[2 * q] - a[2 * k]) / (bz - az));
            }
          }
          xs.sort((u, v) => u - v);
          for (let k = 0; k + 1 < xs.length; k += 2) {
            const i0 = Math.max(0, Math.ceil((xs[k] + R) / C - 0.5)), i1 = Math.min(nG - 1, Math.floor((xs[k + 1] + R) / C - 0.5));
            for (let i = i0; i <= i1; i++) eauG[i + j * nG] ^= 1;
          }
        }
      };
      const tampon = new Uint8Array(nG * nG);
      const eauxLoin = LZ ? LZ.eau : P.eau;
      for (const e of [...eauxLoin, ...(LZ ? P.eau : [])]) {
        if (e.sorte === 'piscine') continue;
        tampon.set(eauG); eauG.fill(0);
        remplir([e.points, ...e.trous]);
        for (let c = 0; c < eauG.length; c++) eauG[c] |= tampon[c];
      }
      const merLoin = AM.merLoin || [];
      const plein = new Uint8Array(nG * nG), dansDecor = (x, z) => x > -D && x < D && z > -D && z < D;
      for (let j = 0; j < nG; j++) for (let i = 0; i < nG; i++) {
        const x = -R + (i + 0.5) * C, z = -R + (j + 0.5) * C, c = i + j * nG;
        if (dansDecor(x, z) || eauG[c]) continue;
        if (merLoin.some(([a0, b0, a1, b1]) => x >= a0 && x <= a1 && z >= b0 && z <= b1)) continue;
        plein[c] = 1;
      }
      const SOL_LOIN = [0.68, 0.64, 0.57];
      for (const q of rectangles(plein, nG, 0, nG - 1, 0, nG - 1, 1 << 15)) {
        const x0 = -R + q.i0 * C, x1 = -R + (q.i1 + 1) * C, z0 = -R + q.j0 * C, z1 = -R + (q.j1 + 1) * C;
        poser('box', (x0 + x1) / 2, -0.015, (z0 + z1) / 2, x1 - x0, 0.03, z1 - z0, 0, 0, 0, MAT.PAVE, SOL_LOIN);
      }
      // Au-delà : de grandes bandes, sauf sur la mer.
      const B = 4000;
      const bandes = [[R + B / 2, 0, B, 2 * R + 2 * B], [0, R + B / 2, 2 * R, B], [0, -R - B / 2, 2 * R, B], [-R - B / 2, 0, B, 2 * R + 2 * B]];
      for (const [x, z, lx, lz] of bandes) {
        // Une bande touchée par la mer est coupée là où la mer commence (côté ouest à Marseille).
        let x0 = x - lx / 2, x1 = x + lx / 2;
        for (const [a0, b0, a1, b1] of merLoin) if (z - lz / 2 >= b0 - 1 && z + lz / 2 <= b1 + 1 && a0 <= x0) x0 = Math.max(x0, a1);
        if (x1 - x0 > 1) poser('box', (x0 + x1) / 2, -0.03, z, x1 - x0, 0.03, lz, 0, 0, 0, MAT.PAVE, fois(SOL_LOIN, 0.95));
      }
      if (!LZ) return;

      const dansZone = (x, z) => x >= zone.x0 && x <= zone.x1 && z >= zone.z0 && z <= zone.z1;
      // Les grands espaces verts et les rochers.
      const VERTS_LOIN = { parc: [0.36, 0.48, 0.26], jardin: [0.38, 0.50, 0.26], pelouse: [0.42, 0.53, 0.28], bois: [0.28, 0.40, 0.22],
        terrain: [0.42, 0.54, 0.32], cimetiere: [0.44, 0.48, 0.36], roche: [0.66, 0.63, 0.56], sable: [0.86, 0.80, 0.64], plage: [0.86, 0.80, 0.64] };
      for (const e of LZ.espaces) {
        const c = VERTS_LOIN[e.sorte];
        if (!c) continue;
        const A = aire(e.points);
        for (const bx of decomposer(e.points, A > 20000 ? 6 : 3).map(boiteDe).filter(Boolean)) {
          if (dansDecor(bx.x, bx.z) || colline(bx.x, bx.z) > 0.5) continue;
          poser('box', bx.x, 0.005, bx.z, 2 * bx.a, 0.03, 2 * bx.b, 0, lacetDe(bx.ux, bx.uz), 0, e.sorte === 'roche' ? MAT.ROCHE : MAT.HERBE, c);
          nbLointain++;
        }
      }
      // Les grandes voies : des bandes d'asphalte (pas sur l'eau ni sur la colline).
      const LARGEUR_LOIN = { autoroute: 16, 'voie-express': 13, primaire: 11, secondaire: 10, tertiaire: 8 };
      for (const v of LZ.voies) {
        const w = LARGEUR_LOIN[v.classe] || 8, p = v.points;
        for (let k = 2; k < p.length; k += 2) {
          const ax = p[k - 2], az = p[k - 1], bx = p[k], bz = p[k + 1], L = longueur(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
          if (L < 2 || dansDecor(mx, mz) || colline(mx, mz) > 0.5) continue;
          const i = Math.floor((mx + R) / C), j = Math.floor((mz + R) / C);
          if (i >= 0 && j >= 0 && i < nG && j < nG && !plein[i + j * nG]) continue;
          poser('box', mx, 0.012, mz, L + w * 0.4, 0.03, w, 0, lacetDe((bx - ax) / L, (bz - az) / L), 0, MAT.ASPHALTE, [0.30, 0.30, 0.31]);
          nbLointain++;
        }
      }
      // Un bloc du lointain : corps enduit et, s'il n'est ni trop haut ni trop grand, un toit de tuiles.
      const bloc = (x, z, a, b, lacet, h, y0, k, couleur, mat) => {
        poser('box', x, y0 + h / 2, z, 2 * a, h, 2 * b, 0, lacet, 0, mat, couleur);
        nbLointain++;
        if (h < 32 && Math.max(a, b) < 45 && Math.min(a, b) > 2.5) {
          const pente = Math.min(Math.min(a, b) * TAN_P, 3.2);
          poser('box', x, y0 + h + pente / 2, z, 2 * a + 0.4, pente, 2 * b + 0.4, 0, lacet, 0, MAT.MAT, fois(TUILES[Math.floor(hacher(k, 47) * TUILES.length)], 0.95));
          nbLointain++;
        }
      };
      const hauteurPlausible = (k, x, z) => {
        // De quatre à sept étages près du port et du centre, plus bas sur les collines du sud et de l'est.
        const loin = longueur(x, z), et = 3 + Math.floor(hacher(k, 13) * (loin > 1100 ? 3 : 4.6));
        return 4.4 + (et - 1) * 3.15 + (hacher(k, 17) - 0.5) * 1.2;
      };
      const couleurDe = k => fois(ENDUITS[Math.floor(hacher(k, 23) * ENDUITS.length)], 0.97);
      // Le bâti du plan entre le bord du décor et celui des données : à 9 îlots, l'anneau de 480 à 610 m.
      if (D < LIMITE - 1) {
        for (let k = 0; k < P.batiments.length; k++) {
          const b = P.batiments[k];
          if (b.contour) continue;
          const p = b.points;
          let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
          for (let q = 0; q < p.length; q += 2) { if (p[q] < x0) x0 = p[q]; if (p[q] > x1) x1 = p[q]; if (p[q + 1] < z0) z0 = p[q + 1]; if (p[q + 1] > z1) z1 = p[q + 1]; }
          if (!(x1 < -D || x0 > D || z1 < -D || z0 > D)) continue;
          if (aire(p) < 12) continue;
          const bx = boiteMinimale(p);
          if (!bx) continue;
          const h = b.connue ? b.hauteur : hauteurPlausible(k, bx.x, bx.z);
          bloc(bx.x, bx.z, bx.a, bx.b, lacetDe(bx.ux, bx.uz), Math.max(3, h - (b.connue ? b.base : 0)), b.connue ? b.base : 0, k, b.couleur || couleurDe(k), MAT.FACADE - 0.45 + hacher(k, 53) * 0.9);
        }
      }
      // Les boîtes du bâti lointain (centre, demi-côtés a ≥ b, angle de l'axe a, hauteur ; 0 si OSM ne la dit pas).
      const Bx = LZ.boites;
      for (let k = 0, o = 0; o < Bx.length; k++, o += 6) {
        const x = Bx[o], z = Bx[o + 1], a = Bx[o + 2], b = Bx[o + 3], ang = Bx[o + 4];
        if (a < 1 || b < 1 || !dansZone(x, z)) continue;
        const h = Bx[o + 5] > 0 ? Bx[o + 5] : hauteurPlausible(k + 7000, x, z);
        bloc(x, z, a, b, -ang, h, colline(x, z), k + 7000, couleurDe(k + 7000), MAT.FACADE - 0.45 + hacher(k, 59) * 0.9);
      }
      // La colline de la Garde : roche et garrigue.
      if (som) {
        poser('sphere', som.x, 0, som.z, 2 * HA, 2 * som.altitude, 2 * HB, 0, 0, 0, MAT.ROCHE, [0.58, 0.56, 0.48]);
        poser('sphere', som.x + 60, -6, som.z + 40, 2 * HA * 0.55, 2 * som.altitude * 0.96, 2 * HB * 0.5, 0, -0.3, 0, MAT.HERBE, [0.40, 0.44, 0.30]);
        poser('sphere', som.x - 70, -6, som.z - 30, 2 * HA * 0.45, 2 * som.altitude * 0.94, 2 * HB * 0.45, 0, 0.4, 0, MAT.HERBE, [0.38, 0.42, 0.29]);
        nbLointain += 3;
      }
      // Les monuments nommés du lointain : leurs bâtiments gardent leur emprise ; le modèle les habille.
      const MODELES = {
        major: { couleur: [0.86, 0.82, 0.72], bande: [0.36, 0.44, 0.38], h: 22, coupoles: 5 },
        'fort-saint-jean': { couleur: PIERRE_FORT, h: 14, merlons: true },
        'fort-saint-nicolas': { couleur: PIERRE_FORT, h: 12, merlons: true },
        'saint-laurent': { couleur: PIERRE_BLONDE, h: 11, fleche: 1 },
        'saint-victor': { couleur: [0.80, 0.70, 0.58], h: 16, merlons: true },
        garde: { couleur: [0.88, 0.85, 0.78], bande: [0.40, 0.46, 0.40], h: 8, statue: true },
        'villa-mediterranee': { couleur: [0.92, 0.92, 0.90], h: 19 },
        mucem: { couleur: [0.30, 0.30, 0.31], h: 18, toit: [0.66, 0.66, 0.64] },
        'porte-aix': { couleur: [0.90, 0.84, 0.72], h: 18, arc: true },
        reformes: { couleur: [0.80, 0.78, 0.74], h: 18, fleche: 2 },
      };
      const parRepere = LZ.reperes.map(() => []);
      for (const b of LZ.batiments) if (!b.contour && b.repere >= 0 && b.repere < parRepere.length) parRepere[b.repere].push(b);
      LZ.reperes.forEach((rp, ir) => {
        const md = MODELES[rp.modele] || { couleur: PIERRE_BLONDE, h: 12 };
        let haut = null;            // la boîte la plus haute : le clocher, la tour, la statue
        for (const b of parRepere[ir]) {
          const p = b.points, A = aire(p);
          if (A < 6) continue;
          const liste = A > 600 ? decomposer(p, 4).map(boiteDe).filter(Boolean) : [boiteMinimale(p)].filter(Boolean);
          const h = b.connue ? b.hauteur : md.h, y0 = (b.connue ? b.base : 0) + colline(rp.x, rp.z);
          for (const bx of liste) {
            let { a, b: bb, ux, uz } = bx;
            if (bb > a) { const t = a; a = bb; bb = t; const wx = -uz; uz = ux; ux = wx; }
            const lacet = lacetDe(ux, uz), hh = Math.max(2.5, h - (b.connue ? b.base : 0));
            if (md.arc) {
              // La porte d'Aix : deux piles, l'arc, l'attique.
              const p2 = repere(bx.x, bx.z, lacet);
              for (const s of [-1, 1]) objets.push(p2('box', s * a * 0.68, 0, y0, a * 0.64, hh * 0.72, 2 * bb, md.couleur, MAT.BETON, null, false));
              objets.push(p2('box', 0, 0, y0 + hh * 0.56, 2 * a * 0.4, hh * 0.16, 2 * bb, md.couleur, MAT.BETON, null, false));
              objets.push(p2('box', 0, 0, y0 + hh * 0.72, 2 * a + 0.4, hh * 0.28, 2 * bb + 0.4, fois(md.couleur, 0.96), MAT.BETON, null, false));
              nbLointain += 4;
              continue;
            }
            poser('box', bx.x, y0 + hh / 2, bx.z, 2 * a, hh, 2 * bb, 0, lacet, 0, MAT.PAVE, b.couleur || md.couleur);
            nbLointain++;
            if (md.bande && hh > 8) for (const t of [0.42, 0.74]) {
              poser('box', bx.x, y0 + hh * t, bx.z, 2 * a + 0.3, Math.min(1.4, hh * 0.06), 2 * bb + 0.3, 0, lacet, 0, MAT.MAT, md.bande);
              nbLointain++;
            }
            if (md.toit) { poser('box', bx.x, y0 + hh + 0.3, bx.z, 2 * a - 1, 0.6, 2 * bb - 1, 0, lacet, 0, MAT.MAT, md.toit); nbLointain++; }
            if (md.merlons && hh > 6) {
              // Créneaux : un merlon tous les 4 m sur les deux grands côtés.
              const p2 = repere(bx.x, bx.z, lacet), n = Math.min(14, Math.floor(2 * a / 4));
              for (let q = 0; q < n; q++) for (const s of [-1, 1]) objets.push(p2('box', -a + 2 + q * 4, s * (bb - 0.5), y0 + hh, 1.8, 1.4, 1.0, fois(md.couleur, 0.9), MAT.BETON));
              nbLointain += 2 * n;
            }
            if (!haut || y0 + hh > haut.y) haut = { x: bx.x, z: bx.z, a, b: bb, lacet, y: y0 + hh, aire: a * bb };
          }
        }
        if (!haut) return;
        const p2 = repere(haut.x, haut.z, haut.lacet);
        if (md.coupoles) {
          // La Major : coupoles sur les plus grandes boîtes, avec leur lanterne.
          const boites = [];
          for (const b of parRepere[ir]) if (aire(b.points) > 150) { const bx = boiteMinimale(b.points); if (bx) boites.push([bx, b]); }
          boites.sort((u, v) => v[0].a * v[0].b - u[0].a * u[0].b);
          for (const [bx, b] of boites.slice(0, md.coupoles)) {
            const r0 = Math.min(bx.a, bx.b) * 0.8, y = (b.connue ? b.hauteur : md.h);
            poser('cylinder', bx.x, y + 1.5, bx.z, 2 * r0, 3, 2 * r0, 0, 0, 0, MAT.PAVE, md.couleur);
            poser('sphere', bx.x, y + 3 + r0 * 0.1, bx.z, 2 * r0, 2 * r0 * 1.05, 2 * r0, 0, 0, 0, MAT.BETON, [0.42, 0.50, 0.44]);
            poser('cylinder', bx.x, y + 3 + r0 * 1.15, bx.z, 1.8, 3.2, 1.8, 0, 0, 0, MAT.PAVE, md.couleur);
            nbLointain += 3;
          }
        }
        if (md.fleche) {
          // Clochers à flèche : un (Saint-Laurent) ou deux (les Réformés) sur la plus haute boîte.
          const cote = Math.min(2 * haut.b, 6);
          for (let q = 0; q < md.fleche; q++) {
            const u = md.fleche === 2 ? (q ? 1 : -1) * Math.max(haut.a - cote / 2, 0) : 0;
            objets.push(p2('box', u, 0, haut.y, cote, md.fleche === 2 ? 12 : 6, cote, md.couleur, MAT.PAVE, null, false));
            objets.push(p2('cone', u, 0, haut.y + (md.fleche === 2 ? 12 : 6), cote * 0.95, md.fleche === 2 ? 22 : 9, cote * 0.95, fois(md.couleur, 0.85), MAT.BETON));
            nbLointain += 2;
          }
        }
        if (md.statue) {
          // Notre-Dame de la Garde : la Bonne Mère dorée au sommet du clocher, sur son socle.
          objets.push(p2('cylinder', 0, 0, haut.y, 4.4, 5, 4.4, md.couleur, MAT.PAVE, null, false));
          objets.push(p2('cone', 0, 0, haut.y + 5 + 5.5, 2.6, 5.5, 2.6, [1.0, 0.80, 0.34], MAT.METAL));
          objets.push(p2('sphere', 0, 0, haut.y + 5 + 10.2, 1.7, 2.2, 1.7, [1.0, 0.82, 0.38], MAT.METAL));
          nbLointain += 3;
        }
      });
    })();
    marquer('lointain');

    // ---- 15. Circulation : départs, points au hasard, itinéraires, carrefours ; grille praticable. ----
    function pointAuHasard(rd, x, z, rayon) {
      for (let essai = 0; essai < 64; essai++) {
        const a = rd() * DEUX_PI, d = Math.sqrt(rd()) * rayon;
        const p = accrocher(x + cosinus(a) * d, z + sinus(a) * d, 1);
        if (praticable(p[0], p[1])) return p;
      }
      return accrocher(x, z, 1);
    }
    function departs(faction, nb, graineDeparts) {
      const rd = hasard(graineDeparts * 40503 + faction * 977);
      const [ax, az] = qg[faction].sortie;
      const rayon = 70 + Math.sqrt(nb) * 11, points = [];
      for (let essai = 0; points.length < nb && essai < nb * 50; essai++) {
        const a = rd() * DEUX_PI, d = Math.sqrt(rd()) * rayon;
        const p = accrocher(ax + cosinus(a) * d, az + sinus(a) * d, 1.5);
        if (praticable(p[0], p[1])) points.push(p);
      }
      while (points.length < nb) points.push(accrocher(ax, az, 1.5));
      return points;
    }
    /** Étapes d'un trajet praticable (cases de 4 m, plus court chemin, puis lignes droites) ; arrivée comprise. */
    function itineraire(x0, z0, x1, z1) {
      [x0, z0] = accrocher(x0, z0);
      [x1, z1] = accrocher(x1, z1);
      const caseNav = (x, z) => {
        const i = borner(Math.floor((x - navX0) / 4), 0, nnx - 1), j = borner(Math.floor((z - navZ0) / 4), 0, nnz - 1);
        const c = i + j * nnx;
        if (navPiece.masque[c]) return c;
        let best = -1, dmin = Infinity;
        for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= nnx || b >= nnz || !navPiece.masque[a + b * nnx]) continue;
          if (di * di + dj * dj < dmin) { dmin = di * di + dj * dj; best = a + b * nnx; }
        }
        return best;
      };
      const ca = caseNav(x0, z0), cb = caseNav(x1, z1);
      if (ca < 0 || cb < 0 || ca === cb) return [[x1, z1]];
      const N2 = nnx * nnz, prec = new Int32Array(N2).fill(-1), file = new Int32Array(N2);
      let tete = 0, queue = 0;
      file[queue++] = ca; prec[ca] = ca;
      while (tete < queue && prec[cb] < 0) {
        const c = file[tete++], i = c % nnx, j = (c / nnx) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= nnx || b >= nnz) continue;
          const v = a + b * nnx;
          if (prec[v] >= 0 || !navPiece.masque[v]) continue;
          prec[v] = c; file[queue++] = v;
        }
      }
      if (prec[cb] < 0) return [[x1, z1]];
      const chemin = [];
      for (let c = cb; c !== ca; c = prec[c]) chemin.push(c);
      chemin.push(ca);
      chemin.reverse();
      const centreNav = c => [navX0 + (c % nnx) * 4 + 2, navZ0 + ((c / nnx) | 0) * 4 + 2];
      const voit = (a, b) => {
        const L = longueur(b[0] - a[0], b[1] - a[1]), nb = Math.max(1, Math.ceil(L));
        for (let k = 0; k <= nb; k++) if (!praticable(a[0] + (b[0] - a[0]) * k / nb, a[1] + (b[1] - a[1]) * k / nb)) return false;
        return true;
      };
      const etapes = [];
      let ici = [x0, z0], k = 0;
      while (k < chemin.length) {
        let loin2 = k;
        for (let q = chemin.length - 1; q > k; q--) if (voit(ici, centreNav(chemin[q]))) { loin2 = q; break; }
        if (loin2 === k) loin2 = k + 1;
        if (loin2 >= chemin.length) break;
        ici = centreNav(chemin[loin2]);
        if (loin2 === chemin.length - 1) break;
        etapes.push(ici);
        k = loin2;
      }
      etapes.push([x1, z1]);
      return etapes;
    }
    /** Carrefours tirés au hasard, loin des QG. */
    const listeCarrefours = [];
    {
      const degre = new Map();
      for (const a of aretes) { degre.set(a.a, (degre.get(a.a) || 0) + 1); degre.set(a.b, (degre.get(a.b) || 0) + 1); }
      for (const [id, d] of degre) {
        if (d < 3) continue;
        const [x, z] = noeuds[id];
        if (!dedans(x, z, -10) || !surChaussee(x, z)) continue;
        if (qg.some(q => longueur(q.x - x, q.z - z) < 90)) continue;
        listeCarrefours.push([x, z]);
      }
    }
    function carrefours(rd, nb) {
      const choix = [];
      for (let essai = 0; choix.length < nb && essai < 500 && listeCarrefours.length; essai++) {
        const c = listeCarrefours[Math.floor(rd() * listeCarrefours.length)];
        if (choix.some(([x, z]) => longueur(x - c[0], z - c[1]) < 120)) continue;
        choix.push(c.slice());
      }
      return choix;
    }
    /** Grille de cases (cellule m) : 1 si le centre de la case est praticable ; chaussee : 1 s'il est sur une chaussée. */
    function grillePraticable(cellule = 4) {
      const nx = Math.ceil((etendue.x1 - etendue.x0) / cellule), nz = Math.ceil((etendue.z1 - etendue.z0) / cellule);
      const cases = new Uint8Array(nx * nz), surVoie = new Uint8Array(nx * nz);
      for (let j = 0; j < nz; j++) {
        const z = etendue.z0 + (j + 0.5) * cellule;
        for (let i = 0; i < nx; i++) {
          const k = caseDe(TP, etendue.x0 + (i + 0.5) * cellule, z);
          if (k >= 0 && prat[k]) { cases[i + j * nx] = 1; surVoie[i + j * nx] = chaussee[k]; }
        }
      }
      return { nx, nz, x0: etendue.x0, z0: etendue.z0, cellule, cases, chaussee: surVoie };
    }
    const sol = () => 0;
    const placeCentre = accrocher(AM.place[0], AM.place[1], 4);

    const emprises = [];
    for (const bat of bats) {
      if (bat.souleve) continue;
      for (const bx of bat.boites) {
        if (!dedans(bx.x, bx.z, 40)) continue;
        emprises.push({ x: Math.round(bx.x * 100) / 100, z: Math.round(bx.z * 100) / 100, lx: Math.round(2 * bx.a * 100) / 100, lz: Math.round(2 * bx.b * 100) / 100,
          lacet: lacetDe(bx.ux, bx.uz), h: bat.h });
      }
    }
    chrono('fin');
    const nbPrat = prat.reduce((s, v) => s + v, 0);
    const comptes = { batiments: bats.length, boites: boites.length, retaillees, otees, corps: nbCorps, pans: nbPans, pignons: nbPignons, genoises: nbGenoises,
      acroteres: nbAcroteres, bateaux: nbBateaux, reverberes: nbReverberes, mobilier: nbMobilier, deuxRoues: places2R.length, monuments: nbMonuments, lointain: nbLointain, arbres: nbArbres, abribus: abris.length, objets: objets.length,
      cassables: cassables.length, navLibres: navPiece.taille, praticable: nbPrat, parSection };
    ms.total = Math.round((maintenant() - t00) * 10) / 10;

    const ville = {
      type: 'reelle', nom, ville: P.nom, ilots, N: ilots, attribution: P.attribution, licence: P.licence, etendue, objets, MAT, FACTIONS: factions,
      barricades: [], sites: { qg, lieux, gisements, cassables, immeubles }, obstacles,
      accrocher: (x, z) => accrocher(x, z), praticable, surChaussee, sol, itineraire, departs, pointAuHasard, carrefours, hasard, grillePraticable,
      place: placeCentre, rues: { noeuds, aretes }, eau: eaux.map(e => e.points), places, parcs, emprises,
      mesures: { ms, comptes },
    };
    // Les trames internes, pour les vérifications seulement (options.trames).
    if (options.trames) ville.trames = { L: W, n, libre, ouvert, piece1, coeur, prat, chaussee, d2, terre, bati, TD };
    return ville;
  }

  const villes = () => Object.keys(AMENAGEMENTS).filter(k => PDR.plans && PDR.plans[k]);
  PDR.villeReelle = Object.freeze({ creerVille, villes, hasard, MAT, CASSABLES, SORTES_CASSABLES, STOCK, AMENAGEMENTS,
    outils: Object.freeze({ sinus, cosinus, angle, aire, dansAnneau, rectangleMinimal, decomposer, boiteDe, decomposerTrame, distSegRect, retailler, distance2 }) });
})(globalThis.PDR = globalThis.PDR || {});
