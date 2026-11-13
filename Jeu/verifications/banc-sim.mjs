// Banc de la simulation : millisecondes par itération à 100 000 et 200 000 unités, sur 200 itérations mesurées
// après une chauffe, moyenne et 95e centile, avec les trois IA et sans IA (foule au repos).
//   node Jeu/verifications/banc-sim.mjs [--effectifs 100000,200000] [--essais 3] [--chauffe 1200] [--mesure 200]
//                                       [--graine 1] [--detail] [--ville damier|marseille] [--src chemin/vers/Jeu/src]
// --ville : le damier de la graine (par défaut) ou le plan réel de Marseille ; --src : les sources à charger (par
// défaut celles du dépôt), pour comparer deux versions dans les mêmes conditions, l'une après l'autre.
// La simulation est déterministe : chaque essai refait exactement le même travail (même graine, mêmes ordres d'IA ;
// l'empreinte finale le prouve). La machine pouvant être chargée, le banc garde l'essai de plus faible moyenne et
// donne aussi la moyenne médiane des essais. Critère (CONCEPTION.md §4) : 25 ms au plus en moyenne à 100 000.
// Les scripts sont chargés dans le contexte principal de Node (un contexte vm.createContext ralentit chaque accès
// global de 2 à 6 fois et fausserait la mesure).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const ici = path.dirname(fileURLToPath(import.meta.url));
const exiger = createRequire(import.meta.url);
const args = process.argv.slice(2);
const option = (nom, defaut) => { const k = args.indexOf('--' + nom); return k >= 0 && args[k + 1] && !args[k + 1].startsWith('--') ? args[k + 1] : defaut; };
const SRC = path.resolve(option('src', path.join(ici, '..', 'src'))), VILLE = option('ville', 'damier');
for (const f of ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'villes/marseille.js', 'ville-reelle.js', 'sim/nav.js', 'sim/immeubles.js', 'sim/monde.js', 'sim/ia.js']) exiger(path.join(SRC, f));
const { regles: R, protocole: P, monde: M, ia: IA } = globalThis.PDR;

const EFFECTIFS = option('effectifs', '100000,200000').split(',').map(Number);
const ESSAIS = Number(option('essais', 3)), CHAUFFE = Number(option('chauffe', 1200)), MESURE = Number(option('mesure', 200));
const GRAINE = Number(option('graine', 1)), DETAIL = args.includes('--detail');
const OBJECTIF_MS = 25;

const statistiques = valeurs => {
  const t = Float64Array.from(valeurs).sort();
  let s = 0;
  for (const v of t) s += v;
  return { moyenne: s / t.length, p95: t[Math.max(0, Math.ceil(t.length * 0.95) - 1)], max: t[t.length - 1] };
};
const ms = v => v.toFixed(2).padStart(6);

/** Un essai : crée le monde, chauffe, mesure. Rend les temps par itération (sim, IA, état) et l'empreinte finale. */
function essai(villeE, E, avecIA) {
  const t0 = performance.now();
  const m = M.creer(villeE, { graine: GRAINE, effectifs: E, joueur: -1 });
  const ia = avecIA ? IA.creer(m) : null;
  const creation = performance.now() - t0;
  const tampon = new ArrayBuffer((P.CAPACITE + 4096) * 16);
  const total = CHAUFFE + MESURE;
  const sim = new Float64Array(total), pense = new Float64Array(total), etat = new Float64Array(total);
  for (let k = 0; k < total; k++) {
    const a = performance.now();
    m.iterer();
    const b = performance.now();
    if (ia) ia.penser();
    const c = performance.now();
    m.etat(tampon, 1);
    const d = performance.now();
    sim[k] = b - a; pense[k] = c - b; etat[k] = d - c;
  }
  const fen = x => Array.from(x.subarray(CHAUFFE));
  return {
    creation, empreinte: m.empreinte(), it: m.it, vivantes: Array.from(m.vivantes), champs: m.nav.champs.length,
    sim: statistiques(fen(sim)), ia: statistiques(fen(pense)), etat: statistiques(fen(etat)),
    total: statistiques(fen(sim).map((v, k) => v + pense[CHAUFFE + k] + etat[CHAUFFE + k])),
    fenetres: DETAIL ? Array.from({ length: Math.ceil(total / 200) }, (_, w) => statistiques(Array.from(sim.subarray(w * 200, Math.min(total, w * 200 + 200)))).moyenne) : null,
  };
}

console.log(`banc-sim : ${SRC}, ville ${VILLE}`);
console.log(`Node ${process.version}, ${os.cpus()[0].model}, ${os.cpus().length} cœurs, charge ${os.loadavg().map(v => v.toFixed(1)).join(' / ')}`);
console.log(`chauffe ${CHAUFFE} itérations, mesure ${MESURE}, ${ESSAIS} essais par cas, graine ${GRAINE} ; temps en ms par itération\n`);
const bilan = [];
let echec = false;
for (const E of EFFECTIFS) {
  const tv = performance.now();
  const villeE = P.villeDe({ ville: VILLE, graine: GRAINE }, R.ilots(E));
  const msVille = performance.now() - tv;
  for (const avecIA of [false, true]) {
    const essais = [];
    for (let k = 0; k < ESSAIS; k++) essais.push(essai(villeE, E, avecIA));
    const empreintes = new Set(essais.map(e => e.empreinte));
    if (empreintes.size !== 1) { console.log('  ÉCHEC : les essais ne refont pas le même travail', [...empreintes]); echec = true; }
    const tries = essais.slice().sort((a, b) => a.total.moyenne - b.total.moyenne);
    const meilleur = tries[0], median = tries[(tries.length - 1) >> 1];
    const cas = avecIA ? 'trois IA' : 'sans IA, au repos';
    console.log(`${E} unités (${R.ilots(E)} îlots, ville ${msVille.toFixed(0)} ms, monde ${meilleur.creation.toFixed(0)} ms), ${cas}, itérations ${CHAUFFE}–${meilleur.it} :`);
    console.log(`               moyenne    p95    max`);
    console.log(`  pas       ${ms(meilleur.sim.moyenne)} ${ms(meilleur.sim.p95)} ${ms(meilleur.sim.max)}`);
    if (avecIA) console.log(`  IA        ${ms(meilleur.ia.moyenne)} ${ms(meilleur.ia.p95)} ${ms(meilleur.ia.max)}`);
    console.log(`  état      ${ms(meilleur.etat.moyenne)} ${ms(meilleur.etat.p95)} ${ms(meilleur.etat.max)}`);
    console.log(`  total     ${ms(meilleur.total.moyenne)} ${ms(meilleur.total.p95)} ${ms(meilleur.total.max)}   (essais : ${essais.map(e => e.total.moyenne.toFixed(2)).join(', ')} ; médiane ${median.total.moyenne.toFixed(2)})`);
    console.log(`  vivantes ${meilleur.vivantes.join(' / ')}, champs en cache ${meilleur.champs}, empreinte ${meilleur.empreinte}`);
    if (meilleur.fenetres) console.log(`  pas moyen par fenêtre de 200 : ${meilleur.fenetres.map(v => v.toFixed(1)).join(' ')}`);
    console.log('');
    bilan.push({ effectifs: E, ia: avecIA, moyenne: +meilleur.total.moyenne.toFixed(3), p95: +meilleur.total.p95.toFixed(3),
      pas: +meilleur.sim.moyenne.toFixed(3), msIA: +meilleur.ia.moyenne.toFixed(3), etat: +meilleur.etat.moyenne.toFixed(3) });
    if (E === 100000 && meilleur.total.moyenne > OBJECTIF_MS) echec = true;
  }
}
const cent = bilan.filter(b => b.effectifs === 100000);
if (cent.length) {
  const pire = Math.max(...cent.map(b => b.moyenne));
  console.log(`objectif : ${OBJECTIF_MS} ms au plus en moyenne à 100 000 unités : ${pire <= OBJECTIF_MS ? 'tenu' : 'MANQUÉ'} (${pire.toFixed(2)} ms, pire des cas)`);
}
console.log(`charge à la fin : ${os.loadavg().map(v => v.toFixed(1)).join(' / ')}`);
console.log('JSON ' + JSON.stringify(bilan));
process.exitCode = echec ? 1 : 0;
