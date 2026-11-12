/* Point de rupture — minicarte, un canevas 2D. Le nord est en haut (z décroissant vers le haut), +x à droite : c'est la
   vue par défaut (lacet 0, camera.js). Couches, de bas en haut : les rues (une fois par partie), la densité des trois
   camps (etat.minicarte), le voile du brouillard, les combats (etat.combats), les lieux, les gisements, les structures,
   les alertes et le trapèze de la caméra. Clic : déplacer la vue ; glisser : la suivre ; clic droit : un ordre.

   const mc = PDR.interface.creerMinicarte({ canvas, regles, rappels: { vue(x, z), ordre(x, z) } });
   mc.partie({ carte, options, sites, ville })   carte : CARTE du protocole ; sites : ville.sites ; ville : praticable()
   mc.etat(etat)                  minicarte, combats, voile, structures, lieux, gisements, alliance
   mc.camera(coins)               quatre points [x, z] du sol aux coins de l'écran (commandes.coinsVue()), ou null
   mc.alerte(x, z, couleur)       une onde de trois secondes
   mc.image(maintenant)           redessine si quelque chose a changé ou s'anime
   mc.demo(oui)                   en démo : ni brouillard ni interaction

   PDR.interface.minicarte : calculs purs (testés sans navigateur) — geometrie(carte), versPixel(g, x, z, taille, sortie),
   versMonde(g, px, py, taille), remplirDensite(donnees, taille, couleurs, rgba, cache), visibilite(g, voile, geomVoile, vu).
   Disposition supposée de etat.minicarte : case par case, camp par camp, indice ((j × taille + i) × 3 + camp), i selon x,
   j selon z ; etat.combats : (j × taille + i). */
(function (PDR) {
  'use strict';

  const I = PDR.interface = PDR.interface || {};
  const SEUIL_VISIBLE = 40;

  /** Carré du monde couvert par la minicarte. Le protocole donne { taille, x0, z0, cote } : « cote » se lit comme le côté
   *  d'une case ou comme le côté entier ; on garde la lecture la plus proche de l'étendue de la ville. */
  function geometrie(carte) {
    const m = carte && carte.minicarte, e = carte && carte.etendue;
    const L = e ? Math.max(e.x1 - e.x0, e.z1 - e.z0) : 0;
    if (!m) {
      const cote = L || 1000;
      return { x0: e ? e.x0 : -cote / 2, z0: e ? e.z0 : -cote / 2, cote, taille: 128, cellule: cote / 128 };
    }
    let cellule = m.cote;
    if (L && Math.abs(m.cote - L) < Math.abs(m.cote * m.taille - L)) cellule = m.cote / m.taille;
    return { x0: m.x0, z0: m.z0, cote: cellule * m.taille, taille: m.taille, cellule };
  }
  function versPixel(g, x, z, taille, sortie) {
    sortie[0] = (x - g.x0) / g.cote * taille;
    sortie[1] = (z - g.z0) / g.cote * taille;
    return sortie;
  }
  function versMonde(g, px, py, taille) {
    return [g.x0 + px / taille * g.cote, g.z0 + py / taille * g.cote];
  }

  /** Visibilité de chaque case de la minicarte d'après le voile du joueur (1 : vue). vu : Uint8Array(taille²). */
  function visibilite(g, voile, gv, vu) {
    if (!voile || !gv) { vu.fill(1); return vu; }
    for (let j = 0, k = 0; j < g.taille; j++) {
      const z = g.z0 + (j + 0.5) * g.cellule, vj = Math.floor((z - gv.z0) / gv.cellule);
      for (let i = 0; i < g.taille; i++, k++) {
        const x = g.x0 + (i + 0.5) * g.cellule, vi = Math.floor((x - gv.x0) / gv.cellule);
        vu[k] = vi >= 0 && vj >= 0 && vi < gv.nx && vj < gv.nz && voile[vi + vj * gv.nx] >= SEUIL_VISIBLE ? 1 : 0;
      }
    }
    return vu;
  }

  /** Densité des camps en pixels RGBA. couleurs : [[r, g, b] × 3] de 0 à 255. cache : null, ou { vu, montre: [b, b, b] } :
   *  les unités d'un camp que le joueur ne montre pas (ni lui ni son allié) sont cachées hors de vue. Le camp dominant
   *  donne la teinte ; quand un deuxième camp pèse au moins un quart, la case s'éclaircit (contact). L'opacité suit le
   *  logarithme du nombre. */
  function remplirDensite(donnees, taille, couleurs, rgba, cache) {
    const n = taille * taille;
    for (let k = 0; k < n; k++) {
      let a = donnees[k * 3], b = donnees[k * 3 + 1], c = donnees[k * 3 + 2];
      if (cache && !cache.vu[k]) {
        if (!cache.montre[0]) a = 0;
        if (!cache.montre[1]) b = 0;
        if (!cache.montre[2]) c = 0;
      }
      const total = a + b + c, o = k * 4;
      if (!total) { rgba[o] = rgba[o + 1] = rgba[o + 2] = rgba[o + 3] = 0; continue; }
      let f = 0, m = a;
      if (b > m) { f = 1; m = b; }
      if (c > m) { f = 2; m = c; }
      const petit = a < b ? (a < c ? a : c) : (b < c ? b : c), second = total - m - petit;
      const col = couleurs[f], eclat = second * 4 >= total ? 0.42 : 0;
      rgba[o] = col[0] + (255 - col[0]) * eclat;
      rgba[o + 1] = col[1] + (244 - col[1]) * eclat;
      rgba[o + 2] = col[2] + (214 - col[2]) * eclat;
      const al = 96 + 159 * Math.log2(1 + total) / 6;
      rgba[o + 3] = al > 255 ? 255 : al;
    }
    return rgba;
  }

  /* ------------------------------------------------------------------------------------------------------------ */

  function creerMinicarte(o) {
    const R = o.regles || PDR.regles, canvas = o.canvas;
    const rappels = Object.assign({ vue() {}, ordre() {} }, o.rappels || {});
    const doc = canvas.ownerDocument, ctx = canvas.getContext('2d');
    const COULEURS = R.FACTIONS.map(f => f.couleur.map(v => Math.round(v * 255)));
    const CSS = R.FACTIONS.map(f => f.css);
    const calque = () => { const c = doc.createElement('canvas'); return [c, c.getContext('2d')]; };
    const [fond, fondCtx] = calque(), [dens, densCtx] = calque(), [brume, brumeCtx] = calque(), [chocs, chocsCtx] = calque();
    let g = geometrie(null), joueur = 0, alliance = null, demo = false, sites = { lieux: [], gisements: [], qg: [] }, ville = null;
    let gv = null, voile = null, lieux = [], structures = [], stocks = null, vu = new Uint8Array(128 * 128);
    let densImage = null, brumeImage = null, chocsImage = null, gc = null;
    let coins = null, sale = true, taillePx = 0, dpr = 1, fondPret = false, derniereDensite = null;
    const alertes = [];
    const tmp = new Float64Array(2);

    function dimensionner() {
      const css = canvas.clientWidth || 200, r = Math.min(2, (doc.defaultView && doc.defaultView.devicePixelRatio) || 1);
      if (css === taillePx && r === dpr) return false;
      taillePx = css; dpr = r;
      canvas.width = Math.round(css * r); canvas.height = Math.round(css * r);
      fondPret = false;
      return true;
    }
    /** Rues et îlots, échantillonnés une fois à la résolution de l'écran. */
    function dessinerFond() {
      const t = canvas.width;
      fond.width = t; fond.height = t;
      const pas = Math.max(1, Math.round(dpr)), img = fondCtx.createImageData(t, t), d = img.data;
      const praticable = ville && typeof ville.praticable === 'function' ? ville.praticable : null;
      for (let py = 0; py < t; py += pas) {
        for (let px = 0; px < t; px += pas) {
          const x = g.x0 + (px + pas / 2) / t * g.cote, z = g.z0 + (py + pas / 2) / t * g.cote;
          let r = 18, v = 23, b = 30;
          if (praticable) { if (praticable(x, z)) { r = 44; v = 51; b = 61; } }
          else if (((px / t * 16) | 0) % 2 === ((py / t * 16) | 0) % 2) { r = 22; v = 27; b = 35; }
          for (let yy = 0; yy < pas && py + yy < t; yy++) for (let xx = 0; xx < pas && px + xx < t; xx++) {
            const q = ((py + yy) * t + px + xx) * 4;
            d[q] = r; d[q + 1] = v; d[q + 2] = b; d[q + 3] = 255;
          }
        }
      }
      fondCtx.putImageData(img, 0, 0);
      fondPret = true;
    }

    function partie(infos) {
      const carte = infos && infos.carte;
      g = geometrie(carte);
      gv = carte && carte.voile ? carte.voile : null;
      gc = carte && carte.combats ? geometrie({ minicarte: carte.combats, etendue: carte.etendue }) : null;
      const opt = (infos && infos.options) || {};
      joueur = opt.joueur >= 0 ? opt.joueur : -1;
      demo = joueur < 0;
      alliance = opt.alliance || null;
      sites = (infos && infos.sites) || { lieux: [], gisements: [], qg: [] };
      ville = (infos && infos.ville) || null;
      vu = new Uint8Array(g.taille * g.taille);
      vu.fill(1);
      dens.width = dens.height = g.taille;
      brume.width = brume.height = g.taille;
      densImage = densCtx.createImageData(g.taille, g.taille);
      brumeImage = brumeCtx.createImageData(g.taille, g.taille);
      if (gc) { chocs.width = chocs.height = gc.taille; chocsImage = chocsCtx.createImageData(gc.taille, gc.taille); }
      voile = null; lieux = []; structures = []; stocks = null; coins = null; alertes.length = 0; derniereDensite = null;
      densCtx.clearRect(0, 0, g.taille, g.taille);
      brumeCtx.clearRect(0, 0, g.taille, g.taille);
      if (gc) chocsCtx.clearRect(0, 0, gc.taille, gc.taille);
      taillePx = 0;
      dimensionner();
      sale = true;
    }

    const montre = [false, false, false];
    function majDensite() {
      if (!derniereDensite || !densImage) return;
      montre[0] = montre[1] = montre[2] = demo;
      if (!demo && joueur >= 0) {
        montre[joueur] = true;
        if (alliance) for (const f of alliance) if (alliance.includes(joueur)) montre[f] = true;
      }
      remplirDensite(derniereDensite, g.taille, COULEURS, densImage.data, demo || !voile ? null : { vu, montre });
      densCtx.putImageData(densImage, 0, 0);
    }
    function majBrume() {
      const d = brumeImage.data;
      for (let k = 0, n = g.taille * g.taille; k < n; k++) {
        const q = k * 4;
        d[q] = 6; d[q + 1] = 8; d[q + 2] = 12; d[q + 3] = vu[k] ? 0 : 150;
      }
      brumeCtx.putImageData(brumeImage, 0, 0);
    }
    function majChocs(combats) {
      const d = chocsImage.data, n = gc.taille * gc.taille;
      for (let k = 0; k < n; k++) {
        const v = combats[k], q = k * 4;
        if (!v) { d[q + 3] = 0; continue; }
        // Hors de vue, les combats des autres restent cachés.
        let cache = false;
        if (!demo && voile && gv) {
          const x = gc.x0 + ((k % gc.taille) + 0.5) * gc.cellule, z = gc.z0 + (((k / gc.taille) | 0) + 0.5) * gc.cellule;
          const vi = Math.floor((x - gv.x0) / gv.cellule), vj = Math.floor((z - gv.z0) / gv.cellule);
          cache = !(vi >= 0 && vj >= 0 && vi < gv.nx && vj < gv.nz && voile[vi + vj * gv.nx] >= SEUIL_VISIBLE);
        }
        if (cache) { d[q + 3] = 0; continue; }
        d[q] = 255; d[q + 1] = 238; d[q + 2] = 190;
        const a = 70 + 60 * Math.log2(1 + v);
        d[q + 3] = a > 255 ? 255 : a;
      }
      chocsCtx.putImageData(chocsImage, 0, 0);
    }

    function etat(e) {
      if (!e) return;
      if (e.alliance !== undefined) alliance = e.alliance;
      if (e.lieux) { lieux = e.lieux; sale = true; }
      if (e.structures) { structures = e.structures; sale = true; }
      if (e.gisements) stocks = e.gisements;
      let densite = false;
      if (e.voile && !demo) { voile = e.voile; visibilite(g, voile, gv, vu); majBrume(); densite = true; }
      if (e.minicarte) { derniereDensite = e.minicarte; densite = true; }
      if (densite) { majDensite(); sale = true; }
      if (e.combats && gc && chocsImage) { majChocs(e.combats); sale = true; }
    }

    function motif(c, f, x, y, r) {
      const m = R.FACTIONS[f] ? R.FACTIONS[f].motif : 'rond';
      c.beginPath();
      if (m === 'carre') c.rect(x - r * 0.86, y - r * 0.86, r * 1.72, r * 1.72);
      else if (m === 'chevron') { c.moveTo(x - r, y + r * 0.7); c.lineTo(x, y - r * 0.9); c.lineTo(x + r, y + r * 0.7); c.lineTo(x, y + r * 0.05); c.closePath(); }
      else c.arc(x, y, r, 0, Math.PI * 2);
    }
    const visible = (x, z) => {
      if (demo || !voile || !gv) return true;
      const i = Math.floor((x - gv.x0) / gv.cellule), j = Math.floor((z - gv.z0) / gv.cellule);
      return i >= 0 && j >= 0 && i < gv.nx && j < gv.nz && voile[i + j * gv.nx] >= SEUIL_VISIBLE;
    };
    const ami = f => f === joueur || (alliance && alliance.includes(joueur) && alliance.includes(f));

    function dessiner(t) {
      const T = canvas.width, k = T / g.cote, c = ctx;
      const px = (x, z) => versPixel(g, x, z, T, tmp);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      if (!fondPret) dessinerFond();
      c.drawImage(fond, 0, 0);
      c.imageSmoothingEnabled = true;
      c.drawImage(dens, 0, 0, T, T);
      if (!demo && voile) c.drawImage(brume, 0, 0, T, T);
      if (gc) { c.globalCompositeOperation = 'lighter'; c.drawImage(chocs, 0, 0, T, T); c.globalCompositeOperation = 'source-over'; }
      const u = dpr;

      // Lieux : anneau clair, intérieur à la couleur du propriétaire, arc de la prise en cours.
      const L = sites.lieux || [];
      for (let q = 0; q < L.length; q++) {
        const l = L[q], s = lieux[q], p = px(l.x, l.z), r = Math.max(4 * u, (l.rayon || 10) * k);
        c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2);
        if (s && s.proprietaire >= 0) { c.fillStyle = CSS[s.proprietaire]; c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1; }
        c.lineWidth = 1.4 * u;
        c.strokeStyle = s && s.conteste && Math.floor(t / 300) % 2 ? '#ffffff' : 'rgba(236,233,226,0.82)';
        c.setLineDash(s && s.proprietaire >= 0 ? [] : [2 * u, 2 * u]);
        c.stroke();
        c.setLineDash([]);
        if (s && s.progression) {
          c.beginPath(); c.arc(p[0], p[1], r + 2.2 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.abs(s.progression)));
          // etat.lieux[].preneur (s'il est là) : le camp qui prend ; sinon l'ambre neutre.
          c.strokeStyle = s.preneur >= 0 && s.preneur <= 2 ? CSS[s.preneur] : '#f0be4a'; c.lineWidth = 2 * u; c.stroke();
        }
      }
      // Gisements : losanges, sarcelle pour les Moyens, sable pour les Matériaux ; vides quand épuisés.
      const G = sites.gisements || [];
      for (let q = 0; q < G.length; q++) {
        const gi = G[q], p = px(gi.x, gi.z), r = 3.2 * u, vide = stocks && stocks[q] <= 0;
        c.beginPath(); c.moveTo(p[0], p[1] - r); c.lineTo(p[0] + r, p[1]); c.lineTo(p[0], p[1] + r); c.lineTo(p[0] - r, p[1]); c.closePath();
        const col = gi.sorte === 'moyens' ? '#6fd3b8' : '#d9a86c';
        if (vide) { c.strokeStyle = 'rgba(167,175,184,0.6)'; c.lineWidth = u; c.stroke(); }
        else { c.fillStyle = col; c.fill(); c.strokeStyle = 'rgba(11,14,18,0.9)'; c.lineWidth = u; c.stroke(); }
      }
      // Structures : barricades en traits, avant-postes et QG par leur motif.
      for (const s of structures) {
        if (!ami(s.faction) && s.sorte !== 'qg' && !visible(s.x, s.z)) continue;
        if (s.sorte === 'barricade') {
          const a = px(s.x, s.z), ax = a[0], ay = a[1], b = px(s.x2, s.z2);
          c.beginPath(); c.moveTo(ax, ay); c.lineTo(b[0], b[1]);
          c.lineCap = 'round';
          c.strokeStyle = 'rgba(11,14,18,0.95)'; c.lineWidth = 4 * u; c.stroke();
          c.strokeStyle = s.feu ? '#ffb347' : CSS[s.faction] || '#ece9e2'; c.lineWidth = 2.2 * u;
          if (s.chantier) c.setLineDash([2 * u, 2 * u]);
          c.stroke(); c.setLineDash([]);
          continue;
        }
        const p = px(s.x, s.z), r = (s.sorte === 'qg' ? 6.5 : 4) * u;
        motif(c, s.faction, p[0], p[1], r + 1.6 * u); c.fillStyle = 'rgba(11,14,18,0.95)'; c.fill();
        motif(c, s.faction, p[0], p[1], r);
        if (s.chantier) { c.strokeStyle = CSS[s.faction]; c.lineWidth = 1.4 * u; c.stroke(); }
        else { c.fillStyle = CSS[s.faction] || '#ece9e2'; c.fill(); }
        if (s.sorte === 'qg' && s.occupation > 0) {
          c.beginPath(); c.arc(p[0], p[1], r + 3.5 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.occupation));
          c.strokeStyle = '#ff6b5a'; c.lineWidth = 2 * u; c.stroke();
        }
      }
      // Alertes : deux ondes qui s'élargissent.
      for (let q = alertes.length - 1; q >= 0; q--) {
        const a = alertes[q], age = (t - a.t0) / 1500;
        if (age >= 2) { alertes.splice(q, 1); continue; }
        const f = age % 1, p = px(a.x, a.z);
        c.beginPath(); c.arc(p[0], p[1], (3 + f * 13) * u, 0, Math.PI * 2);
        c.strokeStyle = a.couleur; c.globalAlpha = 1 - f; c.lineWidth = 2 * u; c.stroke(); c.globalAlpha = 1;
      }
      // Trapèze de la caméra.
      if (coins) {
        c.beginPath();
        for (let q = 0; q < 4; q++) { const p = px(coins[q][0], coins[q][1]); if (q) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }
        c.closePath();
        c.fillStyle = 'rgba(236,233,226,0.07)'; c.fill();
        c.strokeStyle = 'rgba(255,253,246,0.92)'; c.lineWidth = 1.3 * u; c.stroke();
      }
    }

    function image(t) {
      if (dimensionner()) sale = true;
      const anime = alertes.length > 0 || lieux.some(l => l && l.conteste);
      if (!sale && !anime) return;
      sale = false;
      dessiner(t);
    }
    function camera(q) {
      if (!q) { if (coins) { coins = null; sale = true; } return; }
      if (!coins) coins = [[0, 0], [0, 0], [0, 0], [0, 0]];
      let bouge = false;
      for (let k = 0; k < 4; k++) {
        if (Math.abs(coins[k][0] - q[k][0]) > 0.2 || Math.abs(coins[k][1] - q[k][1]) > 0.2) bouge = true;
        coins[k][0] = q[k][0]; coins[k][1] = q[k][1];
      }
      if (bouge) sale = true;
    }

    // ---- Interaction ----
    let glisse = false;
    const monde = e => {
      const b = canvas.getBoundingClientRect(), s = b.width || 1;
      const p = versMonde(g, (e.clientX - b.left) / s * canvas.width, (e.clientY - b.top) / s * canvas.width, canvas.width);
      return p;
    };
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      if (demo) return;
      e.preventDefault();
      const [x, z] = monde(e);
      if (e.button === 2) { rappels.ordre(x, z); return; }
      if (e.button !== 0) return;
      glisse = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* déjà relâché */ }
      rappels.vue(x, z);
    });
    canvas.addEventListener('pointermove', e => { if (glisse) { const [x, z] = monde(e); rappels.vue(x, z); } });
    const fin = () => { glisse = false; };
    canvas.addEventListener('pointerup', fin);
    canvas.addEventListener('pointercancel', fin);

    return {
      partie, etat, image, camera,
      alerte(x, z, couleur) { if (Number.isFinite(x) && Number.isFinite(z)) { alertes.push({ x, z, couleur: couleur || '#ff6b5a', t0: (globalThis.performance || Date).now() }); sale = true; } },
      demo(oui) { demo = !!oui; sale = true; },
      get geometrie() { return g; },
    };
  }

  I.creerMinicarte = creerMinicarte;
  I.minicarte = Object.freeze({ geometrie, versPixel, versMonde, remplirDensite, visibilite, SEUIL_VISIBLE });
})(globalThis.PDR = globalThis.PDR || {});
