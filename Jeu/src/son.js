/* Point de rupture — le son du jeu. Relie l'état de la simulation (sim/protocole.js), la caméra et l'interface au
   moteur sonore (moteur/audio.js) et à la musique (moteur/musique.js). Rien ne joue avant le premier geste : tant que
   geste() n'a pas ouvert le contexte audio, chaque appel rend la main aussitôt.
   Page seulement (pas dans le travailleur de simulation) ; ni window ni document : le fichier se charge dans Node.

   PDR.son = { creerSon(audio, options?) → son, prechauffer(surProgres?) → Promise<true>, MORCEAUX }
     audio    : PDR.audio.create() ; options.horloge() → secondes (essais : horloge réglable)
     prechauffer : calcule la banque de bruitages et les quatre morceaux par tranches (setTimeout 0 entre deux) sans
                   ouvrir aucun périphérique, à lancer pendant l'écran de chargement ; surProgres(0..1).

   son.geste()                  à appeler dans chaque pointerdown / keydown / touchend (le premier ouvre le contexte) ;
                                alias demarrer(), start(), resume() → Promise
   son.reglages(r)              r : réglages du joueur (interface/reglages.js) : son, volumeGeneral, volumeMusique,
                                volumeEffets (aussi les sons d'interface), volumeAmbiances ; au départ et à chaque changement
   son.ecran(nom, { joueur, vainqueur, alliance }?)   'chargement' | 'titre' | 'reglages' | 'preparation' | 'demo' |
                                'partie' | 'pause' | 'fin' | 'echec' : choisit le morceau (titre en titre, réglages,
                                préparation et démo ; celui du camp du joueur en partie), allume ou éteint les ambiances,
                                baisse la musique en pause ; rien ne joue au chargement ni en échec
   son.joueur(j)                camp du joueur : 0, 1, 2 ; -1 en démo
   son.carte(carte)             CARTE du message « pret » (grille des combats, étendue de la ville)
   son.etat(etat, vue)          à chaque message « etat », AVANT de rendre etat.unites au travailleur : balaie une tranche
                                des unités autour de la caméra, lit la grille des combats et les structures (feux,
                                chantiers), joue les évènements (atténués et placés selon la vue)
   son.image(dt, vue)           à chaque image : écoute selon la hauteur de la caméra, musique et séquenceur de rue
   son.ui(nom, details?)        'clic' | 'survol' | 'selection' { n, camp } | 'ordre' { sorte | cmd, camp } |
                                'refus' | 'menu' { ouvert }
   son.commande(cmd | liste)    l'accusé de réception d'un ordre envoyé (protocole.CMD), à la façon du camp du joueur
   son.essai() → Promise<bool>  deux secondes de mixage (faux si le son est coupé ou indisponible)
   son.module(cle?) → { octets: Uint8Array, nom, titre }   le morceau en cours (ou cle) en module ProTracker
   son.morceau() → { cle, titre, style, bpm, duree, canaux, octets }   le morceau choisi
   son.liberer()                ferme le contexte et détache tout ; stats (lecture seule)
   vue : la vue de camera.js, { cible: [x, z], D, yaw, axes? } ; seuls ces champs sont lus. */
(function (PDR) {
  'use strict';

  const { exp, sqrt, min, max, cos, sin, pow, ceil } = Math;
  const borner = (v, a, b) => (v < a ? a : v > b ? b : v);
  const nombre = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

  const MORCEAUX = Object.freeze(['convergence', 'bastion', 'prefecture']);
  const VERS_SORTE = Object.freeze({ voiture: 'voiture', abribus: 'vitre', vitrine: 'vitre', poubelle: 'metal', banc: 'bois', barriere: 'metal' });
  const DMIN = 40, DMAX = 900, TRANCHE_MIN = 2048;

  // Accumulateurs du balayage des unités : poids w = 1 - q (q : carré de la distance elliptique au centre de la vue)
  // et w × a (a : place latérale, -1 à gauche de l'écran, 1 à droite).
  const TOTAL = 0, CAMP = 1, LAT = 4, COMBAT = 7, LAT_COMBAT = 8, BOUCLIER = 9, SIRENE = 10, LAT_SIRENE = 11,
    FANFARE = 12, CHANTIER = 13, LAT_CHANTIER = 14, LEVER = 15, LAT_LEVER = 16, NB_ACC = 17;
  const MONDE = 1, ANNONCE = 2, NB_TYPES = 32, K = 4;

  function creerSon(audio, options = {}) {
    if (!audio || typeof audio.tick !== 'function') throw new TypeError('son : moteur audio manquant');
    const P = PDR.protocole, R = PDR.regles;
    if (!P || !R) throw new Error('son : contrats absents (sim/regles.js et sim/protocole.js)');
    const EV = P.EV, CMD = P.CMD, TAILLE = P.EV_TAILLE, SORTES = P.SORTES_CASSABLES, ET = R.ETATS, DR = R.DRAPEAUX;
    const T_FANFARE = 3, T_MOTARDS = 11, T_CANON = 12;
    // Le chronomètre (ms) mesure le coût de etat() ; l'horloge (s) date les évènements et peut être celle du jeu.
    const chrono = globalThis.performance && typeof globalThis.performance.now === 'function' ? () => globalThis.performance.now() : () => Date.now();
    const horloge = typeof options.horloge === 'function' ? options.horloge : () => chrono() / 1000;
    const N = audio.niveaux;

    // Les évènements : combien d'une même sorte jouent au plus par état (les plus forts), et comment on les place :
    // MONDE atténué et placé selon la caméra ; ANNONCE toujours entendue s'il concerne le joueur, pan léger.
    const MODE = new Uint8Array(NB_TYPES), PLAFOND = new Uint8Array(NB_TYPES);
    for (const [t, m, k] of [
      [EV.HORS_JEU, MONDE, 4], [EV.CASSE, MONDE, 3], [EV.BARRICADE_POSEE, MONDE, 2], [EV.BARRICADE_FINIE, MONDE, 2],
      [EV.BARRICADE_LEVEE, MONDE, 2], [EV.STRUCTURE_FINIE, MONDE, 2], [EV.STRUCTURE_DETRUITE, MONDE, 2],
      [EV.SALVE_ANNONCE, MONDE, 2], [EV.SALVE, MONDE, 2], [EV.JET, MONDE, 2], [EV.GISEMENT_EPUISE, MONDE, 1], [EV.SOIN, MONDE, 1],
      [EV.LIEU_PRIS, ANNONCE, 2], [EV.LIEU_NEUTRALISE, ANNONCE, 2], [EV.PRODUCTION, ANNONCE, 1], [EV.ALLIANCE_FORMEE, ANNONCE, 1],
      [EV.ALLIANCE_ROMPUE, ANNONCE, 1], [EV.ALLIANCE_PROPOSEE, ANNONCE, 1], [EV.COLERE, ANNONCE, 1], [EV.ATTAQUE_SUBIE, ANNONCE, 1],
      [EV.ELIMINATION, ANNONCE, 3], [EV.VICTOIRE, ANNONCE, 1], [EV.QG_OCCUPE, ANNONCE, 2], [EV.QG_REPRIS, ANNONCE, 2],
      [EV.REFUS, ANNONCE, 1]]) { if (t > 0 && t < NB_TYPES) { MODE[t] = m; PLAFOND[t] = k; } }
    const choixN = new Uint8Array(NB_TYPES), choixO = new Int32Array(NB_TYPES * K), choixG = new Float32Array(NB_TYPES * K);
    const choixP = new Float32Array(NB_TYPES * K), choixU = new Float32Array(NB_TYPES * K);

    let joueur = Number.isInteger(options.joueur) ? options.joueur : -1, alliance = null, ecranCourant = '', cle = 'titre';
    let sonActif = true, preparerFait = false, repriseMusique = 0, dernierFin = -1e9, libere = false;
    // La caméra : centre visé, droite et avant au sol, demi-largeur et demi-profondeur de l'ellipse écoutée.
    let cx = 0, cz = 0, D = 330, rx = 1, rz = 0, fx = 0, fz = -1, invL = 1 / 261, invP = 1 / 211.5, rayon = 261;
    let gainEvt = 1, gainAmb = 1, altitude = (330 - DMIN) / (DMAX - DMIN);
    let placePan = 0, placeU = 0;
    // Balayage des unités par tranches, grille des combats, structures.
    const acc = new Float64Array(NB_ACC), presence = new Float32Array(3);
    let curseur = 0, meleeBalayage = 0, latMelee = 0, meleeGrille = 0, latGrille = 0, totalGrille = 0, grille = null, etendue = null;
    let structures = null, enFeu = new Set(), chantierBalayage = 0, latChantierB = 0;
    // Tension de la musique, jet en cours, clameurs de la foule.
    let tension = 0, dernierEtat = 0, jetG = 0, jetPan = 0, jetDernier = -1e9, horsJeuVus = 0, dernierHorsJeuPan = 0;
    const stats = { etats: 0, passes: 0, unitesVues: 0, msEtat: 0, msEtatMax: 0, evenements: 0, retenus: 0, intensite: 0,
      get audio() { return audio.stats; }, get musique() { return audio.lecteur ? audio.lecteur.stats : null; } };
    const evt = { niveau: 1, pan: 0, camp: -1, sorte: '', ami: true, delai: 1.5, touchees: 0, important: false, n: 1, ouvert: true };
    function remplir(g, p, camp) {
      evt.niveau = g; evt.pan = p; evt.camp = camp; evt.sorte = ''; evt.ami = true; evt.delai = 1.5; evt.touchees = 0;
      evt.important = false; evt.n = 1; evt.ouvert = true;
      return evt;
    }
    const vivant = () => !libere && sonActif && audio.enMarche;
    const notre = f => joueur >= 0 && (f === joueur || R.allies(joueur, f, alliance));

    function regarder(vue) {
      if (!vue) return;
      const c = vue.cible;
      if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) { cx = c[0]; cz = c[1]; }
      const droite = vue.axes && vue.axes.right;
      if (droite && Number.isFinite(droite[0]) && Number.isFinite(droite[2])) {
        const l = sqrt(droite[0] * droite[0] + droite[2] * droite[2]) || 1;
        rx = droite[0] / l; rz = droite[2] / l;
      } else if (Number.isFinite(vue.yaw)) { rx = cos(vue.yaw); rz = sin(vue.yaw); }
      fx = rz; fz = -rx;   // l'avant au sol : vers le haut de l'écran
      if (Number.isFinite(vue.D) && vue.D > 0 && vue.D !== D) {
        D = vue.D;
        const L = 0.7 * D + 30, Q = 0.55 * D + 30;
        invL = 1 / L; invP = 1 / Q; rayon = max(L, Q);
        gainEvt = borner(pow(330 / D, 0.45), 0.5, 1.25);
        gainAmb = borner(pow(330 / D, 0.3), 0.6, 1);
        altitude = borner((D - DMIN) / (DMAX - DMIN), 0, 1);
      }
    }
    /** Niveau d'un son placé en (x, z) : plein au centre de la vue, la moitié au bord, rien au-delà de deux fois la vue.
     *  Pose placePan (-0,9..0,9) et placeU (distance elliptique, 1 : bord de la vue). */
    function placer(x, z) {
      const dx = x - cx, dz = z - cz, a = (dx * rx + dz * rz) * invL, b = (dx * fx + dz * fz) * invP, u = sqrt(a * a + b * b);
      placeU = u; placePan = (a < -1 ? -1 : a > 1 ? 1 : a) * 0.9;
      const g = (u <= 1 ? 1 - 0.55 * u * u : u < 2 ? 0.45 * (2 - u) * (2 - u) : 0) * gainEvt;
      return g > 1 ? 1 : g;
    }

    // ---- Les unités : une tranche par état (un quart du tampon, au moins 2 048 emplacements), sans allocation. ----
    function compter(f32, debut, fin) {
      const R2 = rayon, ATTAQUE = ET.ATTAQUE, CONSTRUIT = ET.CONSTRUIT, LEVE = ET.LEVE, CASSE = ET.CASSE, HORS = ET.HORS_JEU;
      const TOUCHE = DR.TOUCHE, BOUCL = DR.BOUCLIER, VEHICULE = DR.VEHICULE;
      for (let i = debut; i < fin; i++) {
        const o = i << 2, c = f32[o + 3] | 0, f = c & 3;
        if (f === 3) continue;
        const dx = f32[o] - cx;
        if (dx > R2 || dx < -R2) continue;
        const dz = f32[o + 1] - cz;
        if (dz > R2 || dz < -R2) continue;
        const a = (dx * rx + dz * rz) * invL, b = (dx * fx + dz * fz) * invP, q = a * a + b * b;
        if (q >= 1) continue;
        const etat = (c >>> 6) & 15;
        if (etat === HORS) continue;
        const w = 1 - q, wa = w * a, drap = (c >>> 16) & 255, type = (c >>> 2) & 15;
        acc[TOTAL] += w; acc[CAMP + f] += w; acc[LAT + f] += wa;
        if (etat === ATTAQUE || (drap & TOUCHE)) { acc[COMBAT] += w; acc[LAT_COMBAT] += wa; if (drap & BOUCL) acc[BOUCLIER] += w; }
        if (f === 2 && (type === T_MOTARDS || type === T_CANON || (drap & VEHICULE))) { acc[SIRENE] += w; acc[LAT_SIRENE] += wa; }
        else if (f === 0 && type === T_FANFARE) acc[FANFARE] += w;
        if (etat === CONSTRUIT) { acc[CHANTIER] += w; acc[LAT_CHANTIER] += wa; }
        else if (etat === LEVE || etat === CASSE) { acc[LEVER] += w; acc[LAT_LEVER] += wa; }
      }
    }
    function balayer(f32, n) {
      if (curseur >= n) curseur = 0;
      const tranche = n <= TRANCHE_MIN ? n : max(TRANCHE_MIN, ceil(n / 4)), fin = min(n, curseur + tranche);
      compter(f32, curseur, fin);
      curseur = fin;
      if (curseur >= n) { publier(); curseur = 0; }
    }
    const moyenne = (somme, poids) => (poids > 0.01 ? borner(somme / poids, -1, 1) : 0);
    /** Fin d'une passe complète : les niveaux d'ambiance suivent la foule en vue. */
    function publier() {
      const t = acc[TOTAL], densite = 1 - exp(-t / 120);
      stats.passes++; stats.unitesVues = t;
      N.foule = min(1, densite * gainAmb);
      N.foulePan = moyenne(acc[LAT] + acc[LAT + 1] + acc[LAT + 2], t);
      for (let f = 0; f < 3; f++) {
        const w = acc[CAMP + f], part = t > 0.01 ? w / t : 0;
        presence[f] = min(1, densite * pow(part, 0.6) * gainAmb);
        N.pans[f] = moyenne(acc[LAT + f], w);
      }
      // Chaque camp en vue, selon sa part : chants de la Convergence et du Bastion, batucada (plus forte avec une
      // Fanfare), tambours du Bastion, sifflets de la Convergence et de la Préfecture, radios de la Préfecture.
      N.chants[0] = presence[0]; N.chants[1] = presence[1]; N.chants[2] = 0;
      N.tambours[0] = min(1, 0.3 * presence[0] + (1 - exp(-acc[FANFARE] / 4)) * gainAmb);
      N.tambours[1] = 0.6 * presence[1]; N.tambours[2] = 0;
      N.sifflets[0] = 0.8 * presence[0]; N.sifflets[1] = 0; N.sifflets[2] = presence[2];
      N.radio = presence[2];
      meleeBalayage = 1 - exp(-acc[COMBAT] / 25); latMelee = moyenne(acc[LAT_COMBAT], acc[COMBAT]);
      N.bouclier = acc[COMBAT] > 0.01 ? acc[BOUCLIER] / acc[COMBAT] : 0;
      const sirene = min(1, (1 - exp(-acc[SIRENE] / 3)) * gainAmb), panSirene = moyenne(acc[LAT_SIRENE], acc[SIRENE]);
      // Des véhicules entrent dans la vue : un coup de sirène, puis les épisodes de l'ambiance.
      if (sirene > 0.2 && N.sirene < 0.05 && vivant()) audio.sirene(remplir(sirene * 0.8, panSirene * 0.9, 2));
      N.sirene = sirene; N.sirenePan = panSirene;
      chantierBalayage = 1 - exp(-acc[CHANTIER] / 6); latChantierB = moyenne(acc[LAT_CHANTIER], acc[CHANTIER]);
      const lever = min(1, (1 - exp(-acc[LEVER] / 6)) * gainAmb), panLever = moyenne(acc[LAT_LEVER], acc[LEVER]);
      if (lever > 0.25 && N.lever < 0.05 && vivant()) audio.lever(remplir(lever, panLever * 0.9, -1));
      N.lever = lever; N.leverPan = panLever;
      acc.fill(0);
      melanger();
    }
    function melanger() {
      const m = max(meleeBalayage, meleeGrille);
      N.melee = min(1, m * gainAmb);
      N.meleePan = meleeGrille > meleeBalayage ? latGrille : latMelee;
      N.ville = 0.55 + 0.45 * altitude; N.altitude = altitude;
    }

    // ---- La grille des combats : coups portés par case, autour de la caméra et sur toute la ville. ----
    let gTaille = 0, gX0 = 0, gZ0 = 0, gCellule = 0;
    function geometrie(g) {
      gTaille = 0;
      if (!g || !(g.taille > 0) || !Number.isFinite(g.cote) || !(g.cote > 0)) return;
      gTaille = g.taille | 0; gX0 = nombre(g.x0, 0); gZ0 = nombre(g.z0, 0);
      // « cote » : côté d'une case ou de toute la grille ? Le contrat ne le dit pas : on retient la lecture qui couvre
      // la ville (CARTE.etendue), sinon une case de plus de 100 m passe pour la grille entière.
      const largeur = etendue ? max(etendue.x1 - etendue.x0, etendue.z1 - etendue.z0) : 0;
      if (largeur > 0) gCellule = Math.abs(g.cote - largeur) < Math.abs(g.cote * gTaille - largeur) ? g.cote / gTaille : g.cote;
      else gCellule = g.cote > 100 ? g.cote / gTaille : g.cote;
    }
    function lireCombats(c) {
      if (!gTaille || !c) return;
      const n = min(c.length, gTaille * gTaille), h = gCellule * 0.5;
      let total = 0, S = 0, SA = 0;
      for (let k = 0; k < n; k++) {
        const v = c[k];
        if (!v) continue;
        total += v;
        const j = (k / gTaille) | 0, i = k - j * gTaille, dx = gX0 + i * gCellule + h - cx, dz = gZ0 + j * gCellule + h - cz;
        const a = (dx * rx + dz * rz) * invL, b = (dx * fx + dz * fz) * invP, q = a * a + b * b;
        if (q >= 1.4) continue;
        const w = q < 1 ? 1 - 0.6 * q : 1.4 - q;   // 0,4 au bord de la vue, rien au-delà de 1,4
        S += v * w; SA += v * w * a;
      }
      totalGrille = total;
      meleeGrille = 1 - exp(-S / 40); latGrille = S > 0.01 ? borner(SA / S, -1, 1) : 0;
    }

    // ---- Les structures : feux et chantiers en vue ; un feu qui prend fait son bruit. ----
    function majStructures(liste, silencieux) {
      structures = Array.isArray(liste) ? liste : null;
      const brulent = new Set();
      let allumes = 0;
      if (structures) for (const s of structures) {
        if (!s || !s.feu) continue;
        brulent.add(s.id);
        if (!silencieux && !enFeu.has(s.id) && allumes < 3) {
          const g = placer(milieu(s.x, s.x2), milieu(s.z, s.z2));
          if (g > 0.02) { audio.feu(remplir(g, placePan, s.faction)); allumes++; }
        }
      }
      enFeu = brulent;
    }
    const milieu = (a, b) => (Number.isFinite(b) ? (a + b) / 2 : a);
    function lireStructures() {
      let feu = 0, latFeu = 0, chantier = 0, latChantier = 0;
      if (structures) for (let k = 0; k < structures.length; k++) {
        const s = structures[k];
        if (!s || (!s.feu && !s.chantier)) continue;
        const g = placer(milieu(s.x, s.x2), milieu(s.z, s.z2));
        if (g <= 0.01) continue;
        if (s.feu) { feu += g; latFeu += g * placePan; } else { chantier += g; latChantier += g * placePan; }
      }
      N.feu = min(1, 1 - exp(-feu / 1.2)); N.feuPan = feu > 0.01 ? borner(latFeu / feu, -1, 1) : 0;
      const c = max(chantierBalayage, 1 - exp(-chantier / 1.5));
      N.chantier = min(1, c * gainAmb);
      N.chantierPan = chantierBalayage > 1 - exp(-chantier / 1.5) ? latChantierB : chantier > 0.01 ? borner(latChantier / chantier, -1, 1) : 0;
    }

    // ---- Les évènements de l'état : les plus forts de chaque sorte, atténués et placés selon la vue. ----
    function niveauDe(t, liste, o) {
      const x = liste[o + 1], z = liste[o + 2], f = liste[o + 3] | 0, a = liste[o + 4] | 0, b = liste[o + 5] | 0;
      placePan = 0; placeU = 0;
      if (MODE[t] === MONDE) {
        const g = placer(x, z);
        return t === EV.STRUCTURE_FINIE && notre(f) ? max(g, 0.45) : g;
      }
      switch (t) {
        case EV.LIEU_PRIS: placer(x, z); return joueur < 0 ? 0.6 : notre(f) ? 1 : 0.75;
        case EV.LIEU_NEUTRALISE: placer(x, z); return notre(f) ? 1 : joueur < 0 ? 0.5 : 0.6;
        case EV.PRODUCTION: return f === joueur ? 0.8 : 0;
        case EV.ALLIANCE_FORMEE: case EV.ALLIANCE_ROMPUE: return joueur < 0 ? 0.5 : (a === joueur || b === joueur || f === joueur) ? 1 : 0.6;
        case EV.ALLIANCE_PROPOSEE: return joueur >= 0 && a === joueur ? 1 : 0;
        case EV.COLERE: return max(0.55, placer(x, z));
        // Une attaque que l'on voit n'a pas besoin d'alerte : seulement hors de la vue.
        case EV.ATTAQUE_SUBIE: if (f !== joueur) return 0; placer(x, z); return placeU > 0.8 ? 0.9 : 0;
        case EV.ELIMINATION: return f === joueur ? 1 : 0.7;
        case EV.VICTOIRE: return 1;
        case EV.QG_OCCUPE: placer(x, z); return f === joueur ? 1 : notre(a) ? 0.9 : joueur < 0 ? 0.55 : 0;
        case EV.QG_REPRIS: placer(x, z); return f === joueur ? 0.9 : joueur < 0 ? 0.5 : 0;
        case EV.REFUS: return joueur >= 0 && f === joueur ? 0.9 : 0;
        default: return 0;
      }
    }
    function retenir(t, o, g) {
      const base = t * K, n = choixN[t], plafond = PLAFOND[t];
      let j = n;
      if (n >= plafond) {
        j = 0;
        for (let k = 1; k < plafond; k++) if (choixG[base + k] < choixG[base + j]) j = k;
        if (g <= choixG[base + j]) return;
      } else choixN[t] = n + 1;
      choixO[base + j] = o; choixG[base + j] = g; choixP[base + j] = placePan; choixU[base + j] = placeU;
    }
    function jouer(t, liste, o, g, p, u, maintenant) {
      const f = liste[o + 3] | 0, a = liste[o + 4], b = liste[o + 5], e = remplir(g, p, f);
      switch (t) {
        case EV.HORS_JEU: audio.horsJeu(e); break;
        case EV.CASSE: e.sorte = VERS_SORTE[SORTES[b | 0]] || 'metal'; audio.casse(e); break;
        case EV.BARRICADE_POSEE: audio.barricadePosee(e); break;
        case EV.BARRICADE_FINIE: audio.barricadeFinie(e); break;
        case EV.BARRICADE_LEVEE: audio.barricadeLevee(e); break;
        case EV.STRUCTURE_FINIE: audio.chantierFini(e); break;
        case EV.STRUCTURE_DETRUITE:
          e.sorte = 'structure'; audio.casse(e);
          // Une de nos structures tombe hors de la vue : on prévient.
          if ((b | 0) === joueur && u > 0.8) audio.alerte(remplir(0.85, p, joueur));
          break;
        case EV.LIEU_PRIS: e.ami = joueur < 0 || notre(f); audio.lieuPris(e); break;
        case EV.LIEU_NEUTRALISE: if (notre(f)) audio.lieuPerdu(e); else audio.lieuNeutralise(e); break;
        case EV.SALVE_ANNONCE: e.delai = nombre(b, 1.5); audio.salveAnnonce(e); break;
        case EV.SALVE: e.touchees = max(0, nombre(b, 0)); audio.salve(e); if (u < 1) tension = max(tension, 0.7); break;
        case EV.JET:
          // Un jet envoie un évènement toutes les 10 itérations : le premier fait le bruit d'attaque, la suite tient la boucle.
          if (maintenant - jetDernier > 1.2) audio.jet(e);
          jetDernier = maintenant; if (g > jetG) { jetG = g; jetPan = p; }
          break;
        case EV.PRODUCTION: audio.production(e); break;
        case EV.GISEMENT_EPUISE: audio.gisementEpuise(e); break;
        case EV.ALLIANCE_FORMEE: audio.allianceFormee(e); break;
        case EV.ALLIANCE_ROMPUE: audio.allianceRompue(e); break;
        case EV.ALLIANCE_PROPOSEE: audio.allianceProposee(e); break;
        case EV.COLERE: e.camp = 1; audio.colere(e); tension = max(tension, 0.75); break;
        case EV.ATTAQUE_SUBIE: audio.alerte(e); tension = max(tension, 0.8); break;
        case EV.ELIMINATION: e.important = true; audio.elimination(e); break;
        case EV.VICTOIRE: annoncerFin(a | 0); break;
        case EV.QG_OCCUPE: e.ami = f === joueur; audio.qgOccupe(e); if (f === joueur) tension = 1; break;
        case EV.QG_REPRIS: audio.qgRepris(e); break;
        case EV.REFUS: audio.refus(e); break;
        case EV.SOIN: audio.soin(e); break;
        default: break;
      }
    }
    function evenements(liste, maintenant, dt) {
      const n = liste && liste.length ? (liste.length / TAILLE) | 0 : 0;
      choixN.fill(0);
      let vus = 0;
      for (let k = 0; k < n; k++) {
        const o = k * TAILLE, t = liste[o] | 0;
        if (t <= 0 || t >= NB_TYPES || !MODE[t]) continue;
        const g = niveauDe(t, liste, o);
        if (g < 0.02) continue;
        if (t === EV.HORS_JEU && g > 0.35) { vus++; dernierHorsJeuPan = placePan; }
        retenir(t, o, g);
      }
      stats.evenements += n;
      jetG = 0;
      for (let t = 1; t < NB_TYPES; t++) {
        const m = choixN[t];
        for (let j = 0; j < m; j++) {
          const s = t * K + j;
          jouer(t, liste, choixO[s], choixG[s], choixP[s], choixU[s], maintenant);
        }
        stats.retenus += m;
      }
      // La foule pousse un « oh ! » quand beaucoup d'unités tombent sous les yeux du joueur.
      horsJeuVus = horsJeuVus * exp(-dt / 1.5) + vus;
      if (horsJeuVus >= 6) { horsJeuVus = 0; const e = remplir(0.7, dernierHorsJeuPan, -1); e.sorte = 'oh'; audio.clameur(e); }
      // La boucle du canon à eau tient tant que le jet dure.
      if (maintenant - jetDernier < 0.9) { if (jetG > 0) { N.jet = jetG; N.jetPan = jetPan; } } else N.jet = 0;
    }
    function annoncerFin(v) {
      dernierFin = horloge();
      const e = remplir(1, 0, joueur);
      e.important = true;
      if (joueur < 0) { e.camp = v >= 0 && v <= 2 ? v : alliance ? alliance[0] : -1; audio.victoire(e); return; }
      const gagne = v === joueur || (v === P.VAINQUEUR.ALLIANCE && !!alliance && (alliance[0] === joueur || alliance[1] === joueur));
      if (gagne) audio.victoire(e);
      else { if (v === P.VAINQUEUR.NUL) e.niveau = 0.7; audio.defaite(e); }
    }
    function remettre() {
      acc.fill(0); curseur = 0; meleeBalayage = meleeGrille = totalGrille = 0; tension = 0; jetG = 0; horsJeuVus = 0;
      N.foule = N.melee = N.bouclier = N.feu = N.sirene = N.jet = N.chantier = N.lever = N.radio = 0;
      N.chants.fill(0); N.tambours.fill(0); N.sifflets.fill(0); N.pans.fill(0);
    }
    function choisir(valeur) {
      cle = valeur;
      audio.morceau(cle);
      if (audio.enMarche) audio.preparer(cle);
    }
    function sorteDe(c) {
      const t = typeof c === 'number' ? c : c && c.t;
      switch (t) {
        case CMD.DEPLACER: return c && c.mode === 1 ? 'attaquer' : 'deplacer';
        case CMD.ATTAQUER: case CMD.CAPACITE: return 'attaquer';
        case CMD.ARRETER: case CMD.TENIR: return 'tenir';
        case CMD.REPLIER: return 'replier';
        case CMD.REGROUPER: return 'regrouper';
        case CMD.RECOLTER: return 'recolter';
        case CMD.CASSER: case CMD.LEVER: case CMD.BARRICADER: case CMD.CONSTRUIRE: return 'outil';
        default: return '';
      }
    }
    function geste() {
      if (libere) return Promise.resolve();
      const p = audio.demarrer();
      if (!preparerFait) {
        preparerFait = true;
        p.then(() => { if (!libere && audio.enMarche) audio.preparer(cle); }, () => {});
      }
      return p;
    }

    const son = {
      geste, demarrer: geste, start: geste, resume: geste,
      reglages(r) {
        if (!r || libere) return;
        const actif = r.son !== false;
        if (actif !== sonActif) { sonActif = actif; audio.sourdine(!actif); }
        const effets = borner(nombre(r.volumeEffets, 1), 0, 1);
        audio.mixage({ general: borner(nombre(r.volumeGeneral, 1), 0, 1), musique: borner(nombre(r.volumeMusique, 0.45), 0, 1),
          effets, ambiance: borner(nombre(r.volumeAmbiances, 0.8), 0, 1), interface: effets });
      },
      joueur(j) { joueur = j === 0 || j === 1 || j === 2 ? j : -1; },
      ecran(nom, o) {
        if (libere) return;
        if (o && Number.isInteger(o.joueur)) son.joueur(o.joueur);
        if (o && Array.isArray(o.alliance)) alliance = o.alliance;
        const avant = ecranCourant;
        ecranCourant = nom; repriseMusique = 0;
        switch (nom) {
          case 'chargement': case 'echec': audio.pause(false); audio.actif(false); audio.musique(false); break;
          case 'titre': case 'preparation': case 'reglages':
            audio.pause(false); audio.actif(false); choisir('titre'); audio.intensite(0); audio.musique(true); break;
          case 'demo':
            if (avant !== 'demo') remettre();
            audio.pause(false); audio.actif(true); choisir('titre'); audio.musique(true); break;
          case 'partie':
            if (avant !== 'pause' && avant !== 'partie') remettre();
            audio.pause(false); audio.actif(true); choisir(joueur >= 0 ? MORCEAUX[joueur] : 'titre'); audio.musique(true); break;
          case 'pause': audio.pause(true); break;
          case 'fin':
            // Le jingle de fin joue seul ; le thème du titre revient ensuite.
            audio.pause(false); audio.actif(false); audio.musique(false); repriseMusique = horloge() + 3.2;
            if (o && Number.isInteger(o.vainqueur) && o.vainqueur >= 0 && horloge() - dernierFin > 4 && vivant()) annoncerFin(o.vainqueur);
            break;
          default: break;
        }
      },
      carte(c) {
        if (!c) return;
        etendue = c.etendue && Number.isFinite(c.etendue.x0) ? c.etendue : null;
        grille = c.combats || null;
        geometrie(grille);
      },
      etat(e, vue) {
        if (!e || libere) return;
        regarder(vue);
        if (Array.isArray(e.alliance) || e.alliance === null) alliance = e.alliance;
        if (!vivant()) {
          // Sans son, on ne garde que ce qu'il faut pour ne pas tout rejouer d'un coup au retour du son.
          if (e.structures) majStructures(e.structures, true);
          return;
        }
        const t0 = chrono(), debut = horloge(), dt = dernierEtat ? borner(debut - dernierEtat, 0, 1) : 0.05;
        dernierEtat = debut; stats.etats++;
        if (e.structures) majStructures(e.structures, false);
        const tampon = e.unites, n = e.n | 0;
        if (tampon && n > 0) {
          const f32 = tampon instanceof Float32Array ? tampon : tampon.byteLength >= n * 16 ? new Float32Array(tampon, 0, n * 4) : null;
          if (f32 && f32.length >= n * 4) balayer(f32, n);
        }
        if (e.combats) { lireCombats(e.combats); melanger(); }
        lireStructures();
        evenements(e.evenements, debut, dt);
        // La musique se tend avec la mêlée en vue, les combats de toute la ville et les alertes récentes.
        tension = max(0, tension - dt / 12);
        const intensite = max(max(meleeBalayage, meleeGrille) * 0.9, (1 - exp(-totalGrille / 400)) * 0.7, tension);
        stats.intensite = intensite;
        audio.intensite(intensite);
        const ms = chrono() - t0;
        stats.msEtat = ms; if (ms > stats.msEtatMax) stats.msEtatMax = ms;
      },
      image(dt, vue) {
        if (libere) return;
        regarder(vue);
        if (!audio.enMarche) return;
        audio.ecoute(altitude);
        if (repriseMusique && horloge() >= repriseMusique) { repriseMusique = 0; choisir('titre'); audio.intensite(0); audio.musique(true); }
        audio.tick();
      },
      ui(nom, d) {
        if (!vivant()) return;
        const camp = d && (d.camp === 0 || d.camp === 1 || d.camp === 2) ? d.camp : joueur;
        const e = remplir(d && Number.isFinite(d.niveau) ? borner(d.niveau, 0, 1) : 1, 0, camp);
        switch (nom) {
          case 'clic': audio.clic(e); break;
          case 'survol': audio.survol(e); break;
          case 'selection': e.n = d && d.n > 0 ? d.n : 1; audio.selection(e); break;
          case 'ordre': e.sorte = (d && (d.sorte || sorteDe(d.cmd))) || 'deplacer'; audio.ordre(e); break;
          case 'refus': audio.refus(e); break;
          case 'menu': e.ouvert = !(d && d.ouvert === false); audio.menu(e); break;
          default: break;
        }
      },
      commande(c) {
        const liste = Array.isArray(c) ? c : [c];
        for (const x of liste) {
          const sorte = sorteDe(x);
          if (sorte) { son.ui('ordre', { sorte }); return; }
        }
        if (liste.length) son.ui('clic');
      },
      essai() {
        if (libere) return Promise.resolve(false);
        return audio.essai({ sourdine: !sonActif, camp: joueur >= 0 ? joueur : 0 });
      },
      module(valeur) {
        const M = PDR.musique, k = M && M.CLES.includes(valeur) ? valeur : cle;
        if (!M) return null;
        return { octets: M.module(k), nom: 'point-de-rupture-' + k + '.mod', titre: M.morceau(k).titre };
      },
      morceau() { return PDR.musique ? PDR.musique.morceau(cle) : null; },
      liberer() { if (libere) return; libere = true; audio.liberer(); structures = null; enFeu = new Set(); },
      stats,
      get cle() { return cle; },
      get ecranCourant() { return ecranCourant; },
    };
    return son;
  }

  let prechauffage = null;
  function prechauffer(surProgres) {
    if (prechauffage) return prechauffage;
    const A = PDR.audio, M = PDR.musique, signaler = (a, b) => p => { if (surProgres) surProgres(a + b * p); };
    prechauffage = Promise.resolve()
      .then(() => (A ? A.prechauffer(signaler(0, 0.35)) : null))
      .then(() => (M ? M.prechauffer(M.CLES, signaler(0.35, 0.65)) : null))
      .then(() => { if (surProgres) surProgres(1); return true; });
    prechauffage.catch(() => { prechauffage = null; });
    return prechauffage;
  }

  PDR.son = Object.freeze({ creerSon, prechauffer, MORCEAUX });
})(globalThis.PDR = globalThis.PDR || {});
