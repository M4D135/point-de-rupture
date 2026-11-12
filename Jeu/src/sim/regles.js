/* Point de rupture — règles communes : factions, types d'unités, hostilité, structures, codage des unités.
   Contrat partagé par la page, le travailleur de simulation et les tests (CONCEPTION.md §3). Aucune dépendance,
   ni window ni document : le fichier tourne aussi dans un Web Worker et dans Node.
   Les chiffres sont provisoires et se règlent ensemble ; la forme des objets et les fonctions sont le contrat.
   Règles de David du 12 novembre 2026 : la Convergence casse, barricade, se bat et se replie ; le Bastion ne casse
   rien, ne barricade pas, lève les barricades, frappe la Convergence et la Préfecture seulement si elle l'a frappé
   la première ; la Préfecture lève tout et frappe tout ; deux camps sur trois peuvent s'allier. */
(function (PDR) {
  'use strict';

  const CONVERGENCE = 0, BASTION = 1, PREFECTURE = 2, LIBRE = 3;

  const FACTIONS = [
    { id: 0, cle: 'convergence', nom: 'La Convergence', court: 'Convergence', couleur: [0.90, 0.27, 0.19], css: '#e6452f',
      motif: 'rond', part: 0.50, devise: 'Le nombre et la rue.', avantPoste: 'Relais',
      regles: ['Casse le mobilier urbain, les voitures, les vitrines et les avant-postes ennemis',
        'Bâtit des barricades', 'Frappe le Bastion et la Préfecture', 'Nombreuse, rapide, fragile'] },
    { id: 1, cle: 'bastion', nom: 'Le Bastion', court: 'Bastion', couleur: [0.93, 0.64, 0.15], css: '#eda326',
      motif: 'carre', part: 0.27, devise: 'Tenir et nettoyer.', avantPoste: 'Cantonnement',
      regles: ['Ne casse rien et ne bâtit aucune barricade', 'Lève les barricades',
        'Frappe la Convergence ; la Préfecture seulement si elle a frappé la première', 'Lignes épaisses et boucliers'] },
    { id: 2, cle: 'prefecture', nom: 'La Préfecture', court: 'Préfecture', couleur: [0.22, 0.45, 0.90], css: '#4d86f0',
      motif: 'chevron', part: 0.23, devise: 'L’ordre, partout.', avantPoste: 'Poste mobile',
      regles: ['Lève tout : barricades et avant-postes', 'Frappe tout le monde',
        'Peu nombreuse et chère', 'Salves, canon à eau, motards'] },
  ];

  // Postures et états d'une unité. L'état est codé sur 4 bits dans le tampon de rendu.
  const ETATS = { OISIF: 0, MARCHE: 1, ATTAQUE: 2, RECOLTE: 3, CHARGE: 4, CONSTRUIT: 5, LEVE: 6, CASSE: 7, REPLI: 8, TIENT: 9,
    HORS_JEU: 10, CAPACITE: 11 };
  // Drapeaux codés sur 8 bits : porte une charge, touchée depuis moins d'une demi-seconde, colère du Bastion,
  // bouclier levé (protégée de face), véhicule.
  const DRAPEAUX = { PORTE: 1, TOUCHE: 2, COLERE: 4, BOUCLIER: 8, VEHICULE: 16 };

  const sans = { recolter: false, construire: false, barricader: false, casser: 0, lever: 0, leverTout: false,
    interpeller: false, salve: null, jet: null, soigner: 0 };
  /** Un type d'unité. Vitesses en m/s, distances en m, pression en points de cohésion par seconde au contact,
   *  coût et durée par lot ; « lot » unités sortent ensemble d'un ordre de production. */
  const type = (id, cle, faction, nom, pluriel, role, chiffres, capacites, raccourci, description) => Object.freeze({
    id, cle, faction, nom, pluriel, role, base: role === 'ligne', protege: false, vehicule: false, pop: 1, rayon: 0.3,
    vitesseHorsChaussee: null, ...chiffres, capacites: Object.freeze({ ...sans, ...capacites }), raccourci, description,
  });

  const TYPES = [
    type(0, 'equipe-convergence', 0, 'Équipe', 'Équipes', 'ouvrier',
      { coh: 40, pression: 1.0, portee: 1.2, vitesse: 3.6, vision: 14, cout: { moyens: 50, materiaux: 0 }, duree: 10, lot: 10 },
      { recolter: true, construire: true, barricader: true, casser: 1, lever: 1 }, 'Q',
      'Récolte, bâtit les relais et les barricades, casse.'),
    type(1, 'cortege', 0, 'Cortège', 'Cortèges', 'ligne',
      { coh: 60, pression: 3.0, portee: 1.2, vitesse: 3.4, vision: 16, cout: { moyens: 80, materiaux: 0 }, duree: 12, lot: 20 },
      { barricader: true, casser: 1, lever: 1 }, 'W',
      'Le nombre. Tient la rue, casse et barricade.'),
    type(2, 'furets', 0, 'Furets', 'Furets', 'choc',
      { coh: 50, pression: 5.5, portee: 1.2, vitesse: 4.4, vision: 20, cout: { moyens: 90, materiaux: 20 }, duree: 14, lot: 10 },
      { barricader: true, casser: 2, lever: 1 }, 'E',
      'Rapides et mordants. Cassent deux fois plus vite.'),
    type(3, 'fanfare', 0, 'Fanfare', 'Fanfares', 'soutien',
      { coh: 45, pression: 0.5, portee: 1.2, vitesse: 3.2, vision: 18, cout: { moyens: 100, materiaux: 30 }, duree: 16, lot: 5 },
      { soigner: 3 }, 'R',
      'Rend 3 points de cohésion par seconde aux siens à moins de 8 m.'),
    type(4, 'equipe-bastion', 1, 'Équipe', 'Équipes', 'ouvrier',
      { coh: 50, pression: 1.5, portee: 1.2, vitesse: 3.4, vision: 14, cout: { moyens: 50, materiaux: 0 }, duree: 10, lot: 10 },
      { recolter: true, construire: true, lever: 1 }, 'Q',
      'Récolte, bâtit les cantonnements, lève les barricades.'),
    type(5, 'piquets', 1, 'Piquets', 'Piquets', 'ligne',
      { coh: 100, pression: 4.0, portee: 1.2, vitesse: 3.2, vision: 15, cout: { moyens: 100, materiaux: 0 }, duree: 14, lot: 10 },
      { lever: 1 }, 'W',
      'La ligne. Encaisse et repousse.'),
    type(6, 'pavois', 1, 'Pavois', 'Pavois', 'protege',
      { coh: 140, pression: 2.5, portee: 1.2, vitesse: 2.6, vision: 14, protege: true, cout: { moyens: 120, materiaux: 40 }, duree: 16, lot: 8 },
      { lever: 1 }, 'E',
      'Derrière leurs panneaux, ne reçoivent que la moitié de face.'),
    type(7, 'beliers', 1, 'Béliers', 'Béliers', 'outil',
      { coh: 90, pression: 5.0, portee: 1.2, vitesse: 3.0, vision: 14, cout: { moyens: 110, materiaux: 60 }, duree: 16, lot: 5 },
      { lever: 4 }, 'R',
      'Lèvent les barricades quatre fois plus vite.'),
    type(8, 'equipe-prefecture', 2, 'Équipe', 'Équipes', 'ouvrier',
      { coh: 50, pression: 1.0, portee: 1.2, vitesse: 3.6, vision: 14, cout: { moyens: 50, materiaux: 0 }, duree: 10, lot: 6 },
      { recolter: true, construire: true, lever: 1, leverTout: true }, 'Q',
      'Récolte, bâtit les postes mobiles, lève.'),
    type(9, 'patrouille', 2, 'Patrouille', 'Patrouilles', 'ligne',
      { coh: 90, pression: 4.0, portee: 1.2, vitesse: 3.4, vision: 18, cout: { moyens: 110, materiaux: 0 }, duree: 14, lot: 6 },
      { lever: 1, leverTout: true, interpeller: true }, 'W',
      'Interpelle : pression doublée sur une unité sous 30 % de cohésion.'),
    type(10, 'compagnie', 2, 'Compagnie', 'Compagnies', 'protege',
      { coh: 130, pression: 3.0, portee: 1.2, vitesse: 2.6, vision: 16, protege: true, cout: { moyens: 140, materiaux: 40 }, duree: 18, lot: 6 },
      { lever: 1, leverTout: true, salve: Object.freeze({ portee: 14, rayon: 6, pression: 10, recharge: 30, annonce: 1.5, max: 10 }) }, 'E',
      'Boucliers ; Salve : zone de 6 m jusqu’à 14 m, annoncée 1,5 s avant, dix unités au plus.'),
    type(11, 'motards', 2, 'Motards', 'Motards', 'rapide',
      { coh: 70, pression: 2.5, portee: 1.2, vitesse: 8.0, vitesseHorsChaussee: 5.0, vision: 28, rayon: 0.6,
        cout: { moyens: 70, materiaux: 0 }, duree: 10, lot: 4 },
      { lever: 1, leverTout: true }, 'R',
      'Voient loin et filent sur la chaussée.'),
    type(12, 'canon-a-eau', 2, 'Canon à eau', 'Canons à eau', 'vehicule',
      { coh: 600, pression: 0, portee: 1.2, vitesse: 4.0, vision: 24, rayon: 1.6, vehicule: true, pop: 8,
        cout: { moyens: 300, materiaux: 120 }, duree: 30, lot: 1 },
      { lever: 6, leverTout: true, jet: Object.freeze({ portee: 18, angle: 40, pression: 12, recul: 2.0 }) }, 'T',
      'Jet : cône de 18 m qui repousse ; lève six fois plus vite.'),
  ];

  const TYPES_PAR_FACTION = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11, 12]];
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
    POINTS_VICTOIRE: 3000, DUREE_MAX_S: 2400, PRISE_LIEU_S: 15,
    OCCUPATION_QG_S: 60, REPRISE_QG_S: 20, ELIMINATION_PART: 0.02,
    PLAFOND: 1.25, PART_OUVRIERS: 0.04, FILE_MAX: 5,
    EFFECTIFS: Object.freeze([20000, 50000, 100000, 150000, 200000]), EFFECTIFS_DEFAUT: 100000,
    ALLIANCE_DELAI_S: 60, COALITION_SEUIL: 0.45,
    RESSOURCES_DEPART: Object.freeze([{ moyens: 400, materiaux: 150 }, { moyens: 400, materiaux: 100 }, { moyens: 600, materiaux: 100 }]),
  });
  /** Îlots par côté de la ville selon les effectifs (CONCEPTION.md §1.4). */
  const ilots = effectifs => (effectifs <= 30000 ? 9 : effectifs <= 120000 ? 13 : 15);

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
    TYPES_PAR_FACTION, OUVRIER, BASE, ilots,
    allies, hostile, peutCasser, peutBarricader, peutLever, peutCasserStructure,
    CODE_LIBRE, coder, codeFaction, codeType, codeEtat, codeNiveau, codeDrapeaux,
  });
})(globalThis.PDR = globalThis.PDR || {});
