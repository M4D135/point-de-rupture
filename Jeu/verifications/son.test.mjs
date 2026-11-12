// Son du jeu (moteur/audio.js, son.js) sur un faux contexte WebAudio qui note le graphe et la programmation : rien
// avant un geste, chaque son joue sans exception, plafond de voix, ambiances qui suivent un état de synthèse, sons
// placés selon la caméra et bornés par sorte, sourdine et volumes, morceau selon l'écran, logique « des nôtres »,
// essai borné, libération, son indisponible ; aucune source de son chargée d'ailleurs.
//   node Jeu/verifications/son.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ICI, '../src');
const FICHIERS = ['sim/regles.js', 'sim/protocole.js', 'moteur/musique.js', 'moteur/audio.js', 'son.js'];
const SOURCES = Object.fromEntries(FICHIERS.map(f => [f, fs.readFileSync(path.join(SRC, f), 'utf8')]));

let ok = 0;
const verifier = async (nom, f) => { await f(); ok++; console.log('ok  ' + nom); };

// ---- Faux WebAudio (repris de checks/audio.test.mjs de FERRO, en français). ----
class Param {
  constructor(v = 0) { this.value = v; this.evenements = []; }
  ev(sorte, v, t) { assert.ok(Number.isFinite(v) && Number.isFinite(t), 'automation finie'); this.value = v; this.evenements.push({ sorte, v, t }); }
  setValueAtTime(v, t) { this.ev('fixe', v, t); }
  linearRampToValueAtTime(v, t) { this.ev('lineaire', v, t); }
  exponentialRampToValueAtTime(v, t) { assert.ok(v > 0, 'rampe exponentielle vers une valeur positive'); this.ev('exponentielle', v, t); }
  setTargetAtTime(v, t, c) { assert.ok(c > 0); this.ev('cible', v, t); }
  cancelScheduledValues(t) { assert.ok(Number.isFinite(t)); }
}
class Contexte {
  constructor() {
    this.currentTime = 0; this.sampleRate = 44100; this.state = 'suspended'; this.noeuds = []; this.sources = []; this.tampons = [];
    this.reprises = 0; this.fermetures = 0; this.destination = this.noeud('destination');
  }
  noeud(sorte) {
    const n = { sorte, liens: [], detache: false, connect(c) { this.liens.push(c); return c; }, disconnect() { this.liens = []; this.detache = true; } };
    this.noeuds.push(n); return n;
  }
  createGain() { const n = this.noeud('gain'); n.gain = new Param(1); return n; }
  createStereoPanner() { const n = this.noeud('pan'); n.pan = new Param(0); return n; }
  createBiquadFilter() { const n = this.noeud('filtre'); n.type = 'lowpass'; n.frequency = new Param(350); n.Q = new Param(1); return n; }
  createDelay() { const n = this.noeud('retard'); n.delayTime = new Param(0); return n; }
  createDynamicsCompressor() { const n = this.noeud('limiteur'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(); return n; }
  createWaveShaper() { return this.noeud('garde'); }
  createBuffer(canaux, longueur, taux) {
    assert.ok(canaux === 1 && longueur > 0 && taux >= 8000, 'tampon mono valide');
    const d = new Float32Array(longueur), b = { sampleRate: taux, length: longueur, duration: longueur / taux, getChannelData: () => d };
    this.tampons.push(b); return b;
  }
  programme(sorte) {
    const n = this.noeud(sorte), ctx = this;
    n.debut = Infinity; n.fin = Infinity; n.finie = false; n.loop = false; n.playbackRate = new Param(1); n.frequency = new Param(440); n.decalage = 0;
    n.start = (t = ctx.currentTime, decalage = 0) => { assert.ok(t >= ctx.currentTime - 0.001, 'source programmée dans le passé'); n.debut = t; n.decalage = decalage; };
    n.stop = (t = ctx.currentTime) => { assert.ok(Number.isFinite(t)); n.fin = Math.min(n.fin, t); };
    this.sources.push(n); return n;
  }
  createOscillator() { return this.programme('oscillateur'); }
  createBufferSource() { return this.programme('source'); }
  avancer(s) {
    this.currentTime += s;
    for (const n of this.sources) {
      const naturelle = n.sorte === 'source' && !n.loop && n.buffer ? n.debut + Math.max(0, n.buffer.duration - n.decalage) / n.playbackRate.value : Infinity;
      if (!n.finie && Math.min(n.fin, naturelle) <= this.currentTime) { n.finie = true; if (n.onended) n.onended(); }
    }
  }
  resume() { this.reprises++; this.state = 'running'; return Promise.resolve(); }
  close() { this.fermetures++; this.state = 'closed'; return Promise.resolve(); }
}

/** Un monde : les scripts chargés dans un contexte vm, un AudioContext factice (ou aucun), des minuteries réglables. */
async function monde({ indisponible = false, sansPan = false } = {}) {
  const contextes = [], minuteries = new Map();
  let id = 0, reelles = true;
  const scope = { console, performance };
  scope.setTimeout = (f, ms) => {
    if (reelles) return setTimeout(f, ms);
    const n = ++id; minuteries.set(n, { f, a: (contextes.at(-1)?.currentTime || 0) + (ms || 0) / 1000 }); return n;
  };
  scope.clearTimeout = n => { if (!minuteries.delete(n)) clearTimeout(n); };
  if (!indisponible) scope.AudioContext = class extends Contexte { constructor() { super(); if (sansPan) this.createStereoPanner = undefined; contextes.push(this); } };
  vm.createContext(scope);
  for (const f of FICHIERS) vm.runInContext(SOURCES[f], scope, { filename: f });
  const PDR = scope.PDR;
  await PDR.son.prechauffer();                // banque et morceaux calculés avant tout geste, minuteries réelles
  reelles = false;
  let temps = 0;
  const audio = PDR.audio.create(), journal = [];
  for (const nom of PDR.audio.SONS) { const f = audio[nom]; audio[nom] = e => { journal.push({ nom, ...(e || {}) }); return f(e); }; }
  const son = PDR.son.creerSon(audio, { horloge: () => temps });
  return {
    PDR, scope, audio, son, journal, contextes,
    get ctx() { return contextes.at(-1); },
    get temps() { return temps; },
    avancer(s) { temps += s; if (contextes.at(-1)) contextes.at(-1).avancer(s); },
    /** Fait courir l'horloge audio en déclenchant les minuteries échues, dans l'ordre. */
    pomper(secondes) {
      const ctx = contextes.at(-1), fin = ctx.currentTime + secondes;
      let garde = 0;
      for (;;) {
        let prochaine = null;
        for (const [n, m] of minuteries) if (!prochaine || m.a < prochaine[1].a) prochaine = [n, m];
        if (!prochaine || prochaine[1].a > fin) break;
        assert.ok(++garde < 2000, 'minuteries bornées');
        const pas = Math.max(0, prochaine[1].a - ctx.currentTime);
        temps += pas; ctx.avancer(pas); minuteries.delete(prochaine[0]); prochaine[1].f();
      }
      const reste = Math.max(0, fin - ctx.currentTime); temps += reste; ctx.avancer(reste);
    },
    minuteries,
  };
}
const VUE = { cible: [0, 0], D: 200, yaw: 0 };
/** Un état de synthèse au format du protocole. unites : [{ x, z, f, t, e, d }] ; evenements : [[type, x, z, f, a, b]]. */
function etat(PDR, { unites = [], evenements = [], combats = null, structures = null, alliance = null } = {}) {
  const R = PDR.regles, f32 = new Float32Array(Math.max(1, unites.length) * 4);
  unites.forEach((u, i) => { f32.set([u.x, u.z, 0, R.coder(u.f, u.t ?? 1, u.e ?? 1, 40, u.d ?? 0)], i * 4); });
  const ev = new Float32Array(evenements.length * PDR.protocole.EV_TAILLE);
  evenements.forEach((e, k) => ev.set([e[0], e[1] ?? 0, e[2] ?? 0, e[3] ?? -1, e[4] ?? 0, e[5] ?? 0], k * 6));
  return { type: 'etat', it: 0, temps: 0, vitesse: 1, n: unites.length, unites: f32.buffer, evenements: ev, combats, structures,
    alliance, vainqueur: -1, eco: [], lieux: [] };
}
/** Une foule de n unités du camp f dans un disque de rayon r autour de (x, z), graine fixe. */
function foule(n, f, x, z, r, extra = {}) {
  let s = 12345 + f * 7 + n;
  const h = () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 4294967296; };
  return Array.from({ length: n }, () => { const a = h() * Math.PI * 2, d = Math.sqrt(h()) * r; return { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, f, ...extra }; });
}

await verifier('rien ne s’ouvre ni ne joue avant un geste', async () => {
  const m = await monde();
  m.son.reglages({ son: true, volumeGeneral: 1, volumeMusique: 0.45, volumeEffets: 1, volumeAmbiances: 0.8 });
  m.son.ecran('titre'); m.son.ecran('demo');
  m.son.etat(etat(m.PDR, { unites: foule(500, 0, 0, 0, 50), evenements: [[m.PDR.protocole.EV.CASSE, 0, 0, 0, 1, 2]] }), VUE);
  m.son.image(1 / 60, VUE); m.son.ui('clic'); m.son.commande({ t: 1, j: 0 });
  assert.equal(m.contextes.length, 0, 'aucun AudioContext avant le geste');
  assert.equal(m.journal.length, 0, 'aucun son demandé');
  await m.son.geste();
  assert.equal(m.contextes.length, 1); assert.equal(m.ctx.reprises, 1); assert.equal(m.ctx.state, 'running');
  await m.son.geste(); assert.equal(m.contextes.length, 1, 'un seul contexte');
  // Sortie : maître → limiteur → plafond doux → destination, un seul lien vers la destination.
  const garde = m.ctx.noeuds.find(n => n.sorte === 'garde');
  assert.equal(garde.liens[0], m.ctx.destination); assert.equal(garde.oversample, 'none');
  assert.equal(m.ctx.noeuds.filter(n => n.liens.includes(m.ctx.destination)).length, 1);
  const c = garde.curve;
  assert.equal(c.length, 2049); assert.equal(c[1024], 0);
  for (let i = 0; i < c.length; i++) { assert.ok(Math.abs(c[i]) < 0.97); if (i) assert.ok(c[i] >= c[i - 1]); const x = i / 1024 - 1; if (Math.abs(x) <= 0.875) assert.ok(Math.abs(c[i] - x) < 1e-7); }
  m.son.liberer();
});

await verifier('chaque son ponctuel joue sans exception, avec et sans StereoPanner', async () => {
  for (const sansPan of [false, true]) {
    const m = await monde({ sansPan });
    await m.son.geste(); m.son.ecran('partie', { joueur: 0 });
    const A = m.audio, muets = [], persistantes = m.ctx.sources.length;
    assert.ok(m.ctx.sources.slice(0, persistantes).some(n => n.loop), 'ambiances en boucle construites au geste');
    for (const nom of m.PDR.audio.SONS) {
      for (const [k, sorte] of [[0, 'vitre'], [1, 'metal'], [2, 'voiture'], [0, 'bois'], [1, 'structure']]) {
        const avant = m.ctx.sources.length;
        A[nom]({ niveau: 0.8, pan: (k - 1) * 0.6, camp: k, sorte, ami: k !== 2, n: 3, delai: 1.5, touchees: 12, ouvert: k === 0 });
        if (m.ctx.sources.length === avant && k === 0) muets.push(nom);
        m.avancer(1.6);   // au-delà du délai de chaque sorte
      }
    }
    assert.deepEqual(muets, [], 'sons sans source : ' + muets.join(', '));
    for (const n of m.ctx.sources.slice(persistantes)) assert.ok(!n.loop && n.fin - n.debut < 4.5, 'chaque son ponctuel se termine : ' + (n.fin - n.debut));
    m.son.liberer();
  }
});

await verifier('plafond de voix : 48 au plus, la musique a ses 28 voix à elle', async () => {
  const m = await monde();
  await m.son.geste(); m.son.ecran('partie', { joueur: 2 });
  m.son.reglages({ son: true, volumeGeneral: 1, volumeMusique: 0.6, volumeEffets: 1, volumeAmbiances: 1 });
  const A = m.audio, noms = m.PDR.audio.SONS;
  for (let pas = 0; pas < 150; pas++) {
    for (let i = 0; i < 20; i++) A[noms[(pas * 7 + i) % noms.length]]({ niveau: 0.5 + (i % 5) / 10, pan: (i % 9) / 4 - 1, camp: i % 3, sorte: 'vitre', touchees: 9 });
    m.son.image(0.04, VUE);
    assert.ok(A.stats.voix <= 48, 'voix : ' + A.stats.voix);
    m.avancer(0.04);
  }
  assert.ok(A.stats.picVoix <= 48 && A.stats.picVoix >= 40, 'pic : ' + A.stats.picVoix);
  assert.ok(A.stats.sautes > 100, 'les sons en trop sont sautés : ' + A.stats.sautes);
  assert.ok(A.stats.volees > 0, 'un son important prend la place d’un son d’ambiance');
  assert.ok(A.lecteur.stats.picVoix <= 28 && A.lecteur.stats.notes > 20, 'musique : ' + A.lecteur.stats.notes + ' notes');
  m.son.liberer(); assert.equal(A.stats.voix, 0);
});

await verifier('les ambiances suivent la foule en vue, ses camps, ses combats', async () => {
  const m = await monde();
  const { ETATS, DRAPEAUX } = m.PDR.regles;
  await m.son.geste(); m.son.ecran('partie', { joueur: 0 });
  const N = m.audio.niveaux;
  // À gauche une manif de la Convergence avec sa Fanfare, à droite une ligne du Bastion qui frappe, boucliers levés.
  const unites = foule(2400, 0, -80, 0, 40).concat(foule(40, 0, -80, 0, 20, { t: 3 }), foule(600, 1, 80, 0, 30, { e: ETATS.ATTAQUE, d: DRAPEAUX.BOUCLIER }),
    foule(12, 2, 0, -60, 10, { t: 12, d: DRAPEAUX.VEHICULE }));
  for (let i = 0; i < 8; i++) { m.son.etat(etat(m.PDR, { unites }), VUE); m.son.image(0.05, VUE); m.avancer(0.05); }
  assert.ok(N.foule > 0.6, 'rumeur : ' + N.foule);
  assert.ok(N.chants[0] > 0.5 && N.chants[1] > 0.2 && N.chants[0] > N.chants[1], 'chants : ' + Array.from(N.chants));
  assert.ok(N.pans[0] < -0.2 && N.pans[1] > 0.2, 'chaque camp à sa place : ' + Array.from(N.pans));
  assert.ok(N.tambours[0] > N.tambours[1] && N.tambours[0] > 0.4, 'batucada avec la Fanfare : ' + Array.from(N.tambours));
  assert.ok(N.melee > 0.5 && N.meleePan > 0.2 && N.bouclier > 0.9, 'mêlée à droite, boucliers : ' + N.melee + ' ' + N.meleePan);
  assert.ok(N.sirene > 0.5, 'sirènes des véhicules : ' + N.sirene);
  assert.ok(m.journal.some(e => e.nom === 'sirene'), 'les véhicules entrent dans la vue : un coup de sirène');
  // Le séquenceur de rue chante, tambourine et frappe : des sources jouent les syllabes et les frappes.
  const avant = m.ctx.sources.length;
  for (let i = 0; i < 120; i++) { m.son.image(1 / 30, VUE); m.avancer(1 / 30); }
  assert.ok(m.audio.stats.pasDeRue > 25, 'pas de rue : ' + m.audio.stats.pasDeRue);
  assert.ok(m.ctx.sources.length - avant > 60, 'le séquenceur joue : ' + (m.ctx.sources.length - avant));
  // La musique joue : c'est elle qui donne la mesure, une double-croche par rangée, sans second métronome.
  const S = m.audio.stats;
  assert.ok(S.pasMusique > 25 && S.pasDeRue - S.pasMusique <= 4, 'la rue suit la musique : ' + S.pasMusique + ' sur ' + S.pasDeRue);
  // Musique coupée : l'horloge propre de la rue (100 BPM) reprend, sans trou ni doublon.
  m.son.reglages({ son: true, volumeGeneral: 1, volumeMusique: 0, volumeEffets: 1, volumeAmbiances: 1 });
  const pasAvant = S.pasDeRue, musiqueAvant = S.pasMusique;
  for (let i = 0; i < 120; i++) { m.son.image(1 / 30, VUE); m.avancer(1 / 30); }
  const fait = S.pasDeRue - pasAvant;
  assert.ok(S.pasMusique - musiqueAvant <= 3 && fait >= 22 && fait <= 28, 'horloge propre : ' + fait + ' pas en 4 s');
  // La caméra part au loin : la rue se tait, les niveaux tombent.
  const loin = { cible: [5000, 5000], D: 200, yaw: 0 };
  for (let i = 0; i < 8; i++) { m.son.etat(etat(m.PDR, { unites }), loin); m.avancer(0.05); }
  assert.ok(N.foule < 0.01 && N.melee < 0.01 && N.chants[0] < 0.01, 'loin de tout : silence de la rue');
  // Une grille de combats sous la caméra suffit à faire la mêlée, quelle que soit la lecture de « cote ».
  for (const cote of [24, 24 * 64]) {
    m.son.carte({ etendue: { x0: -768, z0: -768, x1: 768, z1: 768 }, combats: { taille: 64, x0: -768, z0: -768, cote } });
    const g = new Uint16Array(64 * 64); g[32 * 64 + 32] = 200; g[32 * 64 + 33] = 200;
    m.son.etat(etat(m.PDR, { combats: g }), VUE);
    assert.ok(N.melee > 0.9, 'mêlée lue sur la grille (cote ' + cote + ') : ' + N.melee);
  }
  // Une barricade prend feu : le feu fait son bruit une fois, puis crépite tant qu'il brûle.
  const s = [{ id: 7, sorte: 'barricade', faction: 0, x: 10, z: 0, x2: 20, z2: 0, pv: 100, pvMax: 400, chantier: false, feu: false }];
  m.son.etat(etat(m.PDR, { structures: s }), VUE);
  m.son.etat(etat(m.PDR, { structures: [{ ...s[0], feu: true }] }), VUE);
  m.son.etat(etat(m.PDR, {}), VUE);
  assert.equal(m.journal.filter(e => e.nom === 'feu').length, 1);
  assert.ok(N.feu > 0.3, 'crépitement : ' + N.feu);
  m.son.liberer();
});

await verifier('évènements placés selon la caméra, bornés par sorte et par état', async () => {
  const m = await monde();
  const { EV } = m.PDR.protocole;
  await m.son.geste(); m.son.ecran('partie', { joueur: 0 });
  const dernier = nom => m.journal.filter(e => e.nom === nom).at(-1);
  m.son.etat(etat(m.PDR, { evenements: [[EV.CASSE, 0, 0, 0, 3, 2]] }), VUE);           // vitrine au centre
  let e = dernier('casse');
  assert.equal(e.sorte, 'vitre'); assert.ok(Math.abs(e.pan) < 0.01 && e.niveau > 0.95);
  m.avancer(0.5);
  m.son.etat(etat(m.PDR, { evenements: [[EV.CASSE, 120, 0, 0, 3, 0]] }), VUE);         // voiture à droite
  e = dernier('casse');
  assert.equal(e.sorte, 'voiture'); assert.ok(e.pan > 0.5 && e.niveau < 0.95, 'à droite, plus faible : ' + e.pan + ' ' + e.niveau);
  m.son.etat(etat(m.PDR, { evenements: [[EV.CASSE, -1000, 0, 0, 3, 4]] }), VUE);       // trop loin
  assert.equal(dernier('casse'), e, 'au-delà de deux fois la vue : rien');
  // La caméra tournée d'un quart de tour : ce qui était à droite passe devant.
  m.avancer(0.5);
  m.son.etat(etat(m.PDR, { evenements: [[EV.CASSE, 120, 0, 0, 3, 5]] }), { cible: [0, 0], D: 200, yaw: Math.PI / 2 });
  e = dernier('casse'); assert.equal(e.sorte, 'metal'); assert.ok(Math.abs(e.pan) < 0.05, 'devant : ' + e.pan);
  // Zoom : plus près, plus fort.
  m.avancer(0.5);
  m.son.etat(etat(m.PDR, { evenements: [[EV.BARRICADE_POSEE, 60, 0, 0, 1, 0]] }), { cible: [0, 0], D: 800, yaw: 0 });
  const haut = dernier('barricadePosee').niveau;
  m.avancer(0.5);
  m.son.etat(etat(m.PDR, { evenements: [[EV.BARRICADE_POSEE, 60, 0, 0, 1, 0]] }), { cible: [0, 0], D: 120, yaw: 0 });
  assert.ok(dernier('barricadePosee').niveau > haut * 1.3, 'zoom : ' + haut + ' → ' + dernier('barricadePosee').niveau);
  // Cent unités hors jeu d'un coup : quatre sons au plus, et la foule pousse un « oh ».
  const avant = m.journal.length;
  m.son.etat(etat(m.PDR, { evenements: Array.from({ length: 100 }, (_, k) => [EV.HORS_JEU, (k % 10) * 8 - 40, 0, 1, 5, 0]) }), { cible: [0, 0], D: 200, yaw: 0 });
  const joues = m.journal.slice(avant);
  assert.equal(joues.filter(x => x.nom === 'horsJeu').length, 4);
  assert.equal(joues.filter(x => x.nom === 'clameur' && x.sorte === 'oh').length, 1);
  assert.ok(m.son.stats.evenements >= 104);
  // Un jet : un bruit d'attaque, puis la boucle tient tant que les évènements arrivent, et retombe après.
  for (let i = 0; i < 6; i++) { m.son.etat(etat(m.PDR, { evenements: i % 2 ? [] : [[EV.JET, 20, 0, 2, 0, 18]] }), VUE); m.avancer(0.25); }
  assert.equal(m.journal.filter(x => x.nom === 'jet').length, 1);
  assert.ok(m.audio.niveaux.jet > 0.5);
  m.avancer(1); m.son.etat(etat(m.PDR, {}), VUE);
  assert.equal(m.audio.niveaux.jet, 0);
  // Une salve : annonce, puis souffle et choc ; jamais un bruit de détonation (pas d'attaque plus raide que 5 ms).
  m.son.etat(etat(m.PDR, { evenements: [[EV.SALVE_ANNONCE, 0, 10, 2, 6, 1.5]] }), VUE);
  assert.equal(dernier('salveAnnonce').delai, 1.5);
  m.avancer(1.5);
  const s0 = m.ctx.sources.length;
  m.son.etat(etat(m.PDR, { evenements: [[EV.SALVE, 0, 10, 2, 6, 14]] }), VUE);
  assert.equal(dernier('salve').touchees, 14);
  assert.ok(m.ctx.sources.length - s0 >= 8, 'souffle, choc, boucliers, « oh »');
  m.son.liberer();
});

await verifier('annonces : ce qui concerne le joueur, et seulement lui', async () => {
  const m = await monde();
  const { EV, VAINQUEUR } = m.PDR.protocole;
  await m.son.geste(); m.son.ecran('partie', { joueur: 1 });
  const joues = evs => { const avant = m.journal.length; m.son.etat(etat(m.PDR, { evenements: evs, alliance: [1, 2] }), VUE); m.avancer(1.6); return m.journal.slice(avant); };
  assert.equal(joues([[EV.REFUS, 0, 0, 0, 1, 12]]).length, 0, 'le refus d’un autre camp ne s’entend pas');
  assert.equal(joues([[EV.REFUS, 0, 0, 1, 1, 12]])[0].nom, 'refus');
  assert.equal(joues([[EV.PRODUCTION, 30, 0, 0, 1, 20]]).length, 0);
  assert.equal(joues([[EV.PRODUCTION, 30, 0, 1, 5, 10]])[0].camp, 1);
  assert.equal(joues([[EV.ATTAQUE_SUBIE, 20, 0, 1, 0]]).length, 0, 'une attaque en vue : pas d’alerte');
  const alerte = joues([[EV.ATTAQUE_SUBIE, 300, 0, 1, 0]])[0];
  assert.equal(alerte.nom, 'alerte'); assert.ok(alerte.pan > 0.5, 'l’alerte vient de la droite');
  assert.equal(joues([[EV.LIEU_PRIS, 0, 0, 2, 3]])[0].ami, true, 'l’allié prend un lieu : bonne nouvelle');
  assert.equal(joues([[EV.LIEU_PRIS, 0, 0, 0, 3]])[0].ami, false, 'l’adversaire prend un lieu');
  assert.equal(joues([[EV.LIEU_NEUTRALISE, 0, 0, 1, 3]])[0].nom, 'lieuPerdu');
  assert.equal(joues([[EV.LIEU_NEUTRALISE, 0, 0, 0, 3]])[0].nom, 'lieuNeutralise');
  assert.equal(joues([[EV.ALLIANCE_PROPOSEE, 0, 0, 0, 2]]).length, 0);
  assert.equal(joues([[EV.ALLIANCE_PROPOSEE, 0, 0, 0, 1]])[0].nom, 'allianceProposee');
  assert.equal(joues([[EV.QG_OCCUPE, 0, 0, 1, 0]])[0].ami, true, 'notre QG est occupé : alarme');
  assert.equal(joues([[EV.QG_OCCUPE, 0, 0, 0, 2]])[0].ami, false, 'l’allié occupe un QG adverse');
  assert.equal(joues([[EV.QG_OCCUPE, 0, 0, 0, 2]]).length, 1);
  assert.equal(joues([[EV.COLERE, 4000, 0, 1, 45]])[0].nom, 'colere', 'la colère du Bastion s’entend de loin');
  assert.equal(joues([[EV.STRUCTURE_DETRUITE, 300, 0, 2, 4, 1]]).filter(x => x.nom === 'alerte').length, 1, 'notre avant-poste tombe hors de vue');
  assert.equal(joues([[EV.VICTOIRE, 0, 0, -1, VAINQUEUR.ALLIANCE]])[0].nom, 'victoire', 'victoire de notre alliance');
  assert.equal(joues([[EV.VICTOIRE, 0, 0, -1, 0]])[0].nom, 'defaite');
  m.son.ecran('demo', { joueur: -1 });
  const demo = joues([[EV.VICTOIRE, 0, 0, -1, 2], [EV.LIEU_PRIS, 0, 0, 0, 3], [EV.REFUS, 0, 0, 0, 1, 2]]);
  assert.deepEqual(demo.map(x => x.nom).sort(), ['lieuPris', 'victoire'], 'en démo : les annonces neutres, pas les refus');
  m.son.liberer();
});

await verifier('sourdine, volumes indépendants, interface et accusés d’ordre', async () => {
  const m = await monde();
  await m.son.geste(); m.son.ecran('partie', { joueur: 0 });
  const maitre = m.ctx.noeuds.find(n => n.sorte === 'gain' && n.liens[0] && n.liens[0].sorte === 'limiteur');
  m.son.reglages({ son: false, volumeGeneral: 1, volumeMusique: 0.45, volumeEffets: 1, volumeAmbiances: 0.8 });
  assert.equal(maitre.gain.value, 0);
  const avant = m.ctx.sources.length;
  m.son.etat(etat(m.PDR, { unites: foule(500, 0, 0, 0, 30), evenements: [[m.PDR.protocole.EV.CASSE, 0, 0, 0, 1, 2]] }), VUE);
  m.son.ui('clic'); for (let i = 0; i < 30; i++) { m.son.image(0.05, VUE); m.avancer(0.05); }
  assert.equal(m.ctx.sources.length, avant, 'en sourdine : rien ne joue, rien ne se programme');
  assert.equal(await m.son.essai(), false, 'essai refusé quand le son est coupé');
  m.son.reglages({ son: true, volumeGeneral: 0.5, volumeMusique: 0.3, volumeEffets: 0, volumeAmbiances: 0.8 });
  assert.ok(Math.abs(maitre.gain.value - 0.325) < 1e-9);
  const s1 = m.ctx.sources.length;
  m.son.ui('clic'); m.audio.casse({ niveau: 1, sorte: 'vitre' });
  assert.equal(m.ctx.sources.length, s1, 'effets à zéro : ni bruitages ni interface');
  m.son.reglages({ son: true, volumeGeneral: 1, volumeMusique: 0.3, volumeEffets: 1, volumeAmbiances: 0.8 });
  m.avancer(0.1); m.son.ui('clic'); assert.ok(m.ctx.sources.length > s1);
  m.avancer(0.2); m.son.ui('selection', { n: 12 });
  m.avancer(0.2); m.son.commande([{ t: m.PDR.protocole.CMD.PRODUIRE }, { t: m.PDR.protocole.CMD.REPLIER }]);
  m.avancer(0.2); m.son.commande({ t: m.PDR.protocole.CMD.DEPLACER, mode: 1 });
  m.avancer(0.2); m.son.ui('menu', { ouvert: false }); m.avancer(0.2); m.son.ui('refus'); m.son.ui('survol');
  const ordres = m.journal.filter(e => e.nom === 'ordre').map(e => e.sorte);
  assert.deepEqual(ordres, ['replier', 'attaquer']);
  assert.ok(m.journal.some(e => e.nom === 'selection' && e.n === 12 && e.camp === 0));
  assert.ok(m.journal.some(e => e.nom === 'menu' && e.ouvert === false));
  m.son.liberer();
});

await verifier('le morceau suit l’écran ; la fin laisse jouer le jingle puis rend le thème', async () => {
  const m = await monde();
  await m.son.geste();
  const L = () => m.audio.lecteur.stats;
  m.son.ecran('titre'); m.son.image(0.02, null);
  assert.equal(L().morceau, 'titre'); assert.equal(L().joue, true);
  m.son.ecran('demo', { joueur: -1 }); assert.equal(L().morceau, 'titre', 'la démo garde la musique du titre');
  for (const [j, cle] of [[0, 'convergence'], [1, 'bastion'], [2, 'prefecture']]) { m.son.ecran('partie', { joueur: j }); assert.equal(m.son.cle, cle); assert.equal(L().morceau, cle); }
  const bus = m.ctx.noeuds.find(n => n.sorte === 'gain' && Math.abs(n.gain.value - 0.8) < 1e-9 && n.liens[0] && n.liens[0].liens[0] && n.liens[0].liens[0].sorte === 'limiteur');
  m.son.ecran('pause'); assert.ok(Math.abs(bus.gain.value - 0.4) < 1e-9, 'pause : musique à moitié');
  m.son.ecran('partie'); assert.ok(Math.abs(bus.gain.value - 0.8) < 1e-9);
  m.son.ecran('fin', { vainqueur: 2 });
  assert.equal(L().joue, false); assert.equal(m.journal.at(-1).nom, 'victoire', 'jingle de victoire sans évènement');
  for (let i = 0; i < 50; i++) { m.son.image(0.05, VUE); m.avancer(0.05); }
  assert.equal(L().joue, false, 'pas de musique sous le jingle');
  for (let i = 0; i < 20; i++) { m.son.image(0.05, VUE); m.avancer(0.05); }
  assert.equal(L().joue, true); assert.equal(L().morceau, 'titre', 'le thème revient après le jingle');
  assert.equal(m.son.morceau().titre, 'Point de rupture');
  // Réglages ouverts depuis le titre : le thème continue ; échec : rien ne joue, ni musique ni rue.
  m.son.ecran('reglages'); assert.equal(L().joue, true); assert.equal(L().morceau, 'titre');
  m.son.ecran('partie', { joueur: 1 }); m.son.ecran('pause'); m.son.ecran('echec');
  assert.equal(L().joue, false, 'échec : musique arrêtée');
  assert.ok(Math.abs(bus.gain.value - 0.8) < 1e-9, 'échec : la pause ne reste pas');
  const pas = m.audio.stats.pasDeRue;
  for (let i = 0; i < 30; i++) { m.son.image(0.05, VUE); m.avancer(0.05); }
  assert.equal(m.audio.stats.pasDeRue, pas, 'échec : la rue se tait');
  const mod = m.son.module('bastion');
  assert.equal(mod.nom, 'point-de-rupture-bastion.mod'); assert.equal(Buffer.from(mod.octets.slice(1080, 1084)).toString(), 'M.K.');
  m.son.liberer();
});

await verifier('essai du mixage : deux secondes bornées, ordre, frappe et rue', async () => {
  const m = await monde();
  await m.son.geste(); m.son.ecran('titre');
  const debut = m.journal.length;
  assert.equal(await m.son.essai(), true);
  assert.equal(m.audio.stats.essai, true);
  m.pomper(2.3);
  assert.equal(m.audio.stats.essai, false, 'l’essai se termine seul');
  assert.equal(m.minuteries.size, 0, 'aucune minuterie qui traîne');
  const noms = m.journal.slice(debut).map(e => e.nom);
  for (const n of ['ordre', 'coup', 'casse', 'sifflet', 'salve']) assert.ok(noms.includes(n), 'essai : ' + n);
  // Un second essai annule le premier.
  await m.son.essai(); m.pomper(0.5); await m.son.essai(); m.pomper(2.5);
  assert.equal(m.audio.stats.essai, false); assert.equal(m.minuteries.size, 0);
  m.son.liberer();
});

await verifier('libération complète, puis tout est sans effet ; son indisponible sans erreur', async () => {
  const m = await monde();
  await m.son.geste(); m.son.ecran('partie', { joueur: 0 });
  for (let i = 0; i < 20; i++) { m.son.etat(etat(m.PDR, { unites: foule(800, 0, 0, 0, 40) }), VUE); m.son.image(0.05, VUE); m.avancer(0.05); }
  m.son.liberer(); m.son.liberer();
  assert.equal(m.ctx.fermetures, 1);
  assert.ok(m.ctx.noeuds.filter(n => n !== m.ctx.destination).every(n => n.detache), 'tous les nœuds détachés');
  const n = m.ctx.noeuds.length;
  await m.son.geste(); m.son.etat(etat(m.PDR, { unites: foule(800, 0, 0, 0, 40) }), VUE); m.son.image(0.05, VUE); m.son.ui('clic');
  assert.equal(m.ctx.noeuds.length, n); assert.equal(m.contextes.length, 1);
  assert.equal(await m.son.essai(), false);
  const muet = await monde({ indisponible: true });
  await muet.son.geste(); muet.son.ecran('partie', { joueur: 1 });
  muet.son.etat(etat(muet.PDR, { unites: foule(100, 1, 0, 0, 20), evenements: [[1, 0, 0, 1, 5, 0]] }), VUE);
  muet.son.image(0.05, VUE); muet.son.ui('ordre', { sorte: 'tenir' });
  assert.equal(await muet.son.essai(), false); assert.equal(muet.contextes.length, 0);
  assert.equal(muet.son.module().nom, 'point-de-rupture-bastion.mod');
  muet.son.liberer();
});

await verifier('aucune source de son chargée d’ailleurs : ni URL, ni data:audio, ni fetch', () => {
  const interdits = [/https?:\/\//, /data:audio/i, /\bfetch\s*\(/, /XMLHttpRequest/, /new\s+Audio\s*\(/, /\.(mp3|ogg|wav|flac|m4a|aac|opus)\b/i,
    /\bimport\s*\(/, /importScripts/, /<\/script/i, /\b(window|document)\s*\./];
  for (const f of ['moteur/audio.js', 'moteur/musique.js', 'son.js']) for (const r of interdits) assert.ok(!r.test(SOURCES[f]), f + ' : ' + r);
});

await verifier('son.etat avec 200 000 unités : une tranche par état, quelques dixièmes de milliseconde', async () => {
  const m = await monde();
  await m.son.geste(); m.son.ecran('partie', { joueur: 0 });
  const unites = [];
  for (let f = 0; f < 3; f++) unites.push(...foule([100000, 54000, 46000][f], f, 0, 0, 750));
  const e = etat(m.PDR, { unites }), vue = { cible: [0, 0], D: 330, yaw: 0.3 };
  for (let i = 0; i < 40; i++) m.son.etat(e, vue);
  const mesures = [];
  for (let essai = 0; essai < 5; essai++) {
    const t = performance.now();
    for (let i = 0; i < 100; i++) m.son.etat(e, vue);
    mesures.push((performance.now() - t) / 100);
  }
  const meilleure = Math.min(...mesures);
  console.log('    son.etat, 200 000 unités, tranche de 50 000 : meilleure ' + meilleure.toFixed(3) + ' ms, médiane '
    + mesures.sort((a, b) => a - b)[2].toFixed(3) + ' ms (5 × 100 appels)');
  assert.ok(meilleure < 3, 'son.etat : ' + meilleure + ' ms');
  assert.ok(m.son.stats.passes >= 100);
  // Le coût de etat() se lit au chronomètre, même quand l'horloge du jeu ne bouge pas pendant l'appel.
  assert.ok(m.son.stats.msEtatMax > 0 && m.son.stats.msEtatMax < 50, 'msEtatMax : ' + m.son.stats.msEtatMax);
  m.son.liberer();
});

console.log(`SON  REUSSI : ${ok} vérifications`);
