// Vérifie la ville procédurale : reproductible, décrite dans le format de scène de FERRO, et des trajets praticables.
//   node Jeu/verifications/ville.test.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const ici = path.dirname(fileURLToPath(import.meta.url));
createRequire(import.meta.url)(path.join(ici, '..', 'src', 'ville.js'));
const { creerVille } = globalThis.PDR.ville;

let ok = 0;
const verifier = (nom, f) => { f(); ok++; console.log('ok  ' + nom); };
const empreinte = v => createHash('sha256').update(JSON.stringify(v.objets)).digest('hex').slice(0, 16);

const ville = creerVille(1);
verifier('même graine, même ville ; autre graine, autre ville', () => {
  assert.equal(empreinte(creerVille(1)), empreinte(ville));
  assert.notEqual(empreinte(creerVille(2)), empreinte(ville));
});

verifier('pièces conformes au format du moteur FERRO', () => {
  const formes = new Set(['box', 'sphere', 'cylinder', 'octa', 'ring', 'bevel', 'foliage']);
  for (const m of ville.objets) {
    assert.ok(formes.has(m.shape), m.shape);
    assert.ok(m.p.length === 3 && m.p.every(Number.isFinite));
    assert.ok(m.s.length === 3 && m.s.every(v => Number.isFinite(v) && v > 0));
    assert.ok(m.r.length === 3 && m.r.every(Number.isFinite));
    assert.ok(Number.isFinite(m.mat) && m.mat >= 0 && m.mat < 19);
    assert.equal(m.outdoor, true);
    if (m.color) assert.ok(m.color.length === 3 && m.color.every(v => v >= 0 && v <= 1));
  }
});

verifier('trajets : chaque étape et chaque segment restent praticables', () => {
  const r = ville.hasard(99);
  const { x0, x1, z0, z1 } = ville.etendue;
  let etapes = 0;
  for (let k = 0; k < 400; k++) {
    const a = [x0 + r() * (x1 - x0), z0 + r() * (z1 - z0)], b = [x0 + r() * (x1 - x0), z0 + r() * (z1 - z0)];
    const depart = ville.accrocher(a[0], a[1]);
    assert.ok(ville.praticable(depart[0], depart[1]), 'départ ' + depart);
    const chemin = ville.itineraire(a[0], a[1], b[0], b[1]);
    etapes += chemin.length;
    let p = depart;
    for (const q of chemin) {
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const x = p[0] + (q[0] - p[0]) * t, z = p[1] + (q[1] - p[1]) * t;
        assert.ok(ville.praticable(x, z), `segment ${p} → ${q} quitte la rue en ${x.toFixed(1)}, ${z.toFixed(1)}`);
      }
      p = q;
    }
  }
  assert.ok(etapes > 400);
});

verifier('départs des trois factions sur les rues', () => {
  for (let f = 0; f < 3; f++) {
    const pts = ville.departs(f, 800, 5);
    assert.equal(pts.length, 800);
    for (const [x, z] of pts) assert.ok(ville.praticable(x, z));
  }
});

const parForme = {};
for (const m of ville.objets) parForme[m.shape] = (parForme[m.shape] || 0) + 1;
console.log(`VILLE  REUSSI : ${ok} vérifications, ${ville.objets.length} pièces ${JSON.stringify(parForme)}, empreinte ${empreinte(ville)}`);
