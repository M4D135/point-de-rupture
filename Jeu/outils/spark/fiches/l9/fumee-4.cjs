// Contrôle de fumée : les immeubles dans la simulation (fiches l9-10 à l9-14). Arguments : sections (a toujours) b c d.
//   a : branchement (allumerImmeuble, IMMEUBLE_FEU, il brûle) ; b : etat.immeubles, mesure, empreinte ;
//   c : on s'écarte d'une façade en feu ; d : six Pompiers l'éteignent sur ordre ETEINDRE.
const assert = require('assert'); globalThis.PDR = {};
for (const f of ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'villes/marseille.js', 'ville-reelle.js', 'sim/nav.js', 'sim/immeubles.js', 'sim/monde.js']) require(process.cwd() + '/Jeu/src/' + f);
const { ville: V, regles: R, protocole: P, monde: M } = PDR;
const IT_S = R.CONSTANTES.IT_PAR_S, EV = P.EV, CI = R.CONSTANTES.IMMEUBLES, parts = new Set(process.argv.slice(2));
const v = V.creerVille(1, { ilots: R.ilots(4000) });
const creerMonde = () => M.creer(v, { graine: 1, effectifs: 4000 });
const m = creerMonde(), I = m.immeubles, vus = [];
assert.ok(I && I.n === v.sites.immeubles.length && I.n > 20, 'les immeubles de la ville dans la simulation : ' + (I && I.n));
const courir = (n, arret) => {
  for (let q = 0; q < n; q++) {
    m.iterer();
    const e = m.evenements();
    for (let o = 0; o < e.length; o += P.EV_TAILLE) vus.push({ type: e[o], f: e[o + 3], a: e[o + 4], b: e[o + 5] });
    if (arret && arret()) return q + 1;
  }
  return n;
};
function grappe(f, t, n, x, z) {
  const fines = new Int32Array(n), k = m.nav.remplir(Math.round(x * 1000), Math.round(z * 1000), n, fines), ids = [];
  for (let q = 0; q < n; q++) { const fc = fines[q % k]; ids.push(m.ajouter(f, t, m.nav.fineX(fc) / 1000, m.nav.fineZ(fc) / 1000)); }
  return Int32Array.from(ids);
}
let r = null;                                    // un immeuble au bord d'une rue : un point praticable à 3 m de sa façade
for (const b of v.sites.immeubles) {
  const x = b.boites[0];
  for (const [dx, dz] of [[x.lx / 2 + 3, 0], [-x.lx / 2 - 3, 0], [0, x.lz / 2 + 3], [0, -x.lz / 2 - 3]])
    if (!r && v.praticable(x.x + dx, x.z + dz)) r = { k: b.id, x: x.x + dx, z: x.z + dz };
  if (r) break;
}
assert.ok(r, 'un immeuble au bord d’une rue');
const k = r.k, dist = i => PDR.immeubles.distFacade(I, k, m.ux[i] / 1000, m.uz[i] / 1000);
m.allumerImmeuble(k, 0);
courir(2);
assert.ok(vus.some(e => e.type === EV.IMMEUBLE_FEU && e.a === I.id[k] && e.f === 0), 'évènement IMMEUBLE_FEU');
courir(IT_S * 45);
assert.equal(I.etat[k], 1, 'il brûle'); assert.ok(I.intensite[k] > 0.5, 'intensité ' + I.intensite[k]);
console.log('ok a : branchement');
if (parts.has('b')) {
  const e = m.etat(new ArrayBuffer(P.CAPACITE * 16), 1);
  assert.ok(e.immeubles instanceof Float32Array && e.immeubles.length >= P.IMMEUBLE_TAILLE, 'etat.immeubles');
  const lus = Array.from({ length: e.immeubles.length / P.IMMEUBLE_TAILLE }, (_, q) => P.lireImmeuble(e.immeubles, q));
  assert.ok(lus.some(x => x.id === I.id[k] && x.etat === 1 && x.intensite > 0.5), 'l’immeuble dans etat.immeubles');
  assert.ok(e.mesure.immeubles >= 1, 'mesure.immeubles');
  const m2 = creerMonde();
  while (m2.it < m.it) m2.iterer();
  assert.notEqual(m.empreinte(), m2.empreinte(), 'l’empreinte suit les immeubles');
  console.log('ok b : état, mesure, empreinte');
}
if (parts.has('c')) {
  const base = R.BASE[1], ids = grappe(1, base, 6, r.x, r.z), moy = () => ids.reduce((s, i) => s + dist(i), 0) / ids.length;
  const avant = moy();
  courir(IT_S * 5);
  const apres = moy();
  assert.ok(apres > avant + 0.3 && apres >= CI.recul - 0.5, 'ils s’écartent : ' + avant.toFixed(1) + ' → ' + apres.toFixed(1) + ' m');
  assert.ok(Array.from(ids).some(i => m.ucoh[i] < R.TYPES[base].coh * 1000), 'la chaleur coûte de la cohésion');
  console.log('ok c : on s’écarte d’une façade en feu');
}
if (parts.has('d')) {
  const ids = grappe(2, 13, 6, r.x, r.z);
  if (I.etat[k] !== 1) { m.allumerImmeuble(k, 0); courir(IT_S * 30); }
  m.soumettre(P.commande(P.CMD.ETEINDRE, 2, { ids, x: I.x[k], z: I.z[k] }));
  courir(2);
  assert.ok(Array.from(ids).every(i => m.uord[i] === m.O.CAPACITE || m.usal[i] > 0), 'ETEINDRE : ils y vont ou arrosent déjà');
  const n = courir(IT_S * 150, () => I.etat[k] !== 1);
  assert.equal(I.etat[k], 2, 'éteint (' + (n / IT_S).toFixed(0) + ' s)');
  assert.ok(vus.some(e => e.type === EV.IMMEUBLE_ETEINT && e.a === I.id[k] && e.f === 2 && e.b === 1), 'IMMEUBLE_ETEINT par la Préfecture');
  assert.ok(m.bilan()[2].immeublesSauves >= 1, 'bilan : immeublesSauves');
  console.log('ok d : six Pompiers l’éteignent en ' + (n / IT_S).toFixed(0) + ' s');
}
console.log('ok fumée 4');
