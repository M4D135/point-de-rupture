/* Point de rupture — règles communes : factions, types d'unités, hostilité, structures, codage des unités.
   Contrat partagé par la page, le travailleur de simulation et les tests (CONCEPTION.md §3). Aucune dépendance,
   ni window ni document : le fichier tourne aussi dans un Web Worker et dans Node.
   Les chiffres sont provisoires et se règlent ensemble ; la forme des objets et les fonctions sont le contrat.
   Règles de David du 12 novembre 2026 : la Convergence casse, barricade, se bat et se replie ; le Bastion ne casse
   rien, ne barricade pas, lève les barricades, frappe la Convergence et la Préfecture seulement si elle l'a frappé
   la première ; la Préfecture lève tout et frappe tout ; deux camps sur trois peuvent s'allier.
   Version 0.3, même jour : cocktails Molotov, feu quand on casse, « plus de violence » (mises à terre, charges, jets
   de pierres, gaz lacrymogène), victoire au choix (dernier debout, temps, points, ou les trois), « par défaut moins
   de manifestants » (CONCEPTION.md §1). Toujours ni arme à feu, ni lame, ni sang ; personne n'est montré en feu. */
(function (PDR) {
  'use strict';

  const CONVERGENCE = 0, BASTION = 1, PREFECTURE = 2, LIBRE = 3;

  const FACTIONS = [
    { id: 0, cle: 'convergence', nom: 'La Convergence', court: 'Convergence', couleur: [0.90, 0.27, 0.19], css: '#e6452f',
      motif: 'rond', part: 0.40, devise: 'Le nombre et la rue.', avantPoste: 'Relais',
      regles: ['Casse le mobilier urbain, les voitures, les vitrines et les avant-postes ennemis : ce qu’elle casse prend feu',
        'Bâtit des barricades', 'Lance des pierres et des cocktails Molotov', 'Frappe le Bastion et la Préfecture',
        'Nombreuse, rapide, fragile'] },
    { id: 1, cle: 'bastion', nom: 'Le Bastion', court: 'Bastion', couleur: [0.93, 0.64, 0.15], css: '#eda326',
      motif: 'carre', part: 0.32, devise: 'Tenir et nettoyer.', avantPoste: 'Cantonnement',
      regles: ['Ne casse rien et ne bâtit aucune barricade', 'Lève les barricades',
        'Frappe la Convergence ; la Préfecture seulement si elle a frappé la première',
        'Lignes épaisses, boucliers, charges à la poutre'] },
    { id: 2, cle: 'prefecture', nom: 'La Préfecture', court: 'Préfecture', couleur: [0.22, 0.45, 0.90], css: '#4d86f0',
      motif: 'chevron', part: 0.28, devise: 'L’ordre, partout.', avantPoste: 'Poste mobile',
      regles: ['Lève tout : barricades et avant-postes', 'Frappe tout le monde',
        'Peu nombreuse et chère', 'Charges, salves, gaz lacrymogène ; le canon à eau éteint les feux'] },
  ];

  // Postures et états d'une unité. L'état est codé sur 4 bits dans le tampon de rendu : les seize valeurs servent.
  // CHARGE (4) : l'Équipe porte sa récolte. REPLI (8) : elle se replie, ou fuit un feu. HORS_JEU (10) : couchée au sol
  // quelques secondes, puis l'emplacement se libère. Depuis la 0.3 : A_TERRE (12) : jetée au sol, elle ne peut rien
  // faire pendant trois secondes, puis se relève ; LANCE (13) : le geste du lancer (pierre, cocktail, grenade) ;
  // SUFFOQUE (14) : dans un nuage de gaz, elle tousse, ne frappe plus et en sort au pas ; ASSAUT (15) : l'élan
  // d'une charge (matraque de la Patrouille, poutre des Béliers).
  const ETATS = { OISIF: 0, MARCHE: 1, ATTAQUE: 2, RECOLTE: 3, CHARGE: 4, CONSTRUIT: 5, LEVE: 6, CASSE: 7, REPLI: 8, TIENT: 9,
    HORS_JEU: 10, CAPACITE: 11, A_TERRE: 12, LANCE: 13, SUFFOQUE: 14, ASSAUT: 15 };
  // Drapeaux codés sur 8 bits : porte une charge, touchée depuis moins d'une demi-seconde, colère du Bastion,
  // bouclier levé (protégée de face), véhicule. Les bits 32, 64 et 128 sont libres.
  const DRAPEAUX = { PORTE: 1, TOUCHE: 2, COLERE: 4, BOUCLIER: 8, VEHICULE: 16 };

  // Capacités d'un type. Depuis la 0.3 :
  //   pierres { portee, porteeMin (m), pression (points par jet), recharge (s) } : jet de pierres et de bouteilles
  //            sur la cible, de loin, avant le contact ;
  //   molotov { portee, porteeMin (m), rayon (m, souffle), pression (points du souffle), max (unités soufflées),
  //            aTerre (unités jetées au sol), recharge (s), cout (Matériaux par cocktail) } ; le feu : CONSTANTES.FEU ;
  //   charge  { portee, porteeMin (m), elan (× la vitesse), duree (s d'élan au plus), pression (points à l'impact),
  //            recul (m), recharge (s), perce (jette aussi au sol une unité protégée) } : l'unité fonce sur sa cible, la
  //            bouscule et la jette au sol ;
  //   lacrymo { portee, porteeMin (m), recharge (s) } : grenade lancée en cloche ; le nuage : CONSTANTES.GAZ.
  const sans = { recolter: false, construire: false, barricader: false, casser: 0, lever: 0, leverTout: false,
    interpeller: false, salve: null, jet: null, soigner: 0, pierres: null, molotov: null, charge: null, lacrymo: null, lance: null };
  const PIERRES = Object.freeze({ portee: 14, porteeMin: 3.5, pression: 3, recharge: 5 });
  /** Un type d'unité. Vitesses en m/s, distances en m, pression en points de cohésion par seconde au contact,
   *  coût et durée par lot ; « lot » unités sortent ensemble d'un ordre de production. */
  const type = (id, cle, faction, nom, pluriel, role, chiffres, capacites, raccourci, description) => Object.freeze({
    id, cle, faction, nom, pluriel, role, base: role === 'ligne', protege: false, vehicule: false, pop: 1, rayon: 0.3,
    vitesseHorsChaussee: null, ...chiffres, capacites: Object.freeze({ ...sans, ...capacites }), raccourci, description,
  });

  const TYPES = [
    type(0, 'equipe-convergence', 0, 'Équipe', 'Équipes', 'ouvrier',
      { coh: 40, pression: 1.0, portee: 1.2, vitesse: 3.6, vision: 14, cout: { moyens: 50, materiaux: 0 }, duree: 10, lot: 10 },
      { recolter: true, construire: true, barricader: true, casser: 1, lever: 1 }, 'A',
      'Récolte, bâtit les relais et les barricades, casse.'),
    type(1, 'cortege', 0, 'Cortège', 'Cortèges', 'ligne',
      { coh: 60, pression: 3.0, portee: 1.2, vitesse: 3.4, vision: 16, cout: { moyens: 80, materiaux: 0 }, duree: 12, lot: 20 },
      { barricader: true, casser: 1, lever: 1, pierres: PIERRES }, 'W',
      'Le nombre. Tient la rue, casse, barricade et lance des pierres.'),
    type(2, 'furets', 0, 'Furets', 'Furets', 'choc',
      { coh: 50, pression: 5.5, portee: 1.2, vitesse: 4.4, vision: 20, cout: { moyens: 90, materiaux: 20 }, duree: 14, lot: 10 },
      { barricader: true, casser: 2, lever: 1,
        molotov: Object.freeze({ portee: 22, porteeMin: 6, rayon: 3, pression: 12, max: 8, aTerre: 3, recharge: 25, cout: 4 }) }, 'E',
      'Rapides et mordants. Cassent deux fois plus vite et lancent des cocktails Molotov.'),
    type(3, 'fanfare', 0, 'Fanfare', 'Fanfares', 'soutien',
      { coh: 45, pression: 0.5, portee: 1.2, vitesse: 3.2, vision: 18, cout: { moyens: 100, materiaux: 30 }, duree: 16, lot: 5 },
      { soigner: 3 }, 'R',
      'Rend 3 points de cohésion par seconde aux siens à moins de 8 m.'),
    type(4, 'equipe-bastion', 1, 'Équipe', 'Équipes', 'ouvrier',
      { coh: 50, pression: 1.5, portee: 1.2, vitesse: 3.4, vision: 14, cout: { moyens: 50, materiaux: 0 }, duree: 10, lot: 10 },
      { recolter: true, construire: true, lever: 1 }, 'A',
      'Récolte, bâtit les cantonnements, lève les barricades.'),
    type(5, 'piquets', 1, 'Piquets', 'Piquets', 'ligne',
      { coh: 100, pression: 4.0, portee: 1.2, vitesse: 3.2, vision: 15, cout: { moyens: 100, materiaux: 0 }, duree: 14, lot: 10 },
      { lever: 1, pierres: PIERRES }, 'W',
      'La ligne. Encaisse, repousse et lance des pierres.'),
    type(6, 'pavois', 1, 'Pavois', 'Pavois', 'protege',
      { coh: 140, pression: 2.5, portee: 1.2, vitesse: 2.6, vision: 14, protege: true, cout: { moyens: 120, materiaux: 40 }, duree: 16, lot: 8 },
      { lever: 1 }, 'E',
      'Derrière leurs panneaux, ne reçoivent que la moitié de face.'),
    type(7, 'beliers', 1, 'Béliers', 'Béliers', 'outil',
      { coh: 90, pression: 5.0, portee: 1.2, vitesse: 3.0, vision: 14, cout: { moyens: 110, materiaux: 60 }, duree: 16, lot: 5 },
      { lever: 4, charge: Object.freeze({ portee: 12, porteeMin: 4, elan: 1.8, duree: 2, pression: 10, recul: 2, recharge: 14, perce: true }) }, 'R',
      'Chargent à la poutre : bousculent et jettent au sol. Lèvent les barricades quatre fois plus vite.'),
    type(8, 'equipe-prefecture', 2, 'Équipe', 'Équipes', 'ouvrier',
      { coh: 50, pression: 1.0, portee: 1.2, vitesse: 3.6, vision: 14, cout: { moyens: 50, materiaux: 0 }, duree: 10, lot: 6 },
      { recolter: true, construire: true, lever: 1, leverTout: true }, 'A',
      'Récolte, bâtit les postes mobiles, lève.'),
    type(9, 'patrouille', 2, 'Patrouille', 'Patrouilles', 'ligne',
      { coh: 90, pression: 4.0, portee: 1.2, vitesse: 3.4, vision: 18, cout: { moyens: 110, materiaux: 0 }, duree: 14, lot: 6 },
      { lever: 1, leverTout: true, interpeller: true,
        charge: Object.freeze({ portee: 12, porteeMin: 4, elan: 1.7, duree: 2, pression: 8, recul: 1.5, recharge: 16 }) }, 'W',
      'Charge à la matraque ; interpelle : pression doublée sur une unité sous 30 % de cohésion, jetée au sol.'),
    type(10, 'compagnie', 2, 'Compagnie', 'Compagnies', 'protege',
      { coh: 130, pression: 3.0, portee: 1.2, vitesse: 2.6, vision: 16, protege: true, cout: { moyens: 140, materiaux: 40 }, duree: 18, lot: 6 },
      { lever: 1, leverTout: true, salve: Object.freeze({ portee: 14, rayon: 6, pression: 10, recharge: 30, annonce: 1.5, max: 10, aTerre: 4 }),
        lacrymo: Object.freeze({ portee: 26, porteeMin: 8, recharge: 35 }) }, 'E',
      'Boucliers ; Salve : zone de 6 m jusqu’à 14 m, annoncée 1,5 s avant, dix unités au plus, quatre jetées au sol ; grenades lacrymogènes.'),
    type(11, 'motards', 2, 'Motards', 'Motards', 'rapide',
      { coh: 70, pression: 2.5, portee: 1.2, vitesse: 8.0, vitesseHorsChaussee: 5.0, vision: 28, rayon: 0.6,
        cout: { moyens: 70, materiaux: 0 }, duree: 10, lot: 4 },
      { lever: 1, leverTout: true }, 'R',
      'Voient loin et filent sur la chaussée.'),
    type(12, 'canon-a-eau', 2, 'Canon à eau', 'Canons à eau', 'vehicule',
      { coh: 600, pression: 0, portee: 1.2, vitesse: 4.0, vision: 24, rayon: 1.6, vehicule: true, pop: 8,
        cout: { moyens: 300, materiaux: 120 }, duree: 30, lot: 1 },
      { lever: 6, leverTout: true, jet: Object.freeze({ portee: 18, angle: 40, pression: 12, recul: 2.0, aTerre: 9, max: 8 }) }, 'T',
      'Jet : cône de 18 m qui repousse, jette au sol de près et éteint les feux ; lève six fois plus vite.'),
    type(13, 'pompiers', 2, 'Pompiers', 'Pompiers', 'secours',
      { coh: 40, pression: 0.3, portee: 1.2, vitesse: 3.6, vision: 16, cout: { moyens: 60, materiaux: 0 }, duree: 12, lot: 6 },
      { lance: Object.freeze({ portee: 8, debit: 1 }) }, 'U',
      'Six pompiers, lance à 8 m : éteignent les feux des objets et des immeubles.'),
    type(14, 'camion-pompiers', 2, 'Camion de pompiers', 'Camions de pompiers', 'secours',
      { coh: 400, pression: 0.3, portee: 1.2, vitesse: 5.0, vision: 20, rayon: 1.6, vehicule: true, pop: 6,
        cout: { moyens: 150, materiaux: 20 }, duree: 20, lot: 1 },
      { lance: Object.freeze({ portee: 16, debit: 4.5 }) }, 'I',
      'Un camion, lance à 16 m, quatre à cinq fois le débit d’un pompier ; plus rapide sur la chaussée.'),
  ];

  const TYPES_PAR_FACTION = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14]];
  const OUVRIER = [0, 4, 8];     // l'Équipe de chaque camp
  const BASE = [1, 5, 9];        // l'unité de base, produite aussi aux avant-postes

  const CONSTANTES = Object.freeze({
    TICK_MS: 50, IT_PAR_S: 20,
    CAPACITE: 262144,                     // emplacements d'unités
    CELLULE_NAV: 4, CELLULE_DENSITE: 2, CELLULE_VOILE: 8, MINICARTE: 128, GRILLE_COMBATS: 64,   // m, m, m, cases, cases
    COLERE_S: 45, REPLI_SEUIL: 0.25, SOUTIEN_PAR_S: 5, SOIN_RAYON: 8, FLANC: 1.5, PROTEGE: 0.5, ARC_FRONTAL_DEG: 120,
    INTERPELLER_SEUIL: 0.30, REPLI_VITESSE: 1.3,
    CHARGE_RECOLTE: 10, RECOLTEURS_MAX: 40,
    AVANT_POSTE: Object.freeze({ moyens: 150, materiaux: 100, pv: 1500, travail: 200 }),   // travail : secondes-Équipe
    BARRICADE: Object.freeze({ materiauxParMetre: 6, pvParMetre: 40, longueurMin: 4, longueurMax: 20, rendement: 0.5,
      travailParMetre: 6 }),            // secondes-unité par mètre
    LEVER_PAR_S: 8,                      // points de structure levés par seconde et par unité au facteur 1
    CASSER_PAR_S: 6,                     // points de structure cassés par seconde et par unité au facteur 1
    DOTATION_PREFECTURE: 120, REVENU_LIEU: 40,     // Moyens par minute
    POINTS_VICTOIRE: 3000, DUREE_MAX_S: 2400, PRISE_LIEU_S: 15,     // les chiffres du mode « mixte » : 3 000 points, 40 minutes
    OCCUPATION_QG_S: 60, REPRISE_QG_S: 20, ELIMINATION_PART: 0.02,
    // Un avant-poste s'occupe comme un QG, plus vite ; un camp resté sans base (QG occupé, aucun avant-poste libre)
    // pendant DEROUTE_S est éliminé.
    OCCUPATION_POSTE_S: 30, REPRISE_POSTE_S: 10, DEROUTE_S: 30,
    PLAFOND: 1.25, PART_OUVRIERS: 0.04, FILE_MAX: 5,
    EFFECTIFS: Object.freeze([20000, 50000, 100000, 150000, 200000]), EFFECTIFS_DEFAUT: 100000,
    ALLIANCE_DELAI_S: 60, COALITION_SEUIL: 0.45,
    RESSOURCES_DEPART: Object.freeze([{ moyens: 400, materiaux: 150 }, { moyens: 400, materiaux: 100 }, { moyens: 600, materiaux: 100 }]),
    // ---- Version 0.3. ----
    // Le rythme : multiplie toutes les pressions (contact, salve, jet, pierres, charge, souffle du cocktail). Sous 1,
    // les combats durent, on voit les charges et les chutes, et la production a le temps de compter.
    RYTHME: 1,
    // La démo est un spectacle qui dure : les revenus y sont multipliés, pour que les renforts suivent les pertes.
    DEMO_RENFORTS: 2,
    // À terre : trois secondes au sol, puis six secondes pendant lesquelles on ne retombe pas. Hors jeu : l'unité reste
    // couchée GISANT_S, tant qu'il n'y a pas plus de GISANTS_MAX gisants ; au-delà (et dans un feu), HORS_JEU_S.
    A_TERRE_S: 3, A_TERRE_IMMUNITE_S: 6, GISANT_S: 6, GISANTS_MAX: 4096, HORS_JEU_S: 1.5,
    // Le feu : au plus « max » foyers à la fois. Un foyer est un disque : il presse (points de cohésion par seconde)
    // quiconque s'y trouve, tous camps confondus ; on le fuit, on le contourne à « marge » mètres. Molotov : rayon et
    // durée ci-dessous. Objet cassé : il s'embrase après « allumage » secondes, pour une durée et un rayon tirés de ses
    // points de structure (feuObjet). Barricade : un foyer tous les « pas » mètres, « foyers » au plus ; elle perd
    // « usure » de ses points par seconde. Avant-poste : un foyer, il ne produit plus tant qu'il brûle. Propagation :
    // une fois par foyer, après « delai » secondes, une chance sur deux d'embraser l'objet le plus proche à « rayon »
    // mètres, sur « generations » au plus. Eau : chaque impulsion du jet (0,2 s) retire « eau » secondes au foyer.
    // Les sortes de la ville réelle (0.3) ont leur propre feu (« sortes » : durée en s, rayon en m) : un deux-roues
    // flambe vite et fort, un conteneur à ordures et un kiosque à journaux brûlent longtemps, une terrasse s'étale.
    // Les six sortes de la 0.2 brûlent selon leurs points de structure (voiture : 38 s et 4,5 m ; poubelle : 12 s, 2 m).
    FEU: Object.freeze({ max: 128, rayon: 4, duree: 18, pression: 8, allumage: 1.5, marge: 2.5,
      objet: Object.freeze({ dureeMin: 12, dureeMax: 40, parPv: 0.125, rayonMin: 2, rayonMax: 4.5,
        sortes: Object.freeze({ 'deux-roues': Object.freeze({ duree: 20, rayon: 2.6 }), conteneur: Object.freeze({ duree: 34, rayon: 3 }),
          terrasse: Object.freeze({ duree: 16, rayon: 3.2 }), kiosque: Object.freeze({ duree: 36, rayon: 3.8 }) }) }),
      barricade: Object.freeze({ rayon: 3.2, duree: 30, pas: 7, foyers: 3, usure: 0.02 }),
      poste: Object.freeze({ rayon: 6, duree: 25, usure: 0.016 }),
      propagation: Object.freeze({ rayon: 7, delai: 6, chance: 0.5, generations: 2 }), eau: 3 }),
    // Le gaz lacrymogène : au plus « max » nuages. Le nuage grossit pendant « montee » secondes jusqu'à « rayon »,
    // dure « duree » ; qui s'y trouve (hors la Préfecture et ses alliés, et hors véhicules) perd « pression » points
    // par seconde, ne frappe plus et en sort à « lenteur » × sa vitesse. Un nuage presse à plein « plein » unités ; s'il
    // en tient davantage, la pression se partage entre elles : une foule plus dense n'y perd pas davantage.
    GAZ: Object.freeze({ max: 64, rayon: 7, duree: 14, pression: 3, lenteur: 0.5, montee: 2, marge: 2, plein: 20 }),
    // Les immeubles : un foyer à moins de « chauffe » m d'une façade la chauffe ; après « prise » s à pleine
    // intensité, l'immeuble prend. Un cocktail à moins de « cocktail » m l'allume une fois sur trois. L'intensité
    // monte en « montee » s ; à pleine intensité, consume en « consume » s. Au-dessus de « propage », chauffe les
    // voisins (à « voisinage » m) qui prennent après « voisinPrise » s. Calcine, fume « fumee » s. Max « max » en
    // feu. Unité à moins de « recul » m s'écarte. Refroidit de « refroidit » /s si non chauffé. Lance (débit 1)
    // ôte « eteint » /s. « lances » : jets d'eau rendus au dessin, au plus. (David 12/11/2026)
    IMMEUBLES: Object.freeze({ chauffe: 3, prise: 15, cocktail: 2.5, montee: 40, consume: 240, propage: 0.6,
      voisinPrise: 25, voisinage: 3, fumee: 60, max: 48, recul: 4, refroidit: 0.5, eteint: 0.01, lances: 96 }),
    // Projectiles : durée de vol = vol + distance / vitesse (secondes, mètres ; vitesse 0 : durée fixe). Voir dureeVol.
    PROJECTILES: Object.freeze({ pierre: Object.freeze({ vol: 0.6, vitesse: 0 }), molotov: Object.freeze({ vol: 0.5, vitesse: 20 }),
      lacrymo: Object.freeze({ vol: 0.6, vitesse: 22 }) }),
    // Victoire (options.victoire) : les modes, les choix proposés, les valeurs par défaut. PLAFOND_S : limite de sécurité
    // des modes sans limite de temps (« dernier », « points ») ; DEMO_PLAFOND_S : celle de la démo.
    VICTOIRE: Object.freeze({ MODES: Object.freeze(['dernier', 'temps', 'points', 'mixte']), POINTS: Object.freeze([1500, 3000, 5000]),
      DUREES: Object.freeze([10, 15, 20, 30, 40]), DEFAUT: Object.freeze({ mode: 'dernier', points: 3000, duree: 20 }),
      PLAFOND_S: 5400, DEMO_PLAFOND_S: 3600 }),
    // Part des effectifs de chaque camp, en %, selon options.manifestants (Convergence, Bastion, Préfecture).
    MANIFESTANTS: Object.freeze({ peu: Object.freeze([34, 35, 31]), moyen: Object.freeze([40, 32, 28]), beaucoup: Object.freeze([50, 27, 23]) }),
    MANIFESTANTS_DEFAUT: 'moyen',
  });
  /** Îlots par côté de la ville selon les effectifs (CONCEPTION.md §1.4). */
  const ilots = effectifs => (effectifs <= 30000 ? 9 : effectifs <= 120000 ? 13 : 15);
  /** Parts des effectifs, en %, de la Convergence, du Bastion et de la Préfecture, selon options.manifestants
   *  ('peu' | 'moyen' | 'beaucoup' ; toute autre valeur : le choix par défaut). */
  const parts = m => CONSTANTES.MANIFESTANTS[typeof m === 'string' && Object.prototype.hasOwnProperty.call(CONSTANTES.MANIFESTANTS, m) ? m : CONSTANTES.MANIFESTANTS_DEFAUT];
  const manifestants = m => (typeof m === 'string' && Object.prototype.hasOwnProperty.call(CONSTANTES.MANIFESTANTS, m) ? m : CONSTANTES.MANIFESTANTS_DEFAUT);
  /** options.victoire remis en forme : { mode, points (entier), duree (minutes) }. Mode inconnu ou absent : « dernier » ;
   *  points absents : 3 000 ; durée absente : 40 minutes en « mixte » (la règle de la 0.2), 20 sinon. */
  function victoire(v) {
    const V = CONSTANTES.VICTOIRE, o = v && typeof v === 'object' ? v : {};
    const mode = V.MODES.includes(o.mode) ? o.mode : V.DEFAUT.mode;
    const entier = (x, defaut, min, max) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(min, Math.min(max, Math.round(x))) : defaut);
    return { mode, points: entier(o.points, CONSTANTES.POINTS_VICTOIRE, 100, 1000000),
      duree: entier(o.duree, mode === 'mixte' ? Math.round(CONSTANTES.DUREE_MAX_S / 60) : V.DEFAUT.duree, 1, 180) };
  }
  /** Durée de vol d'un projectile ('pierre' | 'molotov' | 'lacrymo') lancé à « distance » mètres, en secondes. */
  function dureeVol(sorte, distance) {
    const p = CONSTANTES.PROJECTILES[sorte];
    return p ? p.vol + (p.vitesse > 0 ? distance / p.vitesse : 0) : 0;
  }
  /** Le feu d'un objet cassé : { duree (s), rayon (m) }. Un cassable de la ville peut porter « feu » : 0 (ou faux), il
   *  ne brûle pas ; un nombre de secondes, il brûle ce temps-là (120 s au plus). Sinon, sa sorte, si FEU.objet.sortes
   *  la connaît ; sinon, ses points de structure (une sorte inconnue brûle donc comme les autres). */
  function feuObjet(pv, feu, sorte) {
    const O = CONSTANTES.FEU.objet, p = typeof pv === 'number' && pv > 0 ? pv : 60;
    if (feu === 0 || feu === false) return { duree: 0, rayon: 0 };
    const s = typeof sorte === 'string' && Object.prototype.hasOwnProperty.call(O.sortes, sorte) ? O.sortes[sorte] : null;
    const duree = typeof feu === 'number' && feu > 0 ? Math.min(120, feu)
      : s ? s.duree : Math.max(O.dureeMin, Math.min(O.dureeMax, Math.round(p * O.parPv)));
    return { duree, rayon: s ? s.rayon : Math.max(O.rayonMin, Math.min(O.rayonMax, 1.5 + p / 100)) };
  }

  const DIFFICULTES = Object.freeze([
    Object.freeze({ nom: 'Facile', revenus: 0.8, reflexion: 2 }),
    Object.freeze({ nom: 'Normale', revenus: 1.0, reflexion: 1 }),
    Object.freeze({ nom: 'Difficile', revenus: 1.2, reflexion: 1 }),
  ]);

  /** Vrai si a et b sont alliés. alliance : [x, y] ou null. */
  function allies(a, b, alliance) {
    return !!alliance && a !== b && ((alliance[0] === a && alliance[1] === b) || (alliance[0] === b && alliance[1] === a));
  }
  /** Le camp a frappe-t-il le camp b ? colere : temps restant (> 0) de la colère du Bastion contre la Préfecture,
   *  allumée chaque fois que la Préfecture frappe le Bastion (CONSTANTES.COLERE_S). Relation non symétrique. */
  function hostile(a, b, alliance, colere) {
    if (a === b || a > 2 || b > 2 || a < 0 || b < 0) return false;
    if (allies(a, b, alliance)) return false;
    if (a === BASTION && b === PREFECTURE) return colere > 0;
    return true;
  }
  const peutCasser = f => f === CONVERGENCE;
  const peutBarricader = f => f === CONVERGENCE;
  /** Le camp f peut-il lever la structure s = { sorte: 'barricade' | 'avant-poste' | 'qg', faction } ?
   *  La Convergence retire ses propres barricades ; le Bastion et la Préfecture lèvent celles des autres ;
   *  seule la Préfecture lève les avant-postes ; jamais ceux d'un allié ; un QG ne se lève pas. */
  function peutLever(f, s, alliance) {
    if (!s) return false;
    if (s.sorte === 'barricade') {
      if (f === CONVERGENCE) return s.faction === CONVERGENCE;
      return (f === BASTION || f === PREFECTURE) && s.faction !== f && !allies(f, s.faction, alliance);
    }
    if (s.sorte === 'avant-poste') return f === PREFECTURE && s.faction !== PREFECTURE && !allies(f, s.faction, alliance);
    return false;
  }
  /** La Convergence casse les avant-postes de ses adversaires (pas ceux d'un allié). */
  function peutCasserStructure(f, s, alliance) {
    return !!s && f === CONVERGENCE && s.sorte === 'avant-poste' && s.faction !== CONVERGENCE && !allies(f, s.faction, alliance);
  }

  // Codage d'une unité dans le tampon de rendu : un entier < 2^24, exact en Float32.
  // bits 0-1 faction (3 : emplacement libre) · 2-5 type · 6-9 état · 10-15 niveau de cohésion 0..63 · 16-23 drapeaux.
  const CODE_LIBRE = LIBRE;
  const coder = (faction, typeId, etat, niveau, drapeaux) =>
    (faction & 3) | ((typeId & 15) << 2) | ((etat & 15) << 6) | ((niveau & 63) << 10) | ((drapeaux & 255) << 16);
  const codeFaction = c => c & 3;
  const codeType = c => (c >>> 2) & 15;
  const codeEtat = c => (c >>> 6) & 15;
  const codeNiveau = c => (c >>> 10) & 63;
  const codeDrapeaux = c => (c >>> 16) & 255;

  PDR.regles = Object.freeze({
    CONVERGENCE, BASTION, PREFECTURE, LIBRE, FACTIONS, TYPES, ETATS, DRAPEAUX, CONSTANTES, DIFFICULTES,
    TYPES_PAR_FACTION, OUVRIER, BASE, ilots, parts, manifestants, victoire, dureeVol, feuObjet,
    allies, hostile, peutCasser, peutBarricader, peutLever, peutCasserStructure,
    CODE_LIBRE, coder, codeFaction, codeType, codeEtat, codeNiveau, codeDrapeaux,
  });
})(globalThis.PDR = globalThis.PDR || {});
