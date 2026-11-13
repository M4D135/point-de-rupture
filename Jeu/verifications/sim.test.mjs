// Vérifie la simulation (sim/nav.js, sim/monde.js, sim/ia.js, sim/travailleur.js) : déterminisme, relecture, règles
// en situation, barricade qui ferme puis rouvre un passage, récolte, production et plafond, prise d'un lieu, repli,
// élimination et victoire, travailleur (messages, réserve de tampons, vitesse, démo), et une partie de 10 minutes
// simulées à trois IA et 20 000 unités. Version 0.3 : cocktails Molotov, feu de ce que l'on casse, barricade en feu
// et Canon à eau, gaz lacrymogène, mises à terre, charges, pierres, hors-jeu couchés, modes de victoire, déroute,
// avant-postes occupés, part des manifestants, démo qui dure, graine sur le plan réel.
// Les scripts sont chargés dans le contexte de Node, comme dans la page.
//   node Jeu/verifications/sim.test.mjs            (environ trois minutes sur une machine au repos)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ici = path.dirname(fileURLToPath(import.meta.url));
const src = f => path.join(ici, '..', 'src', f);
const exiger = createRequire(import.meta.url);
for (const f of ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'villes/marseille.js', 'ville-reelle.js', 'sim/nav.js', 'sim/immeubles.js', 'sim/monde.js', 'sim/ia.js', 'sim/travailleur.js']) exiger(src(f));
const { ville: V, regles: R, protocole: P, monde: M, ia: IA, travailleur: TR } = globalThis.PDR;
const { CMD, EV, RAISONS } = P;
const { CONVERGENCE: C, BASTION: B, PREFECTURE: F } = R;
const K = R.CONSTANTES, ET = R.ETATS, IT_S = K.IT_PAR_S;

let ok = 0;
const verifier = (nom, f) => { const t0 = performance.now(); f(); ok++; console.log(`ok  ${nom} (${((performance.now() - t0) / 1000).toFixed(1)} s)`); };
const villes = new Map();
const ville = (graine, ilots) => { const k = graine + ':' + ilots; if (!villes.has(k)) villes.set(k, V.creerVille(graine, { ilots })); return villes.get(k); };
const creer = (options = {}) => M.creer(ville(options.graine ?? 1, R.ilots(options.effectifs ?? 20000)), { graine: 1, effectifs: 20000, ...options });
const cmd = (t, j, champs) => P.commande(t, j, champs);
/** n itérations ; rend les évènements vus, en objets. */
function courir(m, n, ia = null, arret = null) {
  const vus = [];
  for (let k = 0; k < n; k++) {
    m.iterer();
    if (ia) ia.penser();
    const ev = m.evenements();
    for (let o = 0; o < ev.length; o += P.EV_TAILLE) vus.push({ type: ev[o], x: ev[o + 1], z: ev[o + 2], faction: ev[o + 3], a: ev[o + 4], b: ev[o + 5], it: m.it });
    if (arret && arret(m)) break;
  }
  return vus;
}
const de = (vus, type) => vus.filter(e => e.type === type);
/** L'état du protocole (message ETAT) et ses unités décodées à la demande. */
const tamponEtat = new ArrayBuffer(P.CAPACITE * 16);
function etatDe(m) {
  const e = m.etat(tamponEtat, 1), f32 = new Float32Array(tamponEtat, 0, Math.max(1, e.n) * 4);
  e.codeEtat = i => R.codeEtat(f32[i * 4 + 3]);
  e.faction = i => R.codeFaction(f32[i * 4 + 3]);
  return e;
}
const distance = (m, i, x, z) => Math.hypot(m.ux[i] / 1000 - x, m.uz[i] / 1000 - z);
/** Place n unités (f, t) en grappe autour de (x, z) m, sur des cases praticables ; rend leurs emplacements. */
function grappe(m, f, t, n, x, z) {
  const ids = [];
  const fines = new Int32Array(n);
  const k = m.nav.remplir(Math.round(x * 1000), Math.round(z * 1000), n, fines);
  for (let q = 0; q < n; q++) { const fc = fines[q % k]; ids.push(m.ajouter(f, t, m.nav.fineX(fc) / 1000, m.nav.fineZ(fc) / 1000)); }
  return Int32Array.from(ids);
}
/** Une rue bordée de murs des deux côtés (selon x), au milieu d'un côté d'îlot : { x, z, a, b } m. */
function rueEntreMurs(v) {
  for (let i = 1; i < v.LX.length - 1; i++) {
    if (v.LX[i].boulevard) continue;
    for (let j = 1; j < v.LZ.length - 2; j++) {
      const x = v.LX[i].c, z = (v.LZ[j].c + v.LZ[j + 1].c) / 2;
      if (!v.praticable(x, z)) continue;
      let a = 0, b = 0;
      while (a < 12 && v.praticable(x + a + 0.5, z)) a += 0.5;
      while (b < 12 && v.praticable(x - b - 0.5, z)) b += 0.5;
      const libre = dz => v.praticable(x, z + dz);
      if (a < 12 && b < 12 && a + b >= 6 && [-24, -12, 12, 24].every(libre)) return { x, z, a, b };
    }
  }
  throw new Error('pas de rue bordée de murs');
}

verifier('empreinte FNV-1a 64 : valeurs de référence (les mêmes que noyau.js)', () => {
  assert.equal(M.fnvTexte(''), 'cbf29ce484222325');
  assert.equal(M.fnvTexte('a'), 'af63dc4c8601ec8c');
  assert.equal(M.fnvTexte('foobar'), '85944171f73967e8');
});

verifier('le pas ne lit ni Math.sin, ni Math.cos, ni horloge, ni hasard non semé', () => {
  for (const f of ['sim/immeubles.js', 'sim/monde.js', 'sim/nav.js', 'sim/ia.js']) {
    const texte = fs.readFileSync(src(f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/Math\.(sin|cos|tan|atan2?|random|exp|log|pow|hypot)\b|\bDate\b|performance\.|\*\*/.test(texte), f);
  }
});

// ---- Déterminisme et relecture : une partie à 20 000 unités, joueur 0 et deux IA, avec des ordres du joueur. ----
function partieAvecOrdres(graine, iterations) {
  const m = creer({ graine, joueur: 0, effectifs: 20000 });
  const ia = IA.creer(m);
  const miens = [];
  for (let i = 0; i < m.n && miens.length < 3000; i++) if (m.ufac[i] === C && m.utyp[i] !== R.OUVRIER[C]) miens.push(i);
  const centre = m.ville.place;
  for (let k = 0; k < iterations; k++) {
    if (k === 40) m.soumettre(cmd(CMD.DEPLACER, C, { ids: miens.slice(0, 1500), x: centre[0], z: centre[1], mode: 1 }));
    if (k === 41) m.soumettre(cmd(CMD.DEPLACER, C, { ids: miens.slice(1500), x: centre[0] + 0.0004, z: centre[1] - 30.0004, mode: 0 }));
    if (k === 300) m.soumettre(cmd(CMD.TENIR, C, { ids: miens.slice(0, 200) }));
    m.iterer(); ia.penser();
  }
  return m;
}
const A = partieAvecOrdres(5, 600);
verifier('déterminisme : même graine et mêmes ordres, mêmes empreintes ; autre graine, autres empreintes', () => {
  const B2 = partieAvecOrdres(5, 600);
  assert.equal(A.empreintes.length, 6, 'une empreinte toutes les 100 itérations, plus celle du départ');
  assert.deepEqual(B2.empreintes, A.empreintes);
  assert.equal(B2.empreinte(), A.empreinte());
  // L'empreinte de l'itération 100 est calculée par morceaux sur les 50 suivantes.
  const autre = partieAvecOrdres(6, 200);
  assert.equal(autre.empreintes.length, 2);
  assert.equal(autre.empreintes[1][0], A.empreintes[1][0]);
  assert.notEqual(autre.empreintes[1][1], A.empreintes[1][1]);
});

verifier('relecture : rejouer l\'enregistrement donne les mêmes empreintes, avec l\'IA ou sans elle', () => {
  const enr = A.enregistrement();
  assert.ok(enr.commandes.length > 10 && enr.commandes.some(e => !e.ia) && enr.commandes.some(e => e.ia));
  // Les commandes sont rangées dans l'ordre canonique (itération, joueur, numéro).
  for (let k = 1; k < enr.commandes.length; k++) {
    const a = enr.commandes[k - 1], b = enr.commandes[k];
    assert.ok(a.it < b.it || (a.it === b.it && (a.j < b.j || (a.j === b.j && a.n < b.n))), 'ordre canonique');
  }
  // Positions quantifiées au millimètre.
  const d = enr.commandes.find(e => !e.ia && e.c.t === CMD.DEPLACER && e.c.mode === 0);
  assert.equal(d.c.x, Math.round((A.ville.place[0] + 0.0004) * 1000));
  // empreinte() termine l'empreinte en cours (celle de l'itération 600) avant de calculer celle du moment.
  const v = ville(5, 9);
  const avecIA = M.relire(v, enr, 600, m => IA.creer(m));
  assert.equal(avecIA.empreinte(), A.empreinte());
  assert.deepEqual(avecIA.empreintes, A.empreintes);
  const sansIA = M.relire(v, enr, 600, null);
  assert.equal(sansIA.empreinte(), A.empreinte());
  assert.deepEqual(sansIA.empreintes, A.empreintes);
  assert.equal(A.empreintes.length, 7);
});

// ---- Règles en situation. ----
verifier('le Bastion ne frappe pas la Préfecture avant d\'avoir été frappé ; il riposte ensuite, en colère', () => {
  const m = creer({ vide: true, joueur: 0 });
  const r = rueEntreMurs(m.ville);
  const piquet = m.ajouter(B, 5, r.x, r.z - 2.5), patrouille = m.ajouter(F, 9, r.x, r.z + 2.5);
  m.soumettre(cmd(CMD.TENIR, F, { ids: [patrouille] }));
  courir(m, 200);
  assert.equal(m.bilan()[B].infliges, 0);
  assert.equal(m.ucoh[patrouille], R.TYPES[9].coh * 1000);
  assert.equal(m.colere, 0);
  m.soumettre(cmd(CMD.ATTAQUER, F, { ids: [patrouille], cible: piquet }));
  let premierPrefecture = -1, premierBastion = -1, colere = 0;
  for (let k = 0; k < 400; k++) {
    m.iterer();
    const b = m.bilan();
    if (premierPrefecture < 0 && b[F].infliges > 0) premierPrefecture = m.it;
    if (premierBastion < 0 && b[B].infliges > 0) premierBastion = m.it;
    colere = Math.max(colere, m.colere);
  }
  assert.ok(premierPrefecture > 0 && premierBastion > premierPrefecture, `${premierPrefecture} puis ${premierBastion}`);
  assert.equal(colere, R.CONSTANTES.COLERE_S * R.CONSTANTES.IT_PAR_S);
});

verifier('des alliés ne se frappent jamais ; après la rupture, ils se battent', () => {
  const m = creer({ vide: true, joueur: 0, alliance: [C, B] });
  const r = rueEntreMurs(m.ville);
  grappe(m, C, 1, 30, r.x, r.z); grappe(m, B, 5, 30, r.x, r.z + 1);
  const vus = courir(m, 300);
  assert.deepEqual(m.bilan().map(b => b.infliges), [0, 0, 0]);
  assert.equal(de(vus, EV.HORS_JEU).length, 0);
  m.soumettre(cmd(CMD.DIPLOMATIE, C, { action: 'rompre', avec: B }));
  const apres = courir(m, 200);
  assert.equal(de(apres, EV.ALLIANCE_ROMPUE).length, 1);
  assert.equal(m.alliance, null);
  assert.ok(m.bilan()[C].infliges > 0 && m.bilan()[B].infliges > 0);
  // Une nouvelle alliance attend 60 s.
  m.soumettre(cmd(CMD.DIPLOMATIE, C, { action: 'proposer', avec: B }));
  const refus = de(courir(m, 1), EV.REFUS);
  assert.equal(refus.length, 1);
  assert.equal(refus[0].a, RAISONS.DELAI);
});

verifier('seule la Convergence casse et barricade ; elle y gagne des Matériaux', () => {
  const m = creer({ vide: true, joueur: 0 });
  m.ressources(C, 1000, 1000); m.ressources(B, 1000, 1000); m.ressources(F, 1000, 1000);
  const r = rueEntreMurs(m.ville);
  // Le cassable le plus proche de la rue.
  let k = 0;
  for (let q = 1; q < m.casX.length; q++) if (Math.hypot(m.casX[q] / 1000 - r.x, m.casZ[q] / 1000 - r.z) < Math.hypot(m.casX[k] / 1000 - r.x, m.casZ[k] / 1000 - r.z)) k = q;
  const cx = m.casX[k] / 1000, cz = m.casZ[k] / 1000;
  const bastion = grappe(m, B, 5, 10, cx, cz), prefecture = grappe(m, F, 9, 10, cx + 0.5, cz);
  void prefecture;
  m.soumettre(cmd(CMD.CASSER, B, { ids: bastion, sorte: 'cassable', cible: k }));
  m.soumettre(cmd(CMD.BARRICADER, F, { ids: prefecture, x: r.x - r.a + 0.2, z: r.z, x2: r.x + r.b - 0.2, z2: r.z }));
  const refus = de(courir(m, 1), EV.REFUS);
  assert.deepEqual(refus.map(e => [e.faction, e.a, e.b]), [[B, RAISONS.INTERDIT, CMD.CASSER], [F, RAISONS.INTERDIT, CMD.BARRICADER]]);
  assert.equal(m.structures.length, 3);

  const m2 = creer({ vide: true, joueur: 0 });
  m2.ressources(C, 1000, 1000);
  const casseurs = grappe(m2, C, 2, 10, cx, cz);
  const x0 = m2.res[C * 2 + 1];
  m2.soumettre(cmd(CMD.CASSER, C, { ids: casseurs, sorte: 'cassable', cible: k }));
  const vus = courir(m2, 1500, null, mm => mm.casEtat[k] !== 0);
  const casse = de(vus, EV.CASSE)[0];
  assert.equal(casse.a, k);
  assert.equal(P.SORTES_CASSABLES[casse.b], m2.ville.sites.cassables[k].sorte);
  assert.equal(m2.res[C * 2 + 1] - x0, m2.ville.sites.cassables[k].rendement * 1000);
  assert.equal(m2.bilan()[C].casses >= 1, true);
  // 0.3, « foutre le feu quand on casse » : l'objet cassé s'embrase (2), brûle le temps que lui donnent ses points de
  // structure, puis reste calciné (3). Les casseurs s'écartent pendant qu'il s'embrase : le feu ne les touche pas.
  assert.equal(m2.casEtat[k], 2, 'en feu');
  const objet = m2.ville.sites.cassables[k], feu = R.feuObjet(objet.pv, objet.feu, objet.sorte);
  const allume = de(vus, EV.FEU_ALLUME)[0];
  assert.deepEqual([allume.faction, allume.b, m2.nFeux], [C, P.SORTES_FEU.OBJET, 1]);
  assert.ok(Math.hypot(allume.x - cx, allume.z - cz) < 0.01);
  const e = etatDe(m2);
  assert.equal(e.cassables[k], 2);
  const foyer = P.lireFeu(e.feux, 0);
  assert.deepEqual([foyer.id, foyer.sorte, foyer.cible], [allume.a, P.SORTES_FEU.OBJET, k]);
  assert.ok(Math.abs(foyer.rayon - feu.rayon) < 1e-3 && foyer.reste > feu.duree - 1 && foyer.intensite > 0 && foyer.intensite < 1, 'il s\'embrase');
  const debut = courir(m2, 40);
  for (const i of casseurs) assert.ok(distance(m2, i, cx, cz) > feu.rayon, 'deux secondes plus tard, plus personne dans le foyer');
  const suite = debut.concat(courir(m2, feu.duree * IT_S + 10, null, mm => mm.casEtat[k] === 3));
  assert.equal(m2.casEtat[k], 3, 'calciné');
  const eteint = de(suite, EV.FEU_ETEINT).find(x => x.a === allume.a);
  assert.deepEqual([eteint.faction, eteint.b], [-1, 0], 'il s\'est consumé');
  assert.ok(Math.abs((eteint.it - allume.it) / IT_S - feu.duree) < 0.2, 'durée du feu : ' + (eteint.it - allume.it) / IT_S);
  for (const i of casseurs) assert.equal(m2.ucoh[i], R.TYPES[2].coh * 1000, 'personne n\'a brûlé');
});

// ---- La barricade ferme une rue, puis la rouvre quand le Bastion la lève. ----
verifier('barricade : posée et finie, elle ferme la rue ; levée, elle la rouvre (et rend 50 % au Bastion)', () => {
  const m = creer({ vide: true, joueur: 0 });
  m.ressources(C, 1000, 1000); m.ressources(B, 0, 0);
  const r = rueEntreMurs(m.ville), nav = m.nav;
  const mm = v => Math.round(v * 1000);
  const caseA = nav.caseDe(mm(r.x), mm(r.z - 20)), caseB = nav.caseDe(mm(r.x), mm(r.z + 20));
  const dir = new Uint8Array(nav.n);
  const distance = () => nav.calculer(Int32Array.of(caseB), 1, dir)[caseA];
  const d0 = distance();
  assert.ok(d0 > 0 && d0 < 200, 'chemin direct de 40 m : ' + d0);
  const L = mm(r.x + r.b - 0.2) - mm(r.x - r.a + 0.2);            // longueur en mm, après quantification
  const batisseurs = grappe(m, C, 1, 20, r.x, r.z - 6);
  m.soumettre(cmd(CMD.BARRICADER, C, { ids: batisseurs, x: r.x - r.a + 0.2, z: r.z, x2: r.x + r.b - 0.2, z2: r.z }));
  const vus = courir(m, 1200, null, x => x.structures.length > 3 && !x.structures[3].chantier);
  const s = m.structures[3];
  assert.equal(s.sorte, m.S.BARRICADE);
  assert.equal(de(vus, EV.BARRICADE_POSEE).length, 1);
  assert.equal(de(vus, EV.BARRICADE_FINIE).length, 1);
  assert.equal(1000000 - m.res[C * 2 + 1], 6 * L, '6 Matériaux par mètre (en millièmes : 6 par mm)');
  assert.equal(nav.libre[nav.caseDe(mm(r.x), mm(r.z))], 0, 'la case du milieu est fermée');
  const d1 = distance();
  assert.ok(d1 > d0 + 200, `détour : ${d0} puis ${d1}`);
  // Les bâtisseurs repartent ; le Bastion vient lever par l'autre côté.
  m.soumettre(cmd(CMD.DEPLACER, C, { ids: batisseurs, x: m.ville.sites.qg[C].sortie[0], z: m.ville.sites.qg[C].sortie[1], mode: 0 }));
  courir(m, 300);
  const leveurs = grappe(m, B, 5, 20, r.x, r.z + 6);
  m.soumettre(cmd(CMD.LEVER, B, { ids: leveurs, cible: s.id }));
  const vus2 = courir(m, 1200, null, x => !x.structures[3].vivante);
  assert.equal(s.vivante, false);
  const levee = de(vus2, EV.BARRICADE_LEVEE)[0];
  assert.deepEqual([levee.faction, levee.a, levee.b], [B, s.id, C]);
  assert.equal(nav.libre[nav.caseDe(mm(r.x), mm(r.z))], 1);
  assert.equal(distance(), d0, 'le chemin direct est rouvert');
  assert.equal(m.res[B * 2 + 1], 3 * L, 'la moitié du coût rendue au Bastion');
});

verifier('avant-postes : bâtis par les Équipes ; seule la Préfecture les lève', () => {
  const m = creer({ vide: true, joueur: 0 });
  m.ressources(C, 1000, 1000);
  const qg = m.ville.sites.qg[C];
  // Un emplacement possible près de la sortie du QG de la Convergence.
  let centre = null;
  for (let d = 30; d < 120 && !centre; d += 4) for (const [dx, dz] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
    centre = m.postePossible(Math.round((qg.sortie[0] + dx * d) * 1000), Math.round((qg.sortie[1] + dz * d) * 1000));
    if (centre) break;
  }
  assert.ok(centre);
  const equipes = grappe(m, C, 0, 10, centre[0] / 1000, centre[1] / 1000 + 6);
  m.soumettre(cmd(CMD.CONSTRUIRE, C, { ids: equipes, x: centre[0] / 1000, z: centre[1] / 1000 }));
  const vus = courir(m, 2000, null, x => x.structures.length > 3 && !x.structures[3].chantier);
  const s = m.structures[3];
  assert.equal(s.sorte, m.S.POSTE);
  assert.equal(de(vus, EV.STRUCTURE_FINIE).length, 1);
  assert.deepEqual([m.res[0], m.res[1]], [850000, 900000]);
  m.soumettre(cmd(CMD.DEPLACER, C, { ids: equipes, x: qg.sortie[0], z: qg.sortie[1], mode: 0 }));
  courir(m, 200);
  // Le Bastion d'un côté, la Préfecture de l'autre : une Préfecture oisive à portée du Bastion le frapperait.
  const piquets = grappe(m, B, 5, 10, s.x / 1000, s.z / 1000 - 8);
  m.soumettre(cmd(CMD.LEVER, B, { ids: piquets, cible: s.id }));
  assert.equal(de(courir(m, 1), EV.REFUS)[0].a, RAISONS.INTERDIT);
  const patrouilles = grappe(m, F, 9, 12, s.x / 1000, s.z / 1000 + 8.5);
  m.soumettre(cmd(CMD.LEVER, F, { ids: patrouilles, cible: s.id }));
  const vus2 = courir(m, 3000, null, x => !x.structures[3].vivante);
  assert.equal(s.vivante, false);
  const fin = de(vus2, EV.STRUCTURE_DETRUITE)[0];
  assert.deepEqual([fin.faction, fin.a, fin.b], [F, s.id, C]);
});

verifier('récolte : une Équipe porte 10 unités du gisement au dépôt', () => {
  const m = creer({ vide: true, joueur: 0 });
  const qg = m.ville.sites.qg[C];
  let g = -1;
  m.gis.forEach((x, k) => { if (x.moyens && (g < 0 || Math.hypot(x.x / 1000 - qg.x, x.z / 1000 - qg.z) < Math.hypot(m.gis[g].x / 1000 - qg.x, m.gis[g].z / 1000 - qg.z))) g = k; });
  const equipes = grappe(m, C, 0, 5, qg.sortie[0], qg.sortie[1]);
  const m0 = m.res[0], s0 = m.stock[g];
  m.soumettre(cmd(CMD.RECOLTER, C, { ids: equipes, gisement: g }));
  courir(m, 4000, null, x => x.res[0] - m0 >= 50000);
  assert.ok(m.res[0] - m0 >= 50000, 'cinq voyages au moins');
  assert.equal(m.res[0] - m0, (s0 - m.stock[g]) * 1000 - (m.ucharge.slice(0, m.n).reduce((a, b) => a + b, 0)) * 1000, 'ce qui manque au stock est au dépôt ou porté');
  assert.equal(m.bilan()[C].recolte * 1000, m.res[0] - m0);
  // Une Équipe seulement : un Cortège ne récolte pas.
  m.soumettre(cmd(CMD.RECOLTER, C, { ids: grappe(m, C, 1, 2, qg.sortie[0], qg.sortie[1]), gisement: g }));
  assert.equal(de(courir(m, 1), EV.REFUS)[0].a, RAISONS.INTERDIT);
});

verifier('production : un lot sort au terme, la file tient 5 ordres, le plafond arrête, l\'annulation rembourse', () => {
  const m = creer({ vide: true, joueur: 0 });
  m.ressources(C, 100000, 100000);
  m.soumettre(cmd(CMD.PRODUIRE, C, { producteur: C, type: 1, n: 1 }));
  const vus = courir(m, R.TYPES[1].duree * 20 + 5);
  const p = de(vus, EV.PRODUCTION);
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].faction, p[0].a, p[0].b], [C, 1, R.TYPES[1].lot]);
  assert.equal(m.vivantes[C], R.TYPES[1].lot);
  m.soumettre(cmd(CMD.PRODUIRE, C, { producteur: C, type: 2, n: 5 }));
  m.soumettre(cmd(CMD.PRODUIRE, C, { producteur: C, type: 2, n: 1 }));
  assert.equal(de(courir(m, 1), EV.REFUS)[0].a, RAISONS.FILE_PLEINE);
  assert.equal(m.structures[C].file.length, 5);
  const avant = m.res[0];
  m.soumettre(cmd(CMD.ANNULER, C, { producteur: C, rang: 4 }));
  courir(m, 1);
  assert.equal(m.res[0] - avant, R.TYPES[2].cout.moyens * 1000);
  assert.equal(m.structures[C].file.length, 4);
  // Plafond : 125 % de la part de départ (40 % pour la Convergence, part par défaut depuis la 0.3).
  assert.equal(m.popMax[C], Math.trunc(20000 * R.parts()[C] * 125 / 10000));
  assert.equal(m.popMax[C], 10000);
  const m2 = creer({ vide: true, joueur: 0 });
  m2.ressources(C, 100000, 100000);
  const qg = m2.ville.sites.qg[C];
  while (m2.pop[C] < m2.popMax[C] - 10) m2.ajouter(C, 1, qg.sortie[0], qg.sortie[1]);
  m2.soumettre(cmd(CMD.PRODUIRE, C, { producteur: C, type: 1, n: 1 }));
  assert.equal(de(courir(m2, 1), EV.REFUS)[0].a, RAISONS.PLAFOND);
  m2.ressources(C, 0, 0);
  m2.soumettre(cmd(CMD.PRODUIRE, C, { producteur: C, type: 3, n: 1 }));
  assert.equal(de(courir(m2, 1), EV.REFUS)[0].a, RAISONS.RESSOURCES);
});

verifier('lieu : pris en 15 s sans ennemi, gelé par un ennemi, puis repris par un autre camp', () => {
  const m = creer({ vide: true, joueur: 0 });
  const L = m.ville.sites.lieux[0];
  const p = m.ville.accrocher(L.x + L.rayon / 2, L.z);
  const cortege = grappe(m, C, 1, 12, p[0], p[1]);
  const vus = courir(m, 320);
  const pris = de(vus, EV.LIEU_PRIS);
  assert.equal(pris.length, 1);
  assert.deepEqual([pris[0].faction, pris[0].a], [C, 0]);
  // La prise avance par pas de 4 itérations : 75 pas, de l'itération 0 à 296, soit 15 s à un pas près.
  assert.ok(pris[0].it >= 296 && pris[0].it <= 305, 'quinze secondes : ' + pris[0].it);
  assert.equal(m.lieuProp[0], C);
  // La Convergence s'en va ; le Bastion arrive seul et le prend.
  const q = m.ville.sites.qg[C];
  m.soumettre(cmd(CMD.DEPLACER, C, { ids: cortege, x: q.sortie[0], z: q.sortie[1], mode: 0 }));
  const loin = x => Array.from(cortege).every(i => Math.hypot(x.ux[i] / 1000 - L.x, x.uz[i] / 1000 - L.z) > L.rayon + 8);
  courir(m, 1200, null, loin);
  assert.ok(loin(m), 'la Convergence a quitté le lieu');
  grappe(m, B, 5, 12, p[0], p[1]);
  const vus2 = courir(m, 320);
  assert.deepEqual(de(vus2, EV.LIEU_NEUTRALISE).map(e => [e.faction, e.a]), [[C, 0]]);
  assert.deepEqual(de(vus2, EV.LIEU_PRIS).map(e => [e.faction, e.a]), [[B, 0]]);
  assert.equal(m.lieuProp[0], B);
  // Une présence ennemie gèle la prise : la Préfecture ne progresse pas tant que le Bastion est là.
  grappe(m, F, 9, 6, p[0], p[1]);
  courir(m, 8);
  assert.equal(m.lieuConteste[0], 1);
  const avant = m.score[B];
  courir(m, 40);
  assert.equal(m.lieuConteste[0], 1);
  assert.deepEqual([m.lieuProp[0], m.lieuPreneur[0], m.lieuProgres[0]], [B, -1, 0]);
  assert.ok(m.score[B] > avant, 'le lieu tenu rapporte 1 point par seconde');
});

verifier('repli automatique sous 25 % de cohésion, sauf en posture Tenir', () => {
  const m = creer({ vide: true, joueur: 0 });
  const r = rueEntreMurs(m.ville);
  const fuyard = m.ajouter(C, 1, r.x, r.z), tenace = m.ajouter(C, 1, r.x, r.z + 30);
  grappe(m, F, 9, 4, r.x, r.z + 1.5); grappe(m, F, 9, 4, r.x, r.z + 31.5);
  m.soumettre(cmd(CMD.TENIR, C, { ids: [tenace] }));
  let repli = false, repliTenace = false;
  for (let k = 0; k < 600; k++) {
    m.iterer();
    if (m.uord[fuyard] === m.O.REPLI && m.uetat[fuyard] !== R.ETATS.HORS_JEU) {
      repli = true;
      assert.ok(m.ucoh[fuyard] * 4 < R.TYPES[1].coh * 1000 && m.ucoh[fuyard] > 0);
    }
    if (m.uord[tenace] === m.O.REPLI) repliTenace = true;
  }
  assert.ok(repli, 'le Cortège attaqué se replie');
  assert.ok(!repliTenace, 'le Cortège qui tient ne se replie pas');
});

verifier('élimination et victoire : QG occupés, sans avant-poste ni effectifs, la Convergence l\'emporte', () => {
  const m = creer({ vide: true, joueur: 0 });
  for (const f of [B, F]) { const q = m.ville.sites.qg[f]; grappe(m, C, 1, 30, q.sortie[0], q.sortie[1]); }
  const vus = courir(m, 1400, null, x => x.vainqueur !== -1);
  assert.deepEqual(de(vus, EV.QG_OCCUPE).map(e => e.faction).sort(), [B, F]);
  assert.deepEqual(de(vus, EV.ELIMINATION).map(e => e.faction).sort(), [B, F]);
  assert.equal(m.vainqueur, C);
  assert.equal(de(vus, EV.VICTOIRE)[0].a, C);
  const it = m.it;
  m.iterer();
  assert.equal(m.it, it, 'la partie finie ne bouge plus');
});

verifier('alliance : un camp sans base tient tant que son allié tient la sienne', () => {
  const m = creer({ vide: true, joueur: 0, alliance: [C, B] });
  const qC = m.ville.sites.qg[C], qB = m.ville.sites.qg[B];
  // Le Bastion tient sa base et la Convergence garde assez d'unités pour que seule la déroute puisse l'éliminer.
  grappe(m, B, 1, 400, qB.sortie[0], qB.sortie[1]);
  grappe(m, C, 1, Math.ceil(m.depart[C] * 0.3), qB.sortie[0] + 20, qB.sortie[1] + 20);
  grappe(m, F, 1, 30, qC.sortie[0], qC.sortie[1]);
  courir(m, 90 * IT_S, null, x => x.elimine[C] === 1);
  assert.equal(m.structures[C].occupe ? 1 : 0, 1, 'le QG de la Convergence est occupé par la Préfecture');
  assert.equal(m.elimine[C], 0, 'sans base, la Convergence tient tant que le Bastion tient la sienne');
  assert.equal(m.maintenu[C], 1);
  assert.equal(m.maintenu[B], 0, 'le Bastion, qui a une base, n\'est pas sous protection');
  assert.equal(m.sansBase[C], 0, 'le compte à rebours est gelé tant que l\'alliance tient');
  // L'alliance rompue, la déroute reprend depuis le début et mène à l'élimination.
  m.soumettre(cmd(CMD.DIPLOMATIE, C, { action: 'rompre', avec: B }));
  courir(m, 20 * IT_S, null, x => x.elimine[C] === 1);
  assert.equal(m.maintenu[C], 0, 'rompre l\'alliance retire la protection');
  assert.equal(m.sansBase[C], 20 * IT_S, 'les 30 s courent depuis la rupture, pas depuis la perte du QG');
  assert.equal(m.elimine[C], 0, 'à vingt secondes, la Convergence tient encore');
  courir(m, 20 * IT_S, null, x => x.elimine[C] === 1);
  assert.equal(m.elimine[C], 1, 'la déroute menée à son terme élimine le camp');
});

// ---- 0.3 : le feu, le gaz, les projectiles, les chutes, la fin de partie. ----
/** Le foyer actif qui couvre l'unité i (tous les foyers sont lus, même ceux qui se chevauchent), ou -1. */
function foyerDe(m, i) {
  const f = m.feux;
  for (let q = 0; q < f.max; q++) if (f.actif[q] && Math.hypot(m.ux[i] - f.x[q], m.uz[i] - f.z[q]) <= f.r[q]) return q;
  return -1;
}
/** n itérations ; rend les évènements et le nombre d'itérations où chaque unité de ids était dans l'état « etat ». */
function compterEtat(m, ids, etat, n) {
  const vus = [];
  let k = 0;
  for (let q = 0; q < n; q++) { vus.push(...courir(m, 1)); for (const i of ids) if (m.uetat[i] === etat) k++; }
  return { vus, k };
}

verifier('0.3, cocktail sur ordre : Furets seulement, 4 Matériaux pièce, vol en cloche, souffle, foyer au sol', () => {
  const m0 = creer({ vide: true, joueur: 0 });
  const r = rueEntreMurs(m0.ville);
  m0.ressources(C, 1000, 3);
  const f0 = grappe(m0, C, 2, 3, r.x, r.z), c0 = grappe(m0, C, 1, 3, r.x, r.z + 3), p0 = grappe(m0, F, 10, 3, r.x, r.z - 40);
  m0.soumettre(cmd(CMD.MOLOTOV, F, { ids: p0, x: r.x, z: r.z }));
  m0.soumettre(cmd(CMD.MOLOTOV, C, { ids: c0, x: r.x, z: r.z + 12 }));
  m0.soumettre(cmd(CMD.CAPACITE, C, { ids: f0, capacite: 'molotov', x: r.x, z: r.z + 12 }));
  const refus = de(courir(m0, 1), EV.REFUS).map(e => [e.faction, e.a, e.b]).sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  assert.deepEqual(refus, [[C, RAISONS.RESSOURCES, CMD.CAPACITE], [C, RAISONS.INTERDIT, CMD.MOLOTOV], [F, RAISONS.INTERDIT, CMD.MOLOTOV]],
    '3 Matériaux : pas de quoi en lancer un ; ni le Cortège ni la Préfecture n\'en lancent');

  const m = creer({ vide: true, joueur: 0 });
  m.ressources(C, 1000, 1000);
  const furets = grappe(m, C, 2, 5, r.x, r.z - 8), piquets = grappe(m, B, 5, 8, r.x, r.z + 8);
  m.soumettre(cmd(CMD.TENIR, B, { ids: piquets }));
  m.soumettre(cmd(CMD.MOLOTOV, C, { ids: furets, x: r.x, z: r.z + 8 }));
  const vus = courir(m, 60);
  const lances = de(vus, EV.MOLOTOV);
  assert.equal(lances.length, 5, 'un cocktail par Furet, aussitôt : la cible est à portée');
  assert.ok(lances.every(e => e.faction === C && e.it === 1));
  assert.equal(m.res[C * 2 + 1], 1000000 - 5 * R.TYPES[2].capacites.molotov.cout * 1000, '4 Matériaux pièce');
  assert.equal(m.bilan()[C].molotovs, 5);
  const sol = de(vus, EV.FEU_ALLUME).filter(e => e.b === P.SORTES_FEU.SOL);
  assert.equal(sol.length, 5);
  for (const e of lances) {
    const f = sol.find(s => Math.hypot(s.x - e.x - e.a, s.z - e.z - e.b) < 0.01);
    assert.ok(f && f.faction === C, 'le foyer s\'allume où le cocktail tombe');
    assert.ok(Math.hypot(f.x - r.x, f.z - r.z - 8) < 2, 'il tombe à 1,3 m près du point visé');
    assert.ok(Math.abs(f.it - e.it - R.dureeVol('molotov', Math.hypot(e.a, e.b)) * IT_S) <= 1, 'durée du vol');
  }
  const chutes = de(vus, EV.A_TERRE);
  assert.ok(chutes.length >= 3 && chutes.every(e => e.faction === B && e.a === 5 && e.b === P.CAUSES_A_TERRE.MOLOTOV), 'le souffle jette au sol');
  const b = m.bilan()[C];
  assert.ok(b.sources[5] > 0 && b.aTerre === chutes.length && b.feux >= 5);
  for (const i of piquets) if (m.uetat[i] !== ET.HORS_JEU) assert.equal(foyerDe(m, i), -1, 'personne ne reste dans le feu, même où les foyers se chevauchent');
});

verifier('0.3, feu au sol : il presse qui s\'y trouve, même les siens, qui en sortent, même à terre ; qui y tombe disparaît', () => {
  const m = creer({ vide: true, joueur: 0 });
  const r = rueEntreMurs(m.ville);
  const corteges = grappe(m, C, 1, 12, r.x, r.z);
  m.soumettre(cmd(CMD.TENIR, C, { ids: corteges }));
  courir(m, 1);
  const couche = corteges[0], faible = corteges[1];
  assert.equal(m.renverser(couche), true);
  m.ucoh[faible] = 100;
  m.incendier(C, r.x, r.z);                       // leur propre cocktail : pas de souffle sur eux, mais le feu presse
  const dedans = corteges.filter(i => foyerDe(m, i) >= 0);
  assert.ok(m.nFeux >= 1 && dedans.length >= 10 && dedans.includes(couche) && dedans.includes(faible));
  const vus = courir(m, 40);
  assert.deepEqual(de(vus, EV.HORS_JEU).map(e => [e.faction, e.a, e.b]), [[C, 1, -1]], 'le plus faible est mis hors jeu');
  assert.equal(m.ufac[faible], R.LIBRE, 'hors jeu dans un foyer, il disparaît aussitôt : personne n\'est montré en feu');
  for (const i of corteges) {
    if (i === faible) continue;
    assert.equal(foyerDe(m, i), -1, 'deux secondes plus tard, plus personne dans le foyer');
    assert.equal(m.uterre[i], 0);
    if (dedans.includes(i)) assert.ok(m.ucoh[i] < R.TYPES[1].coh * 1000, 'pressé');
  }
  assert.ok(distance(m, couche, r.x, r.z) > K.FEU.rayon, 'à terre dans le feu, il se relève et en sort');
  assert.equal(m.bilan()[C].infliges, 0, 'le feu des siens ne rapporte rien');
});

verifier('0.3, Canon à eau : il éteint de lui-même le foyer à sa portée, et sur ordre celui qu\'on lui désigne', () => {
  const m = creer({ vide: true, joueur: 0 });
  const r = rueEntreMurs(m.ville);
  const canon = m.ajouter(F, 12, r.x, r.z - 12);
  m.incendier(C, r.x, r.z);
  let id = -1;
  for (let q = 0; q < m.feux.max; q++) if (m.feux.actif[q] && m.feux.sorte[q] === P.SORTES_FEU.SOL) id = m.feux.id[q];
  const n0 = m.nFeux;
  const vus = courir(m, 600, null, x => x.nFeux === 0);
  assert.equal(m.nFeux, 0);
  const eteints = de(vus, EV.FEU_ETEINT);
  assert.ok(eteints.length === n0 && eteints.every(e => e.faction === F && e.b === 1), 'éteints à l\'eau, par la Préfecture');
  assert.ok(eteints.find(e => e.a === id).it < K.FEU.duree * IT_S / 2, 'bien avant de s\'être consumé');
  assert.ok(de(vus, EV.JET).length > 0 && m.bilan()[F].eteints === n0);
  // Un foyer à 36 m, hors de sa portée : de lui-même, il ne bouge pas ; sur ordre, il s'approche et l'éteint.
  m.incendier(C, r.x, r.z + 24);
  const n1 = m.nFeux;
  courir(m, 40);
  assert.ok(distance(m, canon, r.x, r.z - 12) < 0.5 && m.nFeux === n1);
  m.soumettre(cmd(CMD.CAPACITE, F, { ids: [canon], capacite: 'jet', x: r.x, z: r.z + 24 }));
  const vus2 = courir(m, 600, null, x => x.nFeux === 0);
  assert.equal(m.nFeux, 0);
  assert.ok(de(vus2, EV.FEU_ETEINT).every(e => e.faction === F && e.b === 1) && m.bilan()[F].eteints === n0 + n1);
  assert.ok(distance(m, canon, r.x, r.z + 24) <= R.TYPES[12].capacites.jet.portee + 0.5);
});

verifier('0.3, gaz : Convergence et Bastion suffoquent et en sortent au pas ; la Préfecture et ses alliés portent le masque', () => {
  const r = rueEntreMurs(creer({ vide: true, joueur: 0 }).ville);
  const dans = (m, ids) => ids.filter(i => distance(m, i, r.x, r.z) <= K.GAZ.rayon).length;
  // La Convergence : elle suffoque, ne frappe plus, sort du nuage.
  const m = creer({ vide: true, joueur: 0 });
  const conv = grappe(m, C, 1, 8, r.x, r.z);
  m.soumettre(cmd(CMD.TENIR, C, { ids: conv }));
  courir(m, 1);
  m.gazer(F, r.x, r.z);
  const a = compterEtat(m, conv, ET.SUFFOQUE, 200);
  assert.ok(a.k > 0, 'elle suffoque');
  assert.equal(dans(m, conv), 0, 'dix secondes plus tard, elle est sortie du nuage');
  assert.ok(conv.every(i => m.ucoh[i] < R.TYPES[1].coh * 1000) && m.bilan()[F].sources[7] > 0);
  // Le Bastion aussi, et le gaz de la Préfecture le met en colère.
  const m2 = creer({ vide: true, joueur: 0 });
  const bast = grappe(m2, B, 5, 8, r.x, r.z);
  m2.soumettre(cmd(CMD.TENIR, B, { ids: bast }));
  courir(m2, 1);
  m2.gazer(F, r.x, r.z);
  assert.ok(compterEtat(m2, bast, ET.SUFFOQUE, 40).k > 0 && m2.colere > 0);
  // Allié de la Préfecture, le Bastion porte le masque comme elle.
  const m3 = creer({ vide: true, joueur: 0, alliance: [B, F] });
  const masques = Int32Array.from([...grappe(m3, B, 5, 6, r.x, r.z), ...grappe(m3, F, 9, 6, r.x, r.z + 1)]);
  m3.soumettre(cmd(CMD.TENIR, B, { ids: masques.subarray(0, 6) })); m3.soumettre(cmd(CMD.TENIR, F, { ids: masques.subarray(6) }));
  courir(m3, 1);
  m3.gazer(F, r.x, r.z);
  assert.equal(compterEtat(m3, masques, ET.SUFFOQUE, 100).k, 0);
  assert.ok(masques.every(i => m3.ucoh[i] === R.TYPES[m3.utyp[i]].coh * 1000) && dans(m3, masques) === 12, 'rien, ils restent');
});

verifier('0.3, mise à terre : trois secondes au sol sans rien faire, puis six sans retomber ; un véhicule ne tombe pas', () => {
  const m = creer({ vide: true, joueur: 0 });
  const r = rueEntreMurs(m.ville);
  const i = m.ajouter(C, 1, r.x, r.z), canon = m.ajouter(F, 12, r.x, r.z + 24);
  const SOL = K.A_TERRE_S * IT_S, IMM = K.A_TERRE_IMMUNITE_S * IT_S;
  assert.equal(m.renverser(i), true);
  assert.deepEqual([m.uterre[i], m.uetat[i]], [SOL, ET.A_TERRE]);
  m.soumettre(cmd(CMD.DEPLACER, C, { ids: [i], x: r.x, z: r.z + 12, mode: 0 }));
  const x0 = m.ux[i], z0 = m.uz[i];
  courir(m, SOL - 1);
  assert.deepEqual([m.uterre[i], m.uetat[i], m.ux[i], m.uz[i]], [1, ET.A_TERRE, x0, z0], 'au sol, il ne bouge pas');
  courir(m, 1);
  assert.deepEqual([m.uterre[i], m.uimm[i]], [0, IMM], 'relevé');
  assert.equal(m.renverser(i), false, 'relevé depuis moins de six secondes, il ne retombe pas');
  courir(m, IMM);
  assert.equal(m.uimm[i], 0);
  assert.ok(Math.hypot(m.ux[i] - x0, m.uz[i] - z0) > 5000, 'il a repris sa marche');
  assert.equal(m.renverser(i), true);
  assert.ok(!m.renverser(canon) && m.uterre[canon] === 0, 'un véhicule ne tombe pas');
});

verifier('0.3, charge : les Béliers foncent entre 4 et 12 m ; le choc repousse et jette au sol', () => {
  const m = creer({ vide: true, joueur: 0 });
  const r = rueEntreMurs(m.ville);
  const beliers = grappe(m, B, 7, 4, r.x, r.z - 5), corteges = grappe(m, C, 1, 10, r.x, r.z + 4);
  m.soumettre(cmd(CMD.TENIR, C, { ids: corteges }));
  m.soumettre(cmd(CMD.DEPLACER, B, { ids: beliers, x: r.x, z: r.z + 4, mode: 1 }));
  const { vus, k } = compterEtat(m, beliers, ET.ASSAUT, 120);
  const charges = de(vus, EV.CHARGE);
  assert.ok(charges.length >= 1 && charges.every(e => e.faction === B && e.b === 7));
  assert.ok(k > 0, 'en assaut pendant l\'élan');
  const chutes = de(vus, EV.A_TERRE).filter(e => e.b === P.CAUSES_A_TERRE.CHARGE);
  assert.ok(chutes.length >= 1 && chutes.every(e => e.faction === C && e.a === 1), 'le choc jette au sol');
  const b = m.bilan()[B];
  assert.ok(b.charges >= 2 && b.sources[4] > 0 && b.aTerre >= chutes.length);
});

verifier('0.3, pierres : à 10 m, Cortège et Piquets qui tiennent se lancent des pierres ; le coup porte 0,6 s plus tard', () => {
  const m = creer({ vide: true, joueur: 0 });
  const r = rueEntreMurs(m.ville);
  const corteges = grappe(m, C, 1, 6, r.x, r.z - 5), piquets = grappe(m, B, 5, 6, r.x, r.z + 5);
  m.soumettre(cmd(CMD.TENIR, C, { ids: corteges })); m.soumettre(cmd(CMD.TENIR, B, { ids: piquets }));
  const vus = [];
  let premierCoup = -1;
  for (let q = 0; q < 100; q++) {
    vus.push(...courir(m, 1));
    if (premierCoup < 0 && m.bilan()[C].sources[3] > 0) premierCoup = m.it;
  }
  const pierres = de(vus, EV.PIERRE);
  for (const f of [C, B]) {
    const z = f === C ? r.z + 5 : r.z - 5, siennes = pierres.filter(e => e.faction === f);
    assert.ok(siennes.length >= 6, 'chacun lance');
    assert.ok(siennes.every(e => Math.hypot(e.x + e.a - r.x, e.z + e.b - z) < 4), 'vers l\'autre groupe');
    const b = m.bilan()[f];
    assert.ok(b.pierres >= siennes.length && b.sources[3] > 0 && b.sources[0] === 0, 'des pierres, aucun contact');
  }
  const premier = pierres.find(e => e.faction === C).it;
  assert.equal(premierCoup - premier, Math.round(K.PROJECTILES.pierre.vol * IT_S));
});

verifier('0.3, déroute : un camp sans base tient 30 s, puis il est éliminé ; la partie continue à deux', () => {
  const m = creer({ vide: true, joueur: 0 });
  const qb = m.ville.sites.qg[B], L = m.ville.sites.lieux[0], p = m.ville.accrocher(L.x, L.z);
  grappe(m, C, 1, 30, qb.sortie[0], qb.sortie[1]);
  grappe(m, B, 5, 150, p[0], p[1]);                 // loin de son QG, plus de 2 % de ses effectifs de départ
  const vus = courir(m, 2400, null, x => x.elimine[B] === 1);
  const occ = de(vus, EV.QG_OCCUPE), der = de(vus, EV.DEROUTE), elim = de(vus, EV.ELIMINATION);
  assert.deepEqual(occ.map(e => [e.faction, e.a]), [[B, C]]);
  assert.deepEqual(der.map(e => [e.faction, e.a]), [[B, K.DEROUTE_S]]);
  assert.ok(der[0].it >= occ[0].it && der[0].it - occ[0].it <= IT_S, 'la déroute commence avec l\'occupation');
  assert.deepEqual(elim.map(e => e.faction), [B]);
  assert.ok(Math.abs((elim[0].it - der[0].it) / IT_S - K.DEROUTE_S) <= 1, '30 s de déroute : ' + (elim[0].it - der[0].it) / IT_S);
  assert.equal(m.vainqueur, -1, 'la Convergence et la Préfecture restent en jeu');
});

verifier('0.3, modes de victoire : la cible de points finit la partie ; la limite de temps donne le meilleur score', () => {
  const m = creer({ vide: true, joueur: 0, victoire: { mode: 'points', points: 1500 } });
  assert.deepEqual(m.victoire, { mode: 'points', points: 1500, limiteTemps: 0, plafond: K.VICTOIRE.PLAFOND_S * IT_S });
  m.score[B] = 1500;
  const vus = courir(m, IT_S + 1, null, x => x.vainqueur !== -1);
  assert.deepEqual(de(vus, EV.VICTOIRE).map(e => [e.a, e.b]), [[B, P.RAISONS_FIN.indexOf('points')]]);
  assert.equal(m.raison, 'points');
  const m2 = creer({ vide: true, joueur: 0, victoire: { mode: 'temps', duree: 10 } });
  assert.deepEqual([m2.victoire.points, m2.victoire.limiteTemps, m2.victoire.plafond], [0, 10 * 60 * IT_S, 0]);
  m2.score[F] = 5; m2.score[C] = 3;
  courir(m2, 10 * 60 * IT_S + IT_S, null, x => x.vainqueur !== -1);
  assert.deepEqual([m2.vainqueur, m2.raison], [F, 'temps']);
  assert.ok(m2.it >= 10 * 60 * IT_S && m2.it <= 10 * 60 * IT_S + IT_S);
});

// ---- Le travailleur : messages, réserve de tampons, vitesse, démo. ----
function horlogeFactice() {
  let maintenant = 0, suivant = 1;
  const minuteries = new Map();
  return {
    reglages: {
      horloge: () => maintenant,
      minuterie: (fn, ms) => { minuteries.set(suivant, { quand: maintenant + ms, fn }); return suivant++; },
      annuler: j => minuteries.delete(j),
    },
    /** Avance l'horloge jusqu'à t ms, en déclenchant les minuteries dues dans l'ordre. */
    avancer(t) {
      for (;;) {
        let j = -1, q = Infinity;
        for (const [k, v] of minuteries) if (v.quand <= t && v.quand < q) { q = v.quand; j = k; }
        if (j < 0) break;
        const { fn } = minuteries.get(j);
        minuteries.delete(j);
        maintenant = Math.max(maintenant, q);
        fn();
      }
      maintenant = t;
    },
    get maintenant() { return maintenant; },
    sauter(t) { maintenant = t; },
  };
}
verifier('travailleur : pret, un état par itération, tampons rendus, vitesse, rattrapage borné, démo sans ordres humains', () => {
  const h = horlogeFactice(), recus = [];
  const t = TR.creer((m, transferts) => recus.push({ m, transferts }), h.reglages);
  t.recevoir({ type: 'demarrer', options: { graine: 3, effectifs: 20000, joueur: -1 } });
  assert.equal(recus[0].m.type, 'pret');
  assert.deepEqual(Object.keys(recus[0].m.options).sort(), ['alliance', 'brouillard', 'coalitions', 'difficulte', 'effectifs', 'enregistrer', 'graine', 'joueur',
    'manifestants', 'victoire', 'ville']);
  // 0.3 : une démo ne finit ni aux points ni au temps (0 : ni cible ni limite, dès « pret » comme dans l'état) ; la
  // part des manifestants par défaut est « moyen ».
  assert.deepEqual(recus[0].m.options.victoire, { mode: 'dernier', points: 0, duree: 0 });
  assert.equal(recus[0].m.options.manifestants, 'moyen');
  assert.deepEqual(recus[0].m.carte.parts, [40, 32, 28]);
  assert.deepEqual(recus[0].m.carte.depart, [8000, 6400, 5600]);
  assert.deepEqual(recus[1].m.victoire, { mode: 'dernier', points: 0, duree: 0, reste: -1, plafond: K.VICTOIRE.DEMO_PLAFOND_S, demo: true });
  assert.equal(recus[0].m.options.ville, 'damier');
  assert.equal(recus[0].m.carte.ilots, 9);
  assert.equal(recus[1].m.type, 'etat');
  assert.equal(recus[1].m.it, 0);
  assert.equal(recus[1].m.n, 20000);
  assert.ok(recus[1].transferts.includes(recus[1].m.unites));
  assert.equal(t.monde.estIA.every(Boolean), true, 'démo : trois IA');
  h.avancer(1000);
  const etats = recus.filter(r => r.m.type === 'etat');
  assert.equal(etats.length, 21, '20 itérations par seconde, plus l\'état de départ');
  assert.deepEqual(etats.map(r => r.m.it), etats.map((_, k) => k));
  assert.ok(etats.every(r => r.m.voile === null), 'pas de brouillard en démo');
  assert.equal(recus[0].m.options.brouillard, false, 'la page le sait dès « pret »');
  assert.ok(etats.some(r => r.m.minicarte) && etats.some(r => r.m.combats) && etats.some(r => r.m.gisements));
  // Unités lisibles : positions finies, codes cohérents.
  const f32 = new Float32Array(etats[20].m.unites, 0, etats[20].m.n * 4);
  for (let i = 0; i < etats[20].m.n; i++) assert.ok(Number.isFinite(f32[i * 4]) && Number.isFinite(f32[i * 4 + 1]) && R.codeFaction(f32[i * 4 + 3]) <= 3);
  // Démo : les ordres humains sont refusés.
  t.recevoir({ type: 'commandes', liste: [cmd(CMD.ARRETER, C, { ids: [0] })] });
  const tampon = etats[20].m.unites;
  t.recevoir({ type: 'rendre', tampon });
  h.avancer(1050);
  const dernier = recus[recus.length - 1].m;
  const refus = [];
  for (let o = 0; o < dernier.evenements.length; o += P.EV_TAILLE) if (dernier.evenements[o] === EV.REFUS) refus.push(Array.from(dernier.evenements.subarray(o, o + 6)));
  assert.deepEqual(refus, [[EV.REFUS, 0, 0, C, RAISONS.INTERDIT, CMD.ARRETER]]);
  assert.equal(dernier.unites, tampon, 'le tampon rendu resert');
  // Pause, double vitesse.
  t.recevoir({ type: 'vitesse', x: 0 });
  let avant = recus.length;
  h.avancer(3000);
  assert.equal(recus.length, avant, 'en pause, rien');
  t.recevoir({ type: 'vitesse', x: 2 });
  avant = recus.length;
  h.avancer(4000);
  assert.equal(recus.length - avant, 40, 'vitesse 2 : 40 itérations par seconde');
  // Un fil gelé 10 s : au plus 4 itérations rattrapées d'un coup.
  avant = recus.length;
  h.sauter(14000);
  h.avancer(14000);
  assert.ok(recus.length - avant <= 4, 'rattrapage borné : ' + (recus.length - avant));
  t.recevoir({ type: 'arreter' });
  avant = recus.length;
  h.avancer(20000);
  assert.equal(recus.length, avant, 'arrêté, plus rien');
});

verifier('travailleur : le joueur commande son camp seulement ; une exception devient « erreur »', () => {
  const h = horlogeFactice(), recus = [];
  const t = TR.creer(m => recus.push(m), h.reglages);
  t.recevoir({ type: 'demarrer', options: { graine: 4, effectifs: 20000, joueur: B } });
  assert.equal(t.monde.estIA.join(), 'true,false,true');
  const miens = [];
  for (let i = 0; i < t.monde.n && miens.length < 10; i++) if (t.monde.ufac[i] === B) miens.push(i);
  t.recevoir({ type: 'commandes', liste: [cmd(CMD.TENIR, B, { ids: miens }), cmd(CMD.TENIR, C, { ids: [0] })] });
  h.avancer(100);
  const refus = [];
  for (const m of recus) if (m.type === 'etat') for (let o = 0; o < m.evenements.length; o += 6) if (m.evenements[o] === EV.REFUS) refus.push(m.evenements[o + 3]);
  assert.deepEqual(refus, [C]);
  assert.ok(miens.every(i => t.monde.uord[i] === t.monde.O.TENIR));
  assert.ok(recus.some(m => m.type === 'etat' && m.voile), 'le joueur a son brouillard');
  // Une exception dans la boucle : message « erreur », la boucle s'arrête.
  t.monde.iterer = () => { throw new Error('panne d\'essai'); };
  h.avancer(300);
  const erreur = recus.find(m => m.type === 'erreur');
  assert.ok(erreur && erreur.message === 'panne d\'essai' && erreur.pile.length > 0);
});

// ---- Une partie de 10 minutes simulées à trois IA et 20 000 unités. ----
verifier('partie de 10 minutes à trois IA, 20 000 unités : aucune exception ni valeur invalide, tout bouge', () => {
  const m = creer({ graine: 11, joueur: -1, effectifs: 20000, coalitions: true });
  const ia = IA.creer(m);
  const tampon = new ArrayBuffer(P.CAPACITE * 16);
  const compte = {}, prisPar = new Map(), res = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
  const debut = performance.now();
  for (let k = 0; k < 12000 && m.vainqueur === -1; k++) {
    m.iterer(); ia.penser();
    const e = m.etat(tampon, 1);
    const ev = e.evenements;
    for (let o = 0; o < ev.length; o += 6) {
      assert.ok(ev.subarray(o, o + 6).every(Number.isFinite));
      compte[ev[o]] = (compte[ev[o]] || 0) + 1;
      if (ev[o] === EV.LIEU_PRIS) prisPar.set(ev[o + 4], (prisPar.get(ev[o + 4]) || 0) + 1);
    }
    if (k % 50 === 0) {
      const f32 = new Float32Array(tampon, 0, e.n * 4);
      for (let i = 0; i < e.n * 4; i++) assert.ok(Number.isFinite(f32[i]));
      for (let f = 0; f < 3; f++) {
        const x = e.eco[f];
        for (const v of [x.moyens, x.materiaux, x.pop, x.popMax, x.score, x.revenu.moyens, x.revenu.materiaux, x.oisifs, x.qgOccupe]) assert.ok(Number.isFinite(v) && v >= 0);
        assert.ok(x.pop <= x.popMax);
        res[f][0] = Math.min(res[f][0], x.moyens); res[f][1] = Math.max(res[f][1], x.moyens);
      }
      for (const l of e.lieux) assert.ok(l.progression >= 0 && l.progression <= 1 && l.proprietaire >= -1 && l.proprietaire <= 2);
      for (let q = 0; q < m.res.length; q++) assert.ok(Number.isInteger(m.res[q]));
    }
  }
  const s = (performance.now() - debut) / 1000;
  const nom = Object.fromEntries(Object.entries(EV).map(([k, v]) => [v, k]));
  console.log('    ' + Object.entries(compte).map(([k, v]) => `${nom[k]} ${v}`).join(', '));
  console.log(`    ${m.it} itérations en ${s.toFixed(1)} s ; vivantes ${Array.from(m.vivantes).join(' / ')} ; scores ${Array.from(m.score).join(' / ')} ; lieux ${Array.from(m.lieuProp).join(',')}`);
  assert.ok(res.every(([a, b]) => b > a), 'les ressources varient');
  assert.ok((compte[EV.LIEU_NEUTRALISE] || 0) >= 1 && [...prisPar.values()].some(v => v >= 2), 'des lieux changent de mains');
  assert.ok((compte[EV.BARRICADE_POSEE] || 0) >= 1 && (compte[EV.BARRICADE_LEVEE] || 0) >= 1, 'des barricades posées puis levées');
  assert.ok((compte[EV.PRODUCTION] || 0) >= 10 && (compte[EV.HORS_JEU] || 0) >= 100);
  assert.ok(!compte[EV.REFUS] || compte[EV.REFUS] < 200, 'l\'IA ne s\'obstine pas sur des ordres refusés');
  // 0.3 : les IA se servent des cocktails, du gaz, du Canon à eau (qui éteint), des charges, des pierres.
  for (const t of ['MOLOTOV', 'FEU_ALLUME', 'LACRYMO', 'GAZ', 'JET', 'A_TERRE', 'CHARGE', 'PIERRE']) assert.ok(compte[EV[t]] >= 1, '0.3 : ' + t);
  assert.ok(m.bilan()[F].eteints >= 1, 'des feux éteints à l\'eau');
});

console.log(`SIM  REUSSI : ${ok} vérifications`);
