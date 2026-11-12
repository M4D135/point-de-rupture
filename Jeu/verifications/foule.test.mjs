// Vérifie la foule sur le GPU, sans GPU : maillages des figurines, liste des proches (champ, taille projetée, brouillard,
// emplacements libres, plafond), tampons réutilisés, décodage des codes d'unité, et ce que la foule demande à un
// contexte WebGL 2 simulé (seules les lignes servies des textures d'état partent ; les points en un seul appel).
//   node Jeu/verifications/foule.test.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const ici = path.dirname(fileURLToPath(import.meta.url));
const charger = createRequire(import.meta.url);
for (const f of ['sim/regles.js', 'sim/protocole.js', 'foule.js']) charger(path.join(ici, '..', 'src', f));
const { foule: F, regles: R } = globalThis.PDR;

let ok = 0;
const verifier = (nom, f) => { f(); ok++; console.log('ok  ' + nom); };

// ---- Contexte WebGL 2 simulé : chaque appel est noté, les objets créés sont numérotés. ----
function creerGL({ largeur = 1440, hauteur = 900 } = {}) {
  const journal = [], constantes = new Map();
  let objets = 0;
  const constante = nom => {
    const t = /^TEXTURE(\d+)$/.exec(nom);
    if (t) return 0x84C0 + Number(t[1]);
    if (!constantes.has(nom)) constantes.set(nom, 0x9000 + constantes.size);
    return constantes.get(nom);
  };
  const nom = v => { for (const [k, c] of constantes) if (c === v) return k; return v >= 0x84C0 && v < 0x84E0 ? 'TEXTURE' + (v - 0x84C0) : String(v); };
  const reponses = {
    getParameter: p => ({ ALIASED_POINT_SIZE_RANGE: new Float32Array([1, 1024]), MAX_TEXTURE_SIZE: 16384 })[nom(p)] ?? 0,
    getShaderParameter: () => true, getProgramParameter: () => true, isContextLost: () => false,
    getUniformLocation: (p, n) => ({ u: n, p: p && p.id }),
  };
  const gl = new Proxy({}, {
    get(_, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop === 'drawingBufferWidth') return largeur;
      if (prop === 'drawingBufferHeight') return hauteur;
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return constante(prop);
      return (...args) => {
        journal.push([prop, args]);
        if (reponses[prop]) return reponses[prop](...args);
        if (prop.startsWith('create')) return { id: ++objets, sorte: prop.slice(6) };
        return undefined;
      };
    },
  });
  return { gl, journal, nom };
}

// ---- Maillages. ----
const M = F.construireMaillages();
const fl = new Float32Array(M.sommets), u8 = new Uint8Array(M.sommets), S4 = M.SOMMET / 4;
const info = (v, k) => u8[v * M.SOMMET + 32 + k];

verifier('maillages : un par type et par niveau de détail, rangés bout à bout, indices et sommets valides', () => {
  assert.equal(M.plages.length, 26);
  let fin = 0;
  for (const p of M.plages) {
    assert.equal(p.premier, fin);
    assert.ok(p.compte > 0 && p.compte % 3 === 0);
    fin += p.compte;
  }
  assert.equal(fin, M.indices.length);
  assert.ok(M.nombre <= 65535);
  for (const i of M.indices) assert.ok(i < M.nombre);
  for (let v = 0; v < M.nombre; v++) {
    for (let k = 0; k < 8; k++) assert.ok(Number.isFinite(fl[v * S4 + k]));
    assert.ok(Math.abs(Math.hypot(fl[v * S4 + 3], fl[v * S4 + 4], fl[v * S4 + 5]) - 1) < 1e-3, 'normale unitaire');
    assert.ok(info(v, 0) < 16 && info(v, 1) < 15 && info(v, 2) < 6 && info(v, 3) < 2, 'os, teinte, matière, motif');
  }
});

verifier('maillages : faces tournées vers le dehors, aucun triangle dégénéré', () => {
  let mauvais = 0, nuls = 0;
  const P = (i, k) => fl[i * S4 + k];
  for (let t = 0; t < M.indices.length; t += 3) {
    const [a, b, c] = [M.indices[t], M.indices[t + 1], M.indices[t + 2]];
    const u = [P(b, 0) - P(a, 0), P(b, 1) - P(a, 1), P(b, 2) - P(a, 2)], w = [P(c, 0) - P(a, 0), P(c, 1) - P(a, 1), P(c, 2) - P(a, 2)];
    const x = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const aire = Math.hypot(...x) / 2;
    if (aire < 1e-9) { nuls++; continue; }
    let d = 0;
    for (const v of [a, b, c]) d += x[0] * P(v, 3) + x[1] * P(v, 4) + x[2] * P(v, 5);
    if (d <= 0) mauvais++;
  }
  assert.equal(nuls, 0, 'triangles dégénérés');
  assert.equal(mauvais, 0, 'triangles à l’envers');
});

verifier('silhouettes : chaque type a ses pièces, le niveau simple est plus léger, l’anneau de sélection est partout', () => {
  const O = F.OS, T = F.TEINTE;
  const parties = (t, niveau = 0) => {
    const p = M.plages[t * 2 + niveau], os = new Set(), teintes = new Set();
    let motifs = 0;
    for (let k = p.premier; k < p.premier + p.compte; k++) {
      const v = M.indices[k];
      os.add(info(v, 0)); teintes.add(info(v, 0) * 100 + info(v, 1));
      if (info(v, 3)) motifs++;
    }
    return { os, teintes, motifs };
  };
  for (const t of [0, 4, 8]) assert.ok(parties(t).os.has(O.PORTE), 'charge des Équipes');
  assert.ok(parties(1).os.has(O.BANDEROLE) && parties(1).motifs > 0, 'banderole du Cortège, avec motif');
  assert.ok(parties(2).teintes.has(O.TETE * 100 + T.HAUT), 'capuche des Furets');
  assert.ok(parties(3).os.has(O.TAMBOUR) && parties(3).os.has(O.CUIVRE), 'tambours et cuivres de la Fanfare');
  assert.ok(parties(5).os.has(O.BANDEROLE), 'pancarte des Piquets');
  assert.ok(parties(6).os.has(O.BOUCLIER) && parties(6).motifs > 0, 'panneau-porte des Pavois');
  assert.ok(parties(7).os.has(O.POUTRE), 'poutre des Béliers');
  assert.ok(parties(9).teintes.has(O.TETE * 100 + T.CAMP), 'casquette de la Patrouille');
  assert.ok(parties(10).os.has(O.BOUCLIER) && parties(10).teintes.has(O.TETE * 100 + T.CASQUE), 'casque et bouclier de la Compagnie');
  assert.ok(parties(11).os.has(O.VEHICULE), 'moto des Motards');
  assert.ok(parties(12).os.has(O.VEHICULE) && parties(12).os.has(O.TOURELLE), 'camion du Canon à eau');
  const triangles = [];
  for (let t = 0; t < 13; t++) {
    assert.ok(parties(t).os.has(O.ANNEAU) && parties(t, 1).os.has(O.ANNEAU));
    assert.ok(M.plages[t * 2 + 1].compte < M.plages[t * 2].compte);
    triangles.push(M.plages[t * 2].compte / 3 + '/' + M.plages[t * 2 + 1].compte / 3);
    if (t < 11) assert.ok(M.plages[t * 2].compte / 3 <= 700, 'budget d’une figurine détaillée');
  }
  console.log('    triangles (détail/simple) par type : ' + triangles.join(' '));
});

// ---- Liste des proches. ----
const IMAGE = { largeur: 1440, hauteur: 900 };
const VUE = { pos: [0, 70, 140], yaw: 0.3, pitch: -0.5, fov: 42, near: 1 };
function grille(pas, etendue, codeDe) {
  const n = Math.floor((2 * etendue) / pas + 1) ** 2, f = new Float32Array(n * 4);
  let i = 0;
  for (let x = -etendue; x <= etendue; x += pas) for (let z = -etendue; z <= etendue; z += pas) {
    f[i * 4] = x; f[i * 4 + 1] = z; f[i * 4 + 2] = 0; f[i * 4 + 3] = codeDe(i); i++;
  }
  return { f, n: i };
}
// Taille projetée et place à l'écran, recalculées d'une autre façon : matrice vue-projection comme celle du moteur.
function projeter(vue, x, z, type) {
  const a = F.axesCamera(vue), e = vue.pos, d = [x - e[0], 1.2 - e[1], z - e[2]];
  const prof = d[0] * a.forward[0] + d[1] * a.forward[1] + d[2] * a.forward[2];
  const tan = Math.tan((vue.fov * Math.PI) / 360);
  const sx = (d[0] * a.right[0] + d[1] * a.right[1] + d[2] * a.right[2]) / (prof * tan * IMAGE.largeur / IMAGE.hauteur);
  const sy = (d[0] * a.up[0] + d[1] * a.up[1] + d[2] * a.up[2]) / (prof * tan);
  return { prof, sx, sy, taille: F.HAUTEURS[type] * (IMAGE.hauteur / (2 * tan)) / prof };
}

verifier('liste des proches : devant la caméra, assez grandes, ni libres ni cachées par le brouillard, rangées par seau', () => {
  const nx = 32, voile = new Uint8Array(nx * nx);
  for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) voile[i + j * nx] = i < 16 ? 255 : 0;   // l'ouest est vu
  const { f, n } = grille(3, 150, i => (i % 17 === 5 ? 3 : R.coder(i % 3, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12][i % 13], 1, 40, 0)));
  const L = F.creerListeur(100000);
  const r = L.lister(f, n, VUE, IMAGE, { seuil: 7, brouillard: { voile, nx, nz: nx, x0: -160, z0: -160, cellule: 10, joueur: 0, allie: -1 } });
  const vus = new Set();
  for (let s = 0; s < 26; s++) for (let k = r.debut[s]; k < r.debut[s] + r.compte[s]; k++) {
    const i = r.liste[k], code = f[i * 4 + 3], d = F.decoder(code);
    assert.equal(d.type, s >> 1, 'seau du type');
    const p = projeter(VUE, f[i * 4], f[i * 4 + 1], d.type);
    assert.ok(p.prof > 0 && p.taille >= 7 - 1e-3);
    assert.equal(s & 1, p.taille >= F.SEUIL_DETAIL ? 0 : 1, 'niveau de détail selon la taille');
    assert.ok(Math.abs(p.sx) < 1.25 && Math.abs(p.sy) < 1.25, 'dans le champ (avec la marge)');
    assert.notEqual(d.faction, 3, 'emplacement libre');
    if (d.faction !== 0) assert.ok(f[i * 4] < 0, 'unité ennemie vue seulement');
    vus.add(i);
  }
  assert.equal(vus.size, r.total);
  // Rien d'oublié : toute unité dans le champ, assez grande, alliée ou vue, est dans la liste.
  let oubliees = 0, attendues = 0;
  for (let i = 0; i < n; i++) {
    const d = F.decoder(f[i * 4 + 3]);
    if (d.faction === 3) continue;
    const p = projeter(VUE, f[i * 4], f[i * 4 + 1], d.type);
    if (!(p.prof > 1 && p.taille >= 7.01 && Math.abs(p.sx) < 0.98 && Math.abs(p.sy) < 0.98)) continue;
    const cx = Math.floor((f[i * 4] + 160) / 10), cz = Math.floor((f[i * 4 + 1] + 160) / 10);
    if (d.faction !== 0 && voile[cx + cz * nx] < 90) continue;
    attendues++;
    if (!vus.has(i)) oubliees++;
  }
  assert.ok(attendues > 1000, 'assez d’unités dans le champ pour que l’essai dise quelque chose');
  assert.equal(oubliees, 0);
});

verifier('plafond : les plus grandes tailles projetées sont gardées, et pas une de plus que le plafond', () => {
  const { f, n } = grille(2, 120, i => R.coder(i % 3, (i * 7) % 13, 0, 63, 0));
  const plafond = 1500, L = F.creerListeur(plafond);
  const r = L.lister(f, n, VUE, IMAGE, { seuil: 3 });
  assert.ok(r.candidats > plafond * 3, 'l’essai doit dépasser le plafond');
  assert.equal(r.total, plafond);
  const gardees = new Set(r.liste.subarray(0, r.total));
  assert.equal(gardees.size, plafond);
  let minGardee = Infinity, maxEcartee = 0;
  for (let i = 0; i < n; i++) {
    const d = F.decoder(f[i * 4 + 3]), p = projeter(VUE, f[i * 4], f[i * 4 + 1], d.type);
    if (!(p.prof > 1 && p.taille >= 3 && Math.abs(p.sx) < 0.98 && Math.abs(p.sy) < 0.98)) continue;
    if (gardees.has(i)) minGardee = Math.min(minGardee, p.taille); else maxEcartee = Math.max(maxEcartee, p.taille);
  }
  // L'histogramme a dix cases par octave : une case d'écart au plus.
  assert.ok(minGardee >= maxEcartee / Math.pow(2, 0.1) - 1e-3, minGardee + ' < ' + maxEcartee);
});

verifier('tampons réutilisés : même résultat, mêmes tableaux d’une liste à l’autre', () => {
  const L = F.creerListeur(4000), a = grille(4, 100, i => R.coder(1, 1, 0, 30, 0)), b = grille(3, 60, i => R.coder(2, 9, 2, 50, 2));
  const r1 = L.lister(a.f, a.n, VUE, IMAGE, { seuil: 7 });
  const tableaux = [r1.liste, r1.debut, r1.compte];
  const r2 = L.lister(b.f, b.n, { ...VUE, yaw: -0.2 }, IMAGE, { seuil: 9 });
  assert.equal(r1, r2);
  assert.deepEqual([r2.liste, r2.debut, r2.compte], tableaux);
  assert.equal(r2.liste.length, 4000);
  assert.equal(r2.compte.reduce((x, y) => x + y, 0), r2.total);
});

verifier('codes d’unité : decoder relit regles.coder, après le passage en Float32', () => {
  const f = new Float32Array(1);
  let n = 0;
  for (let faction = 0; faction < 4; faction++) for (let type = 0; type < 13; type += 3) for (let etat = 0; etat < 12; etat += 5)
    for (const niveau of [0, 31, 63]) for (const drapeaux of [0, 1, 2, 31, 255]) {
      f[0] = R.coder(faction, type, etat, niveau, drapeaux);
      assert.deepEqual(F.decoder(f[0]), { faction, type, etat, niveau, drapeaux });
      n++;
    }
  assert.ok(n > 500);
});

verifier('sur un contexte simulé : lignes servies seulement, points en un seul appel, figurines par seau, recréation', () => {
  const { gl, journal, nom } = creerGL();
  let generation = 1;
  const renderer = { gl, pdr: { glsl: '/*PDR*/', get generation() { return generation; }, programme: () => gl.createProgram(), lier: () => () => {} } };
  const foule = F.creerFoule(renderer, { plafond: 3000 });
  const n = 2500, f = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { f[i * 4] = (i % 50) * 2 - 50; f[i * 4 + 1] = Math.floor(i / 50) * 2 - 50; f[i * 4 + 3] = R.coder(i % 3, i % 13, 1, 40, 0); }
  journal.length = 0;
  foule.recevoir(f, n);
  const envois = journal.filter(([k, a]) => k === 'texSubImage2D' && nom(a[6]) === 'RGBA');
  assert.deepEqual(envois.map(([, a]) => [a[3], a[4], a[5]]), [[0, 1024, 2], [2, 452, 1]], 'deux lignes pleines, puis le reste');
  f[0] = 999;   // le tampon reçu a été copié : on peut le rendre au travailleur
  assert.equal(foule.etat.cour[0], -50);
  const vueCam = { pos: [0, 60, 90], yaw: 0, pitch: -0.6, fov: 42, near: 1 };
  foule.selectionner([3, 4, 5]);
  foule.cadre(vueCam, 1.5);
  const vueMoteur = { vp: new Float32Array(16), focale: 1172, oeil: [0, 60, 90], droite: [1, 0, 0], ombre: { unite: 2 } };
  journal.length = 0;
  const rendu = foule.fx.couleur(gl, vueMoteur);
  const points = journal.filter(([k]) => k === 'drawArrays');
  assert.equal(points.length, 1);
  assert.deepEqual([nom(points[0][1][0]), points[0][1][1], points[0][1][2]], ['POINTS', 0, n]);
  const figurines = journal.filter(([k]) => k === 'drawElementsInstanced');
  assert.equal(figurines.reduce((s, [, a]) => s + a[4], 0), foule.mesure.proches);
  assert.ok(foule.mesure.proches > 100 && figurines.length >= 13 && figurines.length <= 26);
  assert.equal(rendu.appels, figurines.length + 1);
  journal.length = 0;
  foule.fx.ombre(gl, { matrice: new Float32Array(16) });
  assert.equal(journal.filter(([k]) => k === 'drawArrays').length, 0, 'pas de points dans l’ombre');
  assert.equal(journal.filter(([k]) => k === 'drawElementsInstanced').length, figurines.length);
  // Contexte perdu puis rendu : tout est recréé, les deux états repartent.
  generation++;
  journal.length = 0;
  foule.cadre(vueCam, 1.6);
  assert.equal(journal.filter(([k]) => k === 'createProgram').length, 3);
  assert.ok(journal.filter(([k, a]) => k === 'texSubImage2D' && nom(a[6]) === 'RGBA').length >= 2);
  foule.liberer();
});

console.log(ok + ' vérifications de la foule réussies');
