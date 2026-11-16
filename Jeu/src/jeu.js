/* Point de rupture — essai 0.2 : la page. Elle relie l'interface (interface/*.js), la simulation dans son travailleur
   (hote.js, sim/*.js), le rendu de FERRO (moteur/renderer.js, foule.js, decor.js, camera.js) et le son (moteur/audio.js,
   moteur/musique.js, son.js). Ce fichier ne fait que du câblage : chaque module documente son API en tête.

   Démarrage : interface, moteur, caméra, ville d'accueil (elle tourne lentement derrière l'écran titre), sons
   précalculés, puis l'écran titre ; sans geste pendant 5 s, la démo part seule (titre.js) : trois IA, filmées par le
   réalisateur de camera.js. Une partie ou une démo : hote.demarrer(options) → « pret » (la page refait la même ville,
   PDR.protocole.villeDe) → « etat » vingt fois par seconde × vitesse (on garde le dernier tampon ; celui d'avant
   retourne au travailleur) → « fin ». Chaque image : ordres en attente, caméra, interface, son, foule, décor, puis
   renderer.draw. */
(function (PDR) {
  'use strict';

  const R = PDR.regles, P = PDR.protocole;
  const SOLEIL = [-0.45, 0.62, 0.35];
  const ATMOSPHERE = {
    skyTop: [0.26, 0.42, 0.64], skyBottom: [0.62, 0.70, 0.76], fog: [0.56, 0.63, 0.70],
    sunDirection: SOLEIL, sunColor: [1.62, 1.44, 1.16], ambient: [0.16, 0.185, 0.225],
    wind: 0.5, fogDensity: 0.00025, biome: 'ville',
  };
  // Réglages de création de FERRO 0.2 (FRender.create) pour une ville vue de haut, en plein jour : anticrénelage ×4 de la
  // scène, atlas d'ombre doublé (un seul soleil couvre le sol visible), bords de l'écran peu assombris (les unités doivent
  // y rester lisibles), halo réservé au feu et aux reflets francs (un toit clair ne voile pas l'image).
  const REGLAGES_MOTEUR = { sea:false, reflections:false, msaa: 4, shadowMapScale: 2, vignette: 0.84, bloomThreshold: [0.86, 0.98] };
  // Écrans sans partie vivante : la ville d'accueil tourne lentement derrière eux.
  const FOND = { chargement: 1, titre: 1, reglages: 1, preparation: 1, echec: 1 };
  const LIMITES_ACCUEIL = { x0: -1000, z0: -1000, x1: 1000, z1: 1000 };

  /** L'atmosphère de FERRO, sa zone extérieure couvrant la ville (le plan réel n'a pas l'étendue du damier). */
  function atmosphere(ville) {
    const e = ville.etendue, w = e.x1 - e.x0, d = e.z1 - e.z0;
    return { ...ATMOSPHERE, outdoorZones: [{ x: (e.x0 + e.x1) / 2, z: (e.z0 + e.z1) / 2, w: Math.max(6000, w + 1200), d: Math.max(6000, d + 1200) }] };
  }
  const centre = e => [(e.x0 + e.x1) / 2, (e.z0 + e.z1) / 2];
  const pause0 = () => new Promise(r => setTimeout(r, 0));

  function demarrer() {
    const doc = document, canvas = doc.getElementById('scene'), racine = doc.getElementById('jeu') || doc.body;
    let stockage = null;
    try { stockage = window.localStorage; } catch (e) { stockage = null; }   // stockage refusé : réglages de la session

    let renderer = null, cam = null, son = null, hote = null;
    let monde = null;      // { ville, cle } : le décor fixe chargé dans le moteur
    let jeu = null;        // { foule, decor, carte, joueur, allie, brouillard } : les couches vivantes d'une partie
    let partie = null;     // { gen, options, pret } : la session du travailleur en cours
    let generation = 0, dernierTampon = null, versionSelection = -1, limite = 0, erreursImage = 0, arret = false, mesure = null;
    const pile = [], idsStructure = new Int32Array(1);

    const rappels = {
      nouvellePartie: options => lancer(options),
      demo: options => lancer(options),
      recommencer: options => lancer(options),
      retourTitre: () => arreterPartie(),
      quitter: () => arreterPartie(),
      pause: () => { if (hote) hote.vitesse(0); },
      reprendre: () => { if (hote) hote.vitesse(ui.reglages.vitesse); },
      ordre: cmd => { if (cmd) pile.push(cmd); },
      marque: m => { if (jeu && m) jeu.decor.ordre(m.x, m.z, m.sorte); },
      selection: () => { versionSelection = -1; },
      reglagesChanges: (cles, r) => reglagesChanges(cles, r),
      exporterMusique: () => exporterMusique(),
      essaiSon: () => (son ? son.essai() : false),
      premierGeste: () => { if (son) son.geste(); },
      ecran: (nom, infos) => ecranChange(nom, infos),
      ui: (nom, d) => { if (son) son.ui(nom, d); },
    };
    const ui = PDR.interface.creerInterface({ document: doc, regles: R, protocole: P, stockage, rappels });
    const REG = ui.reglages;
    limite = REG.limiteImages || 0;

    // Le navigateur n'ouvre l'audio qu'après un geste : chaque geste relance un contexte suspendu (rien ne coûte).
    const reveil = () => { if (son) son.geste(); };
    for (const t of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(t, reveil, { capture: true, passive: true });
    window.addEventListener('resize', () => { if (renderer) renderer.resize(); });
    window.addEventListener('pagehide', () => { arreterPartie(); if (son) son.liberer(); });

    // ---- Villes : la même dans la page et dans le travailleur ; la dernière construite est gardée. ----
    const cache = { cle: '', ville: null };
    function villePour(options, ilots) {
      const nom = options.ville === 'marseille' ? 'marseille' : 'damier';
      const cle = nom + ':' + (nom === 'damier' ? options.graine : '') + ':' + ilots;
      if (cache.cle !== cle) { cache.ville = P.villeDe(options, ilots); cache.cle = cle; }
      return cache.ville;
    }
    /** Charge le décor fixe d'une ville dans le moteur (rien si c'est déjà elle) et lui accorde la caméra. */
    function afficherVille(ville) {
      if (monde && monde.ville === ville) return;
      renderer.setWorld(ville.objets, [], atmosphere(ville));
      cam.monde(ville.etendue, { ville });
      monde = { ville };
      racine.dataset.carte = ville.attribution || ville.nom === 'marseille' ? 'osm' : '';
    }
    function liberer() {
      if (!jeu) return;
      try { jeu.foule.liberer(); jeu.decor.liberer(); } catch (e) { console.error(e); }
      jeu = null;
    }
    /** Hors partie, la caméra prend de la hauteur au-dessus de la ville d'accueil. */
    function versLeFond() {
      if (!monde || !cam) return;
      const c = centre(monde.ville.etendue);
      cam.diriger(c[0], c[1], 560, cam.visee.yaw);
    }

    // ---- Sessions du travailleur. ----
    function lancer(options) {
      arreterPartie();
      const gen = ++generation;
      partie = { gen, options, pret: false };
      try {
        hote = PDR.hote.creer({
          surMessage: m => { if (gen === generation) recu(m); },
          surPanne: t => { if (gen === generation) panne('La simulation s’est arrêtée : ' + t); },
        });
        hote.demarrer(options);
      } catch (e) {
        console.error(e);
        panne('La simulation n’a pas pu démarrer : ' + (e && e.message || e));
      }
    }
    function arreterPartie() {
      generation++;
      if (hote) { try { hote.arreter(); } catch (e) { console.error(e); } hote = null; }
      partie = null; dernierTampon = null; pile.length = 0;
      liberer();
      versLeFond();
    }
    function panne(texte) {
      arreterPartie();
      ui.echec(texte);
    }
    function recu(m) {
      switch (m.type) {
        case 'pret': surPret(m); return;
        case 'etat': surEtat(m); return;
        case 'fin': ui.fin({ vainqueur: m.vainqueur, bilan: m.bilan }); return;
        case 'erreur':
          console.error(m.pile || m.message);
          panne('La simulation s’est arrêtée : ' + m.message);
          return;
        default:
      }
    }
    function surPret(m) {
      const { carte, options } = m, joueur = options.joueur;
      // Une démo qui arrive après un geste n'est plus voulue.
      if (!(joueur >= 0) && !ui.demoDemandee) { arreterPartie(); return; }
      let ville;
      try { ville = villePour(options, carte.ilots); }
      catch (e) { console.error(e); panne('La ville n’a pas pu être construite : ' + (e && e.message || e)); return; }
      liberer();
      afficherVille(ville);
      const brouillard = !!options.brouillard && joueur >= 0;
      const foule = PDR.foule.creerFoule(renderer, { ville });
      foule.regler({ joueur, allie: -1, brouillard });
      const decor = PDR.decor.creerDecor(ville, { carte, joueur, allie: -1, brouillard, effectifs: options.effectifs });
      jeu = { foule, decor, carte, joueur, allie: -1, brouillard };
      partie.options = options; partie.pret = true;
      versionSelection = -1; dernierTampon = null;
      if (son) son.carte(carte);
      if (ui.partie({ options, carte, sites: ville.sites, ville }) === false) return;
      if (joueur >= 0 && REG.vitesse !== 1) hote.vitesse(REG.vitesse);
    }
    function surEtat(m) {
      if (!partie || !partie.pret || !jeu) { if (hote && m.unites) hote.rendre(m.unites); return; }
      const n = m.n | 0, f32 = new Float32Array(m.unites, 0, n * P.FLOATS_PAR_UNITE);
      jeu.foule.recevoir(f32, n);
      jeu.decor.etat(m);
      if (m.voile) { jeu.foule.voile(m.voile, jeu.carte.voile); jeu.decor.voile(m.voile, jeu.carte.voile); }
      const al = m.alliance, j = jeu.joueur;
      const allie = Array.isArray(al) && j >= 0 && al.includes(j) ? (al[0] === j ? al[1] : al[0]) : -1;
      if (allie !== jeu.allie) { jeu.allie = allie; jeu.foule.regler({ joueur: j, allie, brouillard: jeu.brouillard }); }
      ui.etat(m, f32);
      if (son) son.etat(m, cam.derniere);
      // Le tampon reçu reste lisible (choix à la souris) jusqu'au suivant ; le précédent retourne au travailleur.
      if (dernierTampon && hote) hote.rendre(dernierTampon);
      dernierTampon = m.unites;
      mesure = m.mesure || null;
    }

    // ---- Ordres, sélection, réglages, écrans. ----
    function envoyerOrdres() {
      if (!pile.length) return;
      const lot = pile.splice(0);
      if (!hote || !partie || !partie.pret) return;
      hote.commandes(lot);
      if (son) son.commande(lot);
    }
    function majSelection() {
      const c = ui.commandes, s = c && c.selection;
      if (!s || s.version === versionSelection) return;
      versionSelection = s.version;
      jeu.foule.selectionner(s.liste, s.n);
      idsStructure[0] = s.structure;
      jeu.decor.selectionner(idsStructure, s.structure >= 0 ? 1 : 0);
    }
    function reglagesChanges(cles, r) {
      const a = k => !cles || cles.includes(k);
      if (a('qualite') && renderer) renderer.resize(r.qualite);
      if (a('limiteImages')) limite = r.limiteImages || 0;
      if (a('vitesse') && hote && ui.ecran === 'partie') hote.vitesse(r.vitesse);
      if (son) son.reglages(r);
    }
    function ecranChange(nom, infos) {
      if (!son) return;
      son.ecran(nom, infos);
      const m = son.morceau();
      if (m && ui.panneau && typeof ui.panneau.musique === 'function') ui.panneau.musique(m.titre);
    }
    function exporterMusique() {
      const m = son && son.module();
      if (!m) return false;
      const url = URL.createObjectURL(new Blob([m.octets], { type: 'audio/x-mod' }));
      const a = doc.createElement('a');
      a.href = url; a.download = m.nom; a.hidden = true;
      doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    }

    // ---- Chaque image. ----
    let dernier = performance.now(), dernierDessin = 0, temps = 0;
    function image(maintenant) {
      if (arret) return;
      requestAnimationFrame(image);
      if (limite > 0 && maintenant - dernierDessin < 1000 / limite - 1.5) return;
      dernierDessin = maintenant;
      const brut = Math.min(250, Math.max(0, maintenant - dernier)), dt = brut / 1000;
      dernier = maintenant; temps += dt;
      try {
        envoyerOrdres();
        if (!jeu && FOND[ui.ecran]) cam.tourner(0.035 * dt);
        const vue = cam.vue(dt);
        ui.image(maintenant, dt);
        if (son) son.image(dt, vue);
        if (!monde) return;
        const fx = { time: temps, frameMs: brut, adaptive: true, sunOnly: true, torch: false,
          shadows: REG.ombres !== false, bloom: REG.eclat !== false, msaa: REG.anticrenelage !== false };
        if (jeu) {
          majSelection();
          jeu.foule.cadre(vue, temps);
          const d = jeu.decor.cadre(vue, temps);
          fx.lights = d.lumieres; fx.lots = d.lots; fx.foule = jeu.foule.fx; fx.voile = jeu.foule.fxVoile;
          renderer.draw(vue, d.dynamique, fx);
        } else renderer.draw(vue, [], fx);
        erreursImage = 0;
      } catch (e) {
        if (++erreursImage === 1) console.error(e);
        if (erreursImage > 30) { arret = true; panne('Le rendu s’est arrêté : ' + (e && e.message || e)); }
      }
    }

    // ---- Démarrage. ----
    async function boot() {
      ui.chargement(0.04, 'Le moteur démarre.');
      try { renderer = window.FRender.create(canvas, REGLAGES_MOTEUR); }
      catch (err) { ui.echec('Le moteur n’a pas pu démarrer : ' + (err && err.message || err)); return; }
      if (!renderer || !renderer.stats || renderer.stats.backend !== 'webgl2') {
        if (renderer && renderer.dispose) renderer.dispose();
        renderer = null;
        ui.echec('Ce navigateur n’offre pas WebGL 2. Le jeu en a besoin : ouvrez-le dans un Chrome, un Safari ou un Firefox récent.');
        return;
      }
      renderer.resize(REG.qualite);
      cam = PDR.camera.creerCamera(canvas, LIMITES_ACCUEIL, SOLEIL);
      ui.brancher({ canvas, camera: cam });
      ui.chargement(0.1, 'La ville se dessine.');
      await pause0();
      try {
        const p = REG.partie, ville = villePour({ ville: p.ville, graine: p.graine }, R.ilots(p.effectifs));
        afficherVille(ville);
        const c = centre(ville.etendue);
        cam.placer(c[0], c[1], 560, 0.35);
      } catch (e) { console.error(e); }   // sans ville d'accueil, le titre reste lisible sur fond uni
      requestAnimationFrame(image);
      ui.chargement(0.3, 'Les instruments s’accordent.');
      await pause0();
      try {
        await PDR.son.prechauffer(part => ui.chargement(0.3 + 0.65 * part, 'Les instruments s’accordent.'));
        son = PDR.son.creerSon(PDR.audio.create());
        son.reglages(REG);
      } catch (e) { console.error(e); son = null; }   // sans son, le jeu reste jouable
      ui.chargement(1, 'Prêt.');
      ui.titre();
      ecranChange(ui.ecran, { avant: 'chargement', joueur: -1, alliance: null, vainqueur: null });
    }
    boot().catch(e => { console.error(e); ui.echec('Le jeu n’a pas pu démarrer : ' + (e && e.message || e)); });

    PDR.page = { get ui() { return ui; }, get renderer() { return renderer; }, get camera() { return cam; },
      get son() { return son; }, get hote() { return hote; }, get jeu() { return jeu; }, get monde() { return monde; },
      get mesure() { return mesure; } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})(globalThis.PDR = globalThis.PDR || {});
