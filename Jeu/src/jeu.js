// Point de rupture, essai procédural : la ville, le noyau A1 et la foule, rendus par le moteur FERRO 0.6.
// Le noyau tourne à vingt itérations par seconde ; chaque ordre passe par lui (soumettre, deux itérations d'avance).
// Le rendu interpole entre les deux dernières itérations. Les factions n'ont pas encore de règles propres.
(function (PDR) {
  'use strict';

  const { noyau: NOYAU, ville: VILLE, foule: FOULE, camera: CAMERA } = PDR;
  const PAS_MS = 1000 / NOYAU.PAR_SECONDE, MAX_PAS = 4, AVANCE = 2;
  const GRAINE = 1;
  const SOLEIL = [-0.45, 0.62, 0.35];
  const ATMOSPHERE = {
    skyTop: [0.26, 0.42, 0.64], skyBottom: [0.62, 0.70, 0.76], fog: [0.56, 0.63, 0.70],
    sunDirection: SOLEIL, sunColor: [1.62, 1.44, 1.16], ambient: [0.16, 0.185, 0.225],
    wind: 0.5, fogDensity: 0.00025, outdoorZones: [{ x: 0, z: 0, w: 6000, d: 6000 }], biome: 'ville',
  };
  const VENT = [0.62, 0, 0.31];
  const hache = n => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const borner = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lire = cle => { try { return window.localStorage.getItem('pdr.' + cle); } catch (e) { return null; } };
  const ecrire = (cle, v) => { try { window.localStorage.setItem('pdr.' + cle, v); } catch (e) { /* stockage refusé : réglage non retenu */ } };

  function demarrer() {
    const $ = id => document.getElementById(id);
    const canvas = $('scene');
    const echec = message => { $('echec-texte').textContent = message; $('echec').hidden = false; $('hud').hidden = true; };

    let renderer;
    try { renderer = window.FRender.create(canvas); } catch (err) { echec('Le moteur n’a pas pu démarrer : ' + err.message); return; }
    if (renderer.stats.backend !== 'webgl2') {
      renderer.dispose();
      echec('Ce navigateur n’offre pas WebGL 2. L’essai en a besoin : ouvrez-le dans un Chrome, un Safari ou un Firefox récent.');
      return;
    }

    const ville = VILLE.creerVille(GRAINE);
    renderer.setWorld(ville.objets, [], ATMOSPHERE);
    const camera = CAMERA.creerCamera(canvas, ville.etendue, SOLEIL);
    const foule = FOULE.creerFoule(ville);
    const FACTIONS = ville.FACTIONS;

    // ---- Réglages, retenus d'une visite à l'autre quand le navigateur le permet. ----
    const choix = { nombre: Number(lire('nombre')) || 240, humain: Number(lire('humain')) || 0, qualite: lire('qualite') || 'auto' };
    if (![60, 240, 960, 2400].includes(choix.nombre)) choix.nombre = 240;
    if (![0, 1, 2].includes(choix.humain)) choix.humain = 0;
    if (!['auto', 'low', 'high'].includes(choix.qualite)) choix.qualite = 'auto';
    $('nombre').value = String(choix.nombre); $('faction').value = String(choix.humain); $('qualite').value = choix.qualite;
    renderer.resize(choix.qualite);

    // ---- Partie : le noyau, le journal de ses ordres, et ce que le jeu garde à côté (itinéraires, pilote). ----
    let partie = null;
    const selection = new Set();
    const marqueurs = [];
    let temps = 0;

    function nouvellePartie() {
      const enr = new NOYAU.Enregistreur(GRAINE);
      const seq = [0, 0, 0];
      const parFaction = Math.round(choix.nombre / 3);
      for (let f = 0; f < 3; f++) {
        const points = ville.departs(f, parFaction, GRAINE + 4), rd = ville.hasard(1000 + f);
        for (const [x, z] of points) enr.soumettre([0, f, seq[f]++, NOYAU.CREER, Math.round(x * 1000), Math.round(z * 1000), Math.round(110 + rd() * 80)]);
      }
      enr.avancer();
      const suivi = new Map(), parId = new Map();
      for (const e of enr.sim.esc) {
        parId.set(e.id, e);
        suivi.set(e.id, { route: null, envoye: 0, attend: -1, pilote: 'ia', px: e.x, py: e.y, repos: 1 + Math.floor(hache(e.id) * 120) });
      }
      partie = { enr, sim: enr.sim, seq, suivi, parId, rd: VILLE.hasard(GRAINE * 31 + choix.nombre), curseur: 0, ordres: 0 };
      vues.length = 0;
      selection.clear();
      majSelection();
    }

    // ---- Ordres : un itinéraire de la ville, envoyé étape par étape au noyau. ----
    function envoyer(e, s) {
      const [x, z] = s.route[s.envoye];
      const verdict = partie.enr.soumettre([partie.sim.it + AVANCE, e.j, partie.seq[e.j]++, NOYAU.DEPLACER, e.id, Math.round(x * 1000), Math.round(z * 1000)]);
      if (verdict === 'acceptee') partie.ordres++;
      s.envoye++;
      s.attend = partie.sim.it + AVANCE;
    }
    function diriger(e, x, z) {
      const s = partie.suivi.get(e.id);
      s.route = ville.itineraire(e.x / 1000, e.y / 1000, x, z);
      s.envoye = 0;
      envoyer(e, s);
    }
    /** Après chaque itération : l'étape suivante part quand l'escouade est à deux pas et demi de la sienne. */
    function suivre() {
      const { sim, suivi } = partie;
      for (const e of sim.esc) {
        const s = suivi.get(e.id);
        if (!s.route || sim.it <= s.attend) continue;
        if (s.envoye >= s.route.length) {
          if (!e.mv) { s.route = null; s.repos = sim.it + Math.round(NOYAU.PAR_SECONDE * (3 + partie.rd() * 9)); }
          continue;
        }
        const [tx, tz] = s.route[s.envoye - 1], dx = tx * 1000 - e.x, dy = tz * 1000 - e.y;
        if (!e.mv || dx * dx + dy * dy <= (2.5 * e.v) ** 2) envoyer(e, s);
      }
    }

    // ---- Intelligence d'essai : chaque faction a ses lieux. Aucune règle de combat, seulement des déplacements. ----
    const QG = FACTIONS.map(f => ville.centreCellule(f.cellule[0], f.cellule[1]));
    function destination(e) {
      const rd = partie.rd, t = rd(), x = e.x / 1000, z = e.y / 1000;
      const barricade = () => { const b = ville.barricades[Math.floor(rd() * ville.barricades.length)]; return ville.pointAuHasard(rd, b[0], b[1], 35); };
      if (e.j === 0) return t < 0.45 ? ville.pointAuHasard(rd, ville.place[0], ville.place[1], 95) : t < 0.7 ? barricade() : ville.pointAuHasard(rd, x, z, 240);
      if (e.j === 1) return t < 0.4 ? ville.pointAuHasard(rd, QG[1][0], QG[1][1], 130) : t < 0.7 ? barricade() : ville.pointAuHasard(rd, x, z, 240);
      return t < 0.5 ? ville.pointAuHasard(rd, ville.place[0], ville.place[1], 70) : t < 0.8 ? barricade() : ville.pointAuHasard(rd, QG[2][0], QG[2][1], 110);
    }
    function ia() {
      const { sim, suivi } = partie, n = sim.esc.length;
      let budget = 24;
      for (let k = 0; k < n && budget > 0; k++) {
        const e = sim.esc[(partie.curseur + k) % n], s = suivi.get(e.id);
        if (s.pilote !== 'ia' || s.route || e.mv || sim.it < s.repos) continue;
        const [x, z] = destination(e);
        diriger(e, x, z);
        budget--;
      }
      partie.curseur = (partie.curseur + 53) % Math.max(1, n);
    }

    function iteration() {
      const { sim, suivi } = partie;
      for (const e of sim.esc) { const s = suivi.get(e.id); s.px = e.x; s.py = e.y; }
      partie.enr.avancer();
      suivre();
      ia();
    }

    // ---- Ce que voit le rendu : positions interpolées, en mètres. ----
    const vues = [];
    function interpoler(alpha) {
      const { sim, suivi } = partie;
      vues.length = sim.esc.length;
      for (let i = 0; i < sim.esc.length; i++) {
        const e = sim.esc[i], s = suivi.get(e.id);
        const q = vues[i] || (vues[i] = { id: 0, f: 0, x: 0, z: 0, mv: false, v: 0, dx: 0, dz: 0 });
        q.id = e.id; q.f = e.j;
        q.x = (s.px + (e.x - s.px) * alpha) / 1000; q.z = (s.py + (e.y - s.py) * alpha) / 1000;
        q.mv = e.mv || e.x !== s.px || e.y !== s.py;
        q.v = e.v * NOYAU.PAR_SECONDE / 1000;
        q.dx = e.mv ? e.cx - e.x : e.x - s.px; q.dz = e.mv ? e.cy - e.y : e.y - s.py;
      }
      return vues;
    }

    // ---- Sélection et ordres du joueur. ----
    const HAUT = 1.25 * foule.ECHELLE;
    function majSelection() {
      const n = selection.size, puce = $('selection');
      puce.textContent = n ? `${n} ${n > 1 ? 'escouades sélectionnées' : 'escouade sélectionnée'} · clic droit : y aller` : `Aucune sélection · ${FACTIONS[choix.humain].nom} est à vous`;
      puce.dataset.vide = n ? 'non' : 'oui';
    }
    function legende() {
      for (const el of document.querySelectorAll('[data-faction]')) el.dataset.moi = el.dataset.faction === String(choix.humain) ? 'oui' : 'non';
    }
    function aMoi(q) { return q.f === choix.humain; }
    function plusProche(px, py, rayon) {
      let meilleur = null, d2 = rayon * rayon;
      for (const q of vues) {
        if (!aMoi(q)) continue;
        const p = camera.projeter(q.x, ville.sol(q.x, q.z) + HAUT, q.z);
        if (!p) continue;
        const d = (p[0] - px) ** 2 + (p[1] - py) ** 2;
        if (d < d2) { d2 = d; meilleur = q; }
      }
      return meilleur;
    }
    function dansCadre(x0, y0, x1, y1) {
      const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)], [c, d] = [Math.min(y0, y1), Math.max(y0, y1)], liste = [];
      for (const q of vues) {
        if (!aMoi(q)) continue;
        const p = camera.projeter(q.x, ville.sol(q.x, q.z) + HAUT, q.z);
        if (p && p[0] >= a && p[0] <= b && p[1] >= c && p[1] <= d) liste.push(q.id);
      }
      return liste;
    }
    function ordonner(px, py) {
      const cible = camera.pointer(px, py);
      if (!cible || !selection.size) return;
      const liste = [...selection].map(id => partie.parId.get(id)).filter(Boolean);
      // Une grille serrée autour du point visé : chaque escouade a sa place, au plus près d'abord.
      liste.sort((a, b) => Math.hypot(a.x / 1000 - cible[0], a.y / 1000 - cible[1]) - Math.hypot(b.x / 1000 - cible[0], b.y / 1000 - cible[1]));
      const cote = Math.ceil(Math.sqrt(liste.length)), ecart = 6.5;
      liste.forEach((e, k) => {
        const i = k % cote - (cote - 1) / 2, j = Math.floor(k / cote) - (cote - 1) / 2;
        const [x, z] = ville.accrocher(cible[0] + i * ecart, cible[1] + j * ecart);
        partie.suivi.get(e.id).pilote = 'joueur';
        diriger(e, x, z);
      });
      marqueurs.push({ x: cible[0], z: cible[1], t0: temps });
    }
    const actions = {
      cadre: $('cadre'),
      pointSelection(x, y, ajouter, double) {
        const q = plusProche(x, y, 26);
        if (double && q) {
          const w = canvas.clientWidth, h = canvas.clientHeight;
          for (const id of dansCadre(0, 0, w, h)) selection.add(id);
        } else if (q) {
          if (ajouter && selection.has(q.id)) selection.delete(q.id);
          else { if (!ajouter) selection.clear(); selection.add(q.id); }
        } else if (!ajouter) selection.clear();
        majSelection();
      },
      rectangleSelection(x0, y0, x1, y1, ajouter) {
        if (!ajouter) selection.clear();
        for (const id of dansCadre(x0, y0, x1, y1)) selection.add(id);
        majSelection();
      },
      ordre: ordonner,
      toucher(x, y) {
        const q = plusProche(x, y, 34);
        if (q) { selection.clear(); selection.add(q.id); majSelection(); } else if (selection.size) ordonner(x, y);
      },
      toutSelectionner() { for (const q of vues) if (aMoi(q)) selection.add(q.id); majSelection(); },
      deselectionner() { selection.clear(); majSelection(); },
    };
    CAMERA.brancher(canvas, camera, actions);

    // ---- Effets : barricades en feu, anneaux de sélection, repères d'ordre. ----
    function effets(vue, dynamique, lumieres) {
      const oeil = vue.pos;
      ville.barricades.forEach(([bx, bz], b) => {
        const d = Math.hypot(bx - oeil[0], bz - oeil[2], oeil[1]);
        const vacille = 0.82 + 0.12 * Math.sin(temps * 13 + b) + 0.06 * Math.sin(temps * 31 + b * 2);
        lumieres.push({ p: [bx, 1.8, bz], color: [1, 0.46, 0.14], power: 9 * vacille * borner((195 - d) / 45, 0, 1), range: 22 });
        for (let i = 0; i < 9; i++) {
          const g = b * 64 + i, duree = 1.1 + 0.35 * hache(g), age = ((temps + hache(g + 7) * duree) % duree) / duree;
          const a = hache(g + 13) * 6.283, r = 0.5 + 1.7 * hache(g + 19), taille = (1.1 + 0.9 * hache(g + 23)) * (1 - age * 0.45);
          dynamique.push({ shape: 'sphere', p: [bx + Math.cos(a) * r, 0.5 + age * 2.8, bz + Math.sin(a) * r], s: [taille, taille * 1.35, taille],
            r: [age * 0.5, a, 0], mat: 7, fx: true, fxFire: true, alpha: 0.78 * (1 - age) * vacille, emissive: 2.4, color: [1, 0.45, 0.08], outdoor: true });
        }
        for (let i = 0; i < 9; i++) {
          const g = b * 64 + 32 + i, duree = 6 + 2.5 * hache(g), age = ((temps + hache(g + 7) * duree) % duree) / duree;
          const taille = 2.4 + age * 7.5, gris = 0.12 + age * 0.22, j = (hache(g + 11) - 0.5) * 2.5;
          dynamique.push({ shape: 'sphere', p: [bx + VENT[0] * age * 16 + j, 2.6 + age * 19, bz + VENT[2] * age * 16 - j], s: [taille, taille * 0.9, taille],
            r: [0, hache(g) * 6.283, 0], mat: 7, fx: true, alpha: 0.55 * Math.pow(Math.sin(Math.PI * age), 0.8), emissive: 0.05,
            color: [gris, gris * 0.97, gris * 0.93], outdoor: true });
        }
      });
      const grossir = Math.max(1, vue.D / 260);
      for (const q of vues) {
        if (!selection.has(q.id)) continue;
        const y = ville.sol(q.x, q.z), c = FACTIONS[q.f].couleur;
        dynamique.push({ shape: 'ring', p: [q.x, y + 0.06, q.z], s: [9, 0.03, 9], r: [0, 0, 0], mat: 7, fx: true, alpha: 0.82, emissive: 1.2,
          color: c, innerRatio: 0.84, outdoor: true });
        dynamique.push({ shape: 'octa', p: [q.x, y + 6.4 * foule.ECHELLE + 1.2 * grossir, q.z], s: [0.9 * grossir, 1.4 * grossir, 0.9 * grossir],
          r: [0, temps * 1.6, 0], mat: 7, color: c, emissive: 0.9, overlay: true, surface: 'object' });
      }
      for (let k = marqueurs.length - 1; k >= 0; k--) {
        const m = marqueurs[k], age = (temps - m.t0) / 0.9;
        if (age >= 1) { marqueurs.splice(k, 1); continue; }
        const taille = 3 + age * 9;
        dynamique.push({ shape: 'ring', p: [m.x, ville.sol(m.x, m.z) + 0.08, m.z], s: [taille, 0.03, taille], r: [0, 0, 0], mat: 7, fx: true,
          alpha: 0.9 * (1 - age), emissive: 1.4, color: [0.95, 0.97, 1], innerRatio: 0.78, outdoor: true });
      }
    }

    // ---- Mesures affichées. ----
    const mesures = { images: 0, depuis: performance.now(), cpu: 0, ips: 0, ms: 0 };
    const nombreFr = new Intl.NumberFormat('fr-FR');
    function afficher() {
      const st = renderer.stats, m = foule.mesure, sim = partie.sim;
      $('ips').textContent = mesures.ips.toFixed(0);
      $('ms').textContent = mesures.ms.toFixed(1).replace('.', ',');
      const lignes = {
        escouades: nombreFr.format(sim.esc.length) + ' · ' + nombreFr.format(sim.esc.length * 6) + ' figurines',
        vues: nombreFr.format(m.vues) + ' (' + [[m.proches, 'de près'], [m.moyennes, 'à mi-distance'], [m.lointaines, 'au loin'], [m.jetons, 'en jetons']]
          .filter(([n]) => n).map(([n, t]) => nombreFr.format(n) + ' ' + t).join(', ') + ')',
        instances: nombreFr.format(st.instances) + ' dont ' + nombreFr.format(st.crowdInstances || 0) + ' de foule',
        appels: nombreFr.format(st.drawCalls),
        triangles: nombreFr.format(Math.round(st.triangles)),
        resolution: st.width + ' × ' + st.height + ' (rapport ' + (st.pixelRatio || 1).toFixed(2).replace('.', ',') + ')',
        effets: (st.shadows ? 'ombre du soleil' : 'sans ombre') + ' · ' + (st.bloom ? 'halo' : 'sans halo') + ' · ' + (st.msaa ? 'MSAA ×' + st.msaa : 'sans MSAA'),
        iteration: nombreFr.format(sim.it) + ' · ' + nombreFr.format(partie.ordres) + ' ordres',
        empreinte: partie.enr.empreintes[partie.enr.empreintes.length - 1][1],
      };
      for (const [k, v] of Object.entries(lignes)) $('m-' + k).textContent = v;
    }

    // ---- Boucle : itérations fixes du noyau, puis une image interpolée. ----
    let dernier = performance.now(), reste = 0;
    function image(maintenant) {
      window.requestAnimationFrame(image);
      const brut = Math.min(250, Math.max(0, maintenant - dernier));
      dernier = maintenant;
      const dt = brut / 1000, debut = performance.now();
      temps += dt;
      reste += brut;
      let pas = 0;
      while (reste >= PAS_MS && pas < MAX_PAS) { iteration(); reste -= PAS_MS; pas++; }
      if (pas === MAX_PAS && reste > PAS_MS) reste = PAS_MS;
      const vue = camera.vue(dt), lumieres = [], dynamique = [];
      const fx = { time: temps, frameMs: brut, adaptive: true, sunOnly: true, torch: false, lights: lumieres };
      const filtre = renderer.actorFilter(vue, fx);
      fx.instances = foule.composer(interpoler(reste / PAS_MS), vue.pos, filtre, temps, dt);
      effets(vue, dynamique, lumieres);
      renderer.draw(vue, dynamique, fx);
      mesures.cpu += performance.now() - debut;
      mesures.images++;
      if (maintenant - mesures.depuis >= 500) {
        mesures.ips = mesures.images * 1000 / (maintenant - mesures.depuis);
        mesures.ms = mesures.cpu / mesures.images;
        mesures.images = 0; mesures.cpu = 0; mesures.depuis = maintenant;
        afficher();
      }
    }

    // ---- Réglages de la barre. ----
    function viserQuartier() {
      const [x, z] = QG[choix.humain];
      camera.placer(x * 0.75, z * 0.75 + 40, 260, 0);
    }
    $('nombre').addEventListener('change', e => { choix.nombre = Number(e.target.value); ecrire('nombre', choix.nombre); nouvellePartie(); });
    $('faction').addEventListener('change', e => {
      choix.humain = Number(e.target.value); ecrire('humain', choix.humain);
      // Les escouades laissées par le joueur repartent avec l'intelligence d'essai.
      for (const esc of partie.sim.esc) { const s = partie.suivi.get(esc.id); if (esc.j !== choix.humain) s.pilote = 'ia'; }
      selection.clear(); majSelection(); viserQuartier(); legende();
    });
    $('qualite').addEventListener('change', e => { choix.qualite = e.target.value; ecrire('qualite', choix.qualite); renderer.resize(choix.qualite); });
    $('recommencer').addEventListener('click', () => { nouvellePartie(); viserQuartier(); });
    window.addEventListener('resize', () => renderer.resize());

    nouvellePartie();
    viserQuartier();
    legende();
    window.PDR_ESSAI = { renderer, camera, get partie() { return partie; }, selection };
    window.requestAnimationFrame(t => { dernier = t; image(t); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})(globalThis.PDR = globalThis.PDR || {});
