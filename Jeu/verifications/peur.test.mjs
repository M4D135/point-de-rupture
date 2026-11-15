import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const ici = path.dirname(fileURLToPath(import.meta.url));
const src = f => path.join(ici, '..', 'src', f);
const exiger = createRequire(import.meta.url);
for (const f of ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'villes/marseille.js', 'ville-reelle.js', 'sim/nav.js', 'sim/immeubles.js', 'sim/monde.js', 'sim/ia.js', 'sim/travailleur.js']) exiger(src(f));
const { ville: V, regles: R, protocole: P, monde: M, ia: IA } = globalThis.PDR;
const { CMD } = P;
const { CONVERGENCE: C, BASTION: B, PREFECTURE: F } = R;
const K = R.CONSTANTES, ET = R.ETATS, IT_S = K.IT_PAR_S, DR = R.DRAPEAUX;

let ok = 0;
const verifier = (nom, f) => { const t0 = performance.now(); f(); ok++; console.log(`ok  ${nom} (${((performance.now() - t0) / 1000).toFixed(1)} s)`); };
const villes = new Map();
const ville = (graine, ilots) => { const k = graine + ':' + ilots; if (!villes.has(k)) villes.set(k, V.creerVille(graine, { ilots })); return villes.get(k); };
const creer = (options = {}) => M.creer(ville(options.graine ?? 1, R.ilots(options.effectifs ?? 20000)), { graine: 1, effectifs: 20000, ...options });
const cmd = (t, j, champs) => P.commande(t, j, champs);
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
const tamponEtat = new ArrayBuffer(P.CAPACITE * 16);
function etatDe(m) {
  const e = m.etat(tamponEtat, 1), f32 = new Float32Array(tamponEtat, 0, Math.max(1, e.n) * 4);
  e.codeEtat = i => R.codeEtat(f32[i * 4 + 3]);
  e.faction = i => R.codeFaction(f32[i * 4 + 3]);
  return e;
}
function grappe(m, f, t, n, x, z) {
  const ids = [];
  const fines = new Int32Array(n);
  const k = m.nav.remplir(Math.round(x * 1000), Math.round(z * 1000), n, fines);
  for (let q = 0; q < n; q++) { const fc = fines[q % k]; ids.push(m.ajouter(f, t, m.nav.fineX(fc) / 1000, m.nav.fineZ(fc) / 1000)); }
  return Int32Array.from(ids);
}
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

verifier('pression : peur puis repli avant 25 % de cohésion ; Tenir garde la position', () => {
  const m = creer({ vide: true, joueur: C }), r = rueEntreMurs(m.ville);
  const a = m.ajouter(C, 1, r.x, r.z), b = m.ajouter(C, 1, r.x, r.z + 30);
  grappe(m, F, 9, 4, r.x, r.z + 1.5); grappe(m, F, 9, 4, r.x, r.z + 31.5);
  m.soumettre(cmd(CMD.TENIR, C, { ids: [b] }));
  let repli = false, peurTenir = 0;
  for (let k = 0; k < 600; k++) {
    m.iterer();
    peurTenir = Math.max(peurTenir, m.upeur[b]);
    assert.notEqual(m.uord[b], m.O.REPLI);
    if (!repli && m.uord[a] === m.O.REPLI) {
      assert.ok(m.ucoh[a] * 4 > m.T.coh[1], 'la cohésion ne suffit pas à expliquer le repli');
      assert.ok(m.upeur[a] >= K.PEUR_SEUIL);
      repli = true;
    }
  }
  assert.ok(repli); assert.ok(peurTenir >= K.PEUR_SEUIL, 'Tenir ne supprime pas la peur');
});

verifier('calme : délai sans dégâts, baisse progressive, borne zéro', () => {
  const m = creer({ vide: true, joueur: C }), r = rueEntreMurs(m.ville);
  const i = m.ajouter(C, 1, r.x, r.z);
  m.upeur[i] = 500; m.ucalme[i] = K.PEUR_CALME_S * IT_S;
  courir(m, K.PEUR_CALME_S * IT_S);
  assert.equal(m.upeur[i], 500, 'pas de baisse pendant le délai');
  courir(m, 1); assert.ok(m.upeur[i] < 500 && m.upeur[i] > 0);
  courir(m, 200); assert.equal(m.upeur[i], 0); assert.equal(m.ucalme[i], 0);
});

verifier('base et Fanfare : apaisement plus rapide, même à cohésion pleine', () => {
  const m = creer({ vide: true, joueur: C }), r = rueEntreMurs(m.ville), q = m.structures[C];
  const temoin = m.ajouter(C, 1, r.x, r.z);
  const base = m.ajouter(C, 1, q.sortieX / 1000, q.sortieZ / 1000);
  const soutenu = m.ajouter(C, 1, r.x, r.z + 30), fanfare = m.ajouter(C, 3, r.x, r.z + 32);
  m.soumettre(cmd(CMD.TENIR, C, { ids: [temoin, base, soutenu, fanfare] }));
  courir(m, 21); // La grille de soins est établie.
  for (const i of [temoin, base, soutenu]) { m.upeur[i] = 800; m.ucalme[i] = 0; }
  courir(m, 40);
  for (const i of [base, soutenu]) {
    assert.ok(m.upeur[i] < m.upeur[temoin], 'le soutien apaise davantage que le calme seul');
    assert.equal(m.ucoh[i], m.T.coh[1]);
  }
});

verifier('véhicule : pression du feu sans peur, repli de cohésion conservé', () => {
  const m = creer({ vide: true, joueur: F }), r = rueEntreMurs(m.ville);
  const t = R.TYPES.find(t => t.vehicule && !t.capacites.jet).id;
  const i = m.ajouter(F, t, r.x, r.z);
  m.incendier(F, r.x, r.z); courir(m, 40);
  assert.equal(m.upeur[i], 0); assert.ok(m.ucoh[i] < m.T.coh[t]);
  const bas = creer({ vide: true, joueur: F }), j = bas.ajouter(F, t, r.x, r.z);
  bas.ucoh[j] = Math.trunc(bas.T.coh[t] / 5); bas.incendier(F, r.x, r.z);
  courir(bas, 40, null, () => bas.uord[j] === bas.O.REPLI);
  assert.equal(bas.uord[j], bas.O.REPLI); assert.equal(bas.upeur[j], 0);
});

verifier('gaz et feu : peur causale, masques alliés préservés, Tenir sort du danger', () => {
  const m = creer({ vide: true, joueur: C }), r = rueEntreMurs(m.ville);
  const i = m.ajouter(C, 1, r.x, r.z);
  m.soumettre(cmd(CMD.TENIR, C, { ids: [i] })); courir(m, 1);
  m.gazer(F, r.x, r.z); courir(m, 20);
  assert.ok(m.upeur[i] > 0); assert.equal(m.uord[i], m.O.TENIR);
  const masque = creer({ vide: true, joueur: B, alliance: [B, F] });
  const ids = [masque.ajouter(B, 5, r.x, r.z), masque.ajouter(F, 9, r.x, r.z + 1)];
  masque.gazer(F, r.x, r.z); courir(masque, 40);
  for (const j of ids) { assert.equal(masque.upeur[j], 0); assert.equal(masque.ucoh[j], masque.T.coh[masque.utyp[j]]); }
  const feu = creer({ vide: true, joueur: C }), j = feu.ajouter(C, 1, r.x, r.z);
  feu.soumettre(cmd(CMD.TENIR, C, { ids: [j] })); courir(feu, 1);
  feu.incendier(C, r.x, r.z); courir(feu, 40);
  assert.ok(feu.upeur[j] > 0); assert.equal(feu.bilan()[C].infliges, 0);
  assert.equal(feu.uord[j], feu.O.TENIR);
  assert.ok(Math.hypot(feu.ux[j] / 1000 - r.x, feu.uz[j] / 1000 - r.z) > K.FEU.rayon);
});

verifier('emplacement réutilisé : peur et délai remis à zéro', () => {
  const m = creer({ vide: true, joueur: C }), r = rueEntreMurs(m.ville), i = m.ajouter(C, 1, r.x, r.z);
  m.ucoh[i] = 1; m.upeur[i] = 500; m.ucalme[i] = 60;
  m.incendier(C, r.x, r.z); courir(m, 80, null, () => m.ufac[i] === R.LIBRE);
  assert.equal(m.ufac[i], R.LIBRE); assert.ok(m.upeur[i] > 0);
  const j = m.ajouter(C, 1, r.x, r.z);
  assert.equal(j, i); assert.equal(m.upeur[j], 0); assert.equal(m.ucalme[j], 0);
});

verifier('export : moyenne et seuil, hors-jeu/libres/véhicules exclus, format inchangé', () => {
  const m = creer({ vide: true, joueur: F }), r = rueEntreMurs(m.ville);
  const ids = Array.from({ length: 4 }, (_, k) => m.ajouter(F, 9, r.x, r.z + k));
  const veh = m.ajouter(F, 14, r.x, r.z + 10);
  for (const [k, p] of [750, 250, 1000, 1000].entries()) m.upeur[ids[k]] = p;
  m.upeur[veh] = 1000; m.uetat[ids[2]] = ET.HORS_JEU; m.ufac[ids[3]] = R.LIBRE;
  const e = etatDe(m), f32 = new Float32Array(e.unites);
  assert.equal(e.eco[F].peur, .5); assert.equal(e.eco[F].effrayes, 1);
  assert.equal(e.eco[C].peur, 0); assert.equal(e.eco[C].effrayes, 0);
  assert.equal(DR.PEUR, 32); assert.equal(P.VERSION, 2);
  assert.ok((f32[ids[0] * 4 + 3] >>> 16) & DR.PEUR);
  for (const i of [ids[1], ids[2], ids[3], veh]) assert.equal((f32[i * 4 + 3] >>> 16) & DR.PEUR, 0);
});

verifier('empreintes : peur et délai couverts, cliché périodique identique', () => {
  const m = creer({ vide: true, joueur: C }), r = rueEntreMurs(m.ville), i = m.ajouter(C, 1, r.x, r.z);
  const initial = m.empreinte(); m.upeur[i] = 800;
  const peur = m.empreinte(); assert.notEqual(peur, initial);
  m.ucalme[i] = 60; assert.notEqual(m.empreinte(), peur);
  courir(m, 100); const attendu = m.empreinte(); courir(m, 50);
  assert.equal(m.empreintes.find(([it]) => it === 100)[1], attendu);
});

verifier('replay : commandes sans nouveau champ, résultat identique avec les règles courantes', () => {
  const m = creer({ graine: 42, joueur: -1, effectifs: 200 }), ia = IA.creer(m);
  courir(m, 500, ia);
  const enr = structuredClone(m.enregistrement());
  assert.equal(enr.version, 2); assert.equal('peur' in enr.options, false);
  const relu = M.relire(m.ville, enr, 500, null);
  assert.equal(relu.empreinte(), m.empreinte());
  assert.deepEqual(Array.from(relu.upeur.subarray(0, relu.n)), Array.from(m.upeur.subarray(0, m.n)));
});
console.log(`PEUR : ${ok} vérifications passées`);
