// Vérifie les contrats regles.js et protocole.js : hostilité (colère du Bastion, alliés), droits de casser,
// barricader et lever, codage des unités, tables des types, et contrôle de forme des commandes.
//   node Jeu/verifications/regles.test.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const ici = path.dirname(fileURLToPath(import.meta.url));
const exiger = createRequire(import.meta.url);
for (const f of ['sim/regles.js', 'sim/protocole.js']) exiger(path.join(ici, '..', 'src', f));
const R = globalThis.PDR.regles, P = globalThis.PDR.protocole;
const { CONVERGENCE: C, BASTION: B, PREFECTURE: F } = R;

let ok = 0;
const verifier = (nom, f) => { f(); ok++; console.log('ok  ' + nom); };
const ALLIANCES = [null, [C, B], [B, C], [C, F], [B, F]];

verifier('le Bastion ne frappe la Préfecture qu\'en colère ; la Préfecture frappe tout le monde', () => {
  assert.equal(R.hostile(B, F, null, 0), false);
  assert.equal(R.hostile(B, F, null, 1), true);
  assert.equal(R.hostile(F, B, null, 0), true);
  assert.equal(R.hostile(F, C, null, 0), true);
  assert.equal(R.hostile(B, C, null, 0), true);
  assert.equal(R.hostile(C, B, null, 0), true);
  assert.equal(R.hostile(C, F, null, 0), true);
});

verifier('des alliés ne se frappent jamais, quelle que soit la colère ; personne ne se frappe soi-même', () => {
  for (const a of ALLIANCES) for (const colere of [0, 900]) for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
    if (x === y || x === 3 || y === 3) assert.equal(R.hostile(x, y, a, colere), false);
    if (a && R.allies(x, y, a)) assert.equal(R.hostile(x, y, a, colere), false, `alliés ${x}, ${y}`);
  }
  assert.equal(R.allies(C, B, [B, C]), true);
  assert.equal(R.allies(C, C, [C, B]), false);
  assert.equal(R.allies(C, F, [C, B]), false);
});

verifier('seule la Convergence casse et barricade', () => {
  assert.deepEqual([C, B, F].map(R.peutCasser), [true, false, false]);
  assert.deepEqual([C, B, F].map(R.peutBarricader), [true, false, false]);
  for (const t of R.TYPES) {
    if (t.faction !== C) assert.ok(!t.capacites.casser && !t.capacites.barricader, t.nom);
  }
  // Elle casse les avant-postes de ses adversaires, pas ceux d'un allié, pas les siens.
  assert.equal(R.peutCasserStructure(C, { sorte: 'avant-poste', faction: F }, null), true);
  assert.equal(R.peutCasserStructure(C, { sorte: 'avant-poste', faction: B }, [C, B]), false);
  assert.equal(R.peutCasserStructure(C, { sorte: 'avant-poste', faction: C }, null), false);
  assert.equal(R.peutCasserStructure(B, { sorte: 'avant-poste', faction: C }, null), false);
  assert.equal(R.peutCasserStructure(C, { sorte: 'qg', faction: F }, null), false);
});

verifier('lever : le Bastion et la Préfecture lèvent les barricades, la Convergence les siennes seulement', () => {
  const bar = f => ({ sorte: 'barricade', faction: f });
  assert.equal(R.peutLever(B, bar(C), null), true);
  assert.equal(R.peutLever(F, bar(C), null), true);
  assert.equal(R.peutLever(C, bar(C), null), true);
  assert.equal(R.peutLever(B, bar(C), [C, B]), false, 'pas celles d\'un allié');
  assert.equal(R.peutLever(F, bar(C), [F, C]), false);
});

verifier('seule la Préfecture lève les avant-postes ; un QG ne se lève pas', () => {
  const poste = f => ({ sorte: 'avant-poste', faction: f });
  for (const f of [C, B]) for (const g of [C, B, F]) assert.equal(R.peutLever(f, poste(g), null), false);
  assert.equal(R.peutLever(F, poste(C), null), true);
  assert.equal(R.peutLever(F, poste(B), null), true);
  assert.equal(R.peutLever(F, poste(F), null), false);
  assert.equal(R.peutLever(F, poste(B), [B, F]), false);
  for (const f of [C, B, F]) for (const g of [C, B, F]) assert.equal(R.peutLever(f, { sorte: 'qg', faction: g }, null), false);
  // Les types qui lèvent tout sont ceux de la Préfecture.
  for (const t of R.TYPES) if (t.capacites.leverTout) assert.equal(t.faction, F, t.nom);
});

verifier('codage des unités : aller-retour exact en Float32 sur tout le domaine', () => {
  const f32 = new Float32Array(1);
  for (let f = 0; f < 4; f++) for (let t = 0; t < 13; t++) for (const e of [0, 5, 11]) for (const n of [0, 31, 63]) for (const d of [0, 1, 31, 255]) {
    f32[0] = R.coder(f, t, e, n, d);
    const c = f32[0];
    assert.deepEqual([R.codeFaction(c), R.codeType(c), R.codeEtat(c), R.codeNiveau(c), R.codeDrapeaux(c)], [f, t, e, n, d]);
  }
});

verifier('tables : 13 types, factions et listes cohérentes, chiffres finis', () => {
  assert.equal(R.TYPES.length, 13);
  R.TYPES.forEach((t, k) => {
    assert.equal(t.id, k);
    assert.ok(R.TYPES_PAR_FACTION[t.faction].includes(k));
    for (const v of [t.coh, t.pression, t.portee, t.vitesse, t.vision, t.cout.moyens, t.cout.materiaux, t.duree, t.lot, t.pop, t.rayon]) assert.ok(Number.isFinite(v) && v >= 0, t.nom);
    assert.ok(t.coh > 0 && t.vitesse > 0 && t.lot >= 1 && t.duree > 0);
  });
  for (let f = 0; f < 3; f++) {
    assert.equal(R.TYPES[R.OUVRIER[f]].role, 'ouvrier');
    assert.equal(R.TYPES[R.BASE[f]].faction, f);
    assert.equal(R.TYPES[R.OUVRIER[f]].capacites.recolter, true);
  }
  const parts = R.FACTIONS.map(f => f.part);
  assert.ok(Math.abs(parts.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.deepEqual(R.FACTIONS.map(f => f.motif), ['rond', 'carre', 'chevron']);
});

verifier('îlots selon les effectifs : 9 jusqu\'à 30 000, 13 jusqu\'à 120 000, 15 au-delà', () => {
  assert.deepEqual(R.CONSTANTES.EFFECTIFS.map(R.ilots), [9, 13, 13, 15, 15]);
  assert.deepEqual([30000, 30001, 120000, 120001].map(R.ilots), [9, 13, 13, 15]);
});

verifier('protocole : forme des commandes, évènements, tampons', () => {
  const ids = Int32Array.of(1, 2, 3);
  assert.equal(P.forme(P.commande(P.CMD.DEPLACER, 0, { ids, x: 1, z: 2, mode: 1 })), '');
  assert.notEqual(P.forme({ t: P.CMD.DEPLACER, j: 0, ids: [1, 2], x: 1, z: 2 }), '', 'ids en tableau ordinaire');
  assert.notEqual(P.forme(P.commande(P.CMD.DEPLACER, 0, { ids, x: NaN, z: 2 })), '');
  assert.notEqual(P.forme(P.commande(99, 0, {})), '');
  assert.notEqual(P.forme(P.commande(P.CMD.PRODUIRE, 3, { producteur: 0, type: 1, n: 1 })), '');
  assert.equal(P.forme(P.commande(P.CMD.PRODUIRE, 2, { producteur: 2, type: 9, n: 1 })), '');
  assert.equal(P.forme(P.commande(P.CMD.BARRICADER, 0, { ids, x: 0, z: 0, x2: 5, z2: 0 })), '');
  assert.notEqual(P.forme(P.commande(P.CMD.BARRICADER, 0, { ids, x: 0, z: 0, x2: 5 })), '');
  assert.equal(new Set(Object.values(P.EV)).size, Object.keys(P.EV).length);
  assert.equal(P.tamponUnites(10).byteLength, 10 * P.FLOATS_PAR_UNITE * 4);
  const f32 = new Float32Array(P.EV_TAILLE * 2);
  f32.set([P.EV.REFUS, 0, 0, 1, P.RAISONS.INTERDIT, P.CMD.CASSER], P.EV_TAILLE);
  assert.deepEqual(P.lireEvenement(f32, 1), { type: P.EV.REFUS, x: 0, z: 0, faction: 1, a: P.RAISONS.INTERDIT, b: P.CMD.CASSER });
});

console.log(`REGLES  REUSSI : ${ok} vérifications`);
