// Vérifie l'interface sans navigateur : réglages (défauts, normalisation, touches et conflits, stockage refusé), chaque
// ordre construit depuis un faux état (forme du protocole), choix au point et au cadre sur 100 000 unités avec un faux
// projecteur (et sa durée), groupes, visées, clavier, contexte de la carte de commandes, calculs de la minicarte.
//   node Jeu/verifications/interface.test.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import assert from 'node:assert/strict';

const ici = path.dirname(fileURLToPath(import.meta.url));
const charger = createRequire(import.meta.url);
for (const f of ['sim/regles.js', 'sim/protocole.js', 'interface/reglages.js', 'interface/hud.js', 'interface/minicarte.js', 'interface/commandes.js']) {
  charger(path.join(ici, '..', 'src', f));
}
const { regles: R, protocole: P, interface: I } = globalThis.PDR;
const REGL = I.reglages, O = I.ordres, M = I.minicarte, CMD = P.CMD;

let ok = 0;
const verifier = (nom, f) => { f(); ok++; console.log('ok  ' + nom); };
const bienFormee = c => assert.equal(P.forme(c), '', 'commande mal formée : ' + JSON.stringify(c));
const NBSP = ' ', FINE = ' ';

// ------------------------------------------------------------------------------------------------------------------
// Réglages
// ------------------------------------------------------------------------------------------------------------------
verifier('réglages : défauts complets, sans conflit de touches', () => {
  const d = REGL.defaults();
  assert.equal(d.version, REGL.VERSION);
  assert.equal(d.partie.effectifs, R.CONSTANTES.EFFECTIFS_DEFAUT);
  assert.equal(d.qualite, 'auto');
  assert.equal(d.demo, true);
  for (const a of REGL.ACTIONS) {
    assert.ok(Array.isArray(d.touches[a.id]) && d.touches[a.id].length >= 1, a.id);
    for (const c of d.touches[a.id]) assert.equal(REGL.conflit(d.touches, a.id, c), null, a.id + ' ' + c);
  }
  // Les touches de production suivent les raccourcis des règles (Q W E R T).
  assert.deepEqual(['produire1', 'produire2', 'produire3', 'produire4', 'produire5'].map(id => d.touches[id][0]), ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT']);
  assert.equal(REGL.defaults(true).defilementBord, false, 'tactile : pas de défilement au bord');
  assert.equal(REGL.defaults(true).infobulles, false);
});

verifier('réglages : normalisation (types, bornes, alliance, touches invalides ou en conflit)', () => {
  assert.deepEqual(REGL.normalize(null), REGL.defaults());
  assert.deepEqual(REGL.normalize('n’importe quoi'), REGL.defaults());
  const n = REGL.normalize({ luminosite: 3, volumeMusique: -2, vitesseCamera: 9, qualite: 'ultra', limiteImages: 45, vitesse: 3, ombres: 'oui', son: false,
    partie: { faction: 2, alliance: 2, effectifs: 12345, difficulte: 7, graine: 0, brouillard: false } });
  assert.equal(n.luminosite, 1.4);
  assert.equal(n.volumeMusique, 0);
  assert.equal(n.vitesseCamera, 2);
  assert.equal(n.qualite, 'auto');
  assert.equal(n.limiteImages, 0);
  assert.equal(n.vitesse, 1);
  assert.equal(n.ombres, true);
  assert.equal(n.son, false);
  assert.equal(n.partie.faction, 2);
  assert.equal(n.partie.alliance, -1, 'on ne s’allie pas à soi-même');
  assert.equal(n.partie.effectifs, R.CONSTANTES.EFFECTIFS_DEFAUT);
  assert.equal(n.partie.difficulte, 1);
  assert.equal(n.partie.graine, 1);
  assert.equal(n.partie.brouillard, false);
  // Touches : un conflit ou une touche réservée et toutes reprennent leurs défauts.
  const d = REGL.defaults();
  assert.deepEqual(REGL.normalize({ touches: { ...d.touches, attaque: ['KeyS'] } }).touches, d.touches);
  assert.deepEqual(REGL.normalize({ touches: { ...d.touches, attaque: ['Escape'] } }).touches, d.touches);
  assert.deepEqual(REGL.normalize({ touches: { ...d.touches, attaque: ['KeyZ', 'KeyZ'] } }).touches, d.touches);
  // Un choix valide est gardé ; une action apparue depuis prend ses défauts, sauf ceux déjà pris.
  const perso = { ...d.touches, attaque: ['KeyZ'] };
  delete perso.jet;
  perso.recolter = ['KeyJ'];
  const t = REGL.normalize({ touches: perso }).touches;
  assert.deepEqual(t.attaque, ['KeyZ']);
  assert.deepEqual(t.recolter, ['KeyJ']);
  assert.deepEqual(t.jet, [], 'J déjà pris par Récolter : Jet reste sans touche');
});

verifier('réglages : assigner, conflits croisés, touches réservées, seconde touche', () => {
  const d = REGL.defaults().touches;
  let r = REGL.assign(d, 'attaque', 'KeyS');
  assert.equal(r.ok, false);
  assert.equal(r.conflit, 'arret');
  assert.equal(r.raison, 'Déjà utilisée : Arrêt (ordres aux unités).');
  // « ordres » et « production » ne servent jamais ensemble : la même touche peut servir aux deux.
  r = REGL.assign(d, 'produire1', 'KeyA');
  assert.equal(r.ok, true);
  assert.deepEqual(r.touches.produire1, ['KeyA']);
  // « vue » et « general » valent partout.
  assert.equal(REGL.assign(d, 'attaque', 'ArrowUp').conflit, 'vueAvant');
  assert.equal(REGL.assign(d, 'produire1', 'KeyP').conflit, 'pause');
  for (const c of ['Escape', 'Tab', 'Digit3', 'ShiftLeft', 'F5', 'Backspace', 'SigneM']) assert.equal(REGL.assign(d, 'attaque', c).ok, false, c);
  r = REGL.assign(d, 'attaque', 'KeyZ', 1);
  assert.deepEqual(r.touches.attaque, ['KeyA', 'KeyZ']);
  r = REGL.assign(r.touches, 'attaque', 'KeyZ', 0);
  assert.deepEqual(r.touches.attaque, ['KeyZ'], 'la même touche ne se double pas');
  assert.deepEqual(REGL.effacer({ ...d, attaque: ['KeyA', 'KeyZ'] }, 'attaque', 1).attaque, ['KeyA']);
  assert.notEqual(r.touches, d, 'objet neuf');
  assert.deepEqual(d.attaque, ['KeyA'], 'l’original ne bouge pas');
});

verifier('réglages : noms des touches, lettres selon la disposition (AZERTY)', () => {
  assert.equal(REGL.keyName('KeyA'), 'A');
  assert.equal(REGL.keyName('Space'), 'Espace');
  assert.equal(REGL.keyName('ArrowUp'), '↑');
  assert.equal(REGL.keyName('Numpad3'), 'Pavé 3');
  assert.equal(REGL.keyName('F2'), 'F2');
  assert.equal(REGL.keyName('PageDown'), 'Page ↓');
  assert.equal(REGL.touche({ code: 'KeyQ', key: 'a' }), 'KeyA', 'la touche marquée A d’un AZERTY');
  assert.equal(REGL.touche({ code: 'KeyA', key: 'Q' }), 'KeyQ');
  assert.equal(REGL.touche({ code: 'KeyM', key: ',' }), 'Signe,');
  assert.equal(REGL.touche({ code: 'Digit1', key: '&' }), 'Digit1');
  assert.equal(REGL.touche({ code: 'ArrowLeft', key: 'ArrowLeft' }), 'ArrowLeft');
  const idx = REGL.indexer(REGL.defaults().touches);
  assert.equal(idx.get('KeyE').ordres, 'avantPoste');
  assert.equal(idx.get('KeyE').production, 'produire3');
  assert.equal(idx.get('Space').general, 'alerte');
});

verifier('réglages : stockage lu, écrit, refusé ou illisible', () => {
  const memoire = new Map();
  const stock = { getItem: k => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => memoire.set(k, String(v)) };
  const r = REGL.charger(stock, false);
  assert.deepEqual(r, REGL.defaults());
  r.volumeGeneral = 0.3; r.partie.faction = 1; r.touches = REGL.assign(r.touches, 'attaque', 'KeyZ').touches;
  assert.equal(REGL.enregistrer(r, stock), true);
  const relu = REGL.charger(stock, false);
  assert.equal(relu.volumeGeneral, 0.3);
  assert.equal(relu.partie.faction, 1);
  assert.deepEqual(relu.touches.attaque, ['KeyZ']);
  memoire.set(REGL.CLE, '{pas du json');
  assert.deepEqual(REGL.charger(stock, false), REGL.defaults());
  const refuse = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceeded'); } };
  assert.deepEqual(REGL.charger(refuse, false), REGL.defaults());
  assert.equal(REGL.enregistrer(r, refuse), false);
});

verifier('outils : nombres, horloge, typographie française', () => {
  const T = I.outils;
  assert.equal(T.formatNombre(100000), '100' + FINE + '000');
  assert.equal(T.formatHorloge(65), '01:05');
  assert.equal(T.formatHorloge(3700), '1:01:40');
  assert.equal(T.typo('Alliance : oui ; non ! « là » 45 s 100 %'), 'Alliance' + NBSP + ': oui' + FINE + '; non' + FINE + '! «' + NBSP + 'là' + NBSP + '» 45' + NBSP + 's 100' + NBSP + '%');
  assert.equal(T.typo('<b style="--c:#fff">a ?</b>'), '<b style="--c:#fff">a' + FINE + '?</b>', 'le balisage ne bouge pas');
  assert.equal(T.echapper('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

// ------------------------------------------------------------------------------------------------------------------
// Ordres en fonctions pures, depuis un faux état
// ------------------------------------------------------------------------------------------------------------------
const ids = (...v) => Int32Array.from(v);
const types = (...v) => Uint8Array.from(v);
const ecoRiche = { moyens: 5000, materiaux: 5000, pop: 100, popMax: 10000 };
const ctxDe = (joueur, idsV, typesV, extra = {}) => ({ joueur, alliance: null, colere: 0, ids: idsV, types: typesV, eco: ecoRiche, structure: null, ...extra });
const barricade = (faction, extra = {}) => ({ id: 40, sorte: 'barricade', faction, x: 10, z: 10, x2: 20, z2: 10, pv: 100, pvMax: 400, chantier: false, feu: false, ...extra });
const avantPoste = (faction, extra = {}) => ({ id: 41, sorte: 'avant-poste', faction, x: 50, z: 50, x2: 50, z2: 50, pv: 1500, pvMax: 1500, chantier: false, file: [], ralliement: null, ...extra });
const qg = (faction, extra = {}) => ({ id: faction, sorte: 'qg', faction, x: 0, z: 0, x2: 0, z2: 0, pv: 1, pvMax: 1, chantier: false, occupation: 0, file: [], ralliement: null, ...extra });

verifier('ordre contextuel : unité hostile, alliée, Bastion sans et avec colère', () => {
  let r = O.ordreContextuel(R, P, ctxDe(0, ids(1, 2), types(1, 1)), { sorte: 'unite', id: 77, faction: 1 }, 5, 5);
  assert.equal(r.cmds.length, 1); bienFormee(r.cmds[0]);
  assert.equal(r.cmds[0].t, CMD.ATTAQUER); assert.equal(r.cmds[0].cible, 77); assert.deepEqual([...r.cmds[0].ids], [1, 2]);
  r = O.ordreContextuel(R, P, ctxDe(0, ids(1), types(1), { alliance: [0, 1] }), { sorte: 'unite', id: 77, faction: 1 }, 5, 6);
  assert.equal(r.cmds[0].t, CMD.DEPLACER); assert.equal(r.cmds[0].mode, 0); assert.equal(r.message, 'Des alliés ne se frappent pas.'); bienFormee(r.cmds[0]);
  r = O.ordreContextuel(R, P, ctxDe(1, ids(3), types(5)), { sorte: 'unite', id: 9, faction: 2 }, 1, 1);
  assert.equal(r.cmds[0].t, CMD.DEPLACER); assert.match(r.message, /colère/);
  r = O.ordreContextuel(R, P, ctxDe(1, ids(3), types(5), { colere: 12 }), { sorte: 'unite', id: 9, faction: 2 }, 1, 1);
  assert.equal(r.cmds[0].t, CMD.ATTAQUER); bienFormee(r.cmds[0]);
  r = O.ordreContextuel(R, P, ctxDe(2, ids(3), types(9)), { sorte: 'unite', id: 9, faction: 1 }, 1, 1);
  assert.equal(r.cmds[0].t, CMD.ATTAQUER, 'la Préfecture frappe tout le monde');
});

verifier('ordre contextuel : barricades, avant-postes, QG, gisements, cassables, sol', () => {
  // Convergence : rejoindre son chantier de barricade (même segment) ; les Fanfares, qui ne bâtissent pas, suivent.
  let r = O.ordreContextuel(R, P, ctxDe(0, ids(1, 2, 3), types(0, 1, 3)), { sorte: 'structure', s: barricade(0, { chantier: true }) }, 15, 10);
  assert.equal(r.cmds.length, 2);
  assert.equal(r.cmds[0].t, CMD.BARRICADER); assert.deepEqual([r.cmds[0].x, r.cmds[0].z, r.cmds[0].x2, r.cmds[0].z2], [10, 10, 20, 10]);
  assert.deepEqual([...r.cmds[0].ids], [1, 2]); assert.equal(r.cmds[1].t, CMD.DEPLACER); assert.deepEqual([...r.cmds[1].ids], [3]);
  r.cmds.forEach(bienFormee);
  // Bastion et Préfecture lèvent la barricade d'un autre camp ; jamais celle d'un allié.
  r = O.ordreContextuel(R, P, ctxDe(1, ids(4), types(7)), { sorte: 'structure', s: barricade(0) }, 15, 10);
  assert.equal(r.cmds[0].t, CMD.LEVER); assert.equal(r.cmds[0].cible, 40); bienFormee(r.cmds[0]);
  r = O.ordreContextuel(R, P, ctxDe(1, ids(4), types(7), { alliance: [0, 1] }), { sorte: 'structure', s: barricade(0) }, 15, 10);
  assert.equal(r.cmds[0].t, CMD.DEPLACER);
  // La Convergence ne lève pas une barricade au clic droit (elle retire les siennes par la commande Lever).
  r = O.ordreContextuel(R, P, ctxDe(0, ids(1), types(1)), { sorte: 'structure', s: barricade(0) }, 15, 10);
  assert.equal(r.cmds[0].t, CMD.DEPLACER);
  // Avant-postes : chantier à soi (Équipes), casse par la Convergence, levée par la Préfecture.
  r = O.ordreContextuel(R, P, ctxDe(1, ids(5, 6), types(4, 5)), { sorte: 'structure', s: avantPoste(1, { chantier: true }) }, 50, 50);
  assert.equal(r.cmds[0].t, CMD.CONSTRUIRE); assert.deepEqual([...r.cmds[0].ids], [5]); assert.equal(r.cmds[1].t, CMD.DEPLACER);
  r.cmds.forEach(bienFormee);
  r = O.ordreContextuel(R, P, ctxDe(0, ids(1, 2), types(2, 3)), { sorte: 'structure', s: avantPoste(2) }, 50, 50);
  assert.equal(r.cmds[0].t, CMD.CASSER); assert.equal(r.cmds[0].sorte, 'structure'); assert.equal(r.cmds[0].cible, 41); bienFormee(r.cmds[0]);
  r = O.ordreContextuel(R, P, ctxDe(2, ids(7), types(10)), { sorte: 'structure', s: avantPoste(1) }, 50, 50);
  assert.equal(r.cmds[0].t, CMD.LEVER); bienFormee(r.cmds[0]);
  r = O.ordreContextuel(R, P, ctxDe(1, ids(7), types(5)), { sorte: 'structure', s: avantPoste(0) }, 50, 50);
  assert.equal(r.cmds[0].t, CMD.DEPLACER, 'le Bastion ne lève pas les avant-postes');
  // QG adverse : on l'occupe (attaque-mouvement vers lui).
  r = O.ordreContextuel(R, P, ctxDe(0, ids(1), types(1)), { sorte: 'structure', s: qg(2, { x: 300, z: 40 }) }, 299, 41);
  assert.equal(r.cmds[0].t, CMD.DEPLACER); assert.equal(r.cmds[0].mode, 1); assert.equal(r.marque.x, 300); bienFormee(r.cmds[0]);
  // Gisement : les Équipes récoltent, les autres suivent.
  r = O.ordreContextuel(R, P, ctxDe(2, ids(8, 9), types(8, 9)), { sorte: 'gisement', index: 3, x: 70, z: 80 }, 70, 80);
  assert.equal(r.cmds[0].t, CMD.RECOLTER); assert.equal(r.cmds[0].gisement, 3); assert.deepEqual([...r.cmds[0].ids], [8]); r.cmds.forEach(bienFormee);
  // Cassable : la Convergence casse.
  r = O.ordreContextuel(R, P, ctxDe(0, ids(1), types(2)), { sorte: 'cassable', index: 12, x: 3, z: 4 }, 3, 4);
  assert.equal(r.cmds[0].t, CMD.CASSER); assert.equal(r.cmds[0].sorte, 'cassable'); assert.equal(r.cmds[0].cible, 12); bienFormee(r.cmds[0]);
  r = O.ordreContextuel(R, P, ctxDe(1, ids(4), types(5)), { sorte: 'cassable', index: 12, x: 3, z: 4 }, 3, 4);
  assert.equal(r.cmds[0].t, CMD.DEPLACER);
  // Sol.
  r = O.ordreContextuel(R, P, ctxDe(0, ids(1), types(1)), { sorte: 'sol' }, 12.5, -3);
  assert.deepEqual([r.cmds[0].t, r.cmds[0].x, r.cmds[0].z, r.cmds[0].mode], [CMD.DEPLACER, 12.5, -3, 0]); bienFormee(r.cmds[0]);
  assert.equal(O.ordreContextuel(R, P, ctxDe(0, ids(), types()), { sorte: 'sol' }, 1, 1).cmds.length, 0);
});

verifier('ordres de visée : attaque, regrouper, barricade, lever, casser, avant-poste, récolter, salve, jet, ralliement', () => {
  let r = O.ordreVisee(R, P, ctxDe(0, ids(1), types(1)), 'attaque', { sorte: 'sol' }, 4, 5);
  assert.deepEqual([r.cmds[0].t, r.cmds[0].mode], [CMD.DEPLACER, 1]); bienFormee(r.cmds[0]);
  r = O.ordreVisee(R, P, ctxDe(0, ids(1), types(1)), 'attaque', { sorte: 'unite', id: 5, faction: 2 }, 4, 5);
  assert.equal(r.cmds[0].t, CMD.ATTAQUER); bienFormee(r.cmds[0]);
  r = O.ordreVisee(R, P, ctxDe(0, ids(1, 2), types(1, 1)), 'regrouper', { sorte: 'sol' }, 4, 5);
  assert.equal(r.cmds[0].t, CMD.REGROUPER); bienFormee(r.cmds[0]);
  // Barricade : bornée de 4 à 20 m, 6 Matériaux par mètre, Convergence seulement.
  r = O.ordreVisee(R, P, ctxDe(0, ids(1, 2), types(0, 3)), 'barricade', null, 0, 0, 50, 0);
  assert.equal(r.cmds[0].t, CMD.BARRICADER); assert.equal(r.cmds[0].x2, 20); assert.deepEqual([...r.cmds[0].ids], [1]); bienFormee(r.cmds[0]);
  r = O.ordreVisee(R, P, ctxDe(0, ids(1), types(1)), 'barricade', null, 0, 0, 1, 0);
  assert.equal(r.cmds[0].x2, 4, 'au moins 4 m');
  r = O.ordreVisee(R, P, ctxDe(0, ids(1), types(1), { eco: { ...ecoRiche, materiaux: 50 } }), 'barricade', null, 0, 0, 10, 0);
  assert.equal(r.cmds.length, 0); assert.equal(r.message, 'Matériaux insuffisants : 60 pour 10 m.');
  r = O.ordreVisee(R, P, ctxDe(1, ids(4), types(5)), 'barricade', null, 0, 0, 10, 0);
  assert.equal(r.cmds.length, 0); assert.match(r.message, /Convergence/);
  assert.equal(O.coutBarricade(R, 10.2), 62);
  const s = O.borneSegment(3, 3, 3, 3, 4, 20, [0, 1]);
  assert.deepEqual([s.x2, s.z2, s.longueur], [3, 7, 4], 'deux bouts confondus : la direction de l’écran');
  // Lever.
  r = O.ordreVisee(R, P, ctxDe(0, ids(1), types(1)), 'lever', { sorte: 'structure', s: barricade(0) }, 0, 0);
  assert.equal(r.cmds[0].t, CMD.LEVER, 'la Convergence retire ses barricades'); bienFormee(r.cmds[0]);
  r = O.ordreVisee(R, P, ctxDe(0, ids(1), types(1)), 'lever', { sorte: 'structure', s: barricade(1) }, 0, 0);
  assert.equal(r.cmds.length, 0); assert.match(r.message, /propres barricades/);
  // Casser.
  r = O.ordreVisee(R, P, ctxDe(0, ids(1), types(2)), 'casser', { sorte: 'cassable', index: 4, x: 1, z: 1 }, 1, 1);
  assert.equal(r.cmds[0].t, CMD.CASSER); bienFormee(r.cmds[0]);
  r = O.ordreVisee(R, P, ctxDe(0, ids(1), types(3)), 'casser', { sorte: 'cassable', index: 4, x: 1, z: 1 }, 1, 1);
  assert.equal(r.cmds.length, 0, 'une Fanfare ne casse pas');
  // Avant-poste.
  r = O.ordreVisee(R, P, ctxDe(2, ids(8, 9), types(8, 9)), 'avantPoste', { sorte: 'sol' }, 30, 30);
  assert.equal(r.cmds[0].t, CMD.CONSTRUIRE); assert.deepEqual([...r.cmds[0].ids], [8]); bienFormee(r.cmds[0]);
  r = O.ordreVisee(R, P, ctxDe(2, ids(8), types(8), { eco: { ...ecoRiche, moyens: 100 } }), 'avantPoste', { sorte: 'sol' }, 30, 30);
  assert.equal(r.cmds.length, 0); assert.equal(r.message, 'Il faut 150 Moyens et 100 Matériaux.');
  // Récolter.
  r = O.ordreVisee(R, P, ctxDe(1, ids(4), types(4)), 'recolter', { sorte: 'gisement', index: 2, x: 0, z: 0 }, 0, 0);
  assert.equal(r.cmds[0].t, CMD.RECOLTER); bienFormee(r.cmds[0]);
  assert.equal(O.ordreVisee(R, P, ctxDe(1, ids(4), types(4)), 'recolter', { sorte: 'sol' }, 0, 0).cmds.length, 0);
  // Capacités : la Salve des Compagnies, le Jet du Canon à eau.
  r = O.ordreVisee(R, P, ctxDe(2, ids(20, 21), types(10, 9)), 'salve', { sorte: 'sol' }, 9, 9);
  assert.equal(r.cmds[0].t, CMD.CAPACITE); assert.equal(r.cmds[0].capacite, 'salve'); assert.deepEqual([...r.cmds[0].ids], [20]); bienFormee(r.cmds[0]);
  r = O.ordreVisee(R, P, ctxDe(2, ids(22), types(12)), 'jet', { sorte: 'sol' }, 9, 9);
  assert.equal(r.cmds[0].capacite, 'jet'); bienFormee(r.cmds[0]);
  assert.equal(O.ordreVisee(R, P, ctxDe(2, ids(21), types(9)), 'jet', { sorte: 'sol' }, 9, 9).cmds.length, 0);
  // Ralliement d'une structure choisie.
  r = O.ordreVisee(R, P, ctxDe(0, ids(), types(), { structure: qg(0) }), 'ralliement', null, 7, 8);
  assert.deepEqual([r.cmds[0].t, r.cmds[0].producteur, r.cmds[0].x, r.cmds[0].z], [CMD.RALLIEMENT, 0, 7, 8]); bienFormee(r.cmds[0]);
  // Immédiats.
  for (const [id, t] of [['arret', CMD.ARRETER], ['tenir', CMD.TENIR], ['replier', CMD.REPLIER]]) {
    const c = O.ordreImmediat(R, P, ctxDe(0, ids(1, 2), types(1, 1)), id).cmds[0];
    assert.equal(c.t, t); bienFormee(c);
  }
});

verifier('production : types produits, raisons de refus, lots bornés par la file et les moyens', () => {
  assert.deepEqual(O.typesProduits(R, qg(2)), [8, 9, 10, 11, 12]);
  assert.deepEqual(O.typesProduits(R, avantPoste(1)), [4, 5]);
  const c0 = ctxDe(0, ids(), types());
  let r = O.ordreProduction(R, P, c0, qg(0), 1, 1);
  assert.deepEqual([r.cmds[0].t, r.cmds[0].producteur, r.cmds[0].type, r.cmds[0].n], [CMD.PRODUIRE, 0, 1, 1]); bienFormee(r.cmds[0]);
  r = O.ordreProduction(R, P, c0, qg(0, { file: [{}, {}, {}] }), 1, 5);
  assert.equal(r.cmds[0].n, 2, 'deux places libres');
  r = O.ordreProduction(R, P, ctxDe(0, ids(), types(), { eco: { moyens: 170, materiaux: 0, pop: 0, popMax: 1000 } }), qg(0), 1, 5);
  assert.equal(r.cmds[0].n, 2, 'Maj : autant de lots que les Moyens en paient (2 × 80)');
  const raison = (ctx, s, t) => O.raisonProduction(R, ctx, s, t, 1);
  assert.match(raison(c0, qg(1), 4), /pas à vous/);
  assert.match(raison(c0, avantPoste(0), 2), /avant-poste ne produit/);
  assert.match(raison(c0, avantPoste(0, { chantier: true }), 0), /chantier/);
  assert.match(raison(c0, qg(0, { occupation: 1 }), 0), /occupé/);
  assert.match(raison(c0, qg(0, { file: [{}, {}, {}, {}, {}] }), 0), /File pleine/);
  assert.match(raison(ctxDe(0, ids(), types(), { eco: { moyens: 10, materiaux: 0, pop: 0, popMax: 100 } }), qg(0), 0), /Moyens insuffisants/);
  assert.match(raison(ctxDe(0, ids(), types(), { eco: { moyens: 999, materiaux: 0, pop: 0, popMax: 100 } }), qg(0), 2), /Matériaux insuffisants/);
  assert.match(raison(ctxDe(0, ids(), types(), { eco: { moyens: 999, materiaux: 999, pop: 95, popMax: 100 } }), qg(0), 0), /Plafond/);
  assert.equal(raison(c0, qg(0), 3), '');
});

// ------------------------------------------------------------------------------------------------------------------
// Commandes sur un faux état de 100 000 unités, avec un faux projecteur (vue de dessus, k px par mètre)
// ------------------------------------------------------------------------------------------------------------------
const N = 100000, LARGEUR = 1440, HAUTEUR = 900, K = 0.9, X0 = -800, Z0 = -500;
function hasard(graine) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function fauxEtat(graine = 7) {
  const rd = hasard(graine), f32 = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const f = rd() < 0.5 ? 0 : rd() < 0.55 ? 1 : 2, liste = R.TYPES_PAR_FACTION[f], t = liste[(rd() * liste.length) | 0];
    const e = rd() < 0.02 ? R.ETATS.HORS_JEU : rd() < 0.1 ? R.ETATS.OISIF : R.ETATS.MARCHE;
    f32[i * 4] = X0 + rd() * 1600; f32[i * 4 + 1] = Z0 + rd() * 1000; f32[i * 4 + 2] = 0;
    f32[i * 4 + 3] = R.coder(f, t, e, 20 + ((rd() * 43) | 0), 0);
  }
  return f32;
}
const projecteur = {
  largeur: LARGEUR, hauteur: HAUTEUR,
  preparer: () => true,
  projeter(x, y, z, s) { s[0] = (x - X0) * K; s[1] = (z - Z0) * K; s[2] = 100; return true; },
  sol: (px, py) => [px / K + X0, py / K + Z0],
  echelle: () => 1 / K,
};
function nouvellesCommandes(joueur = 0, f32 = fauxEtat()) {
  const recu = { ordres: [], messages: [], selections: 0 };
  const reglages = REGL.defaults();
  const c = I.creerCommandes({ regles: R, protocole: P, reglages, projecteur,
    rappels: { ordre: x => recu.ordres.push(x), message: t => recu.messages.push(t), selection: () => recu.selections++ } });
  c.partie({ options: { joueur, alliance: null }, carte: { voile: null }, sites: { qg: [], lieux: [], gisements: [], cassables: [] }, ville: null });
  const structures = [qg(0, { x: -700, z: -400 }), qg(1, { x: 700, z: -400 }), qg(2, { x: 0, z: 400 })];
  const etat = { it: 1, temps: 10, n: N, unites: f32.buffer, eco: [ecoRiche, ecoRiche, ecoRiche], alliance: null, colere: 0, structures, evenements: new Float32Array(0) };
  c.etat(etat, f32);
  c.activer(true);
  return { c, recu, f32, etat, reglages };
}
const touche = (code, key, mods = {}) => ({ code, key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, repeat: false, ...mods });

verifier('choix au cadre : une passe exacte sur 100 000 unités (et sa durée)', () => {
  const { c, f32 } = nouvellesCommandes(0);
  const [a, b, cc, d] = [200, 120, 900, 700];
  let attendu = 0;
  for (let i = 0; i < N; i++) {
    const code = f32[i * 4 + 3] | 0, px = (f32[i * 4] - X0) * K, py = (f32[i * 4 + 1] - Z0) * K;
    if ((code & 3) === 0 && ((code >>> 6) & 15) !== R.ETATS.HORS_JEU && px >= a && px <= cc && py >= b && py <= d) attendu++;
  }
  c.actions.rectangleSelection(a, b, cc, d, false);
  assert.equal(c.selection.n, attendu);
  assert.ok(attendu > 10000, 'cadre assez grand pour mesurer');
  let compte = 0;
  for (let i = 0; i < N; i++) compte += c.selection.masque[i];
  assert.equal(compte, attendu, 'masque et liste concordent');
  assert.equal(c.resume.n, attendu);
  assert.ok(c.resume.cohesion > 0.3 && c.resume.cohesion < 1);
  const durees = [];
  for (let k = 0; k < 9; k++) {
    const t0 = performance.now();
    c.actions.rectangleSelection(0, 0, LARGEUR, HAUTEUR, false);
    durees.push(performance.now() - t0);
  }
  durees.sort((x, y) => x - y);
  console.log('    cadre plein écran sur ' + N + ' unités : ' + c.selection.n + ' choisies, meilleure ' + durees[0].toFixed(2) + ' ms, médiane ' + durees[4].toFixed(2) + ' ms (9 essais)');
  assert.ok(durees[0] < 50, 'une passe plein écran sous 50 ms');
  c.actions.rectangleSelection(a, b, cc, d, true);
  assert.equal(c.selection.n, c.resume.n, 'Maj + cadre ajoute sans doublon');
});

verifier('choix au point : la plus proche à moins de 12 px, jamais une adverse ni une hors jeu', () => {
  const { c, f32, etat } = nouvellesCommandes(0);
  // Trois unités isolées dans un coin vidé : une à moi, une adverse plus proche du clic, une à moi hors jeu.
  for (let i = 0; i < N; i++) if (f32[i * 4] < X0 + 100 && f32[i * 4 + 1] < Z0 + 100) f32[i * 4 + 3] = R.CODE_LIBRE;
  const pose = (i, x, z, f, t, e) => { f32[i * 4] = x; f32[i * 4 + 1] = z; f32[i * 4 + 3] = R.coder(f, t, e, 40, 0); };
  pose(10, X0 + 20, Z0 + 20, 0, 1, R.ETATS.MARCHE);
  pose(11, X0 + 26, Z0 + 20, 1, 5, R.ETATS.MARCHE);
  pose(12, X0 + 30, Z0 + 20, 0, 2, R.ETATS.HORS_JEU);
  c.etat(etat, f32);
  const px = 26 * K, py = 20 * K;
  c.actions.pointSelection(px, py, false, false);
  assert.equal(c.selection.n, 1);
  assert.equal(c.selection.liste[0], 10, 'mon Cortège, malgré l’unité adverse plus proche');
  // À 31,5 px : mon unité hors jeu est à 4,5 px (ignorée), mon Cortège à 13,5 px (trop loin) : rien, la sélection se vide.
  c.actions.pointSelection(31.5, 20 * K, false, false);
  assert.equal(c.selection.n, 0, 'à plus de 12 px : rien, la sélection se vide');
  // Double-clic : tout ce type à l'écran.
  c.actions.pointSelection(20 * K, 20 * K, false, true);
  let attendu = 0;
  for (let i = 0; i < N; i++) {
    const code = f32[i * 4 + 3] | 0;
    if ((code & 3) === 0 && ((code >>> 2) & 15) === 1 && ((code >>> 6) & 15) !== R.ETATS.HORS_JEU) attendu++;
  }
  assert.equal(c.selection.n, attendu);
  const t0 = performance.now();
  for (let k = 0; k < 20; k++) c.actions.pointSelection(700, 450, false, false);
  console.log('    choix au point (100 000 unités, tri au sol) : ' + ((performance.now() - t0) / 20).toFixed(3) + ' ms par clic en moyenne sur 20');
});

verifier('groupes : Ctrl + 1 forme, 1 rappelle, Maj + 1 ajoute ; les unités hors jeu sont élaguées', () => {
  const { c, f32, etat, recu } = nouvellesCommandes(0);
  c.actions.rectangleSelection(100, 100, 400, 300, false);
  const n1 = c.selection.n;
  assert.ok(n1 > 100);
  assert.equal(c.clavier(touche('Digit1', '&', { ctrlKey: true }), true), true);
  assert.match(recu.messages.at(-1), /^Groupe 1 : /);
  c.actions.deselectionner();
  assert.equal(c.selection.n, 0);
  c.clavier(touche('Digit1', '&'), true);
  assert.equal(c.selection.n, n1);
  c.actions.rectangleSelection(800, 500, 1000, 700, false);
  const n2 = c.selection.n;
  c.clavier(touche('Digit2', 'é', { ctrlKey: true }), true);
  c.clavier(touche('Digit1', '&', { shiftKey: true }), true);
  assert.equal(c.selection.n, n1 + n2, 'Maj + 1 ajoute le groupe 1');
  // Dix unités du groupe 1 sortent du jeu : elles quittent la sélection et le groupe.
  c.clavier(touche('Digit1', '&'), true);
  const sorties = Array.from(c.selection.liste.slice(0, 10));
  for (const i of sorties) { const code = f32[i * 4 + 3] | 0; f32[i * 4 + 3] = R.coder(code & 3, (code >>> 2) & 15, R.ETATS.HORS_JEU, 0, 0); }
  c.etat(etat, f32);
  assert.equal(c.selection.n, n1 - 10);
  c.actions.deselectionner();
  c.clavier(touche('Digit1', '&'), true);
  assert.equal(c.selection.n, n1 - 10);
  c.clavier(touche('Digit5', '('), true);
  assert.match(recu.messages.at(-1), /Groupe 5 vide/);
});

verifier('clavier et visées : attaque, arrêt, barricade en deux clics, touches de la caméra consommées', () => {
  const { c, recu, f32, etat } = nouvellesCommandes(0);
  // Une clairière de 40 m autour du point visé par (300, 300), avec une seule unité adverse à son bord.
  const cx = 300 / K + X0, cz = 300 / K + Z0;
  for (let i = 0; i < N; i++) if (Math.hypot(f32[i * 4] - cx, f32[i * 4 + 1] - cz) < 40) f32[i * 4 + 3] = R.CODE_LIBRE;
  f32[5 * 4] = cx + 25; f32[5 * 4 + 1] = cz; f32[5 * 4 + 3] = R.coder(1, 5, R.ETATS.MARCHE, 40, 0);
  c.etat(etat, f32);
  c.actions.rectangleSelection(0, 0, LARGEUR, HAUTEUR, false);
  assert.equal(c.clavier(touche('KeyS', 's'), true), true);
  assert.equal(recu.ordres.at(-1).t, CMD.ARRETER); bienFormee(recu.ordres.at(-1));
  assert.equal(c.clavier(touche('KeyQ', 'a'), true), true, 'AZERTY : la touche marquée A');
  assert.equal(c.mode, 'attaque');
  c.actions.pointSelection(500, 400, false, false);
  assert.equal(c.mode, null);
  const att = recu.ordres.at(-1);
  assert.ok(att.t === CMD.DEPLACER || att.t === CMD.ATTAQUER); bienFormee(att);
  // Barricade : premier clic, second clic ; le segment est borné à 20 m.
  c.clavier(touche('KeyB', 'b'), true);
  assert.equal(c.mode, 'barricade');
  c.actions.pointSelection(100, 100, false, false);
  assert.ok(c.apercu === null || c.apercu.sorte !== 'barricade', 'pas d’aperçu sans pointeur sur la scène');
  c.actions.pointSelection(100 + 40 * K, 100, false, false);
  const bar = recu.ordres.at(-1);
  assert.equal(bar.t, CMD.BARRICADER); bienFormee(bar);
  assert.ok(Math.abs(Math.hypot(bar.x2 - bar.x, bar.z2 - bar.z) - 20) < 1e-6, 'borné à 20 m');
  assert.equal(c.mode, null);
  // Échap n'est pas pris ici : l'interface appelle annulerVisee(), sinon la pause.
  c.clavier(touche('KeyC', 'c'), true);
  assert.equal(c.mode, 'casser');
  assert.equal(c.annulerVisee(), true);
  assert.equal(c.annulerVisee(), false);
  // Touches codées en dur par camera.js : consommées même sans assignation ; une lettre libre passe.
  assert.equal(c.clavier(touche('KeyW', 'z'), true), true);
  assert.equal(c.clavier(touche('KeyD', 'd'), true), true);
  assert.equal(c.clavier(touche('KeyZ', 'w'), true), true, 'AZERTY : la touche marquée W, assignée à la production, est prise');
  assert.equal(c.clavier(touche('KeyU', 'u'), true), false, 'U : libre, elle passe');
  assert.equal(c.clavier(touche('KeyA', 'q'), true), true, 'Q : produire, consommée');
  assert.equal(c.clavier(touche('Space', ' '), true), false, 'Espace passe à la caméra');
  // Clic droit au sol : un seul déplacement pour toute la sélection ; sur l'unité adverse : une attaque.
  let avant = recu.ordres.length;
  c.actions.ordre(300, 300);
  assert.equal(recu.ordres.length, avant + 1);
  let o = recu.ordres.at(-1);
  assert.deepEqual([o.t, o.mode, o.ids.length], [CMD.DEPLACER, 0, c.selection.n]); bienFormee(o);
  assert.ok(Math.abs(o.x - cx) < 1e-3 && Math.abs(o.z - cz) < 1e-3);
  avant = recu.ordres.length;
  c.actions.ordre(300 + 25 * K + 5, 300 - 4);
  o = recu.ordres.at(-1);
  assert.equal(recu.ordres.length, avant + 1);
  assert.deepEqual([o.t, o.cible, o.ids.length], [CMD.ATTAQUER, 5, c.selection.n]); bienFormee(o);
});

verifier('contexte : douze boutons pour des unités, huit pour un QG, rien pour un QG adverse', () => {
  const { c } = nouvellesCommandes(0);
  c.actions.rectangleSelection(0, 0, LARGEUR, HAUTEUR, false);
  let ctx = c.contexte();
  assert.equal(ctx.sorte, 'unites');
  assert.equal(ctx.actions.length, 12);
  assert.deepEqual(ctx.actions.map(a => a.id), ['attaque', 'arret', 'tenir', 'replier', 'regrouper', 'lever', 'casser', 'barricade', 'recolter', 'avantPoste', 'salve', 'jet']);
  assert.equal(ctx.actions.find(a => a.id === 'salve').vide, true, 'pas de Compagnie dans la Convergence');
  assert.equal(ctx.actions.find(a => a.id === 'avantPoste').libelle, 'Relais');
  assert.equal(ctx.actions.find(a => a.id === 'attaque').touche, 'A');
  c.choisirStructure(0);
  ctx = c.contexte();
  assert.equal(ctx.sorte, 'structure');
  assert.equal(ctx.actions.length, 8);
  assert.deepEqual(ctx.actions.slice(0, 4).map(a => a.type), [0, 1, 2, 3]);
  assert.equal(ctx.actions[4].vide, true);
  assert.equal(ctx.actions[7].id, 'ralliement');
  const v = c.versionContexte;
  c.produire(1, 1);
  c.choisirStructure(2);
  assert.notEqual(c.versionContexte, v);
  assert.equal(c.contexte().actions.length, 0);
  // Garder un type dans le panneau de sélection.
  c.actions.rectangleSelection(0, 0, LARGEUR, HAUTEUR, false);
  const cortèges = c.resume.parType[1];
  c.garderType(1, true);
  assert.equal(c.selection.n, cortèges);
  assert.deepEqual(Array.from(c.resume.parType).filter(x => x).length, 1);
});

verifier('démo : un camp −1 ne s’active jamais', () => {
  const recu = [];
  const c = I.creerCommandes({ regles: R, protocole: P, reglages: REGL.defaults(), projecteur, rappels: { ordre: x => recu.push(x) } });
  c.partie({ options: { joueur: -1 }, carte: {}, sites: null, ville: null });
  c.activer(true);
  assert.equal(c.actif, false);
  c.actions.ordre(10, 10);
  assert.equal(recu.length, 0);
});

// ------------------------------------------------------------------------------------------------------------------
// Minicarte
// ------------------------------------------------------------------------------------------------------------------
verifier('minicarte : géométrie (côté entier ou côté de case), aller-retour pixel ↔ monde', () => {
  const etendue = { x0: -640, x1: 640, z0: -640, z1: 640 };
  const g1 = M.geometrie({ etendue, minicarte: { taille: 128, x0: -640, z0: -640, cote: 1280 } });
  const g2 = M.geometrie({ etendue, minicarte: { taille: 128, x0: -640, z0: -640, cote: 10 } });
  for (const g of [g1, g2]) { assert.equal(g.cote, 1280); assert.equal(g.cellule, 10); assert.equal(g.taille, 128); }
  const g3 = M.geometrie({ etendue });
  assert.equal(g3.cote, 1280); assert.equal(g3.x0, -640);
  const s = new Float64Array(2);
  M.versPixel(g1, 0, 320, 200, s);
  assert.deepEqual([s[0], s[1]], [100, 150]);
  const w = M.versMonde(g1, 100, 150, 200);
  assert.deepEqual(w, [0, 320]);
});

verifier('minicarte : densité par camp (teinte dominante, contact, opacité logarithmique, brouillard)', () => {
  const taille = 2, d = new Uint16Array(taille * taille * 3), rgba = new Uint8ClampedArray(taille * taille * 4);
  const couleurs = R.FACTIONS.map(f => f.couleur.map(v => Math.round(v * 255)));
  d.set([0, 0, 0], 0);           // case vide
  d.set([63, 0, 0], 3);          // Convergence seule : 63 unités → opacité pleine
  d.set([10, 30, 0], 6);         // Bastion domine, Convergence au quart : contact
  d.set([0, 0, 5], 9);           // Préfecture, hors de vue
  const cache = { vu: Uint8Array.from([1, 1, 1, 0]), montre: [true, false, false] };
  M.remplirDensite(d, taille, couleurs, rgba, cache);
  assert.deepEqual(Array.from(rgba.slice(0, 4)), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(rgba.slice(4, 8)), [...couleurs[0], 255]);
  assert.ok(rgba[8] > couleurs[1][0] && rgba[9] > couleurs[1][1], 'contact : la teinte du Bastion s’éclaircit');
  assert.equal(rgba[11], Math.min(255, Math.round(96 + 159 * Math.log2(41) / 6)), 'opacité : 96 + 159 · log2(1 + n) / 6');
  assert.equal(rgba[15], 0, 'la Préfecture hors de vue est cachée');
  const vu = new Uint8Array(4);
  const g = { x0: 0, z0: 0, cote: 20, taille: 2, cellule: 10 };
  M.visibilite(g, Uint8Array.from([255, 0, 0, 39]), { nx: 2, nz: 2, x0: 0, z0: 0, cellule: 10 }, vu);
  assert.deepEqual(Array.from(vu), [1, 0, 0, 0], 'seuil de visibilité 40');
  M.visibilite(g, null, null, vu);
  assert.deepEqual(Array.from(vu), [1, 1, 1, 1], 'sans voile, tout est vu');
  const t0 = performance.now(), grand = new Uint16Array(128 * 128 * 3), img = new Uint8ClampedArray(128 * 128 * 4);
  for (let k = 0; k < grand.length; k++) grand[k] = (k * 2654435761 >>> 24) & 31;
  for (let k = 0; k < 50; k++) M.remplirDensite(grand, 128, couleurs, img, null);
  console.log('    densité 128 × 128 : ' + ((performance.now() - t0) / 50).toFixed(3) + ' ms par remplissage (moyenne de 50)');
});

console.log(ok + ' vérifications passées');
