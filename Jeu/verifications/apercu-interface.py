#!/usr/bin/env python3
"""Aperçu de l'interface de Point de rupture, sans serveur, sans port, sans réseau.

Assemble une page autonome (index.html, style.css, les modules de l'interface, regles.js, protocole.js, ville.js,
camera.js) avec un faux monde de 100 000 unités et un décor dessiné en 2D sous la vraie caméra ; la pilote dans Chrome
sans écran par tube (--remote-debugging-pipe, descripteurs 3 et 4) ; vérifie la démo (elle part 5 s après l'arrivée
sur l'écran titre, un clic ou une touche ramène au titre, une touche de modification seule ne compte pas) ; prend les
captures (chargement, titre, démo, préparation, HUD, visée, QG, chaque onglet des réglages, fin, et les mêmes écrans
en 390 × 844) ; mesure le coût de ui.etat, ui.image, du choix au cadre et au point sur 100 000 unités.

    python3 Jeu/verifications/apercu-interface.py SORTIE_DIR

SORTIE_DIR reçoit la page (apercu-interface.html), les sources copiées (sources/), le profil de Chrome (profil/,
effacé à chaque passage), les captures (captures/*.png) et mesures.json. Code de sortie non nul si une vérification
échoue ou si la page lève une exception.
"""
import base64
import fcntl
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time

ICI = pathlib.Path(__file__).resolve().parent
JEU = ICI.parent
SRC = JEU / 'src'
DEPOT = JEU.parent
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
POLICES = re.compile(r'^<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^"]*">\n', re.M)
# Les fichiers des autres modules : la copie de travail si elle se lit, sinon celle du dernier commit.
AUTRES = ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'camera.js']
INTERFACE = ['interface/reglages.js', 'interface/titre.js', 'interface/hud.js', 'interface/minicarte.js', 'interface/commandes.js']

# ---------------------------------------------------------------------------------------------------------------------
# Le faux jeu, dans la page : un monde de 100 000 unités qui bouge un peu, l'hôte (rappels), le décor, les mesures.
# ---------------------------------------------------------------------------------------------------------------------
APERCU_JS = r'''
(function () {
  'use strict';
  const R = PDR.regles, P = PDR.protocole, I = PDR.interface, CAM = PDR.camera, EV = P.EV, ET = R.ETATS, HJ = ET.HORS_JEU;
  const A = window.APERCU = { pret: false, journal: [], erreurs: [], ordres: [], sons: {}, coutsEtat: [], coutsImage: [], redessiner: true };
  const note = (quoi, x) => A.journal.push({ t: Math.round(performance.now()), quoi, x: x === undefined ? null : x });
  window.addEventListener('error', e => A.erreurs.push(String(e.message || e)));
  const N = 100000, GRAINE = 7;

  function hasard(g) {
    let a = g >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const rd = hasard(GRAINE * 7919);
  const gauss = () => { let u = 0; while (u === 0) u = rd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rd()); };

  // ---- La ville et la CARTE, comme sim/monde.js les donne. ----
  const ville = PDR.ville.creerVille(GRAINE, { ilots: R.ilots(N) });
  const E = ville.etendue, S = ville.sites, QG = S.qg;
  const cote = Math.max(E.x1 - E.x0, E.z1 - E.z0), miniCote = Math.ceil(cote * 1000 / 128) / 1000;
  const mx0 = (E.x0 + E.x1) / 2 - miniCote * 64, mz0 = (E.z0 + E.z1) / 2 - miniCote * 64;
  const VNX = Math.ceil((E.x1 - E.x0) / 8), VNZ = Math.ceil((E.z1 - E.z0) / 8);
  const carte = { ilots: ville.ilots, etendue: { x0: E.x0, z0: E.z0, x1: E.x1, z1: E.z1 },
    voile: { nx: VNX, nz: VNZ, x0: E.x0, z0: E.z0, cellule: 8 },
    minicarte: { taille: 128, x0: mx0, z0: mz0, cote: miniCote }, combats: { taille: 64, x0: mx0, z0: mz0, cote: miniCote * 2 } };

  // ---- 100 000 unités en foyers : autour des QG, sur les lieux (deux camps sur les lieux disputés), en colonnes. ----
  const foyers = [];
  for (let f = 0; f < 3; f++) foyers.push({ f, x: QG[f].x, z: QG[f].z, s: 26, w: 4, front: false });
  const lieux0 = [];
  S.lieux.forEach((l, k) => {
    const d = [0, 1, 2].map(f => Math.hypot(l.x - QG[f].x, l.z - QG[f].z)), o = [0, 1, 2].sort((a, b) => d[a] - d[b]);
    const a = o[0], b = o[1], conteste = d[b] < d[a] * 1.6;
    const angA = Math.atan2(QG[a].z - l.z, QG[a].x - l.x), angB = Math.atan2(QG[b].z - l.z, QG[b].x - l.x);
    foyers.push({ f: a, x: l.x + Math.cos(angA) * 7, z: l.z + Math.sin(angA) * 7, s: 15, w: 2.4, front: conteste, lieu: k });
    if (conteste) foyers.push({ f: b, x: l.x + Math.cos(angB) * 13, z: l.z + Math.sin(angB) * 13, s: 14, w: 2, front: true, lieu: k });
    for (let q = 1; q < 5; q++) { const t = q / 5; foyers.push({ f: a, x: QG[a].x + (l.x - QG[a].x) * t, z: QG[a].z + (l.z - QG[a].z) * t, s: 6, w: 0.5, front: false }); }
    lieux0.push({ proprietaire: k % 4 === 3 ? -1 : a, progression: conteste ? 0.35 + 0.1 * (k % 3) : 0, conteste, preneur: conteste ? b : -1 });
  });
  const parFaction = [0, 1, 2].map(f => foyers.filter(o => o.f === f)), poids = parFaction.map(l => l.reduce((s, o) => s + o.w, 0));
  const POIDS_TYPES = [[0.12, 0.55, 0.2, 0.13], [0.12, 0.5, 0.28, 0.1], [0.1, 0.45, 0.25, 0.15, 0.05]];
  const tirer = p => { let r = rd(), k = 0; for (; k < p.length - 1; k++) { r -= p[k]; if (r < 0) break; } return k; };
  const ux = new Float32Array(N), uz = new Float32Array(N), ox = new Float32Array(N), oz = new Float32Array(N);
  const vx = new Float32Array(N), vz = new Float32Array(N), ucap = new Float32Array(N), ucode = new Float32Array(N);
  const ufac = new Uint8Array(N), uetat = new Uint8Array(N), compte = [0, 0, 0];
  const parts = R.FACTIONS.map(f => f.part);
  for (let i = 0; i < N; i++) {
    const r0 = rd(), f = r0 < parts[0] ? 0 : r0 < parts[0] + parts[1] ? 1 : 2;
    let w = rd() * poids[f], o = parFaction[f][0];
    for (const c of parFaction[f]) { w -= c.w; if (w <= 0) { o = c; break; } }
    let x = 0, z = 0;
    for (let essai = 0; essai < 8; essai++) { x = o.x + gauss() * o.s; z = o.z + gauss() * o.s; if (ville.praticable(x, z)) break; }
    const t = R.TYPES_PAR_FACTION[f][tirer(POIDS_TYPES[f])], ouvrier = R.TYPES[t].role === 'ouvrier', q = rd();
    let e;
    if (q < 0.012) e = HJ;
    else if (o.front) e = q < 0.55 ? ET.ATTAQUE : q < 0.75 ? ET.MARCHE : q < 0.87 ? ET.TIENT : ET.REPLI;
    else if (ouvrier) e = q < 0.4 ? ET.RECOLTE : q < 0.5 ? ET.CONSTRUIT : q < 0.7 ? ET.OISIF : ET.MARCHE;
    else e = q < 0.45 ? ET.MARCHE : q < 0.85 ? ET.OISIF : ET.TIENT;
    const cap = rd() * Math.PI * 2, niveau = o.front ? 16 + ((rd() * 47) | 0) : 40 + ((rd() * 23) | 0);
    ux[i] = ox[i] = x; uz[i] = oz[i] = z; ucap[i] = cap; ufac[i] = f; uetat[i] = e;
    const v = e === ET.MARCHE || e === ET.REPLI ? 0.06 : 0;
    vx[i] = Math.sin(cap) * v; vz[i] = Math.cos(cap) * v;
    ucode[i] = R.coder(f, t, e, niveau, 0);
    if (e !== HJ) compte[f]++;
  }
  A.compte = compte;
  A.foyers = foyers;

  // ---- Structures : trois QG, des barricades (une en chantier, une qui brûle), des avant-postes. ----
  function surRue(x, z) {
    for (let r = 0; r < 40; r += 2) for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (ville.praticable(px, pz)) return [px, pz];
    }
    return [x, z];
  }
  const frontC = foyers.find(o => o.f === 0 && o.front) || foyers[0];
  const q0 = QG[0];
  const pt = t => surRue(q0.x + (frontC.x - q0.x) * t, q0.z + (frontC.z - q0.z) * t);
  const [b1x, b1z] = pt(0.72), [b2x, b2z] = pt(0.6), [b3x, b3z] = pt(0.84);
  const fileQG = [{ type: 1, lot: 20, reste: 7.4, total: 12 }, { type: 2, lot: 10, reste: 14, total: 14 }, { type: 0, lot: 10, reste: 10, total: 10 }];
  const structures0 = () => [
    ...QG.map((q, f) => ({ id: f, sorte: 'qg', faction: f, x: q.x, z: q.z, x2: q.x, z2: q.z, pv: 1, pvMax: 1, chantier: false, feu: false,
      occupation: f === 1 ? 0.35 : 0, file: f === 0 ? fileQG.map(o => ({ ...o })) : f === 2 ? [{ type: 9, lot: 6, reste: 5, total: 14 }] : [],
      ralliement: f === 0 ? [q.x + 46, q.z - 12] : null })),
    { id: 10, sorte: 'barricade', faction: 0, x: b1x - 8, z: b1z, x2: b1x + 8, z2: b1z, pv: 520, pvMax: 640, chantier: false, feu: false, occupation: 0, file: [], ralliement: null },
    { id: 11, sorte: 'barricade', faction: 0, x: b2x, z: b2z - 6, x2: b2x, z2: b2z + 6, pv: 90, pvMax: 480, chantier: true, feu: false, occupation: 0, file: [], ralliement: null },
    { id: 12, sorte: 'barricade', faction: 0, x: b3x - 7, z: b3z + 2, x2: b3x + 7, z2: b3z - 2, pv: 210, pvMax: 560, chantier: false, feu: true, occupation: 0, file: [], ralliement: null },
    { id: 13, sorte: 'avant-poste', faction: 1, x: QG[1].x - 120, z: QG[1].z + 40, x2: QG[1].x - 120, z2: QG[1].z + 40, pv: 1500, pvMax: 1500, chantier: false, feu: false, occupation: 0, file: [{ type: 5, lot: 10, reste: 4, total: 14 }], ralliement: null },
    { id: 14, sorte: 'avant-poste', faction: 2, x: QG[2].x + 60, z: QG[2].z + 110, x2: QG[2].x + 60, z2: QG[2].z + 110, pv: 1200, pvMax: 1500, chantier: false, feu: false, occupation: 0, file: [], ralliement: null },
    { id: 15, sorte: 'avant-poste', faction: 0, x: q0.x + 70, z: q0.z + 60, x2: q0.x + 70, z2: q0.z + 60, pv: 300, pvMax: 1500, chantier: true, feu: false, occupation: 0, file: [], ralliement: null },
  ];

  // ---- L'hôte : ce que jeu.js ferait avec hote.js. ----
  let ui = null, options = null, joueur = 0, alliance = null, enCours = false, vitesse = 1, minuteur = 0, minuteurCharge = 0;
  let it = 0, temps = 0, structures = [], versionStructures = 0, envoyees = -1, proposition = null, colereFin = 0, script = {};
  const T0 = 754;   // 12:34 de partie, pour une horloge plausible
  const tampons = [new ArrayBuffer(N * 16), new ArrayBuffer(N * 16)];
  const stocks = Int32Array.from(S.gisements.map((g, k) => (k % 7 === 6 ? 0 : g.stock)));

  function preparer(opt) {
    options = opt; joueur = opt.joueur; alliance = opt.alliance ? opt.alliance.slice() : null;
    it = 0; temps = 0; structures = structures0(); versionStructures++; envoyees = -1; proposition = null; colereFin = 0;
    const moi = joueur >= 0 ? joueur : 0, autre = (moi + 1) % 3, l1 = S.lieux[1] || S.lieux[0], b = structures.find(s => s.sorte === 'barricade');
    script = {
      2: () => [[EV.ATTAQUE_SUBIE, QG[moi].x + 34, QG[moi].z - 6, moi, autre, 0]],
      4: () => [[EV.LIEU_PRIS, l1.x, l1.z, autre, 1, 0]],
      6: () => [[EV.PRODUCTION, QG[moi].x, QG[moi].z, moi, R.TYPES_PAR_FACTION[moi][1], 20]],
      8: () => { if (!alliance) proposition = { de: (moi + 2) % 3, a: moi, reste: 30 }; return alliance ? [] : [[EV.ALLIANCE_PROPOSEE, 0, 0, (moi + 2) % 3, moi, 0]]; },
      10: () => { colereFin = temps + 32; return [[EV.COLERE, QG[1].x, QG[1].z, R.BASTION, 32, 0]]; },
      12: () => [[EV.BARRICADE_LEVEE, b.x, b.z, R.BASTION, 99, 0]],
      14: () => [[EV.GISEMENT_EPUISE, S.gisements[6].x, S.gisements[6].z, -1, 6, 0]],
    };
  }
  function eco() {
    return [0, 1, 2].map(f => ({ moyens: [1240, 860, 1510][f] + Math.floor(temps * 6), materiaux: [386, 612, 270][f] + Math.floor(temps * 2),
      pop: compte[f], popMax: Math.ceil(compte[f] * 1.06 / 100) * 100, score: [1460, 1180, 1290][f] + Math.floor(temps * [3, 2, 2][f]),
      revenu: { moyens: [380, 260, 410][f], materiaux: [124, 210, 96][f] }, oisifs: [14, 6, 3][f], elimine: false,
      qgOccupe: f === 1 ? 0.35 : 0, vivantes: compte[f] }));
  }
  const voileArr = new Uint8Array(VNX * VNZ), vu = new Uint8Array(VNX * VNZ), tmp = new Uint8Array(VNX * VNZ);
  function calculerVoile() {
    vu.fill(0);
    for (let i = 0; i < N; i++) {
      if (uetat[i] === HJ) continue;
      const f = ufac[i];
      if (f !== joueur && !(alliance && alliance.includes(joueur) && alliance.includes(f))) continue;
      const a = ((ux[i] - E.x0) / 8) | 0, b = ((uz[i] - E.z0) / 8) | 0;
      if (a >= 0 && b >= 0 && a < VNX && b < VNZ) vu[a + b * VNX] = 1;
    }
    const RV = 4;
    for (let b = 0; b < VNZ; b++) for (let a = 0; a < VNX; a++) {
      let m = 0;
      for (let d = -RV; d <= RV && !m; d++) { const c = a + d; if (c >= 0 && c < VNX && vu[c + b * VNX]) m = 1; }
      tmp[a + b * VNX] = m;
    }
    for (let b = 0; b < VNZ; b++) for (let a = 0; a < VNX; a++) {
      let m = 0;
      for (let d = -RV; d <= RV && !m; d++) { const c = b + d; if (c >= 0 && c < VNZ && tmp[a + c * VNX]) m = 1; }
      const k = a + b * VNX;
      voileArr[k] = m ? 255 : voileArr[k] ? 26 : 0;
    }
    return voileArr.slice();
  }
  function calculerMini() {
    const m = new Uint16Array(128 * 128 * 3);
    for (let i = 0; i < N; i++) {
      if (uetat[i] === HJ) continue;
      const a = Math.trunc((ux[i] - mx0) / miniCote), b = Math.trunc((uz[i] - mz0) / miniCote);
      if (a < 0 || b < 0 || a >= 128 || b >= 128) continue;
      const k = (a + b * 128) * 3 + ufac[i];
      if (m[k] < 65535) m[k]++;
    }
    return m;
  }
  function calculerCombats() {
    const c = new Uint16Array(64 * 64), cc = miniCote * 2;
    for (let i = 0; i < N; i++) {
      if (uetat[i] !== ET.ATTAQUE || rd() > 0.25) continue;
      const a = Math.trunc((ux[i] - mx0) / cc), b = Math.trunc((uz[i] - mz0) / cc);
      if (a >= 0 && b >= 0 && a < 64 && b < 64) c[a + b * 64]++;
    }
    return c;
  }
  function bouger() {
    for (let i = 0; i < N; i++) {
      const e = uetat[i];
      if (e === HJ) continue;
      if (vx[i] !== 0 || vz[i] !== 0) {
        ux[i] += vx[i]; uz[i] += vz[i];
        const dx = ux[i] - ox[i], dz = uz[i] - oz[i];
        if (dx * dx + dz * dz > 16) { vx[i] = -vx[i]; vz[i] = -vz[i]; }
      } else if (e === ET.ATTAQUE) { ux[i] += (rd() - 0.5) * 0.2; uz[i] += (rd() - 0.5) * 0.2; }
    }
  }
  let derniereMini = null, derniersCombats = null, dernierVoile = null;
  function emettre() {
    it++; temps += 0.05;
    bouger();
    const buf = tampons[it & 1], f32 = new Float32Array(buf);
    for (let i = 0; i < N; i++) { const o = i * 4; f32[o] = ux[i]; f32[o + 1] = uz[i]; f32[o + 2] = ucap[i]; f32[o + 3] = ucode[i]; }
    const evs = script[it] ? script[it]() : [], evenements = new Float32Array(evs.length * 6);
    evs.forEach((v, k) => evenements.set(v, k * 6));
    if (proposition) { proposition.reste -= 0.05; if (proposition.reste <= 0) proposition = null; }
    const mini = it % 10 === 1 ? (derniereMini = calculerMini()) : null;
    const combats = it % 2 === 1 ? (derniersCombats = calculerCombats()) : null;
    const voile = options.brouillard && joueur >= 0 && it % 4 === 1 ? (dernierVoile = calculerVoile()) : null;
    const e = { type: 'etat', it, temps: T0 + temps, vitesse: 1, n: N, unites: buf, eco: eco(), alliance,
      proposition: proposition ? { ...proposition } : null, colere: Math.max(0, colereFin - temps),
      lieux: lieux0.map(l => ({ ...l })), structures: envoyees !== versionStructures ? structures : null, versionStructures,
      cassables: null, gisements: it % 20 === 1 ? stocks : null, voile, minicarte: mini, combats, evenements, vainqueur: -1,
      mesure: { msIteration: 0, msIA: 0, msNav: 0, vivantes: compte[0] + compte[1] + compte[2], champs: 0 } };
    envoyees = versionStructures;
    A.dernierEtat = e; A.f32 = f32;
    const t0 = performance.now();
    ui.etat(e, f32);
    const d = performance.now() - t0;
    A.coutsEtat.push([d, mini ? 1 : 0]);
    if (A.coutsEtat.length > 2000) A.coutsEtat.splice(0, 1000);
    if (it % 4 === 0) A.redessiner = true;
  }
  function arreter() { enCours = false; clearInterval(minuteur); clearTimeout(minuteurCharge); minuteur = 0; minuteurCharge = 0; }
  function demarrer(opt) {
    arreter();
    enCours = true;
    const etapes = [[0.2, 'La ville se dessine.'], [0.5, 'Les instruments s’accordent.'], [0.8, 'Les camps se rassemblent.'], [1, 'C’est parti.']];
    let k = 0;
    const suite = () => {
      if (!enCours) return;
      if (k < etapes.length) { ui.chargement(etapes[k][0], etapes[k][1]); k++; minuteurCharge = setTimeout(suite, 110); return; }
      preparer(opt);
      note('pret', { joueur: opt.joueur });
      if (ui.partie({ options: opt, carte, sites: S, ville }) === false) { arreter(); return; }
      vitesse = 1;
      minuteur = setInterval(() => { if (vitesse > 0 && enCours) emettre(); }, 50);
      emettre();
      A.redessiner = true;
    };
    suite();
  }
  const rappels = {
    nouvellePartie(opt) { note('nouvellePartie', opt); demarrer(opt); },
    demo(opt) { note('demo', opt); demarrer(opt); },
    retourTitre() { note('retourTitre'); arreter(); A.redessiner = true; },
    pause() { note('pause'); vitesse = 0; },
    reprendre() { note('reprendre'); vitesse = 1; },
    recommencer(opt) { note('recommencer'); demarrer(opt); },
    quitter() { note('quitter'); arreter(); },
    ordre(c) { const f = P.forme(c); A.ordres.push(c.t); if (f) A.erreurs.push('ordre mal formé : ' + f + ' ' + JSON.stringify(c)); },
    marque(m) { note('marque', m.sorte); },
    selection() { A.redessiner = true; },
    reglagesChanges(cles) { note('reglages', cles); },
    exporterMusique() { note('exporterMusique'); return true; },
    essaiSon() { note('essaiSon'); return Promise.resolve(true); },
    premierGeste() { note('premierGeste'); },
    ecran(nom, infos) { note('ecran', { nom, joueur: infos ? infos.joueur : null }); A.redessiner = true; },
    ui(nom) { A.sons[nom] = (A.sons[nom] || 0) + 1; },
  };

  // ---- Le décor : la ville de ville.js sous la vraie caméra, en 2D (le vrai jeu la rend en WebGL). ----
  const canvas = document.getElementById('scene'), ctx = canvas.getContext('2d', { alpha: false });
  const camera = CAM.creerCamera(canvas, E, [0.45, 0.8, 0.35]);
  camera.placer((E.x0 + E.x1) / 2, (E.z0 + E.z1) / 2, 640, 0.5);
  const TAN = Math.tan(CAM.FOV * Math.PI / 360);
  let W = 0, H = 0, dpr = 1, cp = null, cr = null, cu = null, cf = null, near = 1, kx = 1, ky = 1;
  const sp = new Float64Array(3);
  function proj(x, y, z) {
    const dx = x - cp[0], dy = y - cp[1], dz = z - cp[2], p = dx * cf[0] + dy * cf[1] + dz * cf[2];
    if (p < near) return false;
    sp[0] = ((dx * cr[0] + dy * cr[1] + dz * cr[2]) * kx / p + 1) * 0.5 * W * dpr;
    sp[1] = (1 - (dx * cu[0] + dy * cu[1] + dz * cu[2]) * ky / p) * 0.5 * H * dpr;
    sp[2] = p;
    return true;
  }
  const plaques = [], blocs = [], arbres = [];
  const teinte = (c, k) => 'rgb(' + Math.round(Math.min(1, c[0] * k) * 255) + ',' + Math.round(Math.min(1, c[1] * k) * 255) + ',' + Math.round(Math.min(1, c[2] * k) * 255) + ')';
  const SOLEIL = [0.45, 0.35];
  for (const o of ville.objets) {
    const r = o.r || [0, 0, 0];
    if (Math.abs(r[0]) > 0.01 || Math.abs(r[2]) > 0.01) continue;
    const [px, py, pz] = o.p, [sx, sy, sz] = o.s, c = Math.cos(r[1]), s = Math.sin(r[1]), hx = sx / 2, hz = sz / 2;
    const col = o.color || [0.5, 0.5, 0.5];
    if (o.shape === 'box' || o.shape === 'bevel') {
      const coins = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => [px + a * c + b * s, pz - a * s + b * c]);
      if (sy >= 2.5) {
        const faces = [];
        for (let k = 0; k < 4; k++) {
          const a = coins[k], b = coins[(k + 1) % 4], nx = b[1] - a[1], nz = -(b[0] - a[0]), l = Math.hypot(nx, nz) || 1;
          const lum = 0.42 + 0.34 * Math.max(0, (nx * SOLEIL[0] + nz * SOLEIL[1]) / l);
          faces.push({ a, b, nx: nx / l, nz: nz / l, mx: (a[0] + b[0]) / 2, mz: (a[1] + b[1]) / 2, style: teinte(col, lum * 0.82) });
        }
        blocs.push({ coins, y0: Math.max(0, py - sy / 2), y1: py + sy / 2, x: px, z: pz, toit: teinte(col, 0.74), faces });
      } else if (sx * sz >= 2.5) plaques.push({ coins, y: py + sy / 2, style: teinte(col, sy > 0.5 ? 0.58 : 0.56) });
    } else if ((o.shape === 'foliage' || o.shape === 'sphere') && sx > 1.5) arbres.push({ x: px, y: py, z: pz, r: Math.max(sx, sz) / 2, style: teinte(col, 0.6) });
  }
  A.decor = { plaques: plaques.length, blocs: blocs.length, arbres: arbres.length };
  const COUL = R.FACTIONS.map(f => f.css);
  const ordreDessin = [];
  function chemin(pts, y) {
    ctx.beginPath();
    for (let k = 0; k < pts.length; k++) { if (!proj(pts[k][0], y, pts[k][1])) return false; if (k) ctx.lineTo(sp[0], sp[1]); else ctx.moveTo(sp[0], sp[1]); }
    ctx.closePath();
    return true;
  }
  function dessiner(v, avecUnites) {
    const w = Math.round(W * dpr), h = Math.round(H * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    cp = v.pos; cr = v.axes.right; cu = v.axes.up; cf = v.axes.forward; near = v.near; kx = 1 / (TAN * (W / H)); ky = 1 / TAN;
    const ciel = ctx.createLinearGradient(0, 0, 0, h);
    ciel.addColorStop(0, '#20262c'); ciel.addColorStop(1, '#2b2f30');
    ctx.fillStyle = ciel; ctx.fillRect(0, 0, w, h);
    for (const p of plaques) { if (chemin(p.coins, p.y)) { ctx.fillStyle = p.style; ctx.fill(); } }
    // Lieux et parvis : anneaux au sol.
    ctx.lineWidth = 2 * dpr;
    for (const l of S.lieux) {
      const pts = []; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; pts.push([l.x + Math.cos(a) * l.rayon, l.z + Math.sin(a) * l.rayon]); }
      if (chemin(pts, 0.2)) { ctx.strokeStyle = 'rgba(240,236,226,.55)'; ctx.setLineDash([6 * dpr, 5 * dpr]); ctx.stroke(); ctx.setLineDash([]); }
    }
    // Bâtiments et arbres, du plus loin au plus proche.
    ordreDessin.length = 0;
    for (const b of blocs) { const dx = b.x - cp[0], dz = b.z - cp[2], p = dx * cf[0] + (b.y1 - cp[1]) * cf[1] + dz * cf[2]; if (p > near) ordreDessin.push([p, b, 0]); }
    for (const a of arbres) { const dx = a.x - cp[0], dz = a.z - cp[2], p = dx * cf[0] + (a.y - cp[1]) * cf[1] + dz * cf[2]; if (p > near) ordreDessin.push([p, a, 1]); }
    ordreDessin.sort((a, b) => b[0] - a[0]);
    ctx.lineWidth = 1;
    for (const [, o, sorte] of ordreDessin) {
      if (sorte === 1) {
        if (!proj(o.x, o.y, o.z)) continue;
        const r = o.r * ky * 0.5 * H * dpr / sp[2];
        ctx.beginPath(); ctx.arc(sp[0], sp[1], Math.max(1, r), 0, Math.PI * 2); ctx.fillStyle = o.style; ctx.fill();
        continue;
      }
      for (const f of o.faces) {
        if (f.nx * (cp[0] - f.mx) + f.nz * (cp[2] - f.mz) <= 0) continue;
        ctx.beginPath();
        if (!proj(f.a[0], o.y0, f.a[1])) continue; ctx.moveTo(sp[0], sp[1]);
        if (!proj(f.b[0], o.y0, f.b[1])) continue; ctx.lineTo(sp[0], sp[1]);
        if (!proj(f.b[0], o.y1, f.b[1])) continue; ctx.lineTo(sp[0], sp[1]);
        if (!proj(f.a[0], o.y1, f.a[1])) continue; ctx.lineTo(sp[0], sp[1]);
        ctx.closePath(); ctx.fillStyle = f.style; ctx.fill();
      }
      if (chemin(o.coins, o.y1)) { ctx.fillStyle = o.toit; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.stroke(); }
    }
    if (!avecUnites) return;
    // Structures.
    for (const s of structures) {
      ctx.lineWidth = 3 * dpr;
      if (s.sorte === 'barricade') {
        if (!proj(s.x, 1, s.z)) continue; const ax = sp[0], ay = sp[1];
        if (!proj(s.x2, 1, s.z2)) continue;
        ctx.save();
        if (s.feu) { ctx.shadowColor = '#ff9a3c'; ctx.shadowBlur = 18 * dpr; }
        ctx.strokeStyle = s.feu ? '#ffb347' : COUL[s.faction]; ctx.lineWidth = Math.max(3, 2400 / sp[2]) * dpr; ctx.lineCap = 'round';
        if (s.chantier) ctx.setLineDash([5 * dpr, 4 * dpr]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(sp[0], sp[1]); ctx.stroke(); ctx.restore();
      } else {
        const r = s.sorte === 'qg' ? 26 : 9, pts = [];
        for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.5; pts.push([s.x + Math.cos(a) * r, s.z + Math.sin(a) * r]); }
        if (chemin(pts, 0.4)) { ctx.strokeStyle = COUL[s.faction]; ctx.globalAlpha = s.chantier ? 0.6 : 1; ctx.stroke(); ctx.globalAlpha = 0.16; ctx.fillStyle = COUL[s.faction]; ctx.fill(); ctx.globalAlpha = 1; }
      }
    }
    // Unités : la sélection d'abord, en clair, puis chaque camp à sa couleur.
    const c = ui && ui.commandes, masque = c && c.selection && c.selection.masque;
    if (masque && c.selection.n) {
      ctx.fillStyle = 'rgba(255,250,235,.95)';
      for (let i = 0; i < N; i++) {
        if (!masque[i] || !proj(ux[i], 0.9, uz[i])) continue;
        const t = Math.min(5, Math.max(2.2, 760 / sp[2])) * dpr;
        ctx.fillRect(sp[0] - t / 2, sp[1] - t / 2, t, t);
      }
    }
    const flou = !!(options && options.brouillard && joueur >= 0 && dernierVoile);
    for (let f = 0; f < 3; f++) {
      ctx.fillStyle = COUL[f];
      for (let i = 0; i < N; i++) {
        if (ufac[i] !== f || uetat[i] === HJ) continue;
        if (flou && f !== joueur) { const a = ((ux[i] - E.x0) / 8) | 0, b = ((uz[i] - E.z0) / 8) | 0; if (!(dernierVoile[a + b * VNX] >= 40)) continue; }
        if (!proj(ux[i], 0.9, uz[i])) continue;
        const t = Math.min(3.6, Math.max(1, 520 / sp[2])) * dpr;
        ctx.fillRect(sp[0] - t / 2, sp[1] - t / 2, t, t);
      }
    }
  }

  // ---- La boucle d'images de jeu.js : camera.vue(dt), le rendu, puis ui.image(t, dt). ----
  let tPrec = 0, clePrec = '';
  function image(t) {
    const dt = tPrec ? Math.min(0.1, (t - tPrec) / 1000) : 1 / 60;
    tPrec = t;
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight; dpr = devicePixelRatio || 1;
    const ecran = ui ? ui.ecran : '';
    if (ecran === 'titre' || ecran === 'reglages' || ecran === 'preparation' || ecran === 'chargement') camera.tourner(0.03 * dt);
    const v = camera.vue(dt), cle = v.pos[0].toFixed(2) + ',' + v.pos[1].toFixed(2) + ',' + v.pos[2].toFixed(2) + ',' + v.yaw.toFixed(4) + ',' + W + 'x' + H + 'x' + dpr;
    if (cle !== clePrec || A.redessiner) {
      clePrec = cle; A.redessiner = false;
      dessiner(v, ecran === 'partie' || ecran === 'pause' || ecran === 'demo' || ecran === 'fin');
    }
    if (ui) {
      const t0 = performance.now();
      ui.image(t, dt);
      A.coutsImage.push([performance.now() - t0, ecran]);
      if (A.coutsImage.length > 4000) A.coutsImage.splice(0, 2000);
    }
    requestAnimationFrame(image);
  }

  let stockage = null;
  try { stockage = window.localStorage; } catch (err) { stockage = null; }
  ui = I.creerInterface({ document, regles: R, protocole: P, stockage, rappels });
  ui.brancher({ canvas, camera });
  A.ui = ui; A.camera = camera; A.carte = carte; A.ville = ville;
  requestAnimationFrame(image);

  // ---- Ce que le pilote appelle. ----
  A.demarrage = () => new Promise(ok => {
    const pas = [[0.08, 'La ville se dessine.'], [0.38, 'Les instruments s’accordent.'], [0.7, 'La simulation se prépare.'], [1, 'Prêt.']];
    let k = 0;
    const suite = () => { if (k < pas.length) { ui.chargement(pas[k][0], pas[k][1]); k++; setTimeout(suite, 150); } else ok(true); };
    suite();
  });
  A.titre = () => { ui.titre(); A.tTitre = performance.now(); note('titre'); return true; };
  A.dernier = quoi => { for (let k = A.journal.length - 1; k >= 0; k--) if (A.journal[k].quoi === quoi) return A.journal[k]; return null; };
  A.compter = quoi => A.journal.filter(j => j.quoi === quoi).length;
  A.vueFront = () => { const o = foyers.find(x => x.f === joueur && x.front) || foyers[joueur]; camera.placer(o.x - 10, o.z + 10, 205, 0.18); A.redessiner = true; return [o.x, o.z]; };
  A.finir = (v, al) => {
    // al : l'alliance à annoncer avant la fin (un dernier état la porte), pour une victoire d'alliance.
    if (al) { alliance = al.slice(); proposition = null; emettre(); }
    const bilan = [0, 1, 2].map(f => ({ produites: [1840, 960, 1120][f], horsJeu: [9120, 6400, 5210][f], infliges: [7020, 8450, 5260][f],
      barricadesPosees: [38, 0, 0][f], barricadesLevees: [0, 21, 14][f], casses: [212, 0, 0][f], lieuxPris: [6, 4, 3][f], recolte: [18400, 12100, 13800][f] }));
    arreter();
    ui.fin({ vainqueur: v, bilan });
    return ui.ecran;
  };
  A.rect = sel => { const e = document.querySelector(sel); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
  A.debordement = () => {
    // Éléments visibles qui sortent de la fenêtre, ou textes coupés sans points de suspension.
    const res = [], w = innerWidth, h = innerHeight;
    for (const e of document.querySelectorAll('#jeu *')) {
      if (e.closest('[hidden]') || e.closest('svg')) continue;
      const st = getComputedStyle(e);
      if (st.display === 'none' || st.visibility === 'hidden' || st.position === 'fixed' && false) continue;
      const b = e.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (e.id === 'scene' || e.id === 'vignette' || e.classList.contains('titre-fond') || e.closest('.titre-fond')) continue;
      if (b.right > w + 1 || b.left < -1) res.push((e.id ? '#' + e.id : e.className ? '.' + String(e.className).split(' ')[0] : e.tagName) + ' x ' + Math.round(b.left) + '..' + Math.round(b.right));
    }
    return { largeurDocument: document.documentElement.scrollWidth, fenetre: w, sorties: res.slice(0, 12) };
  };
  const stats = l => { const s = l.slice().sort((a, b) => a - b), n = s.length; return n ? { n, meilleur: +s[0].toFixed(3), mediane: +s[n >> 1].toFixed(3), p95: +s[Math.min(n - 1, Math.floor(n * 0.95))].toFixed(3), pire: +s[n - 1].toFixed(3) } : { n: 0 }; };
  A.mesurer = () => {
    const c = ui.commandes, w = canvas.clientWidth, h = canvas.clientHeight, sauve = Array.from(c.selection.liste.slice(0, c.selection.n));
    const cadre = [], point = [], etatSans = [], etatAvec = [];
    for (let k = 0; k < 11; k++) { const t0 = performance.now(); c.actions.rectangleSelection(0, 0, w, h, false); cadre.push(performance.now() - t0); }
    const nCadre = c.selection.n;
    for (let k = 0; k < 25; k++) { const t0 = performance.now(); c.actions.pointSelection(w * 0.42 + (k % 5) * 37, h * 0.4 + ((k / 5) | 0) * 29, false, false); point.push(performance.now() - t0); }
    c.actions.rectangleSelection(w * 0.3, h * 0.3, w * 0.6, h * 0.6, false);
    const nSel = c.selection.n, e = A.dernierEtat, f32 = A.f32, vide = new Float32Array(0);
    const sans = { ...e, minicarte: null, combats: null, voile: null, structures: null, evenements: vide };
    const avec = { ...e, minicarte: derniereMini, combats: derniersCombats, voile: dernierVoile, structures: null, evenements: vide };
    for (let k = 0; k < 40; k++) { let t0 = performance.now(); ui.etat(sans, f32); etatSans.push(performance.now() - t0); t0 = performance.now(); ui.etat(avec, f32); etatAvec.push(performance.now() - t0); }
    const enJeu = A.coutsEtat.filter(x => !x[1]).map(x => x[0]), enJeuMini = A.coutsEtat.filter(x => x[1]).map(x => x[0]);
    const images = A.coutsImage.filter(x => x[1] === 'partie').map(x => x[0]), demo = A.coutsImage.filter(x => x[1] === 'demo').map(x => x[0]);
    return { n: N, fenetre: w + 'x' + h, choixCadrePleinEcran: { ...stats(cadre), choisies: nCadre }, choixPoint: stats(point),
      etatRejoueSansMinicarte: { ...stats(etatSans), selection: nSel }, etatRejoueAvecMinicarte: { ...stats(etatAvec), selection: nSel },
      etatEnJeu: stats(enJeu), etatEnJeuAvecMinicarte: stats(enJeuMini), imageEnPartie: stats(images), imageEnDemo: stats(demo), sauve: sauve.length };
  };
  A.pret = true;
})();
'''


def instantane(rel, dossier):
    """La copie de travail d'un module d'un autre agent si elle se lit, sinon celle du dernier commit."""
    chemin = SRC / rel
    r = subprocess.run(['node', '--check', str(chemin)], capture_output=True)
    if r.returncode == 0:
        texte, provenance = chemin.read_text(encoding='utf-8'), 'copie de travail'
    else:
        g = subprocess.run(['git', '-C', str(DEPOT), 'show', f'HEAD:Jeu/src/{rel}'], capture_output=True)
        if g.returncode != 0:
            raise SystemExit(f'{rel} ne se lit pas et n’est pas dans le dernier commit')
        texte, provenance = g.stdout.decode('utf-8'), 'dernier commit (copie de travail illisible)'
    cible = dossier / 'sources' / rel
    cible.parent.mkdir(parents=True, exist_ok=True)
    cible.write_text(texte, encoding='utf-8')
    return texte, provenance


def assembler(dossier):
    gabarit = (SRC / 'index.html').read_text(encoding='utf-8')
    style = (SRC / 'style.css').read_text(encoding='utf-8')
    if gabarit.count('/*STYLE*/') != 1 or gabarit.count('<!--MODULES-->') != 1 or gabarit.count('id="scene"') != 1:
        raise SystemExit('index.html doit contenir une fois /*STYLE*/, <!--MODULES--> et canvas#scene')
    provenances, scripts = {}, []
    for rel in AUTRES:
        texte, provenances[rel] = instantane(rel, dossier)
        scripts.append((rel, texte))
    for rel in INTERFACE:
        texte = (SRC / rel).read_text(encoding='utf-8')
        provenances[rel] = 'copie de travail'
        scripts.append((rel, texte))
    scripts.append(('apercu', APERCU_JS))
    for rel, texte in scripts:
        if '</script' in texte.lower():
            raise SystemExit(f'{rel} contient « </script »')
    fragment = gabarit.replace('/*STYLE*/', style.rstrip('\n')).replace(
        '<!--MODULES-->', '\n'.join(f'<script>\n// ---- {rel} ----\n{texte}</script>' for rel, texte in scripts))
    autonome, n = POLICES.subn('', fragment)
    if n != 1:
        raise SystemExit('index.html doit charger ses polices par une seule ligne <link> vers fonts.googleapis.com')
    if re.search(r'(src|href)="https?:', autonome):
        raise SystemExit('la page charge encore quelque chose d’ailleurs')
    page = ('<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '</head>\n<body>\n' + autonome + '</body>\n</html>\n')
    chemin = dossier / 'apercu-interface.html'
    chemin.write_text(page, encoding='utf-8')
    return chemin, provenances


class Chrome:
    """Chrome sans écran, piloté par tube : les commandes passent par les descripteurs 3 et 4, aucun port."""

    def __init__(self, profil, journal):
        r_cmd, self.w_cmd = os.pipe()
        self.r_res, w_res = os.pipe()
        haut_cmd, haut_res = fcntl.fcntl(r_cmd, fcntl.F_DUPFD, 20), fcntl.fcntl(w_res, fcntl.F_DUPFD, 21)

        def relier():
            os.dup2(haut_cmd, 3, inheritable=True)
            os.dup2(haut_res, 4, inheritable=True)

        self.proc = subprocess.Popen(
            [CHROME, '--headless=new', '--use-angle=metal', '--remote-debugging-pipe', f'--user-data-dir={profil}',
             '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
             '--disable-component-update', '--disable-sync', '--no-pings', '--disable-domain-reliability',
             '--host-resolver-rules=MAP * ~NOTFOUND', '--window-size=1440,900', '--hide-scrollbars', 'about:blank'],
            preexec_fn=relier, close_fds=False, stdout=open(journal, 'wb'), stderr=subprocess.STDOUT)
        for fd in (r_cmd, w_res, haut_cmd, haut_res):
            os.close(fd)
        self.tampon, self.numero, self.evenements, self.session = b'', 0, [], None

    def envoyer(self, methode, params=None, session=True, delai=60):
        self.numero += 1
        message = {'id': self.numero, 'method': methode, 'params': params or {}}
        if session and self.session:
            message['sessionId'] = self.session
        os.write(self.w_cmd, json.dumps(message).encode() + b'\0')
        fin = time.time() + delai
        while time.time() < fin:
            while b'\0' in self.tampon:
                brut, self.tampon = self.tampon.split(b'\0', 1)
                reponse = json.loads(brut)
                if reponse.get('id') == self.numero:
                    if 'error' in reponse:
                        raise RuntimeError(f'{methode} : {reponse["error"]}')
                    return reponse.get('result', {})
                if 'method' in reponse:
                    self.evenements.append(reponse)
            self.tampon += os.read(self.r_res, 1 << 20)
        raise TimeoutError(methode)

    def evaluer(self, expression, delai=60):
        r = self.envoyer('Runtime.evaluate', {'expression': expression, 'awaitPromise': True, 'returnByValue': True}, delai=delai)
        if 'exceptionDetails' in r:
            raise RuntimeError(json.dumps(r['exceptionDetails'], ensure_ascii=False)[:900])
        return r['result'].get('value')

    def attendre(self, condition, delai=10, pas=0.05):
        fin = time.time() + delai
        while time.time() < fin:
            if self.evaluer(f'!!({condition})'):
                return True
            time.sleep(pas)
        return False

    def souris(self, sorte, x, y, bouton='left', boutons=0, clics=1, modifs=0):
        self.envoyer('Input.dispatchMouseEvent', {'type': sorte, 'x': x, 'y': y, 'button': bouton, 'buttons': boutons,
                                                  'clickCount': clics, 'modifiers': modifs})

    def cliquer(self, x, y):
        self.souris('mouseMoved', x, y)
        self.souris('mousePressed', x, y, boutons=1)
        self.souris('mouseReleased', x, y)

    def glisser(self, a, b, etapes=8):
        self.souris('mouseMoved', a[0], a[1])
        self.souris('mousePressed', a[0], a[1], boutons=1)
        for k in range(1, etapes + 1):
            t = k / etapes
            self.souris('mouseMoved', a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, boutons=1)
            time.sleep(0.016)
        self.souris('mouseReleased', b[0], b[1])

    def touche(self, key, code, vk, texte=None, modifs=0, relacher=True):
        p = {'type': 'keyDown' if texte else 'rawKeyDown', 'key': key, 'code': code, 'windowsVirtualKeyCode': vk, 'modifiers': modifs}
        if texte:
            p['text'] = texte
        self.envoyer('Input.dispatchKeyEvent', p)
        if relacher:
            self.envoyer('Input.dispatchKeyEvent', {'type': 'keyUp', 'key': key, 'code': code, 'windowsVirtualKeyCode': vk, 'modifiers': modifs})

    def fermer(self):
        try:
            self.envoyer('Browser.close', session=False, delai=5)
        except Exception:
            pass
        try:
            self.proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    sortie = pathlib.Path(sys.argv[1]).resolve()
    captures = sortie / 'captures'
    captures.mkdir(parents=True, exist_ok=True)
    profil = sortie / 'profil'
    if profil.exists():
        shutil.rmtree(profil)
    page, provenances = assembler(sortie)
    print('page', page, f'{page.stat().st_size} octets', flush=True)
    for rel, d in provenances.items():
        if d != 'copie de travail':
            print('  ', rel, ':', d, flush=True)

    verifs, mesures, fichiers = [], {}, []

    def verifier(nom, ok, detail=''):
        verifs.append({'nom': nom, 'ok': bool(ok), 'detail': detail})
        print(('ok    ' if ok else 'ÉCHEC ') + nom + (f' — {detail}' if detail else ''), flush=True)

    c = Chrome(profil, sortie / 'chrome.log')

    def capture(nom):
        c.evaluer('new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => ok(1))))')
        image = c.envoyer('Page.captureScreenshot', {'format': 'png'})['data']
        chemin = captures / f'{nom}.png'
        chemin.write_bytes(base64.b64decode(image))
        fichiers.append(str(chemin))
        print('capture', chemin, flush=True)

    def centre(sel):
        r = c.evaluer(f'APERCU.rect({json.dumps(sel)})')
        if not r or r[2] <= 0:
            raise RuntimeError(f'{sel} invisible')
        return r[0] + r[2] / 2, r[1] + r[3] / 2

    def ecran():
        return c.evaluer('APERCU.ui.ecran')

    def taille(largeur, hauteur, dpr=1, mobile=False):
        c.envoyer('Emulation.setDeviceMetricsOverride', {'width': largeur, 'height': hauteur, 'deviceScaleFactor': dpr, 'mobile': mobile})
        time.sleep(0.3)

    try:
        cibles = c.envoyer('Target.getTargets', session=False)['targetInfos']
        onglet = next(t for t in cibles if t['type'] == 'page')
        c.session = c.envoyer('Target.attachToTarget', {'targetId': onglet['targetId'], 'flatten': True}, session=False)['sessionId']
        c.envoyer('Page.enable')
        c.envoyer('Runtime.enable')
        c.envoyer('Emulation.setFocusEmulationEnabled', {'enabled': True})
        taille(1440, 900)
        c.envoyer('Page.navigate', {'url': page.as_uri()})
        verifier('la page se charge', c.attendre('window.APERCU && APERCU.pret', 30))
        c.envoyer('Page.bringToFront')
        mesures['decor'] = c.evaluer('APERCU.decor')
        mesures['unites_par_camp'] = c.evaluer('APERCU.compte')
        verifier('document visible (sinon la démo ne part pas)', c.evaluer('document.visibilityState') == 'visible', c.evaluer('document.visibilityState'))

        # ---- Chargement, puis titre. ----
        c.evaluer('(APERCU.ui.chargement(0.62, "Les instruments s’accordent."), 1)')
        verifier('écran de chargement', ecran() == 'chargement')
        time.sleep(0.4)   # la barre glisse en 0,25 s
        capture('chargement')
        c.evaluer('APERCU.demarrage()')
        c.evaluer('APERCU.titre()')
        verifier('écran titre', ecran() == 'titre')
        time.sleep(1.2)
        capture('titre')
        bouton_jouer = centre('#titre-jouer')

        # ---- Démo : elle part 5 s après l'arrivée sur le titre ; un clic ramène au titre sans toucher au bouton dessous. ----
        ok = c.attendre('APERCU.dernier("demo")', 9)
        delai_demo = c.evaluer('APERCU.dernier("demo") && APERCU.dernier("demo").t - APERCU.tTitre')
        verifier('la démo est demandée 5 s après l’arrivée sur le titre', ok and 4950 <= (delai_demo or 0) <= 5700, f'{delai_demo:.0f} ms' if delai_demo else 'jamais')
        opt = c.evaluer('APERCU.dernier("demo").x')
        verifier('options de démo : joueur −1, sans brouillard, effectifs choisis', opt and opt['joueur'] == -1 and opt['brouillard'] is False and opt['effectifs'] == 100000, json.dumps(opt))
        verifier('la démo joue (écran « demo »)', c.attendre('APERCU.ui.ecran === "demo"', 5))
        mesures['demo_delai_ms'] = round(delai_demo or 0)
        time.sleep(3)
        verifier('le réalisateur de camera.js mène la caméra', c.evaluer('!!APERCU.ui.realisateur && !!APERCU.ui.realisateur.plan'),
                 json.dumps(c.evaluer('APERCU.ui.realisateur && APERCU.ui.realisateur.plan && APERCU.ui.realisateur.plan.sorte')))
        capture('demo')
        avant = c.evaluer('APERCU.compter("retourTitre")')
        c.cliquer(*bouton_jouer)
        time.sleep(0.25)
        verifier('un clic pendant la démo ramène au titre', ecran() == 'titre' and c.evaluer('APERCU.compter("retourTitre")') == avant + 1, ecran())
        time.sleep(0.5)
        verifier('le clic de sortie n’active pas le bouton dessous', ecran() == 'titre' and c.evaluer('APERCU.compter("nouvellePartie")') == 0)

        # Bouger la souris sur le titre retient la démo ; puis une touche de modification seule ne la coupe pas, une lettre si.
        n_demo = c.evaluer('APERCU.compter("demo")')
        for k in range(7):
            c.souris('mouseMoved', 300 + 40 * k, 500 + 10 * (k % 2))
            time.sleep(1)
        verifier('bouger la souris sur le titre retient la démo', c.evaluer('APERCU.compter("demo")') == n_demo)
        ok = c.attendre('APERCU.ui.ecran === "demo"', 9)
        verifier('la démo repart après 5 s sans geste', ok)
        c.touche('Shift', 'ShiftLeft', 16, modifs=8)
        time.sleep(0.2)
        verifier('Maj seule ne coupe pas la démo', ecran() == 'demo')
        c.touche('k', 'KeyK', 75, 'k')
        time.sleep(0.25)
        verifier('une touche pendant la démo ramène au titre', ecran() == 'titre')
        # Pendant qu'une démo se prépare (titre affiché), un geste l'annule aussi.
        ok = c.attendre('APERCU.ui.demoDemandee', 9)
        c.cliquer(30, 30)
        time.sleep(0.6)
        verifier('un geste pendant la préparation de la démo l’annule', ok and ecran() == 'titre' and not c.evaluer('APERCU.ui.demoDemandee'), ecran())

        # ---- Préparation. ----
        c.cliquer(*centre('#titre-jouer'))
        verifier('Nouvelle partie ouvre la préparation', c.attendre('APERCU.ui.ecran === "preparation"', 3))
        verifier('trois cartes de camp, Convergence choisie', c.evaluer('document.querySelectorAll("#prep-camps [data-faction]").length === 3 && document.querySelector("#prep-camps [aria-checked=true]").dataset.faction === "0"'))
        capture('preparation')

        # ---- Partie : HUD, sélection au cadre (vrais évènements de souris), visée de barricade, QG. ----
        c.cliquer(*centre('#prep-lancer'))
        verifier('Lancer la partie : écran « partie »', c.attendre('APERCU.ui.ecran === "partie"', 6))
        opt = c.evaluer('APERCU.dernier("nouvellePartie").x')
        verifier('options de partie : joueur 0, alliance null', opt and opt['joueur'] == 0 and opt['alliance'] is None, json.dumps(opt))
        c.attendre('APERCU.dernierEtat && APERCU.dernierEtat.it >= 16', 6)
        c.evaluer('APERCU.vueFront()')
        time.sleep(0.8)
        c.glisser((520, 260), (980, 560))
        time.sleep(0.4)
        n_sel = c.evaluer('APERCU.ui.commandes.selection.n')
        verifier('cadre à la souris : des unités choisies', n_sel > 0, f'{n_sel} unités')
        verifier('carte de commandes : 12 cases pour des unités', c.evaluer('document.querySelectorAll("#commandes-grille .cmd, #commandes-grille .carte-vide").length') >= 12)
        c.souris('mouseMoved', 1300, 140)
        time.sleep(0.4)
        capture('hud')
        rect_b = c.evaluer('APERCU.rect("#commandes-grille [data-cmd=barricade]")')
        c.touche('b', 'KeyB', 66, 'b')
        time.sleep(0.15)
        verifier('B : visée de barricade', c.evaluer('APERCU.ui.commandes.mode') == 'barricade')
        c.souris('mouseMoved', 640, 470)
        c.souris('mousePressed', 640, 470, boutons=1)
        c.souris('mouseReleased', 640, 470)
        for k in range(6):
            c.souris('mouseMoved', 640 + k * 18, 470 - k * 6)
            time.sleep(0.05)
        if rect_b:
            c.souris('mouseMoved', 760, 438)
        time.sleep(0.4)
        verifier('aperçu du segment affiché', c.evaluer('(e => !e.hasAttribute("hidden") && getComputedStyle(e).display !== "none" && e.dataset.sorte === "barricade" && e.querySelector("line").getAttribute("visibility") === "visible")(document.getElementById("apercu"))'))
        capture('hud-visee')
        n_ordres = c.evaluer('APERCU.ordres.length')
        c.cliquer(760, 438)
        time.sleep(0.2)
        verifier('second clic : un ordre BARRICADER bien formé', c.evaluer(f'APERCU.ordres.length > {n_ordres} && APERCU.ordres[APERCU.ordres.length - 1] === PDR.protocole.CMD.BARRICADER'),
                 json.dumps(c.evaluer('APERCU.ordres.slice(-3)')))
        c.cliquer(700, 380)
        time.sleep(0.15)
        c.touche('F3', 'F3', 114)
        time.sleep(0.6)
        verifier('F3 : le QG choisi, sa file affichée', c.evaluer('APERCU.ui.commandes.selection.structure === 0 && document.querySelectorAll("#selection .file-item").length > 0'))
        capture('hud-qg')

        # ---- Mesures, à 100 000 unités, en 1 440 × 900. ----
        c.glisser((420, 220), (1100, 640))
        time.sleep(1.5)
        mesures['interface'] = c.evaluer('APERCU.mesurer()', 120)
        print(json.dumps(mesures['interface'], ensure_ascii=False), flush=True)

        # ---- Pause et réglages : Échap, puis chaque onglet ; une touche en conflit. ----
        c.touche('Escape', 'Escape', 27)
        verifier('Échap : la pause et ses réglages', c.attendre('APERCU.ui.ecran === "pause" && APERCU.ui.panneau.ouvert', 2))
        verifier('la pause arrête la simulation', c.evaluer('APERCU.dernier("pause") !== null'))
        capture('reglages-partie')
        for onglet in ('image', 'audio', 'commandes'):
            c.cliquer(*centre(f'#onglet-{onglet}'))
            time.sleep(0.25)
            verifier(f'onglet {onglet}', c.evaluer(f'document.getElementById("onglet-{onglet}").getAttribute("aria-selected") === "true"'))
            if onglet == 'commandes':
                c.cliquer(*centre('#touches-grille [data-action-touche=attaque][data-rang="0"]'))
                time.sleep(0.15)
                c.touche('s', 'KeyS', 83, 's')
                time.sleep(0.2)
                statut = c.evaluer('document.getElementById("touches-etat").textContent')
                verifier('conflit de touches signalé', 'Arrêt' in (statut or ''), statut)
                c.touche('z', 'KeyZ', 90, 'z')
                time.sleep(0.2)
                verifier('Z assignée à l’attaque, enregistrée', c.evaluer('APERCU.ui.reglages.touches.attaque[0] === "KeyZ" && JSON.parse(localStorage.getItem("pdr.reglages")).touches.attaque[0] === "KeyZ"'))
                c.cliquer(*centre('#touches-grille [data-action-touche=attaque][data-rang="0"]'))
                time.sleep(0.15)
                c.touche('s', 'KeyS', 83, 's')
                time.sleep(0.2)
            capture(f'reglages-{onglet}')
        c.touche('Escape', 'Escape', 27)
        time.sleep(0.15)
        verifier('Échap pendant l’écoute d’une touche : l’écoute s’annule, le panneau reste', ecran() == 'pause' and not c.evaluer('APERCU.ui.panneau.ecoute'))
        c.cliquer(*centre('[data-retablir=commandes]'))
        time.sleep(0.15)
        verifier('rétablir les commandes : A revient', c.evaluer('APERCU.ui.reglages.touches.attaque[0] === "KeyA"'))
        c.touche('Escape', 'Escape', 27)
        verifier('Échap referme : la partie reprend', c.attendre('APERCU.ui.ecran === "partie"', 2) and c.evaluer('APERCU.dernier("reprendre") !== null'))

        # ---- Fin. ----
        verifier('fin de partie : écran « fin »', c.evaluer('APERCU.finir(0)') == 'fin')
        verifier('fin : VICTOIRE et bilan par camp', c.evaluer('document.getElementById("fin-titre").textContent.includes("VICTOIRE") && document.querySelectorAll("#fin-bilan tbody tr").length >= 8'))
        capture('fin')

        # ---- 390 × 844 : titre, préparation, partie, réglages. ----
        c.cliquer(*centre('#fin-retour'))
        verifier('Retour au titre', c.attendre('APERCU.ui.ecran === "titre"', 2))
        taille(390, 844, 2, True)
        time.sleep(0.6)
        capture('titre-390')
        d = c.evaluer('APERCU.debordement()')
        verifier('titre en 390 : rien ne déborde', d['largeurDocument'] <= 390 and not d['sorties'], json.dumps(d, ensure_ascii=False))
        verifier('démo en 390 : elle part aussi sur téléphone', c.attendre('APERCU.ui.ecran === "demo"', 9))
        time.sleep(2.5)
        capture('demo-390')
        d = c.evaluer('APERCU.debordement()')
        verifier('démo en 390 : rien ne déborde', d['largeurDocument'] <= 390 and not d['sorties'], json.dumps(d, ensure_ascii=False))
        c.cliquer(195, 420)
        verifier('démo en 390 : un toucher ramène au titre', c.attendre('APERCU.ui.ecran === "titre"', 3))
        time.sleep(0.3)
        c.cliquer(*centre('#titre-jouer'))
        c.attendre('APERCU.ui.ecran === "preparation"', 3)
        time.sleep(0.3)
        capture('preparation-390')
        d = c.evaluer('APERCU.debordement()')
        verifier('préparation en 390 : rien ne déborde', d['largeurDocument'] <= 390 and not d['sorties'], json.dumps(d, ensure_ascii=False))
        c.cliquer(*centre('#prep-lancer'))
        c.attendre('APERCU.ui.ecran === "partie"', 6)
        c.attendre('APERCU.dernierEtat && APERCU.dernierEtat.it >= 16', 6)
        c.evaluer('APERCU.vueFront()')
        time.sleep(0.6)
        c.glisser((60, 300), (330, 470))
        time.sleep(0.5)
        capture('hud-390')
        d = c.evaluer('APERCU.debordement()')
        verifier('HUD en 390 : rien ne déborde', d['largeurDocument'] <= 390 and not d['sorties'], json.dumps(d, ensure_ascii=False))
        c.touche('Escape', 'Escape', 27)
        c.attendre('APERCU.ui.ecran === "pause"', 2)
        time.sleep(0.3)
        capture('reglages-390')
        c.cliquer(*centre('#onglet-commandes'))
        time.sleep(0.3)
        capture('reglages-commandes-390')
        d = c.evaluer('APERCU.debordement()')
        verifier('réglages en 390 : rien ne déborde', d['largeurDocument'] <= 390 and not d['sorties'], json.dumps(d, ensure_ascii=False))
        c.touche('Escape', 'Escape', 27)
        time.sleep(0.2)
        c.evaluer('APERCU.finir(3, [0, 2])')
        time.sleep(0.3)
        verifier('fin en 390 : victoire de l’alliance, les deux camps nommés',
                 c.evaluer('document.getElementById("fin-titre").textContent.includes("ALLIANCE") && document.getElementById("fin-vainqueur").textContent.includes("ensemble") && document.querySelectorAll("#fin-bilan th[data-gagnant=oui]").length === 2'),
                 c.evaluer('document.getElementById("fin-titre").textContent + " / " + document.getElementById("fin-vainqueur").textContent'))
        capture('fin-390')
        d = c.evaluer('APERCU.debordement()')
        verifier('fin en 390 : rien ne déborde', d['largeurDocument'] <= 390 and not d['sorties'], json.dumps(d, ensure_ascii=False))
        avant = c.evaluer('APERCU.compter("nouvellePartie")')
        c.cliquer(*centre('#fin-rejouer'))
        verifier('Rejouer relance une partie avec les mêmes options', c.attendre('APERCU.ui.ecran === "partie"', 8)
                 and c.evaluer('APERCU.compter("nouvellePartie")') == avant + 1 and c.evaluer('APERCU.dernier("nouvellePartie").x.joueur') == 0)
        c.attendre('APERCU.dernierEtat && APERCU.dernierEtat.it >= 4', 6)
        c.evaluer('APERCU.finir(1)')
        time.sleep(0.3)
        verifier('fin : DÉFAITE quand le Bastion l’emporte',
                 c.evaluer('document.getElementById("fin-titre").textContent === "DÉFAITE" && document.getElementById("fin-vainqueur").textContent.includes("Bastion")'),
                 c.evaluer('document.getElementById("fin-titre").textContent + " / " + document.getElementById("fin-vainqueur").textContent'))
        capture('fin-defaite-390')

        # ---- Bilan de la page. ----
        erreurs = c.evaluer('APERCU.erreurs')
        exceptions = [e for e in c.evenements if e.get('method') == 'Runtime.exceptionThrown']
        consoles = [e for e in c.evenements if e.get('method') == 'Runtime.consoleAPICalled' and e['params'].get('type') in ('error', 'assert')]
        verifier('aucune exception dans la page', not erreurs and not exceptions and not consoles,
                 json.dumps([erreurs, [x['params']['exceptionDetails'].get('text') for x in exceptions][:3],
                             [str(x['params'].get('args'))[:200] for x in consoles][:3]], ensure_ascii=False)[:900])
        verifier('chaque ordre envoyé est bien formé (protocole.forme)', not erreurs, f'{c.evaluer("APERCU.ordres.length")} ordres')
        mesures['sons_interface'] = c.evaluer('APERCU.sons')
        mesures['journal'] = c.evaluer('APERCU.journal.filter(j => j.quoi !== "marque").map(j => j.t + " " + j.quoi)')
    finally:
        c.fermer()

    (sortie / 'mesures.json').write_text(json.dumps({'verifications': verifs, 'mesures': mesures, 'captures': fichiers},
                                                    indent=1, ensure_ascii=False), encoding='utf-8')
    echecs = [v for v in verifs if not v['ok']]
    print(f'{len(verifs) - len(echecs)} vérifications passées, {len(echecs)} échec(s)', flush=True)
    sys.exit(1 if echecs else 0)


if __name__ == '__main__':
    main()
