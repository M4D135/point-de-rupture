#!/usr/bin/env python3
"""Banc du rendu de Point de rupture.

Une page autonome, écrite dans le dossier de sortie, monte ce que la page du jeu montre : la ville procédurale
(13 îlots pour 100 000 unités, PDR.regles.ilots), le moteur FERRO avec ses retouches, la foule, le décor et la
caméra. Un travailleur (Blob) anime N unités synthétiques à 20 états par seconde, au format du protocole
(ETAT.unites, structures, cassables, gisements, lieux, minicarte, combats, évènements) : des groupes posés dans les
rues, en marche, au contact, en ligne, au travail ou à l'arrêt, des barricades dont certaines brûlent, des avant-postes.

Chrome tourne sans fenêtre et se pilote par tube (--remote-debugging-pipe : aucun port), profil dans le dossier de
sortie, résolution 1440 × 900 à 1 pixel par point, qualité « auto ». Pour chaque vue (défaut D 330 m sur le quartier le
plus peuplé, proche D 60 m sur le plus gros contact, ville entière D 900 m, démo menée par le réalisateur), le banc
mesure plusieurs fois et garde la meilleure mesure (machine chargée) :
  - images par seconde et intervalles entre images (médiane, p95, part au-delà de 25 ms) ;
  - temps CPU par image : le rappel d'image entier (réalisateur, caméra, foule.cadre, decor.cadre, renderer.draw) ;
  - temps CPU par état reçu (real.etat, foule.recevoir, decor.etat), à part : le jeu le paie 20 fois par seconde ;
  - le chrono GPU (EXT_disjoint_timer_query_webgl2), dans resultats.json seulement : sous ANGLE et Metal, il englobe
    l'attente en file (il dépasse la durée d'une image dans le passage sans limite) ; ce n'est pas un coût GPU ;
  - compteurs de la foule (figurines, points) et du moteur (appels, triangles, résolution) ; une capture PNG par vue.
--libre relance le tout sans limite d'images (--disable-gpu-vsync --disable-frame-rate-limit) et sans régulation de la
résolution, pour lire la marge à 1440 × 900. Dans ce passage, le temps CPU par image compte aussi les attentes du tampon
de commandes saturé : seul le passage limité donne le coût CPU.

  python3 Jeu/verifications/banc-rendu.py --sortie DOSSIER [--unites 100000] [--duree 6] [--repetitions 3] [--libre]

Rien n'est écrit hors de DOSSIER (page, profil de Chrome, journal, captures, resultats.json). Code de sortie 1 si une
vue reste sous 55 images par seconde dans le passage limité.
"""
import argparse
import base64
import fcntl
import json
import os
import select
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ICI = Path(__file__).resolve().parent
SRC = (ICI.parent / 'src').resolve()
SCRIPTS = ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'moteur/renderer.js', 'foule.js', 'decor.js', 'camera.js']
CHROMES = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
           '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
CIBLE = 55.0
VUES = ('defaut', 'proche', 'ville', 'demo')
NOMS = {'defaut': 'défaut, D 330 m', 'proche': 'proche, D 60 m', 'ville': 'ville entière, D 900 m', 'demo': 'démo, réalisateur'}

PAGE = '''<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Banc du rendu</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style>
</head><body><canvas id="scene"></canvas>
__SCRIPTS__
<script src="banc.js"></script>
</body></html>
'''

BANC_JS = r'''/* Banc du rendu : page écrite par Jeu/verifications/banc-rendu.py, pilotée par tube. */
(function () {
  'use strict';
  const B = window.BANC = { pret: false, erreurs: [], etape: 'chargement' };
  window.addEventListener('error', e => B.erreurs.push(String(e.message || e) + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '')));
  const attendre = ms => new Promise(r => setTimeout(r, ms));
  const moyenne = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  const quantile = (a, q) => { const b = Float64Array.from(a).sort(); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : NaN; };
  const arrondi = (v, k = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** k) / 10 ** k : null);

  // ---- Le travailleur : N unités synthétiques, 20 états par seconde, au format du protocole. ----
  function GENERATEUR() {
    let d = null, N = 0, it = 0, vs = 0, tampons = [], hj = null, casses = null, casseChange = false, stock = null, mini = null, comb = null;
    const coder = (f, t, e, n, dr) => (f & 3) | ((t & 15) << 2) | ((e & 15) << 6) | ((n & 63) << 10) | ((dr & 255) << 16);
    const hasard = () => Math.random();
    self.onmessage = m => {
      const q = m.data;
      if (q.type === 'demarrer') {
        d = q; N = q.N; hj = new Int32Array(N); casses = new Uint8Array(q.cassables.length / 3); stock = Float64Array.from(q.stock);
        for (let i = 0; i < casses.length; i++) if (hasard() < 0.12) casses[i] = 1;
        casseChange = true;
        mini = new Uint16Array(q.mini.taille * q.mini.taille * 3); comb = new Uint16Array(q.comb.taille * q.comb.taille);
        setInterval(pas, 50);
      } else if (q.type === 'rendre' && q.tampon && q.tampon.byteLength === N * 16 && tampons.length < 4) tampons.push(q.tampon);
    };
    const caseDe = (g, x, z) => {
      const i = Math.floor((x - g.x0) / g.cote), j = Math.floor((z - g.z0) / g.cote);
      return i < 0 || j < 0 || i >= g.taille || j >= g.taille ? -1 : j * g.taille + i;
    };
    function pas() {
      const t0 = performance.now();
      it++;
      const t = it / 20, buf = tampons.pop() || new ArrayBuffer(N * 16), f = new Float32Array(buf), ev = [];
      const C = d.combattants;
      // Mises hors jeu : une dizaine par état au contact ; on s'assied une dizaine de secondes, puis on reprend.
      for (let k = 0; k < 10 && C.length; k++) {
        const i = C[(hasard() * C.length) | 0];
        if (hj[i] > it) continue;
        hj[i] = it + 160 + ((hasard() * 200) | 0);
        ev.push(1, d.maisons[2 * i], d.maisons[2 * i + 1], d.code0[i] & 3, (d.code0[i] >>> 2) & 15, -1);
      }
      const combats = it % 2 === 0, cartes = it % 10 === 0;
      if (combats) comb.fill(0);
      if (cartes) mini.fill(0);
      for (let i = 0; i < N; i++) {
        const o = i * 4, a = d.act[i], ph = d.phase[i];
        let x = d.maisons[2 * i], z = d.maisons[2 * i + 1], cap = d.regard[i], etat = 0, dr = 0;
        if (a === 0) {
          const w = d.omega[i], s = Math.sin(w * t + ph), c = Math.cos(w * t + ph), A = d.amp[i], dx = d.dirs[2 * i], dz = d.dirs[2 * i + 1];
          x += dx * A * s + 0.3 * Math.sin(0.9 * t + ph * 3); z += dz * A * s + 0.3 * Math.cos(0.8 * t + ph * 5);
          cap = Math.atan2(dx * c, dz * c); etat = d.repli[i] ? 8 : 1;
        } else if (a === 1) {
          if (hj[i] > it) etat = 10;
          else {
            x += 0.35 * Math.sin(1.7 * t + ph); z += 0.35 * Math.cos(1.3 * t + ph * 1.3);
            etat = d.capacite[i] && Math.sin(0.4 * t + ph) > 0.8 ? 11 : 2;
            if (((Math.imul(i, 2654435761) + Math.imul(it, 40503)) >>> 0) % 100 < 3) dr |= 2;
            if (combats) { const c = caseDe(d.comb, x, z); if (c >= 0 && comb[c] < 65000) comb[c]++; }
          }
        } else if (a === 2) etat = 9;
        else if (a === 3) {
          etat = d.travail[i];
          if (etat === 4) { const s = Math.sin(0.5 * t + ph); x += d.dirs[2 * i] * 3 * s; z += d.dirs[2 * i + 1] * 3 * s; cap = Math.atan2(d.dirs[2 * i] * Math.cos(0.5 * t + ph), d.dirs[2 * i + 1] * Math.cos(0.5 * t + ph)); }
        }
        if (d.colere[i] && Math.sin(0.2 * t + ph) > 0.6) dr |= 4;
        f[o] = x; f[o + 1] = z; f[o + 2] = cap; f[o + 3] = d.code0[i] | (etat << 6) | (dr << 16);
        if (cartes) { const c = caseDe(d.mini, x, z); if (c >= 0 && mini[c * 3 + (d.code0[i] & 3)] < 65000) mini[c * 3 + (d.code0[i] & 3)]++; }
      }
      // Casse, salves, jets, soins, productions, lieux : de quoi nourrir les effets du décor et le réalisateur.
      if (it % 8 === 0) {
        const k = (hasard() * casses.length) | 0;
        if (!casses[k]) { casses[k] = 1; casseChange = true; ev.push(2, d.cassables[3 * k], d.cassables[3 * k + 1], 0, k, d.cassables[3 * k + 2]); }
      }
      if (it % 400 === 0) { for (let k = 0; k < casses.length; k++) if (hasard() < 0.3) casses[k] = 0; casseChange = true; }
      if (d.salves.length) {
        const s = d.salves[(Math.floor(it / 60) * 7) % d.salves.length];
        if (it % 60 === 0) ev.push(10, s[0], s[1], 2, 9, 1.5);
        if (it % 60 === 30) ev.push(11, s[0], s[1], 2, 9, 40);
      }
      if (it % 10 === 0) for (const i of d.canons) ev.push(12, d.maisons[2 * i], d.maisons[2 * i + 1], 2, d.regard[i], 22);
      if (it % 20 === 0) for (let k = 0; k < d.fanfares.length; k += 7) { const i = d.fanfares[k]; ev.push(25, d.maisons[2 * i], d.maisons[2 * i + 1], 0, 0, 0); }
      if (it % 50 === 0 && d.postes.length) { const p = d.postes[(it / 50) % d.postes.length]; ev.push(13, p[0], p[1], p[2], 1, 10); }
      const lieux = d.lieux.map((l, i) => ({ proprietaire: l.proprietaire, conteste: i % 4 === 1,
        progression: i % 4 === 1 ? Math.sin(t * 0.05 + i) * 0.6 : 0, preneur: i % 4 === 1 ? (l.proprietaire + 1) % 3 : -1 }));
      if (it % 200 === 0) { const k = (it / 200) % d.lieux.length; d.lieux[k].proprietaire = (d.lieux[k].proprietaire + 2) % 3; ev.push(8, d.lieux[k].x, d.lieux[k].z, d.lieux[k].proprietaire, k, 0); }
      // Structures : la liste repart toutes les 5 itérations, un chantier avance (le pire cas du protocole).
      let structures = null;
      if (it === 1 || it % 5 === 0) {
        const s = d.chantiers.length ? d.structures[d.chantiers[(it / 5) % d.chantiers.length | 0]] : null;
        if (s && it > 1) { s.pv = s.pv >= s.pvMax ? s.pvMax * 0.1 : Math.min(s.pvMax, s.pv + s.pvMax * 0.05); }
        structures = d.structures; vs++;
      }
      if (it % 20 === 0) for (let k = 0; k < stock.length; k++) stock[k] = Math.max(0, stock[k] - stock[k] * 0.01 - 1);
      const msg = { type: 'etat', it, temps: t, vitesse: 1, n: N, unites: buf, alliance: null, proposition: null, eco: null, lieux,
        structures, versionStructures: vs, cassables: casseChange ? casses.slice() : null, gisements: it % 20 === 0 ? Int32Array.from(stock) : null,
        voile: null, minicarte: cartes ? mini.slice() : null, combats: combats ? comb.slice() : null, evenements: Float32Array.from(ev),
        mesure: { msIteration: performance.now() - t0 } };
      casseChange = false;
      self.postMessage(msg, [buf]);
    }
  }

  try { demarrer(); } catch (e) { B.erreurs.push('démarrage : ' + ((e && e.stack) || e)); }

  function demarrer() {
    const P = new URLSearchParams(location.search);
    const N = Math.max(1000, Math.min(262144, Number(P.get('unites')) || 100000)), adaptatif = P.get('adaptatif') !== '0';
    const R = PDR.regles;
    const SOLEIL = [-0.45, 0.62, 0.35];
    const ATMOSPHERE = {
      skyTop: [0.26, 0.42, 0.64], skyBottom: [0.62, 0.70, 0.76], fog: [0.56, 0.63, 0.70],
      sunDirection: SOLEIL, sunColor: [1.62, 1.44, 1.16], ambient: [0.16, 0.185, 0.225],
      wind: 0.5, fogDensity: 0.00025, outdoorZones: [{ x: 0, z: 0, w: 6000, d: 6000 }], biome: 'ville',
    };
    const ilots = R.ilots(N);
    let t = performance.now();
    const ville = PDR.ville.creerVille(1, { ilots });
    const msVille = performance.now() - t;
    const canvas = document.getElementById('scene');
    const renderer = window.FRender.create(canvas);
    if (renderer.stats.backend !== 'webgl2') throw new Error('pas de WebGL 2 : ' + renderer.stats.backend);
    renderer.resize('auto');
    t = performance.now();
    renderer.setWorld(ville.objets, [], ATMOSPHERE);
    const msMonde = performance.now() - t;
    const e = ville.etendue, cote = Math.max(e.x1 - e.x0, e.z1 - e.z0);
    const grille = taille => ({ taille, x0: (e.x0 + e.x1) / 2 - cote / 2, z0: (e.z0 + e.z1) / 2 - cote / 2, cote: cote / taille });
    const carte = { ilots, etendue: { ...e }, minicarte: grille(128), combats: grille(64) };
    const foule = PDR.foule.creerFoule(renderer, { ville });
    foule.regler({ joueur: -1, allie: -1, brouillard: false });
    t = performance.now();
    const decor = PDR.decor.creerDecor(ville, { carte, joueur: -1, effectifs: N });
    const msDecor = performance.now() - t;
    t = performance.now();
    const cam = PDR.camera.creerCamera(canvas, e, SOLEIL, { ville });
    const msCamera = performance.now() - t;
    const real = PDR.camera.creerRealisateur(cam, ville, { carte, graine: 5 });
    real.arreter();

    // ---- La population : des groupes posés dans les rues, chacun à une activité. ----
    t = performance.now();
    const rd = ville.hasard(4242);
    const POIDS_TYPES = [[0.12, 0.62, 0.18, 0.08], [0.12, 0.55, 0.25, 0.08], [0.1, 0.45, 0.3, 0.12, 0.03]];
    const maisons = new Float32Array(N * 2), dirs = new Float32Array(N * 2), amp = new Float32Array(N), omega = new Float32Array(N),
      phase = new Float32Array(N), regard = new Float32Array(N), code0 = new Int32Array(N), act = new Uint8Array(N),
      travail = new Uint8Array(N), repli = new Uint8Array(N), capacite = new Uint8Array(N), colere = new Uint8Array(N);
    const combattants = [], canons = [], fanfares = [], salves = [], groupes = [];
    const tirerFaction = () => { const u = rd(); return u < 0.5 ? 0 : u < 0.77 ? 1 : 2; };
    const tirerType = f => { const p = POIDS_TYPES[f], ids = R.TYPES_PAR_FACTION[f]; let u = rd(); for (let k = 0; k < p.length; k++) if ((u -= p[k]) <= 0) return ids[k]; return ids[0]; };
    const auHasard = () => ville.pointAuHasard(rd, e.x0 + rd() * (e.x1 - e.x0), e.z0 + rd() * (e.z1 - e.z0), 30);
    const AXES = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    let n = 0;
    function poser(f, cx, cz, taille, activite, vers) {
      const r = 0.8 * Math.sqrt(taille) + 2, regardGroupe = rd() * Math.PI * 2;
      let axe = [0, 0], A = 0;
      if (activite === 0 || activite === 3) {
        A = activite === 0 ? 5 + rd() * 6 : 3;
        const a0 = (rd() * 4) | 0;
        for (let k = 0; k < 4; k++) {
          const [ax, az] = AXES[(a0 + k) & 3];
          if (ville.praticable(cx + ax * (A + r), cz + az * (A + r)) && ville.praticable(cx - ax * (A + r), cz - az * (A + r))) { axe = [ax, az]; break; }
        }
        if (!axe[0] && !axe[1]) { axe = [1, 0]; A = 0.6; }
      }
      const w = activite === 0 ? (1.1 + rd() * 0.5) / Math.max(1, A) : 0.5, ph = rd() * Math.PI * 2, enRepli = activite === 0 && rd() < 0.12;
      groupes.push({ f, x: cx, z: cz, taille, activite });
      let camion = false;
      for (let k = 0; k < taille && n < N; k++, n++) {
        let type = R.TYPES[tirerType(f)];
        // Un canon à eau au plus par groupe : le monde n'en sort qu'un par ordre et les écarte des autres.
        if (type.vehicule && (camion || taille < 150)) type = R.TYPES[R.BASE[f]];
        if (type.vehicule) camion = true;
        const p = ville.pointAuHasard(rd, cx, cz, type.vehicule ? r * 0.5 : r);
        maisons[2 * n] = p[0]; maisons[2 * n + 1] = p[1]; dirs[2 * n] = axe[0]; dirs[2 * n + 1] = axe[1];
        amp[n] = A; omega[n] = w; phase[n] = ph + rd() * 0.25; act[n] = activite; repli[n] = enRepli ? 1 : 0;
        regard[n] = vers ? Math.atan2(vers[0] - p[0], vers[1] - p[1]) + (rd() - 0.5) * 0.5 : activite === 2 ? regardGroupe : rd() * Math.PI * 2;
        let dr = 0;
        if (type.protege && (activite === 1 || activite === 2)) dr |= 8;
        if (type.vehicule) { dr |= 16; if (f === 2) canons.push(n); }
        if (activite === 3) {
          const ouvrier = type.role === 'ouvrier', u = rd();
          travail[n] = !ouvrier ? (f === 0 ? 7 : 0) : f === 0 ? (u < 0.4 ? 3 : u < 0.75 ? 4 : u < 0.9 ? 5 : 7) : f === 1 ? (u < 0.5 ? 6 : 5) : (u < 0.6 ? 6 : 4);
          if (travail[n] === 4) dr |= 1;
        }
        if (activite === 1) { combattants.push(n); if (f === 2 && type.protege) capacite[n] = 1; }
        if (f === 1 && rd() < 0.15) colere[n] = 1;
        if (type.id === 3) fanfares.push(n);
        code0[n] = R.coder(f, type.id, 0, 24 + ((rd() * 40) | 0), dr);
      }
    }
    while (n < N) {
      const u = rd(), activite = u < 0.42 ? 0 : u < 0.72 ? 1 : u < 0.82 ? 2 : u < 0.92 ? 3 : 4;
      const taille = Math.min(N - n, Math.round(80 + rd() * rd() * 1600)), c = auHasard(), f = tirerFaction();
      if (activite === 1) {
        const a = rd() * Math.PI * 2, dd = 12 + rd() * 8, g = (f + 1 + (rd() < 0.5 ? 1 : 0)) % 3;
        const c2 = ville.pointAuHasard(rd, c[0] + Math.cos(a) * dd, c[1] + Math.sin(a) * dd, 4), moitie = Math.ceil(taille / 2);
        poser(f, c[0], c[1], moitie, 1, c2);
        poser(g, c2[0], c2[1], taille - moitie, 1, c);
        if (f === 2 || g === 2) salves.push(f === 2 ? c : c2);
      } else poser(f, c[0], c[1], taille, activite, null);
    }
    // Des libres en bout de tampon, comme le monde en laisse : faction 3, à sauter.
    for (let k = 0; k < 64 && N - 1 - k * 997 > 0; k++) { code0[N - 1 - k * 997] = R.CODE_LIBRE; act[N - 1 - k * 997] = 4; }

    // ---- Structures : les trois QG, des avant-postes, des barricades (quelques-unes en feu, d'autres en chantier). ----
    const structures = [], chantiers = [], postes = [];
    let id = 0;
    for (const q of ville.sites.qg) structures.push({ id: id++, sorte: 'qg', faction: q.faction, x: q.x, z: q.z, x2: q.x, z2: q.z, pv: 1, pvMax: 1,
      chantier: false, feu: false, occupation: 0, file: [], ralliement: null });
    for (let f = 0; f < 3; f++) {
      const siens = groupes.filter(g => g.f === f);
      for (let k = 0; k < 6 && siens.length; k++) {
        const g = siens[(k * 7) % siens.length], p = ville.pointAuHasard(rd, g.x + 30, g.z + 10, 20), enChantier = k === 0;
        if (enChantier) chantiers.push(structures.length);
        postes.push([p[0], p[1], f]);
        structures.push({ id: id++, sorte: 'avant-poste', faction: f, x: p[0], z: p[1], x2: p[0], z2: p[1], pv: enChantier ? 900 : 1500, pvMax: 1500,
          chantier: enChantier, feu: false, occupation: 0, file: [], ralliement: null });
      }
    }
    for (let k = 0; k < 36; k++) {
      const p = auHasard(), [ax, az] = AXES[(rd() * 2) | 0], L = 8 + rd() * 8, enChantier = k % 9 === 4;
      if (enChantier) chantiers.push(structures.length);
      structures.push({ id: id++, sorte: 'barricade', faction: 0, x: p[0], z: p[1], x2: p[0] + ax * L, z2: p[1] + az * L, pv: enChantier ? 160 : 360 + rd() * 440, pvMax: 800,
        chantier: enChantier, feu: !enChantier && k % 3 === 0, occupation: 0, file: [], ralliement: null });
    }
    const cassables = new Float32Array(ville.sites.cassables.length * 3);
    ville.sites.cassables.forEach((c, i) => { cassables[3 * i] = c.x; cassables[3 * i + 1] = c.z; cassables[3 * i + 2] = PDR.protocole.SORTES_CASSABLES.indexOf(c.sorte); });
    const msPopulation = performance.now() - t;

    // Visées : le quartier le plus peuplé (disque de 120 m) et le plus gros contact.
    const G = 48, dens = new Float32Array(G * G);
    for (let i = 0; i < N; i++) {
      const a = Math.floor((maisons[2 * i] - e.x0) / (e.x1 - e.x0) * G), b = Math.floor((maisons[2 * i + 1] - e.z0) / (e.z1 - e.z0) * G);
      if (a >= 0 && b >= 0 && a < G && b < G) dens[b * G + a]++;
    }
    let meilleur = 0, cible = [(e.x0 + e.x1) / 2, (e.z0 + e.z1) / 2];
    const rc = Math.round(120 / ((e.x1 - e.x0) / G));
    for (let b = 0; b < G; b++) for (let a = 0; a < G; a++) {
      let s = 0;
      for (let j = Math.max(0, b - rc); j <= Math.min(G - 1, b + rc); j++) for (let i = Math.max(0, a - rc); i <= Math.min(G - 1, a + rc); i++) if ((i - a) ** 2 + (j - b) ** 2 <= rc * rc) s += dens[j * G + i];
      if (s > meilleur) { meilleur = s; cible = [e.x0 + (a + 0.5) * (e.x1 - e.x0) / G, e.z0 + (b + 0.5) * (e.z1 - e.z0) / G]; }
    }
    const contact = groupes.filter(g => g.activite === 1).sort((a, b) => b.taille - a.taille)[0] || groupes[0];
    const VISEES = {
      defaut: () => cam.placer(cible[0], cible[1], 330, 0.35),
      proche: () => cam.placer(contact.x, contact.z, 60, 0.6),
      ville: () => cam.placer((e.x0 + e.x1) / 2, (e.z0 + e.z1) / 2, 900, 0),
    };

    // ---- Le travailleur. ----
    const source = '(' + GENERATEUR.toString() + ')();';
    const travailleur = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    travailleur.onerror = ev => B.erreurs.push('travailleur : ' + (ev.message || ev));
    let rec = null, etats = 0;
    travailleur.onmessage = ev => {
      const et = ev.data;
      if (!et || et.type !== 'etat') return;
      const t0 = performance.now();
      const f32 = new Float32Array(et.unites);
      real.etat(et, f32, et.n);
      foule.recevoir(f32, et.n);
      decor.etat(et);
      travailleur.postMessage({ type: 'rendre', tampon: et.unites }, [et.unites]);
      const ms = performance.now() - t0;
      etats++;
      if (rec) { rec.etats.push(ms); rec.decor.push(decor.mesure.msEtat); rec.liste.push(foule.mesure.listeMs); rec.envoi.push(foule.mesure.envoiMs); rec.simu.push(et.mesure.msIteration); if (et.structures) rec.structures++; }
    };
    travailleur.postMessage({ type: 'demarrer', N, maisons, dirs, amp, omega, phase, regard, code0, act, travail, repli, capacite, colere,
      combattants: Int32Array.from(combattants), canons: Int32Array.from(canons.slice(0, 6)), fanfares: Int32Array.from(fanfares), salves,
      structures, chantiers, postes, cassables, stock: ville.sites.gisements.map(g => g.stock * N / 20000),
      lieux: ville.sites.lieux.map((l, i) => ({ x: l.x, z: l.z, proprietaire: i % 3 })), mini: carte.minicarte, comb: carte.combats });

    // ---- Temps GPU, si le navigateur le permet. ----
    const gl = renderer.gl, chrono = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const requetes = [];
    function gpuDebut() {
      if (!chrono || requetes.length > 4) return null;
      const q = gl.createQuery(); gl.beginQuery(chrono.TIME_ELAPSED_EXT, q); return q;
    }
    function gpuFin(q) {
      if (!chrono) return;
      if (q) { gl.endQuery(chrono.TIME_ELAPSED_EXT); requetes.push(q); }
      while (requetes.length && gl.getQueryParameter(requetes[0], gl.QUERY_RESULT_AVAILABLE)) {
        const r = requetes.shift(), ns = gl.getQueryParameter(r, gl.QUERY_RESULT), rompu = gl.getParameter(chrono.GPU_DISJOINT_EXT);
        gl.deleteQuery(r);
        if (rec && !rompu) rec.gpu.push(ns / 1e6);
      }
    }

    // ---- La boucle d'image, celle que jeu.js doit tenir. ----
    const fx = { time: 0, frameMs: 16.7, adaptive: adaptatif, sunOnly: true, torch: false, lights: [], lots: null, foule: null, voile: null };
    let dernier = 0, temps = 0, images = 0;
    function image(maintenant) {
      window.requestAnimationFrame(image);
      const brut = dernier ? Math.min(250, Math.max(0, maintenant - dernier)) : 16.7;
      dernier = maintenant;
      const dt = brut / 1000, debut = performance.now();
      temps += dt;
      real.avancer(dt);
      const vue = cam.vue(dt);
      foule.cadre(vue, temps);
      const d = decor.cadre(vue, temps);
      fx.time = temps; fx.frameMs = brut; fx.lights = d.lumieres; fx.lots = d.lots; fx.foule = foule.fx; fx.voile = foule.fxVoile;
      const q = gpuDebut();
      renderer.draw(vue, d.dynamique, fx);
      gpuFin(q);
      const cpu = performance.now() - debut;
      images++;
      if (rec) {
        rec.horodatages.push(maintenant); rec.cpu.push(cpu);
        const m = foule.mesure;
        rec.proches += m.proches; rec.points += m.pointsDessines; rec.appelsFoule += m.appels; rec.trianglesFoule += m.triangles; rec.dyn += d.dynamique.length;
        if (real.actif && real.plan && rec.plans[rec.plans.length - 1] !== real.plan) rec.plans.push(real.plan);
      }
    }
    window.requestAnimationFrame(image);

    function resumer(nom, r) {
      const k = r.cpu.length, duree = (r.horodatages[k - 1] - r.horodatages[0]) / 1000, iv = [];
      for (let i = 1; i < k; i++) iv.push(r.horodatages[i] - r.horodatages[i - 1]);
      const st = renderer.stats, stats = {};
      for (const [cle, v] of Object.entries(st)) if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') stats[cle] = typeof v === 'number' ? arrondi(v, 3) : v;
      const parEtat = moyenne(r.etats);
      return {
        vue: nom, images: k, duree: arrondi(duree, 2), ips: arrondi((k - 1) / duree, 1),
        intervalle: { mediane: arrondi(quantile(iv, 0.5)), p95: arrondi(quantile(iv, 0.95)), p99: arrondi(quantile(iv, 0.99)), max: arrondi(Math.max(...iv)),
          saccades: arrondi(iv.filter(v => v > 25).length / Math.max(1, iv.length), 4) },
        cpu: { moyenne: arrondi(moyenne(r.cpu), 3), mediane: arrondi(quantile(r.cpu, 0.5), 3), p95: arrondi(quantile(r.cpu, 0.95), 3), max: arrondi(Math.max(...r.cpu), 3) },
        gpu: r.gpu.length ? { moyenne: arrondi(moyenne(r.gpu), 3), p95: arrondi(quantile(r.gpu, 0.95), 3), mesures: r.gpu.length } : null,
        etats: { nombre: r.etats.length, moyenne: arrondi(parEtat, 3), p95: arrondi(quantile(r.etats, 0.95), 3), max: arrondi(Math.max(...r.etats), 3),
          decor: arrondi(moyenne(r.decor), 3), liste: arrondi(moyenne(r.liste), 3), envoi: arrondi(moyenne(r.envoi), 3), simulation: arrondi(moyenne(r.simu), 3),
          structures: r.structures },
        cpuEtatsCompris: arrondi(moyenne(r.cpu) + parEtat * r.etats.length / Math.max(1, k), 3),
        foule: { figurines: Math.round(r.proches / k), points: Math.round(r.points / k), appels: arrondi(r.appelsFoule / k, 1), triangles: Math.round(r.trianglesFoule / k),
          seuil: arrondi(foule.mesure.seuil, 2), candidats: foule.mesure.candidats },
        decor: { dynamique: Math.round(r.dyn / k), instancesLots: decor.mesure.instances, effets: decor.mesure.effets, lumieres: decor.mesure.lumieres },
        moteur: stats,
        camera: { D: arrondi(cam.visee.D, 1), x: arrondi(cam.visee.x, 1), z: arrondi(cam.visee.z, 1) },
        plans: r.plans.map(p => p.sorte),
      };
    }

    B.mesurer = async (nom, duree) => {
      if (nom === 'demo') { if (!real.actif) real.reprendre(); }
      else { real.arreter(); VISEES[nom](); }
      await attendre(nom === 'demo' ? 300 : 1800);
      rec = { horodatages: [], cpu: [], gpu: [], etats: [], decor: [], liste: [], envoi: [], simu: [], structures: 0, proches: 0, points: 0, appelsFoule: 0, trianglesFoule: 0, dyn: 0, plans: [] };
      await attendre(duree);
      const r = rec;
      rec = null;
      return resumer(nom, r);
    };
    // Pour les captures à la main : viser un point, lister les groupes d'une activité (0 marche, 1 contact, 2 ligne, 3 travail, 4 arrêt).
    B.viser = (x, z, D, yaw) => { real.arreter(); cam.placer(x, z, D, yaw); };
    B.groupes = activite => groupes.filter(g => activite === undefined || g.activite === activite).map(g => [arrondi(g.x, 1), arrondi(g.z, 1), g.f, g.taille]);
    B.structures = () => structures.map(s => [s.id, s.sorte, s.faction, arrondi(s.x, 1), arrondi(s.z, 1), s.feu, s.chantier]);
    B.infos = () => {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), fournisseur: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        chronoGpu: !!chrono, adaptatif, navigateur: navigator.userAgent, unites: N, ilots, etendue: e, objetsVille: ville.objets.length, cassables: ville.sites.cassables.length,
        structures: structures.length, groupes: groupes.length, combattants: combattants.length, ecran: [innerWidth, innerHeight, devicePixelRatio],
        toile: [canvas.width, canvas.height], ms: { ville: arrondi(msVille, 1), monde: arrondi(msMonde, 1), decor: arrondi(msDecor, 1), camera: arrondi(msCamera, 1), population: arrondi(msPopulation, 1) },
        visees: { defaut: [arrondi(cible[0], 1), arrondi(cible[1], 1), meilleur], proche: [arrondi(contact.x, 1), arrondi(contact.z, 1), contact.taille] },
      };
    };
    // Prêt quand les états arrivent et que soixante images sont passées.
    const guetter = () => { if (etats >= 3 && images >= 60) { B.pret = true; B.etape = 'pret'; } else setTimeout(guetter, 100); };
    B.etape = 'attente des états';
    guetter();
  }
})();
'''


class Tube:
    """Chrome piloté par --remote-debugging-pipe : il lit les commandes sur le descripteur 3 et écrit sur le 4,
    messages JSON terminés par un octet nul. Aucun port n'est ouvert."""

    def __init__(self, chrome, drapeaux, journal):
        vers_chrome_lu, self.ecrit = os.pipe()
        self.lu, de_chrome_ecrit = os.pipe()
        # Hors de portée de 3 et 4, pour que dup2 ne s'écrase pas lui-même dans le fils.
        hauts = [fcntl.fcntl(fd, fcntl.F_DUPFD_CLOEXEC, 10) for fd in (vers_chrome_lu, de_chrome_ecrit)]
        os.close(vers_chrome_lu)
        os.close(de_chrome_ecrit)

        def preparer():
            os.dup2(hauts[0], 3)
            os.dup2(hauts[1], 4)

        # close_fds=False : tout ce que Python ouvre est déjà marqué « fermé à l'exec » ; seuls 0, 1, 2, 3 et 4 passent.
        self.proc = subprocess.Popen([chrome, *drapeaux], stdin=subprocess.DEVNULL, stdout=journal, stderr=journal,
                                     close_fds=False, preexec_fn=preparer)
        for fd in hauts:
            os.close(fd)
        self.tampon = b''
        self.n = 0
        self.evenements = []

    def lire(self, delai):
        fin = time.monotonic() + delai
        while b'\0' not in self.tampon:
            reste = fin - time.monotonic()
            if reste <= 0:
                raise TimeoutError('Chrome ne répond pas')
            prets, _, _ = select.select([self.lu], [], [], reste)
            if prets:
                bloc = os.read(self.lu, 1 << 20)
                if not bloc:
                    raise RuntimeError('Chrome a fermé le tube (code ' + str(self.proc.poll()) + ')')
                self.tampon += bloc
        message, _, self.tampon = self.tampon.partition(b'\0')
        return json.loads(message)

    def envoyer(self, methode, params=None, session=None, delai=60):
        self.n += 1
        m = {'id': self.n, 'method': methode, 'params': params or {}}
        if session:
            m['sessionId'] = session
        donnees = json.dumps(m).encode() + b'\0'
        while donnees:
            donnees = donnees[os.write(self.ecrit, donnees):]
        while True:
            r = self.lire(delai)
            if r.get('id') == self.n:
                if 'error' in r:
                    raise RuntimeError(methode + ' : ' + json.dumps(r['error'], ensure_ascii=False))
                return r.get('result', {})
            self.evenements.append(r)

    def fermer(self):
        for fd in (self.ecrit, self.lu):
            try:
                os.close(fd)
            except OSError:
                pass
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait(timeout=10)


def drapeaux(profil, libre):
    d = ['--headless', '--remote-debugging-pipe', '--user-data-dir=' + str(profil), '--window-size=1440,900',
         '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-default-apps', '--disable-sync',
         '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--no-pings',
         '--disable-breakpad', '--metrics-recording-only', '--mute-audio', '--no-proxy-server', '--password-store=basic',
         '--use-mock-keychain', '--host-resolver-rules=MAP * ~NOTFOUND',
         '--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider',
         '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']
    if libre:
        d += ['--disable-gpu-vsync', '--disable-frame-rate-limit']
    return d + ['about:blank']


def erreurs_console(evenements):
    sortie = []
    for e in evenements:
        p = e.get('params', {})
        if e.get('method') == 'Runtime.exceptionThrown':
            d = p.get('exceptionDetails', {})
            sortie.append('exception : ' + (d.get('exception', {}).get('description') or d.get('text', '')))
        elif e.get('method') == 'Runtime.consoleAPICalled' and p.get('type') in ('error', 'warning'):
            sortie.append(p.get('type') + ' : ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in p.get('args', [])))
    return sortie


def passage(chrome, sortie, page, args, libre, vues):
    nom = 'libre' if libre else 'limite'
    profil = sortie / ('profil-' + nom)
    shutil.rmtree(profil, ignore_errors=True)
    with open(sortie / ('chrome-' + nom + '.log'), 'wb') as journal:
        t = Tube(chrome, drapeaux(profil, libre), journal)
        try:
            cible = t.envoyer('Target.createTarget', {'url': 'about:blank'})['targetId']
            s = t.envoyer('Target.attachToTarget', {'targetId': cible, 'flatten': True})['sessionId']
            t.envoyer('Page.enable', session=s)
            t.envoyer('Runtime.enable', session=s)
            t.envoyer('Emulation.setDeviceMetricsOverride', {'width': 1440, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False}, session=s)
            t.envoyer('Emulation.setFocusEmulationEnabled', {'enabled': True}, session=s)
            # Sans limite, la résolution reste fixe (pas de régulation) : la marge se lit à 1440 × 900.
            t.envoyer('Page.navigate', {'url': page.as_uri() + '?unites=%d&adaptatif=%d' % (args.unites, 0 if libre else 1)}, session=s)

            def evaluer(expression, delai=60):
                r = t.envoyer('Runtime.evaluate', {'expression': expression, 'awaitPromise': True, 'returnByValue': True}, session=s, delai=delai)
                if 'exceptionDetails' in r:
                    d = r['exceptionDetails']
                    raise RuntimeError(expression + ' : ' + (d.get('exception', {}).get('description') or d.get('text', '')))
                return r.get('result', {}).get('value')

            debut = time.monotonic()
            while True:
                etat = evaluer('window.BANC ? [BANC.pret, BANC.etape, BANC.erreurs] : [false, "chargement", []]')
                if etat[2]:
                    raise RuntimeError('la page a échoué : ' + ' | '.join(etat[2]))
                if etat[0]:
                    break
                if time.monotonic() - debut > 180:
                    raise TimeoutError('page pas prête après 180 s (' + str(etat[1]) + ')')
                time.sleep(0.25)
            infos = evaluer('BANC.infos()')
            infos['msPret'] = round((time.monotonic() - debut) * 1000)
            mesures = {}
            captures = {}
            for vue in vues:
                mesures[vue] = [evaluer('BANC.mesurer(%s, %d)' % (json.dumps(vue), args.duree * 1000), delai=args.duree + 90)
                                for _ in range(args.repetitions)]
                if not libre:
                    png = t.envoyer('Page.captureScreenshot', {'format': 'png'}, session=s, delai=60)['data']
                    chemin = sortie / ('capture-' + vue + '.png')
                    chemin.write_bytes(base64.b64decode(png))
                    captures[vue] = str(chemin)
            erreurs = evaluer('BANC.erreurs') + erreurs_console(t.evenements)
        finally:
            try:
                t.envoyer('Browser.close', delai=10)
            except Exception:
                pass
            t.fermer()
    return {'passage': nom, 'infos': infos, 'mesures': mesures, 'captures': captures, 'erreurs': erreurs}


def meilleure(liste):
    return max(liste, key=lambda m: (m['ips'], -m['cpu']['moyenne']))


def tableau(resultat):
    lignes = []
    entete = '%-24s %14s %8s %19s %15s %10s %9s %9s' % ('vue', 'i/s (médiane)', 'p95 ms', 'CPU/image ms (p95)', 'état ms (p95)',
                                                         'image', 'figurines', 'points')
    lignes.append(entete)
    for vue, liste in resultat['mesures'].items():
        m = meilleure(liste)
        med = statistics.median(x['ips'] for x in liste)
        image = '%sx%s' % (m['moteur'].get('width'), m['moteur'].get('height'))
        lignes.append('%-24s %6.1f (%5.1f) %8.2f %11.2f (%5.2f) %7.2f (%5.2f) %10s %9d %9d' % (
            NOMS.get(vue, vue), m['ips'], med, m['intervalle']['p95'], m['cpu']['moyenne'], m['cpu']['p95'],
            m['etats']['moyenne'], m['etats']['p95'], image, m['foule']['figurines'], m['foule']['points']))
    return '\n'.join(lignes)


def principal():
    p = argparse.ArgumentParser(description='Banc du rendu de Point de rupture (Chrome sans fenêtre, piloté par tube).')
    p.add_argument('--sortie', type=Path, default=None, help='dossier de travail (page, profil, captures, résultats)')
    p.add_argument('--unites', type=int, default=100000)
    p.add_argument('--duree', type=int, default=6, help='secondes par mesure')
    p.add_argument('--repetitions', type=int, default=3)
    p.add_argument('--vues', default=','.join(VUES))
    p.add_argument('--libre', action='store_true', help='ajoute un passage sans limite d\'images')
    p.add_argument('--chrome', default=os.environ.get('CHROME'))
    args = p.parse_args()
    chrome = args.chrome or next((c for c in CHROMES if Path(c).exists()), None)
    if not chrome:
        sys.exit('Chrome introuvable : --chrome CHEMIN ou CHROME=…')
    sortie = (args.sortie or Path(tempfile.mkdtemp(prefix='pdr-banc-rendu-'))).resolve()
    sortie.mkdir(parents=True, exist_ok=True)
    vues = [v for v in args.vues.split(',') if v]
    for v in vues:
        if v not in VUES:
            sys.exit('vue inconnue : ' + v)
    scripts = '\n'.join('<script src="%s"></script>' % (SRC / f).as_uri() for f in SCRIPTS)
    page = sortie / 'banc.html'
    page.write_text(PAGE.replace('__SCRIPTS__', scripts), encoding='utf-8')
    (sortie / 'banc.js').write_text(BANC_JS, encoding='utf-8')
    version = subprocess.run([chrome, '--version'], capture_output=True, text=True).stdout.strip()
    charge = os.getloadavg()
    resultats = {'chrome': version, 'chargeAvant': [round(x, 2) for x in charge], 'unites': args.unites, 'duree': args.duree,
                 'repetitions': args.repetitions, 'passages': []}
    for libre in ([False, True] if args.libre else [False]):
        r = passage(chrome, sortie, page, args, libre, vues)
        resultats['passages'].append(r)
        print('\n== passage %s · %s · GPU %s · toile %s · charge %s' % (
            'sans limite' if libre else 'limité', version, r['infos']['gpu'], 'x'.join(map(str, r['infos']['toile'])),
            ' '.join('%.1f' % x for x in os.getloadavg())))
        print(tableau(r))
        for e in r['erreurs']:
            print('  ! ' + e)
    resultats['chargeApres'] = [round(x, 2) for x in os.getloadavg()]
    (sortie / 'resultats.json').write_text(json.dumps(resultats, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print('\nrésultats : ' + str(sortie / 'resultats.json'))
    limite = resultats['passages'][0]
    for vue, chemin in limite['captures'].items():
        print('capture %-8s %s' % (vue, chemin))
    sous = [v for v, l in limite['mesures'].items() if meilleure(l)['ips'] < CIBLE]
    if sous:
        print('sous %d i/s : %s' % (CIBLE, ', '.join(sous)))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(principal())
