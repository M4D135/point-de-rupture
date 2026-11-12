// Banc d'équilibre : des parties à trois IA, comme la démo (joueur -1, coalitions, difficulté Normale), de 10 minutes
// simulées par défaut, à 100 000 unités, sur Marseille et sur le damier. Pour chaque partie : scores, lieux tenus,
// unités en jeu, bilan de chaque camp (produites, hors jeu, coups portés, casses, barricades), attrition (hors jeu
// rapportés aux unités engagées : départ + produites), compte des évènements et première itération des évènements
// du feu et de la violence (Molotov, feux, gaz, mises à terre), pour voir ce que la démo montre dès la première minute.
//   node Jeu/verifications/equilibre.mjs [--villes marseille,damier] [--effectifs 100000] [--minutes 10]
//                                        [--graines 1] [--src chemin/vers/Jeu/src] [--json fichier]
// --src : les sources à charger (par défaut celles du dépôt) ; sert à comparer avec une version antérieure, dans un
// autre processus. La simulation est déterministe : une même partie redonne les mêmes chiffres, quelle que soit la
// charge de la machine (seule la durée change). Ce n'est pas un test : rien n'échoue, les chiffres se lisent.
// Rappel (CONTRE-EXPERTISE.md §6.6) : des parties IA contre IA mesurent l'IA, pas l'équilibre ; elles servent à voir
// les dérives, les blocages et les camps qui s'effondrent.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const ici = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (nom, defaut) => { const k = args.indexOf('--' + nom); return k >= 0 && args[k + 1] && !args[k + 1].startsWith('--') ? args[k + 1] : defaut; };
const SRC = path.resolve(option('src', path.join(ici, '..', 'src')));
const VILLES = option('villes', 'marseille,damier').split(',');
const EFFECTIFS = Number(option('effectifs', 100000)), MINUTES = Number(option('minutes', 10));
const GRAINES = option('graines', '1').split(',').map(Number), JSON_SORTIE = option('json', '');

const exiger = createRequire(import.meta.url);
for (const f of ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'villes/marseille.js', 'ville-reelle.js', 'sim/nav.js', 'sim/monde.js', 'sim/ia.js']) exiger(path.join(SRC, f));
const { regles: R, protocole: P, monde: M, ia: IA } = globalThis.PDR;
const NOM_EV = Object.fromEntries(Object.entries(P.EV).map(([k, v]) => [v, k]));
// Les évènements dont on relève la première apparition (ceux qui manquent à une version antérieure sont ignorés).
const SUIVIS = ['MOLOTOV', 'FEU_ALLUME', 'FEU_ETEINT', 'LACRYMO', 'GAZ', 'A_TERRE', 'CHARGE', 'SALVE', 'JET', 'CASSE', 'HORS_JEU'];

function partie(nomVille, graine) {
  const t0 = performance.now();
  const ville = P.villeDe({ ville: nomVille, graine }, R.ilots(EFFECTIFS));
  const m = M.creer(ville, { graine, effectifs: EFFECTIFS, joueur: -1, coalitions: true, difficulte: 1, enregistrer: false });
  const ia = IA.creer(m);
  const tampon = new ArrayBuffer((P.CAPACITE + 4096) * 16);
  const iterations = Math.round(MINUTES * 60 * R.CONSTANTES.IT_PAR_S);
  const compte = {}, premier = {};
  let feuxMax = 0, gazMax = 0, aTerreMax = 0;
  for (let k = 0; k < iterations && m.vainqueur === P.VAINQUEUR.EN_COURS; k++) {
    m.iterer(); ia.penser();
    const ev = m.evenements();
    for (let o = 0; o < ev.length; o += P.EV_TAILLE) {
      const nom = NOM_EV[ev[o]] || String(ev[o]);
      compte[nom] = (compte[nom] || 0) + 1;
      if (!(nom in premier)) premier[nom] = m.it;
    }
    if (k % 20 === 0) {
      // L'état complet une fois par seconde : les listes de feux et de nuages (si la version en a), les unités à terre.
      const e = m.etat(tampon, 1);
      if (e.feux) feuxMax = Math.max(feuxMax, e.feux.length / (P.FEU_TAILLE || 1));
      if (e.nuages) gazMax = Math.max(gazMax, e.nuages.length / (P.NUAGE_TAILLE || 1));
      if (R.ETATS.A_TERRE !== undefined) {
        const f32 = new Float32Array(tampon, 0, e.n * 4);
        let a = 0;
        for (let i = 0; i < e.n; i++) if (R.codeEtat(f32[i * 4 + 3]) === R.ETATS.A_TERRE && R.codeFaction(f32[i * 4 + 3]) < 3) a++;
        aTerreMax = Math.max(aTerreMax, a);
      }
    }
  }
  const bilan = m.bilan();
  const attrition = [0, 1, 2].map(f => +(bilan[f].horsJeu / Math.max(1, m.depart[f] + bilan[f].produites)).toFixed(3));
  return {
    ville: ville.nom, graine, effectifs: EFFECTIFS, iterations: m.it, secondes: +((performance.now() - t0) / 1000).toFixed(1),
    vainqueur: m.vainqueur, scores: Array.from(m.score), lieux: Array.from(m.lieuProp), vivantes: Array.from(m.vivantes),
    depart: Array.from(m.depart), ressources: [0, 1, 2].map(f => [Math.floor(m.res[f * 2] / 1000), Math.floor(m.res[f * 2 + 1] / 1000)]),
    bilan, attrition, compte, premier: Object.fromEntries(SUIVIS.filter(n => n in premier).map(n => [n, premier[n]])),
    feuxMax, gazMax, aTerreMax, empreinte: m.empreinte(),
  };
}

console.log(`equilibre : ${SRC}`);
console.log(`Node ${process.version}, ${os.cpus().length} cœurs, charge ${os.loadavg().map(v => v.toFixed(1)).join(' / ')} ; ${EFFECTIFS} unités, ${MINUTES} min simulées`);
const resultats = [];
for (const v of VILLES) for (const g of GRAINES) {
  const r = partie(v, g);
  resultats.push(r);
  const camps = ['Convergence', 'Bastion', 'Préfecture'];
  console.log(`\n${r.ville}, graine ${g} : ${r.iterations} itérations en ${r.secondes} s, vainqueur ${r.vainqueur}, empreinte ${r.empreinte}`);
  for (let f = 0; f < 3; f++) {
    const b = r.bilan[f];
    console.log(`  ${camps[f].padEnd(12)} score ${String(r.scores[f]).padStart(5)}  lieux ${r.lieux.filter(p => p === f).length}  en jeu ${String(r.vivantes[f]).padStart(6)} / départ ${r.depart[f]}`
      + `  produites ${b.produites}  hors jeu ${b.horsJeu} (attrition ${(r.attrition[f] * 100).toFixed(1)} %)  coups ${b.infliges}  casses ${b.casses}`
      + `  barricades ${b.barricadesPosees}/${b.barricadesLevees}  ressources ${r.ressources[f].join(' / ')}`);
  }
  console.log('  évènements : ' + Object.entries(r.compte).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, n]) => `${k} ${n}`).join(', '));
  console.log('  premières itérations : ' + Object.entries(r.premier).map(([k, it]) => `${k} ${it} (${(it / 20).toFixed(1)} s)`).join(', '));
  console.log(`  au plus : ${r.feuxMax} feux, ${r.gazMax} nuages, ${r.aTerreMax} unités à terre (relevés une fois par seconde)`);
}
console.log(`\ncharge à la fin : ${os.loadavg().map(v => v.toFixed(1)).join(' / ')}`);
if (JSON_SORTIE) fs.writeFileSync(JSON_SORTIE, JSON.stringify({ src: SRC, effectifs: EFFECTIFS, minutes: MINUTES, resultats }, null, 1));
console.log('JSON ' + JSON.stringify(resultats.map(r => ({ ville: r.ville, graine: r.graine, scores: r.scores, vivantes: r.vivantes, attrition: r.attrition, vainqueur: r.vainqueur }))));
