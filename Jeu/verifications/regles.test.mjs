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
  // Seize types possibles (13 et 14 réservés aux pompiers de la 0.3, 15 libre), seize états (12 à 15 depuis la 0.3).
  for (let f = 0; f < 4; f++) for (let t = 0; t < 16; t++) for (const e of [0, 5, 11, 12, 13, 14, 15]) for (const n of [0, 31, 63]) for (const d of [0, 1, 31, 255]) {
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

// ---- 0.3 ----
verifier('0.3 : victoire au choix, remise en forme et valeurs par défaut', () => {
  const V = R.CONSTANTES.VICTOIRE;
  assert.deepEqual(V.MODES, ['dernier', 'temps', 'points', 'mixte']);
  assert.deepEqual(R.victoire(undefined), { mode: 'dernier', points: 3000, duree: 20 });
  assert.deepEqual(R.victoire(null), R.victoire({}));
  assert.deepEqual(R.victoire({ mode: 'mixte' }), { mode: 'mixte', points: 3000, duree: 40 }, 'la règle de la 0.2');
  assert.deepEqual(R.victoire({ mode: 'temps', duree: 15 }), { mode: 'temps', points: 3000, duree: 15 });
  assert.deepEqual(R.victoire({ mode: 'points', points: 1500.4 }), { mode: 'points', points: 1500, duree: 20 });
  assert.equal(R.victoire({ mode: 'au hasard' }).mode, 'dernier');
  assert.deepEqual(R.victoire({ mode: 'temps', duree: NaN, points: -5 }), { mode: 'temps', points: 100, duree: 20 }, 'bornes');
  assert.equal(R.victoire({ mode: 'temps', duree: 1e9 }).duree, 180);
  for (const m of V.MODES) assert.equal(R.victoire({ mode: m }).mode, m);
  for (const p of V.POINTS) assert.equal(R.victoire({ mode: 'points', points: p }).points, p);
  for (const d of V.DUREES) assert.equal(R.victoire({ mode: 'temps', duree: d }).duree, d);
  assert.ok(V.PLAFOND_S === 5400 && V.DEMO_PLAFOND_S === 3600, 'limites de sécurité : 90 et 60 minutes');
});

verifier('0.3 : part des manifestants (peu, moyen par défaut, beaucoup), cent pour cent à chaque fois', () => {
  assert.deepEqual(R.parts(), [40, 32, 28]);
  assert.deepEqual(R.parts('peu'), [34, 35, 31]);
  assert.deepEqual(R.parts('beaucoup'), [50, 27, 23], 'la 0.2');
  assert.deepEqual(R.parts('toString'), [40, 32, 28], 'une clé héritée n\'est pas un choix');
  assert.equal(R.manifestants('n importe quoi'), 'moyen');
  for (const k of Object.keys(R.CONSTANTES.MANIFESTANTS)) assert.equal(R.parts(k).reduce((a, b) => a + b, 0), 100, k);
  assert.deepEqual(R.FACTIONS.map(f => Math.round(f.part * 100)), R.parts());
});

verifier('0.3 : durées de vol, feu des objets et de leurs sortes, capacités de lancer et de charge', () => {
  assert.equal(R.dureeVol('pierre', 10), 0.6);
  assert.ok(Math.abs(R.dureeVol('molotov', 20) - 1.5) < 1e-9 && Math.abs(R.dureeVol('lacrymo', 22) - 1.6) < 1e-9);
  assert.equal(R.dureeVol('fusee', 10), 0);
  // Par les points de structure : la voiture (300) brûle 38 s sur 4,5 m ; la poubelle (40), 12 s sur 2 m.
  assert.deepEqual(R.feuObjet(300), { duree: 38, rayon: 4.5 });
  assert.deepEqual(R.feuObjet(40, undefined, 'poubelle'), { duree: 12, rayon: 2 });
  assert.deepEqual(R.feuObjet(undefined), R.feuObjet(60), 'pv absents : 60');
  // Les sortes de la ville réelle ont leur feu ; « feu » sur l'objet passe avant tout.
  const S = R.CONSTANTES.FEU.objet.sortes;
  assert.deepEqual(Object.keys(S), ['deux-roues', 'conteneur', 'terrasse', 'kiosque']);
  for (const k of Object.keys(S)) {
    assert.deepEqual(R.feuObjet(100, undefined, k), { duree: S[k].duree, rayon: S[k].rayon }, k);
    assert.ok(S[k].duree >= 12 && S[k].duree <= 40 && S[k].rayon >= 2 && S[k].rayon <= 4.5, k);
  }
  assert.deepEqual(R.feuObjet(120, 0, 'kiosque'), { duree: 0, rayon: 0 }, 'feu : 0, il ne brûle pas');
  assert.deepEqual(R.feuObjet(120, 50, 'kiosque'), { duree: 50, rayon: S.kiosque.rayon });
  assert.equal(R.feuObjet(120, 500).duree, 120);
  assert.equal(R.feuObjet(120, undefined, 'hasOwnProperty').duree, 15, 'une clé héritée n\'est pas une sorte');
  // Qui lance quoi : pierres (Cortège, Piquets), cocktails (Furets), grenades (Compagnie), charges (Béliers, Patrouille).
  const avec = c => R.TYPES.filter(t => t.capacites[c]).map(t => t.cle);
  assert.deepEqual(avec('pierres'), ['cortege', 'piquets']);
  assert.deepEqual(avec('molotov'), ['furets']);
  assert.deepEqual(avec('lacrymo'), ['compagnie']);
  assert.deepEqual(avec('charge'), ['beliers', 'patrouille']);
  for (const t of R.TYPES) for (const c of ['pierres', 'molotov', 'charge', 'lacrymo']) {
    const x = t.capacites[c];
    if (x) for (const v of Object.values(x)) assert.ok(typeof v === 'boolean' || (Number.isFinite(v) && v >= 0), t.cle + ' ' + c);
    if (x && x.porteeMin !== undefined) assert.ok(x.porteeMin < x.portee, t.cle + ' ' + c);
  }
});

verifier('0.3 : protocole version 2, sortes de cassables, numéros laissés aux pompiers (types 13 et 14, ordre 18, évènements 38 et 39)', () => {
  assert.equal(P.VERSION, 2);
  assert.deepEqual(P.SORTES_CASSABLES, ['voiture', 'abribus', 'vitrine', 'poubelle', 'banc', 'barriere', 'deux-roues', 'conteneur', 'terrasse', 'kiosque']);
  assert.deepEqual(Object.values(P.SORTES_FEU), [0, 1, 2, 3]);
  assert.equal(P.SOURCES_COUPS.length, 8);
  assert.deepEqual(P.RAISONS_FIN, ['', 'dernier', 'points', 'temps', 'plafond', 'nul']);
  assert.equal(new Set(Object.values(P.CMD)).size, Object.keys(P.CMD).length);
  assert.equal(Math.max(...Object.values(P.CMD)), 17);
  assert.equal(Math.max(...Object.values(P.EV)), 37);
  assert.equal(R.TYPES.length, 13);
  assert.deepEqual(Object.values(R.ETATS), Array.from({ length: 16 }, (_, k) => k), 'les seize états servent');
  const ids = Int32Array.of(4);
  assert.equal(P.forme(P.commande(P.CMD.MOLOTOV, 0, { ids, x: 1, z: 2 })), '');
  assert.notEqual(P.forme(P.commande(P.CMD.MOLOTOV, 0, { ids, x: 1 })), '');
  assert.notEqual(P.forme({ t: P.CMD.MOLOTOV, j: 0, ids: [4], x: 1, z: 2 }), '');
  assert.equal(P.forme(P.commande(P.CMD.CAPACITE, 2, { ids, capacite: 'lacrymo', x: 1, z: 2 })), '');
  const feux = Float32Array.of(7, 1, 2, 4, 0.5, 9, P.SORTES_FEU.OBJET, 12), nuages = Float32Array.of(3, 1, 2, 7, 1, 14);
  assert.deepEqual(P.lireFeu(feux, 0), { id: 7, x: 1, z: 2, rayon: 4, intensite: 0.5, reste: 9, sorte: 1, cible: 12 });
  assert.deepEqual(P.lireNuage(nuages, 0), { id: 3, x: 1, z: 2, rayon: 7, densite: 1, reste: 14 });
  assert.equal(P.FEU_TAILLE * R.CONSTANTES.FEU.max, 1024);
});

console.log(`REGLES  REUSSI : ${ok} vérifications`);
