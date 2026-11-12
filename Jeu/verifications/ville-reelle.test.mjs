// Vérifie la ville réelle (Marseille, plan d'OpenStreetMap) à 9, 13 et 15 îlots : reproductible à l'octet près (dans
// Node comme dans un contexte neuf, comme le travailleur), décrite dans le format de scène de FERRO, des trajets
// praticables, les lieux de jeu de CONCEPTION.md §3.1, une ville d'un seul tenant pour la grille de navigation de 4 m,
// le choix de la ville par le protocole (PDR.protocole.villeDe), la mention ODbL, et une courte partie à trois IA.
//   node Jeu/verifications/ville-reelle.test.mjs
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
const PARTAGES = ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'villes/marseille.js', 'ville-reelle.js'];
for (const f of [...PARTAGES, 'sim/nav.js', 'sim/monde.js', 'sim/ia.js']) exiger(src(f));
const { villeReelle: VR, protocole: P, regles: R, nav: NAV, monde: M, ia: IA } = globalThis.PDR;
const { SORTES_CASSABLES } = P;

let ok = 0;
const verifier = (nom, f) => { const t0 = performance.now(); f(); ok++; console.log(`ok  ${nom} (${(performance.now() - t0).toFixed(0)} ms)`); };
const hacher = v => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const empreinte = v => hacher({ objets: v.objets, sites: v.sites, etendue: v.etendue });
const FORMES = new Set(['box', 'sphere', 'cylinder', 'octa', 'ring', 'bevel', 'foliage']);
function maille(m, quoi) {
  assert.ok(FORMES.has(m.shape), quoi + ' : forme ' + m.shape);
  assert.ok(m.p.length === 3 && m.p.every(Number.isFinite), quoi + ' : p');
  assert.ok(m.s.length === 3 && m.s.every(v => Number.isFinite(v) && v > 0), quoi + ' : s');
  assert.ok(m.r.length === 3 && m.r.every(Number.isFinite), quoi + ' : r');
  assert.ok(Number.isFinite(m.mat) && m.mat >= 0 && m.mat < 19, quoi + ' : mat ' + m.mat);
  if (m.color) assert.ok(m.color.length === 3 && m.color.every(v => v >= 0 && v <= 1), quoi + ' : couleur');
}
const dedans = (e, x, z, marge = 0) => x >= e.x0 - marge && x <= e.x1 + marge && z >= e.z0 - marge && z <= e.z1 + marge;

const villes = {};
for (const N of [9, 13, 15]) {
  const t0 = performance.now();
  villes[N] = VR.creerVille('marseille', { ilots: N });
  villes[N].ms = performance.now() - t0;
}

verifier('même plan, même ville, à l\'octet près (9, 13 et 15 îlots) ; trois carrés de jeu emboîtés', () => {
  const cotes = [];
  for (const N of [9, 13, 15]) {
    assert.equal(empreinte(VR.creerVille('marseille', { ilots: N })), empreinte(villes[N]));
    const e = villes[N].etendue;
    assert.ok(e.x1 > e.x0 && e.z1 > e.z0);
    cotes.push(e.x1 - e.x0);
  }
  assert.ok(cotes[0] < cotes[1] && cotes[1] < cotes[2], 'carrés de ' + cotes.join(', ') + ' m');
  assert.deepEqual(VR.villes(), ['marseille']);
});

verifier('à l\'octet près dans un contexte neuf (comme le travailleur), sans window, document ni hasard', () => {
  const ctx = vm.createContext({ console, performance });
  vm.runInContext('globalThis.PDR = {};', ctx);
  for (const f of PARTAGES) vm.runInContext(fs.readFileSync(src(f), 'utf8'), ctx, { filename: f });
  for (const N of [9, 15]) {
    const texte = vm.runInContext(`JSON.stringify((v => ({ objets: v.objets, sites: v.sites, etendue: v.etendue }))(PDR.protocole.villeDe({ ville: 'marseille' }, ${N})))`, ctx);
    assert.equal(createHash('sha256').update(texte).digest('hex').slice(0, 16), empreinte(villes[N]));
  }
  // L'horloge de mesure (performance.now, Date.now à défaut) ne sert qu'à ville.mesures.ms, hors déterminisme.
  const texte = fs.readFileSync(src('ville-reelle.js'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/performance\.now/.test(l)).join('\n');
  assert.ok(!/\bwindow\b|\bdocument\b|Math\.random|Date\.now/.test(texte), 'ni page ni hasard');
  assert.ok(!/Math\.(sin|cos|tan|atan2|atan|hypot|exp|log|pow)\s*\(/.test(texte), 'aucune fonction transcendante de Math');
});

verifier('protocole : villeDe choisit Marseille, le damier sinon ; mention ODbL', () => {
  const v = P.villeDe({ ville: 'marseille', graine: 4 }, 9);
  assert.equal(v.nom, 'marseille');
  assert.equal(empreinte(v), empreinte(villes[9]), 'la graine ne change pas le plan');
  assert.match(String(v.attribution), /OpenStreetMap/);
  assert.match(String(v.attribution) + ' ' + String(v.licence || ''), /ODbL/);
  for (const autre of [{ ville: 'damier', graine: 4 }, { graine: 4 }, { ville: 'atlantide', graine: 4 }]) {
    const d = P.villeDe(autre, 9);
    assert.equal(d.nom, 'damier');
    assert.equal(hacher({ objets: d.objets, sites: d.sites }), hacher((x => ({ objets: x.objets, sites: x.sites }))(globalThis.PDR.ville.creerVille(4, { ilots: 9 }))));
  }
});

verifier('pièces conformes au format du moteur FERRO (décor et cassables)', () => {
  for (const N of [9, 13, 15]) {
    assert.ok(villes[N].objets.length > 5000, N + ' îlots : ' + villes[N].objets.length + ' pièces');
    for (const m of villes[N].objets) maille(m, 'objet');
    for (const c of villes[N].sites.cassables) for (const m of c.pieces) maille(m, 'cassable ' + c.sorte);
  }
});

// ville.itineraire est l'API de l'essai 0.1 : la simulation de la 0.2 suit ses propres champs (sim/nav.js). On exige des
// étapes praticables, et des segments qui ne frôlent les angles de bâtiment que rarement (moins de 2 % des points).
verifier('trajets : étapes praticables, segments presque toujours dans la rue', () => {
  for (const N of [9, 15]) {
    const v = villes[N], r = v.hasard(99), e = v.etendue;
    let etapes = 0, essais = 0, points = 0, dehors = 0;
    for (let k = 0; k < 200; k++) {
      const a = [e.x0 + r() * (e.x1 - e.x0), e.z0 + r() * (e.z1 - e.z0)], b = [e.x0 + r() * (e.x1 - e.x0), e.z0 + r() * (e.z1 - e.z0)];
      const depart = v.accrocher(a[0], a[1]);
      assert.ok(v.praticable(depart[0], depart[1]), 'départ ' + depart);
      const chemin = v.itineraire(a[0], a[1], b[0], b[1]);
      if (!chemin || !chemin.length) continue;
      essais++;
      etapes += chemin.length;
      let p = depart;
      for (const q of chemin) {
        assert.ok(v.praticable(q[0], q[1]), `${N} îlots : étape ${q} hors de la rue`);
        for (let t = 0; t <= 1.0001; t += 0.05) {
          const x = p[0] + (q[0] - p[0]) * t, z = p[1] + (q[1] - p[1]) * t;
          points++;
          if (!v.praticable(x, z)) dehors++;
        }
        p = q;
      }
    }
    assert.ok(essais > 150 && etapes > essais, `${essais} trajets, ${etapes} étapes`);
    assert.ok(dehors / points < 0.02, `${N} îlots : ${dehors} points de segment hors de la rue sur ${points}`);
    console.log(`    ${N} îlots : ${essais} trajets, ${dehors} points de segment sur ${points} frôlent un bâtiment`);
  }
});

verifier('départs des trois factions sur les rues, dans le carré de jeu', () => {
  for (const N of [9, 13]) {
    const v = villes[N];
    for (let f = 0; f < 3; f++) {
      const pts = v.departs(f, 600, 5);
      assert.equal(pts.length, 600);
      for (const [x, z] of pts) { assert.ok(v.praticable(x, z)); assert.ok(dedans(v.etendue, x, z)); }
    }
  }
});

verifier('QG : trois bâtiments distincts, un par camp, sortie praticable, bâtiment plein', () => {
  for (const N of [9, 13, 15]) {
    const { qg } = villes[N].sites, v = villes[N];
    assert.equal(qg.length, 3);
    assert.deepEqual(qg.map(q => q.faction), [0, 1, 2]);
    assert.equal(new Set(qg.map(q => q.nom)).size, 3);
    for (const q of qg) {
      assert.ok([q.x, q.z, q.rayon, ...q.sortie, ...q.emprise].every(Number.isFinite));
      assert.ok(v.praticable(q.sortie[0], q.sortie[1]), N + ' îlots : sortie du QG ' + q.faction);
      assert.ok(!v.praticable(q.x, q.z), N + ' îlots : le bâtiment du QG ' + q.faction + ' fait obstacle');
      assert.ok(dedans(v.etendue, q.x, q.z));
    }
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
      const dx = qg[a].x - qg[b].x, dz = qg[a].z - qg[b].z;
      assert.ok(dx * dx + dz * dz > 100 * 100, N + ' îlots : QG ' + a + ' et ' + b + ' trop proches');
    }
  }
});

verifier('lieux, gisements, cassables : nombres du damier, nommés, dans le carré, accessibles', () => {
  const attendus = { 9: [7, 16], 13: [9, 20], 15: [11, 24] };
  for (const N of [9, 13, 15]) {
    const v = villes[N], { lieux, gisements, cassables } = v.sites, [nl, ng] = attendus[N];
    assert.equal(lieux.length, nl, N + ' îlots : lieux');
    assert.equal(gisements.length, ng, N + ' îlots : gisements');
    assert.equal(new Set(lieux.map(l => l.nom)).size, nl, 'noms de lieux distincts');
    assert.ok(cassables.length > 500, N + ' îlots : ' + cassables.length + ' cassables');
    lieux.forEach((l, k) => {
      assert.equal(l.id, k);
      assert.ok(l.nom && l.rayon > 0 && dedans(v.etendue, l.x, l.z), 'lieu ' + l.nom);
      const [x, z] = v.accrocher(l.x, l.z);
      assert.ok((x - l.x) ** 2 + (z - l.z) ** 2 <= (l.rayon + 4) ** 2, 'lieu ' + l.nom + ' loin des rues');
    });
    gisements.forEach((g, k) => {
      assert.equal(g.id, k);
      assert.ok(g.sorte === 'moyens' || g.sorte === 'materiaux');
      assert.ok(g.stock > 0 && g.rayon > 0 && dedans(v.etendue, g.x, g.z), 'gisement ' + g.nom);
    });
    assert.ok(gisements.some(g => g.sorte === 'moyens') && gisements.some(g => g.sorte === 'materiaux'));
    cassables.forEach((c, k) => {
      assert.equal(c.id, k);
      // Les sortes du protocole, ou les sortes propres à la ville réelle (même format, feu tiré des points de structure).
      assert.ok(SORTES_CASSABLES.includes(c.sorte) || VR.SORTES_CASSABLES.includes(c.sorte), 'sorte ' + c.sorte);
      assert.equal(c.pv, VR.CASSABLES[c.sorte].pv, 'pv de ' + c.sorte);
      assert.ok(c.pv > 0 && c.rendement >= 0 && c.pieces.length > 0 && dedans(v.etendue, c.x, c.z, 4));
    });
  }
});

verifier('d\'un seul tenant pour la navigation de 4 m : QG, lieux et gisements se rejoignent', () => {
  for (const N of [9, 13, 15]) {
    const v = villes[N], nav = NAV.creer(v), { nx, nz, statique } = nav;
    const cle = (x, z) => nav.caseProche(x * 1000, z * 1000);
    const depart = cle(v.sites.qg[0].sortie[0], v.sites.qg[0].sortie[1]);
    assert.ok(depart >= 0);
    // Parcours en largeur, huit voisins, sans couper d'angle (comme les champs de sim/nav.js).
    const vu = new Uint8Array(nx * nz), file = new Int32Array(nx * nz);
    let tete = 0, queue = 0;
    vu[depart] = 1; file[queue++] = depart;
    while (tete < queue) {
      const c = file[tete++], i = c % nx, j = (c / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const w = a + b * nx;
        if (vu[w] || !statique[w]) continue;
        if (di && dj && (!statique[a + j * nx] || !statique[i + b * nx])) continue;
        vu[w] = 1; file[queue++] = w;
      }
    }
    let libres = 0;
    for (let c = 0; c < nx * nz; c++) if (statique[c]) libres++;
    assert.ok(queue / libres > 0.97, `${N} îlots : ${queue} cases atteintes sur ${libres} libres`);
    const points = [...v.sites.qg.map(q => q.sortie), ...v.sites.lieux.map(l => [l.x, l.z]), ...v.sites.gisements.map(g => [g.x, g.z])];
    for (const [x, z] of points) {
      const c = cle(x, z);
      assert.ok(c >= 0 && vu[c], `${N} îlots : (${x.toFixed(0)}, ${z.toFixed(0)}) hors de la ville praticable`);
    }
  }
});

verifier('une partie de 30 s à trois IA, 20 000 unités, sur Marseille : tout reste dans les rues', () => {
  const v = P.villeDe({ ville: 'marseille' }, R.ilots(20000));
  const m = M.creer(v, { graine: 3, effectifs: 20000, joueur: -1, coalitions: true });
  const ia = IA.creer(m);
  const avant = new Float32Array(m.etat(new ArrayBuffer((m.n + 16) * 16), 1).unites, 0, m.n * 4).slice();
  for (let k = 0; k < 600; k++) { m.iterer(); ia.penser(); }
  const e = m.etat(new ArrayBuffer((m.n + 16) * 16), 1), f = new Float32Array(e.unites, 0, e.n * 4);
  let vivantes = 0, horsRue = 0, bougees = 0;
  for (let i = 0; i < e.n; i++) {
    const code = f[4 * i + 3];
    if (R.codeFaction(code) === 3 || R.codeEtat(code) === R.ETATS.HORS_JEU) continue;
    const x = f[4 * i], z = f[4 * i + 1];
    assert.ok(Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(f[4 * i + 2]));
    vivantes++;
    if (!v.praticable(x, z)) horsRue++;
    if (i < avant.length / 4 && (avant[4 * i] - x) ** 2 + (avant[4 * i + 1] - z) ** 2 > 4) bougees++;
  }
  assert.ok(vivantes > 15000, vivantes + ' unités en jeu');
  assert.ok(horsRue / vivantes < 0.01, horsRue + ' unités hors des rues sur ' + vivantes);
  assert.ok(bougees > vivantes * 0.3, bougees + ' unités ont bougé');
  console.log(`    ${vivantes} en jeu, ${horsRue} hors des rues, ${bougees} ont bougé ; scores ${Array.from(m.score).join(' / ')}`);
});

console.log(`    construction : ${[9, 13, 15].map(N => N + ' îlots ' + villes[N].ms.toFixed(0) + ' ms (' + villes[N].objets.length + ' pièces, ' + villes[N].sites.cassables.length + ' cassables)').join(' ; ')}`);
console.log(`VILLE RÉELLE  REUSSI : ${ok} vérifications`);
