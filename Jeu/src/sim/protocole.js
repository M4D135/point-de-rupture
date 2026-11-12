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
     { type: 'fin', vainqueur, bilan, enregistrement }   vainqueur : voir VAINQUEUR ; bilan : par camp, voir BILAN ;
                                             enregistrement : null si options.enregistrer est faux
     { type: 'erreur', message, pile }

   OPTIONS = { graine: entier, effectifs: 20000…200000, joueur: 0, 1, 2 ou -1 (démo : trois IA ; le brouillard y
               est forcé à faux et renvoyé ainsi dans « pret »), alliance: [a, b] ou null, difficulte: 0, 1, 2,
               brouillard: booléen, coalitions: booléen (les IA peuvent s'allier entre elles en cours de partie),
               enregistrer: booléen, ville: VILLES ('marseille' : le plan réel ; 'damier' : la ville de la graine) }
   « pret ».options rend la ville vraiment construite : villeDe(options, ilots) la refait à l'identique dans la page.

   CARTE = { ilots, etendue: { x0, z0, x1, z1 } (m),
             nav: { nx, nz, x0, z0, cellule }, voile: { nx, nz, x0, z0, cellule },
             minicarte: { taille, x0, z0, cote }, combats: { taille, x0, z0, cote },
             echelle: max(1, round(effectifs / 20000)) (multiplie lots, coûts, stocks et revenus),
             depart: [3] (effectifs de départ), popMax: [3] }
   Grilles : cote et cellule sont le côté d'une case en mètres ; la case (ix, iz) est à l'indice ix + iz × nx (ou
   × taille), et × 3 + camp pour la minicarte.

   ETAT = {
     type: 'etat', it, temps (s de partie), vitesse,
     n,                    nombre d'emplacements à lire dans le tampon (le plus haut emplacement servi + 1)
     unites: ArrayBuffer,  Float32 [x (m), z (m), cap, code] × n ; cap en radians, la face regarde (sin cap, cos cap)
                           en (x, z) : 0 regarde +z, π/2 regarde +x, comme la rotation Ry du renderer de FERRO ;
                           code : PDR.regles.coder ; faction 3 = emplacement libre. Tampon transféré : la page le
                           rend par { type: 'rendre' } quand elle n'en a plus besoin.
     eco: [ { moyens, materiaux, pop, popMax, score, revenu: { moyens, materiaux } (par minute), oisifs,
              elimine, qgOccupe (0..1 : part de l'occupation), vivantes } × 3 ],
     alliance: [a, b] ou null, proposition: { de, a, reste (s) } ou null, colere (s restantes, Bastion contre Préfecture),
     lieux: [ { proprietaire (-1 : neutre), progression (0..1), conteste (booléen), preneur (camp qui prend, -1 : aucun) } ],
     structures: null ou [ STRUCTURE ] (envoyé à chaque changement de versionStructures), versionStructures,
     cassables: null ou Uint8Array (0 intact, 1 cassé ; envoyé à chaque changement), gisements: null ou Int32Array
                (stock restant ; toutes les 20 itérations), voile: null ou Uint8Array (visibilité 0..255 du joueur et
                de son allié, nx × nz de CARTE.voile ; toutes les 4 itérations ; null en démo ; les ennemis cachés
                restent dans le tampon d'unités : la page les masque),
     minicarte: null ou Uint16Array (taille × taille × 3 : unités par case et par camp ; toutes les 10 itérations),
     combats: null ou Uint16Array (taille × taille : coups portés par case depuis l'envoi précédent ; toutes les
              2 itérations),
     evenements: Float32Array (k × EV_TAILLE) depuis l'état précédent ; le travailleur y ajoute un REFUS (raison
                 INTERDIT, x = z = 0) pour toute commande d'un autre camp que le joueur, et pour toutes en démo,
     vainqueur: VAINQUEUR, mesure: { msIteration, msIA, msNav, vivantes, champs }
   }
   STRUCTURE = { id, sorte: 'qg' | 'avant-poste' | 'barricade', faction, x, z, x2, z2 (bout de barricade, sinon = x, z),
                 pv, pvMax, chantier (booléen), feu (booléen), occupation (0..1, QG), file: [ { type, lot, reste (s),
                 total (s) } ], ralliement: [x, z] ou null }
   BILAN = [ { produites, horsJeu, infliges, barricadesPosees, barricadesLevees, casses, lieuxPris, recolte } × 3 ]
*/
(function (PDR) {
  'use strict';

  const CAPACITE = 262144, FLOATS_PAR_UNITE = 4, LARGEUR_TEXTURE = 1024, EV_TAILLE = 6;

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
    CAPACITE: 16,     // { ids, capacite: 'salve' | 'jet', x, z }
  });
  const NOMS_CMD = Object.freeze(Object.fromEntries(Object.entries(CMD).map(([k, v]) => [v, k])));

  /** Évènements : EV_TAILLE nombres par évènement, [type, x, z, faction, a, b] dans un Float32Array. */
  const EV = Object.freeze({
    HORS_JEU: 1,            // x, z, faction de l'unité, a : type, b : camp qui l'a mise hors jeu (-1 : aucun)
    CASSE: 2,               // x, z, faction qui casse, a : indice du cassable, b : sorte (SORTES_CASSABLES)
    BARRICADE_POSEE: 3,     // x, z, faction, a : id de structure
    BARRICADE_FINIE: 4,     // x, z, faction, a : id
    BARRICADE_LEVEE: 5,     // x, z, faction qui lève, a : id, b : faction de la barricade
    STRUCTURE_FINIE: 6,     // x, z, faction, a : id
    STRUCTURE_DETRUITE: 7,  // x, z, faction qui casse ou lève, a : id, b : faction de la structure
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
    VICTOIRE: 21,           // 0, 0, -1, a : VAINQUEUR
    QG_OCCUPE: 22,          // x, z, faction du QG, a : occupant
    QG_REPRIS: 23,          // x, z, faction du QG
    REFUS: 24,              // 0, 0, camp, a : RAISONS, b : type de commande
    SOIN: 25,               // x, z, faction ; toutes les 20 itérations d'une Fanfare qui soigne
  });
  const RAISONS = Object.freeze({ RESSOURCES: 1, PLAFOND: 2, INTERDIT: 3, EMPLACEMENT: 4, INJOIGNABLE: 5, FILE_PLEINE: 6, DELAI: 7 });
  const SORTES_CASSABLES = Object.freeze(['voiture', 'abribus', 'vitrine', 'poubelle', 'banc', 'barriere']);
  /** VAINQUEUR : -1 en cours ; 0, 1, 2 : un camp ; 3 : une alliance (les deux camps de etat.alliance) ; 4 : nul. */
  const VAINQUEUR = Object.freeze({ EN_COURS: -1, ALLIANCE: 3, NUL: 4 });

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
      CMD.CASSER, CMD.LEVER, CMD.BARRICADER, CMD.CONSTRUIRE, CMD.CAPACITE];
    if (avecIds.includes(c.t) && !(c.ids instanceof Int32Array)) return 'ids manquants';
    const positions = { [CMD.DEPLACER]: ['x', 'z'], [CMD.REGROUPER]: ['x', 'z'], [CMD.BARRICADER]: ['x', 'z', 'x2', 'z2'],
      [CMD.CONSTRUIRE]: ['x', 'z'], [CMD.RALLIEMENT]: ['x', 'z'], [CMD.CAPACITE]: ['x', 'z'] }[c.t] || [];
    for (const k of positions) if (!fini(c[k])) return 'position ' + k + ' invalide';
    return '';
  }

  PDR.protocole = Object.freeze({
    VERSION: 1, CAPACITE, FLOATS_PAR_UNITE, LARGEUR_TEXTURE, EV_TAILLE,
    CMD, NOMS_CMD, EV, RAISONS, SORTES_CASSABLES, VAINQUEUR,
    VILLES, villeDe, tamponUnites, lireUnite, lireEvenement, commande, forme,
  });
})(globalThis.PDR = globalThis.PDR || {});
