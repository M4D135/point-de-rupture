// Vérifie le noyau JavaScript contre les valeurs du modèle et du C++ de l'étape A1.
//   node Jeu/verifications/noyau.test.mjs
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const ici = path.dirname(fileURLToPath(import.meta.url));
createRequire(import.meta.url)(path.join(ici, '..', 'src', 'noyau.js'));
const N = globalThis.PDR.noyau;

let ok = 0;
const verifier = (nom, f) => { f(); ok++; console.log('ok  ' + nom); };

verifier('FNV-1a 64 : valeurs publiées', () => {
  assert.equal(N.fnv(new Uint8Array(0), 0), 'cbf29ce484222325');
  assert.equal(N.fnv(new TextEncoder().encode('a'), 1), 'af63dc4c8601ec8c');
  assert.equal(N.fnv(new TextEncoder().encode('foobar'), 6), '85944171f73967e8');
});

verifier('racine entière exacte, petites et grandes distances', () => {
  const ref = (dx, dy) => {
    const n = BigInt(dx) * BigInt(dx) + BigInt(dy) * BigInt(dy);
    if (n < 2n) return Number(n);
    let x = n, y = (x + 1n) / 2n;
    while (y < x) { x = y; y = (x + n / x) / 2n; }
    return Number(x);
  };
  const cas = [[0, 0], [1, 0], [3, 4], [33554432, 33554432], [33554433, 1], [2000000000, 2000000000], [-2000000000, 1999999999]];
  const a = new N.Alea(12345n);
  for (let k = 0; k < 20000; k++) {
    const grand = k % 2 ? 2000000000 : 40000000;
    cas.push([a.entre(-grand, grand), a.entre(-grand, grand)]);
  }
  for (const [dx, dy] of cas) assert.equal(N.racine(dx, dy), ref(dx, dy), `racine(${dx}, ${dy})`);
});

verifier('pas tronqué exact jusqu’aux bornes', () => {
  const a = new N.Alea(777n);
  for (let k = 0; k < 20000; k++) {
    const dx = a.entre(-2000000000, 2000000000), dy = a.entre(-2000000000, 2000000000), pas = a.entre(0, N.VMAX);
    const d = N.racine(dx, dy);
    if (d <= pas) continue;
    const attendu = Number(BigInt(dx) * BigInt(pas) / BigInt(d));
    assert.equal(N.quotient(dx, pas, d), attendu, `${dx} × ${pas} / ${d}`);
    assert.equal(N.quotient(dy, pas, d), Number(BigInt(dy) * BigInt(pas) / BigInt(d)), `${dy} × ${pas} / ${d}`);
  }
});

verifier('soumettre : verdicts et ordre canonique', () => {
  const s = new N.Simulation(3);
  assert.equal(s.soumettre([0, 0, 0, 0, 0, 0, 0]), 'invalide');
  assert.equal(s.soumettre([0, 0, 0, 5, 0, 0, 0]), 'invalide');
  assert.equal(s.soumettre([-1, 0, 0, 1, 0, 0, 0]), 'invalide');
  assert.equal(s.soumettre([N.ITMAX, 0, 0, 1, 0, 0, 0]), 'invalide');
  assert.equal(s.soumettre([2, 1, 0, 2, 9, 9, 9]), 'acceptee');
  assert.equal(s.soumettre([2, 0, 5, 1, 0, 0, 0]), 'acceptee');
  assert.equal(s.soumettre([1, 255, 0, 1, 0, 0, 0]), 'acceptee');
  assert.deepEqual(s.att.map(c => c[0] + ':' + c[1]), ['1:255', '2:0', '2:1']);
  s.avancerJusqua(2);
  assert.equal(s.soumettre([1, 0, 0, 1, 0, 0, 0]), 'tardive');
  assert.equal(s.sequenceLibre(0), 6);
  assert.equal(s.sequenceLibre(2), 0);
  assert.throws(() => s.soumettre([2, 256, 0, 1, 0, 0, 0]));
  assert.throws(() => s.soumettre([2.5, 0, 0, 1, 0, 0, 0]));
});

verifier('texte d’une relecture identique au modèle Python', () => {
  const modele = path.join(ici, '..', '..', 'Outils', 'modele');
  const script = 'import sys; sys.path.insert(0, sys.argv[1]); import modele_a1 as m; sys.stdout.write(m.generer(7, 3000).texte())';
  const attendu = execFileSync('python3', ['-I', '-c', script, modele], { encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(N.generer(7, 3000).texte(), attendu);
});

const debut = performance.now();
const r = N.condense(10000, 1, 100);
const duree = ((performance.now() - debut) / 1000).toFixed(1);
verifier(`condensé des parties 1 à 100, 10 000 itérations (${duree} s)`, () => {
  assert.deepEqual(r, { condense: '9565f56e1f910d8d', commandes: 337010, distinctes: 100 });
});

console.log(`NOYAU JS  REUSSI : ${ok} vérifications, condensé ${r.condense}, ${r.commandes} commandes, ${r.distinctes} empreintes finales distinctes`);
