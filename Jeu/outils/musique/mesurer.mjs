// Mesures d'un fichier musique.js : rendu hors ligne de chaque section avec les règles du lecteur, niveaux, équilibre
// spectral, densité rythmique, silences, contraste, coût du préchauffage.
//   node mesurer.mjs <musique.js> [--json fichier] [--wav dossier] [--cle titre] [--bref]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { charger, decoder, rendre, spectre, equilibre, niveaux, rmsParTranche, attaques, ecrireWav, BANDES } from './rendu.mjs';

const args = process.argv.slice(2), fichier = args[0];
const option = nom => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };
const drapeau = nom => args.includes(nom);
const TAUX = 44100;
const f1 = x => (Number.isFinite(x) ? x.toFixed(1) : String(x)), f2 = x => x.toFixed(2), pc = x => (100 * x).toFixed(1);

// ---- Coût du préchauffage : contexte neuf, les quatre modules à la suite (les instruments partagés une fois). ----
// Temps processeur (process.cpuUsage), insensible à la charge des autres programmes ; meilleure et médiane de N passes.
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
function couts(repetitions = 7) {
  const totaux = [], parCle = {};
  for (let r = 0; r < repetitions; r++) {
    const M = charger(fichier);
    let total = 0;
    for (const cle of M.CLES) {
      const t = cpu(); M.module(cle); const ms = cpu() - t;
      (parCle[cle] = parCle[cle] || []).push(ms); total += ms;
    }
    totaux.push(total);
  }
  const mediane = l => l.slice().sort((a, b) => a - b)[l.length >> 1];
  return { total: { min: Math.min(...totaux), mediane: mediane(totaux) }, parCle: Object.fromEntries(Object.entries(parCle).map(([k, l]) => [k, { min: Math.min(...l), mediane: mediane(l) }])) };
}

const M = charger(fichier);
const resultat = { fichier, charge: os.loadavg().map(x => +x.toFixed(2)), morceaux: {} };
const cles = option('--cle') ? [option('--cle')] : M.CLES;
const dossierWav = option('--wav');
if (dossierWav) fs.mkdirSync(dossierWav, { recursive: true });

for (const cle of cles) {
  const o = M.module(cle), mod = decoder(o), info = M.morceau(cle), L = mod.ordre.length / 2;
  const morceau = { titre: info.titre, bpm: info.bpm, octets: o.length, motifs: mod.nbMotifs, ordre: mod.ordre,
    echantillons: mod.echantillons.filter(e => e.n).map(e => ({ nom: e.nom, octets: e.n, volume: e.volume })), sections: {} };
  // Écrêtage du PCM lui-même (8 bits signés) : les échantillons sont normalisés à 0,86 ou 0,9, donc jamais au bord.
  let pcmMax = 0, pcmAuBord = 0;
  for (const e of mod.echantillons) for (let i = 0; i < e.n; i++) {
    const v = Math.round(e.pcm[i] * 128);
    if (Math.abs(v) > pcmMax) pcmMax = Math.abs(v);
    if (Math.abs(v) >= 127) pcmAuBord++;
  }
  morceau.pcmMax = pcmMax; morceau.pcmAuBord = pcmAuBord;
  for (const [nom, positions, I] of [['calme', Array.from({ length: L }, (_, k) => k), 0], ['tendue', Array.from({ length: L }, (_, k) => L + k), 1]]) {
    const r = rendre(mod, positions, I, TAUX);
    const niv = niveaux(r.g, r.d, TAUX), eq = equilibre(spectre(r.g, r.d, TAUX)), att = attaques(r.g, r.d, TAUX);
    const dureeMotif = r.dureeRangee * 64, dureeMesure = r.dureeRangee * 16;
    const parCanal = [0, 1, 2, 3].map(c => r.notes.filter(n => n.canal === c).length);
    // Le plus long intervalle sans attaque détectée, et le plus long sans note écrite (toutes pistes).
    let trouAttaques = 0, prec = 0;
    for (const t of att.concat([r.duree])) { trouAttaques = Math.max(trouAttaques, t - prec); prec = t; }
    morceau.sections[nom] = {
      duree: r.duree, crete: niv.crete, creteDb: niv.creteDb, rmsDb: niv.rmsDb, facteurCrete: niv.facteurCrete,
      continu: Math.max(Math.abs(niv.continuG), Math.abs(niv.continuD)), silenceMax: niv.silenceMax, partSilence: niv.partSilence, rmsMinDb: niv.rmsMinDb,
      ecretes: niv.ecretes, partEcretee: niv.partEcretee,
      rmsParMotif: rmsParTranche(r.g, r.d, TAUX, dureeMotif).slice(0, L), rmsParMesure: rmsParTranche(r.g, r.d, TAUX, dureeMesure).slice(0, L * 4),
      bandes: eq.bandes, bandesA: eq.bandesA, centroide: eq.centroide, centroideA: eq.centroideA, mediane: eq.mediane, r85: eq.r85,
      grave: eq.grave, aigu: eq.aigu, graveA: eq.graveA, aiguA: eq.aiguA,
      attaquesParSeconde: att.length / r.duree, attaquesParMesure: att.length / (L * 4), trouAttaques,
      notesEcrites: r.notes.length, notesParCanal: parCanal, notesParSeconde: r.notes.length / r.duree,
    };
    if (dossierWav) ecrireWav(path.join(dossierWav, cle + '-' + nom + '.wav'), r.g, r.d, TAUX, 0.45);
  }
  resultat.morceaux[cle] = morceau;
}
if (!drapeau('--sans-cout')) resultat.prechauffage = couts();

if (option('--json')) fs.writeFileSync(option('--json'), JSON.stringify(resultat, null, 1));

console.log('fichier : ' + fichier + '   charge : ' + resultat.charge.join(' '));
if (resultat.prechauffage) {
  const p = resultat.prechauffage;
  console.log('préchauffage (4 modules, contexte neuf, temps processeur, 7 passes) : min ' + f1(p.total.min) + ' ms, médiane ' + f1(p.total.mediane) + ' ms ; '
    + Object.entries(p.parCle).map(([k, v]) => k + ' ' + f1(v.min)).join(', '));
}
for (const [cle, m] of Object.entries(resultat.morceaux)) {
  console.log('\n== ' + cle + ' « ' + m.titre + ' » ' + m.bpm + ' BPM, ' + m.octets + ' octets, ' + m.motifs + ' motifs, ' + m.echantillons.length + ' échantillons'
    + ' ; PCM max ' + m.pcmMax + '/127, au bord ' + m.pcmAuBord);
  if (!drapeau('--bref')) console.log('   ' + m.echantillons.map(e => e.nom.replace(/^PDR /, '') + ' ' + e.octets).join(' | '));
  for (const [nom, s] of Object.entries(m.sections)) {
    console.log('  ' + nom.padEnd(7) + ' durée ' + f1(s.duree) + ' s  crête ' + f2(s.crete) + ' (' + f1(s.creteDb) + ' dB)  RMS ' + f1(s.rmsDb) + ' dB  fact. crête ' + f1(s.facteurCrete)
      + ' dB  continu ' + s.continu.toExponential(1) + '  silence max ' + f2(s.silenceMax) + ' s (' + pc(s.partSilence) + ' %)  RMS min 50 ms ' + f1(s.rmsMinDb)
      + ' dB  écrêtés ' + s.ecretes + ' (' + pc(s.partEcretee) + ' %)');
    console.log('          bandes % ' + BANDES.slice(0, -1).map((b, i) => (b >= 1000 ? b / 1000 + 'k' : b) + ':' + pc(s.bandes[i])).join(' ')
      + '  | grave<250 ' + pc(s.grave) + ' %  aigu>2k ' + pc(s.aigu) + ' %  centroïde ' + f1(s.centroide) + ' Hz  médiane ' + f1(s.mediane) + '  85 % ' + f1(s.r85));
    console.log('          pondéré A ' + BANDES.slice(0, -1).map((b, i) => (b >= 1000 ? b / 1000 + 'k' : b) + ':' + pc(s.bandesA[i])).join(' ')
      + '  | grave ' + pc(s.graveA) + ' %  aigu ' + pc(s.aiguA) + ' %  centroïde A ' + f1(s.centroideA) + ' Hz');
    console.log('          attaques ' + f2(s.attaquesParSeconde) + '/s (' + f1(s.attaquesParMesure) + '/mesure), plus long trou ' + f2(s.trouAttaques) + ' s ; notes écrites ' + s.notesEcrites
      + ' (' + s.notesParCanal.join('/') + '), ' + f2(s.notesParSeconde) + '/s ; RMS par motif ' + s.rmsParMotif.map(f1).join(' '));
    if (drapeau('--mesures')) console.log('          RMS par mesure ' + s.rmsParMesure.map(x => x.toFixed(0)).join(' '));
  }
  const c = m.sections.calme, t = m.sections.tendue;
  console.log('  contraste tendue − calme : RMS ' + f1(t.rmsDb - c.rmsDb) + ' dB, attaques ×' + f2(t.attaquesParSeconde / (c.attaquesParSeconde || 1)) + ', centroïde A ' + f1(t.centroideA - c.centroideA) + ' Hz');
}
