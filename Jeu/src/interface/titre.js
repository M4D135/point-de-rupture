/* Point de rupture — écrans de l'interface et aiguillage des gestes (CONCEPTION.md §1.10).
   Écrans : chargement, titre (la démo démarre après 5 s sans geste ; un clic ou une touche ramène au titre),
   préparation (camp, alliance, effectifs, difficulté, ville), partie, pause et réglages (panneau de reglages.js, à la
   manière du menu de METAL), démo, fin, échec. En partie, hud.js (bandeau, sélection, commandes, alertes, diplomatie),
   minicarte.js et commandes.js (gestes → ordres) sont créés et reliés ici. Un seul aiguilleur clavier pour la page :
   camera.js ne reçoit plus que la touche Espace (saisir la carte) ; ses touches codées en dur n'agissent plus.

   const ui = PDR.interface.creerInterface({ document, regles, protocole, reglages, stockage, rappels });
     reglages    facultatif : réglages déjà chargés (objet vivant) ; sinon PDR.interface.reglages.charger(stockage)
     rappels     tous facultatifs ; ui.rappels peut aussi se compléter après coup :
       nouvellePartie(options)    OPTIONS du protocole (joueur 0 à 2) : démarrer le travailleur (hote.demarrer)
       demo(options)              OPTIONS avec joueur −1, brouillard faux : une démonstration, trois IA
       retourTitre()              arrêter la partie ou la démo en cours (hote.arreter)
       pause() / reprendre()      hote.vitesse(0) / hote.vitesse(ui.reglages.vitesse)
       recommencer(options)       une partie en cours recommence avec les mêmes options : l'arrêter, la relancer
       quitter()                  abandon confirmé : arrêter la partie ; l'écran titre revient de lui-même
       ordre(cmd)                 une commande (PDR.protocole.commande) : hote.commandes([cmd]), ou en lot par image
       marque({ x, z, sorte })    où un ordre vient d'être donné, pour le décor
       selection(commandes)       la sélection a changé : commandes.selection.masque pour le rendu
       reglagesChanges(cles, reglages)   qualite, limiteImages, ombres, eclat, anticrenelage, son, volumes, vitesse…
       exporterMusique() → vrai | promesse ; essaiSon() → vrai | faux | promesse
       premierGeste()             le premier geste de la page : l'audio peut démarrer (son.geste())
       ecran(nom, infos)          l'écran a changé ; infos { avant, joueur, alliance, vainqueur } : de quoi appeler
                                  son.ecran(nom, infos) tel quel (joueur −1 en démo, vainqueur à la fin)
       ui(nom, details)           un bruit d'interface, à passer à son.ui : 'clic' (un bouton), 'menu' { ouvert },
                                  'refus' (un ordre impossible)
   ui.brancher({ canvas, camera, realisateur? })   crée commandes et minicarte et appelle PDR.camera.brancher(canvas,
                                     camera, commandes.actions) : jeu.js ne l'appelle pas lui-même. En démo, l'interface
                                     crée le réalisateur de camera.js (PDR.camera.creerRealisateur) et le nourrit
                                     (etat, avancer) ; realisateur: false si jeu.js préfère le mener lui-même
   ui.chargement(part, texte)        0..1 ; pendant qu'une démo se prépare, l'écran titre reste affiché
   ui.titre()                        écran titre
   ui.partie({ options, carte, sites, ville })   message « pret » : la partie (ou la démo) commence ; la caméra est
                                     placée sur le QG du joueur (au-dessus de la ville en démo)
   ui.etat(etat, f32)                chaque message « etat » ; f32 : vue Float32Array de etat.unites, lisible jusqu'à
                                     l'état suivant (facultative)
   ui.image(t, dt)                   chaque image, après camera.vue(dt) : t en ms (performance.now()), dt en s
   ui.fin({ vainqueur, bilan })      message « fin » ; en démo, retour au titre
   ui.echec(texte)                   panne : message et bouton pour recharger
   ui.pause(), ui.reprendre(), ui.reglagesOuvrir(onglet), ui.options() (OPTIONS de la prochaine partie)
   ui.realisateur                    le réalisateur de la démo en cours (camera.js), sinon null
   ui.ecran ('chargement' | 'titre' | 'reglages' | 'preparation' | 'partie' | 'pause' | 'demo' | 'fin' | 'echec' ;
     'reglages' : réglages ouverts depuis le titre, 'titre' pour son.ecran ; 'echec' : rien ne joue),
   ui.enDemo, ui.reglages, ui.commandes, ui.minicarte, ui.hud, ui.panneau, ui.apercu (visée en cours, pour le décor)
   Onglet caché pendant une partie : la pause s'ouvre (le travailleur, lui, continuerait sans qu'on le voie). */
(function (PDR) {
  'use strict';

  const I = PDR.interface = PDR.interface || {};
  const ATTENTE_DEMO_MS = 5000;    // sans geste sur l'écran titre, la démo démarre
  const PLAN_DEMO_MS = 7000;       // durée d'un plan de la caméra de démo
  const AVALER_MS = 600;           // le clic qui suit la sortie de démo ne touche pas l'écran titre

  function creerInterface(o = {}) {
    const doc = o.document || globalThis.document;
    const win = doc.defaultView || globalThis;
    const R = o.regles || PDR.regles, P = o.protocole || PDR.protocole, REGL = I.reglages, OUT = I.outils;
    const { formatNombre, formatHorloge, motifSVG, icone, echapper, typo } = OUT;
    const F = R.FACTIONS, C = R.CONSTANTES;
    const stockage = o.stockage;
    const REG = o.reglages || REGL.charger(stockage);
    const rappels = Object.assign({
      nouvellePartie() {}, demo() {}, retourTitre() {}, pause() {}, reprendre() {}, recommencer() {}, quitter() {},
      ordre() {}, marque() {}, selection() {}, reglagesChanges() {}, exporterMusique() { return false; },
      essaiSon() { return false; }, premierGeste() {}, ecran() {}, ui() {},
    }, o.rappels || {});
    const $ = id => doc.getElementById(id);
    const racine = $('jeu') || doc.body;
    const maintenant = () => (win.performance ? win.performance.now() : Date.now());
    const poser = (e, s) => { if (e) e.innerHTML = typo(s); };
    const ecrire = (e, s) => { if (e) e.textContent = typo(s); };
    const borne = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const minus = s => s.replace(/^L[ae] /, m => m.toLowerCase());

    let ecran = '', enDemo = false, demoDemandee = false;
    let options = null, carte = null, sites = null;
    let canvas = null, camera = null, commandes = null, minicarte = null, realisateur = null, avecRealisateur = true;
    let dernierGeste = maintenant(), clavierRecent = false, gesteFait = false, avalerJusque = 0, enregistre = true, vainqueurFin = null;
    let versionVue = -1, combats = null, densite = null, geoCombats = null, geoDensite = null;
    const dernier = { temps: 0, eco: null, alliance: null, lieux: null };
    const plans = { prochain: 0, plan: 0 };

    OUT.typographier(racine);

    // ---- Les modules de la partie. ----
    const hud = I.creerHud({
      document: doc, regles: R, protocole: P, reglages: REG,
      rappels: {
        pause: () => pause(),
        refus: () => rappels.ui('refus'),
        action: (id, opt) => { if (commandes) commandes.action(id, opt); },
        general: id => { if (commandes) commandes.general(id); },
        annuler: rang => { if (commandes) commandes.annuler(rang); },
        diplomatie: (quoi, avec) => { if (commandes && !enDemo) commandes.diplomatie(quoi, avec); },
        vue: (x, z) => { if (commandes) commandes.centrer(x, z); },
        garderType: (t, garder) => { if (commandes) commandes.garderType(t, garder); },
        alerteCarte: (x, z, couleur) => { if (minicarte) minicarte.alerte(x, z, couleur); },
      },
    });
    const panneau = REGL.creerPanneau(doc, {
      reglages: REG,
      surChangement: cles => reglagesChanges(cles),
      surAction: nom => actionPanneau(nom),
      surFermer: () => fermerReglages(),
      enregistre: () => enregistre,
    });

    function brancher(b) {
      canvas = b.canvas; camera = b.camera; avecRealisateur = b.realisateur !== false;
      commandes = I.creerCommandes({
        canvas, camera, regles: R, protocole: P, reglages: REG, document: doc, projecteur: b.projecteur,
        rappels: {
          ordre: c => rappels.ordre(c),
          marque: m => rappels.marque(m),
          message: (t, refus) => hud.message(t, refus),
          selection: c => rappels.selection(c),
          alerte: () => hud.derniereAlerte(),
          pause: () => pause(),
        },
      });
      minicarte = I.creerMinicarte({
        canvas: $('minicarte'), regles: R,
        rappels: { vue: (x, z) => commandes.centrer(x, z), ordre: (x, z) => commandes.ordreEn(x, z) },
      });
      if (b.brancherCamera !== false && PDR.camera && typeof PDR.camera.brancher === 'function') PDR.camera.brancher(canvas, camera, commandes.actions);
      appliquer(['luminosite']);
      return commandes;
    }

    // ---- Écrans. ----
    const ECRANS = { chargement: 'ecran-chargement', titre: 'ecran-titre', preparation: 'ecran-preparation', fin: 'ecran-fin', echec: 'echec' };
    const AVEC_HUD = { partie: 1, pause: 1, demo: 1 };
    function montrer(nom) {
      const avant = ecran;
      ecran = nom;
      racine.dataset.ecran = nom;
      for (const n in ECRANS) {
        const e = $(ECRANS[n]);
        if (e) e.hidden = !(n === nom || (n === 'titre' && nom === 'reglages'));
      }
      const h = $('hud');
      if (h) h.hidden = !AVEC_HUD[nom];
      const d = $('demo');
      if (d) d.hidden = nom !== 'demo';
      if (commandes) commandes.activer(nom === 'partie');
      if (nom !== 'partie') masquerApercu();
      if (nom !== 'partie' && nom !== 'pause') { const b = $('infobulle'); if (b) b.hidden = true; }
      attente(nom === 'titre');
      if (avant !== nom) {
        const jeu = nom === 'partie' || nom === 'pause' || nom === 'fin';
        rappels.ecran(nom, { avant, joueur: nom === 'demo' ? -1 : jeu && options ? options.joueur : -1,
          alliance: jeu && options ? dernier.alliance || options.alliance || null : null, vainqueur: nom === 'fin' ? vainqueurFin : null });
      }
    }
    /** Au clavier, le focus suit l'écran ; à la souris, il reste où il est (pas d'anneau parasite). */
    function focaliser(el) { if (el && clavierRecent) el.focus({ preventScroll: true }); }

    function chargement(part, texte) {
      if (demoDemandee && ecran === 'titre') return;
      if (ecran !== 'chargement') montrer('chargement');
      const p = borne(Number(part) || 0, 0, 1), b = $('chargement-barre'), z = $('chargement-piste');
      if (b) b.style.transform = 'scaleX(' + p.toFixed(3) + ')';
      if (z) z.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      if (texte) ecrire($('chargement-texte'), texte);
      const etapes = doc.querySelectorAll('#chargement-etapes [data-etape]');
      etapes.forEach((e, k) => { e.dataset.fait = p >= (k + 1) / (etapes.length + 1) ? 'oui' : 'non'; });
    }
    function titre() {
      if (panneau.ouvert) panneau.fermer();
      enDemo = false;
      montrer('titre');
      dernierGeste = maintenant();
      majSon();
      focaliser($('titre-jouer'));
    }
    function echec(texte) {
      if (panneau.ouvert) panneau.fermer();
      demoDemandee = false; enDemo = false;
      ecrire($('echec-texte'), texte || 'Une erreur est survenue.');
      montrer('echec');
      focaliser($('echec-recharger'));
    }

    // ---- Démo : après 5 s sans geste sur l'écran titre. ----
    let minuteur = 0;
    function attente(oui) {
      if (oui && !minuteur) minuteur = win.setInterval(verifierAttente, 200);
      else if (!oui && minuteur) { win.clearInterval(minuteur); minuteur = 0; }
      majAttente();
    }
    function verifierAttente() {
      if (ecran !== 'titre' || panneau.ouvert || !REG.demo || demoDemandee) { majAttente(); return; }
      if (doc.hidden) { dernierGeste = maintenant(); return; }
      if (maintenant() - dernierGeste >= ATTENTE_DEMO_MS) lancerDemo();
      else majAttente();
    }
    function majAttente() {
      const z = $('titre-attente');
      if (!z) return;
      const visible = ecran === 'titre' && !!REG.demo;
      z.hidden = !visible;
      if (!visible) return;
      if (demoDemandee) {
        ecrire($('titre-attente-texte'), 'La démo se prépare…');
        z.style.setProperty('--part', '1');
        return;
      }
      const reste = ATTENTE_DEMO_MS - (maintenant() - dernierGeste);
      ecrire($('titre-attente-texte'), 'Démo dans ' + Math.max(1, Math.ceil(reste / 1000)) + ' s');
      z.style.setProperty('--part', borne(1 - reste / ATTENTE_DEMO_MS, 0, 1).toFixed(3));
    }
    function optionsDemo() {
      return { graine: 1 + Math.floor(Math.random() * 999999), effectifs: Math.min(REG.partie.effectifs, C.EFFECTIFS_DEFAUT), joueur: -1, alliance: null,
        difficulte: 1, brouillard: false, coalitions: true, enregistrer: false, ville: REG.partie.ville };
    }
    function lancerDemo() {
      demoDemandee = true;
      majAttente();
      rappels.demo(optionsDemo());
    }
    /** Un geste pendant la démo, ou pendant qu'elle se prépare : retour au titre. */
    function sortirDemo() {
      avalerJusque = maintenant() + AVALER_MS;
      const enCours = ecran === 'demo' || demoDemandee;
      demoDemandee = false;
      enDemo = false;
      realisateur = null;
      if (enCours) rappels.retourTitre();
      if (ecran === 'demo') montrer('titre');
      dernierGeste = maintenant();
      majAttente();
    }

    // ---- Caméra de démo : des plans de sept secondes sur les combats, les lieux disputés, la ville entière. ----
    function centreVille() {
      const e = carte && carte.etendue;
      return e ? [(e.x0 + e.x1) / 2, (e.z0 + e.z1) / 2] : [0, 0];
    }
    function pointChaud() {
      if (!combats || !carte || !carte.combats) return null;
      const g = geoCombats || (geoCombats = I.minicarte.geometrie({ minicarte: carte.combats, etendue: carte.etendue }));
      let meilleur = 2, k = -1;
      for (let i = 0; i < combats.length; i++) if (combats[i] > meilleur) { meilleur = combats[i]; k = i; }
      if (k < 0) return null;
      const n = g.taille;
      return [g.x0 + ((k % n) + 0.5) * g.cellule, g.z0 + (((k / n) | 0) + 0.5) * g.cellule];
    }
    /** La case où deux camps se touchent le plus (minicarte : unités par case et par camp). */
    function pointMele() {
      if (!densite || !carte || !carte.minicarte) return null;
      const g = geoDensite || (geoDensite = I.minicarte.geometrie(carte));
      const n = g.taille;
      let meilleur = 4, k = -1;
      for (let c = 0; c < n * n; c++) {
        const a = densite[c * 3], b = densite[c * 3 + 1], d = densite[c * 3 + 2];
        const second = a >= b ? (b >= d ? b : a >= d ? d : a) : (a >= d ? a : b >= d ? d : b);
        if (second > meilleur) { meilleur = second; k = c; }
      }
      return k < 0 ? null : [g.x0 + ((k % n) + 0.5) * g.cellule, g.z0 + (((k / n) | 0) + 0.5) * g.cellule];
    }
    function lieuDispute() {
      const L = dernier.lieux, S = sites && sites.lieux;
      if (!L || !S) return null;
      const disputes = [];
      for (let k = 0; k < L.length; k++) if (L[k] && L[k].conteste && S[k]) disputes.push(S[k]);
      if (!disputes.length) return null;
      const l = disputes[Math.floor(Math.random() * disputes.length)];
      return [l.x, l.z];
    }
    /** Réalisateur de secours, si camera.js n'en a pas : un plan toutes les 7 s, tour à tour combat, lieu, ville. */
    function realiser(t, dt) {
      if (!camera) return;
      if (realisateur) { realisateur.avancer(dt); return; }
      camera.tourner(0.045 * dt);
      if (t < plans.prochain) return;
      plans.prochain = t + PLAN_DEMO_MS;
      const k = plans.plan++ % 4;
      let p = null, D = 180;
      if (k === 1 || k === 3) p = pointChaud() || pointMele();
      else if (k === 2) p = lieuDispute() || pointMele();
      if (p) D = k === 1 ? 130 : 210;
      else { p = centreVille(); D = 480 + 160 * Math.random(); }
      if (typeof camera.diriger === 'function') camera.diriger(p[0], p[1], D);
      else { camera.viser(p[0], p[1]); const v = camera.derniere; if (v && v.D > 0) camera.zoomer(D / v.D); }
    }

    // ---- Préparation de la partie. ----
    function optionsPartie() {
      const p = REG.partie, j = p.faction;
      let alliance = null;
      if (p.alliance >= 0 && p.alliance <= 2 && p.alliance !== j) alliance = [Math.min(j, p.alliance), Math.max(j, p.alliance)];
      else if (p.alliance === 3) alliance = [0, 1, 2].filter(f => f !== j);
      return { graine: p.graine, effectifs: p.effectifs, joueur: j, alliance, difficulte: p.difficulte,
        brouillard: p.brouillard, coalitions: p.coalitions, enregistrer: false, ville: p.ville };
    }
    const TYPES_DE = F.map(f => R.TYPES_PAR_FACTION[f.id].map(t => R.TYPES[t].pluriel).join(', '));
    function dessinerCamps() {
      const j = REG.partie.faction;
      poser($('prep-camps'), F.map(f => '<button type="button" class="camp-carte" role="radio" data-faction="' + f.id + '" aria-checked="' + (f.id === j) +
        '" tabindex="' + (f.id === j ? 0 : -1) + '" style="--c:' + f.css + '">' +
        '<span class="camp-tete">' + motifSVG(f.motif, 'motif camp-motif') + '<span class="camp-part">' + Math.round(f.part * 100) + ' % des effectifs</span>' +
        '<span class="camp-coche" aria-hidden="true">Votre camp</span></span>' +
        '<strong class="camp-nom">' + echapper(f.nom) + '</strong><em class="camp-devise">' + echapper(f.devise) + '</em>' +
        '<ul class="camp-regles">' + f.regles.map(r => '<li>' + echapper(r) + '</li>').join('') + '</ul>' +
        '<span class="camp-pied"><span>' + echapper(TYPES_DE[f.id]) + '</span><span>Avant-poste : ' + echapper(f.avantPoste) + '</span></span></button>').join(''));
    }
    function dessinerAlliance() {
      const j = REG.partie.faction, s = $('prep-alliance');
      if (!s) return;
      const autres = [0, 1, 2].filter(f => f !== j);
      poser(s, '<option value="-1">Aucune : chacun pour soi</option>' +
        autres.map(f => '<option value="' + f + '">Avec ' + echapper(minus(F[f].nom)) + '</option>').join('') +
        '<option value="3">' + echapper(F[autres[0]].court + ' et ' + F[autres[1]].court) + ' contre vous</option>');
      s.value = String(REG.partie.alliance);
    }
    function majPreparation() {
      const p = REG.partie;
      for (const b of doc.querySelectorAll('#prep-camps [data-faction]')) {
        const oui = Number(b.dataset.faction) === p.faction;
        b.setAttribute('aria-checked', String(oui));
        b.tabIndex = oui ? 0 : -1;
      }
      for (const b of doc.querySelectorAll('#prep-effectifs [data-effectifs]')) b.setAttribute('aria-pressed', String(Number(b.dataset.effectifs) === p.effectifs));
      for (const b of doc.querySelectorAll('#prep-difficulte [data-difficulte]')) b.setAttribute('aria-pressed', String(Number(b.dataset.difficulte) === p.difficulte));
      for (const b of doc.querySelectorAll('#prep-ville [data-ville]')) b.setAttribute('aria-pressed', String(b.dataset.ville === p.ville));
      const n = R.ilots(p.effectifs), reelle = p.ville === 'marseille';
      ecrire($('prep-effectifs-note'), (reelle ? 'Marseille, ' + (n <= 9 ? 'le Vieux-Port' : n <= 13 ? 'le centre' : 'le grand centre') : 'Ville de ' + n + ' × ' + n + ' îlots') + ' · '
        + (p.effectifs >= 150000 ? 'machine solide conseillée' : p.effectifs === C.EFFECTIFS_DEFAUT ? 'le format prévu' : p.effectifs <= 20000 ? 'partie courte' : 'partie moyenne'));
      ecrire($('prep-graine-note'), reelle ? 'Le vrai plan des rues. La graine change les départs et le hasard de la partie. Plan : © les contributeurs d’OpenStreetMap.'
        : 'Une graine, une ville : la même graine redonne les mêmes rues.');
      const g = $('prep-graine');
      if (g && doc.activeElement !== g) g.value = String(p.graine);
      for (const [id, cle] of [['prep-brouillard', 'brouillard'], ['prep-coalitions', 'coalitions']]) {
        const b = $(id);
        if (!b) continue;
        b.setAttribute('aria-pressed', String(!!p[cle]));
        const s = b.querySelector('strong');
        if (s) s.textContent = p[cle] ? 'Oui' : 'Non';
      }
      const f = F[p.faction], alliance = optionsPartie().alliance;
      ecrire($('prep-resume'), f.nom + ' · ' + (p.ville === 'marseille' ? 'Marseille · ' : '') + formatNombre(p.effectifs) + ' unités · ' + R.DIFFICULTES[p.difficulte].nom.toLowerCase() +
        (alliance ? (alliance.includes(p.faction) ? ' · allié ' + (alliance[0] === p.faction ? F[alliance[1]].court : F[alliance[0]].court) : ' · seul contre deux') : ''));
      const racinePrep = $('ecran-preparation');
      if (racinePrep) racinePrep.style.setProperty('--c', f.css);
    }
    function sauverPartie() { enregistre = REGL.enregistrer(REG, stockage); majPreparation(); }
    function choisirCamp(f, focus) {
      if (!(f >= 0 && f <= 2)) return;
      REG.partie.faction = f;
      if (REG.partie.alliance === f) REG.partie.alliance = -1;
      dessinerAlliance();
      sauverPartie();
      if (focus) { const b = doc.querySelector('#prep-camps [data-faction="' + f + '"]'); if (b) b.focus(); }
    }
    function preparation() {
      dessinerCamps();
      dessinerAlliance();
      majPreparation();
      montrer('preparation');
      focaliser(doc.querySelector('#prep-camps [aria-checked="true"]'));
    }
    function lancer() {
      const opt = optionsPartie();
      enregistre = REGL.enregistrer(REG, stockage);
      options = opt;
      chargement(0, 'La ville se dessine.');
      rappels.nouvellePartie(opt);
    }

    // ---- Partie. ----
    function placerCamera(opt) {
      if (!camera || typeof camera.placer !== 'function') return;
      const q = sites && sites.qg && opt.joueur >= 0 ? sites.qg[opt.joueur] : null;
      if (q) camera.placer(q.x, q.z, 230, 0);
      else { const c = centreVille(); camera.placer(c[0], c[1], 560, 0.35); }
    }
    function partie(infos) {
      const opt = (infos && infos.options) || {};
      const demo = !(opt.joueur >= 0 && opt.joueur <= 2);
      if (demo && !demoDemandee) { rappels.retourTitre(); return false; }    // une démo arrivée après un geste
      options = opt; carte = infos.carte || null; sites = infos.sites || null;
      enDemo = demo; demoDemandee = false;
      combats = null; densite = null; geoCombats = null; geoDensite = null; versionVue = -1;
      dernier.temps = 0; dernier.eco = null; dernier.alliance = opt.alliance || null; dernier.lieux = null;
      if (commandes) commandes.partie(infos);
      if (minicarte) { minicarte.partie(infos); minicarte.demo(demo); }
      hud.partie(infos);
      hud.demo(demo);
      placerCamera(opt);
      plans.prochain = maintenant() + 3000; plans.plan = 0;
      realisateur = null;
      if (demo && avecRealisateur && camera && PDR.camera && typeof PDR.camera.creerRealisateur === 'function') {
        try {
          realisateur = PDR.camera.creerRealisateur(camera, infos.ville || { etendue: carte && carte.etendue, sites }, { carte });
        } catch (err) { realisateur = null; }
      }
      if (panneau.ouvert) panneau.fermer();
      montrer(demo ? 'demo' : 'partie');
      return true;
    }
    function etat(e, f32) {
      if (!e || !AVEC_HUD[ecran]) return;
      if (commandes) commandes.etat(e, f32);
      if (minicarte) minicarte.etat(e);
      hud.etat(e);
      if (commandes && !enDemo) { hud.contexte(commandes.contexte(), commandes.resume); versionVue = commandes.versionContexte; }
      dernier.temps = e.temps || 0;
      if (e.eco) dernier.eco = e.eco;
      dernier.alliance = e.alliance || null;
      if (e.lieux) dernier.lieux = e.lieux;
      if (e.combats) combats = e.combats;
      if (e.minicarte) densite = e.minicarte;
      if (realisateur && enDemo) realisateur.etat(e, f32 || (e.unites ? new Float32Array(e.unites) : null), e.n || 0);
    }
    function image(t, dt) {
      if (!AVEC_HUD[ecran]) return;
      if (ecran === 'partie' && commandes) {
        commandes.image(dt || 0);
        if (commandes.versionContexte !== versionVue) { versionVue = commandes.versionContexte; hud.contexte(commandes.contexte(), commandes.resume); }
        dessinerApercu();
      } else if (ecran === 'demo') realiser(t, dt || 0);
      if (minicarte) { if (commandes) minicarte.camera(commandes.coinsVue()); minicarte.image(t); }
      hud.image(t);
    }

    // ---- Aperçu de la visée, dessiné par-dessus la scène (le décor peut aussi lire ui.apercu). ----
    const svg = $('apercu');
    const apLigne = svg && svg.querySelector('line'), apZone = svg && svg.querySelector('polygon'), apPoint = svg && svg.querySelector('circle');
    let apercuVisible = false;
    // Un <svg> n'a pas la propriété hidden des éléments HTML : on pose et on retire l'attribut.
    function masquerApercu() { if (svg && apercuVisible) { svg.setAttribute('hidden', ''); apercuVisible = false; } }
    function anneau(x, z, r) {
      let s = '';
      for (let k = 0; k < 28; k++) {
        const a = k / 28 * 2 * Math.PI, p = camera.projeter(x + r * Math.cos(a), 0.3, z + r * Math.sin(a));
        if (!p) return '';
        s += (k ? ' ' : '') + p[0].toFixed(1) + ',' + p[1].toFixed(1);
      }
      return s;
    }
    function dessinerApercu() {
      const a = commandes ? commandes.apercu : null;
      if (!svg || !a || !camera || typeof camera.projeter !== 'function') { masquerApercu(); return; }
      if (!apercuVisible) { svg.removeAttribute('hidden'); apercuVisible = true; }
      svg.dataset.valide = a.valide ? 'oui' : 'non';
      svg.dataset.sorte = a.sorte;
      if (a.sorte === 'barricade') {
        const p = camera.projeter(a.x, 0.6, a.z), q = camera.projeter(a.x2, 0.6, a.z2);
        apLigne.setAttribute('visibility', p && q ? 'visible' : 'hidden');
        if (p && q) { apLigne.setAttribute('x1', p[0].toFixed(1)); apLigne.setAttribute('y1', p[1].toFixed(1)); apLigne.setAttribute('x2', q[0].toFixed(1)); apLigne.setAttribute('y2', q[1].toFixed(1)); }
        apZone.setAttribute('visibility', 'hidden');
        const m = p && q ? [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] : null;
        apPoint.setAttribute('visibility', 'hidden');
        if (m) svg.style.setProperty('--milieu', m[0].toFixed(0) + 'px ' + m[1].toFixed(0) + 'px');
        return;
      }
      apLigne.setAttribute('visibility', 'hidden');
      if (a.sorte === 'point') {
        const p = camera.projeter(a.x, 0.3, a.z);
        apZone.setAttribute('visibility', 'hidden');
        apPoint.setAttribute('visibility', p ? 'visible' : 'hidden');
        if (p) { apPoint.setAttribute('cx', p[0].toFixed(1)); apPoint.setAttribute('cy', p[1].toFixed(1)); }
        return;
      }
      const pts = anneau(a.x, a.z, a.sorte === 'cone' ? 3 : a.rayon);
      apPoint.setAttribute('visibility', 'hidden');
      apZone.setAttribute('visibility', pts ? 'visible' : 'hidden');
      if (pts) apZone.setAttribute('points', pts);
    }

    // ---- Pause, réglages, fin. ----
    function infosPartie() {
      if (!options) return '';
      const f = F[options.joueur] || F[0], al = dernier.alliance;
      const allie = al && al.includes(options.joueur) ? F[al[0] === options.joueur ? al[1] : al[0]].nom : '';
      const lignes = [
        ['Camp', motifSVG(f.motif) + echapper(f.nom)], ['Temps', formatHorloge(dernier.temps) + ' sur ' + formatHorloge(C.DUREE_MAX_S)],
        ['Effectifs', formatNombre(options.effectifs) + ' unités'], ['Ville', options.ville === 'marseille' ? 'Marseille, plan réel · graine ' + options.graine
          : 'graine ' + options.graine + ' · ' + R.ilots(options.effectifs) + ' × ' + R.ilots(options.effectifs) + ' îlots'],
        ['Difficulté', R.DIFFICULTES[options.difficulte] ? R.DIFFICULTES[options.difficulte].nom : ''], ['Alliance', allie ? 'avec ' + echapper(minus(allie)) : al ? 'contre vous' : 'aucune'],
      ];
      return '<dl class="infos" style="--c:' + f.css + '">' + lignes.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('') + '</dl>';
    }
    function pause() {
      if (ecran !== 'partie') return;
      montrer('pause');
      panneau.infos(infosPartie());
      panneau.ouvrir('pause', 'partie');
      rappels.ui('menu', { ouvert: true });
      rappels.pause();
    }
    function reprendre() {
      if (ecran !== 'pause') return;
      panneau.fermer();
      montrer('partie');
      rappels.ui('menu', { ouvert: false });
      rappels.reprendre();
    }
    function reglagesOuvrir(onglet) {
      if (ecran === 'partie') { pause(); if (onglet) panneau.choisirOnglet(onglet); return; }
      if (ecran !== 'titre') return;
      montrer('reglages');
      panneau.ouvrir('titre', onglet || 'partie');
      rappels.ui('menu', { ouvert: true });
    }
    function fermerReglages() {
      if (ecran === 'pause') reprendre();
      else if (ecran === 'reglages') { panneau.fermer(); montrer('titre'); rappels.ui('menu', { ouvert: false }); }
      else panneau.fermer();
    }
    function actionPanneau(nom) {
      if (nom === 'exporter-musique') return rappels.exporterMusique();
      if (nom === 'essai-son') return rappels.essaiSon();
      if (nom === 'recommencer' && options) {
        panneau.fermer();
        const opt = options;
        chargement(0, 'La ville se redessine.');
        rappels.recommencer(opt);
        return true;
      }
      if (nom === 'quitter') {
        panneau.fermer();
        rappels.quitter();
        titre();
        return true;
      }
      return false;
    }
    function reglagesChanges(cles) {
      enregistre = REGL.enregistrer(REG, stockage);
      appliquer(cles);
      rappels.reglagesChanges(cles, REG);
    }
    function appliquer(cles) {
      const tout = !cles, a = k => tout || cles.includes(k);
      if (a('compteur')) { const e = $('ips'); if (e) e.hidden = !REG.compteur; }
      if (a('vignettage')) { const e = $('vignette'); if (e) e.hidden = !REG.vignettage; }
      if (a('luminosite')) { const c = canvas || $('scene'); if (c) c.style.filter = Math.abs(REG.luminosite - 1) < 0.005 ? '' : 'brightness(' + REG.luminosite.toFixed(2) + ')'; }
      if (a('touches')) hud.invalider();
      if (a('infobulles') && !REG.infobulles) { const b = $('infobulle'); if (b) b.hidden = true; }
      if (a('son')) majSon();
      if (a('demo')) { dernierGeste = maintenant(); majAttente(); }
    }
    function majSon() {
      const b = $('titre-son');
      if (!b) return;
      b.setAttribute('aria-pressed', String(!!REG.son));
      const s = b.querySelector('strong');
      if (s) s.textContent = REG.son ? 'Activé' : 'Coupé';
    }

    const ISSUES = { victoire: 'VICTOIRE', alliance: 'VICTOIRE DE L’ALLIANCE', defaite: 'DÉFAITE', nul: 'MATCH NUL' };
    const LIGNES_BILAN = [['produites', 'Unités produites'], ['infliges', 'Mises hors jeu'], ['horsJeu', 'Unités hors jeu'],
      ['lieuxPris', 'Lieux pris'], ['barricadesPosees', 'Barricades posées'], ['barricadesLevees', 'Barricades levées'],
      ['casses', 'Casse'], ['recolte', 'Récolte']];
    function issue(v, j, alliance) {
      if (v === P.VAINQUEUR.NUL) return 'nul';
      if (v === P.VAINQUEUR.ALLIANCE) return alliance && alliance.includes(j) ? 'alliance' : 'defaite';
      return v === j ? 'victoire' : 'defaite';
    }
    function raisonFin(v, eco, temps, alliance) {
      if (v === P.VAINQUEUR.NUL) return 'Personne ne l’emporte : les scores sont à égalité.';
      if (temps >= C.DUREE_MAX_S - 0.5) return 'Les ' + Math.round(C.DUREE_MAX_S / 60) + ' minutes sont écoulées : le meilleur score l’emporte.';
      if (eco) {
        const gagnants = v === P.VAINQUEUR.ALLIANCE && alliance ? alliance : [v];
        const score = gagnants.reduce((s, f) => s + (eco[f] ? eco[f].score : 0), 0);
        if (score >= C.POINTS_VICTOIRE) return (gagnants.length > 1 ? 'L’alliance' : F[v].nom) + ' atteint ' + formatNombre(C.POINTS_VICTOIRE) + ' points.';
        if ([0, 1, 2].every(f => gagnants.includes(f) || (eco[f] && eco[f].elimine))) return 'Les autres camps sont hors jeu.';
      }
      return '';
    }
    function vainqueurs(v, alliance) {
      if (v >= 0 && v <= 2) return F[v].nom + ' l’emporte.';
      if (v === P.VAINQUEUR.ALLIANCE) return alliance ? F[alliance[0]].nom + ' et ' + minus(F[alliance[1]].nom) + ' l’emportent ensemble.' : 'Une alliance l’emporte.';
      return '';
    }
    function fin(r) {
      if (enDemo || ecran === 'demo') { enDemo = false; rappels.retourTitre(); titre(); return; }
      if (!(ecran === 'partie' || ecran === 'pause') || !options) return;
      if (panneau.ouvert) panneau.fermer();
      const v = r && Number.isFinite(r.vainqueur) ? r.vainqueur : P.VAINQUEUR.NUL, j = options.joueur;
      const al = dernier.alliance || options.alliance || null, eco = dernier.eco, bilan = (r && r.bilan) || [];
      const sorte = issue(v, j, al);
      vainqueurFin = v;
      const ecranFin = $('ecran-fin');
      ecranFin.dataset.issue = sorte;
      ecrire($('fin-surtitre'), 'FIN DE PARTIE · ' + formatHorloge(dernier.temps));
      ecrire($('fin-titre'), ISSUES[sorte]);
      ecrire($('fin-vainqueur'), vainqueurs(v, al));
      ecrire($('fin-raison'), raisonFin(v, eco, dernier.temps, al));
      const gagne = f => (v >= 0 && v <= 2 ? f === v : v === P.VAINQUEUR.ALLIANCE && al ? al.includes(f) : false);
      let html = '<caption class="sr">Bilan par camp</caption><thead><tr><th scope="col"><span class="sr">Camp</span></th>';
      for (let f = 0; f < 3; f++) {
        html += '<th scope="col" style="--c:' + F[f].css + '"' + (gagne(f) ? ' data-gagnant="oui"' : '') + '>' + motifSVG(F[f].motif) +
          '<span>' + echapper(F[f].court) + '</span>' + (f === j ? '<small>Vous</small>' : gagne(f) ? '<small>Vainqueur</small>' : '<small aria-hidden="true">\u00a0</small>') + '</th>';
      }
      html += '</tr></thead><tbody><tr class="bilan-score"><th scope="row">Score</th>';
      for (let f = 0; f < 3; f++) html += '<td>' + (eco && eco[f] ? formatNombre(eco[f].score).replace(/\u202f/g, '\u00a0') : '—') + '</td>';
      html += '</tr>';
      for (const [cle, nom] of LIGNES_BILAN) {
        if (cle === 'casses' && !bilan.some(b => b && b.casses)) continue;
        html += '<tr><th scope="row">' + nom + '</th>';
        for (let f = 0; f < 3; f++) html += '<td>' + (bilan[f] && Number.isFinite(bilan[f][cle]) ? formatNombre(bilan[f][cle]) : '—') + '</td>';
        html += '</tr>';
      }
      poser($('fin-bilan'), html + '</tbody>');
      montrer('fin');
      focaliser($('fin-rejouer'));
    }

    // ---- Gestes : un seul aiguilleur pour la page. ----
    function premier(e) {
      if (gesteFait || e.isTrusted === false) return;
      gesteFait = true;
      try { rappels.premierGeste(); } catch (err) { /* l'audio refusé n'empêche pas de jouer */ }
    }
    const enDemoOuAttente = () => ecran === 'demo' || (ecran === 'titre' && demoDemandee);
    win.addEventListener('pointerdown', e => {
      clavierRecent = false;
      premier(e);
      if (enDemoOuAttente()) { e.preventDefault(); e.stopPropagation(); sortirDemo(); return; }
      dernierGeste = maintenant();
    }, { capture: true });
    win.addEventListener('pointermove', () => { if (ecran === 'titre' && !demoDemandee) dernierGeste = maintenant(); }, { capture: true, passive: true });
    win.addEventListener('wheel', e => {
      if (enDemoOuAttente()) { e.preventDefault(); e.stopPropagation(); sortirDemo(); return; }
      dernierGeste = maintenant();
    }, { capture: true, passive: false });
    win.addEventListener('click', e => {
      if (avalerJusque && maintenant() < avalerJusque) { e.preventDefault(); e.stopPropagation(); }
      avalerJusque = 0;
    }, { capture: true });
    win.addEventListener('contextmenu', e => { if (ecran === 'demo' || AVEC_HUD[ecran]) e.preventDefault(); }, { capture: true });

    const estSaisie = t => !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    const estModificateur = e => /^(Shift|Control|Alt|AltGraph|Meta|OS|CapsLock|Fn)$/.test(e.key);
    function toucheGenerale(e) { const x = REGL.indexer(REG.touches).get(REGL.touche(e)); return x ? x.general : null; }
    function echap() {
      if (panneau.ouvert) { fermerReglages(); return true; }
      if (ecran === 'preparation') { titre(); return true; }
      if (ecran !== 'partie') return false;
      if (commandes && commandes.annulerVisee()) return true;
      const d = $('diplomatie'), b = $('bouton-diplomatie');
      if (d && !d.hidden) { d.hidden = true; if (b) b.setAttribute('aria-expanded', 'false'); return true; }
      pause();
      return true;
    }
    function clavier(e) {
      const bas = e.type === 'keydown';
      if (bas) { clavierRecent = true; premier(e); }
      // Le panneau écoute une touche à assigner : elle lui revient, quelle qu'elle soit.
      if (panneau.ouvert && panneau.ecoute) { if (bas) panneau.toucheEcoutee(e); else e.preventDefault(); e.stopPropagation(); return; }
      if (enDemoOuAttente()) {
        if (bas && estModificateur(e)) return;
        e.preventDefault(); e.stopPropagation();
        if (bas) sortirDemo();
        return;
      }
      if (ecran === 'titre') dernierGeste = maintenant();
      if (bas && e.key === 'Escape') { if (echap()) { e.preventDefault(); e.stopPropagation(); } return; }
      if (ecran === 'pause' && bas && !e.repeat && !estSaisie(e.target) && toucheGenerale(e) === 'pause') { e.preventDefault(); e.stopPropagation(); reprendre(); return; }
      if (ecran !== 'partie' || panneau.ouvert || !commandes) return;
      if (estSaisie(e.target)) return;
      const bouton = e.target && e.target.closest ? e.target.closest('button') : null;
      if (bouton && (e.key === 'Enter' || e.code === 'Space')) return;     // le bouton focalisé garde Entrée et Espace
      if (commandes.clavier(e, bas)) { e.preventDefault(); e.stopPropagation(); }
    }
    win.addEventListener('keydown', clavier, true);
    win.addEventListener('keyup', clavier, true);
    // Hors partie, camera.js (window, en bouillonnement) ne voit pas le clavier : ni la démo ni un menu ne la font
    // bouger. Le relâché d'Espace passe toujours, pour qu'elle ne garde pas la carte saisie.
    const garder = e => { if ((ecran !== 'partie' || panneau.ouvert) && !(e.type === 'keyup' && e.code === 'Space')) e.stopPropagation(); };
    doc.addEventListener('keydown', garder);
    doc.addEventListener('keyup', garder);
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden && ecran === 'partie') pause();
      if (!doc.hidden) dernierGeste = maintenant();
    });
    // À la souris, un bouton du bandeau ne garde pas le focus : les raccourcis restent au jeu.
    const zoneHud = $('hud');
    if (zoneHud) {
      zoneHud.addEventListener('click', e => {
        if (e.detail > 0) { const b = e.target.closest('button'); if (b) b.blur(); }
      });
      zoneHud.addEventListener('contextmenu', e => e.preventDefault());
    }

    // ---- Boutons des écrans. ----
    // Un clic de bouton, où qu'il soit (écrans, panneau, bandeau) : un bruit d'interface. Le canevas n'en fait pas.
    racine.addEventListener('click', e => {
      const b = e.target && e.target.closest ? e.target.closest('button, [role="tab"], .option-bascule') : null;
      if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true') rappels.ui('clic');
    });
    const sur = (id, ev, f) => { const e = $(id); if (e) e.addEventListener(ev, f); };
    sur('titre-jouer', 'click', () => preparation());
    sur('titre-reglages', 'click', () => reglagesOuvrir('partie'));
    sur('titre-son', 'click', () => { REG.son = !REG.son; reglagesChanges(['son']); });
    sur('prep-retour', 'click', () => titre());
    sur('prep-lancer', 'click', () => lancer());
    sur('prep-camps', 'click', e => { const b = e.target.closest('[data-faction]'); if (b) choisirCamp(Number(b.dataset.faction), false); });
    sur('prep-camps', 'keydown', e => {
      const sens = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!sens) return;
      e.preventDefault();
      choisirCamp((REG.partie.faction + sens + 3) % 3, true);
    });
    sur('prep-alliance', 'change', e => { REG.partie.alliance = Number(e.target.value); sauverPartie(); });
    sur('prep-effectifs', 'click', e => { const b = e.target.closest('[data-effectifs]'); if (b) { REG.partie.effectifs = Number(b.dataset.effectifs); sauverPartie(); } });
    sur('prep-difficulte', 'click', e => { const b = e.target.closest('[data-difficulte]'); if (b) { REG.partie.difficulte = Number(b.dataset.difficulte); sauverPartie(); } });
    sur('prep-ville', 'click', e => { const b = e.target.closest('[data-ville]'); if (b) { REG.partie.ville = b.dataset.ville; sauverPartie(); } });
    sur('prep-graine', 'change', e => {
      const v = Math.round(Number(e.target.value));
      REG.partie.graine = Number.isFinite(v) ? borne(v, 1, 999999) : 1;
      e.target.value = String(REG.partie.graine);
      sauverPartie();
    });
    sur('prep-hasard', 'click', () => { REG.partie.graine = 1 + Math.floor(Math.random() * 999999); const g = $('prep-graine'); if (g) g.value = String(REG.partie.graine); sauverPartie(); });
    sur('prep-brouillard', 'click', () => { REG.partie.brouillard = !REG.partie.brouillard; sauverPartie(); });
    sur('prep-coalitions', 'click', () => { REG.partie.coalitions = !REG.partie.coalitions; sauverPartie(); });
    sur('fin-rejouer', 'click', () => { if (!options) return; const opt = options; chargement(0, 'La ville se dessine.'); rappels.nouvellePartie(opt); });
    sur('fin-retour', 'click', () => { rappels.retourTitre(); titre(); });
    sur('echec-recharger', 'click', () => win.location.reload());

    poser($('prep-effectifs'), C.EFFECTIFS.map(e => '<button type="button" data-effectifs="' + e + '" aria-pressed="false">' + formatNombre(e) + '</button>').join(''));
    poser($('prep-difficulte'), R.DIFFICULTES.map((d, k) => '<button type="button" data-difficulte="' + k + '" aria-pressed="false">' + echapper(d.nom) + '</button>').join(''));
    appliquer();

    return {
      brancher, chargement, titre, preparation, partie, etat, image, fin, echec, pause, reprendre, reglagesOuvrir,
      options: optionsPartie, optionsDemo, sortirDemo, rappels, reglages: REG, hud, panneau,
      get commandes() { return commandes; },
      get minicarte() { return minicarte; },
      get ecran() { return ecran; },
      get enDemo() { return enDemo; },
      get demoDemandee() { return demoDemandee; },
      get apercu() { return commandes ? commandes.apercu : null; },
      get realisateur() { return realisateur; },
    };
  }

  I.creerInterface = creerInterface;
})(globalThis.PDR = globalThis.PDR || {});
