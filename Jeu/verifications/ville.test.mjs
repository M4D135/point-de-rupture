// Vérifie la ville procédurale à 9, 13 et 15 îlots : reproductible à l'octet près (dans Node comme dans un contexte
// neuf, comme le travailleur), décrite dans le format de scène de FERRO, des trajets praticables, et les lieux de jeu
// de CONCEPTION.md §3.1 (QG, lieux, gisements, cassables).
//   node Jeu/verifications/ville.test.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const ici = path.dirname(fileURLToPath(import.meta.url));
const src = f => path.join(ici, '..', 'src', f);
const exiger = createRequire(import.meta.url);
for (const f of ['ville.js', 'sim/regles.js', 'sim/protocole.js', 'sim/nav.js']) exiger(src(f));
const { creerVille } = globalThis.PDR.ville;
const { SORTES_CASSABLES } = globalThis.PDR.protocole;

let ok = 0;
const verifier = (nom, f) => { const t0 = performance.now(); f(); ok++; console.log(`ok  ${nom} (${(performance.now() - t0).toFixed(0)} ms)`); };
const hacher = v => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const empreinte = v => hacher({ objets: v.objets, sites: v.sites });
const FORMES = new Set(['box', 'sphere', 'cylinder', 'octa', 'ring', 'bevel', 'foliage']);
function maille(m, quoi) {
  assert.ok(FORMES.has(m.shape), quoi + ' : forme ' + m.shape);
  assert.ok(m.p.length === 3 && m.p.every(Number.isFinite), quoi + ' : p');
  assert.ok(m.s.length === 3 && m.s.every(v => Number.isFinite(v) && v > 0), quoi + ' : s');
  assert.ok(m.r.length === 3 && m.r.every(Number.isFinite), quoi + ' : r');
  assert.ok(Number.isFinite(m.mat) && m.mat >= 0 && m.mat < 19, quoi + ' : mat');
  assert.equal(m.outdoor, true);
  if (m.color) assert.ok(m.color.length === 3 && m.color.every(v => v >= 0 && v <= 1), quoi + ' : couleur');
}

const villes = {};
for (const N of [9, 13, 15]) {
  const t0 = performance.now();
  villes[N] = creerVille(1, { ilots: N });
  villes[N].ms = performance.now() - t0;
}
const ville = villes[9];

verifier('même graine, même ville ; autre graine, autre ville (9, 13 et 15 îlots)', () => {
  for (const N of [9, 13, 15]) {
    assert.equal(empreinte(creerVille(1, { ilots: N })), empreinte(villes[N]));
    assert.notEqual(empreinte(creerVille(2, { ilots: N })), empreinte(villes[N]));
  }
  assert.equal(empreinte(creerVille(1)), empreinte(ville), '9 îlots par défaut');
  assert.throws(() => creerVille(1, { ilots: 10 }));
});

verifier('à l\'octet près dans un contexte neuf (comme le travailleur), sans window ni document', () => {
  const ctx = vm.createContext({ console });
  vm.runInContext('globalThis.PDR = {};', ctx);
  vm.runInContext(fs.readFileSync(src('ville.js'), 'utf8'), ctx, { filename: 'ville.js' });
  for (const N of [9, 15]) {
    const texte = vm.runInContext(`JSON.stringify((v => ({ objets: v.objets, sites: v.sites }))(PDR.ville.creerVille(1, { ilots: ${N} })))`, ctx);
    assert.equal(createHash('sha256').update(texte).digest('hex').slice(0, 16), empreinte(villes[N]));
  }
  const texte = fs.readFileSync(src('ville.js'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\bwindow\b|\bdocument\b|Math\.random|Date\.now|performance\./.test(texte));
});

verifier('pièces conformes au format du moteur FERRO (décor et cassables)', () => {
  for (const N of [9, 13, 15]) {
    for (const m of villes[N].objets) maille(m, 'objet');
    for (const c of villes[N].sites.cassables) for (const m of c.pieces) maille(m, 'cassable ' + c.sorte);
  }
});

verifier('trajets : chaque étape et chaque segment restent praticables', () => {
  for (const N of [9, 15]) {
    const v = villes[N], r = v.hasard(99);
    const { x0, x1, z0, z1 } = v.etendue;
    let etapes = 0;
    for (let k = 0; k < 300; k++) {
      const a = [x0 + r() * (x1 - x0), z0 + r() * (z1 - z0)], b = [x0 + r() * (x1 - x0), z0 + r() * (z1 - z0)];
      const depart = v.accrocher(a[0], a[1]);
      assert.ok(v.praticable(depart[0], depart[1]), 'départ ' + depart);
      const chemin = v.itineraire(a[0], a[1], b[0], b[1]);
      etapes += chemin.length;
      let p = depart;
      for (const q of chemin) {
        for (let t = 0; t <= 1.0001; t += 0.05) {
          const x = p[0] + (q[0] - p[0]) * t, z = p[1] + (q[1] - p[1]) * t;
          assert.ok(v.praticable(x, z), `segment ${p} → ${q} quitte la rue en ${x.toFixed(1)}, ${z.toFixed(1)}`);
        }
        p = q;
      }
    }
    assert.ok(etapes > 300);
  }
});

verifier('départs des trois factions sur les rues', () => {
  for (let f = 0; f < 3; f++) {
    const pts = ville.departs(f, 800, 5);
    assert.equal(pts.length, 800);
    for (const [x, z] of pts) assert.ok(ville.praticable(x, z));
  }
});

verifier('QG : trois bâtiments distincts, un par camp, sortie praticable, parvis ouvert', () => {
  for (const N of [9, 13, 15]) {
    const { qg } = villes[N].sites, v = villes[N];
    assert.equal(qg.length, 3);
    assert.deepEqual(qg.map(q => q.faction), [0, 1, 2]);
    assert.equal(new Set(qg.map(q => q.nom)).size, 3);
    for (const q of qg) {
      assert.ok([q.x, q.z, q.rayon, ...q.sortie, ...q.emprise].every(Number.isFinite));
      assert.ok(v.praticable(q.sortie[0], q.sortie[1]), N + ' îlots : sortie du QG ' + q.faction);
      assert.ok(!v.praticable(q.x, q.z), N + ' îlots : le bâtiment du QG ' + q.faction + ' fait obstacle');
      const [x0, z0, x1, z1] = q.emprise;
      assert.ok(x0 < x1 && z0 < z1 && q.rayon > Math.min(x1 - x0, z1 - z0) / 2, 'le parvis déborde le bâtiment');
    }
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) assert.ok(Math.hypot(qg[a].x - qg[b].x, qg[a].z - qg[b].z) > 100);
  }
});

verifier('lieux : 7, 9 et 11 lieux nommés, distincts, ouverts autour du centre', () => {
  for (const [N, nombre] of [[9, 7], [13, 9], [15, 11]]) {
    const { lieux } = villes[N].sites, v = villes[N];
    assert.equal(lieux.length, nombre);
    assert.deepEqual(lieux.map(l => l.id), lieux.map((_, k) => k));
    assert.equal(new Set(lieux.map(l => l.nom)).size, nombre);
    for (const l of lieux) {
      assert.ok(typeof l.nom === 'string' && l.nom.length > 4 && [l.x, l.z].every(Number.isFinite) && l.rayon > 10);
      // Le centre peut porter un monument : un point praticable existe à moins d'un tiers du rayon.
      const p = v.accrocher(l.x, l.z);
      assert.ok(Math.hypot(p[0] - l.x, p[1] - l.z) < l.rayon / 2 + 2, l.nom);
    }
    assert.equal(lieux[0].nom, 'Place de la Colonne');
  }
});

verifier('gisements : au moins 2 Moyens et 2 Matériaux près de chaque QG, et d\'autres au milieu', () => {
  for (const N of [9, 13, 15]) {
    const { qg, gisements } = villes[N].sites;
    assert.deepEqual(gisements.map(g => g.id), gisements.map((_, k) => k));
    for (const g of gisements) {
      assert.ok(g.sorte === 'moyens' || g.sorte === 'materiaux');
      assert.ok(g.stock > 0 && g.rayon > 0 && typeof g.nom === 'string' && villes[N].praticable(g.x, g.z), g.nom);
    }
    for (let f = 0; f < 3; f++) {
      const ici2 = gisements.filter(g => Math.hypot(g.x - qg[f].x, g.z - qg[f].z) < 130);
      assert.ok(ici2.filter(g => g.sorte === 'moyens').length >= 2, `${N} îlots, QG ${f} : Moyens`);
      assert.ok(ici2.filter(g => g.sorte === 'materiaux').length >= 2, `${N} îlots, QG ${f} : Matériaux`);
    }
    // Au milieu : des gisements plus proches du centre de la ville que de tout QG.
    const centre = villes[N].place;
    assert.ok(gisements.some(g => qg.every(q => Math.hypot(g.x - centre[0], g.z - centre[1]) < Math.hypot(g.x - q.x, g.z - q.z))), 'gisements du milieu');
  }
});

verifier('cassables : six sortes, pièces hors des objets, chacun atteignable à pied', () => {
  for (const N of [9, 13, 15]) {
    const v = villes[N], { cassables } = v.sites, nav = globalThis.PDR.nav.creer(v);
    const sortes = new Set(cassables.map(c => c.sorte));
    for (const s of SORTES_CASSABLES) assert.ok(sortes.has(s), N + ' îlots : ' + s);
    const dansObjets = new Set(v.objets);
    let loin = 0;
    for (const c of cassables) {
      assert.ok(SORTES_CASSABLES.includes(c.sorte) && c.pv > 0 && c.rendement > 0 && c.pieces.length > 0);
      assert.ok([c.x, c.z, c.lacet].every(Number.isFinite));
      for (const m of c.pieces) assert.ok(!dansObjets.has(m), 'une pièce de cassable est dans objets');
      // Une case fine praticable à moins de 6 m : une unité peut venir le casser.
      if (nav.fineProche(Math.round(c.x * 1000), Math.round(c.z * 1000), 3) < 0) loin++;
    }
    assert.equal(loin, 0, N + ' îlots : cassables hors d\'atteinte');
  }
});

for (const N of [9, 13, 15]) {
  const v = villes[N], parSorte = {};
  for (const c of v.sites.cassables) parSorte[c.sorte] = (parSorte[c.sorte] || 0) + 1;
  console.log(`  ${N} îlots : ${v.objets.length} pièces, ${v.sites.lieux.length} lieux, ${v.sites.gisements.length} gisements, `
    + `${v.sites.cassables.length} cassables ${JSON.stringify(parSorte)}, créée en ${v.ms.toFixed(1)} ms, empreinte ${empreinte(v)}`);
}
console.log(`VILLE  REUSSI : ${ok} vérifications`);
