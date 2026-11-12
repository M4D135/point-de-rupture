/* Point de rupture — protocole entre la page et le travailleur de simulation : messages, commandes, évènements,
   tampons. Contrat partagé (CONCEPTION.md §3) ; aucune dépendance, ni window ni document.

   Page → travailleur (postMessage, clonage structuré) :
     { type: 'demarrer', options }           options : voir OPTIONS ci-dessous
     { type: 'commandes', liste: [cmd, …] }   cmd : voir CMD ; positions en mètres, quantifiées au mm par le travailleur
     { type: 'rendre', tampon: ArrayBuffer }  rend un tampon d'unités déjà lu, pour qu'il resserve (transféré)
     { type: 'vitesse', x }                   0 : pause ; de 0 à 8 : multiplie la cadence de 20 itérations/s
     { type: 'arreter' }
   Travailleur → page :
     { type: 'pret', carte, options }         carte : voir CARTE ; la ville est prête, la partie démarre
     { type: 'etat', … }                      après chaque itération : voir ETAT
     { type: 'fin', vainqueur, raison, temps, victoire, eco, bilan, enregistrement }   voir FIN
     { type: 'erreur', message, pile }

   OPTIONS = { graine: entier, effectifs: 20000…200000, joueur: 0, 1, 2 ou -1 (démo : trois IA ; le brouillard y
               est forcé à faux et renvoyé ainsi dans « pret »), alliance: [a, b] ou null, difficulte: 0, 1, 2,
               brouillard: booléen, coalitions: booléen (les IA peuvent s'allier entre elles en cours de partie),
               enregistrer: booléen, ville: VILLES ('marseille' : le plan réel ; 'damier' : la ville de la graine),
               victoire: { mode: 'dernier' | 'temps' | 'points' | 'mixte', points: entier, duree: minutes } (0.3 ;
                 facultatif, remis en forme par PDR.regles.victoire : absent, { mode: 'dernier', points: 3000,
                 duree: 20 } ; « mixte » sans chiffres : 3 000 points, 40 minutes ; choix proposés :
                 regles.CONSTANTES.VICTOIRE) ; voir VICTOIRE plus bas,
               manifestants: 'peu' | 'moyen' | 'beaucoup' (0.3 ; facultatif, 'moyen' par défaut) : la part de la
                 Convergence dans les effectifs — 34, 40 ou 50 % (regles.parts) ; le total ne change pas }
   « pret ».options rend la ville vraiment construite (villeDe(options, ilots) la refait à l'identique dans la page),
   la victoire et les manifestants remis en forme. En démo, options.victoire est ignoré et rendu { mode: 'dernier',
   points: 0, duree: 0 } (0 : ni cible ni limite de temps) : une démo ne finit ni aux points ni au temps (voir VICTOIRE).

   CARTE = { ilots, etendue: { x0, z0, x1, z1 } (m),
             nav: { nx, nz, x0, z0, cellule }, voile: { nx, nz, x0, z0, cellule },
             minicarte: { taille, x0, z0, cote }, combats: { taille, x0, z0, cote },
             echelle: max(1, round(effectifs / 20000)) (multiplie lots, coûts, stocks et revenus),
             depart: [3] (effectifs de départ), popMax: [3], parts: [3] (% des effectifs, selon manifestants) }
   Grilles : cote et cellule sont le côté d'une case en mètres ; la case (ix, iz) est à l'indice ix + iz × nx (ou
   × taille), et × 3 + camp pour la minicarte.

   ETAT = {
     type: 'etat', it, temps (s de partie), vitesse,
     n,                    nombre d'emplacements à lire dans le tampon (le plus haut emplacement servi + 1)
     unites: ArrayBuffer,  Float32 [x (m), z (m), cap, code] × n ; cap en radians, la face regarde (sin cap, cos cap)
                           en (x, z) : 0 regarde +z, π/2 regarde +x, comme la rotation Ry du renderer de FERRO ;
                           code : PDR.regles.coder ; faction 3 = emplacement libre. Tampon transféré : la page le
                           rend par { type: 'rendre' } quand elle n'en a plus besoin.
                           États (regles.ETATS) ajoutés en 0.3 : A_TERRE 12, LANCE 13, SUFFOQUE 14, ASSAUT 15 ; une
                           unité HORS_JEU reste couchée 6 s (1,5 s au-delà de 4 096 gisants, et presque rien dans un
                           feu : personne n'est montré en feu), puis son emplacement se libère.
     eco: [ { moyens, materiaux, pop, popMax, score, revenu: { moyens, materiaux } (par minute), oisifs,
              elimine, qgOccupe (0..1 : part de l'occupation), vivantes,
              depart (effectifs de départ), force (vivantes / depart : ce qui reste du camp, peut dépasser 1),
              deroute (-1 : le camp a une base ; sinon secondes avant son élimination, voir VICTOIRE) } × 3 ],
     alliance: [a, b] ou null, proposition: { de, a, reste (s) } ou null, colere (s restantes, Bastion contre Préfecture),
     lieux: [ { proprietaire (-1 : neutre), progression (0..1), conteste (booléen), preneur (camp qui prend, -1 : aucun) } ],
     victoire: { mode, points (cible ; 0 : pas de cible), duree (minutes ; 0 : pas de limite de temps),
                 reste (s avant la limite de temps ; -1 : pas de limite), plafond (s de partie : la limite de
                 sécurité des modes sans limite de temps ; 0 sinon), demo (booléen) },
     structures: null ou [ STRUCTURE ] (envoyé à chaque changement de versionStructures), versionStructures,
     cassables: null ou Uint8Array (0 intact, 1 cassé, 2 en feu, 3 calciné ; envoyé à chaque changement ; pour une
                page qui ne connaît que 0 et 1, tout ce qui n'est pas 0 est cassé), gisements: null ou Int32Array
                (stock restant ; toutes les 20 itérations), voile: null ou Uint8Array (visibilité 0..255 du joueur et
                de son allié, nx × nz de CARTE.voile ; toutes les 4 itérations ; null en démo ; les ennemis cachés
                restent dans le tampon d'unités : la page les masque),
     feux: null ou Float32Array (k × FEU_TAILLE) : tous les foyers du moment, [id, x (m), z (m), rayon (m),
           intensite (0..1 : monte à l'allumage, baisse sur les trois dernières secondes), reste (s), sorte
           (SORTES_FEU : 0 sol — un cocktail —, 1 objet cassé, 2 barricade, 3 avant-poste), cible (indice du
           cassable, id de la structure, -1 pour le sol)] ; envoyé à chaque changement (allumage, extinction) et toutes
           les 5 itérations tant qu'il y a des foyers ; un tableau vide quand le dernier s'éteint ; 128 foyers au plus,
     nuages: null ou Float32Array (k × NUAGE_TAILLE) : les nuages de gaz, [id, x (m), z (m), rayon (m, il grossit
             pendant 2 s), densite (0..1 : baisse sur les quatre dernières secondes), reste (s)] ; mêmes envois que
             feux ; 64 nuages au plus,
     immeubles: null ou Float32Array (k × IMMEUBLE_TAILLE) : les immeubles touchés par le feu, [id (ville.sites.immeubles),
                etat (ETATS_IMMEUBLE : 1 en feu, 2 éteint, 3 calciné), intensite (0..1), avancee (0..1 : la part déjà
                brûlée)] ; mêmes envois que feux ; 1 024 au plus,
     minicarte: null ou Uint16Array (taille × taille × 3 : unités par case et par camp ; toutes les 10 itérations),
     combats: null ou Uint16Array (taille × taille : coups portés par case depuis l'envoi précédent ; toutes les
              2 itérations),
     evenements: Float32Array (k × EV_TAILLE) depuis l'état précédent ; le travailleur y ajoute un REFUS (raison
                 INTERDIT, x = z = 0) pour toute commande d'un autre camp que le joueur, et pour toutes en démo,
     vainqueur: VAINQUEUR, raison: RAISONS_FIN ('' tant que la partie dure),
     mesure: { msIteration, msIA, msNav, vivantes, champs, feux, nuages, immeubles, aTerre, gisants }
   }
   STRUCTURE = { id, sorte: 'qg' | 'avant-poste' | 'barricade', faction, x, z, x2, z2 (bout de barricade, sinon = x, z),
                 pv, pvMax, chantier (booléen), feu (booléen : elle brûle — un foyer de etat.feux la désigne),
                 occupation (0..1 : QG, et avant-poste depuis la 0.3), file: [ { type, lot, reste (s), total (s) } ],
                 ralliement: [x, z] ou null }
   BILAN = [ { produites, horsJeu, infliges, barricadesPosees, barricadesLevees, casses, lieuxPris, recolte,
               molotovs, grenades (lacrymogènes), pierres, charges, aTerre (mises à terre infligées), feux (foyers
               allumés : cocktails, casse, propagation), eteints (foyers éteints à l'eau), immeublesBrules (immeubles
               calcinés que le camp avait allumés), immeublesSauves (immeubles éteints par le camp),
               sources: [8] (les points de « infliges » par origine, dans l'ordre de SOURCES_COUPS) } × 3 ]
   FIN = { type: 'fin', vainqueur: VAINQUEUR, raison: RAISONS_FIN, temps (s de partie), victoire (celle de l'état),
           eco (celle du dernier état), bilan: BILAN, enregistrement (null si options.enregistrer est faux) }

   VICTOIRE (CONCEPTION.md §1.7). Un camp est éliminé quand il est resté 30 s sans base (son QG occupé et aucun
   avant-poste achevé et libre), ou aussitôt s'il est sans base avec moins de 2 % de ses effectifs de départ ; cela vaut
   dans tous les modes. La partie finit :
     'dernier' : quand il ne reste qu'un camp ou qu'une alliance (raison 'dernier') ; ni points ni temps ;
     'temps'   : à la fin de la durée, le meilleur score l'emporte (raison 'temps') ; ou au dernier debout ;
     'points'  : au premier qui atteint la cible, alliés additionnés (raison 'points') ; ou au dernier debout ;
     'mixte'   : cible de points, limite de temps ou dernier debout, le premier des trois.
   Sans limite de temps ('dernier', 'points', démo), une limite de sécurité lointaine arrête la partie (raison
   'plafond') : 90 minutes, 60 en démo ; l'emporte alors le camp ou l'alliance qui garde le plus d'unités ('points' :
   le meilleur score). Égalité : nul (raison 'nul'). Les scores comptent dans tous les modes (un point par seconde et
   par lieu tenu) : ils s'affichent même quand ils ne décident de rien.
*/
(function (PDR) {
  'use strict';

  const CAPACITE = 262144, FLOATS_PAR_UNITE = 4, LARGEUR_TEXTURE = 1024, EV_TAILLE = 6, FEU_TAILLE = 8, NUAGE_TAILLE = 6,
        IMMEUBLE_TAILLE = 4;
  const ETATS_IMMEUBLE = Object.freeze({ INTACT: 0, EN_FEU: 1, ETEINT: 2, CALCINE: 3 });

  /** Types de commande. Champs communs : t (type), j (camp qui ordonne). ids : Int32Array d'emplacements d'unités
   *  du camp j. Positions en mètres. */
  const CMD = Object.freeze({
    DEPLACER: 1,      // { ids, x, z, mode }  mode 0 : déplacement ; 1 : attaque-mouvement (frappe en chemin)
    ATTAQUER: 2,      // { ids, cible }       cible : emplacement d'une unité hostile
    ARRETER: 3,       // { ids }
    TENIR: 4,         // { ids }              posture : ne bouge plus, frappe à portée, ne se replie pas
    REPLIER: 5,       // { ids }              vers la zone de soutien la plus proche
    REGROUPER: 6,     // { ids, x, z }        rassemble en formation serrée au point donné
    RECOLTER: 7,      // { ids, gisement }    indice dans ville.sites.gisements ; Équipes seulement
    CASSER: 8,        // { ids, sorte: 'cassable' | 'structure', cible }  Convergence seulement
    LEVER: 9,         // { ids, cible }       id de structure (barricade, ou avant-poste pour la Préfecture)
    BARRICADER: 10,   // { ids, x, z, x2, z2 } segment de 4 à 20 m ; Convergence seulement
    CONSTRUIRE: 11,   // { ids, x, z }        avant-poste ; Équipes seulement
    PRODUIRE: 12,     // { producteur, type, n }  n lots ; producteur : id de structure (QG ou avant-poste)
    ANNULER: 13,      // { producteur, rang } retire un ordre de la file, rembourse
    RALLIEMENT: 14,   // { producteur, x, z }
    DIPLOMATIE: 15,   // { action: 'proposer' | 'rompre' | 'accepter' | 'refuser', avec }
    CAPACITE: 16,     // { ids, capacite: 'salve' | 'jet' | 'lacrymo' | 'molotov', x, z }  l'unité s'approche à portée,
                      // puis agit sur le point ; 'jet' sur un feu l'éteint
    MOLOTOV: 17,      // { ids, x, z }        (0.3) les Furets de la sélection s'approchent à 22 m et lancent chacun un
                      // cocktail sur le point (sol, barricade, avant-poste, objet) : 4 Matériaux pièce ; Convergence
                      // seulement. Raccourci de { t: CAPACITE, capacite: 'molotov' }.
    ETEINDRE: 18,     // { ids, x, z }        (0.3) les unités de la sélection qui ont une lance (Pompiers, Camion de
                      // pompiers) vont à portée de lance du point et arrosent foyers et immeubles en feu ; Préfecture
                      // seulement.
  });
  const NOMS_CMD = Object.freeze(Object.fromEntries(Object.entries(CMD).map(([k, v]) => [v, k])));

  /** Évènements : EV_TAILLE nombres par évènement, [type, x, z, faction, a, b] dans un Float32Array. Une page qui
   *  ne connaît pas un type l'ignore. */
  const EV = Object.freeze({
    HORS_JEU: 1,            // x, z, faction de l'unité, a : type, b : camp qui l'a mise hors jeu (-1 : aucun)
    CASSE: 2,               // x, z, faction qui casse, a : indice du cassable, b : sorte (SORTES_CASSABLES ; -1 : sorte inconnue)
    BARRICADE_POSEE: 3,     // x, z, faction, a : id de structure
    BARRICADE_FINIE: 4,     // x, z, faction, a : id
    BARRICADE_LEVEE: 5,     // x, z, faction qui lève (ou dont le feu l'a détruite), a : id, b : faction de la barricade
    STRUCTURE_FINIE: 6,     // x, z, faction, a : id
    STRUCTURE_DETRUITE: 7,  // x, z, faction qui casse, lève ou brûle, a : id, b : faction de la structure
    LIEU_PRIS: 8,           // x, z, faction, a : indice du lieu
    LIEU_NEUTRALISE: 9,     // x, z, ancienne faction, a : indice du lieu
    SALVE_ANNONCE: 10,      // x, z, faction, a : rayon (m), b : délai (s)
    SALVE: 11,              // x, z, faction, a : rayon (m), b : unités touchées
    JET: 12,                // x, z, faction, a : direction au sens du cap (rad), b : portée (m) ; toutes les 10 itérations d'un jet
    PRODUCTION: 13,         // x, z, faction, a : type, b : nombre d'unités sorties
    GISEMENT_EPUISE: 14,    // x, z, -1, a : indice du gisement
    ALLIANCE_FORMEE: 15,    // 0, 0, -1, a, b : les deux camps
    ALLIANCE_ROMPUE: 16,    // 0, 0, faction qui rompt, a, b
    ALLIANCE_PROPOSEE: 17,  // 0, 0, faction qui propose, a : camp sollicité
    COLERE: 18,             // x, z, BASTION, a : secondes de colère contre la Préfecture
    ATTAQUE_SUBIE: 19,      // x, z, faction attaquée, a : faction qui attaque ; au plus une par camp et par zone toutes les 10 s
    ELIMINATION: 20,        // 0, 0, faction éliminée
    VICTOIRE: 21,           // 0, 0, -1, a : VAINQUEUR, b : indice de la raison dans RAISONS_FIN
    QG_OCCUPE: 22,          // x, z, faction du QG, a : occupant
    QG_REPRIS: 23,          // x, z, faction du QG
    REFUS: 24,              // 0, 0, camp, a : RAISONS, b : type de commande
    SOIN: 25,               // x, z, faction ; toutes les 20 itérations d'une Fanfare qui soigne
    // ---- 0.3 : le feu, les projectiles, la violence. Les projectiles partent de (x, z), à hauteur d'épaule, et
    // tombent en (x + a, z + b) après PDR.regles.dureeVol(sorte, distance) secondes : la page dessine la cloche.
    MOLOTOV: 26,            // x, z du lanceur, faction, a : dx (m), b : dz (m) ; vol : dureeVol('molotov', d) ; à
                            // l'arrivée : souffle, puis FEU_ALLUME
    FEU_ALLUME: 27,         // x, z du foyer, faction qui l'a allumé (-1 : personne), a : id du foyer (etat.feux),
                            // b : sorte (SORTES_FEU)
    FEU_ETEINT: 28,         // x, z, faction qui l'éteint (-1 : il s'est consumé), a : id, b : 1 éteint à l'eau, 0 consumé
    LACRYMO: 29,            // x, z du lanceur, faction, a : dx, b : dz ; vol : dureeVol('lacrymo', d) ; à l'arrivée : GAZ
    GAZ: 30,                // x, z du nuage, faction, a : id du nuage (etat.nuages), b : rayon final (m)
    A_TERRE: 31,            // x, z, faction de l'unité jetée au sol, a : type, b : cause (CAUSES_A_TERRE) ; au plus 24
                            // par itération (les autres chutes ne donnent pas d'évènement : l'état des unités les montre)
    CHARGE: 32,             // x, z, faction, a : direction au sens du cap (rad), b : type ; au plus une par case de 8 m
                            // et par seconde (une ligne qui charge en donne quelques-unes)
    PIERRE: 33,             // x, z du lanceur, faction, a : dx, b : dz ; vol : 0,6 s ; échantillon : au plus 12 par
                            // itération, les autres jets ne donnent pas d'évènement
    DEROUTE: 34,            // x, z du QG, faction sans base, a : secondes avant son élimination
    BASE_REPRISE: 35,       // x, z du QG, faction qui retrouve une base : la déroute s'arrête
    POSTE_OCCUPE: 36,       // x, z, faction de l'avant-poste, a : id, b : occupant
    POSTE_REPRIS: 37,       // x, z, faction de l'avant-poste, a : id
    IMMEUBLE_FEU: 38,       // x, z de l'immeuble, faction qui l'a allumé (-1 : un feu sans camp), a : id de l'immeuble
                            // (ville.sites.immeubles, etat.immeubles), b : 0
    IMMEUBLE_ETEINT: 39,    // x, z, faction qui l'éteint (-1 : il a brûlé jusqu'au bout), a : id, b : 1 éteint à l'eau,
                            // 0 calciné (comme FEU_ETEINT)
  });
  const RAISONS = Object.freeze({ RESSOURCES: 1, PLAFOND: 2, INTERDIT: 3, EMPLACEMENT: 4, INJOIGNABLE: 5, FILE_PLEINE: 6, DELAI: 7 });
  /** Sortes de cassables connues de la page : les six de la 0.2, puis, depuis la 0.3, les quatre de la ville réelle
   *  (deux-roues, conteneur, terrasse, kiosque), dans l'ordre de ville-reelle.js. Les points de structure et le
   *  rendement viennent de chaque objet de ville.sites.cassables ; le feu aussi, ou de sa sorte (regles.feuObjet). Une
   *  sorte absente d'ici brûle selon ses points de structure et donne b = -1 dans CASSE. */
  const SORTES_CASSABLES = Object.freeze(['voiture', 'abribus', 'vitrine', 'poubelle', 'banc', 'barriere',
    'deux-roues', 'conteneur', 'terrasse', 'kiosque']);
  /** Sorte d'un foyer (etat.feux, FEU_ALLUME). */
  const SORTES_FEU = Object.freeze({ SOL: 0, OBJET: 1, BARRICADE: 2, POSTE: 3 });
  /** D'où viennent les coups d'un camp (BILAN.sources). */
  const SOURCES_COUPS = Object.freeze(['contact', 'salve', 'jet', 'pierres', 'charge', 'souffle', 'feu', 'gaz']);
  /** Ce qui a jeté une unité au sol (A_TERRE). */
  const CAUSES_A_TERRE = Object.freeze({ SALVE: 1, CHARGE: 2, MOLOTOV: 3, MATRAQUE: 4, JET: 5 });
  /** VAINQUEUR : -1 en cours ; 0, 1, 2 : un camp ; 3 : une alliance (les deux camps de etat.alliance) ; 4 : nul. */
  const VAINQUEUR = Object.freeze({ EN_COURS: -1, ALLIANCE: 3, NUL: 4 });
  /** Pourquoi la partie a fini (etat.raison, fin.raison ; l'indice est le b de l'évènement VICTOIRE). */
  const RAISONS_FIN = Object.freeze(['', 'dernier', 'points', 'temps', 'plafond', 'nul']);

  /** Les villes d'une partie : le plan réel de Marseille (villes/marseille.js, ville-reelle.js) ou le damier. */
  const VILLES = Object.freeze(['marseille', 'damier']);
  /** La ville d'une partie, la même dans la page et le travailleur ; le damier si le plan réel n'est pas chargé. */
  function villeDe(options, ilots) {
    const nom = options && options.ville, V = PDR.villeReelle;
    if (nom && nom !== 'damier' && VILLES.includes(nom) && V && typeof V.creerVille === 'function' && PDR.plans && PDR.plans[nom]) {
      const ville = V.creerVille(nom, { ilots });
      ville.nom = nom;
      return ville;
    }
    const graine = options && Number.isFinite(options.graine) ? Math.trunc(options.graine) >>> 0 : 1;
    const ville = PDR.ville.creerVille(graine, { ilots });
    ville.nom = 'damier';
    return ville;
  }

  const tamponUnites = n => new ArrayBuffer(Math.max(1, n) * FLOATS_PAR_UNITE * 4);
  /** Lit l'unité i d'un tampon d'état (pour les tests et l'outillage). */
  function lireUnite(f32, i) {
    const o = i * FLOATS_PAR_UNITE;
    return { x: f32[o], z: f32[o + 1], cap: f32[o + 2], code: f32[o + 3] };
  }
  const lireEvenement = (f32, k) => {
    const o = k * EV_TAILLE;
    return { type: f32[o], x: f32[o + 1], z: f32[o + 2], faction: f32[o + 3], a: f32[o + 4], b: f32[o + 5] };
  };
  /** Lit le foyer k de etat.feux. */
  const lireFeu = (f32, k) => {
    const o = k * FEU_TAILLE;
    return { id: f32[o], x: f32[o + 1], z: f32[o + 2], rayon: f32[o + 3], intensite: f32[o + 4], reste: f32[o + 5], sorte: f32[o + 6], cible: f32[o + 7] };
  };
  /** Lit le nuage k de etat.nuages. */
  const lireNuage = (f32, k) => {
    const o = k * NUAGE_TAILLE;
    return { id: f32[o], x: f32[o + 1], z: f32[o + 2], rayon: f32[o + 3], densite: f32[o + 4], reste: f32[o + 5] };
  };
  const lireImmeuble = (f32, k) => {
    const o = k * IMMEUBLE_TAILLE;
    return { id: f32[o], etat: f32[o + 1], intensite: f32[o + 2], avancee: f32[o + 3] };
  };

  /** Construit une commande. Les ids sont recopiés en Int32Array. */
  function commande(t, j, champs = {}) {
    const c = { t, j, ...champs };
    if (champs.ids) c.ids = Int32Array.from(champs.ids);
    return c;
  }
  /** Contrôle de forme d'une commande reçue ; renvoie '' si elle est bien formée, sinon la raison. */
  function forme(c) {
    if (!c || typeof c !== 'object') return 'commande absente';
    if (!NOMS_CMD[c.t]) return 'type inconnu';
    if (!(c.j === 0 || c.j === 1 || c.j === 2)) return 'camp invalide';
    const fini = v => typeof v === 'number' && Number.isFinite(v);
    const avecIds = [CMD.DEPLACER, CMD.ATTAQUER, CMD.ARRETER, CMD.TENIR, CMD.REPLIER, CMD.REGROUPER, CMD.RECOLTER,
      CMD.CASSER, CMD.LEVER, CMD.BARRICADER, CMD.CONSTRUIRE, CMD.CAPACITE, CMD.MOLOTOV, CMD.ETEINDRE];
    if (avecIds.includes(c.t) && !(c.ids instanceof Int32Array)) return 'ids manquants';
    const positions = { [CMD.DEPLACER]: ['x', 'z'], [CMD.REGROUPER]: ['x', 'z'], [CMD.BARRICADER]: ['x', 'z', 'x2', 'z2'],
      [CMD.CONSTRUIRE]: ['x', 'z'], [CMD.RALLIEMENT]: ['x', 'z'], [CMD.CAPACITE]: ['x', 'z'], [CMD.MOLOTOV]: ['x', 'z'],
      [CMD.ETEINDRE]: ['x', 'z'] }[c.t] || [];
    for (const k of positions) if (!fini(c[k])) return 'position ' + k + ' invalide';
    return '';
  }

  PDR.protocole = Object.freeze({
    VERSION: 2, CAPACITE, FLOATS_PAR_UNITE, LARGEUR_TEXTURE, EV_TAILLE, FEU_TAILLE, NUAGE_TAILLE, IMMEUBLE_TAILLE,
    ETATS_IMMEUBLE,
    CMD, NOMS_CMD, EV, RAISONS, SORTES_CASSABLES, SORTES_FEU, CAUSES_A_TERRE, SOURCES_COUPS, VAINQUEUR, RAISONS_FIN,
    VILLES, villeDe, tamponUnites, lireUnite, lireEvenement, lireFeu, lireNuage, lireImmeuble, commande, forme,
  });
})(globalThis.PDR = globalThis.PDR || {});
