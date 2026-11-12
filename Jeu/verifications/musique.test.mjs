// Musique ProTracker calculée (moteur/musique.js) : structure « M.K. » de chaque morceau, échantillons signés et
// bipolaires, octets identiques d'un chargement à l'autre, tempos, sections calme et tendue, lecteur sur un faux
// contexte WebAudio (voix bornées, bascule selon l'intensité, pause, recalage), préchauffage sans périphérique.
//   node Jeu/verifications/musique.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const CODE = fs.readFileSync(path.join(ICI, '../src/moteur/musique.js'), 'utf8');

let ok = 0;
const verifier = async (nom, f) => { await f(); ok++; console.log('ok  ' + nom); };

/** Un contexte neuf : musique.js chargé seul, minuteries du vrai Node, pas d'AudioContext. */
function charger(extra = {}) {
  const scope = vm.createContext({ setTimeout, clearTimeout, ...extra });
  vm.runInContext(CODE, scope, { filename: 'musique.js' });
  return scope.PDR.musique;
}
const M = charger();
const empreinte = o => crypto.createHash('sha256').update(o).digest('hex');
const PERIODES = new Set(M.PERIODES);

/** Relit un module « M.K. » octet par octet (comme checks/music.test.mjs de FERRO) et vérifie chaque champ. */
function relire(o) {
  assert.equal(Buffer.from(o.subarray(1080, 1084)).toString('latin1'), 'M.K.', 'signature');
  const longueur = o[950];
  assert.ok(longueur > 1 && longueur <= 128, 'longueur de la chanson');
  assert.equal(o[951], 127, 'octet de reprise');
  const ordre = Array.from(o.subarray(952, 952 + longueur));
  for (let i = longueur; i < 128; i++) assert.equal(o[952 + i], 0, 'ordre au-delà de la longueur : zéros');
  const motifs = Math.max(...ordre) + 1;
  for (let m = 0; m < motifs; m++) assert.ok(ordre.includes(m), 'chaque motif écrit est joué');
  let at = 1084 + motifs * 1024;
  const echantillons = [];
  for (let i = 0; i < 31; i++) {
    const h = 20 + i * 30, nom = Buffer.from(o.subarray(h, h + 22)).toString('latin1').replace(/\0+$/, '');
    assert.match(nom, /^[\x20-\x7e]*$/, 'nom ASCII');
    const n = ((o[h + 22] << 8) | o[h + 23]) * 2, finetune = o[h + 24], volume = o[h + 25];
    const reprise = (o[h + 26] << 8) | o[h + 27], boucle = (o[h + 28] << 8) | o[h + 29];
    assert.ok(n <= 65536, 'longueur d’échantillon');
    assert.equal(finetune, 0); assert.ok(volume <= 64); assert.equal(reprise, 0); assert.equal(boucle, 1, 'sans boucle');
    const pcm = new Int8Array(o.buffer, o.byteOffset + at, n);
    if (n) {
      assert.equal(pcm[0], 0); assert.equal(pcm[1], 0, 'deux premiers octets nuls (ProTracker)');
      let haut = 0, bas = 0, somme = 0;
      for (let k = 0; k < n; k++) { if (pcm[k] > haut) haut = pcm[k]; if (pcm[k] < bas) bas = pcm[k]; somme += pcm[k]; }
      assert.ok(haut > 20 && bas < -20, nom + ' : PCM bipolaire (' + bas + '..' + haut + ')');
      assert.ok(Math.abs(somme / n) < 2.5, nom + ' : sans composante continue (' + (somme / n).toFixed(2) + ')');
      assert.ok(volume > 0, nom + ' : volume');
    }
    echantillons.push({ nom, n, volume });
    at += n;
  }
  assert.equal(at, o.length, 'chaque octet est compté');
  let notes = 0, tempo = 0, vitesse = 0;
  for (let m = 0; m < motifs; m++) for (let r = 0; r < 64; r++) for (let c = 0; c < 4; c++) {
    const k = 1084 + m * 1024 + r * 16 + c * 4, a = o[k], b = o[k + 1], cc = o[k + 2], p = o[k + 3];
    const ech = (a & 0xf0) | (cc >> 4), periode = ((a & 15) << 8) | b, effet = cc & 15;
    if (periode) { assert.ok(PERIODES.has(periode), 'période de la table : ' + periode); notes++; }
    if (ech) assert.ok(ech <= 31 && echantillons[ech - 1].n > 0, 'échantillon joué non vide');
    assert.ok(effet === 0 || effet === 12 || effet === 15, 'effets C et F seulement : ' + effet);
    if (effet === 12) assert.ok(p <= 64);
    if (effet === 15) { assert.equal(c, 3, 'tempo sur le canal de la batterie'); if (p < 32) vitesse = vitesse || p; else tempo = tempo || p; }
    if (effet === 0) assert.equal(p, 0, 'pas de paramètre sans effet');
  }
  return { ordre, motifs, echantillons, notes, tempo, vitesse };
}

const TEMPOS = { titre: 108, convergence: 132, bastion: 92, prefecture: 120 };
const lus = {};
for (const cle of M.CLES) {
  await verifier(`« ${cle} » : module M.K. bien formé, PCM bipolaire, tempo ${TEMPOS[cle]}`, () => {
    const o = M.module(cle), r = relire(o);
    lus[cle] = { r, o };
    assert.equal(r.tempo, TEMPOS[cle]); assert.equal(r.vitesse, 6);
    assert.equal(r.ordre.length, 12, 'six motifs calmes puis six tendus');
    assert.ok(r.notes > 250, 'assez de notes : ' + r.notes);
    assert.ok(r.echantillons.filter(e => e.n).length >= 12, 'instruments et huit mesures de batterie');
    const titre = Buffer.from(o.subarray(0, 20)).toString('latin1').replace(/\0+$/, '');
    assert.match(titre, /^PDR /);
    const m = M.morceau(cle);
    assert.equal(m.cle, cle); assert.equal(m.canaux, 4); assert.equal(m.bpm, TEMPOS[cle]); assert.equal(m.octets, o.length);
    assert.ok(m.duree > 60 && m.duree < 200, 'durée d’une boucle : ' + m.duree);
    assert.ok(/[a-zé]/.test(m.titre), 'titre affiché en français');
  });
}

await verifier('quatre morceaux distincts, mêmes octets à chaque chargement', () => {
  const autre = charger(), vus = new Set();
  for (const cle of M.CLES) {
    const a = empreinte(lus[cle].o), b = empreinte(autre.module(cle));
    assert.equal(a, b, cle + ' : déterministe');
    vus.add(a);
  }
  assert.equal(vus.size, 4);
});

await verifier('module() rend une copie : la modifier ne change pas la suivante', () => {
  const a = M.module('bastion'), h = empreinte(a);
  a.fill(0);
  assert.equal(empreinte(M.module('bastion')), h);
  assert.throws(() => { M.CLES.push('x'); });
});

await verifier('instruments et coups de batterie en flottants finis, bornés', () => {
  for (const nom of M.instruments) {
    const s = M.son(nom);
    assert.ok(s.donnees.length > 100 && s.taux > 8000, nom);
    let haut = 0;
    for (const v of s.donnees) { assert.ok(Number.isFinite(v)); haut = Math.max(haut, Math.abs(v)); }
    assert.ok(haut > 0.05 && haut <= 1, nom + ' : crête ' + haut);
  }
  for (const sorte of ['surdoOuvert', 'surdoEtouffe', 'caixa', 'tamborim', 'agogoHaut', 'agogoBas', 'claque', 'grosseCaisse', 'tambour', 'roulement']) {
    const s = M.frappe(sorte);
    assert.equal(s.taux, M.TAUX_BATTERIE);
    let haut = 0;
    for (const v of s.donnees) { assert.ok(Number.isFinite(v)); haut = Math.max(haut, Math.abs(v)); }
    assert.ok(haut > 0.05 && haut <= 1.5, sorte + ' : crête ' + haut);
  }
});

// ---- Le lecteur, sur un faux contexte WebAudio qui note ce qui est programmé. ----
class Param {
  constructor(v = 0) { this.value = v; this.events = 0; }
  ev(v, t) { assert.ok(Number.isFinite(v) && Number.isFinite(t)); this.value = v; this.events++; }
  setValueAtTime(v, t) { this.ev(v, t); }
  linearRampToValueAtTime(v, t) { this.ev(v, t); }
  exponentialRampToValueAtTime(v, t) { assert.ok(v > 0); this.ev(v, t); }
  setTargetAtTime(v, t, c) { assert.ok(c > 0); this.ev(v, t); }
  cancelScheduledValues(t) { assert.ok(Number.isFinite(t)); }
}
class Contexte {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.noeuds = []; this.sources = []; this.tampons = 0; }
  noeud(sorte) { const n = { sorte, liens: [], detache: false, connect(c) { this.liens.push(c); return c; }, disconnect() { this.liens = []; this.detache = true; } }; this.noeuds.push(n); return n; }
  createGain() { const n = this.noeud('gain'); n.gain = new Param(1); return n; }
  createStereoPanner() { const n = this.noeud('pan'); n.pan = new Param(0); return n; }
  createBuffer(canaux, longueur, taux) {
    assert.equal(canaux, 1); assert.ok(longueur > 0 && taux >= 8000);
    const d = new Float32Array(longueur); this.tampons++;
    return { duration: longueur / taux, length: longueur, sampleRate: taux, getChannelData: () => d };
  }
  createBufferSource() {
    const n = this.noeud('source'), ctx = this;
    n.playbackRate = new Param(1); n.debut = Infinity; n.fin = Infinity; n.finie = false;
    n.start = t => { assert.ok(t >= ctx.currentTime - 0.001, 'note programmée dans le passé'); n.debut = t; };
    n.stop = t => { n.fin = Math.min(n.fin, t === undefined ? ctx.currentTime : t); };
    this.sources.push(n); return n;
  }
  avancer(s) {
    this.currentTime += s;
    for (const n of this.sources) if (!n.finie && n.fin <= this.currentTime) { n.finie = true; if (n.onended) n.onended(); }
  }
}
function jouer(lecteur, ctx, secondes, pas = 1 / 60) { for (let t = 0; t < secondes; t += pas) { lecteur.tick(); ctx.avancer(pas); } }

await verifier('lecteur : voix bornées à 28, rien dans le passé, tempo du morceau', () => {
  const ctx = new Contexte(), sortie = ctx.createGain(), l = M.creer(ctx, sortie);
  l.choisir('convergence'); l.volume(0.6); l.jouer(true);
  jouer(l, ctx, 12);
  assert.ok(l.stats.notes > 50, 'notes : ' + l.stats.notes);
  assert.ok(l.stats.picVoix <= 28 && l.stats.picVoix > 3, 'pic de voix : ' + l.stats.picVoix);
  assert.equal(l.stats.tempo, 132);
  assert.equal(l.stats.morceau, 'convergence');
  l.liberer();
  assert.ok(ctx.noeuds.filter(n => n !== sortie).every(n => n.detache), 'tout est détaché');
});

await verifier('intensité : bascule vers la section tendue, puis retour au calme, en fin de motif', () => {
  const ctx = new Contexte(), l = M.creer(ctx, ctx.createGain());
  l.choisir('bastion'); l.jouer(true);
  const motif = 64 * 2.5 * 6 / 92;            // secondes par motif à 92 BPM, vitesse 6
  jouer(l, ctx, motif * 1.5);
  assert.equal(l.stats.section, 'calme');
  l.intensite(1);
  jouer(l, ctx, motif * 1.2);
  assert.equal(l.stats.section, 'tendue'); assert.ok(l.stats.passagesTendus >= 1);
  l.intensite(0.4);                           // entre les deux seuils : on reste
  jouer(l, ctx, motif * 1.1);
  assert.equal(l.stats.section, 'tendue');
  l.intensite(0);
  jouer(l, ctx, motif * 1.2);
  assert.equal(l.stats.section, 'calme'); assert.ok(l.stats.passagesCalmes >= 1);
  l.liberer();
});

await verifier('pause, volume nul, changement de morceau et recalage après un retard', () => {
  const ctx = new Contexte(), l = M.creer(ctx, ctx.createGain());
  l.choisir('prefecture'); l.jouer(true); jouer(l, ctx, 2);
  const rangees = l.stats.rangees;
  l.jouer(false); jouer(l, ctx, 3);
  assert.equal(l.stats.rangees, rangees, 'en pause, rien n’est programmé');
  l.jouer(true); jouer(l, ctx, 1);
  assert.ok(l.stats.rangees > rangees);
  l.volume(0); const r2 = l.stats.rangees; jouer(l, ctx, 1); assert.equal(l.stats.rangees, r2, 'volume nul : rien');
  l.volume(0.5); jouer(l, ctx, 0.5);
  ctx.avancer(1.5); l.tick();                 // onglet caché : la musique se recale au lieu de rattraper
  assert.ok(l.stats.resynchronisations >= 1);
  l.choisir('titre'); l.tick();
  assert.equal(l.stats.morceau, 'titre'); assert.equal(l.stats.tempo, 108); assert.ok(l.stats.position === 0 && l.stats.rangee < 7);
  ctx.state = 'suspended'; const r3 = l.stats.rangees; jouer(l, ctx, 0.5); assert.equal(l.stats.rangees, r3, 'contexte suspendu : rien');
  l.liberer(); l.liberer(); l.tick(); l.jouer(true); l.choisir('bastion');
});

await verifier('rythme : une rangée après l’autre, à l’heure audio, au tempo du morceau', () => {
  const ctx = new Contexte(), l = M.creer(ctx, ctx.createGain()), recus = [];
  l.rythme((temps, rangee, duree) => recus.push([temps, rangee, duree, ctx.currentTime]));
  l.choisir('convergence'); l.jouer(true); jouer(l, ctx, 6);
  const duree = 2.5 * 6 / 132;
  assert.ok(recus.length > 45, 'rangées reçues : ' + recus.length);
  for (let i = 0; i < recus.length; i++) {
    const [temps, rangee, d, alors] = recus[i];
    assert.ok(temps >= alors - 1e-9 && temps <= alors + 0.3, 'programmée d’avance, jamais dans le passé');
    assert.ok(Math.abs(d - duree) < 1e-12, 'durée d’une double-croche à 132 BPM');
    if (i) {
      assert.equal(rangee, (recus[i - 1][1] + 1) & 63, 'rangées consécutives');
      assert.ok(Math.abs(temps - recus[i - 1][0] - duree) < 1e-9, 'pas régulier');
    }
  }
  l.jouer(false); const n = recus.length; jouer(l, ctx, 1); assert.equal(recus.length, n, 'en pause, aucun rappel');
  l.jouer(true); jouer(l, ctx, 0.5); assert.ok(recus.length > n);
  l.rythme(null); const m = recus.length; jouer(l, ctx, 0.5); assert.equal(recus.length, m, 'rappel retiré');
  l.rythme((t, r) => recus.push([t, r])); l.liberer(); jouer(l, ctx, 0.5); assert.equal(recus.length, m, 'libéré : plus rien');
});

await verifier('preparer() crée les tampons d’un morceau sans rien jouer', () => {
  const ctx = new Contexte(), l = M.creer(ctx, ctx.createGain());
  assert.equal(l.preparer('bastion'), true);
  assert.ok(ctx.tampons >= 12); assert.equal(ctx.sources.length, 0);
  const avant = ctx.tampons; l.preparer('bastion'); assert.equal(ctx.tampons, avant, 'tampons gardés');
  l.liberer();
});

await verifier('préchauffage : par tranches, sans AudioContext, progression jusqu’à 1', async () => {
  let pauses = 0;
  const scope = { setTimeout: (f, ms) => { pauses++; return setTimeout(f, ms); }, clearTimeout,
    AudioContext: class { constructor() { throw new Error('aucun périphérique avant un geste'); } } };
  const F = charger(scope), progres = [];
  const r = await F.prechauffer(undefined, p => progres.push(p));
  assert.equal(r.length, 4);
  assert.ok(pauses >= 20, 'rend la main entre les tâches : ' + pauses);
  assert.equal(progres.at(-1), 1);
  for (let i = 1; i < progres.length; i++) assert.ok(progres[i] >= progres[i - 1]);
  const t = performance.now(); F.module('titre'); assert.ok(performance.now() - t < 20, 'module déjà calculé');
  const encore = await F.prechauffer(['titre']); assert.equal(encore[0].cle, 'titre');
});

console.log(`MUSIQUE  REUSSI : ${ok} vérifications, ${M.CLES.length} morceaux`);
