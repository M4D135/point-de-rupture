// Banc d'équilibre et de durée : des parties à trois IA, à 100 000 unités par défaut, sur Marseille et sur le damier.
// Pour chaque partie : vainqueur, raison et durée simulée ; scores, lieux, unités en jeu ; bilan de chaque camp
// (produites, hors jeu, coups, casses, barricades, cocktails, grenades, pierres, charges, mises à terre, feux) ;
// attrition (hors jeu rapportés aux unités engagées : départ + produites) ; compte des évènements et première
// itération de ceux du feu et de la violence (ce que la démo montre dès sa première minute) ; coût par itération.
// Avec --detail, une ligne par minute simulée : unités en jeu, hors-jeu, coups, cocktails, grenades, foyers et nuages
// au plus, unités à terre au plus, zones où l'on se bat et lieu le plus proche de la plus disputée.
//   node Jeu/verifications/equilibre.mjs [--villes marseille,damier] [--effectifs 100000] [--minutes 10]
//        [--graines 1] [--mode demo|dernier|temps|points|mixte] [--points 3000] [--duree 20]
//        [--manifestants peu|moyen|beaucoup] [--coalitions 1] [--difficulte 1] [--detail] [--src chemin/vers/Jeu/src]
//        [--json fichier]
// --mode demo (par défaut) : la partie de l'écran titre (joueur -1, coalitions) ; les autres : trois IA jouent une
// vraie partie dans ce mode de victoire (joueur 0 tenu par l'IA, sans brouillard). --minutes : arrêt du banc si la
// partie n'a pas fini. --src : les sources à charger (par défaut celles du dépôt), pour comparer deux versions.
// La simulation est déterministe : une même partie redonne les mêmes chiffres, quelle que soit la charge de la
// machine. Le coût est donné en temps de processeur du processus (insensible à la charge, ou presque) et en temps
// d'horloge. Ce n'est pas un test : rien n'échoue, les chiffres se lisent.
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
const MODE = option('mode', 'demo'), POINTS = Number(option('points', 3000)), DUREE = Number(option('duree', 20));
const MANIFESTANTS = option('manifestants', ''), COALITIONS = option('coalitions', '1') !== '0', DIFFICULTE = Number(option('difficulte', 1));
const DETAIL = args.includes('--detail');

const exiger = createRequire(import.meta.url);
for (const f of ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'villes/marseille.js', 'ville-reelle.js', 'sim/nav.js', 'sim/monde.js', 'sim/ia.js']) exiger(path.join(SRC, f));
const { regles: R, protocole: P, monde: M, ia: IA } = globalThis.PDR;
const NOM_EV = Object.fromEntries(Object.entries(P.EV).map(([k, v]) => [v, k]));
const IT_S = R.CONSTANTES.IT_PAR_S;
// Les évènements dont on relève la première apparition (ceux qui manquent à une version antérieure sont ignorés).
const SUIVIS = ['MOLOTOV', 'FEU_ALLUME', 'FEU_ETEINT', 'LACRYMO', 'GAZ', 'A_TERRE', 'CHARGE', 'PIERRE', 'SALVE', 'JET', 'CASSE', 'HORS_JEU'];
const CAMPS = ['Convergence', 'Bastion', 'Préfecture'];
const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };

function partie(nomVille, graine) {
  const t0 = performance.now();
  const ville = P.villeDe({ ville: nomVille, graine }, R.ilots(EFFECTIFS));
  const options = { graine, effectifs: EFFECTIFS, coalitions: COALITIONS, difficulte: DIFFICULTE, enregistrer: false, brouillard: false };
  if (MODE === 'demo') options.joueur = -1;
  else { options.joueur = 0; options.ia = [0, 1, 2]; options.victoire = { mode: MODE, points: POINTS, duree: DUREE }; }
  if (MANIFESTANTS) options.manifestants = MANIFESTANTS;
  const m = M.creer(ville, options);
  const ia = IA.creer(m);
  const tampon = new ArrayBuffer((P.CAPACITE + 4096) * 16);
  const iterations = Math.round(MINUTES * 60 * IT_S);
  const compte = {}, premier = {}, minutes = [];
  let feuxMax = 0, gazMax = 0, aTerreMax = 0, gisantsMax = 0;
  // Par minute : compteurs remis à zéro, zones 8 × 8 où un camp a été attaqué (évènement ATTAQUE_SUBIE).
  let mn = null;
  const e0 = ville.etendue, zoneDe = (x, z) => Math.max(0, Math.min(7, Math.floor((x - e0.x0) * 8 / (e0.x1 - e0.x0)))) + 8 * Math.max(0, Math.min(7, Math.floor((z - e0.z0) * 8 / (e0.z1 - e0.z0))));
  const nouvelleMinute = () => ({ horsJeu: [0, 0, 0], molotovs: 0, grenades: 0, casses: 0, chutes: 0, zones: new Map(), feux: 0, nuages: 0, aTerre: 0 });
  const lieuProche = (x, z) => { let b = null, d = Infinity; for (const l of ville.sites.lieux) { const e = (l.x - x) ** 2 + (l.z - z) ** 2; if (e < d) { d = e; b = l; } } return b ? b.nom : ''; };
  let coupsAvant = [0, 0, 0];
  const fermer = () => {
    const b = m.bilan(), coups = b.map(x => x.infliges);
    let pire = null;
    for (const [k, v] of mn.zones) if (!pire || v.n > pire.n) pire = { k, ...v };
    minutes.push({ minute: minutes.length + 1, vivantes: Array.from(m.vivantes), horsJeu: mn.horsJeu, coups: coups.map((c, f) => c - coupsAvant[f]),
      molotovs: mn.molotovs, grenades: mn.grenades, casses: mn.casses, chutes: mn.chutes, feux: mn.feux, nuages: mn.nuages, aTerre: mn.aTerre,
      zones: mn.zones.size, ou: pire ? lieuProche(pire.x, pire.z) : '', scores: Array.from(m.score) });
    coupsAvant = coups;
  };
  const cpu0 = cpuMs(), h0 = performance.now();
  mn = nouvelleMinute();
  for (let k = 0; k < iterations && m.vainqueur === P.VAINQUEUR.EN_COURS; k++) {
    m.iterer(); ia.penser();
    const ev = m.evenements();
    for (let o = 0; o < ev.length; o += P.EV_TAILLE) {
      const type = ev[o], nom = NOM_EV[type] || String(type);
      compte[nom] = (compte[nom] || 0) + 1;
      if (!(nom in premier)) premier[nom] = m.it;
      if (type === P.EV.HORS_JEU) { const f = ev[o + 3]; if (f >= 0 && f < 3) mn.horsJeu[f]++; }
      else if (type === P.EV.MOLOTOV) mn.molotovs++;
      else if (type === P.EV.LACRYMO) mn.grenades++;
      else if (type === P.EV.CASSE) mn.casses++;
      else if (type === P.EV.A_TERRE) mn.chutes++;
      else if (type === P.EV.ATTAQUE_SUBIE) {
        const z = zoneDe(ev[o + 1], ev[o + 2]), v = mn.zones.get(z);
        if (v) v.n++; else mn.zones.set(z, { n: 1, x: ev[o + 1], z: ev[o + 2] });
      }
    }
    if (k % IT_S === IT_S - 1) {
      // Une fois par seconde : les foyers, les nuages, les gisants (lus sur le monde) ; l'état complet toutes les 5 s.
      if (m.nFeux !== undefined) { mn.feux = Math.max(mn.feux, m.nFeux); mn.nuages = Math.max(mn.nuages, m.nNuages); gisantsMax = Math.max(gisantsMax, m.nGisants); }
      if (k % (5 * IT_S) === IT_S - 1) {
        const e = m.etat(tampon, 1);
        if (e.mesure && e.mesure.aTerre !== undefined) mn.aTerre = Math.max(mn.aTerre, e.mesure.aTerre);
      }
      feuxMax = Math.max(feuxMax, mn.feux); gazMax = Math.max(gazMax, mn.nuages); aTerreMax = Math.max(aTerreMax, mn.aTerre);
    }
    if ((k + 1) % (60 * IT_S) === 0) { fermer(); mn = nouvelleMinute(); }
  }
  const cpu = cpuMs() - cpu0, horloge = performance.now() - h0;
  if (m.it % (60 * IT_S) !== 0) fermer();
  const bilan = m.bilan();
  const attrition = [0, 1, 2].map(f => +(bilan[f].horsJeu / Math.max(1, m.depart[f] + bilan[f].produites)).toFixed(3));
  return {
    ville: ville.nom, graine, effectifs: EFFECTIFS, mode: MODE, manifestants: m.options.manifestants || 'beaucoup', iterations: m.it,
    minutesSimulees: +(m.it / IT_S / 60).toFixed(2), secondes: +((performance.now() - t0) / 1000).toFixed(1),
    msCpu: +(cpu / Math.max(1, m.it)).toFixed(2), msHorloge: +(horloge / Math.max(1, m.it)).toFixed(2),
    vainqueur: m.vainqueur, raison: m.raison === undefined ? '' : m.raison, elimines: Array.from(m.elimine), alliance: m.alliance,
    scores: Array.from(m.score), lieux: Array.from(m.lieuProp), vivantes: Array.from(m.vivantes),
    depart: Array.from(m.depart), ressources: [0, 1, 2].map(f => [Math.floor(m.res[f * 2] / 1000), Math.floor(m.res[f * 2 + 1] / 1000)]),
    bilan, attrition, compte, premier: Object.fromEntries(SUIVIS.filter(n => n in premier).map(n => [n, premier[n]])),
    feuxMax, gazMax, aTerreMax, gisantsMax, minutes, empreinte: m.empreinte(),
  };
}

console.log(`equilibre : ${SRC}`);
console.log(`Node ${process.version}, ${os.cpus().length} cœurs, charge ${os.loadavg().map(v => v.toFixed(1)).join(' / ')} ; ${EFFECTIFS} unités, mode ${MODE}`
  + `${MODE === 'points' || MODE === 'mixte' ? ' ' + POINTS + ' points' : ''}${MODE === 'temps' || MODE === 'mixte' ? ' ' + DUREE + ' min' : ''}, ${MINUTES} min simulées au plus`);
const resultats = [];
const nomVainqueur = r => (r.vainqueur < 0 ? 'en cours' : r.vainqueur === 3 ? 'alliance ' + (r.alliance || []).map(f => CAMPS[f]).join(' + ') : r.vainqueur === 4 ? 'nul' : CAMPS[r.vainqueur]);
for (const v of VILLES) for (const g of GRAINES) {
  const r = partie(v, g);
  resultats.push(r);
  console.log(`\n${r.ville}, graine ${g}, manifestants ${r.manifestants} : ${r.minutesSimulees} min simulées (${r.iterations} itérations) en ${r.secondes} s, `
    + `${r.msCpu} ms de processeur par itération (${r.msHorloge} ms d'horloge) ; vainqueur : ${nomVainqueur(r)}${r.raison ? ' (' + r.raison + ')' : ''} ; empreinte ${r.empreinte}`);
  for (let f = 0; f < 3; f++) {
    const b = r.bilan[f];
    console.log(`  ${CAMPS[f].padEnd(12)}${r.elimines[f] ? ' ÉLIMINÉ' : ''} score ${String(r.scores[f]).padStart(5)}  lieux ${r.lieux.filter(p => p === f).length}  en jeu ${String(r.vivantes[f]).padStart(6)} / départ ${r.depart[f]}`
      + `  produites ${b.produites}  hors jeu ${b.horsJeu} (attrition ${(r.attrition[f] * 100).toFixed(1)} %)  coups ${b.infliges}  casses ${b.casses}`
      + `  barricades ${b.barricadesPosees}/${b.barricadesLevees}`
      + (b.molotovs === undefined ? '' : `  cocktails ${b.molotovs}  grenades ${b.grenades}  pierres ${b.pierres}  charges ${b.charges}  mises à terre ${b.aTerre}  feux ${b.feux}  éteints ${b.eteints}`)
      + `  ressources ${r.ressources[f].join(' / ')}`);
    if (b.sources) console.log(`               coups par origine : ${b.sources.map((v, k) => (P.SOURCES_COUPS[k] || k) + ' ' + v).join(', ')}`);
  }
  console.log('  évènements : ' + Object.entries(r.compte).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, n]) => `${k} ${n}`).join(', '));
  console.log('  premières itérations : ' + Object.entries(r.premier).map(([k, it]) => `${k} ${it} (${(it / IT_S).toFixed(1)} s)`).join(', '));
  console.log(`  au plus : ${r.feuxMax} foyers, ${r.gazMax} nuages, ${r.aTerreMax} unités à terre (relevé toutes les 5 s), ${r.gisantsMax} gisants`);
  if (DETAIL) {
    console.log('  min   en jeu C / B / P          hors jeu C / B / P     coups C / B / P (milliers)  cockt. gren. casses foyers nuages à terre zones  où');
    for (const x of r.minutes) {
      console.log(`  ${String(x.minute).padStart(3)}   ${x.vivantes.map(n => String(n).padStart(6)).join(' ')}   ${x.horsJeu.map(n => String(n).padStart(6)).join(' ')}   `
        + `${x.coups.map(n => String(Math.round(n / 1000)).padStart(6)).join(' ')}      ${String(x.molotovs).padStart(5)} ${String(x.grenades).padStart(5)} ${String(x.casses).padStart(6)} `
        + `${String(x.feux).padStart(6)} ${String(x.nuages).padStart(6)} ${String(x.aTerre).padStart(7)} ${String(x.zones).padStart(5)}  ${x.ou}`);
    }
  }
}
console.log(`\ncharge à la fin : ${os.loadavg().map(v => v.toFixed(1)).join(' / ')}`);
if (JSON_SORTIE) fs.writeFileSync(JSON_SORTIE, JSON.stringify({ src: SRC, effectifs: EFFECTIFS, mode: MODE, minutes: MINUTES, resultats }, null, 1));
console.log('JSON ' + JSON.stringify(resultats.map(r => ({ ville: r.ville, graine: r.graine, minutes: r.minutesSimulees, vainqueur: r.vainqueur, raison: r.raison,
  scores: r.scores, vivantes: r.vivantes, attrition: r.attrition, msCpu: r.msCpu }))));
